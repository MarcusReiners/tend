// Der Garten: jeder Eintrag lässt eine Blume wachsen, der Keimling in der Mitte wächst mit. Nichts verwelkt.
import { MOOD_COLORS, plant, growth } from './art.js';

export const MOODS = [
  { v: 1, name: 'Schwer', color: MOOD_COLORS[0] },
  { v: 2, name: 'Gedrückt', color: MOOD_COLORS[1] },
  { v: 3, name: 'Okay', color: MOOD_COLORS[2] },
  { v: 4, name: 'Gut', color: MOOD_COLORS[3] },
  { v: 5, name: 'Leicht', color: MOOD_COLORS[4] },
];

const hash = (s) => {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16; // Durchmischen, sonst clustern ähnliche Schlüssel
  return (h >>> 0) / 4294967295;
};
const f = (n) => n.toFixed(1);

const PAPER = '#FAF4EA'; // Heller Schnittrand, damit Blüten sich von den Hügeln abheben

function head(kind, x, y, color) {
  const edge = `stroke="${PAPER}" stroke-width="1"`;
  if (kind === 1) { // Tulpe
    return `<path d="M${f(x - 9)} ${f(y - 7)} q-2 17 9 19 q11 -2 9 -19 l-5 5 l-4 -8 l-4 8z" fill="${color}" ${edge}/>`;
  }
  let s = '';
  if (kind === 2) { // Pompon
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      s += `<circle cx="${f(x + Math.cos(a) * 7.5)}" cy="${f(y + Math.sin(a) * 7.5)}" r="5" fill="${color}" ${edge}/>`;
    }
    return `${s}<circle cx="${f(x)}" cy="${f(y)}" r="6.5" fill="${color}" ${edge}/>`;
  }
  for (let p = 0; p < 6; p++) { // Margerite
    const a = (p / 6) * Math.PI * 2;
    const px = x + Math.cos(a) * 9;
    const py = y + Math.sin(a) * 9;
    s += `<ellipse cx="${f(px)}" cy="${f(py)}" rx="6.4" ry="4.4" transform="rotate(${f((a * 180) / Math.PI)} ${f(px)} ${f(py)})" fill="${color}" ${edge}/>`;
  }
  return `${s}<circle cx="${f(x)}" cy="${f(y)}" r="4.6" fill="#F4E3BE"/>`;
}

// Farben nach Tageszeit (unabhängig vom System-Theme), gemeinsam für Garten und Baum.
export function skyVars(hour) {
  if (hour < 6 || hour >= 20) return '--sky-top:#2E3654;--sky-bot:#2E3654;--hill1:#4E6272;--hill2:#3B4C5E;--ground:#7A4A3A;--leaf:#C8D3BD;--plant:#EFE6DA;--trunk:#A98B74;--canopy:#4E6272;--canopy2:#3F5563;--tx:#F1E8DC';
  const sky = hour < 8 || hour >= 18 ? '--sky-top:#E7BFA2;--sky-bot:#EFD3B6' : '--sky-top:#DCCDBB;--sky-bot:#E6DACA';
  return `${sky};--hill1:#A9B8A2;--hill2:#7E97A6;--ground:#C9775A;--leaf:#3F5A45;--plant:#3D2C24;--trunk:#6B4A38;--canopy:#A9B8A2;--canopy2:#8FA68A;--tx:#3D2C24`;
}

function sky(hour) {
  const day = hour >= 6 && hour < 20;
  let s = `<rect width="320" height="170" fill="url(#skyg)"/>`;
  if (day) {
    const t = (hour - 6) / 14; // 0..1 über den Tag
    const cx = 40 + t * 240;
    const cy = 66 - Math.sin(t * Math.PI) * 38;
    s += `<circle class="layer" cx="${f(cx)}" cy="${f(cy)}" r="17" fill="#E9A77F"/>`;
    s += `<g class="cloud"><path class="layer" d="M46 40a9 9 0 0 1 2-17 14 14 0 0 1 26-3 11 11 0 0 1 8 20z" fill="#F6EEE1"/></g>`;
    s += `<g class="cloud c2"><path class="layer" d="M214 32a7 7 0 0 1 2-13 11 11 0 0 1 20-2 8 8 0 0 1 6 15z" fill="#F6EEE1"/></g>`;
  } else {
    s += `<g class="layer"><path d="M258 22a19 19 0 1 0 12 32 16 16 0 0 1-12-32z" fill="#EFE6DA"/></g>`;
    for (let i = 0; i < 14; i++) {
      s += `<circle class="star" style="animation-delay:${f(hash('s' + i) * 4)}s" cx="${f(hash('x' + i) * 300 + 10)}" cy="${f(hash('y' + i) * 62 + 8)}" r="${f(hash('r' + i) * 0.9 + 0.5)}" fill="#EFE6DA" opacity=".85"/>`;
    }
  }
  s += `<path class="layer" d="M0 88 q80 -44 160 -14 t160 -16 V170 H0z" fill="var(--hill1)"/><path class="layer" d="M0 112 q90 -32 178 -10 t142 -10 V170 H0z" fill="var(--hill2)"/>`;
  return { day, svg: s };
}

