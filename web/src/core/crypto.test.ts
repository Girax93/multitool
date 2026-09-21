import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_ALPHABET,
  decodeRecoveryKey,
  decryptRecord,
  deriveKeys,
  encodeRecoveryKey,
  encryptRecord,
  formatCode,
  fromBase64Url,
  lookupIdFor,
  newAccountKey,
  normaliseCode,
  randomCode,
  recordId,
  toBase64Url,
  unwrapAccountKey,
  wrapAccountKey,
} from './crypto.js';

test('base64url round trip', () => {
  for (const n of [0, 1, 2, 3, 31, 32, 33]) {
    const bytes = new Uint8Array(n).map((_, i) => (i * 37 + 11) & 255);
    const s = toBase64Url(bytes);
    assert.match(s, /^[A-Za-z0-9_-]*$/);
    assert.deepEqual([...fromBase64Url(s)], [...bytes]);
  }
});

test('key derivation is deterministic and ids are opaque', async () => {
  const key = newAccountKey();
  const a = await deriveKeys(key);
  const b = await deriveKeys(new Uint8Array(key));
  assert.equal(a.accountId, b.accountId);
  assert.equal(a.secret, b.secret);
  assert.equal(a.accountId.length, 22);
  assert.match(a.secret, /^[A-Za-z0-9_-]{43}$/);
  const other = await deriveKeys(newAccountKey());
  assert.notEqual(a.accountId, other.accountId);
  const rid1 = await recordId(a, 'tool/workout/weeks/w1');
  assert.equal(rid1, await recordId(b, 'tool/workout/weeks/w1'));
  assert.notEqual(rid1, await recordId(a, 'tool/workout/weeks/w2'));
  assert.notEqual(rid1, await recordId(other, 'tool/workout/weeks/w1'));
  await assert.rejects(deriveKeys(new Uint8Array(16)), /32 bytes/);
});

test('records encrypt and decrypt; tampering and wrong keys fail', async () => {
  const keys = await deriveKeys(newAccountKey());
  const value = { label: 'Week 1', days: [{ id: 'd1', weekday: 'Mon' }], n: 1.5, s: 'ünïcödé ⭐' };
  const rec = await encryptRecord(keys, 'tool/workout/weeks/w1', value);
  assert.equal(rec.rid, await recordId(keys, 'tool/workout/weeks/w1'));
  assert.ok(!rec.blob.includes('Week'));
  const back = await decryptRecord(keys, rec.rid, rec.blob);
  assert.equal(back.k, 'tool/workout/weeks/w1');
  assert.deepEqual(back.v, value);
  // same key, second encryption → different ciphertext (random iv)
  const rec2 = await encryptRecord(keys, 'tool/workout/weeks/w1', value);
  assert.notEqual(rec.blob, rec2.blob);
  // tombstone carries only the key
  const tomb = await encryptRecord(keys, 'tool/workout/weeks/w1', undefined);
  assert.deepEqual(await decryptRecord(keys, tomb.rid, tomb.blob), { k: 'tool/workout/weeks/w1' });
  // wrong rid (AAD) or wrong account fails
  await assert.rejects(decryptRecord(keys, rec2.rid.slice(1) + 'A', rec.blob));
  await assert.rejects(decryptRecord(await deriveKeys(newAccountKey()), rec.rid, rec.blob));
});

test('recovery key round trip and validation', () => {
  const key = newAccountKey();
  const text = encodeRecoveryKey(key);
  assert.equal(text.replace(/-/g, '').length, 52);
  assert.match(text, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){12}$/);
  assert.deepEqual([...(decodeRecoveryKey(text) ?? [])], [...key]);
  assert.deepEqual([...(decodeRecoveryKey(text.toLowerCase().replace(/-/g, ' ')) ?? [])], [...key]);
  assert.equal(decodeRecoveryKey(text.slice(0, -1)), null);
  assert.equal(decodeRecoveryKey('0' + text.slice(1)), null); // 0 is not in the alphabet
  const zero = encodeRecoveryKey(new Uint8Array(32));
  assert.deepEqual([...(decodeRecoveryKey(zero) ?? [])], new Array(32).fill(0));
});

test('link codes: format, normalisation, wrap and unwrap', async () => {
  const code = randomCode();
  assert.equal(code.length, 8);
  for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch));
  assert.match(formatCode(code), /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(normaliseCode(formatCode(code).toLowerCase()), code);
  assert.equal(normaliseCode(' ' + code.slice(0, 4) + ' ' + code.slice(4) + ' '), code);
  assert.equal(normaliseCode('ABCD-EFG'), null);
  assert.equal(normaliseCode('ABCD-EFG0'), null); // 0 is not in the alphabet

  const key = newAccountKey();
  const w = await wrapAccountKey(code, key);
  assert.equal(w.lookupId, await lookupIdFor(code));
  assert.deepEqual([...(await unwrapAccountKey(code, w.salt, w.wrapped))], [...key]);
  const wrong = code[0] === 'A' ? 'B' + code.slice(1) : 'A' + code.slice(1);
  await assert.rejects(unwrapAccountKey(wrong, w.salt, w.wrapped));
});
