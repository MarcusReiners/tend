import * as vault from './vault.js';
import { checkCrisis, RESOURCES, INTERNATIONAL } from './crisis.js';
import { GOOGLE, VERSION } from './config.js';
import { PROVIDERS, askCompanion, sendsOffDevice, detectProvider, pickGeminiModel, googleSignOut, googleToken, friendlyError, serviceReason } from './ai.js';
import { MOODS, gardenSvg, dailyPrompt, weekStrip } from './garden.js';
import { MAX_REPLIES, FLOW_SYSTEM, CLOSE_SYSTEM, PREP_SYSTEM, parseClose, addUnique, themeCounts, localPrep, prepInput, trend } from './reflect.js';
import { treeSvg, groupByTheme } from './tree.js';
import { icon, moodArt, sprout } from './art.js';
import { bioAvailable, BioUnsupported } from './bio.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const modal = $('#modal');
const cover = $('#cover');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (t, long) => new Date(t).toLocaleDateString('de-DE', long ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' });
const DEFAULTS = { provider: 'off', base: '', model: '', apiKey: '', clientId: '', projectId: '', consent: '', autoLockMin: 2, aiDefault: false };

const state = { view: 'boot', hasVault: false, entries: [], sessions: [], preps: [], sess: null, prep: null, settings: { ...DEFAULTS }, entry: null, draft: null, newestId: null, busy: false, last: Date.now(), hiddenAt: 0, notice: '', connecting: '', connectRun: 0, testMsg: '' };

/* ---------- Gerüst ---------- */
const typing = () => `<div class="bubble ai typing">${esc(state.busyMsg || '…denkt nach')}</div>`;
const bar = (back) => `<div class="top">${back ? `<button class="icon-btn" data-a="home" aria-label="Zurück">${icon('back')}</button>` : `<span class="brand">${sprout(24)}Tend</span>`}
  <div class="icons"><button class="help-btn" data-a="help">${icon('heart')}Hilfe</button>${vault.isUnlocked() ? `<button class="icon-btn" data-a="settings" aria-label="Einstellungen">${icon('sliders')}</button><button class="icon-btn" data-a="lock" aria-label="Sperren">${icon('lock')}</button>` : ''}</div></div>`;

function render() {
  const v = { lock: vLock, home: vHome, mood: vMood, breath: vBreath, write: vWrite, done: vDone, entry: vEntry, settings: vSettings, tree: vTree, therapy: vTherapy, prep: vPrep, session: vSession }[state.view];
  document.body.dataset.view = state.view;
  app.innerHTML = v ? v() : '';
  const f = app.querySelector('[autofocus]');
  if (f) f.focus();
  if (state.view === 'entry') { const t = app.querySelector('.thread'); t?.lastElementChild?.scrollIntoView({ block: 'nearest' }); }
}

function showModal(html) {
  modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  modal.hidden = false;
}
const closeModal = () => { modal.hidden = true; modal.innerHTML = ''; };

function helpHtml(urgent) {
  return `<h2>${urgent ? 'Du bist nicht allein' : 'Hilfe, wenn du sie brauchst'}</h2>
  <p class="soft">${urgent ? 'Was du schreibst, klingt sehr schwer. Bitte sprich jetzt mit einem Menschen – diese Stellen sind kostenlos und für dich da:' : 'Diese Stellen sind kostenlos und erreichbar. Tend ist kein Ersatz für Therapie oder Notfallhilfe.'}</p>
  ${RESOURCES.map((r) => `<a class="help-item" href="tel:${r.tel.replace(/\s/g, '')}"><span><strong>${r.name}</strong><br><span class="small soft">${r.desc}</span></span><b>${r.label}</b></a>`).join('')}
  <a class="help-item" href="${INTERNATIONAL.url}" target="_blank" rel="noopener noreferrer"><span><strong>${INTERNATIONAL.name}</strong><br><span class="small soft">findahelpline.com</span></span><b>↗</b></a>
  <button class="btn ghost block" data-a="closeModal" style="margin-top:8px">${urgent ? 'Ich habe es gelesen' : 'Schließen'}</button>`;
}

/* ---------- Ansichten ---------- */
function vLock() {
  const first = !state.hasVault;
  return `<div class="lock stack center">
    ${gardenSvg([], null)}<h1>Tend</h1>
    <p class="soft">${first ? 'Dein Tagebuch bleibt auf diesem Gerät und wird verschlüsselt. Wähle eine Passphrase – nur du kennst sie.' : 'Schön, dass du da bist.'}</p>
    ${state.bioOn && state.bioAvail ? `<button class="btn block" data-a="bioUnlock">${icon('finger')}Mit Fingerabdruck öffnen</button><p class="small soft" style="margin:0">oder mit deiner Passphrase</p>` : ''}
    <form id="lockForm" class="stack" autocomplete="off">
      <div class="pw-wrap"><input type="password" id="pw" placeholder="Passphrase" autocomplete="${first ? 'new-password' : 'current-password'}" required autofocus><button class="pw-toggle" type="button" data-a="togglePw">Anzeigen</button></div>
      ${first ? '<input type="password" id="pw2" placeholder="Passphrase wiederholen" autocomplete="new-password" required>' : ''}
      <p id="capsHint" class="small soft" style="margin:0" hidden>Die Feststelltaste ist aktiv.</p>
      <p id="lockErr" class="small" style="color:var(--danger);min-height:1.2em" role="alert"></p>
      <button class="btn ${state.bioOn && state.bioAvail ? 'ghost' : ''} block" type="submit">${first ? 'Tagebuch anlegen' : 'Öffnen'}</button>
    </form>
    ${first ? '<p class="small soft">Mindestens 8 Zeichen, ein ganzer Satz ist am besten. Niemand außer dir kann sie zurückholen. Als Nächstes bekommst du dafür einen Wiederherstellungsschlüssel.</p>' : ''}
    <button class="btn ghost" data-a="help">Ich brauche gerade Hilfe</button>
    <div><button class="link-btn" data-a="${first ? 'restoreStart' : 'forgot'}">${first ? 'Aus Sicherung wiederherstellen' : 'Passphrase vergessen?'}</button></div>
  </div>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
}

// Dezente Erinnerung: nur wenn es neue Einträge gibt und die letzte Sicherung zwei Wochen zurückliegt.
function backupDue() {
  const last = state.settings.lastBackupAt || 0;
  return Date.now() - last > 14 * 86400000 && state.entries.some((e) => e.createdAt > last);
}

function vHome() {
  const days = new Set(state.entries.map((e) => new Date(e.createdAt).toDateString())).size;
  const list = state.entries.slice(0, 12).map((e) => `<li><button class="entry" data-a="open" data-id="${e.id}">
    ${moodArt(e.mood || 3, 40)}
    <span><span class="date">${fmt(e.createdAt)}</span><span class="snippet" style="display:-webkit-box">${esc(e.text)}</span></span></button></li>`).join('');
  return `${bar()}
  <div class="hero">${gardenSvg(state.entries, state.newestId)}
    <h1>${greeting()}.</h1>
    <p class="soft">${state.entries.length ? `${state.entries.length} ${state.entries.length === 1 ? 'Blume' : 'Blumen'} in deinem Garten ·${days} ${days === 1 ? 'Tag' : 'Tage'}, an denen du dir Zeit genommen hast` : 'Dein Garten wartet auf die erste Blume.'}</p>
    <button class="btn" data-a="write">${icon('pen')}Ins Tagebuch schreiben</button>
  </div>
  <div class="navcards"><button class="navcard sage" data-a="tree">${icon('tree')}Dein Baum</button><button class="navcard blue" data-a="therapy">${icon('talk')}Therapie</button></div>
  ${!state.hasRec ? '<button class="prompt blue" data-a="newCode"><span class="tag">Für den Fall der Fälle</span><div class="q">Wiederherstellungsschlüssel einrichten</div></button>' : ''}
  ${backupDue() ? '<button class="prompt" data-a="backup"><span class="tag">Neue Einträge seit der letzten Sicherung</span><div class="q">Sicherung erstellen</div></button>' : ''}
  ${!isConnected(state.settings) ? (canGoogle() ? '<button class="prompt blue" data-a="googleConnect"><span class="tag">Begleitung einrichten</span><div class="q">Mit Google anmelden</div></button><div class="center"><button class="link-btn" data-a="settings">Andere Möglichkeiten</button></div>' : '<button class="prompt blue" data-a="setupAi"><span class="tag">Optional</span><div class="q">Begleitung einrichten</div></button>') : ''}
  <button class="prompt" data-a="promptWrite"><span class="tag">Impuls für heute</span><div class="q">${esc(dailyPrompt())}</div></button>
  ${state.entries.length ? `<div class="sep"></div><h3 class="soft">Deine letzten Wochen</h3><div class="strip" aria-label="Farbpunkte der letzten 28 Tage">${weekStrip(state.entries)}</div>
  <div class="sep"></div><h3 class="soft">Zuletzt</h3><ul class="entries">${list}</ul>` : ''}`;
}

function vMood() {
  return `${bar(true)}<div class="center stack"><h2>Wie geht es dir gerade?</h2><p class="soft">Es gibt keine falsche Antwort.</p>
  <div class="moods">${MOODS.map((m) => `<button class="mood ${state.draft?.mood === m.v ? 'on' : ''}" data-a="mood" data-v="${m.v}">${moodArt(m.v, 46)}${m.name}</button>`).join('')}</div>
  <button class="btn ghost" data-a="skipMood">Überspringen</button></div>`;
}

function vBreath() {
  return `${bar(true)}<div class="center"><h2>Komm kurz an</h2><p class="soft">Ein paar ruhige Atemzüge, wenn du magst.</p>
  <div class="breath-wrap" aria-hidden="true"><div class="ring r1"></div><div class="ring r2"></div><div class="ring r3"></div>${sprout(56)}</div>
  <div class="breath-text" aria-hidden="true"><span class="lbl">einatmen</span><span class="lbl out">ausatmen</span></div>
  <button class="btn" data-a="toWrite">Ich bin bereit</button></div>`;
}

function vWrite() {
  const d = state.draft;
  return `${bar(true)}<div class="paper"><div class="date">${fmt(Date.now(), true)}</div>
    <textarea id="text" placeholder="${esc(state.prompt || 'Was liegt dir auf dem Herzen?')}" autofocus aria-label="Tagebucheintrag">${esc(d.text)}</textarea></div>
  <div class="stack" style="margin-top:16px">
    <label class="check"><input type="checkbox" id="aiok" ${d.ai ? 'checked' : ''} ${state.settings.provider === 'off' ? 'disabled' : ''}>
      <span>Die Begleitung darf diesen Eintrag lesen.<br><span class="small soft">${state.settings.provider === 'off' ? 'Aktuell ist keine Begleitung eingerichtet (siehe Einstellungen).' : sendsOffDevice(state.settings) ? 'Beim Fragen wird dieser Text an deinen gewählten Anbieter gesendet.' : 'Bleibt auf deinem Rechner.'}</span></span></label>
    <p class="small soft">Dein Entwurf wird verschlüsselt zwischengespeichert.</p></div>
  <div class="sticky-actions row"><button class="btn" data-a="save">Fertig</button><button class="btn ghost" data-a="home">Später weiter</button></div>`;
}

function vDone() {
  const e = state.entry;
  const canAsk = e.aiAllowed && state.settings.provider !== 'off';
  return `${bar()}<div class="hero stack">${gardenSvg(state.entries, state.newestId)}
    <h1>Eine neue Blume.</h1><p class="soft">Danke, dass du dir die Zeit genommen hast. Das ist schon etwas.</p>
    ${canAsk ? '<button class="btn" data-a="open" data-id="' + e.id + '" data-ask="1">Gemeinsam darüber nachdenken</button>' : ''}
    <button class="btn ghost" data-a="home">Zurück zum Garten</button></div>`;
}

const themeChips = (list) => `<div class="chips">${list.map((t) => `<button class="chip" type="button" data-a="rmTheme" data-t="${esc(t)}" aria-label="Thema ${esc(t)} entfernen">${esc(t)} ×</button>`).join('')}</div>`;

function themesBlock(obj) {
  const known = themeCounts([...state.entries, ...state.sessions]).map(([t]) => t).filter((t) => !(obj.themes || []).includes(t)).slice(0, 8);
  return `<div class="card stack"><h3>Themen</h3>${(obj.themes || []).length ? themeChips(obj.themes) : '<p class="small soft" style="margin:0">Noch kein Thema vergeben.</p>'}
    <form id="themeForm" class="row" style="flex-wrap:nowrap"><input type="text" id="themeIn" placeholder="Neues Thema" maxlength="24" autocomplete="off"><button class="btn ghost" type="submit" aria-label="Thema hinzufügen" style="padding:12px 18px">+</button></form>
    ${known.length ? `<div class="chips">${known.map((t) => `<button class="chip ghost" type="button" data-a="addTheme" data-t="${esc(t)}">+ ${esc(t)}</button>`).join('')}</div>` : ''}
    <p class="small soft" style="margin:0">Themen bilden die Äste deines Baums.</p></div>`;
}

function vEntry() {
  const e = state.entry;
  const m = MOODS[(e.mood || 3) - 1];
  const ready = state.settings.provider !== 'off';
  const th = e.thread || [];
  const replies = th.filter((t) => t.role === 'user').length;
  const open = ready && e.aiAllowed && th.length && !e.closed;
  return `${bar(true)}
  <div class="paper"><div class="date">${fmt(e.createdAt, true)} · <span style="color:${m.color}">●</span> ${m.name}</div><div class="read">${esc(e.text)}</div></div>
  <div class="stack" style="margin-top:18px">
    ${state.notice ? `<div class="notice" role="alert">${esc(state.notice)}</div>` : ''}
    ${ready ? `<label class="check"><input type="checkbox" data-a="toggleAi" ${e.aiAllowed ? 'checked' : ''}><span>Die Begleitung darf diesen Eintrag lesen.</span></label>` : `<p class="small soft" style="margin-bottom:8px">Noch keine Begleitung eingerichtet.</p>${canGoogle() ? '<button class="btn ghost" data-a="googleConnect">Mit Google anmelden</button>' : '<button class="btn ghost" data-a="settings">Einrichten</button>'}`}
    ${th.length ? `<div class="thread">${th.map((t) => `<div class="bubble ${t.role === 'assistant' ? 'ai' : 'me'}${t.final ? ' final' : ''}">${esc(t.content)}</div>`).join('')}${state.busy ? typing() : ''}</div>` : (state.busy ? typing() : '')}
    ${ready && e.aiAllowed && !th.length && !state.busy ? '<button class="btn" data-a="ask">Begleitung um eine Frage bitten</button>' : ''}
    ${open ? `<form id="replyForm" class="row" style="flex-wrap:nowrap"><input type="text" id="reply" value="${esc(state.replyDraft || '')}" placeholder="Antworten…" autocomplete="off" ${state.busy ? 'disabled' : ''}><button class="btn" type="submit" ${state.busy ? 'disabled' : ''}>Senden</button></form>
      <div class="row" style="justify-content:space-between"><button class="btn ghost" data-a="closeChat" ${state.busy ? 'disabled' : ''}>Zum Abschluss kommen</button><span class="small soft">Antwort ${Math.min(replies, MAX_REPLIES)} von ${MAX_REPLIES}</span></div>` : ''}
    ${e.closed && ready && e.aiAllowed ? '<button class="btn ghost" data-a="reopenChat">Noch weiterreden</button>' : ''}
    <div class="card stack"><h3>Meine Erkenntnis</h3>
      <textarea class="plain" id="insight" rows="3" placeholder="Was nimmst du aus diesem Eintrag mit? (optional)">${esc(e.insight || '')}</textarea>
      <p class="small soft" style="margin:0">Wird mit dem Eintrag gespeichert und erscheint im Baum.</p></div>
    ${themesBlock(e)}
    <label class="check"><input type="checkbox" data-a="toggleTherapy" ${e.forTherapy ? 'checked' : ''}><span>Für die Therapie merken<br><span class="small soft">Taucht in deiner Vorbereitung auf die nächste Stunde auf.</span></span></label>
    <div class="sep"></div>
    <button class="btn ghost" data-a="delEntry">Eintrag löschen</button>
  </div>`;
}

function listItems(arr, action, color) {
  return arr.map((s) => `<li><button class="entry" data-a="${action}" data-id="${s.id}"><span class="dot" style="background:${color}"></span><span><span class="date">${fmt(s.createdAt)}</span><span class="snippet" style="display:-webkit-box">${esc(s.notes || s.plan || s.text || '')}</span></span></button></li>`).join('');
}

function vTherapy() {
  return `${bar(true)}<h2>Therapie</h2><p class="soft small">Ein Raum, um Stunden vorzubereiten und festzuhalten, was du mitnimmst. Tend ersetzt keine Therapie.</p>
  <div class="stack"><button class="btn block" data-a="newPrep">Nächste Stunde vorbereiten</button><button class="btn ghost block" data-a="newSession">Stunde eintragen</button></div>
  ${state.preps.length ? `<div class="sep"></div><h3 class="soft">Vorbereitungen</h3><ul class="entries">${listItems(state.preps.slice(0, 3), 'openPrep', 'var(--accent)')}</ul>` : ''}
  ${state.sessions.length ? `<div class="sep"></div><h3 class="soft">Bisherige Stunden</h3><ul class="entries">${listItems(state.sessions, 'openSession', '#D9A441')}</ul>` : ''}`;
}

function vPrep() {
  const p = state.prep;
  const ready = state.settings.provider !== 'off';
  const saved = state.preps.some((x) => x.id === p.id);
  return `${bar(true)}<h2>Vorbereitung</h2><p class="small soft">${fmt(p.createdAt, true)}. Der Text unten entsteht lokal aus deinen Themen und den Einträgen, die du für die Therapie gemerkt hast. Du kannst ihn frei bearbeiten.</p>
  <div class="stack">
    ${state.notice ? `<div class="notice" role="alert">${esc(state.notice)}</div>` : ''}
    <textarea class="plain" id="prep-text" rows="14" aria-label="Vorbereitung">${esc(p.text)}</textarea>
    ${ready ? `<button class="btn ghost block" data-a="aiPrep" ${state.busy ? 'disabled' : ''}>${state.busy ? esc(state.busyMsg || '…denkt nach') : 'Von der Begleitung zusammenfassen lassen'}</button>
    <p class="small soft" style="margin:0">Gesendet werden nur Einträge der letzten 30 Tage, die du für die Begleitung freigegeben hast${sendsOffDevice(state.settings) ? ' – an deinen gewählten Anbieter' : ''}.</p>` : ''}
    <div class="row"><button class="btn" data-a="savePrep">Speichern</button><button class="btn ghost" data-a="copyPrep">Kopieren</button>${saved ? '<button class="btn ghost" data-a="delPrep">Löschen</button>' : ''}</div>
  </div>`;
}

function vSession() {
  const s = state.sess;
  const saved = state.sessions.some((x) => x.id === s.id);
  return `${bar(true)}<h2>Therapiestunde</h2><p class="soft small">${fmt(s.createdAt, true)}</p>
  <div class="stack">
    <label class="field">Was wurde besprochen? Was habe ich erkannt?<textarea class="plain" id="sess-notes" rows="7" placeholder="Stichworte genügen …">${esc(s.notes)}</textarea></label>
    <label class="field">Was nehme ich mir bis zur nächsten Stunde vor?<textarea class="plain" id="sess-plan" rows="4">${esc(s.plan)}</textarea></label>
    ${themesBlock(s)}
    <div class="row"><button class="btn" data-a="saveSession">Speichern</button>${saved ? '<button class="btn ghost" data-a="delSession">Löschen</button>' : ''}</div>
  </div>`;
}

function vTree() {
  const items = [...state.entries, ...state.sessions];
  const groups = [...groupByTheme(items).entries()].filter(([, g]) => g.length);
  const list = groups.map(([name, g]) => {
    const t = trend(g.filter((x) => x.kind !== 'therapy'));
    const n = g.filter((x) => x.kind === 'therapy').length;
    return `<div class="card"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><strong>${esc(name)}</strong><span class="small soft">${g.length} ${g.length === 1 ? 'Blatt' : 'Blätter'}${n ? ` · ${n} ${n === 1 ? 'Stunde' : 'Stunden'}` : ''}</span></div><p class="small" style="margin:.3em 0 0"><span class="arrow">${t.arrow}</span> ${t.text}</p></div>`;
  }).join('');
  return `${bar(true)}<h2>Dein Baum</h2><p class="small soft">Jeder Ast ist ein Thema. Blätter sind Einträge in der Farbe deiner Stimmung, goldene Früchte sind Therapiestunden, ein weißer Punkt markiert eine Erkenntnis. Tippe auf ein Blatt, um es zu öffnen.</p>
  ${treeSvg(items)}<div class="stack" style="margin-top:14px">${list}</div>
  <p class="small soft">Die Tendenzen zeigen nur, wie sich deine eigenen Stimmungsangaben verändert haben. Sie sind keine Diagnose.</p>`;
}

const canGoogle = () => !!(GOOGLE.clientId || state.settings.clientId);
const isConnected = (s) => s.provider !== 'off' && !!s.connectedAt;
const CONNECTED_NAMES = { geminiGoogle: 'deinem Google-Konto', gemini: 'Google Gemini', anthropic: 'Anthropic', mistral: 'Mistral', openai: 'deinem API-Anbieter', ollama: 'Ollama auf deinem Rechner' };

const connectingBlock = () => `<div class="connecting" role="status"><span class="spinner" aria-hidden="true"></span><span>${esc(state.connecting)}</span></div>
  <button class="btn ghost block" style="margin-top:10px" data-a="cancelConnect">Abbrechen</button>`;

function connectedBlock(s) {
  return `<div class="conn${state.justConnected ? ' fresh' : ''}" role="status"><div class="check-big" aria-hidden="true">${icon('check')}</div>
    <div><strong>Verbunden mit ${CONNECTED_NAMES[s.provider]}</strong><div class="small soft">Modell: ${esc(s.model)}</div></div></div>
    ${state.justConnected ? `<p class="small" style="margin:10px 0 0">Die Begleitung ist bereit. Gib einen Eintrag für sie frei und tippe danach auf „Begleitung um eine Frage bitten“.</p><button class="btn block" style="margin-top:10px" data-a="afterConnect">Weiter</button>` : ''}
    ${s.provider === 'geminiGoogle' && !state.justConnected ? '<p class="small soft" style="margin:10px 0 0">Nach einem Neustart fragt Google beim ersten Senden kurz nach.</p>' : ''}
    ${state.connecting ? `<div style="margin-top:10px">${connectingBlock()}</div>` : `<div class="row" style="margin-top:10px"><button class="btn ghost" data-a="testConn">Verbindung testen</button><button class="btn ghost" data-a="disconnect">${s.provider === 'geminiGoogle' ? 'Abmelden' : 'Trennen'}</button></div>`}
    <div id="testOut" class="small soft" role="status" style="margin-top:8px">${esc(state.testMsg)}</div>`;
}

const authField = () => `<input type="password" id="authPw" placeholder="Aktuelle Passphrase" autocomplete="current-password"${state.bioOn && state.bioAvail ? '' : ' required'}>
  ${state.bioOn && state.bioAvail ? '<p class="small soft" style="margin:0">Leer lassen, um dich stattdessen mit dem Fingerabdruck auszuweisen.</p>' : ''}`;

const authHtml = (id, title, text, fields, label) => `<h2>${title}</h2><p class="soft">${text}</p>
  <form id="${id}" class="stack" autocomplete="off">${authField()}${fields}<p id="authErr" class="small" style="color:var(--danger);margin:0" role="alert"></p>
  <div class="row"><button class="btn" type="submit">${label}</button><button class="btn ghost" type="button" data-a="closeModal">Abbrechen</button></div></form>`;

function restoreHtml(merge) {
  return `<h2>${merge ? 'Sicherung einlesen' : 'Aus Sicherung wiederherstellen'}</h2>
  <p class="soft">${merge ? 'Neue Einträge aus der Sicherung kommen dazu, vorhandene bleiben unverändert.' : 'Dein Tagebuch wird aus der Datei wiederhergestellt.'} Nutze die Passphrase oder den Wiederherstellungsschlüssel, die beim Erstellen der Sicherung galten.</p>
  <form id="${merge ? 'mergeForm' : 'restoreForm'}" class="stack" autocomplete="off"><input type="file" id="bkFile" accept=".json,application/json" required aria-label="Sicherungsdatei">
  <input type="password" id="bkSecret" placeholder="Passphrase oder Wiederherstellungsschlüssel" required>
  <p id="bkErr" class="small" style="color:var(--danger);margin:0" role="alert"></p>
  <div class="row"><button class="btn" type="submit">${merge ? 'Einlesen' : 'Wiederherstellen'}</button><button class="btn ghost" type="button" data-a="closeModal">Abbrechen</button></div></form>`;
}

// Zeigt den Schlüssel genau einmal. Bis zur Bestätigung sperrt Tend sich nicht von selbst.
function showCode(code) {
  state.code = code;
  state.noLock = true;
  showModal(`<h2>Dein Wiederherstellungsschlüssel</h2><p>Damit setzt du eine neue Passphrase, falls du sie vergisst. Tend zeigt ihn nur dieses eine Mal.</p>
  <div class="code-box">${esc(code)}</div>
  <div class="row" style="margin:12px 0"><button class="btn ghost" data-a="codeCopy">Kopieren</button><button class="btn ghost" data-a="codeSave">Als Datei speichern</button></div>
  <p class="small soft">Bewahre ihn getrennt vom Handy auf, am besten ausgedruckt oder im Passwortmanager. Wer ihn hat und an dein Gerät oder eine Sicherung kommt, kann dein Tagebuch öffnen.</p>
  <label class="check"><input type="checkbox" id="codeOk"><span>Ich habe ihn sicher aufbewahrt.</span></label>
  <p id="codeErr" class="small" style="color:var(--danger);margin:8px 0 0" role="alert"></p>
  <button class="btn block" style="margin-top:12px" data-a="codeDone">Fertig</button>`);
}

// Android bietet über "Teilen" direkt Drive & Co. an; sonst normaler Download. Gibt false zurück, wenn abgebrochen.
async function saveFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

function vSettings() {
  const s = state.settings;
  const p = PROVIDERS[s.provider];
  return `${bar(true)}<h2>Einstellungen</h2><div class="stack">
  <div class="card stack"><h3>Begleitung</h3>
    ${isConnected(s) ? connectedBlock(s) : `
    ${state.connecting ? connectingBlock() : canGoogle() ? `<button class="btn block" data-a="googleConnect">Mit Google anmelden</button>
    <p class="small soft" style="margin-top:8px">Ohne Schlüssel und Einrichtung. Wenn du die Begleitung fragst, gehen die freigegebenen Einträge an Google. Die Nutzung läuft über das Google-Projekt von Tend, das Kontingent wird geteilt.</p>` : ''}
    <div id="testOut" class="small soft" role="status">${esc(state.testMsg)}</div>
    <details ${s.provider !== 'off' && !(p.oauth && canGoogle()) ? 'open' : ''}><summary class="soft">${canGoogle() ? 'Andere Möglichkeiten' : 'Anbieter wählen'}</summary><div class="stack" style="margin-top:10px">
    <p class="small soft" style="margin:0">Du entscheidest, wohin deine Texte gehen, oder ob überhaupt. Es wird nur gesendet, wenn du es bei einem Eintrag erlaubst und aktiv fragst.</p>
    <div class="chips" role="group" aria-label="Anbieter">${Object.entries(PROVIDERS).filter(([k]) => k !== 'geminiGoogle' || !canGoogle()).map(([k, v]) => `<button class="chip ghost${k === s.provider ? ' on' : ''}" type="button" data-a="pickProvider" data-p="${k}" aria-pressed="${k === s.provider}">${v.label}</button>`).join('')}</div>
    ${p.guide ? `<div class="small"><strong>So bekommst du einen Schlüssel:</strong>
      <ol style="margin:.5em 0 .5em 1.2em;padding:0"><li>Gehe zu <a href="${p.guide.url}" target="_blank" rel="noopener noreferrer">${p.guide.host}</a>.</li>${p.guide.steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
      <strong>Wichtig:</strong> ${esc(p.guide.note)}</div>` : ''}
    ${p.needsKey ? `<label class="field">API-Schlüssel<div class="row" style="flex-wrap:nowrap;margin-top:4px"><input type="password" id="s-key" value="${esc(s.apiKey)}" autocomplete="off" placeholder="Schlüssel hier einfügen"><button class="btn ghost" type="button" data-a="pasteKey" style="padding:12px 16px">Einfügen</button></div></label><p class="small soft" style="margin:0">Wird nur verschlüsselt auf diesem Gerät gespeichert. Texte gehen direkt an den Anbieter.</p>` : ''}
    ${p.oauth && !canGoogle() ? `<label class="field">OAuth-Client-ID (Betreiber)<input type="text" id="s-clientid" value="${esc(s.clientId)}" placeholder="…apps.googleusercontent.com"></label>
      <label class="field">Cloud-Projekt-ID (Betreiber)<input type="text" id="s-projectid" value="${esc(s.projectId)}"></label>` : ''}
    ${p.local ? `<label class="field">Adresse<input type="url" id="s-base" value="${esc(s.base)}"></label><label class="field">Modell<input type="text" id="s-model" value="${esc(s.model)}"></label>
      <p class="small soft" style="margin:0">Der Browser darf Ollama nur ansprechen, wenn es diese Seite erlaubt, z. B. mit <code>OLLAMA_ORIGINS=http://localhost:5173 ollama serve</code>. Kleine Modelle sind für eine Frage und Spiegelung gut, für tiefe Gespräche schwächer.</p>` : ''}
    ${p.needsKey ? `<details class="small"><summary class="soft">Erweitert (Adresse und Modell)</summary><div class="stack" style="margin-top:8px"><label class="field">Adresse<input type="url" id="s-base" value="${esc(s.base)}"></label><label class="field">Modell${s.provider === 'gemini' ? ' (wird automatisch auf das neueste Flash-Modell gesetzt)' : ''}<input type="text" id="s-model" value="${esc(s.model)}"></label></div></details>` : ''}
    ${s.provider !== 'off' && !(p.oauth && canGoogle()) && !state.connecting ? `<button class="btn ${canGoogle() ? 'ghost' : ''} block" data-a="connect">${p.oauth ? 'Mit Google anmelden' : 'Verbinden und testen'}</button>` : ''}
    </div></details>`}
    <label class="check"><input type="checkbox" id="s-aidef" ${s.aiDefault ? 'checked' : ''}><span>Neue Einträge standardmäßig für die Begleitung freigeben</span></label>
  </div>
  <div class="card stack"><h3>Sicherheit</h3>
    <label class="field">Automatisch sperren nach (Minuten, 0 = sobald du die App verlässt)<input type="number" id="s-lock" min="0" max="60" value="${s.autoLockMin}"></label>
    ${!state.bioAvail ? '<p class="small soft">Entsperren per Fingerabdruck ist auf diesem Gerät oder in diesem Browser nicht verfügbar.</p>'
    : state.bioOn ? `<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><span class="row" style="flex-wrap:nowrap;gap:8px">${icon('finger')}<strong>Fingerabdruck ist aktiv</strong></span><button class="btn ghost" data-a="bioOff">Ausschalten</button></div>`
      : `<button class="btn ghost block" data-a="bioSetup">${icon('finger')}Fingerabdruck einrichten</button>`}
    <p class="small soft">Alle Einträge, Entwürfe und dein API-Schlüssel sind mit AES-256 verschlüsselt (Schlüssel aus deiner Passphrase, PBKDF2 mit 600.000 Runden). Es gibt keine Konten, keine Analyse und keinen Server.</p>
  </div>
  <button class="btn block" data-a="saveSettings">Speichern</button>
  <div class="card stack"><h3>Passphrase</h3>
    <div class="row"><button class="btn ghost" data-a="changePw">Passphrase ändern</button><button class="btn ghost" data-a="newCode">${state.hasRec ? 'Neuer Wiederherstellungsschlüssel' : 'Wiederherstellungsschlüssel einrichten'}</button></div>
  </div>
  <div class="card stack"><h3>Sicherung</h3>
    <p class="small soft" style="margin:0">Die Datei bleibt verschlüsselt, du kannst sie also auch in deinem Cloud-Speicher ablegen. ${s.lastBackupAt ? `Letzte Sicherung: ${fmt(s.lastBackupAt)}.` : 'Noch keine Sicherung erstellt.'}</p>
    <div class="row"><button class="btn" data-a="backup">Sicherung erstellen</button><button class="btn ghost" data-a="importStart">Sicherung einlesen</button></div>
  </div>
  <div class="card stack"><h3>Deine Daten</h3>
    <button class="btn ghost" data-a="export">Alles exportieren (unverschlüsselt)</button>
    <button class="btn danger" data-a="wipe">Alles unwiderruflich löschen</button>
  </div><p class="small soft center">Tend, Version ${VERSION}</p></div>`;
}

/* ---------- Ablauf ---------- */
async function enter() {
  state.hasRec = await vault.hasRecovery();
  state.settings = { ...DEFAULTS, ...(await vault.getSecret('settings')) };
  const s = state.settings; // Ältere Einstellungen kennen connectedAt noch nicht: gewähltes Modell oder Einwilligung zeigen eine geprüfte Verbindung.
  if (!s.connectedAt && s.provider !== 'off' && (s.consent === `${s.provider}|${s.base}` || s.model !== PROVIDERS[s.provider].model)) s.connectedAt = Date.now();
  navigator.storage?.persist?.().catch(() => {}); // Bittet den Browser, das Tagebuch bei Speichermangel nicht zu löschen
  const all = await vault.listEntries();
  state.entries = all.filter((x) => !x.kind);
  state.sessions = all.filter((x) => x.kind === 'therapy');
  state.preps = all.filter((x) => x.kind === 'prep');
  state.draft = await vault.getSecret('draft');
  state.view = 'home';
  state.last = Date.now();
  render();
}

function lockApp() {
  state.connectRun += 1;
  state.connecting = '';
  vault.lock();
  Object.assign(state, { entries: [], sessions: [], preps: [], sess: null, prep: null, entry: null, draft: null, settings: { ...DEFAULTS }, view: 'lock', busy: false, notice: '' });
  closeModal();
  render();
}

let draftTimer;
function saveDraftSoon() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => vault.setSecret('draft', state.draft), 700);
}

async function saveEntry() {
  const d = state.draft;
  const text = $('#text').value.trim();
  if (!text) { $('#text').focus(); return; }
  const e = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now(), mood: d.mood || 3, text, aiAllowed: !!$('#aiok')?.checked, thread: [] };
  await vault.saveEntry(e);
  await vault.clearSecret('draft');
  clearTimeout(draftTimer);
  state.draft = null;
  state.entries.unshift(e);
  state.entry = e;
  state.newestId = e.id;
  state.view = 'done';
  render();
  if (checkCrisis(text)) showModal(helpHtml(true));
}

