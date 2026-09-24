# MultiTool architecture

## One sentence

A dependency-free TypeScript PWA hosted on GitHub Pages is *the app*; a thin
Kotlin WebView shell on Android supplies the few things the web platform can't
(exact alarms, real notifications, home-screen widgets, self-update). Tools:
Timers and the Workout Companion (log + workout mode + stats).

## Why this shape

- Every UI or feature change ships by pushing to `main`; the phone loads it
  next time the app opens. No APK, no store, no approval.
- The agent building this can run `tsc`, Node's test runner and headless
  Chromium locally, so code is verified before it's deployed. It cannot run
  Flutter/Gradle locally (Google's hosts are blocked from its workspace), so the
  native layer is kept as small and as rarely-changing as possible.
- iPhone works in Safari as an installed PWA with the same code; only the
  Android-specific alarm reliability is missing there today.

## Web app (`web/`)

```
main.ts            boot: App.start() → mountShell() → register service worker
core/app.ts        wires storage, native bridge, settings, tool init, event stream
core/registry.ts   ToolDefinition { id, name, icon, init?, mount, status? }; provideService / useService so one tool can use another's service
core/db.ts         KV over IndexedDB (kv + meta stores, prefix-scoped per tool), sync bookkeeping, backup/restore
core/sync.ts       SyncEngine: push/pull encrypted records to the sync API, device linking
core/crypto.ts     WebCrypto helpers: key derivation, AES-GCM records, link codes, recovery key
core/native.ts     NativeBridge interface; AndroidBridge (window.MultiToolAndroid) | WebBridge
core/router.ts     hash routes: #/  #/t/<tool>[/sub]  #/settings
core/settings.ts   disabled tools, theme
core/store.ts      Signal<T>, Emitter<T>
core/dom.ts        h() element builder — the only "framework"
ui/                shell (top bar + host + sync indicator), home grid, settings page (+ sync-settings.ts), toasts, icons, bottom sheet
tools/<id>/        model.ts (pure, tested) · service.ts (background) · view.ts (DOM) · index.ts (register)
```

Rendering is plain DOM built with `h()`. Views subscribe to signals and patch
what changed; there is no virtual DOM. This is deliberate: it keeps the build
to `tsc` alone and the whole runtime auditable.

**Storage.** `IndexedDbKV` stores structured-clone values under string keys.
Tools receive a scoped KV (`tool/<id>/…`), settings live under `core/…`. The
settings page exports/imports the entire KV as a JSON backup. Every write to a
`tool/…` key (except `…/ui/…`) also records a timestamp and a dirty flag in the
`meta` store; that is what sync pushes. Tools learn about changes from other
devices through `kv.watch(prefix, fn)` and reload just those keys.

**Sync.** Optional, off until the user turns it on. A Cloudflare Worker + D1
(`worker/`) stores encrypted records per account; devices link with a
temporary 8-character code or the recovery key, each gets its own token, and
Settings → Sync lists every linked device with rename/remove. Last writer wins
per record. Full description in `docs/SYNC.md`.

**Workout log layout.** One `.wk` element: a top bar with the legend
(collapsed until opened; colours and marks in two columns) and the view
control (1 week / X per page / all — a per-device preference under
`ui/view`), optional page tabs, then the week blocks listed vertically and
centred. The week's label and start date sit in the grid's corner cell
(tap → week list); the week menu sits in the bottom-right cell. Each grid
ends with a notes row: an exercise's numbered notes (positive `n`, referenced
from sets) come first, then plain notes added with "+" (negative `n`, no
number); the week note is under the Notes column. From 1200 px the ‹ › arrows
flank the grid in 1-week mode; below that a slim bar above each grid carries
the arrows, the label and the menu so they stay reachable on a phone. On wide
screens the host drops its max-width so a full week fits without scrolling.

A re-render that restores the grid's scroll position tells the context menu
to ignore that scroll event (`keepPopoverThroughScroll`), so picking a colour
in the menu does not close it.

