// Lokaler, verschlüsselter Speicher (IndexedDB). Ohne Schlüssel sind alle Inhalte unlesbar.
import { b64, rand, deriveKey, encrypt, decrypt } from './crypto.js';

const ITERATIONS = 600000;
let dbp;
let key = null;

function db() {
  return (dbp ??= new Promise((resolve, reject) => {
    // Interner Name bleibt 'lichtung': Umbenennen würde bestehende Tagebücher unauffindbar machen.
    const r = indexedDB.open('lichtung', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('entries', { keyPath: 'id' });
      r.result.createObjectStore('kv', { keyPath: 'k' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

async function run(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  });
}

const rawGet = (k) => run('kv', 'readonly', (s) => s.get(k));
const rawPut = (k, v) => run('kv', 'readwrite', (s) => s.put({ k, v }));

export const isUnlocked = () => key !== null;
export const lock = () => { key = null; };

export async function hasVault() {
  return !!(await rawGet('meta'));
}

export async function createVault(pass) {
  const salt = rand(16);
  const k = await deriveKey(pass, salt, ITERATIONS);
  await rawPut('meta', { salt: b64.to(salt), iterations: ITERATIONS, check: await encrypt(k, { ok: true }) });
  key = k;
}

export async function unlock(pass) {
  const meta = (await rawGet('meta')).v;
  const k = await deriveKey(pass, b64.from(meta.salt), meta.iterations);
  try {
    await decrypt(k, meta.check);
  } catch {
    return false;
  }
  key = k;
  return true;
}

export async function saveEntry(e) {
  const blob = await encrypt(key, e);
  await run('entries', 'readwrite', (s) => s.put({ id: e.id, blob }));
}

export async function listEntries() {
  const rows = await run('entries', 'readonly', (s) => s.getAll());
  const out = [];
  for (const r of rows) if (r.blob) out.push(await decrypt(key, r.blob));
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

// Anzahl ohne Entschlüsseln: nur die Zahl, kein Inhalt.
export const countItems = () => run('entries', 'readonly', (s) => s.count());

export const deleteEntry = (id) => run('entries', 'readwrite', (s) => s.delete(id));

export async function setSecret(name, obj) {
  await rawPut(name, await encrypt(key, obj));
}

export async function getSecret(name) {
  const row = await rawGet(name);
  return row ? decrypt(key, row.v) : null;
}

export const clearSecret = (name) => run('kv', 'readwrite', (s) => s.delete(name));

export async function wipe() {
  key = null;
  const d = await db();
  d.close();
  dbp = null;
  await new Promise((resolve) => {
    const r = indexedDB.deleteDatabase('lichtung');
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}
