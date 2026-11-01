/**
 * Script Classroom — da creare con l'account della SCUOLA (quello che vede i corsi Classroom).
 * Solo lettura su Classroom: non pubblica, non modifica, non commenta nulla.
 * - Ogni 15 minuti invia al backend personale lo stato delle classi (ultimo contenuto, esercitazione aperta).
 * - Dalle 15:00 (ogni 5 minuti finché non riesce, quindi anche appena lo script torna attivo) invia il contesto delle
 *   classi del prossimo giorno di lezione (calendario scolastico dal backend) e il backend compila il Report lezioni,
 *   una volta sola. Nessun nuovo tentativo automatico che consumi credito: le classi finite in errore si richiedono
 *   solo quando il docente preme «Riprova» nell'app. Se Classroom non si legge, il problema va al backend e nell'app.
 * - Ogni mattina alle 6 programma un'esecuzione 5 minuti dopo la fine di ogni blocco di ore (orario dal backend);
 *   a quell'ora raccoglie i contenuti dello stream creati o modificati dal docente dalla lezione precedente della
 *   classe e li invia al backend, che genera la firma con Claude.
 * - Ogni 15 minuti (6–23) invia al backend le mail nuove della casella della scuola: il backend fa valutare a Claude
 *   quali chiedono un adempimento al docente e solo quelle compaiono in Scadenze. Le altre vengono ignorate.
 * - Verifiche dell'anno (sezione Verifiche dell'app): solo su richiesta. Quando nell'app si preme «Aggiorna», il backend
 *   segna la richiesta; ogni 5 minuti questo script la controlla e, se è nuova, rilegge Classroom e invia l'elenco.
 * Script Properties: ENDPOINT (URL /exec del backend personale), TOKEN (lo stesso del backend).
 * Setup: verifica() per autorizzare e controllare, poi installa().
 */
const CORSI = { '5I': '712801710784', '5B': '552091893632', '4B': '806304898653', '4C': '801501598554' }; // ID dei corsi Classroom
// Archivio degli esercizi degli anni precedenti (dalla skill prepara-lezioni): quarte → 5I "C++ (Classe Quarta)"; quinte → vecchia 5B "LINGUAGGIO SQL".
const ARCHIVIO = {
  quarte: { corso: '712801710784', topic: '814342467308', nota: '5I · C++ (Classe Quarta)', ext: /\.(cpp|c|h)$/i },
  quinte: { corso: '546864434898', topic: '717560957883', nota: 'vecchia 5B · LINGUAGGIO SQL', ext: /\.sql$/i }
};
const ESEMPI_MAX = 4; // soluzioni del docente passate a Claude come esempi di stile
const REPORT_ORA_MIN = 15 * 60;  // il report del prossimo giorno di lezione parte alle 15:00
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
  try { const v = verifiche_(); Logger.log('Verifiche dell\'anno: %s · %s', v.length, v.map(x => x.classe + ' ' + x.data + ' ' + x.titolo).join(' | ')); Logger.log('Invio verifiche: ' + JSON.stringify(inviaVerifiche())); }
  catch (e) { Logger.log('Verifiche → ERRORE: %s', e.message); }
  Object.keys(ARCHIVIO).forEach(t => { try { const a = archivio_(ARCHIVIO[t], mioId_()), es = esempiStile_(a); Logger.log('Archivio %s (%s): %s esercizi, %s soluzioni, esempi di stile letti: %s', t, ARCHIVIO[t].nota, a.length, a.soluzioni.length, es.map(x => x.nome).join(', ') || 'nessuno'); } catch (e) { Logger.log('Archivio %s → ERRORE: %s', t, e.message); } });
  try { Logger.log('Posta della scuola: %s mail negli ultimi 2 giorni', GmailApp.search(QUERY_POSTA + ' newer_than:2d', 0, 50).length); Logger.log('Invio posta: ' + JSON.stringify(postaScuola())); }
  catch (e) { Logger.log('Posta della scuola → ERRORE: %s', e.message); }
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
  const o = orarioCal_(backendGet_());
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
  if (m % 15 < 5 && h >= 6 && h < 23) postaScuola();
  controllaRichiestaVerifiche();
  if (h >= 8 && h < 16) firmeDovute(); // rete di sicurezza se un trigger puntuale non è partito
  if (h >= 8 && h < 23) controllaReport();
}

