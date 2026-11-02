// Auswertung des Hintergrund-Tests: Lief die Antwort weiter, pausierte sie oder brach sie ab?
// events: [{ t, type }] mit hidden/visible/freeze/resume; tokens: Ankunftszeiten der Textstücke in ms seit Start.
// Achtung: Ist die Seite eingefroren, kommen Textstücke erst nach der Rückkehr an. Ein Schwall direkt danach
// heißt dann, dass im Hintergrund weitergerechnet wurde und nur die Anzeige wartete.

export function hiddenSpans(events, end) {
  const spans = [];
  let start = null;
  for (const e of events) {
    if ((e.type === 'hidden' || e.type === 'freeze') && start === null) start = e.t;
    if ((e.type === 'visible' || e.type === 'resume') && start !== null) {
      spans.push([start, e.t]);
      start = null;
    }
  }
  if (start !== null) spans.push([start, end]);
  return spans;
}

export function analyzeBackground({ events, tokens, end, completed, error }) {
  const spans = hiddenSpans(events, end);
  const hiddenMs = spans.reduce((s, [a, b]) => s + (b - a), 0);
  const inSpan = (t) => spans.some(([a, b]) => t >= a && t < b);
  const whileHidden = tokens.filter(inSpan).length;
  // Schwall nach der Rückkehr: Stücke, die in der ersten Sekunde nach dem Sichtbarwerden eintreffen.
  const burst = spans.reduce((n, [, b]) => n + tokens.filter((t) => t >= b && t < b + 1000).length, 0);
  const visibleMs = Math.max(1, end - hiddenMs);
  const visibleRate = (tokens.length - whileHidden - burst) / (visibleMs / 1000);
  const expectedHidden = visibleRate * (hiddenMs / 1000);
  let gap = 0;
  for (let i = 1; i < tokens.length; i++) gap = Math.max(gap, tokens[i] - tokens[i - 1]);

  let verdict;
  if (error) verdict = 'abgebrochen';
  else if (hiddenMs < 15000) verdict = 'zu kurz im Hintergrund';
  else if (expectedHidden > 0 && whileHidden >= expectedHidden * 0.5) verdict = 'lief weiter';
  else if (expectedHidden > 0 && whileHidden + burst >= expectedHidden * 0.5) verdict = 'lief weiter, Anzeige wartete';
  else if (completed) verdict = 'pausierte, lief nach der Rückkehr weiter';
  else verdict = 'unklar';

  return {
    verdict,
    hiddenSec: Math.round(hiddenMs / 100) / 10,
    tokensWhileHidden: whileHidden,
    burstAfterReturn: burst,
    expectedWhileHidden: Math.round(expectedHidden),
    longestGapSec: Math.round(gap / 100) / 10,
    totalSec: Math.round(end / 100) / 10,
  };
}

export const VERDICT_TEXT = {
  'abgebrochen': 'Die Antwort ist im Hintergrund abgebrochen. Eine Web-App reicht dafür nicht.',
  'zu kurz im Hintergrund': 'Tend war nicht lange genug im Hintergrund. Bitte wechsle mindestens 30 Sekunden weg.',
  'lief weiter': 'Die Antwort lief im Hintergrund normal weiter.',
  'lief weiter, Anzeige wartete': 'Im Hintergrund wurde weitergerechnet, angezeigt wurde es erst nach der Rückkehr. Das reicht.',
  'pausierte, lief nach der Rückkehr weiter': 'Im Hintergrund ging es nicht weiter, erst nach der Rückkehr. Du müsstest also in Tend bleiben.',
  'unklar': 'Das Ergebnis ist nicht eindeutig. Bitte wiederhole den Test.',
};
