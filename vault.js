// Lokaler, verschlüsselter Speicher (IndexedDB). Ohne Schlüssel sind alle Inhalte unlesbar.
//
// Ein einziger Tagebuch-Schlüssel verschlüsselt alle Inhalte. Er liegt nur eingepackt vor, und zwar getrennt
// für Passphrase, Wiederherstellungsschlüssel und Fingerabdruck. So bleibt jeder Zugang unabhängig: Eine neue
// Passphrase packt nur um und muss kein Tagebuch neu verschlüsseln.
import { b64, rand, deriveKey, deriveRaw, importRaw, hkdfKey, encrypt, decrypt } from './crypto.js';
import { registerPasskey, readPrf, forgetPasskey } from './bio.js';

const ITERATIONS = 600000;
const BIO_INFO = 'tend-biometric-unlock';
const REC_INFO = 'tend-recovery-key';
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
const getMeta = async () => (await rawGet('meta')).v;

export const isUnlocked = () => key !== null;
export const lock = () => { key = null; };

export async function hasVault() {
  return !!(await rawGet('meta'));
}

async function wrapForPass(raw, pass, check) {
  const salt = rand(16);
  const kek = await deriveKey(pass, salt, ITERATIONS);
  return { salt: b64.to(salt), iterations: ITERATIONS, wrapped: await encrypt(kek, { raw: b64.to(raw) }), check };
}

// Packt mit der Passphrase aus. Tresore von vor der Umstellung haben noch kein "wrapped":
// Dort ist der aus der Passphrase abgeleitete Wert selbst der Tagebuch-Schlüssel.
async function rawFromMeta(pass, meta) {
  try {
    if (meta.wrapped) {
      const kek = await deriveKey(pass, b64.from(meta.salt), meta.iterations);
      return b64.from((await decrypt(kek, meta.wrapped)).raw);
    }
    const raw = await deriveRaw(pass, b64.from(meta.salt), meta.iterations);
    await decrypt(await importRaw(raw), meta.check);
    return raw;
  } catch {
    return null;
  }
}

async function rawFromPass(pass) {
  const meta = await getMeta();
  const raw = await rawFromMeta(pass, meta);
  if (raw && !meta.wrapped) await rawPut('meta', await wrapForPass(raw, pass, meta.check)); // Umstieg: ein einziger, atomarer Schreibvorgang
  return raw;
}

async function rawFromBio() {
  const bio = (await rawGet('bio')).v;
  const output = await readPrf(bio.credId, bio.prfSalt);
  const { raw } = await decrypt(await hkdfKey(output, BIO_INFO), bio.wrapped);
  return b64.from(raw);
}

export async function unlock(pass) {
  const raw = await rawFromPass(pass);
  if (!raw) return false;
  key = await importRaw(raw);
  return true;
}

export async function unlockBio() {
  const raw = await rawFromBio();
  const k = await importRaw(raw);
  await decrypt(k, (await getMeta()).check);
  key = k;
}

// --- Wiederherstellungsschlüssel: 120 Bit Zufall, lesbar in sechs Vierergruppen ---
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Ohne I, L, O, U: schwer zu verwechseln

function encodeCode(bytes) {
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return out.match(/.{4}/g).join('-');
}

function decodeCode(code) {
  const clean = code.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (clean.length !== 24 || [...clean].some((c) => !ALPHABET.includes(c))) return null;
  let bits = '';
  for (const c of clean) bits += ALPHABET.indexOf(c).toString(2).padStart(5, '0');
  return Uint8Array.from(bits.match(/.{8}/g), (b) => parseInt(b, 2));
}

async function wrapForCode(raw) {
  const bytes = rand(15);
  const wrapped = await encrypt(await hkdfKey(bytes, REC_INFO), { raw: b64.to(raw) });
  return { code: encodeCode(bytes), rec: { wrapped } };
}

async function rawFromCode(code, rec, meta) {
  const bytes = decodeCode(code);
  if (!bytes || !rec) return null;
  try {
    const raw = b64.from((await decrypt(await hkdfKey(bytes, REC_INFO), rec.wrapped)).raw);
    await decrypt(await importRaw(raw), meta.check);
    return raw;
  } catch {
    return null;
  }
}

export const hasRecovery = async () => !!(await rawGet('rec'));

// Legt ein neues Tagebuch an und gibt den Wiederherstellungsschlüssel zurück. Er wird nur eingepackt gespeichert.
export async function createVault(pass) {
  const raw = rand(32);
  const k = await importRaw(raw);
  const { code, rec } = await wrapForCode(raw);
  await rawPut('rec', rec);
  await rawPut('meta', await wrapForPass(raw, pass, await encrypt(k, { ok: true })));
  key = k;
  return code;
}

