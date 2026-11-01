// Läuft vor der App und bewusst ohne Module: So bleibt sie funktionsfähig, auch wenn die App selbst nicht starten kann.
// Ohne HTTPS gibt der Browser die Verschlüsselung nicht frei; nur die lokale Entwicklung darf ohne laufen.
if (location.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
  location.replace(`https://${location.host}${location.pathname}${location.search}`);
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    // Neue Versionen auch dann bemerken, wenn der Tab lange offen bleibt.
    const check = () => { if (!document.hidden) reg.update().catch(() => {}); };
    setInterval(check, 5 * 60000);
    window.addEventListener('focus', check);
  }).catch(() => {});
}

// Gemischte Versionen aus dem Browser-Zwischenspeicher lassen Module abstürzen.
// Dann einmalig alle geladenen Dateien frisch holen und neu laden; das Tagebuch bleibt davon unberührt.
window.addEventListener('error', (e) => {
  if (!/SyntaxError/.test(e.message)) return;
  let again = false;
  try {
    again = sessionStorage.getItem('tend-repaired') === '1';
    sessionStorage.setItem('tend-repaired', '1');
  } catch { /* Ohne sessionStorage trotzdem einmal versuchen */ }
  if (again) return;
  const files = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => n.startsWith(location.origin));
  Promise.allSettled(files.map((f) => fetch(f, { cache: 'reload' }))).then(() => location.reload());
});
