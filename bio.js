// Fingerabdruck über einen Passkey (WebAuthn mit PRF-Erweiterung).
// Der Sensor gibt nach erfolgreicher Prüfung ein Geheimnis frei, das den Tagebuch-Schlüssel entschlüsselt.
// Der Fingerabdruck selbst verlässt das Gerät nie, und Tend bekommt ihn nie zu sehen.
import { b64, rand } from './crypto.js';

export class BioUnsupported extends Error {}

export async function bioAvailable() {
  if (!window.PublicKeyCredential || !isSecureContext) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

const b64url = (s) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Passkey im Passwortmanager als ungültig melden, soweit der Browser das kann.
export function forgetPasskey(credId) {
  PublicKeyCredential.signalUnknownCredential?.({ rpId: location.hostname, credentialId: b64url(credId) }).catch?.(() => {});
}

export async function readPrf(credId, prfSalt) {
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: rand(32),
      allowCredentials: [{ type: 'public-key', id: b64.from(credId) }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: b64.from(prfSalt) } } },
    },
  });
  const out = cred.getClientExtensionResults().prf?.results?.first;
  if (!out) throw new BioUnsupported('Der Sensor hat kein Geheimnis geliefert.');
  return new Uint8Array(out);
}

export async function registerPasskey() {
  const prfSalt = rand(32);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: rand(32),
      rp: { name: 'Tend' },
      user: { id: rand(16), name: 'Tend', displayName: 'Tend Tagebuch' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  });
  const credId = b64.to(new Uint8Array(cred.rawId));
  const prf = cred.getClientExtensionResults().prf;
  if (prf?.enabled === false || !prf) {
    forgetPasskey(credId);
    throw new BioUnsupported('Dieses Gerät unterstützt das Entsperren per Fingerabdruck hier noch nicht.');
  }
  // Manche Geräte liefern das Geheimnis erst bei der ersten Anmeldung, nicht schon beim Anlegen.
  const output = prf.results?.first ? new Uint8Array(prf.results.first) : await readPrf(credId, b64.to(prfSalt));
  return { credId, prfSalt: b64.to(prfSalt), output };
}
