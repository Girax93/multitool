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
