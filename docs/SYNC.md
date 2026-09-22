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

HKDF uses SHA-256 and an empty salt. The server stores `sha256(secret)`; the
secret is only ever sent to `POST /v1/account`, which creates the account (or
recognises it) and registers the calling device.

Recovery key = the 32 bytes as 52 characters of the alphabet
`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (5 bits each), shown in groups of four.

## Devices

Every device that syncs has its own row in `devices` (migration `0002`) and its
own random 32-byte **device token**, issued once — by `POST /v1/account` for the
first device / recovery-key joins, by `POST /v1/pair/claim` for devices linked
with a code — and stored only on that device (`sync/account` in IndexedDB).
Every authenticated request carries `Authorization: Bearer <accountId>.<deviceToken>`;
the server stores `sha256(token)` and refreshes `last_seen_at` at most every
10 minutes.

The point of per-device tokens is the device list in Settings → Sync: it
shows every device that can read the account (name, last seen, linked on),
lets Ari rename them, and lets him **remove** one. Removal deletes the row, so
that device's next request gets a 401 and it turns sync off on itself with an
explanation ("removed from the sync account" vs. "the account was deleted").
A device names itself from its user agent (`Android app`, `Chrome on Windows`,
…); `worker` caps names at 60 characters.

Limits of the model: a removed device keeps the data it already had (it is
end-to-end encrypted on the device, not revocable), and anyone holding the
recovery key can register a new device again. To lock out a lost recovery key:
Settings → Sync → *Delete server data*, then *Turn on sync* again on one
device (new account key) and re-link the others with a code.

Accounts linked before this change had no device token; on start such a client
calls `POST /v1/account` once with its secret and adopts the token it gets
back.

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

## API (Worker, `https://multitool-api.ariilden.com`)

The hostname is a one-level subdomain on purpose: the zone's free Universal SSL
certificate covers `*.ariilden.com` only. `api.multitool.ariilden.com` deployed
fine but never got an HTTPS certificate (that needs Cloudflare's paid Advanced
Certificate Manager).

| Method | Path | Auth | Body → Response |
| --- | --- | --- | --- |
| GET | `/v1/health` | – | → `{ ok: true }` |
| POST | `/v1/account` | – | `{ accountId, secret, device: { name } }` → 201 (new) / 200 (existing, same secret) `{ accountId, device: { id, token } }`; 409 if it exists with another secret |
| POST | `/v1/sync` | ✓ | `{ since, changes: [{rid, blob, u, t}] }` → `{ seq, changes: [{rid, blob, u, t, seq}], rejected: [{rid, blob, u, t, seq}], hasMore }` |
| POST | `/v1/pair` | ✓ | `{ lookupId, salt, wrapped }` → 201 (valid 10 minutes, single use) |
| POST | `/v1/pair/claim` | – | `{ lookupId, device: { name } }` → `{ accountId, salt, wrapped, device: { id, token } }` or 404 |
| GET | `/v1/devices` | ✓ | → `{ devices: [{ id, name, createdAt, lastSeenAt }], current: <this device's id> }` |
| PATCH | `/v1/devices/:id` | ✓ | `{ name }` → the updated device |
| DELETE | `/v1/devices/:id` | ✓ | → 204; 400 for the calling device (use "Turn off on this device"), 404 if unknown |
| DELETE | `/v1/account` | ✓ | → 204, everything for the account is gone (records, devices, pairings) |

✓ = `Authorization: Bearer <accountId>.<deviceToken>`; 401 `Unknown account`
when the account is gone, 401 `This device is not linked to the account` when
the device was removed.

Pushes are chunked to 50 records per request; the whole push+pull of one
request is a single D1 batch (a transaction), so sequence numbers are gap-free
and monotonic per account.

## Linking a device

1. Linked device A: `code` = 8 characters from the alphabet above (40 bits),
   `salt` = 16 random bytes, `wrapKey = PBKDF2-SHA-256(code, salt, 200 000)`,
   `wrapped = AES-GCM(wrapKey, accountKey)`, `lookupId = base64url(SHA-256("multitool/pair" ‖ code))`.
   A posts `{lookupId, salt, wrapped}` and shows the code as `XXXX-XXXX`.
2. New device B: the user types the code; B computes `lookupId`, claims it
   (sending its own name), gets `wrapped` plus a fresh device token, unwraps
   `accountKey`, derives everything else and syncs. Its existing local data is
   pushed too (marked dirty with `u = now`), so nothing is lost.
3. The server deletes a pairing on claim or after 10 minutes and allows at most
   30 claims per IP per 10 minutes.

## Client loop (`web/src/core/sync.ts`)

Sync runs at start, when the page becomes visible or goes online, every 60 s
while visible, and 1.5 s after any local write. One run = push dirty records
(chunked) and pull until `hasMore` is false, then notify tools of the keys that
changed remotely (`kv.watch(prefix, fn)`), which reload them.

Status (`app.sync.status`): `off` (not linked), `idle`, `syncing`, `offline`,
`error` — shown in Settings → Sync and as a small icon in the top bar. A 401
turns sync off and leaves `state.notice` explaining why (device removed or
account deleted); `syncNow()` returns the promise of an already-running sync
instead of starting a second one.

## Deploying the Worker

`.github/workflows/worker.yml` runs on pushes touching `worker/**`: it creates
the D1 database if missing, applies `worker/migrations/*.sql`, and deploys with
wrangler to the custom domain. Needs the repository secret
`CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit, D1:Edit, Zone DNS:Edit and
Workers Routes:Edit for ariilden.com); the job skips itself when the secret
is absent. The account id is in `worker/wrangler.toml` (not secret).

Locally the Worker runs on Node over `node:sqlite` (`worker/src/node-server.ts`),
which is also how the Playwright end-to-end test pairs two "devices".
