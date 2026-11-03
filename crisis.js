// Eigenständige Sicherheitsschicht: unabhängig von jedem KI-Modell, läuft immer lokal.
// Einfache Muster, bewusst großzügig: lieber ein Hinweis zu viel als einer zu wenig. Sie erkennen nicht alles
// und ersetzen keine fachliche Prüfung. Texte werden vorher vereinheitlicht, Muster stehen daher ohne Umlaute.
const PATTERNS = [
  // Direkt ausgesprochen
  /suizid/, /selbstmord/, /suicid/, /umbringen/, /\bmich (zu |selbst )?toeten/, /das leben nehmen/, /leben (zu )?beenden/,
  /lebensmuede/, /nicht mehr (weiter ?)?leben/, /sterben (will|moechte|wollen|wuerde)/, /(will|moechte) (am liebsten |einfach |nur noch )*sterben/,
  /\b(waere|waer) (ich )?(lieber |am liebsten |doch )*tot\b/, /(lieber|am liebsten) tot/, /\btot sein\b/, /wuensch\w* .{0,20}\btot\b/,
  // Indirekt: nicht mehr da sein, zur Last fallen, nicht mehr aufwachen
  /(will|moechte) (einfach |nur |gar )*nicht mehr (da |hier )?sein/, /nicht mehr (da |hier )?sein (will|moechte)/,
  /\bich\b.{0,30}nicht mehr (da|hier) (waere|bin|sein|war)/, /wenn es mich nicht (mehr )?gaebe/, /(nicht mehr|aufhoeren zu) existieren/,
  /verschwinden (will|moechte)/, /(will|moechte) (einfach |nur |am liebsten )*verschwinden/,
  /ohne mich (\w+ )?(besser|leichter|einfacher|gluecklicher)/, /(allen|anderen|euch|ihnen|meiner familie) (nur )?(zur|eine) last/,
  /nicht mehr aufwachen/, /(einschlafen|einzuschlafen) und nie/, /nie wieder aufwachen/,
  // Ausweglosigkeit, die sich aufs Leben bezieht
  /kein ausweg/, /keinen ausweg/, /alles beenden/, /(allem|dem ganzen|dem allen) ein ende/, /mit allem schluss/, /(sehe|hat alles|macht alles|ist alles) (\w+ )?(keinen|kein) sinn/,
  /kein(en)? sinn (mehr )?(im|in meinem) leben/, /halte (das|es) (alles )?nicht mehr aus/, /(das|es) (alles )?nicht mehr aushalten/,
  // Selbstverletzung und Mittel
  /ritzen/, /geritzt/, /ritze mich/, /selbstverletz/, /mir (et)?was antun/, /mir weh ?tun/, /mir (die|den) (pulsadern|arme?) /, /ueberdosis/, /abschiedsbrief/,
  /mich (auf|er)haengen/, /vor (den|einen) zug/, /von (der|einer) bruecke/, /vom dach spring/,
  // Vorbereitung: Tabletten sammeln oder alle auf einmal nehmen. Oft ohne ein einziges Wort über Tod oder Sterben.
  /(tabletten|pillen|medikamente|schlafmittel)\w* .{0,30}(sammeln|gesammelt|horten|gehortet|bunkern|gebunkert)/,
  /(sammle|sammeln|gesammelt|horte|horten|gehortet|bunkere|bunkern|gebunkert) .{0,30}(tabletten|pillen|medikamente|schlafmittel)/,
  /(alle|ganze[nr]? (packung|schachtel|dose)) .{0,25}(tabletten|pillen|medikamente|schlafmittel)\w* .{0,15}(auf einmal|auf einen schlag|schlucken|geschluckt)/,
  // Englisch
  /kill myself/, /end my life/, /want to die/, /wish i (was|were) dead/, /self[- ]?harm/, /better off without me/, /no reason to live/, /(not|never) wake up/, /don'?t want to (be here|live)/,
  /(stockpil|hoard|saving up|collecting)\w* .{0,20}(pills|meds|medication|tablets)/, /(all|whole bottle of) .{0,15}(pills|meds|tablets) at once/,
];

const normalize = (text) => (text || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/\s+/g, ' ');

export function checkCrisis(text) {
  const t = normalize(text);
  return PATTERNS.some((p) => p.test(t));
}

// Modelle lassen die Nummern mal weg, deshalb hängt Tend sie selbst an, wenn ein Text auffällig war.
const HELP_LINE = 'Du musst damit nicht allein bleiben: Die Telefonseelsorge ist kostenlos und rund um die Uhr erreichbar unter 0800 111 0 111. Bei akuter Gefahr wähle bitte den Notruf 112.';

export function withHelp(reply) {
  return /0800\s*111\s*0\s*(111|222)/.test(reply) && /\b112\b/.test(reply) ? reply : `${reply}\n\n${HELP_LINE}`;
}

export const RESOURCES = [
  { name: 'Notruf', desc: 'Bei akuter Gefahr', tel: '112', label: '112' },
  { name: 'Telefonseelsorge', desc: 'Kostenlos, anonym, rund um die Uhr', tel: '0800 111 0 111', label: '0800 111 0 111' },
  { name: 'Telefonseelsorge', desc: 'Zweite kostenlose Nummer', tel: '0800 111 0 222', label: '0800 111 0 222' },
  { name: 'Telefonseelsorge', desc: 'Dritte kostenlose Nummer', tel: '116123', label: '116 123' },
  { name: 'Kinder- und Jugendtelefon', desc: 'Nummer gegen Kummer, für junge Menschen', tel: '116111', label: '116 111' },
];

export const INTERNATIONAL = { name: 'Hilfe in anderen Ländern', url: 'https://findahelpline.com' };
