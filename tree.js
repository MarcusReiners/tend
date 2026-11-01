// Der Baum: Stamm = deine Zeit, Äste = Themen, Blätter = Einträge, Früchte = Therapiestunden.
import { MOODS, skyVars } from './garden.js';
import { themeCounts } from './reflect.js';

const f = (n) => n.toFixed(1);
const bez = (p0, p1, p2, t) => {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
};

export const OTHER = 'Ohne Thema';
export const MAX_BRANCHES = 6;

// Ordnet jedes Element dem häufigsten seiner Themen zu, das einen Ast hat.
export function groupByTheme(items) {
  const top = themeCounts(items).slice(0, MAX_BRANCHES).map(([t]) => t);
  const groups = new Map(top.map((t) => [t, []]));
  for (const it of items) {
    const t = (it.themes || []).find((x) => groups.has(x)) || OTHER;
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(it);
  }
  for (const g of groups.values()) g.sort((a, b) => a.createdAt - b.createdAt);
  return groups;
}

const CANOPY = [[160, 92, 74], [92, 128, 58], [228, 128, 58], [122, 62, 46], [198, 62, 46], [160, 150, 70], [64, 178, 38], [256, 178, 38]];

export function treeSvg(items) {
  const groups = [...groupByTheme(items).entries()].filter(([, g]) => g.length);
  const W = 320;
  const H = 340;
  let out = `<svg viewBox="0 0 ${W} ${H}" class="tree" style="${skyVars(new Date().getHours())}" role="img" aria-label="Dein Baum mit ${groups.length} Ästen"><defs><linearGradient id="treesky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sky-top)"/><stop offset="1" stop-color="var(--sky-bot)"/></linearGradient></defs>`;
  out += `<rect width="${W}" height="${H}" fill="url(#treesky)"/><path class="layer" d="M0 306 q160 -26 320 0 V${H} H0z" fill="var(--ground)"/>`;
  out += `<g class="layer">${CANOPY.map(([x, y, r]) => `<circle cx="${x}" cy="${y + 8}" r="${r}" fill="var(--canopy2)"/>`).join('')}</g><g class="layer">${CANOPY.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r - 6}" fill="var(--canopy)"/>`).join('')}</g>`;
  out += `<path d="M142 ${H - 22} C150 262 152 210 153 150 Q160 140 167 150 C168 210 170 262 178 ${H - 22} Q160 ${H - 14} 142 ${H - 22}z" fill="var(--trunk)"/>`;
  if (!groups.length) return out + `<text x="160" y="96" text-anchor="middle" fill="var(--tx)" font-size="13" font-weight="600" font-family="var(--display)">Dein Baum wächst, sobald du</text><text x="160" y="114" text-anchor="middle" fill="var(--tx)" font-size="13" font-weight="600" font-family="var(--display)">deinen Einträgen Themen gibst.</text></svg>`;
  const levels = Math.ceil(groups.length / 2);
  let labels = '';
  groups.forEach(([theme, g], i) => {
    const alone = i === groups.length - 1 && i % 2 === 0; // Ungerader letzter Ast wächst gerade nach oben.
    const dir = i % 2 ? 1 : -1;
    const k = Math.floor(i / 2);
    const deg = alone ? 90 : 12 + ((k + 0.5) / levels) * 62;
    const a = (deg * Math.PI) / 180;
    const p0 = [160, 226 - (i / Math.max(groups.length - 1, 1)) * 72];
    const p2 = [160 + (alone ? 0 : dir * 122 * Math.cos(a)), 150 - 112 * Math.sin(a)];
    const p1 = [p0[0] + (p2[0] - p0[0]) * 0.65, p0[1] - (p0[1] - p2[1]) * 0.25];
    out += `<path d="M${f(p0[0])} ${f(p0[1])} Q${f(p1[0])} ${f(p1[1])} ${f(p2[0])} ${f(p2[1])}" stroke="var(--trunk)" stroke-width="${f(6 - i * 0.5)}" fill="none" stroke-linecap="round"/>`;
    g.forEach((it, n) => {
      const t = g.length === 1 ? 0.75 : 0.32 + (n / (g.length - 1)) * 0.68;
      const [x, y] = bez(p0, p1, p2, t);
      if (it.kind === 'therapy') {
        out += `<g class="leaf" data-a="openSession" data-id="${it.id}" role="button" tabindex="0" aria-label="Therapiestunde"><path d="M${f(x)} ${f(y)} v5" stroke="var(--trunk)" stroke-width="2"/><circle cx="${f(x)}" cy="${f(y + 12)}" r="8.5" fill="#D9A441" stroke="#FAF4EA"/><circle cx="${f(x - 2.6)}" cy="${f(y + 9.4)}" r="2.1" fill="#fff" opacity=".7"/></g>`;
      } else {
        const m = MOODS[(it.mood || 3) - 1];
        const up = n % 2 ? -1 : 1;
        const cy = y + up * 8;
        const rot = dir * (up > 0 ? 28 : -28);
        out += `<g class="leaf" data-a="open" data-id="${it.id}" role="button" tabindex="0" aria-label="Eintrag"><ellipse cx="${f(x)}" cy="${f(cy)}" rx="10.5" ry="6.2" transform="rotate(${rot} ${f(x)} ${f(cy)})" fill="${m.color}" stroke="#FAF4EA"/>${it.insight ? `<circle cx="${f(x)}" cy="${f(cy)}" r="2.4" fill="#FAF4EA"/>` : ''}</g>`;
      }
    });
    const label = theme.length > 14 ? `${theme.slice(0, 13)}…` : theme;
    const w = label.length * 6.1 + 14;
    const lx = Math.min(W - w / 2 - 6, Math.max(w / 2 + 6, p2[0]));
    const ly = Math.max(16, p2[1] - 15);
    labels += `<rect x="${f(lx - w / 2)}" y="${f(ly - 9)}" width="${f(w)}" height="18" rx="4" fill="#FAF4EA"/><text x="${f(lx)}" y="${f(ly + 4)}" text-anchor="middle" fill="#3D2C24" font-size="11" font-weight="600" font-family="var(--display)">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
  });
  return out + labels + '</svg>';
}
