// KI-Anbindung: der Nutzer entscheidet, wohin (oder ob) Text gesendet wird.
import { GOOGLE } from './config.js';

export const PROVIDERS = {
  off: { label: 'Aus' },
  gemini: {
    label: 'Gemini-Schlüssel', base: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash', needsKey: true,
    guide: {
      url: 'https://aistudio.google.com/apikey', host: 'aistudio.google.com/apikey',
      steps: ['Öffne die Seite und melde dich an.', 'Tippe auf „Create API key“ und kopiere den Schlüssel.', 'Füge ihn unten ein und tippe auf „Verbinden und testen“.'],
      note: 'Beim kostenlosen Tarif darf Google eingesendete Texte nach seinen Bedingungen auch zur Verbesserung seiner Produkte nutzen. Prüfe die aktuellen Bedingungen.',
    },
  },
  mistral: {
    label: 'Mistral', base: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', needsKey: true,
    guide: {
      url: 'https://console.mistral.ai/', host: 'console.mistral.ai',
      steps: ['Öffne die Seite und lege ein Konto an. Mistral bestätigt es per Telefonnummer.', 'Aktiviere unter „Subscriptions“ den kostenlosen Tarif „Experiment“.', 'Erstelle in deinem Workspace unter „API Keys“ einen Schlüssel und kopiere ihn.', 'Füge ihn unten ein und tippe auf „Verbinden und testen“.'],
      note: 'Im kostenlosen Tarif darf Mistral deine Anfragen zur Verbesserung seiner Modelle nutzen. Überlege dir, welche Einträge du freigibst, oder nutze einen bezahlten Tarif. Prüfe die aktuellen Bedingungen.',
    },
  },
  geminiGoogle: { label: 'Google-Konto', base: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash', oauth: true },
  ollama: { label: 'Lokal (Ollama)', local: true, base: 'http://localhost:11434', model: 'gemma3:4b' },
  anthropic: { label: 'Anthropic', base: 'https://api.anthropic.com', model: 'claude-haiku-5-5', needsKey: true },
  openai: { label: 'OpenAI-kompatibel', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', needsKey: true },
};

export const SYSTEM = `Du bist eine ruhige, einfühlsame Begleitung für Tagebuch-Reflexion. Du bist kein Therapeut und stellst keine Diagnosen.
Antworte auf Deutsch in höchstens 2–4 kurzen Sätzen. Spiegele zuerst knapp, was du gehört hast, und stelle dann genau EINE offene Frage, die behutsam tiefer führt.
Gib keine ungefragten Ratschläge. Wenn die Person um Rat bittet, biete vorsichtige Anregungen statt Anweisungen. Bestätige nicht einfach alles – sei freundlich, aber ehrlich.
Wenn jemand von Selbstverletzung, Suizid oder akuter Gefahr schreibt, bleibe warm, nimm es ernst und weise auf professionelle Hilfe hin (Telefonseelsorge 0800 111 0 111, Notruf 112).`;

// --- Google-Anmeldung (Experiment): Token nur im Arbeitsspeicher, nie gespeichert ---
const gToken = { value: '', exp: 0 };
const isGemini = (cfg) => cfg.provider === 'gemini' || cfg.provider === 'geminiGoogle';

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Die Google-Anmeldung konnte nicht geladen werden (offline?)'));
    document.head.appendChild(s);
  });
}

export async function googleToken(cfg) {
  if (gToken.value && Date.now() < gToken.exp - 60000) return gToken.value;
  const clientId = cfg.clientId || GOOGLE.clientId;
  if (!clientId) throw new Error('Für die Google-Anmeldung fehlt die Client-ID (siehe Erweitert).');
  await loadGis();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Die Anmeldung wurde nicht abgeschlossen. Erlaube Popups für diese Seite und tippe erneut auf den Knopf.')), 90000);
    const done = (fn) => (v) => { clearTimeout(timer); fn(v); };
    resolve = done(resolve);
    reject = done(reject);
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE.scope,
      callback: (r) => {
        if (r.error) return reject(new Error(`Anmeldung abgebrochen oder abgelehnt (${r.error})`));
        gToken.value = r.access_token;
        gToken.exp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
        resolve(gToken.value);
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Das Google-Fenster wurde geschlossen, bevor die Anmeldung fertig war.'
        : e.type === 'popup_failed_to_open' ? 'Das Google-Fenster konnte nicht öffnen. Erlaube Popups für diese Seite und versuche es noch einmal.'
          : `Anmeldung nicht möglich (${e.type || 'unbekannt'}).`)),
    });
    client.requestAccessToken();
  });
}

export const googleSignOut = () => {
  if (gToken.value) window.google?.accounts?.oauth2?.revoke(gToken.value, () => {});
  gToken.value = '';
  gToken.exp = 0;
};

