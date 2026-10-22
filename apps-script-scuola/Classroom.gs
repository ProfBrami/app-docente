/**
 * Script Classroom — da creare con l'account della SCUOLA (quello che vede i corsi Classroom).
 * Solo lettura su Classroom: non pubblica, non modifica, non commenta nulla.
 * - Ogni 15 minuti invia al backend personale lo stato delle classi (ultimo contenuto, esercitazione aperta).
 * - Ogni 5 minuti controlla se tutte le firme di oggi sono segnate come firmate (o se sono le 18): allora invia il
 *   contesto delle classi del prossimo giorno di scuola e il backend compila il Report lezioni. Alle 20 ricontrolla
 *   gli stream e, se qualcosa è cambiato, lo fa rigenerare.
 * - Ogni mattina alle 6 programma un'esecuzione 5 minuti dopo la fine di ogni blocco di ore (orario dal backend);
 *   a quell'ora raccoglie i contenuti dello stream creati o modificati dal docente dalla lezione precedente della
 *   classe e li invia al backend, che genera la firma con Claude.
 * Script Properties: ENDPOINT (URL /exec del backend personale), TOKEN (lo stesso del backend).
 * Setup: verifica() per autorizzare e controllare, poi installa().
 */
const CORSI = { '5I': '712801710784', '5B': '552091893632', '4B': '806304898653', '4C': '801501598554' }; // ID dei corsi Classroom
// Archivio degli esercizi degli anni precedenti (dalla skill prepara-lezioni): quarte → 5I "C++ (Classe Quarta)"; quinte → vecchia 5B "LINGUAGGIO SQL".
const ARCHIVIO = {
  quarte: { corso: '712801710784', topic: '814342467308', nota: '5I · C++ (Classe Quarta)' },
  quinte: { corso: '546864434898', topic: '717560957883', nota: 'vecchia 5B · LINGUAGGIO SQL' }
};
const REPORT_ORA_MIN = 18 * 60;  // se non tutte le firme risultano firmate, il report parte comunque alle 18:00
const CONTROLLO_ORA_MIN = 20 * 60; // alle 20:00 si ricontrollano gli stream
const TZ = 'Europe/Rome';
const PRONTA_MIN = 5;
const P_ = () => PropertiesService.getScriptProperties();
const iso_ = d => Utilities.formatDate(d, TZ, 'yyyy-MM-dd');

function verifica() {
  Logger.log('Account: ' + Session.getActiveUser().getEmail());
  Logger.log('ENDPOINT impostato: %s · TOKEN impostato: %s', !!P_().getProperty('ENDPOINT'), !!P_().getProperty('TOKEN'));
  Object.keys(CORSI).forEach(cls => {
    try { const c = Classroom.Courses.get(CORSI[cls]); Logger.log('%s → corso "%s" (%s)', cls, c.name, c.courseState); }
    catch (e) { Logger.log('%s → ERRORE: %s', cls, e.message); }
  });
  const snap = backendGet_();
  Logger.log('Backend raggiungibile · orario: ' + (snap.orario ? 'presente' : 'MANCANTE'));
  Logger.log('Invio stato classi: ' + JSON.stringify(inviaStato()));
  Object.keys(ARCHIVIO).forEach(t => { try { Logger.log('Archivio %s (%s): %s esercizi', t, ARCHIVIO[t].nota, archivio_(ARCHIVIO[t], mioId_()).length); } catch (e) { Logger.log('Archivio %s → ERRORE: %s', t, e.message); } });
}

function installa() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('programma').timeBased().everyDays(1).atHour(6).inTimezone(TZ).create();
  ScriptApp.newTrigger('ciclo').timeBased().everyMinutes(5).create();
  programma();
}

/* Programma le esecuzioni di oggi: 5 minuti dopo la fine di ogni blocco di ore consecutive nella stessa classe. */
function programma() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'firmeDovute').forEach(t => ScriptApp.deleteTrigger(t));
  const o = backendGet_().orario;
  if (!o || !o.settimana) throw new Error('orario non disponibile dal backend (orario.json su Drive)');
  const oggi = new Date(), blocchi = blocchi_(o, oggi);
  P_().setProperty('OGGI', JSON.stringify({ data: iso_(oggi), blocchi, orario: o }));
  blocchi.forEach(b => { const t = pronta_(oggi, b); if (t > new Date()) ScriptApp.newTrigger('firmeDovute').timeBased().at(t).create(); });
  Logger.log('Blocchi di oggi: ' + JSON.stringify(blocchi.map(b => b.cls + ' ' + b.ore.join('-') + 'ª → ' + Utilities.formatDate(pronta_(oggi, b), TZ, 'HH:mm'))));
}