export function gardenSvg(entries, newestId) {
  const hour = new Date().getHours();
  const shown = entries.slice(0, 28).reverse();
  const { day, svg } = sky(hour);
  const W = 320;
  const H = 170;
  const P = skyVars(hour);
  let out = `<svg viewBox="0 0 ${W} ${H}" class="garden" style="${P}" role="img" aria-label="Dein Garten mit ${entries.length} Blumen"><defs><linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sky-top)"/><stop offset="1" stop-color="var(--sky-bot)"/></linearGradient></defs>`;
  out += svg;
  out += `<path class="layer" d="M0 138 q104 -22 196 -6 t124 -6 V170 H0z" fill="var(--ground)"/>`;
  out += plant(160, 146, growth(new Set(entries.map((e) => new Date(e.createdAt).toDateString())).size));
  shown.forEach((e, i) => {
    const r1 = hash(e.id + 'a');
    const r2 = hash(e.id + 'b');
    let x = 18 + ((i + 0.5 + (r1 - 0.5) * 0.7) / shown.length) * (W - 36);
    if (Math.abs(x - 160) < 18) x += x < 160 ? -18 : 18; // Platz für den Keimling in der Mitte
    const h = 38 + r2 * 56;
    const y = H - 14 - r1 * 8;
    const m = MOODS[(e.mood || 3) - 1];
    const kind = Math.floor(hash(e.id + 'k') * 3);
    const fresh = e.id === newestId ? ' fresh' : '';
    const cy = y - h;
    const bend = (r1 - 0.5) * 14;
    out += `<g class="flower${fresh}" data-a="open" data-id="${e.id}" role="button" tabindex="0" aria-label="Eintrag vom ${new Date(e.createdAt).toLocaleDateString('de-DE')}" style="transform-origin:${f(x)}px ${f(y)}px;--d:${f(2.8 + r2 * 2)}s">`;
    out += `<path d="M${f(x)} ${f(y)} q${f(bend)} ${f(-h / 2)} 0 ${f(-h)}" stroke="var(--leaf)" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    out += `<ellipse cx="${f(x + 6)}" cy="${f(y - h * 0.35)}" rx="7.5" ry="3.6" fill="var(--leaf)" transform="rotate(-30 ${f(x + 6)} ${f(y - h * 0.35)})"/>`;
    out += head(kind, x, cy, m.color) + `<circle cx="${f(x)}" cy="${f(cy)}" r="15" fill="transparent"/></g>`;
  });
  if (entries.length >= 3 && day) out += `<g class="butterfly"><path d="M0 0 q-5 -7 -7 -1 q1 5 7 1z M0 0 q5 -7 7 -1 q-1 5 -7 1z" fill="#C9677A"/></g>`;
  if (!day) for (let i = 0; i < 5; i++) out += `<circle class="firefly" style="animation-delay:${f(i * 0.9)}s;left:0" cx="${f(40 + hash('f' + i) * 240)}" cy="${f(100 + hash('v' + i) * 40)}" r="1.8" fill="#F4D9A8"/>`;
  return out + '</svg>';
}

// Tagesimpulse: sanfte Einladungen, nie Pflichten.
export const PROMPTS = [
  'Was war heute ein kleiner Lichtblick?',
  'Was beschäftigt dich, ohne dass du es laut sagst?',
  'Wofür bist du heute dankbar – auch wenn es winzig ist?',
  'Was würdest du einem guten Freund in deiner Lage raten?',
  'Wo spürst du gerade Anspannung im Körper, und was sagt sie dir?',
  'Was brauchst du heute, das du dir noch nicht erlaubt hast?',
  'Woran denkst du, kurz bevor du einschläfst?',
  'Was hat dich in letzter Zeit überrascht – an dir oder anderen?',
  'Was darf heute ausnahmsweise nicht perfekt sein?',
  'Worauf freust du dich, und sei es nur ein bisschen?',
  'Welche Entscheidung schiebst du vor dir her, und warum?',
  'Wer oder was hat dir heute gutgetan?',
];
export const dailyPrompt = () => PROMPTS[Math.floor(Date.now() / 86400000) % PROMPTS.length];

// Die letzten Wochen als Farbpunkte (leer = kein Eintrag, ohne Wertung).
export function weekStrip(entries, days = 28) {
  const byDay = new Map();
  for (const e of entries) {
    const k = new Date(e.createdAt).toDateString();
    byDay.set(k, [...(byDay.get(k) || []), e.mood || 3]);
  }
  let out = '';
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const ms = byDay.get(d.toDateString());
    const label = d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
    if (ms) {
      const avg = Math.round(ms.reduce((a, b) => a + b, 0) / ms.length);
      out += `<i class="pip on" style="background:${MOODS[avg - 1].color}" title="${label}"></i>`;
    } else out += `<i class="pip" title="${label}"></i>`;
  }
  return out;
}