/* ---------- report lezioni ---------- */
function controllaReport() {
  const snap = backendGet_(), o = orarioCal_(snap); if (!o || !o.settimana) return;
  const adesso = new Date(), min = adesso.getHours() * 60 + adesso.getMinutes();
  const target = prossimoGiorno_(o, adesso); if (!target) return;
  const dataT = iso_(target), rep = snap.report && snap.report.data === dataT ? snap.report : null;
  const fatto = rep && (rep.generato || rep.inCorso) ? rep : null;
  if (fatto && fatto.inCorso && !fatto.generato) return; // generazione già in corso sul backend
  if (!fatto) { // una volta sola, dalle 15:00; se lo script era fermo, appena riparte
    if (min >= REPORT_ORA_MIN) inviaReport_(o, target, 'nuovo', null, verificheDel_(snap, dataT), inizioAnno_(snap));
    return;
  }
  // nuovo tentativo solo su richiesta del docente («Riprova» nell'app), per le sole classi finite in errore
  const inErrore = Object.keys(fatto.classi || {}).filter(k => fatto.classi[k] && fatto.classi[k].errore);
  const rich = fatto.riprova;
  if (inErrore.length && rich && rich.at !== P_().getProperty('RIPROVA_FATTA')) {
    P_().setProperty('RIPROVA_FATTA', rich.at);
    inviaReport_(o, target, 'riprova', inErrore, verificheDel_(snap, dataT), inizioAnno_(snap));
  }
}
// Ogni problema (Classroom illeggibile, backend che rifiuta) va al backend e compare nell'app; leggere Classroom non
// consuma credito, quindi al giro successivo (5 minuti) si riprova da soli. Claude parte solo con un invio riuscito.
// Verifiche del docente in agenda ClasseViva per quel giorno (dallo snapshot del backend): per quelle classi il report
// segnala solo la verifica ed elenca gli argomenti dell'anno da Classroom, senza Claude (la verifica la prepara il docente).
const verificheDel_ = (snap, data) => ((snap.agenda && snap.agenda.eventi) || []).filter(e => e && e.verifica && e.data === data);
const inizioAnno_ = snap => (snap.calendario && snap.calendario.inizio) || '2026-09-01';
function inviaReport_(o, target, tipo, soloClassi, verifiche, inizio) {
  const data = iso_(target);
  let ctx;
  try { ctx = contesto_(o, target, verifiche || [], inizio); }
  catch (e) { Logger.log('Report per %s: Classroom non leggibile: %s', data, e.message); backendPost_({ azione: 'report_problema', data, errore: 'Classroom non leggibile dallo script della scuola: ' + e.message }); return; }
  const classi = soloClassi ? ctx.classi.filter(k => soloClassi.includes(k.classe)) : ctx.classi;
  const r = backendPost_({ azione: 'report', data, tipo, hash: ctx.hash, hashClassi: ctx.hashClassi, classi });
  Logger.log('Report %s per %s: %s', tipo, data, JSON.stringify(r));
  if (!r || r.errore) backendPost_({ azione: 'report_problema', data, errore: 'il backend non ha accettato la richiesta: ' + ((r && r.errore) || 'nessuna risposta') });
}
// Prossimo giorno con lezioni (salta domeniche, festività e sospensioni del calendario scolastico).
function prossimoGiorno_(o, d) {
  for (let i = 1; i <= 20; i++) { const x = new Date(d.getTime() + i * 864e5); if (blocchi_(o, x).length) return x; }
  return null;
}
// Per ogni classe del giorno: ultimi contenuti dello stream del docente + archivio esercizi. Gli hash dello stream
// (complessivo e per classe) restano nel report come riferimento.
const md5_ = s => Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s).map(x => ((x + 256) % 256).toString(16).padStart(2, '0')).join('');
function contesto_(o, target, verifiche, inizio) {
  const me = mioId_(), visti = [], classi = [], archivi = {}, esempi = {}, hashClassi = {};
  blocchi_(o, target).forEach(b => {
    const gia = classi.find(c => c.classe === b.cls); if (gia) { gia.ore = gia.ore.concat(b.ore); return; }
    const ver = (verifiche || []).filter(e => e.classe === b.cls);
    if (ver.length) { // giorno di verifica: niente stream né archivio, solo gli argomenti dell'anno
      classi.push({ classe: b.cls, ore: b.ore.slice(), lab: b.lab, verifica: ver.map(e => ({ testo: String(e.testo || '').replace(/\s+/g, ' ').trim().slice(0, 300), ore: e.ore || [], giornata: !!e.giornata })), argomenti: argomentiAnno_(CORSI[b.cls], me, inizio) });
      return;
    }
    const recenti = stream_(CORSI[b.cls], me, 15);
    const vc = recenti.map(x => b.cls + x.id + x.agg); visti.push(...vc); hashClassi[b.cls] = md5_(vc.sort().join('|'));
    const tipo = b.cls.charAt(0) === '4' ? 'quarte' : 'quinte';
    if (!archivi[tipo]) { try { archivi[tipo] = archivio_(ARCHIVIO[tipo], me); } catch (e) { archivi[tipo] = []; } esempi[tipo] = esempiStile_(archivi[tipo]); }
    classi.push({ classe: b.cls, ore: b.ore.slice(), lab: b.lab, recenti: recenti.map(x => { const y = Object.assign({}, x); delete y.id; delete y.agg; return y; }), archivio: archivi[tipo], noteArchivio: ARCHIVIO[tipo].nota, esempi: esempi[tipo] });
  });
  return { hash: md5_(visti.sort().join('|')), hashClassi, classi };
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
  const out = [], sol = []; let tok;
  do {
    const r = Classroom.Courses.CourseWork.list(a.corso, { pageSize: 100, pageToken: tok });
    (r.courseWork || []).filter(x => x.topicId === a.topic && x.creatorUserId === me).forEach(x => {
      out.push({ titolo: x.title || '', testo: String(x.description || '').slice(0, 700), creato: Utilities.formatDate(new Date(x.creationTime), TZ, 'dd/MM/yyyy'), allegati: allegati_(x) });
      (x.materials || []).forEach(m => { const f = m.driveFile && m.driveFile.driveFile; if (f && f.id && a.ext.test(f.title || '')) sol.push({ id: f.id, nome: f.title, esercizio: x.title || '', t: x.creationTime }); });
    });
    tok = r.nextPageToken;
  } while (tok && out.length < 80);
  out.sort((p, q) => p.creato.split('/').reverse().join('').localeCompare(q.creato.split('/').reverse().join('')));
  out.soluzioni = sol.sort((p, q) => q.t.localeCompare(p.t)); // non va nel JSON: serve a esempiStile_
  return out;
}
// Esempi di stile per le soluzioni scritte da Claude nel report: le soluzioni più recenti del docente nell'archivio
// (.cpp per le quarte, .sql per le quinte), lette da Drive. Senza autorizzazione Drive il report parte senza esempi.
function esempiStile_(arch) {
  const out = []; let tot = 0;
  for (const f of (arch.soluzioni || [])) {
    if (out.length >= ESEMPI_MAX || tot > 12000) break;
    try {
      const t = DriveApp.getFileById(f.id).getBlob().getDataAsString().replace(/\r\n/g, '\n').slice(0, 4000);
      if (t.trim()) { out.push({ nome: f.nome, esercizio: f.esercizio, contenuto: t }); tot += t.length; }
    } catch (e) { Logger.log('Esempio di stile %s non leggibile: %s', f.nome, e.message); }
  }
  return out;
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

/* Argomenti affrontati dall'inizio dell'anno: esercitazioni e materiali del docente su Classroom, raggruppati per
   argomento di Classroom (o per mese, se non hanno argomento), in ordine di data. Le verifiche stesse sono escluse. */
function argomentiAnno_(id, me, inizio) {
  const nomi = {}; let tok;
  do { const r = Classroom.Courses.Topics.list(id, { pageSize: 100, pageToken: tok }); (r.topic || []).forEach(t => { nomi[t.topicId] = t.name; }); tok = r.nextPageToken; } while (tok);
  const voci = [], da = inizio + 'T00:00:00Z';
  const prendi = x => { if (x.creatorUserId === me && x.creationTime >= da && !eVerifica_(x.title || '')) voci.push({ t: x.creationTime, titolo: (x.title || '').slice(0, 90), topic: x.topicId || '' }); };
  tok = null; do { const r = Classroom.Courses.CourseWork.list(id, { pageSize: 100, pageToken: tok }); (r.courseWork || []).forEach(prendi); tok = r.nextPageToken; } while (tok);
  tok = null; do { const r = Classroom.Courses.CourseWorkMaterials.list(id, { pageSize: 100, pageToken: tok }); (r.courseWorkMaterial || []).forEach(prendi); tok = r.nextPageToken; } while (tok);
  voci.sort((p, q) => p.t.localeCompare(q.t));
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const gruppi = [], dm = t => Utilities.formatDate(new Date(t), TZ, 'dd/MM');
  voci.forEach(v => {
    const nome = nomi[v.topic] || 'Senza argomento · ' + MESI[Number(Utilities.formatDate(new Date(v.t), TZ, 'M')) - 1];
    let g = gruppi.find(x => x.a === nome); if (!g) { g = { a: nome, dal: dm(v.t), al: dm(v.t), voci: [] }; gruppi.push(g); }
    g.al = dm(v.t); g.voci.push(v.titolo);
  });
  return gruppi.slice(-30).map(g => { let t = g.voci.join(' · '); if (t.length > 400) t = t.slice(0, 397).replace(/ · [^·]*$/, '') + ' · …'; return { a: g.a, dal: g.dal, al: g.al, n: g.voci.length, voci: t }; });
}

/* ---------- verifiche ---------- */
// Compiti del docente dal 1° settembre dell'anno scolastico in corso con "VERIFICA" nel titolo e il titolo tutto
// in maiuscolo (il docente scrive così le verifiche), esclusi ripassi ed esercitazioni di preparazione.
// Data della verifica = data di consegna se c'è, altrimenti di pubblicazione.
const RE_VERIFICA = /verific/i, RE_NON_VERIFICA = /prepara|ripasso|simulaz|in vista/i;
const maiuscolo_ = t => (t.match(/\p{L}/gu) || []).length >= 4 && t === t.toUpperCase();
const eVerifica_ = t => !RE_NON_VERIFICA.test(t) && RE_VERIFICA.test(t) && maiuscolo_(t);
function verifiche_() {
  const me = mioId_(), oggi = new Date(), out = [], g = d => [d.year, String(d.month).padStart(2, '0'), String(d.day).padStart(2, '0')].join('-');
  const inizio = new Date(oggi.getMonth() >= 8 ? oggi.getFullYear() : oggi.getFullYear() - 1, 8, 1).toISOString();
  Object.keys(CORSI).forEach(cls => {
    let tok;
    do {
      const r = Classroom.Courses.CourseWork.list(CORSI[cls], { pageSize: 100, pageToken: tok });
      (r.courseWork || []).filter(x => x.creatorUserId === me && x.creationTime >= inizio && eVerifica_(x.title || '')).forEach(x => {
        const pubbl = new Date(x.scheduledTime || x.creationTime);
        out.push({ id: x.id, classe: cls, titolo: x.title || '', data: x.dueDate ? g(x.dueDate) : iso_(pubbl),
          pubblicata: Utilities.formatDate(pubbl, TZ, 'yyyy-MM-dd HH:mm'), scadenza: x.dueDate ? g(x.dueDate) : '',
          testo: String(x.description || '').slice(0, 1500), allegati: allegati_(x), punti: x.maxPoints || null, link: x.alternateLink || '' });
      });
      tok = r.nextPageToken;
    } while (tok);
  });
  return out.sort((a, b) => (a.data + a.pubblicata).localeCompare(b.data + b.pubblicata));
}
// Richiesta dall'app (pulsante «Aggiorna» nella sezione Verifiche): si rilegge Classroom solo se è nuova.
function controllaRichiestaVerifiche() {
  const r = UrlFetchApp.fetch(P_().getProperty('ENDPOINT') + '?richiesta_verifiche=1&token=' + encodeURIComponent(P_().getProperty('TOKEN')), { muteHttpExceptions: true, followRedirects: true });
  let j; try { j = JSON.parse(r.getContentText()); } catch (e) { return; }
  if (!j.richiesta || j.richiesta === P_().getProperty('VER_FATTA')) return;
  P_().setProperty('VER_FATTA', j.richiesta);
  Logger.log('Verifiche richieste dall\'app: ' + JSON.stringify(inviaVerifiche()));
}
function inviaVerifiche() {
  let verifiche = [], errore = null;
  try { verifiche = verifiche_(); } catch (e) { errore = 'Classroom non raggiungibile: ' + e.message; }
  return backendPost_({ azione: 'verifiche', verifiche, errore });
}

/* ---------- posta della scuola ---------- */
// Mail arrivate nella casella della scuola dall'ultimo invio riuscito (al primo avvio: ultimi 3 giorni).
// Escluse promozioni/social, le mail inviate dal docente e le notifiche ClasseViva (le legge già il backend personale).
const QUERY_POSTA = '-in:sent -in:chats -in:spam -in:trash -category:promotions -category:social -from:notification@spaggiari.eu';
const POSTA_MAX = 15; // mail per invio: la valutazione con Claude deve stare nei tempi di una richiesta
function postaScuola() {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return { saltato: 'già in corso' };
  try {
    const da = Number(P_().getProperty('POSTA_DA') || Math.floor(Date.now() / 1000) - 3 * 86400);
    const visti = JSON.parse(P_().getProperty('POSTA_VISTI') || '[]'), me = Session.getActiveUser().getEmail().toLowerCase();
    const mail = [];
    GmailApp.search(QUERY_POSTA + ' after:' + (da - 600), 0, 50).forEach(th => th.getMessages().forEach(m => {
      if (m.isInTrash() || m.getDate().getTime() / 1000 < da - 600 || visti.includes(m.getId()) || m.getFrom().toLowerCase().includes(me)) return;
      mail.push({ id: m.getId(), da: m.getFrom(), a: m.getTo(), oggetto: m.getSubject() || '', data: Utilities.formatDate(m.getDate(), TZ, 'dd/MM/yyyy HH:mm'),
        testo: m.getPlainBody().replace(/\n{3,}/g, '\n\n').slice(0, 2500), allegati: m.getAttachments({ includeInlineImages: false }).map(x => x.getName()).slice(0, 8), t: m.getDate().getTime() });
    }));
    mail.sort((p, q) => p.t - q.t);
    const lotto = mail.slice(0, POSTA_MAX);
    const r = backendPost_({ azione: 'posta_scuola', account: me, mail: lotto.map(x => { const y = Object.assign({}, x); delete y.t; return y; }) });
    if (!r || !r.ok) { Logger.log('Posta della scuola: invio fallito %s', JSON.stringify(r)); return r; }
    // si avanza solo dopo un invio riuscito; gli id già inviati evitano doppioni nella finestra di sovrapposizione
    const nuovi = visti.concat(lotto.map(x => x.id)).slice(-300);
    P_().setProperty('POSTA_VISTI', JSON.stringify(nuovi));
    P_().setProperty('POSTA_DA', String(lotto.length < mail.length ? Math.floor(lotto[lotto.length - 1].t / 1000) : Math.floor(Date.now() / 1000)));
    return { ok: true, inviate: lotto.length, restano: mail.length - lotto.length, adempimenti: r.adempimenti };
  } finally { lock.releaseLock(); }
}

/* ---------- orario ---------- */
// L'orario settimanale con il calendario scolastico del backend (giorni senza lezioni).
function orarioCal_(snap) { return snap.orario ? Object.assign({}, snap.orario, { calendario: snap.calendario || null }) : null; }
function senzaLezioni_(o, d) {
  const c = o.calendario; if (!c) return null;
  const g = iso_(d);
  if ((c.inizio && g < c.inizio) || (c.fine && g > c.fine)) return 'fuori dall\'anno scolastico';
  const s = (c.sospensioni || []).find(x => g >= x.da && g <= x.a);
  return s ? s.motivo : null;
}
function blocchi_(o, d) {
  if (senzaLezioni_(o, d)) return [];
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