/* Invia al backend i contenuti di ogni blocco già concluso da 5 minuti e non ancora inviato. */
function firmeDovute() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(60000)) return;
  try {
    let st = JSON.parse(P_().getProperty('OGGI') || 'null');
    if (!st || st.data !== iso_(new Date())) { programma(); st = JSON.parse(P_().getProperty('OGGI')); }
    const chiave = 'INVIATE_' + st.data, inviate = JSON.parse(P_().getProperty(chiave) || '[]'), adesso = new Date();
    st.blocchi.filter(b => adesso >= pronta_(new Date(st.data + 'T12:00:00'), b) && !inviate.includes(b.first)).forEach(b => {
      const da = inizioFinestra_(st.orario, st.data, b);
      const req = { azione: 'genera', data: st.data, ora: b.first, classe: b.cls, ore: b.ore, num: b.ore.length, lab: b.lab, da: da.toISOString(), a: adesso.toISOString() };
      try { req.items = streamDiff_(b.cls, da, adesso); }
      catch (e) { req.errore = 'Classroom non raggiungibile: ' + e.message; }
      const r = backendPost_(req);
      if (r && r.ok) inviate.push(b.first); else Logger.log('Invio fallito per %s: %s', b.cls, JSON.stringify(r));
    });
    P_().setProperty(chiave, JSON.stringify(inviate));
  } finally { lock.releaseLock(); }
}

function ciclo() {
  const adesso = new Date(), h = Number(Utilities.formatDate(adesso, TZ, 'H')), m = Number(Utilities.formatDate(adesso, TZ, 'm'));
  if (m % 15 < 5) inviaStato();
  if (h >= 8 && h < 16) firmeDovute(); // rete di sicurezza se un trigger puntuale non è partito
  if (h >= 8 && h < 23) controllaReport();
}