async function ensureConsent() {
  const s = state.settings;
  if (!sendsOffDevice(s) || s.consent === `${s.provider}|${s.base}`) return true;
  return new Promise((resolve) => {
    state.consentResolve = resolve;
    showModal(`<h2>Text verlässt dein Gerät</h2>
    <p>Wenn du die Begleitung fragst, wird der Text dieses Eintrags an <strong>${esc(new URL(s.base).hostname)}</strong> gesendet. Dort gelten die Datenschutzregeln des Anbieters, nicht die von Tend.</p>
    <p class="small soft">Du kannst jederzeit auf ein lokales Modell wechseln. Gesendet wird nur, was du pro Eintrag freigibst.</p>
    <div class="row"><button class="btn" data-a="consentYes">Verstanden, senden</button><button class="btn ghost" data-a="consentNo">Abbrechen</button></div>`);
  });
}

// Vor jedem Senden: Google-Anmeldung direkt aus dem Klick (sonst blockt der Browser das Popup), dann Einwilligung.
async function gate() {
  if (state.settings.provider === 'geminiGoogle') {
    state.busy = true;
    state.busyMsg = 'Bitte melde dich im Google-Fenster an…';
    render();
    try {
      await googleToken(state.settings);
    } catch (err) {
      state.busy = false;
      state.busyMsg = '';
      state.notice = String(err.message);
      render();
      return false;
    }
  }
  if (!(await ensureConsent())) { state.busy = false; state.busyMsg = ''; render(); return false; }
  state.busy = true;
  state.busyMsg = '';
  render();
  return true;
}

