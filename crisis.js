// Eigenständige Sicherheitsschicht: unabhängig von jedem KI-Modell, läuft immer lokal.
// Einfache Muster – bewusst großzügig, lieber ein Hinweis zu viel als einer zu wenig.
const PATTERNS = [
  /suizid/, /selbstmord/, /suicid/, /umbringen/, /mich (zu )?töten/, /das leben nehmen/,
  /nicht mehr leben/, /leben beenden/, /lebensmüde/, /sterben (will|möchte|wollen)/,
  /will nicht mehr (da )?sein/, /nicht mehr (da )?sein will/, /verschwinden (will|möchte)/,
  /ritzen/, /selbstverletz/, /mir (et)?was antun/, /mir weh ?tun/, /kein ausweg/, /alles beenden/,
  /kill myself/, /end my life/, /want to die/, /self[- ]?harm/, /suicid/,
];

export function checkCrisis(text) {
  const t = (text || '').toLowerCase();
  return PATTERNS.some((p) => p.test(t));
}

export const RESOURCES = [
  { name: 'Notruf', desc: 'Bei akuter Gefahr', tel: '112', label: '112' },
  { name: 'Telefonseelsorge', desc: 'Kostenlos, anonym, rund um die Uhr', tel: '0800 111 0 111', label: '0800 111 0 111' },
  { name: 'Telefonseelsorge (2)', desc: 'Zweite kostenlose Nummer', tel: '0800 111 0 222', label: '0800 111 0 222' },
  { name: 'Nummer gegen Kummer', desc: 'Erwachsene, 116 123 (Deutschland)', tel: '116123', label: '116 123' },
  { name: 'Kinder- und Jugendtelefon', desc: 'Für junge Menschen', tel: '116111', label: '116 111' },
];

export const INTERNATIONAL = { name: 'Hilfe in anderen Ländern', url: 'https://findahelpline.com' };