/* ---------- report lezioni ---------- */
function controllaReport() {
  const snap = backendGet_(), o = snap.orario; if (!o || !o.settimana) return;
  const adesso = new Date(), oggi = iso_(adesso), min = adesso.getHours() * 60 + adesso.getMinutes();
  const target = prossimoGiorno_(o, adesso); if (!target) return;
  const dataT = iso_(target), rep = snap.report && snap.report.data === dataT ? snap.report : null;
  const firme = (snap.firme || {})[oggi] || {}, bl = blocchi_(o, adesso);
  const tutteFirmate = bl.length > 0 && bl.every(b => firme[String(b.first)] && firme[String(b.first)].firmata);
  if (rep && rep.inCorso && !rep.generato) return; // generazione già in corso sul backend
  if (!rep) {
    if (tutteFirmate || min >= REPORT_ORA_MIN) inviaReport_(o, target, 'nuovo');
  } else if (min >= CONTROLLO_ORA_MIN && !rep.controllo20 && !(rep.generato && new Date(rep.generato).getHours() * 60 + new Date(rep.generato).getMinutes() >= CONTROLLO_ORA_MIN)) {
    const ctx = contesto_(o, target);
    if (ctx.hash !== rep.hash) inviaReport_(o, target, 'aggiornamento', ctx);
    else backendPost_({ azione: 'report_verificato', data: dataT });
  }
}
function inviaReport_(o, target, tipo, ctx) {
  ctx = ctx || contesto_(o, target);
  const r = backendPost_({ azione: 'report', data: iso_(target), tipo, hash: ctx.hash, classi: ctx.classi });
  Logger.log('Report %s per %s: %s', tipo, iso_(target), JSON.stringify(r));
}
function prossimoGiorno_(o, d) {
  for (let i = 1; i <= 10; i++) { const x = new Date(d.getTime() + i * 864e5); if (blocchi_(o, x).length) return x; }
  return null;
}
// Per ogni classe del giorno: ultimi contenuti dello stream del docente + archivio esercizi. L'hash dello stream serve al controllo delle 20.
function contesto_(o, target) {
  const me = mioId_(), visti = [], classi = [], archivi = {};
  blocchi_(o, target).forEach(b => {
    const gia = classi.find(c => c.classe === b.cls); if (gia) { gia.ore = gia.ore.concat(b.ore); return; }
    const recenti = stream_(CORSI[b.cls], me, 15);
    recenti.forEach(x => visti.push(b.cls + x.id + x.agg));
    const tipo = b.cls.charAt(0) === '4' ? 'quarte' : 'quinte';
    if (!archivi[tipo]) { try { archivi[tipo] = archivio_(ARCHIVIO[tipo], me); } catch (e) { archivi[tipo] = []; } }
    classi.push({ classe: b.cls, ore: b.ore.slice(), lab: b.lab, recenti: recenti.map(x => { const y = Object.assign({}, x); delete y.id; delete y.agg; return y; }), archivio: archivi[tipo], noteArchivio: ARCHIVIO[tipo].nota });
  });
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, visti.sort().join('|')).map(x => ((x + 256) % 256).toString(16).padStart(2, '0')).join('');
  return { hash, classi };
}
const allegati_ = x => (x.materials || []).map(m => {
  if (m.driveFile && m.driveFile.driveFile) return { titolo: m.driveFile.driveFile.title, url: m.driveFile.driveFile.alternateLink || '' };
  if (m.link) return { titolo: m.link.title || m.link.url, url: m.link.url };
  if (m.youtubeVideo) return { titolo: m.youtubeVideo.title, url: m.youtubeVideo.alternateLink || '' };
  if (m.form) return { titolo: m.form.title, url: m.form.formUrl || '' };
  return null;
}).filter(Boolean);
function stream_(id, me, n) {
  const out = [], f = (tipo, x, testo) => out.push({ id: x.id, agg: x.updateTime, tipo, titolo: x.title || '', testo: String(testo || '').slice(0, 900),
    creato: Utilities.formatDate(new Date(x.creationTime), TZ, 'dd/MM/yyyy HH:mm'), modificato: Utilities.formatDate(new Date(x.updateTime), TZ, 'dd/MM/yyyy HH:mm'),
    allegati: allegati_(x), scadenza: x.dueDate ? [x.dueDate.day, x.dueDate.month, x.dueDate.year].join('/') : '' });
  (Classroom.Courses.CourseWork.list(id, { pageSize: n, orderBy: 'updateTime desc' }).courseWork || []).filter(x => x.creatorUserId === me).forEach(x => f('esercitazione', x, x.description));
  (Classroom.Courses.CourseWorkMaterials.list(id, { pageSize: n, orderBy: 'updateTime desc' }).courseWorkMaterial || []).filter(x => x.creatorUserId === me).forEach(x => f('materiale', x, x.description));
  (Classroom.Courses.Announcements.list(id, { pageSize: 8, orderBy: 'updateTime desc' }).announcements || []).filter(x => x.creatorUserId === me).forEach(x => f('annuncio', x, x.text));
  return out.sort((a, b) => b.agg.localeCompare(a.agg)).slice(0, n);
}
function archivio_(a, me) {
  const out = []; let tok;
  do {
    const r = Classroom.Courses.CourseWork.list(a.corso, { pageSize: 100, pageToken: tok });
    (r.courseWork || []).filter(x => x.topicId === a.topic && x.creatorUserId === me).forEach(x => out.push({
      titolo: x.title || '', testo: String(x.description || '').slice(0, 700), creato: Utilities.formatDate(new Date(x.creationTime), TZ, 'dd/MM/yyyy'), allegati: allegati_(x) }));
    tok = r.nextPageToken;
  } while (tok && out.length < 80);
  return out.sort((p, q) => p.creato.split('/').reverse().join('').localeCompare(q.creato.split('/').reverse().join('')));
}

/* Stato sintetico delle classi per la sezione "Stato classi". */
function inviaStato() {
  const classi = {}; let errore = null;
  try {
    const me = mioId_();
    Object.keys(CORSI).forEach(cls => {
      const c = Classroom.Courses.get(CORSI[cls]);
      const cw = (Classroom.Courses.CourseWork.list(CORSI[cls], { pageSize: 10, orderBy: 'updateTime desc' }).courseWork || []).filter(x => x.creatorUserId === me);
      const mat = (Classroom.Courses.CourseWorkMaterials.list(CORSI[cls], { pageSize: 10, orderBy: 'updateTime desc' }).courseWorkMaterial || []).filter(x => x.creatorUserId === me);
      const last = [...cw, ...mat].sort((a, b) => b.updateTime.localeCompare(a.updateTime))[0];
      classi[cls] = {
        ultimo: last ? Utilities.formatDate(new Date(last.updateTime), TZ, 'dd/MM') + ' · ' + last.title : '',
        aperta: cw[0] ? cw[0].title : '',
        link: c.alternateLink
      };
    });
  } catch (e) { errore = 'Classroom non raggiungibile: ' + e.message; }
  return backendPost_({ azione: 'classroom', classi, errore });
}

