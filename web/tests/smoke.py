#!/usr/bin/env python3
"""End-to-end smoke test for the built web app (web/dist).

Serves the build on a local port, drives it in headless Chromium (Playwright,
phone-sized viewport) and saves screenshots to web/tests/screenshots/.
Exit code != 0 on any failure. Run after `node scripts/build-web.mjs`.

    pip install playwright==1.56.0 && python -m playwright install chromium
    python web/tests/smoke.py [--base-url URL]
"""
import argparse
import datetime
import json
import pathlib
import re
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import expect, sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
SHOTS = ROOT / "web" / "tests" / "screenshots"
PORT = 8765
API_PORT = 8787
PHONE = {"width": 412, "height": 915}
# The page is told to use the local sync API stand-in (worker/dist/node-server.js)
# instead of multitool-api.ariilden.com, so the test never touches real accounts.
INIT_SCRIPT = f"localStorage.setItem('multitool.syncApi', 'http://127.0.0.1:{API_PORT}');"


def wait_for_api(timeout_s: float = 15) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{API_PORT}/v1/health", timeout=1) as r:
                if b'"ok":true' in r.read():
                    return
        except Exception:  # noqa: BLE001
            time.sleep(0.25)
    raise RuntimeError("local sync API did not start (run `node scripts/build-worker.mjs` first)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=None, help="Test a deployed site instead of web/dist")
    args = ap.parse_args()

    SHOTS.mkdir(parents=True, exist_ok=True)
    server = None
    api = subprocess.Popen(
        ["node", "--no-warnings=ExperimentalWarning", str(ROOT / "worker" / "dist" / "node-server.js"), str(API_PORT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base = args.base_url
    if not base:
        server = subprocess.Popen(
            [sys.executable and "node", str(ROOT / "scripts" / "serve.mjs"), str(ROOT / "web" / "dist"), str(PORT)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        base = f"http://127.0.0.1:{PORT}/"
        time.sleep(0.8)

    failures: list[str] = []
    try:
        wait_for_api()
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(
                viewport=PHONE,
                device_scale_factor=2,
                is_mobile=True,
                has_touch=True,
                color_scheme="dark",
                permissions=["notifications"],
            )
            ctx.add_init_script(INIT_SCRIPT)
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

            page.goto(base, wait_until="networkidle")
            expect(page.locator("#app[data-ready='true']")).to_be_visible(timeout=10_000)
            expect(page.locator("[data-testid='home']")).to_be_visible()
            cards = page.locator(".tool-card")
            assert cards.count() >= 2, f"expected >=2 tool cards, got {cards.count()}"
            page.screenshot(path=str(SHOTS / "01-home.png"))

            # open timers, create a 2s one-off and let it finish
            page.locator(".tool-card[data-tool='timer']").click()
            expect(page.locator("[data-testid='timer-list']")).to_be_visible()
            page.fill("[data-testid='timer-name']", "Tea")
            page.fill("[data-testid='timer-seconds']", "2")
            page.screenshot(path=str(SHOTS / "02-timer-form.png"))
            page.click("[data-testid='timer-start']")
            card = page.locator(".timer-card")
            expect(card).to_have_count(1)
            expect(card).to_have_attribute("data-state", "running")
            expect(card.locator(".timer-name")).to_have_text("Tea")
            page.screenshot(path=str(SHOTS / "03-timer-running.png"))
            expect(card).to_have_attribute("data-state", "finished", timeout=5_000)
            expect(card.locator("[data-testid='countdown']")).to_have_text("Done!")
            page.screenshot(path=str(SHOTS / "04-timer-done.png"))

            # restart → running again, then "Off" removes the one-off
            page.click("[data-testid='timer-restart']")
            expect(card).to_have_attribute("data-state", "running")
            expect(card).to_have_attribute("data-state", "finished", timeout=5_000)
            page.click("[data-testid='timer-off']")
            expect(page.locator(".timer-card")).to_have_count(0)

            # saved timer survives a reload and validation blocks 0s
            page.fill("[data-testid='timer-name']", "Pasta")
            page.fill("[data-testid='timer-minutes']", "9")
            page.check("[data-testid='timer-saved']")
            page.click("[data-testid='timer-add']")
            expect(page.locator(".timer-card[data-state='idle']")).to_have_count(1)
            page.click("[data-testid='timer-add']")  # empty duration → error
            expect(page.locator("[data-testid='timer-error']")).to_be_visible()
            page.reload(wait_until="networkidle")  # hash route #/t/timer is kept
            expect(page.locator("[data-testid='timer-list']")).to_be_visible()
            expect(page.locator(".timer-card[data-state='idle'] .timer-name")).to_have_text("Pasta")
            page.screenshot(path=str(SHOTS / "05-timer-saved.png"))

            # settings: toggle the workout tool off and back on
            page.goto(base + "#/settings", wait_until="networkidle")
            expect(page.locator("[data-testid='settings']")).to_be_visible()
            page.screenshot(path=str(SHOTS / "06-settings.png"))
            page.locator("input[data-tool='workout']").click(force=True)
            page.goto(base + "#/", wait_until="networkidle")
            expect(page.locator(".tool-card[data-tool='workout']")).to_have_count(0)
            page.goto(base + "#/settings", wait_until="networkidle")
            page.locator("input[data-tool='workout']").click(force=True)
            page.goto(base + "#/", wait_until="networkidle")
            expect(page.locator(".tool-card[data-tool='workout']")).to_have_count(1)

            # ---- workout log: first week, exercises, sets, note, bodyweight, new week
            page.goto(base + "#/t/workout", wait_until="networkidle")
            expect(page.locator("[data-testid='workout-empty']")).to_be_visible()
            page.click("[data-testid='workout-start']")
            expect(page.locator(".sheet-panel")).to_be_visible()
            # "Add exercise" opens the library picker; a blank row is one tap away, a library pick fills name / sets / link
            page.click("[data-testid='exercise-add']")
            page.click("[data-testid='library-blank']")
            page.locator("[data-testid='exercise-name']").nth(0).fill("Pistol Squats")
            page.click("[data-testid='exercise-add']")
            page.click("[data-testid='library-blank']")
            page.locator("[data-testid='exercise-name']").nth(1).fill("Dumbbell Rows")
            page.locator("[data-testid='exercise-weight']").nth(1).fill("24kg")
            expect(page.locator("[data-testid='exercise-lib']").nth(0)).to_have_value("")  # matched by name, no explicit link
            expect(page.locator("[data-testid='exercise-lib']").nth(0).locator("option").first).to_contain_text("Pistol Squats (matched by name)")
            page.screenshot(path=str(SHOTS / "08-workout-exercises.png"))
            page.click(".sheet-panel .btn-primary")  # Done
            expect(page.locator(".sheet-panel")).to_have_count(0)
            grid = page.locator("[data-testid='workout-grid']")
            expect(grid).to_be_visible()
            assert grid.locator("tbody tr").count() == 3, "expected Mon/Wed/Fri rows"
            assert grid.locator("[data-testid='exercise-header']").count() == 2

            # log Mon by typing straight into the cells: 8, 8, 8 for squats, then "12!." for rows
            # (a mark, and a dot = note 1, created empty to be written in the notes row)
            grid.locator("td.wk-cell").nth(0).locator("button").click()
            expect(page.locator("[data-testid='set-inline']")).to_be_focused()
            for reps in ("8", "8", "8"):
                page.fill("[data-testid='set-inline']", reps)
                page.keyboard.press("Enter")
            expect(page.locator("[data-testid='set-inline']")).to_have_count(1)  # moved on to rows set 1
            page.fill("[data-testid='set-inline']", "12!.")
            page.keyboard.press("Escape")  # Escape after typing: the text is dropped …
            first_row = grid.locator("tbody tr").nth(0)
            expect(first_row.locator("td.wk-cell").nth(3)).to_have_text("")
            first_row.locator("td.wk-cell").nth(3).locator("button").click()
            page.fill("[data-testid='set-inline']", "12!.")
            page.keyboard.press("Tab")  # … Tab commits and moves on
            expect(first_row.locator("td.wk-cell").nth(0)).to_have_text("8")
            expect(first_row.locator("td.wk-cell").nth(3)).to_have_text("12!1")
            page.keyboard.press("Escape")
            expect(page.locator("[data-testid='set-inline']")).to_have_count(0)
            # the empty note 1 for rows is there; write it in place
            rows_note = page.locator("[data-testid='footnotes'] td.wk-fncell").nth(1).locator(".wk-fn[data-note='1']")
            expect(rows_note).to_have_class(re.compile(r"wk-fn-empty"))
            rows_note.click()
            page.fill("[data-testid='footnote-inline']", "22kg")
            page.keyboard.press("Enter")
            expect(page.locator("[data-testid='footnotes']")).to_contain_text("22kg")
            # clicking another cell while editing commits and moves the editor there
            first_row.locator("td.wk-cell").nth(1).locator("button").click()
            page.fill("[data-testid='set-inline']", "9")
            first_row.locator("td.wk-cell").nth(2).locator("button").click()
            expect(first_row.locator("td.wk-cell").nth(1)).to_have_text("9")
            expect(page.locator("[data-testid='set-inline']")).to_have_count(1)
            page.fill("[data-testid='set-inline']", "8")
            page.keyboard.press("Enter")
            page.keyboard.press("Escape")
            expect(first_row.locator("td.wk-cell").nth(2)).to_have_text("8")

            # right-click menu: colour one set green, star another, tint a whole day, open the full editor
            first_row.locator("td.wk-cell").nth(0).click(button="right")
            expect(page.locator("[data-testid='popover']")).to_be_visible()
            page.locator("[data-testid='popover'] .swatch").nth(1).click()  # green
            expect(first_row.locator("td.wk-cell").nth(0)).to_have_class(re.compile(r"wk-tinted"))
            page.keyboard.press("Escape")
            expect(page.locator("[data-testid='popover']")).to_have_count(0)
            first_row.locator("td.wk-cell").nth(1).click(button="right")
            page.locator("[data-testid='popover'] .swatch-star").first.click()
            page.locator("[data-testid='popover'] .seg", has_text="Mon").click()
            page.locator("[data-testid='popover'] .swatch").nth(4).click()  # gold, whole day
            assert first_row.locator("td.wk-cell").nth(1).locator(".wk-star").count() == 1
            expect(first_row.locator("th")).to_have_class(re.compile(r"wk-tinted"))
            page.locator("[data-testid='popover'] .chip-mark", has_text="!").first.click()  # mark from the menu
            expect(first_row.locator("td.wk-cell").nth(1)).to_have_text("9!")
            page.screenshot(path=str(SHOTS / "09-workout-cell-menu.png"))
            page.click("[data-testid='menu-set-editor']")
            expect(page.locator("[data-testid='set-input']")).to_have_value("9!")
            page.locator(".sheet-panel button", has_text="Done").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)

            # regression (Ari, 2026-09-24 mid-workout): a cell coloured while empty, or cleared, showed
            # "undefined" when opened and could not be typed into
            empty_cell = first_row.locator("td.wk-cell").nth(5)  # rows set 3, never typed
            empty_cell.click(button="right")
            page.locator("[data-testid='popover'] .swatch").nth(1).click()  # green on an empty cell
            page.keyboard.press("Escape")
            empty_cell.locator("button").click()
            expect(page.locator("[data-testid='set-inline']")).to_have_value("")
            page.fill("[data-testid='set-inline']", "10")
            page.keyboard.press("Enter")
            page.keyboard.press("Escape")
            expect(empty_cell).to_have_text("10")
            empty_cell.click(button="right")
            page.locator("[data-testid='popover'] button", has_text="Clear").click()
            expect(empty_cell).to_have_text("")
            empty_cell.locator("button").click()
            expect(page.locator("[data-testid='set-inline']")).to_have_value("")
            page.fill("[data-testid='set-inline']", "11")
            page.keyboard.press("Enter")
            page.keyboard.press("Escape")
            expect(empty_cell).to_have_text("11")
            empty_cell.click(button="right")
            page.locator("[data-testid='popover'] button", has_text="Clear").click()
            expect(empty_cell).to_have_text("")
            empty_cell.click(button="right")
            page.click("[data-testid='menu-set-editor']")  # the sheet editor reads the cleared cell as empty too
            expect(page.locator("[data-testid='set-input']")).to_have_value("")
            page.locator(".sheet-panel button", has_text="Done").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)

            # every other cell has a menu too: exercise header (colour + marks), day cell (colour + marks), week label, week note
            pop = page.locator("[data-testid='popover']")
            grid.locator("th.wk-ex").nth(1).click(button="right")
            expect(pop).to_have_attribute("data-menu", "exercise")
            pop.locator(".chip-mark", has_text=re.compile(r"^!$")).click()
            pop.locator(".swatch").nth(4).click()  # gold
            expect(grid.locator("th.wk-ex").nth(1)).to_have_class(re.compile(r"wk-tinted"))
            expect(grid.locator("th.wk-ex").nth(1)).to_contain_text("24kg !")
            page.keyboard.press("Escape")
            expect(pop).to_have_count(0)
            wed_head = grid.locator("tbody tr").nth(1).locator("th.wk-dayh")
            wed_head.click(button="right")
            expect(pop).to_have_attribute("data-menu", "day")
            pop.locator(".chip-mark", has_text=re.compile(r"^\*$")).click()
            expect(wed_head).to_contain_text("Wed *")
            page.click("[data-testid='menu-day-editor']")
            expect(page.locator(".sheet-panel")).to_be_visible()
            expect(page.locator("[data-testid='day-marks']")).to_have_value("*")
            page.locator(".sheet-panel button", has_text="Done").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)
            page.locator("[data-testid='week-corner']").click(button="right")
            expect(pop).to_have_attribute("data-menu", "week")
            assert pop.locator(".chip-mark").count() == 0  # a label has no marks
            pop.locator(".swatch").nth(4).click()  # gold label, like the sheet's "Week 17/18" cells
            expect(page.locator("[data-testid='week-corner']")).to_have_class(re.compile(r"wk-tinted"))
            page.keyboard.press("Escape")
            page.locator("td.wk-fnlast").click(button="right")
            expect(pop).to_have_attribute("data-menu", "week-notes")
            pop.locator(".swatch").nth(1).click()  # green
            expect(page.locator("td.wk-fnlast")).to_have_class(re.compile(r"wk-tinted"))
            page.keyboard.press("Escape")
            expect(pop).to_have_count(0)

            # day notes are free text; the notes cell edits in place
            first_row.locator("[data-testid='notes-cell']").click()
            expect(page.locator("[data-testid='notes-inline']")).to_be_focused()
            page.fill("[data-testid='notes-inline']", "Slept badly, long day")
            page.keyboard.press("Enter")
            expect(first_row.locator("[data-testid='notes-cell']")).to_have_text("Slept badly, long day")
            # day marks: symbols from the list, and reusable word marks ("Pre-workout") added on the spot
            # (day editor and the day cell's menu share the chips; the tag shows on the day cell)
            grid.locator("tbody tr").nth(2).locator("[data-testid='day-header']").click()
            chips = page.locator(".sheet-panel [data-testid='mark-chips']")
            expect(chips.locator(".chip").first).to_have_text("*")
            chips.locator(".chip", has_text=re.compile(r"^\*$")).click()
            expect(page.locator("[data-testid='day-marks']")).to_have_value("*")
            page.locator("[data-testid='mark-new']").click()
            page.fill("[data-testid='mark-new-input']", "Pre-workout")
            page.keyboard.press("Enter")
            expect(chips.locator(".chip-tag")).to_have_text(["Pre-workout"])
            expect(chips.locator(".chip-tag.chip-active")).to_have_count(1)
            page.locator(".sheet-panel button", has_text="Done").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)
            expect(grid.locator("tbody tr").nth(2).locator("[data-testid='day-tags'] .wk-tag")).to_have_text(["Pre-workout"])
            expect(grid.locator("tbody tr").nth(2).locator(".wk-day-name")).to_contain_text("*")
            # the new mark is in the list now: the first day's menu offers it; a tap ticks it
            first_row.locator("th.wk-dayh").click(button="right")
            pop = page.locator("[data-testid='popover']")
            expect(pop).to_have_attribute("data-menu", "day")
            pop.locator("[data-testid='mark-chips'] .chip-tag", has_text="Pre-workout").click()
            expect(pop.locator("[data-testid='mark-chips'] .chip-tag.chip-active")).to_have_count(1)
            page.keyboard.press("Escape")
            expect(pop).to_have_count(0)
            expect(first_row.locator("[data-testid='day-tags'] .wk-tag")).to_have_text(["Pre-workout"])
            # the settings list carries it (a word mark = a tag; symbols stay symbols)
            page.goto(base + "#/t/workout/settings", wait_until="networkidle")
            expect(page.locator(".ex-row input[placeholder='*']").last).to_have_value("Pre-workout")
            page.goto(base + "#/t/workout", wait_until="networkidle")
            grid = page.locator("[data-testid='workout-grid']")
            first_row = grid.locator("tbody tr").first

            # bodyweight via the day header
            first_row.locator("[data-testid='day-header']").click()
            page.fill("[data-testid='day-bodyweight']", "97.1")
            page.locator(".sheet-panel button", has_text="Done").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)
            expect(first_row.locator("[data-testid='day-header']")).to_contain_text("97.1 kg")
            page.screenshot(path=str(SHOTS / "10-workout-grid.png"))

            # trained Tuesday instead of Monday: the weekday moves and the date follows
            first_row.locator("[data-testid='day-header']").click()
            page.locator("[data-testid='day-weekday'] .chip", has_text=re.compile(r"^Tue$")).click()
            expect(page.locator(".sheet-title")).to_contain_text("Tue ·")
            tue_date = page.locator("[data-testid='day-date']").input_value()
            week_start = page.locator("[data-testid='week-label'] .wk-corner-date").inner_text()
            assert tue_date == (datetime.date.fromisoformat(week_start) + datetime.timedelta(days=1)).isoformat(), (week_start, tue_date)
            page.locator(".sheet-panel button", has_text="Done").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)
            expect(first_row.locator("[data-testid='day-header']")).to_contain_text("Tue")
            expect(first_row.locator("[data-testid='day-header']")).to_contain_text("97.1 kg")  # same row, data kept

            # worked out, but not with these exercises: one cell across the columns; clearing it brings the sets back
            wed_row = grid.locator("tbody tr").nth(1)
            wed_row.locator("[data-testid='day-header']").click()
            page.fill("[data-testid='day-alt']", "5 km run")
            page.locator("[data-testid='day-alt']").dispatch_event("change")
            page.locator(".sheet-panel button", has_text="Done").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)
            expect(page.locator("[data-testid='alt-cell']")).to_have_count(1)
            expect(page.locator("[data-testid='alt-cell']")).to_contain_text("5 km run")
            assert grid.locator("tbody tr").nth(1).locator("td.wk-cell").count() == 1
            page.locator("[data-testid='alt-cell'] button").click()
            expect(page.locator("[data-testid='day-alt']")).to_have_value("5 km run")
            page.fill("[data-testid='day-alt']", "")
            page.locator("[data-testid='day-alt']").dispatch_event("change")
            page.locator(".sheet-panel button", has_text="Done").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)
            expect(page.locator("[data-testid='alt-cell']")).to_have_count(0)
            assert grid.locator("tbody tr").nth(1).locator("td.wk-cell").count() == 6

            # a plain note added from the notes row: no number, numbered ones keep theirs
            expect(page.locator("[data-testid='legend']")).to_be_visible()
            expect(page.locator("[data-testid='legend']")).not_to_have_attribute("open", re.compile(".*"))  # closed by default
            page.locator("[data-testid='footnote-add']").nth(1).click()  # rows column
            page.fill("[data-testid='footnote-add-input']", "bench felt wobbly")
            page.click("[data-testid='footnote-add-save']")
            expect(page.locator(".sheet-panel")).to_have_count(0)
            rows_notes = page.locator("[data-testid='footnotes'] td.wk-fncell").nth(1)
            expect(rows_notes.locator(".wk-fn-plain")).to_have_text("bench felt wobbly")
            expect(rows_notes.locator(".wk-fn").nth(0)).to_contain_text("22kg")  # numbered note first
            assert rows_notes.locator(".wk-fn-plain sup").count() == 0

            # new week copies the exercises
            label_before = page.locator("[data-testid='week-label']").inner_text()
            page.click("[data-testid='week-menu']")
            page.click("[data-testid='menu-new-week']")
            expect(page.locator("[data-testid='week-label']")).not_to_have_text(label_before)
            assert page.locator("[data-testid='exercise-header']").count() == 2
            expect(page.locator("tbody tr").nth(0).locator("td.wk-cell").nth(0)).to_have_text("")
            expect(page.locator("th.wk-ex").nth(1)).to_contain_text("24kg")
            expect(page.locator("th.wk-ex").nth(1)).not_to_have_class(re.compile(r"wk-tinted"))  # the colour stays with last week

            # a changed weight: purple header this week (the sheet's "weight increased"), remembered by the library
            # a tap on the header opens that exercise alone (one form, grouped: exercise / weight / timer)
            page.locator("[data-testid='exercise-header']").nth(1).click()
            expect(page.locator(".sheet-panel .sheet-title")).to_have_text("Dumbbell Rows")
            expect(page.locator("[data-testid='exercise-form']")).to_have_count(1)
            page.locator("[data-testid='exercise-weight']").fill("26kg")
            page.locator("[data-testid='exercise-weight']").dispatch_event("change")
            # the library rule from the form: ×2 dumbbells → Bodyweight 90 % → back; target reps land on the header
            expect(page.locator("[data-testid='exercise-dumbbells']")).to_have_value("2")
            page.locator("[data-testid='exercise-bodyweight']").click()
            expect(page.locator("[data-testid='exercise-bw-factor']")).to_be_visible()
            expect(page.locator("[data-testid='exercise-dumbbells']")).to_be_hidden()
            page.fill("[data-testid='exercise-bw-factor']", "90")
            page.locator("[data-testid='exercise-bw-factor']").dispatch_event("change")
            page.locator("[data-testid='exercise-bodyweight']").click()
            expect(page.locator("[data-testid='exercise-dumbbells']")).to_be_visible()
            page.locator("[data-testid='exercise-dumbbells']").select_option("2")
            page.fill("[data-testid='exercise-reps']", "8–12")
            page.locator("[data-testid='exercise-done']").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)
            expect(page.locator("th.wk-ex").nth(1)).to_contain_text("26kg, 8–12 reps")
            expect(page.locator("th.wk-ex").nth(1)).to_have_class(re.compile(r"wk-tinted"))
            assert page.locator("th.wk-ex").nth(1).evaluate("el => getComputedStyle(el).getPropertyValue('--cell-bg').trim()") == "#6b4f9a"

            # view modes: all weeks, X per page with tabs, back to one
            page.click("[data-testid='week-menu']")
            page.click("[data-testid='menu-new-week']")  # third week
            page.click("[data-testid='view-all']")
            expect(page.locator("[data-testid='workout-grid']")).to_have_count(3)
            page.click("[data-testid='view-some']")
            page.fill("[data-testid='view-per']", "2")
            page.locator("[data-testid='view-per']").dispatch_event("change")
            expect(page.locator("[data-testid='week-tabs'] .wk-tab")).to_have_count(2)
            expect(page.locator("[data-testid='workout-grid']")).to_have_count(1)  # newest week is on page 2 alone
            page.locator("[data-testid='week-tabs'] .wk-tab").nth(0).click()
            expect(page.locator("[data-testid='workout-grid']")).to_have_count(2)
            expect(page.locator("[data-testid='week-tabs'] .wk-tab-active")).to_have_count(1)
            page.screenshot(path=str(SHOTS / "10b-workout-pages.png"))
            page.click("[data-testid='view-one']")
            expect(page.locator("[data-testid='workout-grid']")).to_have_count(1)
            page.wait_for_timeout(300)  # let the view preference write land before reloading

            # data survives reload; the week menu reaches the editors and the tool settings page
            page.reload(wait_until="networkidle")
            expect(page.locator("[data-testid='workout-grid']")).to_have_count(1)
            page.click("[data-testid='week-menu']")
            page.click("[data-testid='menu-exercises']")
            expect(page.locator("[data-testid='exercise-name']").first).to_be_visible()
            expect(page.locator(".sheet-panel")).to_have_count(1)  # the menu sheet has finished closing
            page.locator(".sheet-panel .iconbtn[aria-label='Close']").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)
            page.click("[data-testid='week-menu']")
            page.click("[data-testid='menu-settings']")
            expect(page.locator("[data-testid='workout-settings']")).to_be_visible()
            page.screenshot(path=str(SHOTS / "11-workout-settings.png"))
            # exercise library: built-ins are listed; a new one can be added with muscles and a bodyweight share
            expect(page.locator("[data-testid='library-row'][data-lib='push-ups']")).to_contain_text("64 % of bodyweight")
            expect(page.locator("[data-testid='library-row'][data-lib='dumbbell-rows']")).to_contain_text("· 26kg")  # the weight typed in the week
            page.click("[data-testid='library-add']")
            page.fill("[data-testid='lib-name']", "Nordic Curls")
            page.locator(".sheet-panel .chip-primary", has_text="Hamstrings").click()
            page.locator(".sheet-panel .chip-secondary", has_text="Glutes").click()
            page.fill("[data-testid='lib-factor']", "70")
            page.locator("[data-testid='lib-factor']").dispatch_event("change")
            page.screenshot(path=str(SHOTS / "11b-library-editor.png"))
            page.click("[data-testid='lib-done']")
            expect(page.locator(".sheet-panel")).to_have_count(0)
            expect(page.locator("[data-testid='library-row'][data-lib='nordic-curls']")).to_contain_text("Hamstrings + Glutes · 70 % of bodyweight")

            # importing a week whose label an empty, hand-made week already carries replaces that week
            page.go_back()
            expect(page.locator("[data-testid='workout-grid']")).to_be_visible()
            dup_label = page.locator("[data-testid='week-label'] .wk-label-title").inner_text().strip()
            dup_start = page.locator("[data-testid='week-label'] .wk-corner-date").inner_text().strip()
            import_file = SHOTS / "dup-import.json"
            import_file.write_text(json.dumps({
                "format": "multitool-workout", "version": 1,
                "weeks": [{"id": "import-dup", "label": dup_label, "startDate": dup_start, "createdAt": 1,
                           "exercises": [{"id": "squat", "name": "Pistol Squats", "weight": "", "sets": 3},
                                         {"id": "rows", "name": "Rows", "weight": "20kg", "sets": 3}],
                           "days": [{"id": "import-dup-mon", "weekday": "Mon", "date": dup_start,
                                     "cells": {"squat": {"sets": [{"v": "6"}, {"v": "6"}, {"v": "6"}]},
                                               "rows": {"sets": [{"v": "12"}, {"v": "12"}, {"v": "10"}]}}}],
                           "footnotes": {}}],
            }))
            page.goto(base + "#/t/workout/settings", wait_until="networkidle")
            page.set_input_files("[data-testid='workout-import-file']", str(import_file))
            expect(page.locator(".toast")).to_contain_text("removed 1 old or empty duplicate", timeout=10_000)
            page.goto(base + "#/t/workout", wait_until="networkidle")
            page.click("[data-testid='view-all']")
            expect(page.locator("[data-testid='workout-grid']")).to_have_count(3)  # the empty third week was replaced, not added to
            assert page.locator("[data-testid='week-label'] .wk-label-title").all_inner_texts().count(dup_label) == 1
            page.click("[data-testid='view-one']")
            # a new week after the import counts on from the highest number
            page.click("[data-testid='week-menu']")
            page.click("[data-testid='menu-new-week']")
            m = re.search(r"(\d+)\s*$", dup_label)
            if m:
                expect(page.locator("[data-testid='week-label'] .wk-label-title")).to_have_text(dup_label[: m.start(1)] + str(int(m.group(1)) + 1))

            # workout mode: today's row, a rest timer through the Timers tool, +30 s, Off
            page.goto(base + "#/t/workout", wait_until="networkidle")
            page.click("[data-testid='session-open']")
            expect(page.locator("[data-testid='session']")).to_be_visible()
            panel = page.locator("[data-testid='session-panel']")
            expect(panel).to_have_attribute("data-phase", "idle")
            page.click("[data-testid='session-rest-start']")
            expect(panel).to_have_attribute("data-phase", "rest")
            before = page.locator("[data-testid='session-countdown']").inner_text()
            page.click("[data-testid='session-plus']")
            page.wait_for_timeout(300)
            after = page.locator("[data-testid='session-countdown']").inner_text()
            assert after > before, f"+30 s should lengthen the rest ({before} → {after})"
            page.screenshot(path=str(SHOTS / "12-workout-mode.png"))
            page.click("[data-testid='session-off']")
            expect(panel).to_have_attribute("data-phase", "idle")
            expect(page.locator("[data-testid='session-duration']")).to_contain_text("Workout so far")  # the countdown was booked on today's row

            # a reload mid-rest comes back to the same countdown (state kept per device)
            page.click("[data-testid='session-rest-start']")
            expect(panel).to_have_attribute("data-phase", "rest")
            page.wait_for_timeout(400)
            page.reload(wait_until="networkidle")
            expect(page.locator("[data-testid='session']")).to_be_visible()
            panel = page.locator("[data-testid='session-panel']")
            expect(panel).to_have_attribute("data-phase", "rest", timeout=10_000)
            expect(page.locator("[data-testid='session-countdown']")).to_have_text(re.compile(r"^1:[0-2]\d$"))
            page.click("[data-testid='session-off']")
            expect(panel).to_have_attribute("data-phase", "idle")

            # the exercise's own rest (per set for the first set) via its header; a set starts with a tap (stopwatch),
            # the reps typed start that rest; after the ring the overrun counts up until +step / Off
            added_today = page.locator("[data-testid='session-add-today']").count() > 0  # this week = the first week; today may not be one of its rows
            if added_today:
                page.click("[data-testid='session-add-today']")
            today_row = page.locator("[data-testid='session'] tr.wk-today")
            expect(today_row).to_have_count(1)
            page.locator("[data-testid='session'] [data-testid='exercise-header']").nth(1).click()  # rows, on its own
            expect(page.locator(".sheet-panel")).to_be_visible()
            expect(page.locator("[data-testid='exercise-form']")).to_have_count(1)
            page.locator("[data-testid='exercise-rest']").fill("2")
            page.locator("[data-testid='exercise-rest']").dispatch_event("change")
            expect(page.locator("[data-testid='exercise-rest']")).to_have_value("0:02")
            page.locator("[data-testid='exercise-rest-per-set']").click()
            expect(page.locator("[data-testid='exercise-rest-set']")).to_have_count(3)
            expect(page.locator("[data-testid='exercise-rest-set']").first).to_have_value("0:02")
            page.locator("[data-testid='exercise-rest-set']").first.fill("3")
            page.locator("[data-testid='exercise-rest-set']").first.dispatch_event("change")
            page.locator("[data-testid='exercise-note']").fill("elbows in")
            page.locator("[data-testid='exercise-done']").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)
            expect(page.locator("[data-testid='session'] [data-testid='exercise-note']")).to_have_text("elbows in")
            rows_cell = today_row.locator("td.wk-cell").nth(4)  # rows, set 2 (empty whatever weekday it is)
            rows_cell.locator("button").click()  # first tap: the stopwatch, no keyboard
            expect(panel).to_have_attribute("data-phase", "watch")
            expect(rows_cell.locator("[data-testid='set-live']")).to_be_visible()
            expect(page.locator("[data-testid='set-inline']")).to_have_count(0)
            page.wait_for_timeout(1200)
            expect(page.locator("[data-testid='session-countdown']")).to_have_text(re.compile(r"^0:0[1-9]$"))
            rows_cell.locator("button").click()  # second tap: type the reps
            expect(page.locator("[data-testid='set-inline']")).to_be_focused()
            page.fill("[data-testid='set-inline']", "10")
            page.keyboard.press("Enter")
            page.keyboard.press("Escape")
            expect(panel).to_have_attribute("data-phase", "rest")
            expect(panel).to_contain_text("Rest · Dumbbell Rows 2/3")
            expect(panel).to_have_attribute("data-phase", "finished", timeout=8_000)  # the exercise's 2 s rest rang
            expect(page.locator("[data-testid='session-countdown']")).to_have_text(re.compile(r"^−0:0\d$"), timeout=5_000)  # overrun counts up
            page.click("[data-testid='session-plus']")  # rest on for another step
            expect(panel).to_have_attribute("data-phase", "rest")
            page.click("[data-testid='session-off']")
            expect(panel).to_have_attribute("data-phase", "idle")
            expect(rows_cell).to_have_text("10")
            expect(page.locator("[data-testid='session-complete']")).to_be_visible()  # an open workout can be completed any time
            page.screenshot(path=str(SHOTS / "12b-workout-mode-stopwatch.png"))

            # the day's last set: no rest, but "complete the workout?"; complete → the panel says so, the next set reopens
            cells = today_row.locator("td.wk-cell")
            for i in range(cells.count()):
                cell = cells.nth(i)
                if cell.inner_text().strip():
                    continue
                cell.locator("button").click()  # stopwatch
                expect(panel).to_have_attribute("data-phase", "watch")
                cell.locator("button").click()  # type
                expect(page.locator("[data-testid='set-inline']")).to_be_focused()
                page.fill("[data-testid='set-inline']", "8")
                page.keyboard.press("Enter")
                page.keyboard.press("Escape")
            expect(panel).to_have_attribute("data-phase", "finish")
            expect(panel).to_contain_text("That was the last set")
            page.click("[data-testid='session-complete']")
            expect(panel).to_have_attribute("data-phase", "done")
            expect(page.locator("[data-testid='session-duration']")).to_contain_text("Workout complete")
            expect(page.locator("[data-testid='session-complete']")).to_have_count(0)
            expect(page.locator("[data-testid='session-rest-start']")).to_have_count(0)
            page.click("[data-testid='session-back']")
            expect(page.locator("[data-testid='workout-grid']")).to_be_visible()

            # stats: activity map, calendar, charts; the range switches between last N weeks and all
            page.click("[data-testid='stats-open']")
            expect(page.locator("[data-testid='stats']")).to_be_visible()
            expect(page.locator("[data-testid='stats-tiles']")).to_contain_text("workouts")
            expect(page.locator("[data-testid='stats-heatmap'] rect.hm-cell").first).to_be_visible()
            expect(page.locator("[data-testid='stats-heatmap'] rect.hm-t4")).to_have_count(1)  # Tuesday's sets, this week
            expect(page.locator("[data-testid='cal-title']")).to_contain_text(str(datetime.date.today().year))
            expect(page.locator("[data-testid='chart-days'] svg rect.chart-bar")).to_have_count(1)
            expect(page.locator("[data-testid='stats-exercise-select']")).to_be_visible()
            expect(page.locator("[data-testid='chart-weight'] svg circle.chart-marker")).to_have_count(1)  # 97.1 kg on Tuesday
            page.click("[data-testid='stats-all-all']")
            expect(page.locator("[data-testid='stats-all-all']")).to_have_class(re.compile(r"chip-active"))
            expect(page.locator("[data-testid='range-days-all']")).to_have_class(re.compile(r"chip-active"))  # every card follows
            page.click("[data-testid='range-days-3']")  # one card on its own range
            expect(page.locator("[data-testid='range-days-3']")).to_have_class(re.compile(r"chip-active"))
            expect(page.locator("[data-testid='range-volume-all']")).to_have_class(re.compile(r"chip-active"))
            expect(page.locator("[data-testid='stats-days'] .card-range")).to_contain_text("Same as all cards")
            expect(page.locator("[data-testid='donut-days'] .donut-row").first).to_be_visible()
            expect(page.locator("[data-testid='stats-muscles'] .chip-muscle").first).to_be_visible()  # Pistol Squats matched → quads etc.
            expect(page.locator("[data-testid='chart-volume'] svg .chart-axis-title").first).to_contain_text("sets")
            expect(page.locator("[data-testid='chart-volume'] svg .chart-axis-title").last).to_contain_text("Week number")
            page.click("[data-testid='cal-prev']")
            page.click("[data-testid='cal-next']")
            page.screenshot(path=str(SHOTS / "13-stats.png"))
            page.locator("[data-testid='stats-heatmap'] rect.hm-t4").click()  # a day on the map opens its week in the log
            expect(page.locator("[data-testid='workout-grid']")).to_be_visible()
            expect(page.locator("tbody tr").nth(0).locator("td.wk-cell").nth(0)).to_have_text("8")

            # "delete" a day that has happened: it is cleared and stays as a red no-workout row
            tue_row = page.locator("[data-testid='workout-grid'] tbody tr").nth(0)
            tue_row.locator("[data-testid='day-header']").click()
            page.click("[data-testid='day-clear']")
            page.locator(".sheet-panel .btn-danger", has_text="Mark as no workout").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)
            expect(page.locator("[data-testid='workout-grid'] tbody tr")).to_have_count(3 + (1 if added_today else 0))
            expect(tue_row.locator("td.wk-cell").nth(0)).to_have_text("")
            expect(tue_row.locator("th")).to_have_class(re.compile(r"wk-tinted"))
            expect(tue_row.locator("[data-testid='day-header']")).not_to_contain_text("97.1 kg")

            # light theme render
            light = browser.new_context(viewport=PHONE, color_scheme="light")
            lp = light.new_page()
            lp.goto(base + "#/t/timer", wait_until="networkidle")
            expect(lp.locator("[data-testid='timer-list']")).to_be_visible()
            lp.screenshot(path=str(SHOTS / "07-light.png"))
            light.close()

            # ---- sync: device A turns it on, device B links with the code, changes flow both ways
            page.goto(base + "#/settings", wait_until="networkidle")
            expect(page.locator("[data-testid='sync-status']")).to_contain_text("Sync is off")
            expect(page.locator("[data-testid='sync-indicator']")).to_be_hidden()
            if args.base_url:
                # Browsers block a public https page from talking to a loopback API
                # (private network access), so the two-device scenario only runs
                # against the local build; the deployed site gets the render check above.
                print("sync scenario skipped against a deployed site")
                if errors:
                    failures.append("console/page errors: " + " | ".join(errors))
                browser.close()
                return finish(failures)
            page.click("[data-testid='sync-enable']")
            code_el = page.locator("[data-testid='link-code']")
            expect(code_el).to_have_text(re.compile(r"^[A-Z2-9]{4}-[A-Z2-9]{4}$"), timeout=20_000)
            code = code_el.inner_text()
            page.screenshot(path=str(SHOTS / "12-sync-link-code.png"))
            page.locator(".sheet-panel .iconbtn[aria-label='Close']").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)
            expect(page.locator("[data-testid='sync-indicator']")).to_be_visible()
            expect(page.locator("[data-testid='sync-status']")).to_contain_text("Synced", timeout=20_000)
            page.screenshot(path=str(SHOTS / "13-sync-settings.png"))

            device_b = browser.new_context(viewport=PHONE, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme="dark")
            device_b.add_init_script(INIT_SCRIPT)
            pb = device_b.new_page()
            pb.on("pageerror", lambda e: errors.append("B: " + str(e)))
            pb.on("console", lambda m: errors.append("B: " + m.text) if m.type == "error" else None)
            pb.goto(base + "#/settings", wait_until="networkidle")
            expect(pb.locator("[data-testid='sync-status']")).to_contain_text("Sync is off")
            pb.click("[data-testid='sync-join']")
            pb.click("[data-testid='join-use-recovery']")  # switches sheets: recovery key form
            expect(pb.locator("[data-testid='recovery-input']")).to_be_visible()
            expect(pb.locator(".sheet-panel")).to_have_count(1)
            pb.locator(".sheet-panel .iconbtn[aria-label='Close']").click()
            expect(pb.locator(".sheet-panel")).to_have_count(0)
            pb.click("[data-testid='sync-join']")
            pb.fill("[data-testid='join-code']", code.lower())
            pb.screenshot(path=str(SHOTS / "14-sync-join.png"))
            pb.click("[data-testid='join-submit']")
            expect(pb.locator(".toast")).to_contain_text("Linked", timeout=20_000)
            expect(pb.locator("[data-testid='sync-status']")).to_contain_text("Synced", timeout=20_000)
            # the code is single use
            page.locator("[data-testid='sync-link']").click()
            expect(page.locator("[data-testid='link-code']")).not_to_have_text(code, timeout=20_000)
            page.locator(".sheet-panel .iconbtn[aria-label='Close']").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)

            # B received A's workout weeks and saved timer
            pb.goto(base + "#/t/workout", wait_until="networkidle")
            expect(pb.locator("[data-testid='workout-grid']")).to_be_visible(timeout=20_000)
            assert pb.locator("[data-testid='exercise-header']").count() == 2, "B should have A's exercises"
            pb.goto(base + "#/t/timer", wait_until="networkidle")
            expect(pb.locator(".timer-card[data-state='idle'] .timer-name")).to_have_text("Pasta", timeout=20_000)
            pb.screenshot(path=str(SHOTS / "15-sync-device-b.png"))

            # B adds a saved timer; A picks it up after "Sync now" without a reload
            pb.fill("[data-testid='timer-name']", "From B")
            pb.fill("[data-testid='timer-minutes']", "3")
            pb.check("[data-testid='timer-saved']")
            pb.click("[data-testid='timer-add']")
            expect(pb.locator(".timer-card")).to_have_count(2)
            pb.wait_for_timeout(2500)  # the local write is pushed after a short debounce
            page.goto(base + "#/settings", wait_until="networkidle")
            page.click("[data-testid='sync-now']")
            page.goto(base + "#/t/timer", wait_until="networkidle")
            expect(page.locator(".timer-name", has_text="From B")).to_have_count(1, timeout=20_000)
            # a timer started on B shows on A too, but belongs to B: A says where it runs, never rings for it
            pb.fill("[data-testid='timer-name']", "Ping")
            pb.fill("[data-testid='timer-seconds']", "2")
            pb.click("[data-testid='timer-start']")
            expect(pb.locator(".timer-card.ringing .timer-name")).to_have_text("Ping", timeout=10_000)
            pb.wait_for_timeout(2500)
            page.goto(base + "#/settings", wait_until="networkidle")
            page.click("[data-testid='sync-now']")
            page.goto(base + "#/t/timer", wait_until="networkidle")
            ping_on_a = page.locator(".timer-card", has_text="Ping")
            expect(ping_on_a).to_have_attribute("data-state", "finished", timeout=20_000)
            expect(ping_on_a).not_to_have_class(re.compile(r"ringing"))
            expect(ping_on_a.locator(".timer-meta")).to_contain_text("on Chrome")
            pb.locator(".timer-card.ringing [data-testid='timer-off']").click()
            expect(pb.locator(".timer-card", has_text="Ping")).to_have_count(0)
            device_b.close()

            if errors:
                failures.append("console/page errors: " + " | ".join(errors))
            browser.close()
    except Exception as e:  # noqa: BLE001
        failures.append(f"{type(e).__name__}: {e}")
    finally:
        if server:
            server.terminate()
        api.terminate()
    return finish(failures)


def finish(failures: list[str]) -> int:
    if failures:
        print("SMOKE FAILED")
        for f in failures:
            print(" -", f)
        return 1
    print("SMOKE OK — screenshots in", SHOTS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