async function askAi(userText, close = false) {
  const e = state.entry;
  state.notice = '';
  state.replyDraft = '';
  e.thread ||= [];
  if (userText) {
    e.thread.push({ role: 'user', content: userText });
    if (checkCrisis(userText)) {
      e.thread.push({ role: 'assistant', content: 'Danke, dass du das mit mir teilst. Das klingt sehr schwer, und ich möchte, dass du dabei nicht allein bleibst. Bitte sprich jetzt mit einem Menschen – unter „Hilfe“ findest du Nummern, die kostenlos und rund um die Uhr erreichbar sind.' });
      await vault.saveEntry(e);
      render();
      showModal(helpHtml(true));
      return;
    }
  }
  const doClose = close || e.thread.filter((t) => t.role === 'user').length >= MAX_REPLIES;
  if (!(await gate())) { if (userText) e.thread.pop(); render(); return; }
  const msgs = [{ role: 'user', content: `Mein Tagebucheintrag vom ${fmt(e.createdAt, true)} (Stimmung: ${MOODS[(e.mood || 3) - 1].name}):\n\n${e.text}` }, ...e.thread.map(({ role, content }) => ({ role, content }))];
  if (doClose) {
    const note = 'Bitte runde das Gespräch jetzt ab.';
    const last = msgs[msgs.length - 1];
    if (last.role === 'user') last.content += `\n\n(${note})`;
    else msgs.push({ role: 'user', content: note });
  }
  try {
    // Sichtbar mitschreiben; der Abschluss hat ein festes Format und erscheint erst fertig aufbereitet.
    const onText = doClose ? undefined : (t) => {
      const el = $('.bubble.ai.live') || $('.bubble.ai.typing');
      if (!el) return;
      el.classList.remove('typing');
      el.classList.add('live');
      el.textContent = t || '…denkt nach';
    };
    const slow = setTimeout(() => {
      const el = $('.bubble.ai.typing');
      if (el) el.textContent = 'Das dauert gerade etwas länger…';
    }, 15000);
    const reply = await askCompanion(state.settings, msgs, doClose ? { system: CLOSE_SYSTEM, maxTokens: 500 } : { system: FLOW_SYSTEM, onText }).finally(() => clearTimeout(slow));
    if (doClose) {
      const r = parseClose(reply);
      e.thread.push({ role: 'assistant', content: r.message + (r.step ? `\n\nKleiner Schritt: ${r.step}` : ''), final: true });
      if (r.insight && !e.insight) e.insight = r.insight;
      e.themes ||= [];
      r.themes.forEach((t) => addUnique(e.themes, t));
      e.closed = true;
    } else {
      e.thread.push({ role: 'assistant', content: reply });
    }
    await vault.saveEntry(e);
  } catch (err) {
    if (userText) { e.thread.pop(); state.replyDraft = userText; } // Getippte Antwort nicht verlieren
    state.notice = `${friendlyError(err)} Dein Eintrag ist sicher gespeichert.`;
  }
  state.busy = false;
  render();
}

