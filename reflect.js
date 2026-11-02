// Gesprächsabschluss, Themen, Therapie-Vorbereitung und Tendenzen.
import { SYSTEM } from './ai.js';
import { MOODS } from './garden.js';

export const MAX_REPLIES = 3; // Nach so vielen Antworten der Person rundet die Begleitung selbst ab.

export const FLOW_SYSTEM = `${SYSTEM}
Das Gespräch ist auf wenige Runden angelegt; danach runden wir ab. Bohre nicht endlos weiter und stelle keine zweite Frage in einer Antwort.`;

export const CLOSE_SYSTEM = `Du bist eine ruhige, einfühlsame Begleitung für Tagebuch-Reflexion. Du bist kein Therapeut und stellst keine Diagnosen.
Das Gespräch geht jetzt zu Ende. Stelle KEINE Frage mehr. Antworte auf Deutsch exakt in diesem Format, jede Zeile mit ihrem Stichwort:
ABSCHLUSS: <2–3 warme Sätze, die das Wesentliche spiegeln und würdigen>
ERKENNTNIS: <ein Satz in der Ich-Form, den die Person als eigene Erkenntnis ins Tagebuch übernehmen kann>
SCHRITT: <ein sehr kleiner, freiwilliger nächster Schritt – oder: keiner>
THEMEN: <1–3 kurze Themenwörter, kommagetrennt, z. B. Arbeit, Schlaf, Beziehung>
Wenn von Selbstverletzung, Suizid oder akuter Gefahr die Rede war, weise im ABSCHLUSS auf professionelle Hilfe hin (Telefonseelsorge 0800 111 0 111, Notruf 112).`;

export const PREP_SYSTEM = `Du hilfst einer Person, sich auf eine Therapiestunde vorzubereiten. Du bist kein Therapeut und stellst keine Diagnosen.
Aus den folgenden Tagebuch-Auszügen (nur von der Person freigegeben) erstellst du auf Deutsch eine kurze, gut lesbare Zusammenfassung mit diesen Abschnitten:
Wiederkehrende Themen – mit je einem Beispiel
Das könntest du ansprechen – 3 bis 5 Punkte als Stichworte oder Fragen
Was sich verändert hat – Fortschritte oder Auffälliges
Offenes aus der letzten Stunde – falls angegeben
Keine Ratschläge, keine Diagnosen. Sachlich und warm, höchstens 250 Wörter.`;

export function parseClose(raw) {
  const text = raw.replace(/\*\*|__/g, ''); // Manche Modelle setzen die Stichwörter fett: **ABSCHLUSS:**
  const grab = (label) => {
    const m = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n\\s*(?:ABSCHLUSS|ERKENNTNIS|SCHRITT|THEMEN):|$)`, 'i').exec(text);
    return m ? m[1].trim() : '';
  };
  const abschluss = grab('ABSCHLUSS');
  const schritt = grab('SCHRITT');
  const themes = grab('THEMEN').split(/[,;\n]/).map(normTheme).filter(Boolean).slice(0, 3);
  return {
    message: abschluss || text.trim(),
    insight: grab('ERKENNTNIS'),
    step: /^(keiner|keine|-|–)\.?$/i.test(schritt) ? '' : schritt,
    themes,
  };
}

export function normTheme(t) {
  const s = String(t || '').replace(/[.#"„“]/g, '').trim().slice(0, 24);
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

export function addUnique(list, t) {
  const n = normTheme(t);
  if (n && !list.some((x) => x.toLowerCase() === n.toLowerCase())) list.push(n);
  return list;
}

export function themeCounts(items) {
  const map = new Map();
  for (const it of items) for (const t of it.themes || []) map.set(t, (map.get(t) || 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

const dshort = (t) => new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
const clip = (s, n) => (s.length > n ? `${s.slice(0, n).trim()}…` : s);

// Lokale Vorbereitung: funktioniert ohne KI und schickt nichts irgendwohin.
export function localPrep(entries, sessions) {
  const now = Date.now();
  const recent = entries.filter((e) => now - e.createdAt < 30 * 86400000);
  const flagged = entries.filter((e) => e.forTherapy && now - e.createdAt < 60 * 86400000);
  const tc = themeCounts(recent).slice(0, 5);
  const last = sessions[0];
  let t = '';
  t += `Themen der letzten 30 Tage: ${tc.length ? tc.map(([n, c]) => `${n} (${c})`).join(', ') : 'noch keine Themen vergeben'}\n\n`;
  t += 'Das möchte ich ansprechen:\n';
  t += flagged.length ? flagged.map((e) => `• ${dshort(e.createdAt)}: ${clip(e.insight || e.text, 140)}`).join('\n') : '• (Markiere Einträge mit „Für die Therapie merken“, dann erscheinen sie hier.)';
  if (last) t += `\n\nVorhaben aus der letzten Stunde (${dshort(last.createdAt)}):\n${last.plan ? clip(last.plan, 300) : '–'}`;
  return t;
}

// Auszüge für die KI: nur freigegebene Einträge, begrenzt in der Länge.
export function prepInput(entries, sessions) {
  const now = Date.now();
  const ok = entries.filter((e) => e.aiAllowed && now - e.createdAt < 30 * 86400000).slice(0, 25);
  let out = ok.map((e) => `[${dshort(e.createdAt)}, Stimmung: ${MOODS[(e.mood || 3) - 1].name}${e.themes?.length ? `, Themen: ${e.themes.join('/')}` : ''}] ${clip(e.text, 400)}${e.insight ? ` Erkenntnis: ${e.insight}` : ''}`).join('\n');
  const last = sessions[0];
  if (last) out += `\n\nLetzte Therapiestunde (${dshort(last.createdAt)}): ${clip(last.notes || '', 500)} Vorhaben: ${clip(last.plan || '', 300)}`;
  return { text: out.slice(0, 7000), count: ok.length };
}

// Tendenz je Thema: weich formuliert, keine Bewertung, nur Stimmungen aus Einträgen.
export function trend(items) {
  const moods = items.filter((i) => i.mood).sort((a, b) => a.createdAt - b.createdAt).map((i) => i.mood);
  if (moods.length < 3) return { arrow: '·', text: 'Noch zu wenige Einträge für eine Tendenz' };
  const h = Math.floor(moods.length / 2);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const d = avg(moods.slice(-h)) - avg(moods.slice(0, h));
  if (d >= 0.5) return { arrow: '↗', text: 'Zuletzt fühlte es sich leichter an' };
  if (d <= -0.5) return { arrow: '↘', text: 'Zuletzt fühlte es sich etwas schwerer an' };
  return { arrow: '→', text: 'Ähnlich wie zuvor' };
}
