#!/usr/bin/env python3
"""End-to-end smoke test for the built web app (web/dist).

Serves the build on a local port, drives it in headless Chromium (Playwright,
phone-sized viewport) and saves screenshots to web/tests/screenshots/.
Exit code != 0 on any failure. Run after `node scripts/build-web.mjs`.

    pip install playwright==1.56.0 && python -m playwright install chromium
    python web/tests/smoke.py [--base-url URL]
"""
import argparse
import pathlib
import re
import subprocess
import sys
import time

from playwright.sync_api import expect, sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
SHOTS = ROOT / "web" / "tests" / "screenshots"
PORT = 8765


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=None, help="Test a deployed site instead of web/dist")
    args = ap.parse_args()

    SHOTS.mkdir(parents=True, exist_ok=True)
    server = None
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
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(
                viewport={"width": 412, "height": 915},
                device_scale_factor=2,
                is_mobile=True,
                has_touch=True,
                color_scheme="dark",
                permissions=["notifications"],
            )
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
            page.click("[data-testid='exercise-add']")
            page.locator("[data-testid='exercise-name']").nth(0).fill("Pistol Squats")
            page.click("[data-testid='exercise-add']")
            page.locator("[data-testid='exercise-name']").nth(1).fill("Dumbbell Rows")
            page.locator("[data-testid='exercise-weight']").nth(1).fill("24kg")
            page.screenshot(path=str(SHOTS / "08-workout-exercises.png"))
            page.click(".sheet-panel .btn-primary")  # Done
            expect(page.locator(".sheet-panel")).to_have_count(0)
            grid = page.locator("[data-testid='workout-grid']")
            expect(grid).to_be_visible()
            assert grid.locator("tbody tr").count() == 3, "expected Mon/Wed/Fri rows"
            assert grid.locator("[data-testid='exercise-header']").count() == 2

            # log Mon: 8, 8, 8 for squats then 12 with a mark and a note for rows
            grid.locator("td.wk-cell").nth(0).locator("button").click()
            expect(page.locator("[data-testid='set-input']")).to_be_visible()
            for reps in ("8", "8", "8"):
                page.fill("[data-testid='set-input']", reps)
                page.click("[data-testid='set-next']")
            page.fill("[data-testid='set-input']", "12")
            page.locator(".chip-mark", has_text="!").first.click()
            expect(page.locator("[data-testid='set-input']")).to_have_value("12!")
            page.locator(".chip", has_text="+ note").click()
            page.fill("[data-testid='note-input']", "22kg")
            page.click("[data-testid='note-save']")
            page.screenshot(path=str(SHOTS / "09-workout-set-editor.png"))
            page.locator(".sheet-panel button", has_text="Done").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)
            first_row = grid.locator("tbody tr").nth(0)
            expect(first_row.locator("td.wk-cell").nth(0)).to_have_text("8")
            expect(first_row.locator("td.wk-cell").nth(3)).to_have_text("12!1")
            expect(page.locator("[data-testid='footnotes']")).to_contain_text("22kg")

            # colour one set green, star another, tint a whole day
            first_row.locator("td.wk-cell").nth(0).locator("button").click()
            page.locator(".sheet-panel .swatch").nth(1).click()  # green
            page.locator(".sheet-panel button", has_text="Done").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)
            expect(first_row.locator("td.wk-cell").nth(0)).to_have_class(re.compile(r"wk-tinted"))
            first_row.locator("td.wk-cell").nth(1).locator("button").click()
            page.locator(".sheet-panel .swatch-star").first.click()
            page.locator(".seg", has_text="Day").click()
            page.locator(".sheet-panel .swatch").nth(4).click()  # gold, whole day
            page.locator(".sheet-panel button", has_text="Done").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)
            assert first_row.locator("td.wk-cell").nth(1).locator(".wk-star").count() == 1
            expect(first_row.locator("th")).to_have_class(re.compile(r"wk-tinted"))

            # bodyweight via the day header
            first_row.locator("[data-testid='day-header']").click()
            page.fill("[data-testid='day-bodyweight']", "97.1")
            page.locator(".sheet-panel button", has_text="Done").click()
            expect(page.locator(".sheet-panel")).to_have_count(0)
            expect(first_row.locator("[data-testid='day-header']")).to_contain_text("97.1 kg")
            page.screenshot(path=str(SHOTS / "10-workout-grid.png"))

            # new week copies the exercises
            label_before = page.locator("[data-testid='week-label']").inner_text()
            page.click("[data-testid='week-menu']")
            page.click("[data-testid='menu-new-week']")
            expect(page.locator("[data-testid='week-label']")).not_to_have_text(label_before)
            assert page.locator("[data-testid='exercise-header']").count() == 2
            expect(page.locator("tbody tr").nth(0).locator("td.wk-cell").nth(0)).to_have_text("")

            # data survives reload; tool settings page renders
            page.reload(wait_until="networkidle")
            expect(page.locator("[data-testid='workout-grid']")).to_be_visible()
            page.goto(base + "#/t/workout/settings", wait_until="networkidle")
            expect(page.locator("[data-testid='workout-settings']")).to_be_visible()
            page.screenshot(path=str(SHOTS / "11-workout-settings.png"))

            # light theme render
            light = browser.new_context(viewport={"width": 412, "height": 915}, color_scheme="light")
            lp = light.new_page()
            lp.goto(base + "#/t/timer", wait_until="networkidle")
            expect(lp.locator("[data-testid='timer-list']")).to_be_visible()
            lp.screenshot(path=str(SHOTS / "07-light.png"))

            if errors:
                failures.append("console/page errors: " + " | ".join(errors))
            browser.close()
    except Exception as e:  # noqa: BLE001
        failures.append(f"{type(e).__name__}: {e}")
    finally:
        if server:
            server.terminate()

    if failures:
        print("SMOKE FAILED")
        for f in failures:
            print(" -", f)
        return 1
    print("SMOKE OK — screenshots in", SHOTS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