// Fingerabdruck beim Öffnen. Abbrechen ist kein Fehler: Dann bleibt einfach die Passphrase.
async function tryBio(fromTap = false) {
  if (!state.bioOn || !state.bioAvail || state.bioBusy || vault.isUnlocked()) return;
  state.bioBusy = true;
  try {
    await vault.unlockBio();
    state.bioBusy = false;
    await enter();
  } catch (err) {
    state.bioBusy = false;
    if (fromTap && err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
      const box = $('#lockErr');
      if (box) box.textContent = 'Der Fingerabdruck hat nicht geklappt. Bitte öffne Tend mit deiner Passphrase.';
    }
  }
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const themeObj = () => (state.view === 'session' ? state.sess : state.entry);
async function themesChanged() {
  if (state.view === 'entry') await vault.saveEntry(state.entry);
  render();
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// Verbinden: zeigt jeden Schritt an, verhindert Doppelklicks und lässt sich abbrechen.
async function runConnect({ full = false, restore = null } = {}) {
  if (state.connecting) return false;
  collectSettings();
  const s = state.settings;
  state.testMsg = '';
  if (PROVIDERS[s.provider].needsKey && !s.apiKey) { state.testMsg = 'Bitte füge zuerst deinen Schlüssel ein.'; render(); return false; }
  const run = ++state.connectRun;
  const stale = () => run !== state.connectRun;
  const google = s.provider === 'geminiGoogle';
  const gemini = google || s.provider === 'gemini';
  const wasConnected = isConnected(s);
  state.connectRestore = restore;
  state.connecting = google ? 'Warte auf Google. Wähle im Google-Fenster dein Konto aus.' : 'Prüfe die Verbindung…';
  render();
  try {
    if (google) {
      await googleToken(s);
      if (stale()) return false;
      state.connecting = 'Angemeldet. Einen Moment noch…';
      render();
    }
    if (gemini) {
      // Ist die Modellliste überlastet, bleibt die Anmeldung gültig und das bisherige Modell im Einsatz.
      const m = await pickGeminiModel(s).catch((err) => { if (/^5\d\d /.test(String(err.message))) return null; throw err; });
      if (stale()) return false;
      if (m) s.model = m;
    }
    // Die Modellliste belegt bei Gemini schon den Zugang; ein Probetext kostet nur Zeit und Kontingent.
    if (full || !gemini) {
      await askCompanion(s, [{ role: 'user', content: 'Sag in einem kurzen Satz Hallo.' }]);
      if (stale()) return false;
    }
    s.connectedAt = Date.now();
    await vault.setSecret('settings', s);
    if (stale()) return false;
    state.connecting = '';
    state.connectRestore = null;
    state.justConnected = !wasConnected;
    state.testMsg = wasConnected ? 'Die Verbindung funktioniert.' : '';
    render();
    if (state.view === 'settings') $('.conn')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    else toast('Begleitung verbunden');
    return true;
  } catch (err) {
    if (stale()) return false;
    const m = String(err.message);
    state.connecting = '';
    state.connectRestore = null;
    if (restore) Object.assign(s, restore);
    state.testMsg = google && /^(400|401|403)/.test(m) ? `Google hat den Zugriff abgelehnt. Prüfe, ob dein Konto als Testnutzer eingetragen ist.${serviceReason(err)}`
      : google && !/^\d{3}/.test(m) ? m
        : friendlyError(err);
    render();
    return false;
  }
}

function collectSettings() {
  const s = state.settings;
  const g = (id) => document.getElementById(id);
  if (g('s-base')) s.base = g('s-base').value.trim();
  if (g('s-model')) s.model = g('s-model').value.trim();
  if (g('s-key')) s.apiKey = g('s-key').value.trim();
  if (g('s-clientid')) s.clientId = g('s-clientid').value.trim();
  if (g('s-projectid')) s.projectId = g('s-projectid').value.trim();
  if (g('s-lock')) s.autoLockMin = Math.max(0, Number(g('s-lock').value) || 0);
  if (g('s-aidef')) s.aiDefault = g('s-aidef').checked;
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Ereignisse ---------- */
const actions = {
  help: () => showModal(helpHtml(false)),
  reloadApp: () => location.reload(),
  bioUnlock: () => tryBio(true),
  bioSetup: () => showModal(`<h2>Fingerabdruck einrichten</h2><p class="soft">Bestätige einmal deine Passphrase. Danach öffnest du Tend mit deinem Fingerabdruck. Die Passphrase bleibt gültig und ist dein Ersatz, falls der Sensor einmal nicht geht. Merke sie dir also weiterhin.</p>
    <form id="bioForm" class="stack" autocomplete="off"><input type="password" id="bioPw" placeholder="Passphrase" autocomplete="current-password" required><p id="bioErr" class="small" style="color:var(--danger);margin:0" role="alert"></p>
    <div class="row"><button class="btn" type="submit">Weiter</button><button class="btn ghost" type="button" data-a="closeModal">Abbrechen</button></div></form>`),
  bioOff: async () => {
    await vault.disableBio();
    state.bioOn = false;
    render();
    toast('Fingerabdruck ausgeschaltet');
  },
  pickProvider: (el) => {
    collectSettings();
    const p = PROVIDERS[el.dataset.p];
    // Schlüssel leeren: Der eines Anbieters darf nie an einen anderen gehen.
    Object.assign(state.settings, { provider: el.dataset.p, base: p.base || '', model: p.model || '', apiKey: '', connectedAt: 0 });
    state.testMsg = '';
    render();
  },
  togglePw: (el) => {
    const show = $('#pw').type === 'password';
    document.querySelectorAll('#pw, #pw2').forEach((i) => { i.type = show ? 'text' : 'password'; });
    el.textContent = show ? 'Verbergen' : 'Anzeigen';
  },
  forgot: async () => {
    const [n, rec] = await Promise.all([vault.countItems(), vault.hasRecovery()]);
    showModal(`<h2>Passphrase vergessen?</h2><p class="soft">Die Passphrase ist nirgends gespeichert, auch nicht bei uns. Du kannst aber eine neue setzen.</p>
    ${state.bioOn && state.bioAvail ? `<div class="card stack"><h3>Mit Fingerabdruck</h3><p class="small soft" style="margin:0">Öffne Tend und ändere die Passphrase dann in den Einstellungen.</p><button class="btn block" data-a="forgotBio">${icon('finger')}Mit Fingerabdruck öffnen</button></div>` : ''}
    ${rec ? `<form id="recoverForm" class="card stack" autocomplete="off" style="margin-top:12px"><h3>Mit Wiederherstellungsschlüssel</h3>
      <input type="text" id="recCode" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autocapitalize="characters" spellcheck="false" required>
      <input type="password" id="recPw" placeholder="Neue Passphrase" autocomplete="new-password" required>
      <input type="password" id="recPw2" placeholder="Neue Passphrase wiederholen" autocomplete="new-password" required>
      <p id="recErr" class="small" style="color:var(--danger);margin:0" role="alert"></p>
      <button class="btn block" type="submit">Neue Passphrase setzen</button></form>` : '<p class="small soft">Für dieses Tagebuch gibt es keinen Wiederherstellungsschlüssel.</p>'}
    <details style="margin-top:14px"><summary class="soft">Nichts davon vorhanden</summary><div class="stack" style="margin-top:8px"><p class="small">Dann bleiben die Einträge verschlüsselt, und du kannst nur neu anfangen. Auf diesem Gerät ${n === 1 ? 'liegt <strong>1 gespeicherter Eintrag</strong>' : `liegen <strong>${n} gespeicherte Einträge</strong>`}, sie würden endgültig gelöscht. Tippe zur Bestätigung <strong>LÖSCHEN</strong>.</p>
    <input type="text" id="wipeIn" autocomplete="off"><button class="btn danger block" data-a="wipeYes">Alles löschen und neu anfangen</button></div></details>
    <button class="btn ghost block" style="margin-top:12px" data-a="closeModal">Abbrechen</button>`);
  },
  forgotBio: () => { closeModal(); tryBio(true); },
  restoreStart: () => showModal(restoreHtml(false)),
  importStart: () => showModal(restoreHtml(true)),
  backup: async () => {
    const b = await vault.makeBackup();
    state.settings.lastBackupAt = b.createdAt;
    await vault.setSecret('settings', state.settings);
    state.noLock = true;
    const ok = await saveFile(`tend-sicherung-${new Date(b.createdAt).toISOString().slice(0, 10)}.json`, JSON.stringify(b), 'application/json');
    state.noLock = false;
    if (ok) toast('Sicherung erstellt');
    render();
  },
  changePw: () => showModal(authHtml('pwForm', 'Passphrase ändern', 'Deine Einträge bleiben unverändert. Ältere Sicherungen öffnest du weiter mit der Passphrase von damals.', `<input type="password" id="pwNew" placeholder="Neue Passphrase" autocomplete="new-password" required><input type="password" id="pwNew2" placeholder="Neue Passphrase wiederholen" autocomplete="new-password" required>`, 'Passphrase ändern')),
  newCode: () => showModal(authHtml('codeForm', 'Wiederherstellungsschlüssel', 'Du bekommst einen neuen Schlüssel, der alte gilt dann auf diesem Gerät nicht mehr. Ältere Sicherungen öffnest du weiter mit dem Schlüssel von damals.', '', 'Neuen Schlüssel erstellen')),
  codeCopy: async () => { try { await navigator.clipboard.writeText(state.code); toast('Kopiert'); } catch { toast('Kopieren nicht möglich, bitte abschreiben.'); } },
  codeSave: async () => { await saveFile('tend-wiederherstellungsschluessel.txt', `Tend Wiederherstellungsschlüssel\n\n${state.code}\n\nGut aufbewahren. Damit lässt sich dein Tagebuch öffnen.\n`, 'text/plain'); },
  codeDone: () => {
    if (!$('#codeOk').checked) { $('#codeErr').textContent = 'Bitte bestätige, dass du ihn sicher aufbewahrt hast.'; return; }
    state.code = '';
    state.noLock = false;
    state.hasRec = true;
    closeModal();
    render();
  },
  closeModal,
  lock: lockApp,
  home: () => { closeModal(); state.notice = ''; state.justConnected = false; state.view = 'home'; render(); },
  settings: () => { state.justConnected = false; state.testMsg = ''; state.view = 'settings'; render(); },
  googleConnect: () => {
    if (state.connecting) { state.view = 'settings'; render(); return; }
    if (state.view !== 'settings') state.afterView = state.view;
    const s = state.settings;
    const restore = { provider: s.provider, base: s.base, model: s.model };
    const p = PROVIDERS.geminiGoogle;
    Object.assign(s, { provider: 'geminiGoogle', base: p.base, model: p.model });
    state.view = 'settings';
    runConnect({ restore });
  },
  afterConnect: () => {
    const v = state.afterView || 'home';
    state.afterView = '';
    state.justConnected = false;
    state.view = v === 'entry' && state.entry ? 'entry' : 'home';
    render();
  },
  disconnect: async () => {
    const s = state.settings;
    if (s.provider === 'geminiGoogle') googleSignOut();
    Object.assign(s, { provider: 'off', base: '', model: '', apiKey: '', consent: '', connectedAt: 0 });
    await vault.setSecret('settings', s);
    render();
    toast('Abgemeldet');
  },
  setupAi: () => {
    const p = PROVIDERS.gemini;
    Object.assign(state.settings, { provider: 'gemini', base: p.base, model: p.model });
    state.view = 'settings';
    render();
  },
  promptWrite: () => { state.prompt = dailyPrompt(); actions.write(true); },
  write: (keep) => {
    if (keep !== true) state.prompt = '';
    if (state.draft?.text) { state.view = 'write'; return render(); }
    state.draft = { mood: 0, text: '', ai: state.settings.aiDefault };
    state.view = 'mood';
    render();
  },
  mood: (el) => { state.draft.mood = Number(el.dataset.v); state.view = 'breath'; render(); },
  skipMood: () => { state.view = 'write'; render(); },
  toWrite: () => { state.view = 'write'; render(); },
  save: saveEntry,
  open: (el) => {
    state.entry = state.entries.find((e) => e.id === el.dataset.id);
    state.view = 'entry';
    state.notice = '';
    render();
    if (el.dataset.ask) askAi();
  },
  ask: () => askAi(),
  toggleAi: async (el) => { state.entry.aiAllowed = el.checked; await vault.saveEntry(state.entry); render(); },
  delEntry: () => showModal(`<h2>Eintrag löschen?</h2><p class="soft">Diese Blume und der Text verschwinden endgültig.</p><div class="row"><button class="btn danger" data-a="delEntryYes">Löschen</button><button class="btn ghost" data-a="closeModal">Behalten</button></div>`),
  delEntryYes: async () => {
    await vault.deleteEntry(state.entry.id);
    state.entries = state.entries.filter((e) => e.id !== state.entry.id);
    closeModal();
    actions.home();
  },
  tree: () => { state.view = 'tree'; render(); },
  therapy: () => { state.notice = ''; state.view = 'therapy'; render(); },
  closeChat: () => askAi('', true),
  reopenChat: async () => { state.entry.closed = false; await vault.saveEntry(state.entry); render(); },
  toggleTherapy: async (el) => { state.entry.forTherapy = el.checked; await vault.saveEntry(state.entry); },
  addTheme: (el) => { const o = themeObj(); addUnique((o.themes ||= []), el.dataset.t); themesChanged(); },
  rmTheme: (el) => { const o = themeObj(); o.themes = (o.themes || []).filter((t) => t !== el.dataset.t); themesChanged(); },
  newSession: () => { state.sess = { id: newId(), kind: 'therapy', createdAt: Date.now(), notes: '', plan: '', themes: [] }; state.view = 'session'; render(); },
  openSession: (el) => { state.sess = state.sessions.find((s) => s.id === el.dataset.id); state.view = 'session'; render(); },
  saveSession: async () => {
    const s = state.sess;
    if (!s.notes.trim() && !s.plan.trim()) { $('#sess-notes').focus(); return; }
    await vault.saveEntry(s);
    if (!state.sessions.some((x) => x.id === s.id)) state.sessions.unshift(s);
    state.sessions.sort((x, y) => y.createdAt - x.createdAt);
    toast('Stunde gespeichert ✓');
    state.view = 'therapy';
    render();
    if (checkCrisis(`${s.notes} ${s.plan}`)) showModal(helpHtml(true));
  },
  delSession: () => showModal('<h2>Stunde löschen?</h2><p class="soft">Die Notizen verschwinden endgültig.</p><div class="row"><button class="btn danger" data-a="delSessionYes">Löschen</button><button class="btn ghost" data-a="closeModal">Behalten</button></div>'),
  delSessionYes: async () => { await vault.deleteEntry(state.sess.id); state.sessions = state.sessions.filter((x) => x.id !== state.sess.id); closeModal(); actions.therapy(); },
  newPrep: () => { state.notice = ''; state.prep = { id: newId(), kind: 'prep', createdAt: Date.now(), text: localPrep(state.entries, state.sessions) }; state.view = 'prep'; render(); },
  openPrep: (el) => { state.notice = ''; state.prep = state.preps.find((p) => p.id === el.dataset.id); state.view = 'prep'; render(); },
  savePrep: async () => {
    const p = state.prep;
    await vault.saveEntry(p);
    if (!state.preps.some((x) => x.id === p.id)) state.preps.unshift(p);
    toast('Vorbereitung gespeichert ✓');
  },
  copyPrep: async () => { try { await navigator.clipboard.writeText(state.prep.text); toast('Kopiert ✓'); } catch { toast('Kopieren nicht möglich – markiere den Text und kopiere ihn von Hand.'); } },
  delPrep: async () => { await vault.deleteEntry(state.prep.id); state.preps = state.preps.filter((x) => x.id !== state.prep.id); actions.therapy(); },
  aiPrep: async () => {
    state.notice = '';
    const p = state.prep;
    const { text, count } = prepInput(state.entries, state.sessions);
    if (!count) { state.notice = 'Es gibt keine für die Begleitung freigegebenen Einträge aus den letzten 30 Tagen. Gib Einträge frei, die einfließen dürfen.'; render(); return; }
    if (!(await gate())) return;
    try {
      const r = await askCompanion(state.settings, [{ role: 'user', content: text }], { system: PREP_SYSTEM, maxTokens: 700 });
      p.text = `${p.text.trim()}\n\n— Zusammenfassung der Begleitung —\n${r}`;
    } catch (err) {
      state.notice = friendlyError(err);
    }
    state.busy = false;
    render();
  },
  consentYes: async () => {
    const s = state.settings;
    s.consent = `${s.provider}|${s.base}`;
    await vault.setSecret('settings', s);
    closeModal();
    state.consentResolve?.(true);
  },
  consentNo: () => { closeModal(); state.consentResolve?.(false); },
  saveSettings: async () => {
    collectSettings();
    await vault.setSecret('settings', state.settings);
    actions.home();
  },
  pasteKey: async () => {
    try {
      $('#s-key').value = (await navigator.clipboard.readText()).trim();
      $('#s-key').dispatchEvent(new Event('input', { bubbles: true }));
    } catch {
      $('#s-key').focus();
      $('#testOut').textContent = 'Der Browser erlaubt das Einfügen hier nicht – bitte tippe ins Feld und füge den Schlüssel mit Strg/Cmd+V ein.';
    }
  },
  connect: () => runConnect(),
  testConn: () => runConnect({ full: true }),
  cancelConnect: () => {
    state.connectRun += 1;
    state.connecting = '';
    Object.assign(state.settings, state.connectRestore || {});
    state.connectRestore = null;
    state.testMsg = 'Abgebrochen. Du kannst es jederzeit noch einmal versuchen.';
    render();
  },
  export: async () => {
    if (!confirm('Die Datei enthält dein Tagebuch im Klartext. Nur an einem sicheren Ort speichern. Fortfahren?')) return;
    download(`tend-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ entries: state.entries, sessions: state.sessions, preps: state.preps }, null, 2));
  },
  wipe: () => showModal(`<h2>Alles löschen?</h2><p class="soft">Alle Einträge, Einstellungen und der Schlüssel werden von diesem Gerät entfernt. Das lässt sich nicht rückgängig machen. Tippe zur Bestätigung <strong>LÖSCHEN</strong>.</p><input type="text" id="wipeIn" autocomplete="off"><div class="row" style="margin-top:12px"><button class="btn danger" data-a="wipeYes">Endgültig löschen</button><button class="btn ghost" data-a="closeModal">Abbrechen</button></div>`),
  wipeYes: async () => {
    if ($('#wipeIn').value.trim() !== 'LÖSCHEN') return;
    state.hasRec = false;
    await vault.wipe();
    state.hasVault = false;
    state.bioOn = false;
    lockApp();
  },
};

document.addEventListener('click', (ev) => {
  state.last = Date.now();
  const el = ev.target.closest('[data-a]');
  if (!el || el.tagName === 'INPUT') return;
  actions[el.dataset.a]?.(el);
});
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.type === 'checkbox' && el.dataset.a) actions[el.dataset.a]?.(el);
  if (el.id === 'insight' && state.entry) { state.entry.insight = el.value.trim(); vault.saveEntry(state.entry); }
});
document.addEventListener('input', (ev) => {
  state.last = Date.now();
  if (ev.target.id === 's-key') {
    const det = detectProvider(ev.target.value);
    if (det && det !== state.settings.provider) {
      collectSettings();
      const p = PROVIDERS[det];
      Object.assign(state.settings, { provider: det, base: p.base, model: p.model, connectedAt: 0 });
      render();
      document.getElementById('s-key')?.focus();
    }
  }
  if (ev.target.id === 'sess-notes') state.sess.notes = ev.target.value;
  if (ev.target.id === 'sess-plan') state.sess.plan = ev.target.value;
  if (ev.target.id === 'prep-text') state.prep.text = ev.target.value;
  if (ev.target.id === 'text' && state.draft) { state.draft.text = ev.target.value; saveDraftSoon(); }
  if (ev.target.id === 'aiok' && state.draft) { state.draft.ai = ev.target.checked; }
});
document.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (ev.target.id === 'lockForm') {
    const btn = ev.target.querySelector('button[type=submit]');
    const err = $('#lockErr');
    const pw = $('#pw').value;
    err.textContent = '';
    if (!state.hasVault) {
      if (pw.length < 8) { err.textContent = 'Bitte mindestens 8 Zeichen.'; return; }
      if (pw !== $('#pw2').value) { err.textContent = 'Die beiden Eingaben stimmen nicht überein.'; return; }
      btn.disabled = true; btn.textContent = 'Wird verschlüsselt…';
      const code = await vault.createVault(pw);
      state.hasVault = true;
      await enter();
      showCode(code);
      return;
    }
    btn.disabled = true; btn.textContent = 'Wird entschlüsselt…';
    if (await vault.unlock(pw)) return enter();
    err.textContent = 'Das war nicht die richtige Passphrase.';
    btn.disabled = false; btn.textContent = 'Öffnen';
    ev.target.classList.remove('shake'); void ev.target.offsetWidth; ev.target.classList.add('shake');
  }
  if (ev.target.id === 'recoverForm') {
    const err = $('#recErr');
    const btn = ev.target.querySelector('button[type=submit]');
    err.textContent = '';
    if ($('#recPw').value.length < 8) { err.textContent = 'Die neue Passphrase braucht mindestens 8 Zeichen.'; return; }
    if ($('#recPw').value !== $('#recPw2').value) { err.textContent = 'Die beiden neuen Passphrasen stimmen nicht überein.'; return; }
    btn.disabled = true;
    if (await vault.recoverWithCode($('#recCode').value, $('#recPw').value)) {
      closeModal();
      await enter();
      toast('Neue Passphrase gesetzt');
      return;
    }
    err.textContent = 'Dieser Schlüssel passt nicht. Prüfe, ob du ihn vollständig abgetippt hast.';
    btn.disabled = false;
  }
  if (ev.target.id === 'pwForm' || ev.target.id === 'codeForm') {
    const err = $('#authErr');
    const btn = ev.target.querySelector('button[type=submit]');
    err.textContent = '';
    const isPw = ev.target.id === 'pwForm';
    if (isPw && $('#pwNew').value.length < 8) { err.textContent = 'Die neue Passphrase braucht mindestens 8 Zeichen.'; return; }
    if (isPw && $('#pwNew').value !== $('#pwNew2').value) { err.textContent = 'Die beiden neuen Passphrasen stimmen nicht überein.'; return; }
    const auth = $('#authPw').value ? { pass: $('#authPw').value } : { bio: true };
    btn.disabled = true;
    state.bioBusy = true;
    try {
      if (isPw) {
        if (await vault.changePassphrase(auth, $('#pwNew').value)) { closeModal(); toast('Passphrase geändert'); return; }
      } else {
        const code = await vault.newRecoveryCode(auth);
        if (code) { closeModal(); showCode(code); return; }
      }
      err.textContent = 'Das war nicht die richtige Passphrase.';
    } catch (e) {
      err.textContent = e.name === 'NotAllowedError' || e.name === 'AbortError' ? 'Abgebrochen.' : 'Das hat nicht geklappt. Versuche es mit deiner Passphrase.';
    } finally {
      state.bioBusy = false;
      btn.disabled = false;
    }
  }
  if (ev.target.id === 'restoreForm' || ev.target.id === 'mergeForm') {
    const err = $('#bkErr');
    const btn = ev.target.querySelector('button[type=submit]');
    err.textContent = '';
    btn.disabled = true;
    try {
      let b;
      try { b = JSON.parse(await $('#bkFile').files[0].text()); } catch { b = null; }
      if (!vault.isBackup(b)) { err.textContent = 'Das ist keine Tend-Sicherung.'; return; }
      const raw = await vault.openBackup(b, $('#bkSecret').value);
      if (!raw) { err.textContent = 'Passphrase oder Schlüssel passen nicht zu dieser Sicherung.'; return; }
      if (ev.target.id === 'restoreForm') {
        await vault.adoptBackup(b, raw);
        state.hasVault = true;
        state.bioOn = false;
        closeModal();
        await enter();
        toast(`${b.entries.length} ${b.entries.length === 1 ? 'Eintrag' : 'Einträge'} wiederhergestellt`);
      } else {
        const { added, skipped } = await vault.mergeBackup(b, raw);
        const all = await vault.listEntries();
        state.entries = all.filter((x) => !x.kind);
        state.sessions = all.filter((x) => x.kind === 'therapy');
        state.preps = all.filter((x) => x.kind === 'prep');
        closeModal();
        render();
        toast(`${added} neu${skipped ? `, ${skipped} schon vorhanden` : ''}`);
      }
    } catch {
      err.textContent = 'Die Sicherung konnte nicht gelesen werden. Sie ist vielleicht beschädigt.';
    } finally {
      btn.disabled = false;
    }
  }
  if (ev.target.id === 'bioForm') {
    if (state.bioBusy) return;
    const btn = ev.target.querySelector('button[type=submit]');
    const err = $('#bioErr');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Warte auf den Sensor…';
    state.bioBusy = true;
    try {
      if (await vault.enableBio($('#bioPw').value)) {
        state.bioOn = true;
        closeModal();
        render();
        toast('Fingerabdruck ist eingerichtet');
        return;
      }
      err.textContent = 'Das war nicht die richtige Passphrase.';
    } catch (e) {
      err.textContent = e instanceof BioUnsupported ? e.message
        : e.name === 'NotAllowedError' || e.name === 'AbortError' ? 'Abgebrochen. Du kannst es jederzeit noch einmal versuchen.'
          : 'Das Einrichten hat nicht geklappt. Du kannst weiter deine Passphrase nutzen.';
    } finally {
      state.bioBusy = false;
    }
    btn.disabled = false;
    btn.textContent = 'Weiter';
  }
  if (ev.target.id === 'themeForm') {
    const v = $('#themeIn').value;
    if (v.trim()) { addUnique((themeObj().themes ||= []), v); themesChanged(); }
  }
  if (ev.target.id === 'replyForm') {
    const i = $('#reply');
    const t = i.value.trim();
    if (t && !state.busy) askAi(t);
  }
});

/* Auto-Sperre & Sichtschutz im App-Wechsler */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    state.hiddenAt = Date.now();
    if (vault.isUnlocked()) cover.hidden = false;
  } else {
    cover.hidden = true;
    const away = Date.now() - state.hiddenAt;
    if (vault.isUnlocked() && !state.connecting && !state.bioBusy && !state.noLock && away >= state.settings.autoLockMin * 60000 && state.hiddenAt) { lockApp(); tryBio(); }
  }
});
const uncover = () => { if (!document.hidden) cover.hidden = true; };
addEventListener('focus', uncover);
addEventListener('pageshow', uncover);
cover.addEventListener('pointerdown', () => { cover.hidden = true; });
setInterval(() => {
  uncover();
  if (vault.isUnlocked() && !state.connecting && !state.bioBusy && !state.noLock && state.settings.autoLockMin > 0 && Date.now() - state.last > state.settings.autoLockMin * 60000) lockApp();
}, 15000);
document.addEventListener('keyup', (ev) => {
  const hint = document.getElementById('capsHint');
  if (hint && ev.getModifierState) hint.hidden = !ev.getModifierState('CapsLock');
});
['keydown', 'pointerdown', 'scroll'].forEach((t) => addEventListener(t, () => { state.last = Date.now(); }, { passive: true }));

/* Start */
(async () => {
  state.hasVault = await vault.hasVault();
  [state.bioAvail, state.bioOn, state.hasRec] = await Promise.all([bioAvailable(), state.hasVault ? vault.hasBio() : false, state.hasVault ? vault.hasRecovery() : false]);
  state.view = 'lock';
  render();
  tryBio();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    try { sessionStorage.removeItem('tend-repaired'); } catch { /* Nur die Reparatur-Sperre aus boot.js */ }
    const hadWorker = !!navigator.serviceWorker.controller;
    // Neue Version aktiv: auf dem Sperrbildschirm direkt neu laden, sonst nie mitten im Schreiben.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadWorker) return;
      if (state.view === 'lock' && !$('#pw')?.value) { location.reload(); return; }
      if ($('.update-bar')) return;
      const bar = document.createElement('div');
      bar.className = 'update-bar';
      bar.setAttribute('role', 'status');
      bar.innerHTML = '<span>Neue Version bereit</span><button class="btn" data-a="reloadApp">Neu laden</button>';
      document.body.appendChild(bar);
    });
  }
})();
