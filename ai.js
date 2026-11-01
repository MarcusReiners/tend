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
      steps: ['Das ist Mistral Studio. Melde dich an oder lege ein Konto an, der kostenlose Modus ist voreingestellt.', 'Wähle links „API Keys“ und dann „Create new key“.', 'Gib einen Namen und ein Ablaufdatum an, bei „Connector access“ reicht „Shared connectors only“.', 'Kopiere den Schlüssel sofort, er wird nur einmal angezeigt.', 'Füge ihn unten ein und tippe auf „Verbinden und testen“.'],
      note: 'Im kostenlosen Modus kann Mistral deine Anfragen zur Verbesserung seiner Modelle nutzen. Prüfe die aktuellen Bedingungen und überlege dir, welche Einträge du freigibst.',
    },
  },
  geminiGoogle: { label: 'Google-Konto', base: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash', oauth: true },
  ollama: { label: 'Lokal (Ollama)', local: true, base: 'http://localhost:11434', model: 'gemma4:12b' },
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
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 1500)}`);
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

// Antworten kommen als Datenstrom: Ein langer Text sprengt so kein Zeitlimit, nur echtes Stocken zählt.
export const TIMING = { first: 45000, fallback: 30000, between: 30000, retry: 1200 };
const STALL = 'Der KI-Dienst hat nicht rechtzeitig geantwortet. Versuche es gleich noch einmal.';

const PICK = {
  gemini: (j) => (j.candidates?.[0]?.content?.parts || []).map((p) => (p.thought ? '' : p.text || '')).join(''),
  anthropic: (j) => (j.type === 'content_block_delta' ? j.delta?.text || '' : ''),
  openai: (j) => j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? '',
  ollama: (j) => j.message?.content || '',
};

function parseLine(line, pick) {
  const data = line.startsWith('data:') ? line.slice(5).trim() : line;
  if (!data || data === '[DONE]' || !/^[{[]/.test(data)) return '';
  let j;
  try {
    j = JSON.parse(data);
  } catch {
    return '';
  }
  // Fehler können auch mitten im Datenstrom kommen, obwohl die Antwort mit Status 200 begann.
  if (j.error || j.type === 'error') {
    const code = Number(j.error?.code) || (j.error?.type === 'overloaded_error' ? 503 : 500);
    throw new Error(`${code} ${data.slice(0, 1500)}`);
  }
  return pick(j) || '';
}

async function streamPost(url, headers, body, pick, { onText, firstMs = TIMING.first, retries = 1 } = {}) {
  const ctl = new AbortController();
  let timer;
  let stalled = false;
  const arm = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(() => { stalled = true; ctl.abort(); }, ms);
  };
  arm(firstMs);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) {
      const err = new Error(`${res.status} ${(await res.text()).slice(0, 1500)}`);
      if (retries > 0 && isOverload(err)) {
        clearTimeout(timer);
        await new Promise((r) => { setTimeout(r, TIMING.retry); });
        return await streamPost(url, headers, body, pick, { onText, firstMs, retries: retries - 1 });
      }
      throw err;
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    let all = '';
    let text = '';
    const take = (line) => {
      const part = parseLine(line.trim(), pick);
      if (part) { text += part; onText?.(text); }
    };
    for (;;) {
      arm(text ? TIMING.between : firstMs);
      const { value, done } = await reader.read();
      if (done) break;
      all += value;
      buf += value;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        take(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    }
    take(buf);
    if (!text) { // Anbieter ohne Datenstrom schicken alles als ein JSON-Objekt, oft über mehrere Zeilen.
      try { text = pick(JSON.parse(all)) || ''; } catch { /* Bleibt leer und wird unten gemeldet */ }
    }
    return text.trim();
  } catch (e) {
    if (stalled) {
      const err = new Error(STALL);
      err.stalled = true;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Was der Dienst selbst als Grund nennt, im Original und gekürzt.
export function serviceReason(err) {
  const m = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(String(err.message));
  if (!m) return '';
  const first = m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').split(/(?<=\.)\s+(?=[A-ZÄÖÜ])/)[0].slice(0, 160);
  return ` Antwort des Dienstes: „${first}“`;
}

// Übersetzt Fehler in Sätze, nie rohes JSON in die Oberfläche.
export function friendlyError(err) {
  const m = String(err.message);
  const why = serviceReason(err);
  if (isOverload(err)) return 'Der KI-Dienst ist gerade überlastet. Das liegt nicht an dir oder deiner Anmeldung. Versuche es in ein paar Minuten noch einmal.';
  if (/credit balance|insufficient_quota/i.test(m)) return `Bei diesem Anbieter fehlt Guthaben. Der API-Zugang wird dort getrennt von einem Abo abgerechnet.${why}`;
  if (/^429/.test(m)) {
    const wait = /"retryDelay"\s*:\s*"(\d+)/.exec(m);
    return `Der Dienst begrenzt gerade deine Anfragen. Das kann ein Limit pro Minute oder pro Tag sein.${wait ? ` Versuche es in ${wait[1]} Sekunden wieder.` : ''}${why}`;
  }
  if (/^(401|403)/.test(m)) return `Der Zugang wurde abgelehnt. Prüfe deinen Schlüssel oder deine Anmeldung.${why}`;
  if (/^404/.test(m)) return `Dieses Modell gibt es bei dem Anbieter nicht. Du kannst es unter „Erweitert“ ändern.${why}`;
  if (/^400/.test(m)) return `Der Dienst hat die Anfrage abgelehnt.${why}`;
  const code = /^(\d{3}) /.exec(m);
  if (code) return `Der KI-Dienst hat einen Fehler gemeldet (Code ${code[1]}).${why}`;
  if (/fetch|network/i.test(m)) return 'Der KI-Dienst ist nicht erreichbar. Prüfe deine Internetverbindung.';
  return m.slice(0, 160);
}

const orEmpty = (text) => {
  if (!text) throw new Error('Die Antwort war leer, möglicherweise vom Anbieter blockiert. Versuche es noch einmal.');
  return text;
};

// messages: [{role:'user'|'assistant', content}]
export async function askCompanion(cfg, messages, opts = {}) {
  const system = opts.system ?? SYSTEM;
  const maxTokens = opts.maxTokens ?? 400;
  const onText = opts.onText;
  const base = cfg.base.replace(/\/$/, '');
  if (cfg.provider === 'anthropic') {
    return orEmpty(await streamPost(`${base}/v1/messages`, {
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }, { model: cfg.model, max_tokens: maxTokens, system, messages, stream: true }, PICK.anthropic, { onText }));
  }
  if (isGemini(cfg)) {
    const headers = await geminiHeaders(cfg);
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: Math.max(1024, maxTokens * 2) },
    };
    let firstErr;
    const models = [cfg.model, ...(cfg.fallbackModels || [])].slice(0, 3); // Begrenzt die Wartezeit im schlimmsten Fall
    for (const [i, model] of models.entries()) { // Ist ein Modell überlastet oder stockt es, springt ein anderes ein.
      try {
        if (i) onText?.(''); // Angefangenen Text des Vorgängers verwerfen
        return orEmpty(await streamPost(`${base}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, headers, body, PICK.gemini, { onText, firstMs: i ? TIMING.fallback : TIMING.first }));
      } catch (err) {
        firstErr ||= err;
        if (!err.stalled && !isOverload(err) && !/^404 /.test(String(err.message))) throw err;
      }
    }
    throw firstErr;
  }
  if (cfg.provider === 'openai' || cfg.provider === 'mistral') {
    return orEmpty(await streamPost(`${base}/chat/completions`, { authorization: `Bearer ${cfg.apiKey}` },
      { model: cfg.model, max_tokens: maxTokens, stream: true, messages: [{ role: 'system', content: system }, ...messages] }, PICK.openai, { onText }));
  }
  if (cfg.provider === 'ollama') {
    // Ohne Denkphase antworten lokale Modelle in Sekunden statt Minuten, auf 16 GB gemessen. Nicht jedes Modell kennt die Option.
    const body = { model: cfg.model, stream: true, messages: [{ role: 'system', content: system }, ...messages] };
    try {
      return orEmpty(await streamPost(`${base}/api/chat`, {}, { ...body, think: false }, PICK.ollama, { onText }));
    } catch (err) {
      if (err instanceof TypeError) throw new Error('Ollama ist nicht erreichbar. Prüfe, ob es läuft und ob dein Browser den Zugriff auf dieses Gerät erlaubt.');
      if (!/^400 .*think/i.test(String(err.message))) throw err;
      return orEmpty(await streamPost(`${base}/api/chat`, {}, body, PICK.ollama, { onText }));
    }
  }
  throw new Error('Keine Begleitung eingerichtet.');
}