**Editing the grid.** A tap on a set cell, a notes cell, the week note or a
note in the notes row edits it in place (`tools/workout/inline.ts`): Enter /
Tab commit and move to the next set, Escape cancels, blur commits; what is
typed is sheet notation — marks as text, dot runs for note references
(`12!..` = "12!" with note 2; a note referred to for the first time is created
empty). Right-click / long-press opens a popover (`ui/popover.ts`) next to the
pointer with colour (set / exercise / day), star, marks, clear and a way into
the full bottom-sheet editor. Every other cell has such a menu too
(`openStyleMenu` in `view.ts`): an exercise header (colour / star on the
exercise, marks in `Exercise.marks` shown after the weight), a day cell and
the other-workout cell (the day's colour / star / `marks`), the corner cell
(`Week.c` / `star`, the sheet's gold "Week 17/18" labels) and the week-note
cell (`Week.notesStyle`). Typing a weight in the exercises editor compares it
with the last time the exercise was on the plan (`previousExercise`, by id,
library entry or name): a different weight turns the header purple — the
sheet's "weight increased" — and the same weight takes it off again
(`setExerciseWeight`; a colour picked by hand is left alone; the purple is
not copied into the next week, the weight is). The weight also becomes the
library entry's `weight`, which the picker writes on the exercise the next
time it is added to a week. A day's notes get suggestions
(`noteSuggestions`): every short comma- or line-separated piece written in a
day note before, newest first; the inline editor lists them under the field
filtered by the piece being typed (`inline.ts` `suggestions`, ↑ ↓ Enter / Tab
or a tap), the day editor shows them as chips. The log keeps its scroll position across
re-renders and scrolls to the current week only when the user navigates; it
opens on the newest week. `[label](url)` and bare URLs in notes render as
links (opened through the native bridge). A new week counts on from the
highest numbered label ("Week 80" → "Week 81", past unnumbered gap weeks).
Importing a file replaces weeks with the same id, drops empty hand-made weeks
that only duplicate an imported week's label, and lands on the newest week.
Page tabs name weeks by their position in the log ("71–80", "81–86"): labels
can be inconsistent (an older import numbered "Week 79" and "Week 80" six
calendar weeks apart with unnumbered gap weeks between them), but every
calendar week is one entry, so the position is the week number. To keep it
that way, "New week" also adds the calendar weeks skipped since the latest
entry as no-workout weeks (red days, toast "Week 87 added as a no-workout
week"). Ari tracks the weeks and days he did *not* train, so
"delete" is not removal for anything that has happened: a day dated today or
earlier is cleared and marked red (`clearDay`), a week that has begun becomes
a no-workout week with its label, dates and exercise list kept (`clearWeek`,
days still ahead are only cleared); only days and weeks that lie ahead are
taken out for real. Unticking a training day in the week editor still removes
the row (that is the week's structure, not a workout).

**Workout mode** (`tools/workout/session.ts`, route `#/t/workout/session`,
the "Workout" button in the log). Shows the week whose dates contain today
with today's row highlighted (or offers to start this week / add today's row),
and a timer panel at the bottom. Typing a set starts the rest countdown
(settings → Workout mode: rest 1:30, ± step 30 s, work time for timed sets),
with +/− step buttons, Off, and Repeat once it rings; a `.` pointing at a note
with no text yet prompts for the note. Exercises flagged "Timed sets"
(`Exercise.timedSec`, e.g. handstand holds) run set by set: work countdown →
rest (the set's cell opens for typing) → next set; the sequence is offered
when the previous exercise's rest is turned off. All countdowns are one-off
timers in the Timers tool (`useService('timer')` → `TimerService`), so they
ring through the shell's alarms and appear in the timer list; the timer
service gained `extend` and `restartWith` for this. Day colours are drawn only
on the day cell, set / exercise colours on their cells, so a day off and a
skipped exercise read differently.

Workout mode also keeps the day's `session` (`DayEntry.session`: start, end,
rest seconds) — every set typed and every countdown that ends moves its end,
rest countdowns add what they actually ran (+30 s, early Off and Repeat
included), and activity more than three hours after the last one starts a new
session — which is where the stats page gets workout durations from.

**Exercise library** (`tools/workout/library.ts`, pure and unit-tested; edited
in Settings → Exercises, stored in `settings.library` so it syncs, merged with
the built-ins by id so edits win, deletions stick (`libraryRemoved`) and new
built-ins arrive). An entry has muscle groups with a role (a set counts fully
for a main mover, half for a helper — `roleWeight`), a load rule (`external`
with 1 or 2 dumbbells moved at once, `bodyweight` with a share of the day's
bodyweight plus whatever weight is written on the exercise, or `none` for a
hold) and other names it had in the log. A week's exercise links to an entry
with `Exercise.lib` (set when it is added from the picker, or chosen in the
exercises editor); without a link the name matches by slug against the
entry's id, name and aliases, which is how the imported history ("NO BENCH:
Dumbbell Rows", "+1 step Chest Press") lands on the right entries. The
bodyweight shares are rounded force-plate figures (push-up 64 %, feet
elevated 75 %, knee 49 %, squat / pistol / lunge 85 %, dips and handstand
push-ups 95 %, pull-ups 100 %, pike push-ups 60 %); each entry's note says so.

**Stats** (`tools/workout/stats.ts` pure and unit-tested, `stats-view.ts` the
page at `#/t/workout/stats`, `charts.ts` the SVG bars / lines / donuts).
Everything is laid out over *calendar* weeks, so a week Ari skipped is a
visible empty slot: a faint red column in the bar charts, a shaded band in
the line charts, dim cells in the activity map. Every card has its own range
(chips 1 wk · 3 wk · 1 mo · 3 mo · 6 mo · 1 yr · All · any number of weeks;
the header's row sets all cards at once; per device under `ui/stats`
together with each card's metric choices). Cards: overview tiles with a days
donut (tracked / other / none); a GitHub-style activity map (greens by sets
done, orange for "other" workouts, dim for days off; days ahead not drawn); a
month calendar with Ari's week numbers; workout days per week; training
volume per week (sets / reps / kg moved); muscle groups over time (lines per
group, sets or kg moved, chips choose the groups, colours fixed per group);
muscle groups share and exercises share (donuts); one exercise's progression
(best set / total reps / volume / weight / sets done; exercises folded into
their library entry, the week's own name in the tooltip); bodyweight over
dates; workout duration (working vs rest, bars and a donut). Every axis
carries its title ("Week number", "sets", "kg moved"); bar and line charts
over more than ~20 slots zoom and pan (− / + / ⟲ buttons, Ctrl + wheel,
pinch, drag) with a "weeks 28–59" hint; tooltips follow the pointer, a
crosshair on line charts, and on touch the first tap shows, the second opens
the week in the log. Load per set = reps × `loadPerRep` (the library rule with
the day's bodyweight, carried forward from the last weigh-in). Set cells are
read with `parseSetValue` ("12!" → 12, "6+4" → 10, "9,3" → 9, "12(20)" → 12
at 20 kg, "-" / "✗" = not done) and plan weights with `parseWeight`
("26kg → 18kg" → 18).

**Service worker** (`sw.js`, generated by the build) precaches every asset,
serves cache-first, and falls back to `index.html` offline. The cache name
includes the build version, so each deploy installs a fresh worker; the app
shows "Update ready — Reload" when that happens and also applies it on next
launch.

**Versioning.** `APP_VERSION` = `YYYY.MM.DD-<git sha>` stamped at build time;
visible in Settings → About and checked by the `verify` CI job against the live
site.

## Native bridge contract

`web/src/core/native.ts` ↔ `android/…/NativeBridge.kt`.

| Web → shell | Purpose |
| --- | --- |
| `getInfo()` | platform, shell version, permission states |
| `scheduleAlarm(json)` / `cancelAlarm(id)` | exact alarm at epoch ms; carries title/body/route/actions/durationMs |
| `notify(json)` / `cancelNotification(id)` | plain notifications |
| `requestPermissions()` | notifications, exact alarms, full-screen intent |
| `openUrl`, `vibrate`, `reload` | misc |
| `publishWidgetState(toolId, json)` | snapshot for future home-screen widgets |
| `installUpdate(url)` | download APK from a GitHub release and open the installer |
| `drainEvents()` | returns queued shell → web events |

| Shell → web (events) | When |
| --- | --- |
| `alarm-fired {id, at}` | AlarmManager fired (also delivered on next launch if the app was closed) |
| `alarm-stopped {id}` | user tapped Stop / swiped the notification |
| `alarm-restarted {id, at}` | user tapped Restart on the notification; shell already re-armed the alarm |
| `notification-tap`, `permissions-changed`, `resume` | as named |

Events are persisted in SharedPreferences (`EventQueue`) and the shell pokes
`window.__multitoolNativeEvent()` so the page drains them; nothing is lost if
the page isn't loaded yet.

## Android shell (`android/`)

- `MainActivity` — WebView, back navigation, permission prompts, route intents.
- `alarms/` — `AlarmScheduler` (setAlarmClock), `AlarmStore` (persisted specs),
  `AlarmReceiver` (fires → notification + event), `ActionReceiver` (Stop /
  Restart), `BootReceiver` (re-arm after reboot / app update).
- `Notifications` — channels (`timers` = alarm sound, high importance),
  full-screen intent when locked.
- `update/ApkInstaller` — DownloadManager + package installer.
- `WidgetStateStore` — placeholder data path for widgets.

Package id `com.ariilden.multitool`, minSdk 26, targetSdk 35. Version name
`1.0.<CI run number>`; the web app compares that with the latest GitHub release.

## Sync API (`worker/`)

Cloudflare Worker (TypeScript, no dependencies) with a D1 database, at
`https://multitool-api.ariilden.com`. `handler.ts` holds all logic and also runs
on Node over `node:sqlite` (`node-server.ts`), which is what the unit tests and
the Playwright smoke test use — two headless "devices" pair and exchange data
against a real instance of the same code.

## Pipeline

- `web.yml`: build + unit tests (web and worker) → Playwright smoke incl. the
  two-device sync scenario (screenshots uploaded as an artifact) →
  `actions/deploy-pages` → smoke test against production.
- `worker.yml`: type-check + tests → create D1 if missing → migrations →
  `wrangler deploy` (skips when `CLOUDFLARE_API_TOKEN` is not set).
- `android.yml`: verify keystore fingerprint → `gradle assembleRelease` →
  GitHub Release with the APK.

## Known limitations / next steps

- Alarm sound plays once via the notification channel; a persistent "ringing
  until dismissed" foreground service is a possible upgrade.
- iOS PWA cannot fire alarms when closed (would need Web Push + a tiny server).
- Widgets: data path exists (`publishWidgetState`), UI not yet built.
- Sync resolves conflicts per record by last write; simultaneous edits of the
  same week on two devices keep the later one (no merge, no conflict copy).
- Timers sync including their running state, so a timer started on one device
  also rings on the others; dismissing it anywhere stops it everywhere.
