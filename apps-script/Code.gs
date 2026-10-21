/**
 * Backend Dashboard Docente — Google Apps Script.
 * Script Properties richieste: TOKEN (stringa lunga casuale: genera con creaToken()).
 * Facoltative (fase 2): ANTHROPIC_API_KEY (riassunti), CV_USER / CV_PASS (ClasseViva diretto).
 * Setup: esegui verifica() per autorizzare e vedere il risultato, poi installa(), poi Distribuisci → App web.
 * Lo snapshot è tenuto in CacheService (6 h, rinnovato dal trigger ogni 15 min): nessun file creato su Drive.
 */
const SNAP_KEY = 'snapshot';
const CACHE_TTL = 21600; // max consentito da CacheService
const GIORNI_POSTA = 30;
const CLASSI = ['4B', '4C', '5B', '5I'];
const PAROLE_MIE = ['caprini', 'arrakis', 'matrix', 'lab. 21', 'ufficio tecnico', 'orientamento', 'ricondizionamento', ...CLASSI.map(c => c.toLowerCase())];
const TZ = 'Europe/Rome';
const G3 = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

/* ---------- da eseguire a mano dall'editor ---------- */
function creaToken() {
  // Stampa un codice casuale: copialo in Impostazioni progetto → Proprietà script → TOKEN. Non viene salvato da nessuna parte.
  const t = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  Logger.log(t);
}
function verifica() {
  const s = aggiorna();
  Logger.log('Fonti: ' + JSON.stringify(s.meta.fonti, null, 1));
  Logger.log('Circolari: %s · Scadenze: %s · Classi: %s · Orientamento: %s · Orario: %s · Firme: %s',
    s.circolari.length, s.scadenze.length, Object.keys(s.classi).length, s.orientamento.length, s.orario ? 'sì' : 'no', s.firme ? 'sì' : 'no');
  Logger.log('Byte snapshot: ' + JSON.stringify(s).length);
  Logger.log('TOKEN impostato: ' + !!PropertiesService.getScriptProperties().getProperty('TOKEN'));
}
function installa() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'aggiorna').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('aggiorna').timeBased().everyMinutes(15).create();
  aggiorna();
}

