# Sync — how devices share one toolbox

Every tool's data (`tool/<id>/…` keys in the app's key/value store) is synced
between all of Ari's devices through a small Cloudflare Worker with a D1
database. Per-device UI state (`core/*`, `sync/*`, and any key with a `ui`
path segment such as `tool/workout/ui/currentWeek`) stays local.

The server never sees plaintext: records are encrypted on the device with a key
that only devices know. Linking a new device transfers that key with a
short-lived code shown on an already-linked device; a recovery key (the same
key, typed out) is the fallback.

## Keys

```
accountKey  = 32 random bytes, generated on the first device        (never sent)
accountId   = base64url(HKDF(accountKey, info="multitool/id"))[:22] (public id)
secret      = base64url(HKDF(accountKey, info="multitool/auth"))    (bearer token)
encKey      = HKDF(accountKey, info="multitool/enc")                (AES-256-GCM)
macKey      = HKDF(accountKey, info="multitool/rid")                (HMAC-SHA-256)
```

HKDF uses SHA-256 and an empty salt. The server stores `sha256(secret)` and
compares it against the `Authorization: Bearer <accountId>.<secret>` header.

Recovery key = the 32 bytes as 52 characters of the alphabet
`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (5 bits each), shown in groups of four.

## Records

A local key `k` with value `v` becomes one server record:

```
rid  = base64url(HMAC-SHA-256(macKey, k))                         opaque id
blob = base64(iv‖AES-GCM(encKey, iv, aad=rid, utf8(JSON({k, v}))))  (v absent for tombstones)
u    = updatedAt, epoch ms of the local write
t    = 1 for a deletion (tombstone), else 0
```

Local bookkeeping lives in a second IndexedDB object store `meta`, one row per
synced key: `{ u: updatedAt, d: dirty (not yet pushed), t: tombstone }`.
Deleted keys keep their meta row so an older version can never resurrect them.

## Conflict rule

Last writer wins per record, by `u`. The server applies an incoming record iff
`u >= stored.u`; a client applies a pulled record iff the local copy is not
dirty or `u >= local.u`. Whatever the server rejects, it returns in the same
response so the client converges even if a device clock is off.

Every applied write gets a per-account sequence number `seq`. Clients pull with
`since = last seen seq`; the server returns records with `seq > since` in
order (≤ 300 per response, `hasMore` for the rest).

## API (Worker, `https://api.multitool.ariilden.com`)

| Method | Path | Auth | Body → Response |
| --- | --- | --- | --- |
| GET | `/v1/health` | – | → `{ ok: true }` |
| POST | `/v1/account` | – | `{ accountId, secret }` → 201 `{ accountId }` (409 if it exists with another secret) |
| POST | `/v1/sync` | ✓ | `{ since, changes: [{rid, blob, u, t}] }` → `{ seq, changes: [{rid, blob, u, t, seq}], rejected: [{rid, blob, u, t, seq}], hasMore }` |
| POST | `/v1/pair` | ✓ | `{ lookupId, salt, wrapped }` → 201 (valid 10 minutes, single use) |
| POST | `/v1/pair/claim` | – | `{ lookupId }` → `{ accountId, salt, wrapped }` or 404 |
| DELETE | `/v1/account` | ✓ | → 204, everything for the account is gone |

Pushes are chunked to 50 records per request; the whole push+pull of one
request is a single D1 batch (a transaction), so sequence numbers are gap-free
and monotonic per account.

## Linking a device

1. Linked device A: `code` = 8 characters from the alphabet above (40 bits),
   `salt` = 16 random bytes, `wrapKey = PBKDF2-SHA-256(code, salt, 200 000)`,
   `wrapped = AES-GCM(wrapKey, accountKey)`, `lookupId = base64url(SHA-256("multitool/pair" ‖ code))`.
   A posts `{lookupId, salt, wrapped}` and shows the code as `XXXX-XXXX`.
2. New device B: the user types the code; B computes `lookupId`, claims it,
   unwraps `accountKey`, derives everything else and syncs. Its existing local
   data is pushed too (marked dirty with `u = now`), so nothing is lost.
3. The server deletes a pairing on claim or after 10 minutes and allows at most
   30 claims per IP per 10 minutes.

## Client loop (`web/src/core/sync.ts`)

Sync runs at start, when the page becomes visible or goes online, every 60 s
while visible, and 1.5 s after any local write. One run = push dirty records
(chunked) and pull until `hasMore` is false, then notify tools of the keys that
changed remotely (`kv.watch(prefix, fn)`), which reload them.

Status (`app.sync.status`): `off` (not linked), `idle`, `syncing`, `offline`,
`error` — shown in Settings → Sync and as a small icon in the top bar.

## Deploying the Worker

`.github/workflows/worker.yml` runs on pushes touching `worker/**`: it creates
the D1 database if missing, applies `worker/migrations/*.sql`, and deploys with
wrangler to the custom domain. Needs the repository secret
`CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit, D1:Edit, Zone DNS:Edit and
Workers Routes:Edit for ariilden.com); the job skips itself when the secret
is absent. The account id is in `worker/wrangler.toml` (not secret).

Locally the Worker runs on Node over `node:sqlite` (`worker/src/node-server.ts`),
which is also how the Playwright end-to-end test pairs two "devices".
