# Working on MultiTool (instructions for Claude / AI agents)

Ari gives feedback; the agent does everything else — code, tests, deploy,
release. Ari never pushes, approves, or runs commands. The only manual step in
the whole chain is tapping "install" on the phone for a new Android shell.

## Ground rules

1. **Ask before implementing anything unclear.** Ari prefers a question over a
   wrong guess.
2. **Never break updates.** The Android shell must always be signed with the
   same keystore (the workflow refuses otherwise). The application id
   `com.ariilden.multitool` and tool ids (`timer`, `workout`, …) are permanent.
3. **Verify before pushing.** A push to `main` deploys to production.
4. **No new npm dependencies in `web/`.** The web app is dependency-free by
   design: the agent's cloud workspace can reach GitHub but not npm, pub.dev or
   CDNs, so anything that needs a package can't be type-checked or run locally.
   If a library is truly needed, vendor its source under `web/vendor/` with a
   note on where it came from.

## The loop

```
git clone https://github.com/Girax93/multitool     # public repo, clone works
… edit …
node scripts/build-web.mjs                          # tsc + unit tests (must pass)
python3 web/tests/smoke.py                          # headless Chromium; look at web/tests/screenshots/*.png
git add -A && git commit -m "…"                     # local commit for a clean diff
```

**Pushing:** `git push` is refused for this repo from the cloud workspace
(GitHub credentials are only injected for repos registered as session sources).
Push through Ari's connected GitHub account instead:

- `GITHUB_COMMIT_MULTIPLE_FILES` (Composio) with `owner: Girax93, repo: multitool,
  branch: main`, `upserts: [{path, content, encoding}]` for changed/added files
  (`encoding: base64` for binaries) and `deletes: [path]` for removals. Get the
  list from `git diff --name-status origin/main HEAD`. Large pushes: split into
  a few commits. Afterwards `git fetch && git reset --hard origin/main`.
- If a future session *does* have push rights (repo added as a session source),
  plain `git push` is fine and preferred.

**Watching CI:** `GITHUB_LIST_WORKFLOW_RUNS_FOR_A_REPOSITORY` → run id →
`GITHUB_LIST_JOBS_FOR_A_WORKFLOW_RUN` / `GITHUB_DOWNLOAD_WORKFLOW_RUN_LOGS`, or
`curl https://api.github.com/repos/Girax93/multitool/actions/runs` (public).
Fix red runs before telling Ari it's done.

## What runs where

| Trigger | Workflow | Result |
| --- | --- | --- |
| push to `main` touching `web/**` or `scripts/**` | `.github/workflows/web.yml` | build → unit tests → Playwright smoke → deploy to GitHub Pages → smoke against the live site |
| push to `main` touching `android/**` | `.github/workflows/android.yml` | signed release APK → GitHub Release `shell-v1.0.<run>` |

The live site is https://multitool.ariilden.com (GitHub Pages, custom domain,
CNAME record in Cloudflare DNS pointing at `girax93.github.io`).

The agent's workspace cannot fetch the live site or Cloudflare; use the
`verify` job's output (or Ari's browser via the desktop bridge) to check
production.

## Adding a tool

1. `web/src/tools/<id>/index.ts` → `registerTool({...})` (see `core/registry.ts`).
   Put pure logic in `model.ts` with `model.test.ts` next to it; UI in `view.ts`;
   background behaviour in `service.ts` via `init()`.
2. Import it in `web/src/tools/index.ts`.
3. Storage: `ctx.kv` is already namespaced to the tool. Native: `ctx.native`.
4. Extend `web/tests/smoke.py` with at least one happy-path check.

## Android shell

Kotlin, single WebView, no Compose. Native capabilities are exposed to the page
via `NativeBridge.kt` ↔ `web/src/core/native.ts` — keep both sides in sync.
Only change `android/` when a *native* capability is needed; every shell
release means Ari has to tap install once.

Secrets in the repo: `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Ari keeps an offline copy of the
keystore. Never commit a keystore.

## Docs to keep current

- `docs/ARCHITECTURE.md` when the structure changes.
- The claude.ai Project "MultiTool" holds the running decision log and open
  questions (e.g. the workout notation).
