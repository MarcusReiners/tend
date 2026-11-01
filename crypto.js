// Verschlüsselung: Passphrase -> PBKDF2 -> AES-GCM-Schlüssel (nicht exportierbar)
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64 = {
  to(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
  },
  from(s) {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  },
};

export const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

export async function deriveKey(pass, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// Dieselben Bits wie deriveKey, aber als Rohwert: nötig, um den Schlüssel für den Fingerabdruck einzupacken.
export async function deriveRaw(pass, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, 256));
}

export const importRaw = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

// Macht aus einem Zufallsgeheimnis (Sensor, Wiederherstellungsschlüssel) einen Schlüssel zum Einpacken.
// Kein langsames PBKDF2 nötig: Diese Geheimnisse haben genug Zufall und sind nicht erratbar.
export async function hkdfKey(secret, info) {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode(info) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encrypt(key, obj) {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64.to(iv), ct: b64.to(new Uint8Array(ct)) };
}

export async function decrypt(key, blob) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.from(blob.iv) }, key, b64.from(blob.ct));
  return JSON.parse(dec.decode(pt));
}