async function geminiHeaders(cfg) {
  if (cfg.provider !== 'geminiGoogle') return { 'x-goog-api-key': cfg.apiKey };
  const project = cfg.projectId || GOOGLE.projectId;
  return { authorization: `Bearer ${await googleToken(cfg)}`, ...(project ? { 'x-goog-user-project': project } : {}) };
}

// Erkennt den Anbieter am Schlüssel-Präfix, damit Einsteiger nichts auswählen müssen.
export function detectProvider(key) {
  const k = (key || '').trim();
  if (k.length < 20) return null;
  if (k.startsWith('AIza')) return 'gemini';
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('sk-')) return 'openai';
  return null;
}

// Fragt bei Google die verfügbaren Modelle ab und nimmt das neueste stabile Flash-Modell.
export async function pickGeminiModel(cfg) {
  const res = await fetch(`${cfg.base.replace(/\/$/, '')}/v1beta/models?pageSize=200`, { headers: await geminiHeaders(cfg), signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const { models = [] } = await res.json();
  const best = models
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => /^models\/(gemini-(\d+(?:\.\d+)?)-flash(-lite)?)$/.exec(m.name))
    .filter(Boolean)
    .sort((a, b) => Number(!!a[3]) - Number(!!b[3]) || parseFloat(b[2]) - parseFloat(a[2])) // Volle Modelle zuerst, je neuestes vorn
    .map((m) => m[1]);
  cfg.fallbackModels = best.slice(1, 4);
  return best[0] || null;
}

export function isLocalUrl(u) {
  try {
    const h = new URL(u).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  } catch {
    return false;
  }
}

export const sendsOffDevice = (cfg) => cfg.provider !== 'off' && !isLocalUrl(cfg.base);

const isOverload = (err) => /^(500|502|503|504) /.test(String(err.message));

// Überlastung ist bei KI-Diensten normal und meist kurz: einmal kurz warten und erneut versuchen.
async function post(url, headers, body, retries = 1) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error('Der KI-Dienst hat nach 60 Sekunden nicht geantwortet. Versuche es gleich noch einmal.');
    throw e;
  }
  if (!res.ok) {
    const err = new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    if (retries > 0 && isOverload(err)) {
      await new Promise((r) => { setTimeout(r, 1200); });
      return post(url, headers, body, retries - 1);
    }
    throw err;
  }
  return res.json();
}

// Übersetzt Fehler in Sätze, nie rohes JSON in die Oberfläche.
export function friendlyError(err) {
  const m = String(err.message);
  if (isOverload(err)) return 'Der KI-Dienst ist gerade überlastet. Das liegt nicht an dir oder deiner Anmeldung. Versuche es in ein paar Minuten noch einmal.';
  if (/^429/.test(m)) return 'Das Kontingent ist gerade aufgebraucht. Versuche es später noch einmal.';
  if (/^(400|401|403)/.test(m)) return 'Der KI-Dienst hat den Zugriff abgelehnt. Prüfe deine Verbindung in den Einstellungen.';
  const code = /^(\d{3}) /.exec(m);
  if (code) return `Der KI-Dienst hat einen Fehler gemeldet (Code ${code[1]}).`;
  if (/fetch|network/i.test(m)) return 'Der KI-Dienst ist nicht erreichbar. Prüfe deine Internetverbindung.';
  return m.slice(0, 160);
}

// messages: [{role:'user'|'assistant', content}]
export async function askCompanion(cfg, messages, opts = {}) {
  const system = opts.system ?? SYSTEM;
  const maxTokens = opts.maxTokens ?? 400;
  const base = cfg.base.replace(/\/$/, '');
  if (cfg.provider === 'anthropic') {
    const r = await post(`${base}/v1/messages`, {
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }, { model: cfg.model, max_tokens: maxTokens, system, messages });
    return r.content.map((c) => c.text || '').join('').trim();
  }
  if (isGemini(cfg)) {
    const headers = await geminiHeaders(cfg);
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: Math.max(1024, maxTokens * 2) },
    };
    let firstErr;
    for (const model of [cfg.model, ...(cfg.fallbackModels || [])]) { // Ist ein Modell überlastet, springt ein anderes ein.
      try {
        const r = await post(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, headers, body);
        const text = (r.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
        if (!text) throw new Error('Die Antwort war leer, möglicherweise von Google blockiert.');
        return text;
      } catch (err) {
        firstErr ||= err;
        if (!isOverload(err) && !/^404 /.test(String(err.message))) throw err;
      }
    }
    throw firstErr;
  }
  if (cfg.provider === 'openai' || cfg.provider === 'mistral') {
    const r = await post(`${base}/chat/completions`, { authorization: `Bearer ${cfg.apiKey}` },
      { model: cfg.model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...messages] });
    return r.choices[0].message.content.trim();
  }
  if (cfg.provider === 'ollama') {
    const r = await post(`${base}/api/chat`, {},
      { model: cfg.model, stream: false, messages: [{ role: 'system', content: system }, ...messages] });
    return r.message.content.trim();
  }
  throw new Error('Keine Begleitung eingerichtet.');
}
