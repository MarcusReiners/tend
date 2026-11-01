// Eigene Bildsprache im Scherenschnitt-Stil: ein Keimling, Stimmungs-Wetter und ruhige Icons, alles inline und offline.
export const MOOD_COLORS = ['#6E8799', '#8E86A3', '#C9A45C', '#D98A5F', '#C9677A'];

const f = (n) => n.toFixed(1);

// Der Keimling: wächst mit jedem Stadium um ein Blattpaar, ab Stadium 6 trägt er eine Knospe.
export function plant(x, y, stage, color = 'var(--plant)') {
  const h = 16 + stage * 12;
  let s = `<path d="M${f(x)} ${f(y)} V${f(y - h)}" stroke="${color}" stroke-width="${f(2.2 + stage * 0.25)}" stroke-linecap="round" fill="none"/>`;
  const pairs = stage + 1;
  for (let i = 0; i < pairs; i++) {
    const ly = y - h + 2 + (i * (h - 8)) / pairs;
    const l = 7 + i * 1.3;
    s += `<path d="M${f(x)} ${f(ly)} q${f(-l)} ${f(-l * 0.1)} ${f(-l * 1.15)} ${f(-l * 0.85)} q${f(l * 1.1)} 0 ${f(l * 1.15)} ${f(l * 0.85)}z M${f(x)} ${f(ly)} q${f(l)} ${f(-l * 0.1)} ${f(l * 1.15)} ${f(-l * 0.85)} q${f(-l * 1.1)} 0 ${f(-l * 1.15)} ${f(l * 0.85)}z" fill="${color}"/>`;
  }
  if (stage >= 6) s += `<circle cx="${f(x)}" cy="${f(y - h - 4)}" r="5.5" fill="#C9775A"/>`;
  return s;
}

// Tage mit Einträgen -> Wachstumsstadium. Es geht nie zurück, solange Einträge bestehen.
export const growth = (n) => [1, 3, 7, 14, 30, 60].filter((t) => n >= t).length;

export const sprout = (size = 24) => `<svg class="sprout" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">${plant(20, 38, 1, 'currentColor')}</svg>`;

const CLOUD = 'M14 35a8 8 0 0 1-.6-16 11 11 0 0 1 21-2 9 9 0 0 1 .6 18z';

// Stimmung als inneres Wetter: ohne Gesichter und ohne Wertung.
export function moodArt(v, size = 44) {
  const c = MOOD_COLORS[v - 1];
  const inner = {
    1: `<path d="${CLOUD}" transform="translate(0 -6)" fill="${c}"/><path d="M16 34l-2 6M25 34l-2 6M34 34l-2 6" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/>`,
    2: `<path d="${CLOUD}" fill="${c}"/>`,
    3: `<circle cx="31" cy="17" r="9" fill="${c}"/><path d="${CLOUD}" transform="translate(-4 3) scale(.92)" fill="#B9AD9C"/>`,
    4: `<circle cx="20" cy="20" r="13" fill="${c}"/><path d="${CLOUD}" transform="translate(21 18) scale(.54)" fill="#B9AD9C"/>`,
    5: `<circle cx="24" cy="24" r="10" fill="${c}"/><path d="M24 5v5M24 38v5M5 24h5M38 24h5M10.6 10.6l3.5 3.5M33.9 33.9l3.5 3.5M37.4 10.6l-3.5 3.5M14.1 33.9l-3.5 3.5" stroke="${c}" stroke-width="2.8" stroke-linecap="round"/>`,
  }[v];
  return `<svg class="weather" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">${inner}</svg>`;
}

const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  sliders: '<path d="M4 7h9M18 7h2M4 17h2M11 17h9"/><circle cx="15.5" cy="7" r="2.5"/><circle cx="8.5" cy="17" r="2.5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  pen: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
  tree: '<path d="M12 21v-9M12 16l-3-2.5M12 14l3-2.5"/><path d="M8 17a5 5 0 0 1-1.2-9.8 5.3 5.3 0 0 1 10.4 0A5 5 0 0 1 16 17"/>',
  talk: '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};

export const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
