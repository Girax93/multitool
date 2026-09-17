# MultiTool

A personal digital toolbox: pick the tools you want — timers, workout log, and
whatever comes next — in one app.

- **Web app (the actual app):** https://multitool.ariilden.com — an installable
  PWA, works in any browser, updates itself.
- **Android shell:** a thin native wrapper that adds exact alarms, notifications
  and (later) home-screen widgets. Download the latest APK from
  [Releases](https://github.com/Girax93/multitool/releases/latest) and install it
  once; afterwards *Settings → About → Check for shell update* inside the app.

## How updates reach the phone

| What changed | What happens |
| --- | --- |
| Anything under `web/` | GitHub Actions builds, tests and deploys to GitHub Pages. The app picks up the new version the next time it's opened (or shows "Update ready — Reload"). Nothing to install. |
| Anything under `android/` | GitHub Actions builds a signed APK and publishes a release. The app's Settings page offers "Install update" — one tap. |

## Repository layout

```
web/        TypeScript PWA — no framework, no bundler, no npm dependencies
  src/core/   registry, storage (IndexedDB), native bridge, router, settings
  src/tools/  one folder per tool (timer, workout, …)
  src/ui/     app shell, home, settings, toast
  tests/      Playwright smoke test (phone viewport, screenshots)
android/    Kotlin WebView shell: alarms, notifications, self-update, JS bridge
scripts/    build-web.mjs (tsc + tests + service worker), serve.mjs
docs/       ARCHITECTURE.md
.github/    workflows: web.yml (Pages), android.yml (APK release)
```

## Developing

```
node scripts/build-web.mjs        # type-check, compile, unit tests → web/dist
node scripts/serve.mjs            # http://127.0.0.1:8080/
python web/tests/smoke.py         # end-to-end smoke test + screenshots
```

Requires Node 22 and `typescript@6` on the PATH (`npm i -g typescript@6.0.3`).
The Android shell builds on GitHub Actions; locally you need Android Studio or
`gradle -p android assembleDebug` with an Android SDK.

See [AGENTS.md](AGENTS.md) for the end-to-end workflow Claude follows, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.