/* Contenuti con autore il docente, creati o modificati nell'intervallo [da, a]. */
function streamDiff_(cls, da, a) {
  const id = CORSI[cls], me = mioId_(), d0 = da.toISOString(), d1 = a.toISOString();
  const dentro = x => x.creatorUserId === me && ((x.creationTime >= d0 && x.creationTime <= d1) || (x.updateTime >= d0 && x.updateTime <= d1));
  const allegati = x => (x.materials || []).map(m => (m.driveFile && m.driveFile.driveFile && m.driveFile.driveFile.title) || (m.link && (m.link.title || m.link.url)) || (m.youtubeVideo && m.youtubeVideo.title) || (m.form && m.form.title)).filter(Boolean);
  const base = (tipo, x, testo) => ({
    tipo, stato: x.creationTime >= d0 ? 'nuovo' : 'modificato', titolo: x.title || '', testo: String(testo || '').slice(0, 1500),
    creato: Utilities.formatDate(new Date(x.creationTime), TZ, 'dd/MM HH:mm'), modificato: Utilities.formatDate(new Date(x.updateTime), TZ, 'dd/MM HH:mm'),
    allegati: allegati(x)
  });
  const out = [];
  (Classroom.Courses.CourseWork.list(id, { pageSize: 30, orderBy: 'updateTime desc' }).courseWork || []).filter(dentro).forEach(x => {
    const it = base('esercitazione', x, x.description);
    if (x.dueDate) it.scadenza = [x.dueDate.day, x.dueDate.month, x.dueDate.year].join('/');
    out.push(it);
  });
  (Classroom.Courses.CourseWorkMaterials.list(id, { pageSize: 30, orderBy: 'updateTime desc' }).courseWorkMaterial || []).filter(dentro).forEach(x => out.push(base('materiale', x, x.description)));
  (Classroom.Courses.Announcements.list(id, { pageSize: 30, orderBy: 'updateTime desc' }).announcements || []).filter(dentro).forEach(x => out.push(base('annuncio', x, x.text)));
  return out.sort((p, q) => p.modificato.localeCompare(q.modificato));
}

/* ---------- orario ---------- */
function blocchi_(o, d) {
  const x = o.settimana[String(d.getDay())] || {}, out = [];
  (o.ore || []).filter(h => x[h.n]).forEach(h => {
    const b = out[out.length - 1];
    if (b && b.cls === x[h.n] && b.ore[b.ore.length - 1] === h.n - 1) { b.ore.push(h.n); b.e = h.e; }
    else out.push({ cls: x[h.n], lab: (o.lab || {})[x[h.n]] || '', first: h.n, ore: [h.n], s: h.s, e: h.e });
  });
  return out;
}
const alle_ = (d, hhmm) => { const x = new Date(d); const [h, m] = hhmm.split(':').map(Number); x.setHours(h, m, 0, 0); return x; };
const pronta_ = (d, b) => new Date(alle_(d, b.e).getTime() + PRONTA_MIN * 60e3);
// La finestra parte da quando era pronta la firma della lezione precedente della stessa classe.
function inizioFinestra_(o, data, b) {
  const oggi = new Date(data + 'T12:00:00');
  const primaOggi = blocchi_(o, oggi).filter(x => x.cls === b.cls && x.first < b.first).pop();
  if (primaOggi) return pronta_(oggi, primaOggi);
  for (let i = 1; i <= 14; i++) {
    const d = new Date(oggi.getTime() - i * 864e5), prec = blocchi_(o, d).filter(x => x.cls === b.cls).pop();
    if (prec) return pronta_(d, prec);
  }
  return new Date(oggi.getTime() - 7 * 864e5);
}

/* ---------- comunicazione col backend ---------- */
function mioId_() {
  const c = CacheService.getScriptCache(), v = c.get('me');
  if (v) return v;
  const id = Classroom.UserProfiles.get('me').id; c.put('me', id, 21600); return id;
}
function backendGet_() {
  const r = UrlFetchApp.fetch(P_().getProperty('ENDPOINT') + '?token=' + encodeURIComponent(P_().getProperty('TOKEN')), { muteHttpExceptions: true, followRedirects: true });
  const j = JSON.parse(r.getContentText());
  if (j.errore) throw new Error('backend: ' + j.errore);
  return j;
}
function backendPost_(body) {
  body.token = P_().getProperty('TOKEN');
  const r = UrlFetchApp.fetch(P_().getProperty('ENDPOINT'), { method: 'post', contentType: 'text/plain', payload: JSON.stringify(body), muteHttpExceptions: true, followRedirects: true });
  try { return JSON.parse(r.getContentText()); } catch (e) { return { errore: 'HTTP ' + r.getResponseCode() }; }
}