/* ---------- web app ---------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const tok = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!tok || !uguali_(String(p.token || ''), tok)) return json_({ errore: 'non autorizzato' });
  const snap = p.refresh === '1' ? aggiorna() : (leggiSnap_() || aggiorna());
  return json_(snap);
}

function aggiorna() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { const s = leggiSnap_(); if (s) return s; }
  try {
    const fonti = {};
    const run = (nome, fn, vuoto) => {
      try { const r = fn(); fonti[nome] = { ok: true, errore: null, letti: r.letti || 0 }; return r; }
      catch (err) { fonti[nome] = { ok: false, errore: String(err.message || err).slice(0, 200), letti: 0 }; return vuoto; }
    };
    const posta = run('gmail', leggiPosta_, { circolari: [], scadenze: [], supplenze: null, ricondizionamento: null });
    const cr = run('classroom', leggiClassroom_, { classi: {} });
    const cal = run('calendar', leggiCalendario_, { scadenze: [], orientamento: [] });
    fonti.classeviva = { ok: false, errore: 'solo notifiche email (fase 2)', letti: 0 };
    const extra = run('drive', leggiDatiDrive_, {}); // firme.json, classi.json, orario.json prodotti dalle skill Claude

    // classi: per ogni classe i dati della skill (più ricchi) completano quelli live di Classroom
    const classi = {};
    new Set([...Object.keys(cr.classi || {}), ...Object.keys(extra.classi || {})]).forEach(k => {
      classi[k] = Object.assign({}, (cr.classi || {})[k], (extra.classi || {})[k]);
    });

    const snap = {
      meta: { aggiornato: new Date().toISOString(), fonti },
      circolari: posta.circolari,
      scadenze: [...posta.scadenze, ...cal.scadenze].sort((a, b) => (a.d || '9999').localeCompare(b.d || '9999')),
      supplenze: posta.supplenze,
      ricondizionamento: posta.ricondizionamento,
      orientamento: cal.orientamento,
      classi,
      firme: extra.firme || null,
      orario: extra.orario || null
    };
    scriviSnap_(snap);
    return snap;
  } finally { lock.releaseLock(); }
}

/* ---------- Gmail ---------- */
function leggiPosta_() {
  const q = `newer_than:${GIORNI_POSTA}d (from:notification@spaggiari.eu OR from:noreply.pn2127@istruzione.it OR (from:noreply@istruzione.it subject:FEA) OR from:noreply@cineca.it OR from:nuis00300r@istruzione.it)`;
  const threads = GmailApp.search(q, 0, 50);
  const circolari = [], scadenze = [];
  let supplenze = null, supplData = null, ricond = null, ricondData = null, letti = 0;
  const fea = {}; // documento → stato più recente
  const link = id => 'https://mail.google.com/mail/u/0/#all/' + id;

  threads.forEach(th => th.getMessages().forEach(m => {
    if (m.isInTrash()) return;
    letti++;
    const from = m.getFrom().toLowerCase(), subj = m.getSubject() || '', body = m.getPlainBody().slice(0, 4000);
    const data = m.getDate(), nuova = m.isUnread(), id = m.getId(), url = link(id);
    const ddmm = Utilities.formatDate(data, TZ, 'dd/MM'), hhmm = Utilities.formatDate(data, TZ, 'HH:mm');
    const base = { id, data: data.toISOString(), nuova, url };

    if (from.includes('spaggiari')) {
      const t = ((body.match(/«([^»]+)»/) || subj.match(/«([^»]+)»/) || [])[1] || '').trim(); if (!t) return;
      const mitt = /segreteria digitale/i.test(body + ' ' + subj) ? 'Segreteria Digitale' : 'ClasseViva';
      if (/^variazioni orario/i.test(t)) {
        const dv = t.match(/(\d{2})\.(\d{2})\.(\d{4})/) || [];
        const titolo = 'Variazioni orario del ' + (dv[1] ? dv[1] + '/' + dv[2] : ddmm);
        circolari.push({ ...base, fonte: mitt, titolo, rig: 'Da aprire', nota: `Pubblicate su ClasseViva il ${ddmm} alle ${hhmm}. La notifica email non riporta il dettaglio: controlla se ci sono ore a tuo nome.` });
        if (!supplData || data > supplData) { // la notifica più recente
          supplData = data;
          supplenze = { stato: 'da_aprire', titolo: titolo.replace('Variazioni orario', 'Variazioni') + ' da aprire.', nota: `Pubblicate su ClasseViva il ${ddmm} alle ${hhmm}. L’email di notifica non contiene il dettaglio.`, ore: [] };
        }
        if (dv[1]) scadenze.push({ t: 'Controlla ' + titolo.charAt(0).toLowerCase() + titolo.slice(1), d: `${dv[3]}-${dv[2]}-${dv[1]}`, src: `ClasseViva · ${ddmm} ${hhmm}` });
      } else {
        const rig = classifica_(t);
        circolari.push({ ...base, fonte: mitt, titolo: capit_(t), rig, nota: `Pubblicata su ${mitt} il ${ddmm}. Testo completo su ClasseViva.` });
        if (rig === 'Adempimento') scadenze.push({ t: capit_(t), d: dataEntro_(t), src: `${mitt} · ${ddmm}` });
      }
    } else if (from.includes('pn2127')) {
      const mod = body.match(/(\d{6})\s*[–-]\s*([^\n_|]+)/) || [];
      const att = subj.match(/(\d{2})\/(\d{2})\/(\d{4}).*?(\d{2}:\d{2}).*?(\d{2}:\d{2})/) || [];
      const sollecito = /sollecit|firma/i.test(subj + ' ' + body);
      circolari.push({ ...base, fonte: 'SIF2127', titolo: `SIF2127 – ${subj.replace(/\.$/, '')}`, rig: 'Adempimento', nota: (mod[1] ? `Modulo ${mod[1]} “${mod[2].trim()}”. ` : '') + (att[4] ? `Attività ${att[4]}–${att[5]}. ` : '') + 'Verifica la firma in piattaforma.' });
      if (mod[1] && (!ricondData || data > ricondData)) {
        ricondData = data;
        let ultima = ddmm;
        if (att[1]) { const g = new Date(+att[3], +att[2] - 1, +att[1]); ultima = `${G3[g.getDay()]} ${att[1]}/${att[2]} · ${att[4]}–${att[5]}`; }
        ricond = { modulo: `${mod[1]} · ${mod[2].trim()}`, progetto: (body.match(/ESO[\w.\-]+/) || [''])[0], ultima, nota: sollecito ? 'Firma sollecitata: verifica su SIF2127.' : '', prossimi: [] };
      }
      if (sollecito) scadenze.push({ t: 'Verifica firma SIF2127' + (mod[1] ? ' · modulo ' + mod[1] : ''), d: att[1] ? `${att[3]}-${att[2]}-${att[1]}` : Utilities.formatDate(data, TZ, 'yyyy-MM-dd'), src: `SIF2127 · ${ddmm} ${hhmm}` });
    } else if (from.includes('noreply@istruzione.it')) {
      const doc = ((body.match(/denominato (.+?), predisposto/) || [])[1] || subj).trim();
      const stato = /annullat/i.test(subj) ? 'Annullato' : /pronto per la firma|sollecito/i.test(subj) ? 'Da firmare' : 'Firmato';
      circolari.push({ ...base, fonte: 'FEA', titolo: `FEA – ${doc}`, rig: stato === 'Da firmare' ? 'Adempimento' : 'Completato', nota: `${stato} · ${ddmm}` });
      if (!fea[doc] || data > fea[doc].data) fea[doc] = { data, stato, ddmm };
    } else if (from.includes('cineca')) {
      const aula = (body.match(/aula\s*[“"]([^”"]+)[”"]/i) || [])[1];
      circolari.push({ ...base, fonte: 'Cineca', titolo: `Cineca – ${aula ? 'Responsabile aula “' + aula + '”' : subj}`, rig: 'Ti riguarda', nota: subj });
      if (aula) scadenze.push({ t: `Primo accesso piattaforma concorsi (aula ${aula})`, d: dataEntro_(body), src: `Cineca · ${ddmm}` });
    } else if (from.includes('nuis00300r')) {
      circolari.push({ ...base, fonte: 'Segreteria', titolo: subj, rig: classifica_(subj + ' ' + body), nota: body.replace(/\s+/g, ' ').slice(0, 220) });
    }
  }));

  Object.keys(fea).forEach(doc => { if (fea[doc].stato === 'Da firmare') scadenze.push({ t: 'Firma FEA: ' + doc, d: null, src: `FEA · ${fea[doc].ddmm}` }); });
  const uniche = dedup_(circolari);
  uniche.sort((a, b) => (b.nuova - a.nuova) || b.data.localeCompare(a.data));
  const scad = [], visti = {};
  scadenze.forEach(s => { const k = s.t + '|' + s.d; if (!visti[k]) { visti[k] = 1; scad.push(s); } });
  return { circolari: uniche.slice(0, 12), scadenze: scad, supplenze, ricondizionamento: ricond, letti };
}

function classifica_(txt) {
  const t = txt.toLowerCase();
  if (/firma|scadenza|entro il|compilare|consegna/.test(t)) return 'Adempimento';
  if (PAROLE_MIE.some(p => t.includes(p))) return 'Ti riguarda';
  return 'Informativa';
}
function dataEntro_(txt) { // "entro il 31/10/2026" → "2026-10-31"
  const m = String(txt).match(/entro (?:il |e non oltre il )?(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/i);
  return m ? `${m[3]}-${('0' + m[2]).slice(-2)}-${('0' + m[1]).slice(-2)}` : null;
}
function dedup_(arr) { // stesso titolo e fonte (es. stati successivi FEA, notifiche ripetute): tiene il più recente
  const best = {};
  arr.forEach(c => { const k = c.fonte + '|' + c.titolo; if (!best[k] || c.data > best[k].data) best[k] = Object.assign({}, c, { nuova: !!(c.nuova || (best[k] && best[k].nuova)) }); });
  return Object.keys(best).map(k => best[k]);
}
function capit_(s) { return s.replace(/^circ\.?\s*(\d+)\s*[-–]?\s*/i, 'Circ. $1 – ').replace(/^\S/, c => c.toUpperCase()); }

/* ---------- Classroom (servizio avanzato) ---------- */
function leggiClassroom_() {
  const corsi = [];
  let tokenPag;
  do {
    const res = Classroom.Courses.list({ teacherId: 'me', courseStates: ['ACTIVE'], pageSize: 50, pageToken: tokenPag });
    (res.courses || []).forEach(c => corsi.push(c));
    tokenPag = res.nextPageToken;
  } while (tokenPag);

  const classi = {}; let letti = 0;
  corsi.forEach(c => {
    const cls = CLASSI.find(k => new RegExp('(^|[^0-9A-Za-z])' + k + '([^0-9A-Za-z]|$)', 'i').test(c.name + ' ' + (c.section || '')));
    if (!cls) return;
    const cw = Classroom.Courses.CourseWork.list(c.id, { pageSize: 3, orderBy: 'updateTime desc' }).courseWork || [];
    const mat = Classroom.Courses.CourseWorkMaterials.list(c.id, { pageSize: 3, orderBy: 'updateTime desc' }).courseWorkMaterial || [];
    letti += cw.length + mat.length;
    const last = [...cw, ...mat].sort((a, b) => b.updateTime.localeCompare(a.updateTime))[0];
    const prec = classi[cls] && classi[cls]._t;
    if (prec && last && prec > last.updateTime) return; // più corsi per la stessa classe: tiene il più attivo
    classi[cls] = {
      _t: last ? last.updateTime : '',
      ultimo: last ? Utilities.formatDate(new Date(last.updateTime), TZ, 'dd/MM') + ' · ' + last.title : '',
      aperta: cw[0] ? cw[0].title : '',
      link: c.alternateLink
    };
  });
  Object.keys(classi).forEach(k => delete classi[k]._t);
  return { classi, letti };
}

/* ---------- Calendar ---------- */
function leggiCalendario_() {
  const inizio = new Date(); inizio.setHours(0, 0, 0, 0);
  const fine = new Date(inizio.getTime() + 15 * 864e5);
  const ev = CalendarApp.getDefaultCalendar().getEvents(inizio, fine);
  const scadenze = [], orientamento = [];
  ev.forEach(e => {
    const d = Utilities.formatDate(e.getStartTime(), TZ, 'yyyy-MM-dd');
    const ora = e.isAllDayEvent() ? '' : ' · ' + Utilities.formatDate(e.getStartTime(), TZ, 'HH:mm');
    if (/orientamento|scuola aperta|open day/i.test(e.getTitle())) orientamento.push({ d: d.slice(8, 10) + '/' + d.slice(5, 7), t: e.getTitle(), s: (e.getLocation() || 'Calendario') + ora });
    else scadenze.push({ t: e.getTitle() + ora, d, src: 'Calendario' });
  });
  return { scadenze, orientamento, letti: ev.length };
}

/* ---------- Drive: dati prodotti dalle skill Claude (cartella "Dashboard Docente/dati") ---------- */
function leggiDatiDrive_() {
  const out = { letti: 0 };
  const it = DriveApp.getFoldersByName('Dashboard Docente');
  if (!it.hasNext()) return out;
  const sub = it.next().getFoldersByName('dati');
  if (!sub.hasNext()) return out;
  const dir = sub.next();
  ['firme', 'classi', 'orario'].forEach(n => {
    const f = dir.getFilesByName(n + '.json');
    if (!f.hasNext()) return;
    try { out[n] = JSON.parse(f.next().getBlob().getDataAsString()); out.letti++; }
    catch (e) { throw new Error(n + '.json non è JSON valido: ' + e.message); }
  });
  return out;
}

/* ---------- snapshot ---------- */
function scriviSnap_(obj) {
  const s = JSON.stringify(obj);
  if (s.length < 100000) CacheService.getScriptCache().put(SNAP_KEY, s, CACHE_TTL); // limite CacheService: 100 KB
}
function leggiSnap_() {
  const s = CacheService.getScriptCache().get(SNAP_KEY);
  return s ? JSON.parse(s) : null;
}
function uguali_(a, b) { // confronto a tempo costante
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