// auth ist { pass } oder { bio: true }. Ergebnis: null, wenn die Passphrase nicht stimmt.
const rawFromAuth = (auth) => (auth.bio ? rawFromBio() : rawFromPass(auth.pass));

export async function changePassphrase(auth, newPass) {
  const raw = await rawFromAuth(auth);
  if (!raw) return false;
  await rawPut('meta', await wrapForPass(raw, newPass, (await getMeta()).check));
  return true;
}

export async function newRecoveryCode(auth) {
  const raw = await rawFromAuth(auth);
  if (!raw) return null;
  const { code, rec } = await wrapForCode(raw);
  await rawPut('rec', rec);
  return code;
}

export async function recoverWithCode(code, newPass) {
  const meta = await getMeta();
  const raw = await rawFromCode(code, (await rawGet('rec'))?.v, meta);
  if (!raw) return false;
  await rawPut('meta', await wrapForPass(raw, newPass, meta.check));
  key = await importRaw(raw);
  return true;
}

// --- Fingerabdruck: Der Schlüssel liegt nur eingepackt im Speicher, auspacken kann ihn nur der Sensor.
export const hasBio = async () => !!(await rawGet('bio'));

// Gibt false zurück, wenn die Passphrase nicht stimmt. Fehler vom Sensor werden weitergereicht.
export async function enableBio(pass) {
  const raw = await rawFromPass(pass);
  if (!raw) return false;
  const { credId, prfSalt, output } = await registerPasskey();
  await rawPut('bio', { credId, prfSalt, wrapped: await encrypt(await hkdfKey(output, BIO_INFO), { raw: b64.to(raw) }) });
  return true;
}

export async function disableBio() {
  const row = await rawGet('bio');
  if (row) forgetPasskey(row.v.credId);
  await clearSecret('bio');
}

// --- Sicherung: enthält nur Verschlüsseltes und öffnet sich mit der Passphrase oder dem
// Wiederherstellungsschlüssel, die beim Erstellen galten. Der Fingerabdruck gehört zum Gerät und fehlt bewusst.
export async function makeBackup() {
  const [meta, rec, settings, entries] = await Promise.all([rawGet('meta'), rawGet('rec'), rawGet('settings'), run('entries', 'readonly', (s) => s.getAll())]);
  return { app: 'tend', format: 1, createdAt: Date.now(), meta: meta.v, rec: rec?.v || null, settings: settings?.v || null, entries };
}

export const isBackup = (b) => b?.app === 'tend' && b.format === 1 && !!b.meta?.check && Array.isArray(b.entries);

// Probiert die Eingabe erst als Passphrase, dann als Wiederherstellungsschlüssel.
export async function openBackup(b, secret) {
  return (await rawFromMeta(secret, b.meta)) || rawFromCode(secret, b.rec, b.meta);
}

// Übernimmt eine Sicherung als neues Tagebuch, wenn auf diesem Gerät noch keines existiert.
export async function adoptBackup(b, raw) {
  const k = await importRaw(raw);
  for (const r of b.entries) await decrypt(k, r.blob); // Erst alles prüfen, dann schreiben
  const d = await db();
  await new Promise((resolve, reject) => {
    const t = d.transaction(['entries', 'kv'], 'readwrite');
    const kv = t.objectStore('kv');
    b.entries.forEach((r) => t.objectStore('entries').put({ id: r.id, blob: r.blob }));
    if (b.rec) kv.put({ k: 'rec', v: b.rec });
    if (b.settings) kv.put({ k: 'settings', v: b.settings });
    kv.put({ k: 'meta', v: b.meta });
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  key = k;
}

// Fügt Einträge aus einer Sicherung hinzu; vorhandene bleiben unangetastet.
export async function mergeBackup(b, raw) {
  const from = await importRaw(raw);
  const have = new Set(await run('entries', 'readonly', (s) => s.getAllKeys()));
  const fresh = b.entries.filter((r) => !have.has(r.id));
  const items = [];
  for (const r of fresh) items.push(await decrypt(from, r.blob));
  for (const e of items) await saveEntry(e);
  return { added: items.length, skipped: b.entries.length - items.length };
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
  const bio = await rawGet('bio');
  if (bio) forgetPasskey(bio.v.credId);
  const d = await db();
  d.close();
  dbp = null;
  await new Promise((resolve) => {
    const r = indexedDB.deleteDatabase('lichtung');
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}
