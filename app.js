/* Dashboard Docente — PWA statica, nessuna build.
   Riproduce riferimento/Dashboard Docente.dc.html, ma i dati arrivano dal JSON dell'endpoint
   Apps Script (schema in dashboard.schema.json). Regola: mai dati di esempio nell'interfaccia;
   se una fonte non risponde, la sezione mostra lo stato vuoto. */
'use strict';

/* ---------- costanti di interfaccia (non dati) ---------- */
const ORE_SCUOLA = [{n:1,s:'08:10',e:'09:10'},{n:2,s:'09:10',e:'10:05'},{n:3,s:'10:15',e:'11:10'},{n:4,s:'11:10',e:'12:05'},{n:5,s:'12:15',e:'13:05'},{n:6,s:'13:05',e:'13:55'}];
const GG = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
const G3 = ['dom','lun','mar','mer','gio','ven','sab'];
const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const CMD = {
  orario: 'Mostrami l\'orario dei prossimi giorni con classe e laboratorio per ogni ora (skill orario-docente-promemoria).',
  firme: 'Scrivi le firme di oggi per Classeviva (skill firme-registro-classeviva): controlla prima Classroom in tempo reale.',
  report: 'Prepara le lezioni del prossimo giorno di scuola e aggiorna il Report lezioni (skill prepara-lezioni).',
  circolari: 'Controlla le nuove circolari in posta/ClasseViva e gestiscile con la skill gestione-circolari-ciusa.'
};
const FASI = [
  {id:'mattina',nome:'Mattina',range:'06:00 – 13:55',desc:'Orario e lezioni'},
  {id:'pomeriggio',nome:'Pomeriggio',range:'14:00 – 19:54',desc:'Firme registro'},
  {id:'sera',nome:'Sera',range:'dalle 19:55',desc:'Report lezioni di domani'}
];
const ORDINI = {
  mattina:['orario','firme','circolari','scadenze','classi','report','ricond','orient','ut','note'],
  pomeriggio:['firme','circolari','scadenze','orario','report','classi','ricond','orient','ut','note'],
  sera:['report','orario','circolari','scadenze','firme','classi','ricond','orient','ut','note']
};
const NUM = {orario:'01',firme:'02',report:'03',circolari:'04',scadenze:'05',classi:'06',ricond:'07',orient:'08',ut:'09',note:'10'};
const FONTI = [['gmail','Gmail'],['posta_scuola','Posta scuola'],['classroom','Classroom'],['calendar','Calendar'],['classeviva','ClasseViva']];
const STATI = ['Aperta','In corso','Chiusa'];
const LABS = ['Arrakis','Matrix','Lab. 21','Neo Tokio','Skynet','Altro'];
const MOCK_NOME = new URLSearchParams(location.search).get('mock') || '';
const MOCK_URL = './dev/' + (/^[a-z_][\w-]*$/i.test(MOCK_NOME) ? MOCK_NOME : 'esempio-21-10-2026') + '.json';
const LOCALE = ['localhost','127.0.0.1'].includes(location.hostname);
// "Apri in Claude" apre l'app, non il browser: sul Mac lo schema claude:// dell'app desktop,
// su iPhone/iPad claude.ai/new, che è un link universale dell'app Claude per iOS.
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MAC = !IOS && /Macintosh/.test(navigator.userAgent);
// Le circolari di ClasseViva e Segreteria Digitale non si aprono nella mail di notifica: su iPhone/iPad
// nell'app ClasseViva Docenti, tramite il Comando rapido "Apri ClasseViva" (l'app non ha link diretti);
// sul Mac nella bacheca web di ClasseViva.
const CLASSEVIVA_BACHECA = 'https://web.spaggiari.eu/sif/app/default/bacheca_personale.php';
const CLASSEVIVA_COMANDO = 'shortcuts://run-shortcut?name=' + encodeURIComponent('Apri ClasseViva');
const daClasseviva = i => i.fonte === 'ClasseViva' || i.fonte === 'Segreteria Digitale';
const claudeLink = t => `href="${(MAC ? 'claude://claude.ai/new?q=' : 'https://claude.ai/new?q=') + encodeURIComponent(t)}"${MAC ? '' : ' target="_blank" rel="noopener"'}`;
const K = {endpoint:'pd_endpoint',token:'pd_token',last:'pd_last',ut:'pd_ut',note:'pd_note',done:'pd_firme_done',variante:'pd_variante',tema:'pd_tema',mod:'pd_firme_mod',coda:'pd_firme_coda',nascoste:'pd_circ_nascoste',lette:'pd_circ_lette',credito:'pd_credito',verifiche:'pd_verifiche'};

const CORNERS = '<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>';
const ICON_ALERT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>';
const ICON_REFRESH = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 16h5v5"></path></svg>';

/* ---------- utilità ---------- */
const tm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const pad = n => String(n).padStart(2, '0');
const dmy = d => pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); x.setHours(12, 0, 0, 0); return x; };
const hhmm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const PRONTA = 5; // la bozza della firma compare 5 minuti dopo la fine dell'ora (o del blocco di ore consecutive)
const durata = m => m >= 60 ? Math.floor(m / 60) + ' h ' + pad(m % 60) + ' min' : m + ' min';
const oreLabel = b => b.first === b.last ? b.first + 'ª ora' : b.first + 'ª–' + b.last + 'ª ora';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = u => /^https:\/\//i.test(String(u || '')) ? esc(u) : '';
const ls = {
  get(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } },
  json(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

/* Ora simulata per i test: ?ora=11:06 e/o ?data=2026-10-20 */
const Q = new URLSearchParams(location.search);
const SIM = { ora: /^\d{2}:\d{2}$/.test(Q.get('ora') || '') ? Q.get('ora') : null, data: /^\d{4}-\d{2}-\d{2}$/.test(Q.get('data') || '') ? Q.get('data') : null };
function adesso() {
  const n = new Date();
  if (SIM.data) { const [y, m, d] = SIM.data.split('-').map(Number); n.setFullYear(y, m - 1, d); }
  if (SIM.ora) { const [h, mi] = SIM.ora.split(':').map(Number); n.setHours(h, mi, 0, 0); }
  return n;
}

/* ---------- stato ---------- */
const S = {
  data: null, loading: false, refreshing: false, error: null, lastFetch: 0, offline: false, cachedAt: null,
  mock: LOCALE && (Q.has('mock') || ls.get(K.endpoint) === 'mock'),
  setup: false, setupErr: '', pin: null, copied: null,
  done: ls.json(K.done, {}), mod: ls.json(K.mod, {}), coda: ls.json(K.coda, []), nascoste: ls.json(K.nascoste, []), lette: ls.json(K.lette, []), ultimaFirmata: 0, invio: null, invioErr: '', trascina: false, tickets: ls.json(K.ut, []), note: ls.get(K.note, ''),
  utLab: LABS[0], utText: '',
  variante: ls.get(K.variante, 'A'), tema: ls.get(K.tema, 'auto'),
  pagina: '', menu: false, credito: ls.json(K.credito, null), crUsd: '', crData: '',
  ver: { dati: ls.json(K.verifiche, null), carico: false, err: '', at: 0 }, verSel: '', verClasse: '', verCorr: {}
};
// Navigazione: «Oggi» è la schermata iniziale, ogni sezione ha la sua pagina (#firme, #verifiche, …).
// Sul computer menu laterale, su iPhone/iPad barra in basso con le voci principali e «Menu» per le altre.
const I = d => `<svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONE = {
  '': I('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'),
  orario: I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  firme: I('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
  report: I('<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
  circolari: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  scadenze: I('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>'),
  classi: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>'),
  verifiche: I('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>'),
  incarichi: I('<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3 18l3 3 6.2-6.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-2.5z"/>'),
  note: I('<path d="M5 3h14v12l-6 6H5z"/><path d="M13 21v-6h6"/>'),
  spesa: I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  impostazioni: I('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  menu: I('<path d="M4 6h16M4 12h16M4 18h16"/>')
};
const PAGINE = [
  ['Giornata', [['', 'Oggi'], ['orario', 'Orario'], ['firme', 'Firme'], ['report', 'Report lezioni']]],
  ['Scuola', [['circolari', 'Circolari'], ['scadenze', 'Scadenze'], ['classi', 'Classi'], ['verifiche', 'Verifiche']]],
  ['Incarichi', [['incarichi', 'Ufficio tecnico e incarichi'], ['note', 'Note rapide']]],
  ['Sistema', [['spesa', 'Spesa Claude'], ['impostazioni', 'Impostazioni']]]
];
const VOCI = PAGINE.flatMap(([, v]) => v), NOME_PAGINA = Object.fromEntries(VOCI);
const GRUPPO = Object.fromEntries(PAGINE.flatMap(([g, v]) => v.map(([id]) => [id, g])));
const TAB = ['', 'firme', 'report', 'verifiche']; // barra in basso (più «Menu»)
const paginaDaHash = () => { const h = location.hash.slice(1); return h && h in NOME_PAGINA ? h : ''; };
S.pagina = paginaDaHash();
const collegato = () => S.mock || (ls.get(K.endpoint) && ls.get(K.token));

/* ---------- dati ---------- */
function urlDati(refresh) {
  if (S.mock) return MOCK_URL;
  const ep = ls.get(K.endpoint, '');
  return ep + (ep.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(ls.get(K.token, '')) + (refresh ? '&refresh=1' : '') + '&_=' + Date.now();
}
function valido(j) { return j && typeof j === 'object' && j.meta && Array.isArray(j.circolari) && Array.isArray(j.scadenze); }

async function scarica(url) {
  const r = await fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (j && j.errore) { const e = new Error(j.errore); e.auth = /autorizzat/i.test(j.errore); throw e; }
  if (!valido(j)) throw new Error('risposta non valida');
  return { j, daCache: r.headers.get('X-Dashboard-Cache') === '1' };
}

async function carica(refresh) {
  if (!collegato() || S.loading) return;
  S.loading = true; S.refreshing = !!refresh; S.error = null; render();
  try {
    const { j, daCache } = await scarica(urlDati(refresh));
    S.data = j; S.offline = daCache; S.cachedAt = daCache ? (j.meta.aggiornato || null) : null;
    if (!daCache && !S.mock) { ls.set(K.last, j); svuotaCoda(); }
    // lo stato "firmata" confermato dal backend sostituisce quello locale (vale per tutti i dispositivi)
    Object.keys(S.done).forEach(k => { const [y, m, g, o] = k.split('-'), r = firmaRec(((j.firme || {})[y + '-' + m + '-' + g] || {})[o]); if (!!r.firmata === !!S.done[k] && !S.coda.some(q => q.azione === 'firmata')) delete S.done[k]; });
    ls.set(K.done, S.done);
  } catch (err) {
    S.error = err.auth ? 'Codice di accesso non valido: controlla il collegamento.' : 'Endpoint non raggiungibile (' + (err.message || err) + ').';
    if (!err.auth) {
      const last = S.data || (!S.mock && ls.json(K.last, null));
      if (valido(last)) { S.data = last; S.offline = true; S.cachedAt = last.meta.aggiornato || null; }
    }
  } finally {
    S.loading = false; S.refreshing = false; S.lastFetch = Date.now(); render();
  }
}

/* ---------- orario: dal JSON (orario.json su Drive), mai cablato ---------- */
function modello(data) {
  const o = data && data.orario;
  const sett = o && o.settimana && typeof o.settimana === 'object' && Object.keys(o.settimana).length ? o.settimana : null;
  const ore = o && Array.isArray(o.ore) && o.ore.length ? o.ore : ORE_SCUOLA;
  const lab = (o && o.lab) || {};
  const lessons = d => { if (!sett) return []; const x = sett[d.getDay()] || {}; return ore.filter(h => x[h.n]).map(h => ({ ...h, cls: x[h.n], lab: lab[x[h.n]] || '' })); };
  const blocks = d => { const out = []; lessons(d).forEach(l => { const b = out[out.length - 1]; if (b && b.cls === l.cls && b.last === l.n - 1) { b.last = l.n; b.e = l.e; b.num++; } else out.push({ cls: l.cls, lab: l.lab, first: l.n, last: l.n, s: l.s, e: l.e, num: 1 }); }); return out; };
  const nextSchool = d => {
    for (let i = 1; i < 10; i++) { const x = addDays(d, i); if (sett ? lessons(x).length : x.getDay() !== 0) return x; }
    return addDays(d, 1);
  };
  return { has: !!sett, ore, lessons, blocks, nextSchool, vigore: o && o.vigore };
}

/* ---------- componenti ---------- */
const empty = (titolo, sugg) => `<p class="empty"><b>${esc(titolo)}</b>${sugg ? `<span>${esc(sugg)}</span>` : ''}</p>`;
const alertBox = html => `<div class="alert" role="status">${ICON_ALERT}<span>${html}</span></div>`;
function fonte(nome) { const f = S.data && S.data.meta && S.data.meta.fonti && S.data.meta.fonti[nome]; return f || { ok: false, errore: 'stato sconosciuto', letti: 0 }; }
function cmdFooter(id, primary, auto) {
  const t = CMD[id], lab = S.copied === 'cmd-' + id ? 'Copiato' : 'Copia comando', link = claudeLink(t);
  const btn = primary
    ? `<button class="btn btn-primary blueprint" data-act="copy" data-key="cmd-${id}">${CORNERS}${lab}</button><a class="btn btn-secondary" ${link}>Apri in Claude</a>`
    : `<button class="btn btn-secondary" data-act="copy" data-key="cmd-${id}">${lab}</button><a class="btn btn-ghost" ${link}>Apri in Claude</a>`;
  return `<footer class="cmdf${auto ? ' auto' : ''}"><code class="cmd">${esc(t)}</code><div class="row">${btn}</div></footer>`;
}
function head(id, c, titolo, tag) {
  return `<header class="sec-h"><div><span class="kicker">${esc(c.k[id])}</span><h3>${titolo}</h3></div>${tag || ''}</header>`;
}
const sec = (id, c, inner, gap = 14) => `<section class="blueprint sec" id="s-${id}" style="order:${c.o[id]};grid-column:${c.g[id]};border-color:${c.fb[id]};gap:${gap}px">${CORNERS}${inner}</section>`;

/* testi da copiare, indicizzati per chiave (evita di metterli negli attributi) */
let COPIE = {};

/* ---------- render ---------- */
function render() {
  if (S.trascinoFile) return; // durante il trascinamento di un file del report la scheda di origine deve restare nel DOM
  const root = document.getElementById('app');
  document.documentElement.dataset.theme = S.tema;
  const act = document.activeElement, focusId = act && act.id, sel = act && 'selectionStart' in act ? [act.selectionStart, act.selectionEnd] : null, top = act ? act.scrollTop : 0;

  if (!collegato() || S.setup) root.innerHTML = renderSetup();
  else if (!S.data) root.innerHTML = renderAttesa();
  else root.innerHTML = renderApp();

  if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) {} el.scrollTop = top; } }
}

function renderSetup() {
  const ep = ls.get(K.endpoint, ''), annulla = collegato() && S.setup;
  return `<div class="setup-wrap"><div class="blueprint setup">${CORNERS}
    <span class="kicker">Progetto Docente · primo avvio</span>
    <h2 class="hd">Collega i tuoi dati</h2>
    <p class="m70">Incolla l'indirizzo della web app Apps Script e il codice di accesso (la Script Property <code>TOKEN</code>). Restano solo su questo dispositivo.</p>
    <form id="setup-form" autocomplete="off" novalidate>
      <div class="field"><label for="f-ep">Indirizzo endpoint</label>
        <input class="input" id="f-ep" name="ep" type="url" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(ep === 'mock' ? '' : ep)}"></div>
      <div class="field"><label for="f-tk">Codice di accesso</label>
        <input class="input" id="f-tk" name="tk" type="password" autocapitalize="off" spellcheck="false" autocomplete="off"></div>
      ${S.setupErr ? `<div class="err" role="alert">${esc(S.setupErr)}</div>` : ''}
      <div class="row">
        <button class="btn btn-primary blueprint" type="submit" ${S.loading ? 'disabled' : ''}>${CORNERS}${S.loading ? 'Verifico…' : 'Collega'}</button>
        ${annulla ? '<button class="btn btn-ghost" type="button" data-act="setup-annulla">Annulla</button>' : ''}
      </div>
      ${LOCALE ? '<p class="small m60">Sviluppo: scrivi <code>mock</code> come endpoint per usare dev/esempio-21-10-2026.json.</p>' : ''}
    </form></div></div>`;
}

function renderAttesa() {
  const inner = S.loading
    ? `<h3>Carico i dati…</h3><p class="m62" style="margin:0">Leggo lo snapshot dall'endpoint. Se è il primo accesso può servire qualche secondo.</p>`
    : `<h3>Dati non disponibili</h3><p class="m62" style="margin:0">${esc(S.error || 'Nessuna risposta dall\'endpoint.')}</p>
       <div class="row"><button class="btn btn-primary" data-act="refresh">Riprova</button><button class="btn btn-ghost" data-act="setup">Modifica collegamento</button></div>`;
  return `<div class="wrap">${renderTop(adesso())}<div class="blueprint state">${CORNERS}${inner}</div></div>`;
}

function renderTop(now) {
  const meta = (S.data && S.data.meta) || {};
  const agg = meta.aggiornato ? new Date(meta.aggiornato) : null;
  const tags = [];
  if (S.mock) tags.push('<span class="tag tag-neutral">Mock di sviluppo</span>');
  if (SIM.ora || SIM.data) tags.push('<span class="tag tag-outline">Ora simulata</span>');
  if (S.data && agg && !isNaN(agg)) {
    tags.push(S.offline
      ? `<span class="tag tag-outline" title="${esc(S.error || '')}">Dati del ${dmy(agg)} ${hm(agg)} — offline</span>`
      : `<span class="tag tag-neutral">Aggiornato alle ${hm(agg)}${iso(agg) !== iso(now) ? ' del ' + dmy(agg) : ''}</span>`);
  }
  if (S.data) FONTI.forEach(([id, nome]) => {
    const f = fonte(id);
    tags.push(f.ok
      ? `<span class="tag tag-accent" title="${esc(nome)}: ${esc(f.letti)} elementi letti">${esc(nome)}</span>`
      : `<span class="tag tag-outline" title="${esc(f.errore || '')}">${esc(nome)} non raggiungibile</span>`);
  });
  return `<header class="top">
    <div class="top-l">
      <span class="school">IIS “F. Ciusa” · Nuoro · B016 Lab. Informatica</span>
      <h1>Progetto Docente</h1>
      <span class="prof m65">Prof. Diego Caprini</span>
    </div>
    <div class="top-r">
      <div class="top-meta">
        <div class="tags">${tags.join('')}</div>
        <span class="date-long">${GG[now.getDay()]} ${now.getDate()} ${MESI[now.getMonth()]} ${now.getFullYear()}</span>
      </div>
      <div class="row" style="align-items:flex-end;gap:10px">
        <button class="btn btn-secondary refresh${S.loading ? ' spin' : ''}" data-act="refresh" aria-label="Aggiorna i dati" title="Aggiorna (ricostruisce lo snapshot)" ${S.loading ? 'disabled' : ''}>${ICON_REFRESH}</button>
        <span class="clock">${hm(now)}</span>
      </div>
    </div>
  </header>`;
}

// Dati della giornata condivisi da tutte le pagine.
function contesto() {
  const d = S.data, now = adesso(), M = modello(d);
  const mins = now.getHours() * 60 + now.getMinutes();
  const today = new Date(now); today.setHours(12, 0, 0, 0);
  const todayL = M.lessons(today), todayB = M.blocks(today);
  const autoFase = mins >= 360 && mins < 840 ? 'mattina' : mins >= 840 && mins < 1195 ? 'pomeriggio' : 'sera';
  const nextDay = M.nextSchool(today), ndL = M.lessons(nextDay), ndLabel = GG[nextDay.getDay()] + ' ' + dmy(nextDay);
  const crOk = fonte('classroom').ok;
  const agg = d.meta.aggiornato ? new Date(d.meta.aggiornato) : null;
  const aggTxt = agg && !isNaN(agg) ? dmy(agg) + ' ' + hm(agg) : 'data sconosciuta';
  const firmeOggi = (d.firme && d.firme[iso(today)]) || {};
  const fatta = b => { const k = iso(today) + '-' + b.first; return k in S.done ? !!S.done[k] : !!firmaRec(firmeOggi[String(b.first)]).firmata; };
  const rep = reportStato(d, M, today, mins);
  return { d, now, M, mins, today, todayL, todayB, autoFase, fase: autoFase, nextDay, ndL, ndLabel, crOk, agg, aggTxt, fatta, firmeOggi, rep };
}
// c delle sezioni (ordine, colonna, bordo, occhiello) per una pagina con una o più sezioni.
function cPagina(kicker) {
  const c = { o: {}, g: {}, fb: {}, k: {} };
  Object.keys(NUM).forEach(id => { c.o[id] = 0; c.g[id] = 'auto'; c.fb[id] = 'var(--color-divider)'; c.k[id] = kicker; });
  return c;
}
// Contatori per menu e riquadri della schermata Oggi.
function contatori(x) {
  const oggi = iso(x.now), ver = (S.ver.dati && S.ver.dati.verifiche) || [];
  return {
    firme: x.todayB.filter(b => !x.fatta(b)).length,
    circolari: circolariVisibili(x.d).filter(i => i.nuova).length,
    scadenze: scadenzeOrdinate(x.d, x.today).filter(s => s.n >= 0 && s.n <= 7).length,
    verifiche: ver.filter(v => v.data <= oggi && !verCorretta(v)).length
  };
}

function renderApp() {
  COPIE = {}; FILE_REP = {};
  const x = contesto(), n = contatori(x), p = S.pagina;
  const badge = { firme: n.firme, circolari: n.circolari, verifiche: n.verifiche };
  const voce = ([id, nome]) => `<button class="nav-i${id === p ? ' on' : ''}" data-act="pagina" data-id="${id}"${id === p ? ' aria-current="page"' : ''}>${ICONE[id]}<span>${esc(nome)}</span>${badge[id] ? `<b class="nav-b">${badge[id]}</b>` : ''}</button>`;
  const nav = `<nav class="nav${S.menu ? ' open' : ''}" aria-label="Sezioni">
    <div class="nav-brand"><span class="nav-logo">PD</span><span class="col"><b>Progetto Docente</b><span class="small m60">Prof. Diego Caprini</span></span></div>
    ${PAGINE.map(([g, v]) => `<div class="nav-g"><span class="nav-gt">${esc(g)}</span>${v.map(voce).join('')}</div>`).join('')}
  </nav>${S.menu ? '<div class="nav-velo" data-act="menu"></div>' : ''}`;
  const tab = `<nav class="tabbar" aria-label="Sezioni principali">${TAB.map(id => `<button class="tab-i${id === p && !S.menu ? ' on' : ''}" data-act="pagina" data-id="${id}">${ICONE[id]}<span>${esc(id ? NOME_PAGINA[id].split(' ')[0] : 'Oggi')}</span>${badge[id] ? `<b class="nav-b">${badge[id]}</b>` : ''}</button>`).join('')}
    <button class="tab-i${S.menu ? ' on' : ''}" data-act="menu" aria-expanded="${S.menu}">${ICONE.menu}<span>Menu</span></button></nav>`;

  const fonti = FONTI.map(([id]) => fonte(id)), ko = fonti.filter(f => !f.ok).length;
  const agg = x.agg && !isNaN(x.agg) ? (S.offline ? 'Offline · dati del ' + dmy(x.agg) + ' ' + hm(x.agg) : 'Aggiornato alle ' + hm(x.agg) + (iso(x.agg) !== iso(x.now) ? ' del ' + dmy(x.agg) : '')) : '';
  const bar = `<header class="bar">
    <div class="bar-l"><span class="kicker">${p ? esc(GRUPPO[p]) : 'IIS “F. Ciusa” · Nuoro · B016'}</span><h1>${p ? esc(NOME_PAGINA[p]) : saluto(x.now)}</h1>
      <span class="small m62">${GG[x.now.getDay()]} ${x.now.getDate()} ${MESI[x.now.getMonth()]} ${x.now.getFullYear()}${agg ? ' · ' + esc(agg) : ''}</span></div>
    <div class="bar-r">
      ${S.mock ? '<span class="tag tag-neutral">Mock</span>' : ''}${SIM.ora || SIM.data ? '<span class="tag tag-outline">Ora simulata</span>' : ''}
      <button class="chip${ko ? ' ko' : ''}" data-act="pagina" data-id="impostazioni" title="${esc(FONTI.map(([id, nome], i) => nome + ': ' + (fonti[i].ok ? 'ok' : fonti[i].errore || 'non raggiungibile')).join('\n'))}"><i></i>${ko ? ko + (ko === 1 ? ' fonte non raggiungibile' : ' fonti non raggiungibili') : 'Fonti collegate'}</button>
      <button class="btn btn-secondary refresh${S.loading ? ' spin' : ''}" data-act="refresh" aria-label="Aggiorna i dati" title="Aggiorna (ricostruisce lo snapshot)" ${S.loading ? 'disabled' : ''}>${ICON_REFRESH}</button>
      <span class="clock">${hm(x.now)}</span>
    </div></header>`;

  const avvisi = [];
  if (S.offline) avvisi.push(alertBox(`<strong>Offline.</strong> Mostro gli ultimi dati salvati (${esc(S.cachedAt ? dmy(new Date(S.cachedAt)) + ' ' + hm(new Date(S.cachedAt)) : 'data sconosciuta')}). ${esc(S.error || '')}`));
  else if (S.error) avvisi.push(alertBox(`<strong>Aggiornamento non riuscito.</strong> ${esc(S.error)} <button class="btn btn-ghost" data-act="setup">Modifica collegamento</button>`));

  const c = cPagina(p ? GRUPPO[p] : '');
  const pagina = !p ? renderOggi(x, n)
    : p === 'orario' ? secOrario(x, c) : p === 'firme' ? secFirme(x, c) : p === 'report' ? secReport(x, c)
    : p === 'circolari' ? secCircolari(x, c) : p === 'scadenze' ? secScadenze(x, c) : p === 'classi' ? secClassi(x, c)
    : p === 'note' ? secNote(x, c) : p === 'incarichi' ? `<div class="pg-g">${secUT(x, c)}${secRicond(x, c)}${secOrient(x, c)}</div>`
    : p === 'verifiche' ? renderVerifiche() : p === 'spesa' ? renderSpesa() : renderImpostazioni();
  return `<div class="app">${nav}<div class="main">${bar}${avvisi.join('')}<main class="pg pg-${p || 'oggi'}">${pagina}</main></div>${tab}</div>
    <div class="ptr tag tag-accent" id="ptr" aria-hidden="true">Rilascia per aggiornare</div>`;
}
const saluto = d => (d.getHours() < 13 ? 'Buongiorno' : d.getHours() < 18 ? 'Buon pomeriggio' : 'Buonasera') + ', prof.';

// Schermata Oggi: cosa succede adesso, riquadri con i numeri della giornata, giornata e sezione utile in questo momento.
function renderOggi(x, n) {
  const { M, mins, todayL, todayB, ndL, ndLabel, rep, fatta, autoFase } = x;
  let A = { k: 'Adesso', t: '', s: '', on: false };
  const cur = todayL.find(l => mins >= tm(l.s) && mins < tm(l.e)), nxt = todayL.find(l => tm(l.s) > mins);
  if (!M.has) A = { ...A, t: 'Orario non disponibile', s: 'Nessun dato da orario.json: lo produce la skill orario-docente-promemoria nella cartella Drive “Dashboard Docente/dati”.' };
  else if (cur) {
    const left = tm(cur.e) - mins, after = todayL.find(l => l.n === cur.n + 1);
    A = left <= 5 ? { k: 'Firma ora', t: 'Fine ' + cur.n + 'ª ora tra ' + left + ' min: firma ' + cur.cls, s: after ? 'Poi ' + after.n + 'ª ora · ' + after.cls + (after.lab ? ' · ' + after.lab : '') : 'Ultima ora della giornata', on: true }
      : { k: 'In corso', t: cur.n + 'ª ora · ' + cur.cls + (cur.lab ? ' · ' + cur.lab : ''), s: 'Termina alle ' + cur.e + ' · ' + (after ? 'poi ' + after.cls + (after.lab ? ' in ' + after.lab : '') : 'ultima ora'), on: true };
  } else if (nxt) A = { ...A, k: 'Prossima ora', t: nxt.n + 'ª ora alle ' + nxt.s + ' · ' + nxt.cls + (nxt.lab ? ' · ' + nxt.lab : ''), s: mins < tm(todayL[0].s) ? 'Prima ora della giornata' : 'Intervallo in corso' };
  else if (!todayL.length) A = { ...A, k: 'Giorno libero', t: 'Nessuna lezione oggi', s: 'Prossime lezioni: ' + ndLabel + (ndL.length ? ' · ' + [...new Set(ndL.map(l => l.cls))].join(', ') : '') };
  else if (mins < 1195) { const left = todayB.filter(b => !fatta(b)).length; A = { ...A, k: 'Lezioni concluse', t: left ? left + (left === 1 ? ' firma da apporre' : ' firme da apporre') + ' sul registro' : 'Tutte le firme di oggi sono apposte', s: 'Report di ' + rep.label + ': ' + rep.breve }; }
  else A = { ...A, k: 'Sera', t: 'Report lezioni di ' + rep.label + ': ' + rep.breve, s: ndL.map(l => l.n + 'ª ' + l.cls).join(' · ') };

  const hero = `<section class="hero ${A.on ? 'on' : autoFase}"><span class="hero-k">${esc(A.k)}</span><span class="hero-t">${esc(A.t)}</span><span class="hero-s">${esc(A.s)}</span></section>`;
  const prossima = scadenzeOrdinate(x.d, x.today).find(s => s.n >= 0 && s.n < 99);
  const tile = (id, num, lab, sub) => `<button class="tile" data-act="pagina" data-id="${id}"><span class="tile-i">${ICONE[id]}</span><span class="tile-n">${num}</span><span class="tile-l">${esc(lab)}</span><span class="tile-s">${esc(sub)}</span></button>`;
  const tiles = `<div class="tiles">
    ${tile('firme', todayB.length ? todayB.length - n.firme + '/' + todayB.length : '—', 'Firme di oggi', todayB.length ? (n.firme ? n.firme + ' da apporre' : 'tutte apposte') : 'nessuna lezione')}
    ${tile('report', rep.pronto ? '✓' : '…', 'Report lezioni', rep.label + ' · ' + rep.breve)}
    ${tile('circolari', n.circolari, n.circolari === 1 ? 'Circolare nuova' : 'Circolari nuove', n.circolari ? 'da leggere' : 'nessuna da leggere')}
    ${tile('scadenze', n.scadenze, 'Scadenze in 7 giorni', prossima ? 'prossima: ' + prossima.dd + ' · ' + prossima.t : 'nessuna in vista')}
    ${tile('verifiche', n.verifiche, 'Verifiche da correggere', n.verifiche ? 'apri per correggere' : 'tutte corrette')}
  </div>`;
  // sezione utile adesso: mattina l'orario, pomeriggio le firme, sera il report
  const c = cPagina('In evidenza adesso'), evid = autoFase === 'mattina' ? secOrario(x, c) : autoFase === 'pomeriggio' ? secFirme(x, c) : secReport(x, c);
  return `${hero}${tiles}<div class="oggi-g">${renderTimeline(x)}<div class="col" style="gap:20px;min-width:0">${evid}</div></div>`;
}

function renderImpostazioni() {
  return `<div class="pg-g">${renderFoot()}</div>`;
}

function renderTimeline(x) {
  const { mins, todayL, todayB, ndLabel, ndL, M, today } = x;
  const tl = todayL.map(l => { const st = mins >= tm(l.e) ? 'done' : mins >= tm(l.s) ? 'now' : 'next'; return { time: l.s, label: l.n + 'ª ora · ' + l.cls, sub: (l.lab ? l.lab + ' · ' : '') + 'firma alle ' + l.e + ' · bozza alle ' + hhmm(tm(l.e) + PRONTA), st }; });
  tl.push({ time: '14:00', label: 'Firme registro', sub: !M.has ? 'Orario non disponibile' : todayB.length ? todayB.filter(b => !x.fatta(b)).length + ' firme da apporre · bozze 5 min dopo ogni ora' : 'Nessuna lezione oggi', st: mins >= 1195 ? 'done' : mins >= 840 ? 'now' : 'next', pick: 'pomeriggio' });
  tl.push({ time: x.rep.pronto ? hm(new Date(x.rep.pronto.generato)) : '18:00', label: 'Report lezioni', sub: 'Per ' + x.rep.label + ' · ' + x.rep.breve, st: x.rep.pronto ? 'now' : 'next', pick: 'sera' });
  const li = tl.map(t => {
    const dot = t.st === 'now' ? 'var(--color-accent)' : t.st === 'done' ? 'color-mix(in srgb,var(--color-accent) 35%,transparent)' : 'transparent';
    const attrs = t.pick ? ` class="click" data-act="pagina" data-id="${t.pick === 'pomeriggio' ? 'firme' : 'report'}" role="button" tabindex="0"` : '';
    return `<li${attrs} style="opacity:${t.st === 'done' ? 0.5 : 1}"><span class="tl-time">${t.time}</span><span class="tl-dot" style="background:${dot}"></span><span class="col" style="min-width:0"><span class="tl-l">${esc(t.label)}</span><span class="small m62">${esc(t.sub)}</span></span></li>`;
  }).join('');
  return `<section class="blueprint sec giornata">${CORNERS}
    <div class="col" style="gap:2px"><span class="kicker">La tua giornata</span><h3>${GG[today.getDay()]} ${dmy(today)}</h3></div>
    ${M.has ? '' : empty('Nessun dato da orario.json', 'Le ore di lezione compariranno quando l\'orario è su Drive.')}
    <ol class="plain tl">${li}</ol>
    <div class="side-next"><span class="kicker">Prossimo giorno di scuola</span><span class="hd" style="font-size:18px">${esc(ndLabel)}</span><span style="font-size:13px">${esc(ndL.map(l => l.n + 'ª ' + l.cls + (l.lab ? ' · ' + l.lab : '')).join('  ·  '))}</span></div>
  </section>`;
}

function secOrario(x, c) {
  const { M, mins, today, todayL, ndLabel, d: dati } = x;
  const supp = ((dati.supplenze && dati.supplenze.ore) || []).filter(o => o && o.data && o.ora);
  // mie verifiche dall'agenda ClasseViva (agenda.json): ore = mie ore della classe toccate dalla verifica
  const ver = ((dati.agenda && dati.agenda.eventi) || []).filter(e => e && e.verifica && Array.isArray(e.ore));
  let suppInVista = false, verInVista = false;
  if (!M.has) return sec('orario', c, head('orario', c, 'Orario · prossimi giorni') + empty('Nessun dato da orario.json', 'Esegui la skill orario-docente-promemoria: salva orario.json nella cartella Drive “Dashboard Docente/dati”.') + cmdFooter('orario', false));
  const cols = `grid-template-columns:72px repeat(${M.ore.length},minmax(52px,1fr))`;
  let html = `<div class="og" style="${cols}"><span></span>${M.ore.map(h => `<span class="og-h"><b>${h.n}ª</b><span class="m60">${h.s}–${h.e}</span></span>`).join('')}</div>`;
  let rows = 0;
  for (let i = 0; rows < 6 && i < 8; i++) {
    const d = addDays(today, i); if (d.getDay() === 0) continue; rows++;
    const ls_ = M.lessons(d), byN = {}; ls_.forEach(l => { byN[l.n] = l; });
    const suppGiorno = supp.filter(o => o.data === iso(d)), verGiorno = ver.filter(e => e.data === iso(d));
    const label = i === 0 ? 'Oggi' : i === 1 ? 'Domani' : G3[d.getDay()] + ' ' + d.getDate();
    const cells = !ls_.length && !suppGiorno.length ? '<span class="og-free m60">Giorno libero</span>' : M.ore.map(h => {
      const su = suppGiorno.find(o => Number(o.ora) === h.n);
      if (su) { // supplenza a mio carico: bordo tratteggiato accento, al posto della cella normale
        suppInVista = true;
        const past = i === 0 && mins >= tm(h.e);
        return `<span class="og-c og-sup" style="opacity:${past ? 0.45 : 1}" title="${esc('Supplenza ' + (su.classe || '') + (su.aula ? ' · ' + su.aula : '') + (su.sostituisce ? ' · al posto di ' + su.sostituisce : ''))}"><b>${esc(su.classe || 'Suppl.')}</b><span>Supplenza${su.aula ? ' · ' + esc(su.aula) : ''}</span></span>`;
      }
      const l = byN[h.n], isNow = i === 0 && l && mins >= tm(h.s) && mins < tm(h.e), past = i === 0 && mins >= tm(h.e);
      const vs = l ? verGiorno.filter(e => e.classe === l.cls && e.ore.includes(h.n)) : [];
      if (vs.length) verInVista = true;
      const bd = l ? (isNow || vs.length ? 'var(--color-accent)' : 'var(--color-divider)') : 'transparent';
      const bg = isNow ? 'var(--color-accent)' : l ? 'transparent' : 'color-mix(in srgb,var(--color-text) 3%,transparent)';
      const fg = isNow ? 'var(--color-bg)' : l ? 'var(--color-text)' : 'color-mix(in srgb,var(--color-text) 35%,transparent)';
      const tit = vs.length ? ` title="${esc(vs.map(e => e.testo).join('\n'))}"` : '';
      const ver = vs.length ? `<span${!isNow ? ' style="font-weight:600;color:var(--color-accent-700)"' : ''}>Verifica</span>` : '';
      return `<span class="og-c${vs.length ? ' og-ver' : ''}"${tit} style="border-color:${bd};background:${bg};color:${fg};opacity:${past ? 0.45 : 1}"><b>${esc(l ? l.cls : '·')}</b><span>${esc(l ? l.lab : '')}</span>${ver}</span>`;
    }).join('');
    html += `<div class="og" style="${cols}"><span class="og-d"><b style="color:${i === 0 ? 'var(--color-accent-700)' : 'var(--color-text)'}">${label}</b><span class="m60">${G3[d.getDay()]} ${dmy(d)}</span></span>${cells}</div>`;
  }
  const pend = todayL.filter(l => tm(l.e) > mins);
  const prom = pend.length ? pend.map(l => l.e + ' firma ' + l.cls).join(' · ') + '  (avviso 5 min prima della fine dell\'ora)'
    : todayL.length ? 'Lezioni di oggi concluse: le firme sono nella sezione 02.' : 'Oggi nessuna ora da firmare. Prossimo giorno: ' + ndLabel + '.';
  const tag = M.vigore ? `<span class="tag tag-accent">In vigore dal ${esc(M.vigore)}</span>` : '';
  const leg = [suppInVista && 'Bordo tratteggiato: supplenza a tuo carico.', verInVista && 'Bordo spesso: tua verifica in agenda ClasseViva.'].filter(Boolean);
  if (leg.length) html += `<span class="small m62" style="display:block;margin-top:6px">${leg.join(' ')}</span>`;
  return sec('orario', c, head('orario', c, 'Orario · prossimi giorni', tag) + `<div class="ox">${html}</div>
    <div class="col" style="gap:6px;font-size:13px"><span class="kicker">Promemoria firma a fine ora</span><span style="white-space:pre-wrap">${esc(prom)}</span></div>` + cmdFooter('orario', false));
}

function secFirme(x, c) {
  const { M, mins, today, todayB, crOk, d } = x;
  const titolo = 'Firme registro · ' + GG[today.getDay()] + ' ' + dmy(today);
  if (!M.has) return sec('firme', c, head('firme', c, esc(titolo)) + empty('Nessun dato da orario.json', 'Senza orario non so quali ore firmare oggi.') + cmdFooter('firme', true));
  const pronta = b => tm(b.e) + PRONTA;
  const testi = (d.firme && d.firme[iso(today)]) || {};
  let nDone = 0;
  const items = todayB.map(b => {
    const key = iso(today) + '-' + b.first, done = x.fatta(b); if (done) nDone++;
    const rec = firmaRec(testi[String(b.first)]), avail = mins >= pronta(b);
    const inCoda = S.coda.find(q => (q.azione || 'firma') === 'firma' && q.data === iso(today) && q.ora === b.first);
    const valore = S.mod[key] ?? (inCoda ? inCoda.testo : rec.testo) ?? '';
    const tags = [];
    if (rec.stato === 'generata') tags.push(['tag-accent', 'Bozza generata' + (rec.generata ? ' alle ' + hm(new Date(rec.generata)) : '')]);
    if (rec.stato === 'generata' && rec.novita === 0) tags.push(['tag-outline', 'Nessuna novità su Classroom: da verificare']);
    if (rec.stato === 'modificata') tags.push(['tag-neutral', 'Modificata da te']);
    if (rec.stato === 'confermata') tags.push(['tag-neutral', 'Bozza confermata']);
    if (rec.copiata) tags.push(['tag-neutral', 'Copiata alle ' + hm(new Date(rec.copiata))]);
    if (S.mod[key] !== undefined && S.mod[key] !== rec.testo) tags.push(['tag-outline', 'Modifiche non ancora copiate']);
    if (inCoda) tags.push(['tag-outline', 'Da sincronizzare']);
    let body;
    if (!avail && !valore) body = `<p class="empty" style="display:block">In attesa: la bozza compare alle ${hhmm(pronta(b))}, 5 minuti dopo la fine dell'ora.</p>`;
    else {
      const ph = rec.stato === 'errore' ? 'Bozza non generata: ' + rec.errore + '. Puoi scrivere qui la firma.' : 'Bozza in arrivo: si aggiorna da sola. Intanto puoi scrivere qui la firma.';
      body = (tags.length ? `<div class="row" style="gap:6px">${tags.map(t => `<span class="tag ${t[0]}">${esc(t[1])}</span>`).join('')}</div>` : '')
        + `<textarea class="input firma-ed" id="fx-${key}" rows="${Math.max(4, Math.ceil(valore.length / 55))}" placeholder="${esc(ph)}" aria-label="Firma ${esc(b.cls)} ${oreLabel(b)}">${esc(valore)}</textarea>`;
    }
    const puoCopiare = avail || valore;
    return `<article class="art" style="opacity:${done ? 0.55 : 1}">
      <div class="art-h"><span class="art-t">${esc(b.cls)} <small>· ${oreLabel(b)}</small></span><span class="m65" style="font-size:11px">Num ore ${b.num} · Compresenza</span></div>
      ${body}
      <div class="row">${puoCopiare ? `<button class="btn btn-primary" data-act="copyfirma" data-key="${key}" data-data="${iso(today)}" data-ora="${b.first}" data-cls="${esc(b.cls)}">${S.copied === 'f-' + key ? 'Copiata ✓' : 'Copia firma'}</button>` : ''}
        ${rec.bozza && valore !== rec.bozza ? `<button class="btn btn-ghost" data-act="ripristina" data-key="${key}" data-data="${iso(today)}" data-ora="${b.first}">Ripristina bozza</button>` : ''}
        <button class="btn btn-ghost" data-act="firma" data-key="${key}" data-data="${iso(today)}" data-ora="${b.first}" data-val="${done ? 0 : 1}">${done ? 'Firmata ✓ (annulla)' : 'Segna come firmata'}</button></div>
    </article>`;
  }).join('');
  const prossima = todayB.find(b => mins < pronta(b));
  const status = !todayB.length ? 'Nessuna lezione' : !todayB.some(b => mins >= pronta(b)) ? 'Dalle ' + hhmm(pronta(todayB[0])) : nDone + ' / ' + todayB.length + ' firmate';
  let inner = head('firme', c, esc(titolo), `<span class="tag tag-accent">${status}</span>`);
  if (prossima) inner += alertBox(`<strong>Prossima bozza alle ${hhmm(pronta(prossima))}</strong> (${esc(prossima.cls)} · ${oreLabel(prossima)}): ogni firma compare 5 minuti dopo la fine dell'ora. Mancano ${durata(pronta(prossima) - mins)}.`);
  if (!crOk && todayB.length) inner += alertBox(`<strong>Classroom non raggiungibile.</strong> ${esc(fonte('classroom').errore || '')} Senza Classroom le bozze non vengono generate.`);
  if (todayB.length) inner += '<span class="small m62">Modifica la bozza con quello che hai fatto in classe, poi premi Copia firma e incollala su Classeviva. La versione copiata resta qui e serve a migliorare le bozze successive.</span>';
  if (!todayB.length) inner += '<p style="margin:0;font-size:14px">Nessuna lezione oggi: niente da firmare.</p>';
  inner += `<div class="cards">${items}</div>` + cmdFooter('firme', true);
  return sec('firme', c, inner);
}

// Stato del report: quello pronto per il prossimo giorno di scuola, oppure in attesa/in preparazione.
function reportStato(d, M, today, mins) {
  const todayL = M.lessons(today), fine = todayL.length ? tm(todayL[todayL.length - 1].e) : 0;
  const r = d.report || null, oggiIso = iso(today);
  // fino alla fine delle lezioni di oggi resta utile il report di oggi; poi si guarda al prossimo giorno
  const target = r && r.data === oggiIso && r.generato && mins < fine ? today : M.nextSchool(today);
  const tIso = iso(target), pronto = r && r.data === tIso && r.generato ? r : null;
  const inCorso = !!(r && (r.inCorso === tIso || (r.data === tIso && r.inCorso)));
  const testi = (d.firme && d.firme[oggiIso]) || {};
  const mancano = M.blocks(today).filter(b => { const k = oggiIso + '-' + b.first; return !(k in S.done ? S.done[k] : firmaRec(testi[String(b.first)]).firmata); }).length;
  const breve = pronto ? 'pronto' : inCorso ? 'in preparazione' : mancano ? 'appena segni le ' + mancano + ' firme mancanti (al più tardi alle 18:00)' : M.blocks(today).length ? 'in preparazione' : 'alle 18:00';
  return { target, label: GG[target.getDay()] + ' ' + dmy(target), pronto, inCorso, mancano, breve };
}

// Impaginazione come l'artefatto "Report lezioni": barra di stato, premessa, una scheda per classe
// (argomento, ultima cosa, prossimo passo, avviso, testo da pubblicare) e i file trascinabili.
function secReport(x, c) {
  const { M, rep, today } = x;
  const tg = rep.target, dataLunga = GG[tg.getDay()] + ' ' + tg.getDate() + ' ' + MESI[tg.getMonth()] + ' ' + tg.getFullYear();
  const titolo = 'Report lezioni · ' + dataLunga;
  if (!M.has) return sec('report', c, head('report', c, esc(titolo)) + empty('Nessun dato da orario.json', 'Il report parte dalle classi e dai laboratori dell\'orario.') + cmdFooter('report', true));
  const p = rep.pronto, blocchi = M.blocks(tg), ore = M.lessons(tg);
  const gen = p && new Date(p.generato), quando = d0 => GG[d0.getDay()] + ' ' + dmy(d0) + '/' + d0.getFullYear() + ' ore ' + hm(d0);
  const stato = p ? [p.controllo20 ? (p.nessunaModifica ? 'VERIFICATO alle ' + hm(new Date(p.controllo20)) + ': nessuna modifica' : 'AGGIORNATO alle ' + hm(new Date(p.controllo20))) : 'COMPLETO',
      'Giorno-obiettivo: ' + dataLunga, 'generato ' + quando(gen), 'dati di Classroom aggiornati ' + (iso(gen) === iso(today) ? 'ad oggi' : 'al ' + dmy(gen)) + ' (sola lettura)'].join(' · ')
    : (rep.inCorso ? 'IN PREPARAZIONE' : 'IN ATTESA') + ' · Giorno-obiettivo: ' + dataLunga;
  let inner = head('report', c, esc(titolo));
  inner += `<div class="rep-st${p ? ' ok' : ''}" role="status">${esc(stato)}</div>`;
  if (!p) inner += alertBox(rep.inCorso ? '<strong>Report in preparazione.</strong> Passa dalla Batch API di Claude (metà prezzo): compare qui di solito entro un\'ora.'
    : rep.mancano ? `<strong>Il report si prepara appena tutte le firme di oggi risultano firmate</strong> (ne mancano ${rep.mancano}); al più tardi alle 18:00. Sotto: classi e laboratori dall'orario.`
    : '<strong>Il report si prepara entro pochi minuti</strong> (oggi senza lezioni: alle 18:00).');
  // premessa: orario, campanelle e ore libere del giorno, poi come usare i file
  const libere = M.ore.filter(h => !ore.some(l => l.n === h.n)).map(h => h.n + 'ª');
  const premessa = [`Ore e laboratori dall'orario${M.vigore ? ' (dal ' + M.vigore + ')' : ''}; campanelle ${M.ore.map(h => h.n + 'ª ' + h.s.replace(/^0/, '')).join(' · ')}.`,
    `Il ${GG[tg.getDay()]} hai ${ore.length} ${ore.length === 1 ? 'ora' : 'ore'}${libere.length && ore.length ? (libere.length === 1 ? '; la ' + libere[0] + ' è libera' : '; libere: ' + libere.join(', ')) : ''}.`,
    p ? 'Solo contenuti pubblicati da te su Classroom. Trascina i file nella cartella o nel post di Classroom, oppure usa Scarica / Copia.' : ''].filter(Boolean).join(' ');
  inner += `<p class="rep-pre m70">${esc(premessa)}</p>`;
  if (p && !p.controllo20) inner += '<span class="small m62">Alle 20:00 controllo gli stream Classroom delle classi: se ci sono modifiche, il report si aggiorna.</span>';
  const con = (x.d.orario && x.d.orario.compresenza) || {};
  const cards = blocchi.map(b => {
    const k = p && p.classi && p.classi[b.cls], compr = (k && k.con) || con[b.cls];
    const quando = `${oreLabel(b)} (${b.s.replace(/^0/, '')}–${b.e.replace(/^0/, '')})${b.lab ? ' · ' + b.lab : ''}${compr ? ' · con ' + compr : ''}`;
    let body;
    if (k && !k.errore) {
      const rows = [['Argomento', [k.lang, k.arg].filter(Boolean).join(' – ')], ['Ultima cosa', k.ultimo], ['Prossimo passo', k.prossimo], ['Perché', k.motivo]].filter(r => r[1]);
      body = rows.length ? `<dl class="rep-dl">${rows.map(r => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>` : '';
      if (k.avviso) body += `<div class="rep-warn">${/^avvis/i.test(k.avviso) ? '' : 'Avviso: '}${esc(k.avviso)}</div>`;
      if (k.testo) { const key = 't-' + b.cls + b.first; COPIE[key] = k.testo; body += `<h4 class="rep-h">Testo da pubblicare (solo la comanda)</h4><div class="rep-txt">${esc(k.testo)}</div><div class="row"><button class="btn btn-secondary" data-act="copy" data-key="${key}">${S.copied === key ? 'Copiato ✓' : 'Copia testo'}</button></div>`; }
      if (Array.isArray(k.files)) body += k.files.map((f, i) => repFile(f, b.cls + '-' + b.first + '-' + i)).join('');
    } else if (k && k.errore) body = `<span class="m62" style="font-size:13px">Report non generato per la ${esc(b.cls)}: ${esc(k.errore)}</span>`;
    else body = `<span class="m62" style="font-size:13px">${p ? 'Classe non presente nel report.' : 'Argomento, prossimo passo, testo da pubblicare e file compariranno con il report.'}</span>`;
    return `<article class="rep-card"><div class="rep-when"><span class="rep-cls">${esc(b.cls)}</span><span>${esc(quando)}</span></div>${body}</article>`;
  });
  inner += cards.length ? `<div class="rep-list">${cards.join('')}</div>` : '<p style="margin:0;font-size:14px">Nessuna lezione in programma.</p>';
  if (p && p.fonti) inner += `<p class="small m62" style="margin:0">Fonti: ${esc(p.fonti)}</p>`;
  return sec('report', c, inner + cmdFooter('report', true));
}

/* file del report: anteprima, Copia / Scarica e trascinamento (verso Finder, Drive o il post di Classroom) */
let FILE_REP = {};
const nomeFile = n => String(n || 'file').replace(/[\\/:*?"<>|]+/g, '_');
const mimeDi = (n, m) => /^(text\/plain|image\/(svg\+xml|png|jpeg|gif))$/.test(m || '') ? m : (/\.svg$/i.test(n) ? 'image/svg+xml' : /\.(png|jpe?g|gif)$/i.test(n) ? 'image/' + n.split('.').pop().toLowerCase().replace('jpg', 'jpeg') : 'text/plain');
const b64utf8 = t => { const by = new TextEncoder().encode(t); let s = ''; for (let i = 0; i < by.length; i += 0x8000) s += String.fromCharCode.apply(null, by.subarray(i, i + 0x8000)); return btoa(s); };
function repFile(f, key) {
  if (!f || !f.n) return '';
  const nome = nomeFile(f.n), mime = mimeDi(nome, f.mime), u = safeUrl(f.url);
  const testo = typeof f.contenuto === 'string' && f.contenuto ? f.contenuto : '';
  const b64 = f.b64 && /^[A-Za-z0-9+/=]+$/.test(f.b64) ? f.b64 : testo ? b64utf8(testo) : '';
  const img = /^image\//.test(mime) && b64;
  const presente = /presente/i.test(f.o || ''), daFare = !b64 && !u;
  if (b64 || u) FILE_REP[key] = { nome, mime, b64, url: u ? f.url : '' };
  const tag = `<span class="tag ${presente ? 'rep-tg' : daFare ? 'tag-outline' : 'rep-tp'}">${esc(f.o || (b64 ? 'prodotta da Claude' : ''))}</span>`;
  let h = `<div class="rep-file${daFare ? ' off' : ''}"${daFare ? '' : ` draggable="true" data-file="${esc(key)}" title="Trascina il file nella cartella o nel post di Classroom"`}>`
    + `<div class="rep-fh"><b class="mono">${daFare ? '' : '⠿ '}${esc(nome)}</b>${tag}</div>`;
  if (f.desc) h += `<div class="small m62">${esc(f.desc)}</div>`;
  if (img) h += `<img class="rep-img" src="data:${esc(mime)};base64,${b64}" alt="${esc(nome)}" draggable="false">`;
  else if (testo) { COPIE['fc-' + key] = testo; h += `<pre class="rep-code">${esc(testo)}</pre>`; }
  const btn = [];
  if (testo && !img) btn.push(`<button class="btn btn-secondary" data-act="copy" data-key="fc-${esc(key)}">${S.copied === 'fc-' + key ? 'Copiato ✓' : 'Copia codice'}</button>`);
  if (b64) btn.push(`<button class="btn btn-ghost" data-act="scaricafile" data-file="${esc(key)}">Scarica</button>`);
  if (u) btn.push(`<a class="btn btn-ghost" href="${u}" target="_blank" rel="noopener">Apri</a>`);
  if (daFare) btn.push('<span class="small m62">Da preparare: il file non è ancora disponibile.</span>');
  return h + (btn.length ? `<div class="row">${btn.join('')}</div>` : '') + '</div>';
}
const blobFile = r => { const s = atob(r.b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return new Blob([a], { type: r.mime }); };
// Trascinando una scheda: Chrome salva il file dove lo si rilascia (DownloadURL); altrove arriva il link o il nome.
document.addEventListener('dragstart', e => {
  const el = e.target.closest && e.target.closest('.rep-file[data-file]'), r = el && FILE_REP[el.dataset.file]; if (!r) return;
  S.trascinoFile = true;
  e.dataTransfer.effectAllowed = 'copy';
  if (r.b64) e.dataTransfer.setData('DownloadURL', r.mime + ':' + r.nome + ':data:' + r.mime + ';base64,' + r.b64);
  if (r.url) e.dataTransfer.setData('text/uri-list', r.url);
  e.dataTransfer.setData('text/plain', r.url || r.nome);
});
document.addEventListener('dragend', () => { if (S.trascinoFile) { S.trascinoFile = false; render(); } });

function circolariVisibili(d) {
  const jobs = Array.isArray(d.documenti) ? d.documenti : [];
  const analizzate = new Set(jobs.flatMap(j => ((j.analisi && j.analisi.circolari) || []).map(z => String(z.numero || '').replace(/\D/g, ''))).filter(Boolean));
  const numero = t => (String(t).match(/circ\.?\s*(\d+)/i) || [])[1];
  // "Segna come letta": vale subito sul dispositivo, poi il backend la segna come letta anche in Gmail
  return (Array.isArray(d.circolari) ? d.circolari : []).filter(i => !(i.id && S.nascoste.includes(i.id)) && !analizzate.has(numero(i.titolo)))
    .filter(i => !(i.id && daClasseviva(i) && S.lette.includes(i.id))) // notifica ClasseViva letta = cestinata: esce dall'elenco
    .map(i => i.nuova && i.id && S.lette.includes(i.id) ? { ...i, nuova: false } : i);
}
function secCircolari(x, c) {
  const { d, aggTxt } = x, g = fonte('gmail');
  const jobs = Array.isArray(d.documenti) ? d.documenti : [];
  const items = circolariVisibili(d);
  const nNew = items.filter(i => i.nuova).length;
  const tagCls = r => (r === 'Informativa' || r === 'Completato' || r === 'Non di competenza') ? 'tag-neutral' : (r === 'Adempimento' || r === 'Da aprire') ? 'tag-outline' : 'tag-accent';
  let inner = head('circolari', c, 'Circolari', `<span class="tag tag-accent">${items.length ? (nNew ? nNew + ' nuove' : 'Nessuna nuova') : '—'}</span>`);
  // zona di trascinamento: circolari, variazioni d'orario e moduli scaricati dalla bacheca
  inner += `<div class="drop${S.trascina ? ' on' : ''}" id="drop">
    <span><b>Trascina qui circolari, variazioni d'orario e moduli</b> (PDF, Word, Excel, immagini): li analizzo con le regole della skill circolari, le supplenze vanno nell'orario e i moduli richiesti vengono compilati.</span>
    <div class="row" style="align-items:center"><button class="btn btn-secondary" data-act="scegli">Scegli file</button>
      <input class="input" id="doc-nota" style="flex:1 1 180px;width:auto" placeholder="Nota per Claude (facoltativa)" aria-label="Nota per Claude"></div>
    <input type="file" id="doc-file" multiple accept=".pdf,.doc,.docx,.odt,.xls,.xlsx,.ods,.txt,image/*" hidden>
    ${S.invio ? `<span class="small">${esc(S.invio)}</span>` : ''}${S.invioErr ? `<span class="small" style="color:var(--color-accent-800)">${esc(S.invioErr)}</span>` : ''}
  </div>`;
  inner += jobs.map(renderJob).join('');
  inner += `<span class="small m62">Notifiche in posta (Gmail, ClasseViva) · aggiornato ${esc(aggTxt)}</span>`;
  if (!items.length) inner += g.ok ? empty('Nessuna notifica da analizzare', 'Le notifiche di ClasseViva, SIF2127, FEA, Cineca e Segreteria compariranno qui.') : empty('Nessun dato da Gmail', g.errore || 'Controlla il backend Apps Script.');
  else inner += `<ul class="plain">${items.map(i => {
    const cv = daClasseviva(i), u = cv ? (IOS ? CLASSEVIVA_COMANDO : CLASSEVIVA_BACHECA) : safeUrl(i.url), t = esc(i.titolo);
    return `<li class="li circ"><div class="circ-h">${u ? `<a class="circ-t" href="${esc(u)}"${cv && IOS ? '' : ' target="_blank" rel="noopener"'}${cv ? ' title="Apri in ClasseViva"' : ''}>${i.nuova ? '<span class="dot-new" title="Non letta"></span>' : ''}${t}</a>` : `<span class="circ-t">${i.nuova ? '<span class="dot-new" title="Non letta"></span>' : ''}${t}</span>`}<span class="tag ${tagCls(i.rig)}">${esc(i.rig)}</span></div><span class="circ-n m70">${esc(i.nota)}</span>${i.nuova && i.id ? `<button class="btn btn-ghost" style="align-self:flex-start" data-act="letta" data-id="${esc(i.id)}"${daClasseviva(i) ? ' title="Segna come letta e sposta la mail di notifica nel Cestino di Gmail"' : ''}>Segna come letta</button>` : ''}${i.id && (i.fonte === 'SIF2127' || i.fonte === 'FEA' || i.rig === 'Adempimento') ? `<button class="btn btn-ghost" style="align-self:flex-start" data-act="nascondi" data-id="${esc(i.id)}">Già fatto · nascondi</button>` : ''}</li>`;
  }).join('')}</ul>`;
  return sec('circolari', c, inner + cmdFooter('circolari', true, true), 12);
}

// Un invio di documenti: stato, circolari analizzate, supplenze trovate, documenti prodotti, domande.
function renderJob(j) {
  const quando = j.creato ? dmy(new Date(j.creato)) + ' ' + hm(new Date(j.creato)) : '';
  const stato = { in_coda: 'In analisi…', produzione: 'Compilo i documenti richiesti…', completato: 'Analizzati', errore: 'Errore' }[j.stato] || j.stato;
  const a = j.analisi || {};
  let h = `<div class="job"><div class="circ-h"><span class="small m62">Inviati il ${esc(quando)} · ${esc((j.files || []).join(', '))}</span><span class="tag ${j.stato === 'completato' ? 'tag-neutral' : 'tag-outline'}">${esc(stato)}</span></div>`;
  if (j.errore) h += `<span class="avviso">Errore: ${esc(j.errore)}</span>`;
  (a.circolari || []).forEach((z, i) => {
    const tit = (z.numero ? 'Circ. ' + z.numero + ' – ' : '') + z.titolo + (z.data ? ' (' + z.data + ')' : '');
    h += `<div class="circ li"><div class="circ-h"><span class="circ-t">${esc(tit)}</span><span class="tag ${z.pertinenza === 'Ti riguarda' || z.pertinenza === 'Le tue classi' ? 'tag-accent' : 'tag-neutral'}">${esc(z.pertinenza)}</span></div>`;
    if (z.obiettivo) h += `<span class="circ-n">${esc(z.obiettivo)}</span>`;
    if (z.sintesi) h += `<span class="circ-n m70">${esc(z.sintesi)}</span>`;
    (z.adempimenti || []).forEach(ad => { h += `<span class="circ-n"><b>Adempimento:</b> ${esc(ad.cosa)}${ad.scadenza ? ' · entro ' + esc(dmy(new Date(ad.scadenza + 'T12:00:00'))) : ''}${ad.documenti ? ' · ' + esc(ad.documenti) : ''}${ad.riferimenti ? ' · ' + esc(ad.riferimenti) : ''}</span>`; });
    (z.promemoria || []).forEach((pm, k) => { h += `<div class="row" style="align-items:center;gap:8px"><span class="circ-n"><b>Promemoria:</b> ${esc(pm.titolo)} · ${esc(pm.data ? dmy(new Date(pm.data + 'T12:00:00')) : '')}${pm.inizio ? ' ' + esc(pm.inizio) + (pm.fine ? '–' + esc(pm.fine) : '') : ''}${pm.luogo ? ' · ' + esc(pm.luogo) : ''}</span><button class="btn btn-ghost" data-act="ics" data-job="${esc(j.id)}" data-c="${i}" data-p="${k}">Aggiungi al calendario</button></div>`; });
    h += '</div>';
  });
  if (a.variazioni_esaminate) h += `<span class="circ-n">${(a.supplenze || []).length ? '<b>Supplenze a tuo carico:</b> ' + a.supplenze.map(s2 => esc(s2.classe + ' ' + s2.ora + 'ª ora ' + dmy(new Date(s2.data + 'T12:00:00')) + (s2.aula ? ' · ' + s2.aula : ''))).join('; ') + ' (inserite nell\'orario)' : 'Variazioni d\'orario esaminate: nessuna supplenza a tuo nome.'}</span>`;
  (a.domande || []).forEach(q => { h += `<span class="avviso">Domanda: ${esc(q)} (rispondi nella nota del prossimo invio)</span>`; });
  if ((j.documenti || []).length) h += `<div class="row" style="gap:6px">${j.documenti.map(dc => `<button class="btn btn-primary" data-act="scarica" data-file="${esc(dc.file_id)}">${S.copied === 'dl-' + dc.file_id ? 'Scaricato ✓' : 'Scarica ' + esc(dc.nome)}</button>`).join('')}</div>`;
  if (j.noteProduzione) h += `<span class="circ-n m70" style="white-space:pre-wrap">${esc(j.noteProduzione)}</span>`;
  return h + '</div>';
}

function scadenzeOrdinate(d, today) {
  const t0 = new Date(iso(today) + 'T12:00:00');
  return (Array.isArray(d.scadenze) ? d.scadenze : []).filter(s => !(s.id && S.nascoste.includes(s.id))).map(s => {
    if (!s.d) return { ...s, n: 99, dd: '—', count: 'senza data', col: 'var(--color-accent-700)', w: 500 };
    const dt = new Date(s.d + 'T12:00:00'); if (isNaN(dt)) return null;
    const n = Math.round((dt - t0) / 864e5);
    return { ...s, n, dd: dmy(dt), count: n < 0 ? 'scaduta' : n === 0 ? 'oggi' : n === 1 ? 'domani' : 'tra ' + n + ' gg', col: n <= 1 ? 'var(--color-accent-700)' : 'color-mix(in srgb,var(--color-text) 60%,transparent)', w: n <= 2 ? 700 : 400 };
  }).filter(s => s && s.n >= -1).sort((a, b) => a.n - b.n);
}
function secScadenze(x, c) {
  const { d, today } = x, list = scadenzeOrdinate(d, today);
  let inner = `<header class="sec-h"><div><span class="kicker">${esc(c.k.scadenze)}</span><h3>Scadenze e adempimenti</h3></div></header>`;
  const gm = fonte('gmail'), ca = fonte('calendar'), ps = fonte('posta_scuola');
  if (!list.length) inner += (gm.ok || ca.ok || ps.ok) ? empty('Nessuna scadenza in vista', 'Da posta e Calendar non risultano adempimenti nei prossimi giorni.') : empty('Nessun dato da Gmail e Calendar', [gm.errore, ca.errore].filter(Boolean).join(' · '));
  // gli adempimenti dalla posta della scuola hanno il link alla mail e si nascondono con "Già fatto"
  else inner += `<ul class="plain">${list.map(s => { const u = safeUrl(s.url); return `<li class="li sc"><span class="col" style="align-items:flex-start"><span class="sc-dd">${s.dd}</span><span style="font-size:11px;color:${s.col};font-weight:${s.w}">${s.count}</span></span><span class="col" style="gap:2px;min-width:0">${u ? `<a href="${u}" target="_blank" rel="noopener" style="font-weight:500;text-wrap:pretty;color:inherit">${esc(s.t)}</a>` : `<span style="font-weight:500;text-wrap:pretty">${esc(s.t)}</span>`}<span class="small m62">${esc(s.src)}</span>${s.ps && s.id ? `<button class="btn btn-ghost" style="align-self:flex-start" data-act="nascondi" data-id="${esc(s.id)}">Già fatto · nascondi</button>` : ''}</span></li>`; }).join('')}</ul>`;
  return sec('scadenze', c, inner, 12);
}

function secClassi(x, c) {
  const { d, M, today, agg } = x, cr = fonte('classroom');
  const classi = d.classi && typeof d.classi === 'object' ? d.classi : {};
  const ids = Object.keys(classi).sort();
  let inner = `<header class="sec-h"><div><span class="kicker">${esc(c.k.classi)}</span><h3>Stato classi</h3></div></header>`;
  if (!ids.length) inner += empty(cr.ok ? 'Nessun corso attivo trovato su Classroom' : 'Nessun dato da Classroom', cr.ok ? 'I corsi vengono abbinati alle classi dal nome (es. “4B”).' : (cr.errore || '') + ' · In alternativa la skill prepara-lezioni può salvare classi.json su Drive.');
  else {
    inner += `<div class="cls">${ids.map(id => {
      const k = classi[id] || {};
      let nx = '';
      if (M.has) for (let i = 1; i < 9 && !nx; i++) { const dd = addDays(today, i); const l = M.lessons(dd).find(z => z.cls === id); if (l) nx = G3[dd.getDay()] + ' ' + dmy(dd) + ' · ' + l.n + 'ª'; }
      const link = safeUrl(k.link);
      return `<div><div class="row" style="justify-content:space-between;align-items:baseline;gap:6px;flex-wrap:nowrap">${link ? `<a class="cls-id" href="${link}" target="_blank" rel="noopener">${esc(id)}</a>` : `<span class="cls-id">${esc(id)}</span>`}${k.lang ? `<span class="tag tag-accent">${esc(k.lang)}</span>` : ''}</div>
        <span class="m58" style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">Esercitazione aperta</span>
        <span style="font-weight:500;font-size:13.5px">${esc(k.aperta || '—')}</span>
        ${nx ? `<span class="small m65">Prossima: ${esc(nx)}</span>` : ''}</div>`;
    }).join('')}</div>`;
    inner += `<span class="small m62">Aggiornato al ${agg && !isNaN(agg) ? dmy(agg) + '/' + agg.getFullYear() : '—'} · da riverificare sempre su Classroom</span>`;
  }
  return sec('classi', c, inner, 12);
}

function secRicond(x, c) {
  const r = x.d.ricondizionamento, g = fonte('gmail');
  let inner = `<header class="sec-h"><div><span class="kicker">${esc(c.k.ricond)}</span><h3>Modulo ricondizionamento</h3></div></header>`;
  if (!r) inner += g.ok ? empty('Nessuna comunicazione SIF2127 negli ultimi 30 giorni', 'Le notifiche da noreply.pn2127@istruzione.it compariranno qui.') : empty('Nessun dato da Gmail', g.errore || '');
  else {
    if (r.modulo) inner += `<span class="small m62">Modulo ${esc(r.modulo)} · piattaforma SIF2127</span>`;
    inner += `<div class="col" style="gap:2px"><span class="lbl m58">Ultima attività</span><span class="hd" style="font-size:20px;line-height:1.2">${esc(r.ultima || '—')}</span>${r.nota ? `<span style="font-size:13px">${esc(r.nota)}</span>` : ''}</div>`;
    if (Array.isArray(r.prossimi) && r.prossimi.length) inner += `<ul class="plain">${r.prossimi.map(p => `<li class="li" style="padding:6px 0">${esc(p)}</li>`).join('')}</ul>`;
    inner += `<span class="small m62">${r.progetto ? 'Progetto ' + esc(r.progetto) + ' · ' : ''}prossimi incontri dal calendario SIF2127</span>`;
  }
  return sec('ricond', c, inner, 12);
}

function secOrient(x, c) {
  const list = Array.isArray(x.d.orientamento) ? x.d.orientamento : [], ca = fonte('calendar');
  let inner = `<header class="sec-h"><div><span class="kicker">${esc(c.k.orient)}</span><h3>Orientamento e Scuola Aperta</h3></div></header>`;
  if (!list.length) inner += ca.ok ? empty('Nessun evento nei prossimi 14 giorni', 'Gli eventi di Calendar con “orientamento” o “scuola aperta” nel titolo compariranno qui.') : empty('Nessun dato da Calendar', ca.errore || '');
  else inner += `<ul class="plain">${list.map(e => `<li class="li sc"><span class="or-dd">${esc(e.d)}</span><span class="col" style="gap:2px"><span style="font-weight:500">${esc(e.t)}</span><span class="small m62">${esc(e.s)}</span></span></li>`).join('')}</ul>`;
  return sec('orient', c, inner, 12);
}

function secUT(x, c) {
  const nOpen = S.tickets.filter(t => t.stato !== 'Chiusa').length;
  let inner = head('ut', c, 'Ufficio Tecnico · segnalazioni', `<span class="tag tag-accent">${nOpen} aperte</span>`);
  if (S.tickets.length) inner += `<ul class="plain ut">${S.tickets.map(t => `<li style="opacity:${t.stato === 'Chiusa' ? 0.5 : 1}"><span class="col" style="flex:1;min-width:0"><span style="font-weight:500;text-wrap:pretty">${esc(t.text)}</span><span class="small m62">${esc(t.lab)} · ${esc(t.data)}</span></span><button class="btn btn-secondary" style="min-width:84px" data-act="ut-cycle" data-id="${esc(t.id)}">${esc(t.stato)}</button><button class="btn btn-ghost" aria-label="Elimina" data-act="ut-del" data-id="${esc(t.id)}">×</button></li>`).join('')}</ul>`;
  else inner += '<span class="small m62">Nessuna segnalazione. Salvate su questo dispositivo.</span>';
  inner += `<div class="ut-add"><select class="input" id="ut-lab" style="flex:0 0 120px;width:auto" aria-label="Laboratorio">${LABS.map(l => `<option${l === S.utLab ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <input class="input" id="ut-text" style="flex:1 1 160px;width:auto" placeholder="Nuova segnalazione…" value="${esc(S.utText)}" aria-label="Nuova segnalazione">
    <button class="btn btn-secondary" data-act="ut-add">Aggiungi</button></div>`;
  return sec('ut', c, inner, 12);
}

function secNote(x, c) {
  return sec('note', c, `<header class="sec-h" style="flex-wrap:nowrap"><div><span class="kicker">${esc(c.k.note)}</span><h3>Note rapide</h3></div><span class="m58" style="font-size:11px">Salvate su questo dispositivo</span></header>
    <textarea class="input note" id="note" placeholder="Appunti per domani, cose da dire in classe, materiali da portare…" aria-label="Note rapide">${esc(S.note)}</textarea>`, 12);
}

function renderFoot() {
  const seg = (name, val, opts) => `<div class="seg" role="radiogroup" aria-label="${name}">${opts.map(([v, l]) => `<label class="seg-opt"><input type="radio" name="${name}" value="${v}" data-set="${name}"${v === val ? ' checked' : ''}>${l}</label>`).join('')}</div>`;
  const fonti = S.data && S.data.meta && S.data.meta.fonti ? Object.entries(S.data.meta.fonti) : [];
  return `<section class="blueprint sec foot">${CORNERS}
    <div class="foot-g"><span class="kicker">Tema</span>${seg('tema', S.tema, [['auto', 'Automatico'], ['light', 'Chiaro'], ['dark', 'Scuro']])}</div>
    <div class="foot-g" style="flex:1 1 260px"><span class="kicker">Stato fonti</span><ul class="plain fonti">${fonti.map(([k, f]) => `<li><span class="tag ${f.ok ? 'tag-accent' : 'tag-outline'}">${esc(k)}</span><span class="m65">${f.ok ? esc(f.letti || 0) + ' elementi letti' : esc(f.errore || 'non raggiungibile')}</span></li>`).join('') || '<li class="m65">—</li>'}</ul></div>
    <div class="foot-g"><span class="kicker">Collegamento</span><div class="row"><button class="btn btn-ghost" data-act="setup">Modifica collegamento</button><button class="btn btn-ghost" data-act="scollega">Scollega</button></div></div>
  </section>`;
}

/* ---------- pagina Spesa Claude ---------- */
// Stima dal backend: token di ogni chiamata ai prezzi di listino (spesa.voci del mese, spesa.giorni degli ultimi 62 giorni).
// Il credito caricato si inserisce a mano e resta su questo dispositivo: l'API non espone il saldo.
const VOCI_SPESA = [['firme', 'Firme registro'], ['report', 'Report lezioni'], ['posta', 'Posta della scuola'], ['circolari', 'Circolari e moduli'], ['altro', 'Altro']];
const NOMI_MODELLI = { 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-5-5': 'Haiku 5.5' };
const dollari = v => '$ ' + (v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: v && v < 1 ? 3 : 2 });
const migliaia = n => n >= 1e6 ? (n / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' k' : String(n || 0);
const totVoci = voci => Object.values(voci || {}).reduce((a, v) => a + (typeof v === 'number' ? v : v.usd || 0), 0);
const meseLungo = m => m ? MESI[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4) : '';
const dmyIso = g => g.slice(8, 10) + '/' + g.slice(5, 7) + '/' + g.slice(0, 4);

function renderSpesa() {
  const sp = S.data.spesa, now = adesso(), oggi = iso(now);
  const blocco = (titolo, kicker, html, largo) => `<section class="blueprint sec"${largo ? ' style="grid-column:1 / -1"' : ''}>${CORNERS}<header class="sec-h"><div><span class="kicker">${esc(kicker)}</span><h3>${titolo}</h3></div></header>${html}</section>`;
  if (!sp) return `<div class="blueprint state">${CORNERS}<h3>Spesa Claude</h3>${empty('Nessun dato di spesa dal backend', 'Incolla il nuovo Code.gs nell\'editor di Apps Script e pubblica una nuova versione del deployment: il conteggio parte dalla chiamata a Claude successiva.')}</div>`;
  const giorni = sp.giorni || {}, totMese = totVoci(sp.voci), totPrec = totVoci(sp.mesePrec && sp.mesePrec.voci);
  // media giornaliera degli ultimi 14 giorni contati (dal primo giorno di conteggio)
  const ultimi = Array.from({ length: 14 }, (_, i) => iso(addDays(now, -i))).filter(g => !sp.dal || g >= sp.dal);
  const media = ultimi.length ? ultimi.reduce((a, g) => a + totVoci(giorni[g]), 0) / ultimi.length : 0;

  let html = '';
  const mese = `<div class="sp-big">${dollari(totMese)}</div>
    <span class="small m62">${esc(meseLungo(sp.mese))} · ${totPrec ? esc(meseLungo(sp.mesePrec.mese)) + ': ' + dollari(totPrec) + ' · ' : ''}media ${dollari(media)} al giorno${sp.dal ? ' · conteggio dal ' + dmyIso(sp.dal) : ''}</span>
    <span class="small m62">Stima: token di ogni chiamata ai prezzi di listino di Anthropic (il report via Batch API a metà prezzo). Non comprende il tempo di esecuzione del codice per i moduli delle circolari. Il saldo reale è sulla <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener">Console di Anthropic</a>.</span>`;
  html += blocco('Spesa di questo mese', 'Spesa Claude · 01', mese);

  // credito: caricato a mano, residuo = credito − spesa dal giorno della ricarica
  const cr = S.credito, spesoDal = cr ? Object.keys(giorni).filter(g => g >= cr.data).reduce((a, g) => a + totVoci(giorni[g]), 0) : 0;
  const residuo = cr ? cr.usd - spesoDal : 0, durata = cr && media > 0 ? Math.floor(residuo / media) : null;
  let credito = cr
    ? `<div class="sp-big"${residuo < 5 ? ' style="color:var(--color-accent-700)"' : ''}>${dollari(Math.max(residuo, 0))}</div>
       <span class="small m62">Residuo stimato: ${dollari(cr.usd)} caricati il ${dmyIso(cr.data)}, spesi ${dollari(spesoDal)} da allora.</span>
       <span style="font-size:14px">${durata === null ? 'Durata non ancora stimabile: serve qualche giorno di conteggio.' : residuo <= 0 ? '<strong>Credito probabilmente esaurito:</strong> firme e report si fermano finché non ricarichi.' : `Al ritmo attuale dura circa <strong>${durata} giorni</strong> (fino al ${dmy(addDays(now, durata))}).`}</span>`
      + (residuo < 5 && residuo > 0 ? alertBox('<strong>Credito quasi finito.</strong> Ricarica o attiva la ricarica automatica sulla Console di Anthropic.') : '')
    : '<p class="m62" style="margin:0;font-size:14px">Inserisci il credito che hai caricato e la data della ricarica: l\'app stima quanto resta e quanti giorni dura.</p>';
  credito += `<div class="row" style="align-items:flex-end">
      <div class="field" style="flex:1 1 120px"><label for="cr-usd">Credito caricato ($)</label><input class="input" id="cr-usd" type="number" min="0" step="1" inputmode="decimal" value="${esc(S.crUsd || (cr ? cr.usd : ''))}"></div>
      <div class="field" style="flex:1 1 150px"><label for="cr-data">Data della ricarica</label><input class="input" id="cr-data" type="date" max="${oggi}" value="${esc(S.crData || (cr ? cr.data : oggi))}"></div>
      <button class="btn btn-primary" data-act="credito">Salva</button>
    </div>
    <a class="small" href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener">Ricarica o attiva la ricarica automatica sulla Console di Anthropic</a>`;
  html += blocco('Credito', 'Spesa Claude · 02', credito);

  // per funzione
  const voci = VOCI_SPESA.filter(([k]) => (sp.voci || {})[k] || (sp.modelli || {})[k]);
  const righe = voci.map(([k, nome]) => {
    const v = (sp.voci || {})[k] || {}, mod = (sp.modelli || {})[k] || v.modello || '';
    const quota = totMese ? Math.round((v.usd || 0) / totMese * 100) : 0;
    return `<tr><th scope="row">${esc(nome)}<span class="small m60">${esc(NOMI_MODELLI[mod] || mod)}${k === 'report' ? ' · Batch API' : ''}</span></th>
      <td>${v.n || 0}</td><td>${migliaia(v.in || 0)} / ${migliaia(v.out || 0)}${v.cr ? '<span class="small m60">cache ' + migliaia(v.cr) + '</span>' : ''}</td><td><b>${dollari(v.usd || 0)}</b><span class="small m60">${quota}%</span></td></tr>`;
  }).join('');
  html += blocco('Per funzione', 'Spesa Claude · 03 · ' + meseLungo(sp.mese), `<div class="ox"><table class="sp-t"><thead><tr><th scope="col">Funzione</th><th scope="col">Chiamate</th><th scope="col">Token in / out</th><th scope="col">Spesa</th></tr></thead><tbody>${righe}</tbody></table></div>`, true);

  // ultimi 14 giorni
  const lista = Array.from({ length: 14 }, (_, i) => iso(addDays(now, -i))).filter(g => giorni[g]).map(g => {
    const d = new Date(g + 'T12:00:00'), parti = VOCI_SPESA.filter(([k]) => giorni[g][k]).map(([k, nome]) => nome.split(' ')[0] + ' ' + dollari(giorni[g][k]));
    return `<li><span class="sp-g">${G3[d.getDay()]} ${dmy(d)}</span><b>${dollari(totVoci(giorni[g]))}</b><span class="small m62">${esc(parti.join(' · '))}</span></li>`;
  }).join('');
  html += blocco('Ultimi 14 giorni', 'Spesa Claude · 04', lista ? `<ul class="plain sp-l">${lista}</ul>` : empty('Nessuna chiamata a Claude negli ultimi 14 giorni.'));

  // come si risparmia
  const m = sp.modelli || {};
  html += blocco('Risparmi attivi', 'Spesa Claude · 05', `<ul class="sp-r">
    <li><b>Report lezioni</b> con ${esc(NOMI_MODELLI[m.report] || m.report || 'Opus')} tramite la Batch API: metà prezzo, arriva entro circa un'ora.</li>
    <li><b>Controllo delle 20</b>: si rigenerano solo le classi il cui Classroom è cambiato, non tutto il report.</li>
    <li><b>Firme</b> con ${esc(NOMI_MODELLI[m.firme] || m.firme || '')}: metà prezzo di Opus.</li>
    <li><b>Posta della scuola</b> con ${esc(NOMI_MODELLI[m.posta] || m.posta || '')}: circa 40 volte più economico di Opus.</li>
    <li><b>Circolari e moduli</b> restano su ${esc(NOMI_MODELLI[m.circolari] || m.circolari || 'Opus')}: partono solo quando trascini un documento.</li></ul>`);

  return `<div class="grid">${html}</div>`;
}
function salvaCredito() {
  const usd = Number(String(S.crUsd || (document.getElementById('cr-usd') || {}).value || '').replace(',', '.'));
  const data = S.crData || (document.getElementById('cr-data') || {}).value || iso(adesso());
  if (!(usd > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) { const el = document.getElementById('cr-usd'); if (el) el.focus(); return; }
  S.credito = { usd, data }; ls.set(K.credito, S.credito); S.crUsd = ''; S.crData = ''; render();
}
function vaiPagina(p) {
  if (p) location.hash = p; else history.pushState(null, '', location.pathname + location.search);
  S.pagina = p; S.menu = false; scrollTo(0, 0); render();
  if (p === 'verifiche') caricaVerifiche();
}
['hashchange', 'popstate'].forEach(ev => addEventListener(ev, () => { S.pagina = paginaDaHash(); render(); if (S.pagina === 'verifiche') caricaVerifiche(); }));

/* ---------- pagina Verifiche ---------- */
// Elenco dal backend (?verifiche=1): compiti di Classroom con "VERIFICA" nel titolo, tutto in maiuscolo. Classroom si rilegge
// solo con «Aggiorna»: la richiesta va al backend, lo script della scuola la vede entro 5 minuti e invia l'elenco nuovo;
// intanto la pagina ricarica l'elenco ogni 20 secondi (per al più 10 minuti).
// A sinistra l'elenco cronologico (filtrabile per classe), a destra il dettaglio della verifica scelta.
async function caricaVerifiche() {
  if (S.ver.carico || !collegato()) return;
  S.ver = { ...S.ver, carico: true, err: '' }; render();
  try {
    const r = await fetch(S.mock ? './dev/verifiche-esempio.json' : urlDati(false) + '&verifiche=1', { cache: 'no-store', credentials: 'omit', redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!Array.isArray(j.verifiche)) throw new Error(r.headers.get('X-Dashboard-Cache') === '1' ? 'offline' : j.errore || 'risposta non valida');
    let attesa = S.ver.attesa || null, err = '';
    if (attesa && ((j.aggiornato && j.aggiornato > attesa.da) || (j.erroreAlle && j.erroreAlle > attesa.da))) attesa = null;
    else if (attesa && Date.now() - Date.parse(attesa.da) > 10 * 60e3) { attesa = null; err = 'lo script della scuola non ha risposto: controlla le sue Esecuzioni in Apps Script'; }
    S.ver = { dati: j, carico: false, err, at: Date.now(), attesa };
    if (!S.mock) ls.set(K.verifiche, j);
  } catch (e) { S.ver = { ...S.ver, carico: false, err: e.message || String(e), at: Date.now() }; }
  render();
}
async function aggiornaVerifiche() {
  if (S.ver.attesa) return;
  if (S.mock) { caricaVerifiche(); return; }
  try {
    const r = await fetch(ls.get(K.endpoint, ''), { method: 'POST', body: JSON.stringify({ azione: 'aggiorna_verifiche', token: ls.get(K.token, '') }), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, credentials: 'omit', redirect: 'follow' });
    const j = await r.json(); if (!j.ok) throw new Error(j.errore || 'richiesta rifiutata');
    S.ver = { ...S.ver, attesa: { da: j.richiesta }, err: '' };
  } catch (e) { S.ver = { ...S.ver, err: 'richiesta non inviata (' + (e.message || e) + ')' }; }
  render();
}
const verificheInAttesa = () => S.pagina === 'verifiche' && S.ver.attesa && !S.ver.carico && Date.now() - S.ver.at > 20e3;
// Correzione: le verifiche fino al 1° novembre 2026 sono già corrette; le nuove mostrano «Correggi», che sul Mac esegue
// il Comando rapido «Correggi verifica» (strumenti/Correggi verifica.shortcut): crea e apre nel Finder la cartella in
// Download e apre Claude con la richiesta per la skill valutazione-pratica. «Segna come corretta» vale per tutti i dispositivi.
const VERIFICHE_CORRETTE_FINO = '2026-11-01';
const MESI_CAP = MESI.map(m => m[0].toUpperCase() + m.slice(1));
const verCorretta = v => v.data <= VERIFICHE_CORRETTE_FINO || (v.id in S.verCorr ? S.verCorr[v.id] : !!((S.ver.dati && S.ver.dati.corrette) || {})[v.id]);
function cartellaVerifica(v, tutte) { // come nella skill: Verifica_<Tipo>_<Mese>_<Classe>, col giorno se nel mese ce n'è più d'una
  const tipo = t => /SQL/i.test(t) ? 'SQL' : /PHP/i.test(t) ? 'PHP' : /HTML/i.test(t) ? 'HTML' : 'Pratica';
  const base = x => 'Verifica_' + tipo(x.titolo) + '_' + MESI_CAP[Number(x.data.slice(5, 7)) - 1] + '_' + x.classe;
  return base(v) + (tutte.filter(x => base(x) === base(v)).length > 1 ? '_' + v.data.slice(8, 10) : '');
}
function richiestaCorrezione(v, cartella) {
  return `Correggi la verifica «${v.titolo}» della ${v.classe} del ${dmyIso(v.data)} con la skill valutazione-pratica.`
    + (v.link ? ` Compito su Classroom: ${v.link}` : '')
    + `\nCartella di lavoro: ~/Downloads/${cartella} (esiste già ed è aperta nel Finder): salva lì tutti i file.`
    + `\nSe le soluzioni sono già allegate al compito in Classroom${(v.allegati || []).length ? ' (allegati: ' + v.allegati.map(a => a.titolo).join(', ') + ')' : ''} usa quelle; altrimenti scrivile tu.`
    + `\nConfronta tutti gli elaborati con le soluzioni e, SENZA MODIFICARE IL CODICE DEGLI STUDENTI, aggiungi solo i commenti previsti dalla skill. Nomina gli elaborati con il nome dell'alunno.`;
}
const dataLunga = g => { const d = new Date(g + 'T12:00:00'); return GG[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear(); };
function renderVerifiche() {
  const now = adesso(), oggi = iso(now), j = S.ver.dati, tutte = (j && j.verifiche) || [];
  const classi = [...new Set(tutte.map(v => v.classe))].sort();
  const elenco = tutte.filter(v => !S.verClasse || v.classe === S.verClasse);
  const scelta = elenco.find(v => v.id === S.verSel) || elenco.filter(v => v.data <= oggi).pop() || elenco[elenco.length - 1];
  const agg = j && j.aggiornato ? new Date(j.aggiornato) : null;
  const stato = [agg ? 'Da Classroom, aggiornate alle ' + hm(agg) + (iso(agg) !== oggi ? ' del ' + dmy(agg) : '') : '',
    S.ver.attesa ? 'aggiornamento richiesto alle ' + hm(new Date(S.ver.attesa.da)) + ': lo script della scuola rilegge Classroom entro 5 minuti…' : S.ver.carico ? 'carico…' : '',
    S.ver.err ? (S.ver.err === 'offline' ? 'offline: ultimo elenco salvato' : 'aggiornamento non riuscito: ' + S.ver.err) : '', j && j.errore ? j.errore : ''].filter(Boolean).join(' · ');

  let sx = `<div class="row ver-f" role="radiogroup" aria-label="Classe">${[['', 'Tutte'], ...classi.map(c => [c, c])].map(([c, nome]) => `<button class="btn ${c === S.verClasse ? 'btn-primary' : 'btn-ghost'}" data-act="ver-classe" data-id="${c}" aria-pressed="${c === S.verClasse}">${nome}</button>`).join('')}</div>`;
  if (!elenco.length) sx += empty(j ? 'Nessuna verifica trovata' : S.ver.carico ? 'Carico le verifiche…' : 'Verifiche non disponibili',
    j ? 'Cerco in Classroom i compiti con «VERIFICA» nel titolo scritto tutto in maiuscolo, dal 1° settembre, nelle tue quattro classi.' : 'Premi «Aggiorna»: lo script della scuola rilegge Classroom entro 5 minuti.');
  else {
    let mese = '';
    sx += '<ol class="plain ver-l">' + elenco.map(v => {
      const m = v.data.slice(0, 7), intest = m !== mese ? `<li class="ver-m kicker">${MESI[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}</li>` : '';
      mese = m;
      const d = new Date(v.data + 'T12:00:00'), futura = v.data > oggi, ok = verCorretta(v);
      return intest + `<li><button class="ver-i${v === scelta ? ' on' : ''}" data-act="ver-sel" data-id="${esc(v.id)}" aria-current="${v === scelta}">
        <span class="ver-d">${G3[d.getDay()]} ${dmy(d)}</span><span class="tag ${v === scelta ? 'tag-accent' : 'tag-neutral'}">${esc(v.classe)}</span>
        <span class="ver-t">${esc(v.titolo)}<span class="small ${ok || futura ? 'm60' : 'ver-dc'}">${futura ? 'In programma' : ok ? 'Corretta' : 'Da correggere'}</span></span></button></li>`;
    }).join('') + '</ol>';
  }

  let dx = '';
  if (scelta) {
    const cartella = cartellaVerifica(scelta, tutte), cmd = richiestaCorrezione(scelta, cartella), ok = verCorretta(scelta), futura = scelta.data > oggi;
    COPIE['ver-cmd'] = cmd;
    const manuale = scelta.data > VERIFICHE_CORRETTE_FINO; // corretta segnata dal docente: si può annullare
    const azioni = futura ? '<span class="tag tag-outline">In programma</span>'
      : ok ? `<span class="tag tag-accent ver-ok">Corretta</span>${manuale ? '<button class="btn btn-ghost" data-act="ver-corretta" data-val="0">Segna da correggere</button>' : ''}`
      : (MAC ? `<a class="btn btn-primary" href="${'shortcuts://run-shortcut?name=' + encodeURIComponent('Correggi verifica') + '&input=text&text=' + encodeURIComponent(cartella + '\n' + 'claude://claude.ai/new?q=' + encodeURIComponent(cmd))}">Correggi</a>`
          : '<button class="btn btn-primary" disabled title="La correzione si fa sul Mac: usa la cartella Download e Claude desktop">Correggi dal Mac</button>')
        + `<button class="btn btn-secondary" data-act="copy" data-key="ver-cmd">${S.copied === 'ver-cmd' ? 'Copiato' : 'Copia richiesta'}</button><button class="btn btn-ghost" data-act="ver-corretta" data-val="1">Segna come corretta</button>`;
    const meta = [dataLunga(scelta.data), scelta.pubblicata ? 'pubblicata il ' + dmyIso(scelta.pubblicata.slice(0, 10)) + ' alle ' + scelta.pubblicata.slice(11, 16) : '',
      scelta.scadenza ? 'consegna entro il ' + dmyIso(scelta.scadenza) : '', scelta.punti ? 'punteggio massimo ' + scelta.punti : ''].filter(Boolean).join(' · ');
    dx = `<header class="sec-h"><div><span class="kicker">Verifica · ${esc(scelta.classe)}</span><h3>${esc(scelta.titolo)}</h3></div></header>
      <span class="small m62">${esc(meta)}</span>
      ${scelta.testo ? `<div class="ver-x">${esc(scelta.testo)}</div>` : '<p class="m62" style="margin:0;font-size:14px">Nessuna consegna scritta nel compito: la traccia è negli allegati.</p>'}
      ${(scelta.allegati || []).length ? `<div class="col" style="gap:6px"><span class="kicker">Allegati</span><ul class="plain ver-a">${scelta.allegati.map(a => `<li>${safeUrl(a.url) ? `<a href="${safeUrl(a.url)}" target="_blank" rel="noopener">${esc(a.titolo)}</a>` : esc(a.titolo)}</li>`).join('')}</ul></div>` : ''}
      <div class="row" style="align-items:center">${azioni}</div>
      ${!ok && !futura && MAC ? `<span class="small m62">«Correggi» crea e apre nel Finder la cartella <code>Download/${esc(cartella)}</code> e apre Claude con la richiesta per la skill valutazione-pratica. La prima volta installa il Comando rapido <a href="./strumenti/Correggi%20verifica.shortcut" download>Correggi verifica</a> (doppio clic sul file, poi Aggiungi; in Comandi rapidi › Impostazioni › Avanzate attiva «Consenti l'esecuzione degli script»).</span>` : ''}
      ${safeUrl(scelta.link) ? `<div class="row"><a class="btn btn-ghost" href="${safeUrl(scelta.link)}" target="_blank" rel="noopener">Apri in Classroom</a></div>` : ''}`;
  } else dx = empty('Scegli una verifica dall\'elenco.');

  return `<div class="ver-h"><div><span class="kicker">Verifiche · anno scolastico ${now.getMonth() >= 8 ? now.getFullYear() + '/' + String(now.getFullYear() + 1).slice(2) : now.getFullYear() - 1 + '/' + String(now.getFullYear()).slice(2)}</span>
      <h2 class="hd">${tutte.length} verifiche${S.verClasse ? ' · ' + elenco.length + ' della ' + esc(S.verClasse) : ''}</h2>
      <span class="small m62">${esc(stato)}</span></div>
      <button class="btn btn-secondary" data-act="ver-aggiorna" title="Rilegge le verifiche da Classroom" ${S.ver.attesa ? 'disabled' : ''}>${S.ver.attesa ? 'Aggiornamento in corso…' : 'Aggiorna'}</button></div>
    <div class="ver">
      <section class="blueprint sec ver-sx" aria-label="Elenco delle verifiche">${CORNERS}${sx}</section>
      <section class="blueprint sec ver-dx" id="ver-dettaglio" aria-live="polite">${CORNERS}${dx}</section>
    </div>`;
}

/* ---------- firme: modifica, copia, invio al backend ---------- */
// Una firma può arrivare come testo (firme.json delle skill) o come oggetto generato dal backend.
const firmaRec = v => typeof v === 'string' ? { testo: v } : (v && typeof v === 'object' ? v : {});
function copiaFirma(el) {
  const key = el.dataset.key, ta = document.getElementById('fx-' + key), testo = (ta ? ta.value : '').trim();
  if (!testo) { if (ta) ta.focus(); return; }
  COPIE['f-' + key] = testo; copia('f-' + key); // la copia negli appunti deve avvenire subito, nel gesto dell'utente
  const req = { data: el.dataset.data, ora: Number(el.dataset.ora), classe: el.dataset.cls, testo };
  const giorni = S.data.firme = S.data.firme || {}, g = giorni[req.data] = giorni[req.data] || {}, prima = firmaRec(g[String(req.ora)]);
  g[String(req.ora)] = { ...prima, classe: req.classe, testo, copiata: new Date().toISOString(),
    stato: prima.bozza ? (prima.bozza.trim() === testo ? 'confermata' : 'modificata') : 'scritta' };
  delete S.mod[key]; ls.set(K.mod, S.mod);
  if (S.mock) return;
  accoda({ azione: 'firma', ...req }, q => (q.azione || 'firma') === 'firma' && q.data === req.data && q.ora === req.ora);
}
// Coda delle operazioni da inviare al backend (copia firma, firmata, circolare nascosta): sopravvive a offline e riavvii.
function accoda(op, uguale) {
  if (S.mock) return;
  S.coda = S.coda.filter(q => !uguale(q)).concat([op]); ls.set(K.coda, S.coda);
  svuotaCoda();
}
async function svuotaCoda() {
  if (S.mock || !S.coda.length || svuotaCoda._in) return;
  svuotaCoda._in = true;
  const ep = ls.get(K.endpoint, ''), tk = ls.get(K.token, ''), resto = [];
  for (const q of S.coda) {
    try {
      const r = await fetch(ep, { method: 'POST', body: JSON.stringify({ azione: 'firma', ...q, token: tk }), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, credentials: 'omit', redirect: 'follow' });
      const j = await r.json();
      if (j.errore) resto.push(q);
    } catch (e) { resto.push(q); }
  }
  S.coda = resto; ls.set(K.coda, resto); svuotaCoda._in = false; render();
}
// Dopo l'orario di pronto di ogni bozza ricarica i dati a +1, +3, +6 e +10 minuti finché non arriva.
// Dopo l'ultima firma segnata, ricarica ogni 2 minuti (per 90 minuti: il report passa dalla Batch API) finché il report non è pronto.
function reportInArrivo() {
  if (!S.data || !S.ultimaFirmata || Date.now() - S.ultimaFirmata > 90 * 60e3 || Date.now() - S.lastFetch < 2 * 60e3) return false;
  const now = new Date(), today = new Date(now); today.setHours(12, 0, 0, 0);
  const r = reportStato(S.data, modello(S.data), today, now.getHours() * 60 + now.getMinutes());
  return !r.pronto && !r.mancano;
}
function bozzaInArrivo() {
  if (!S.data || SIM.ora || SIM.data) return false;
  const now = new Date(), today = new Date(now); today.setHours(12, 0, 0, 0);
  const testi = (S.data.firme && S.data.firme[iso(today)]) || {};
  return modello(S.data).blocks(today).some(b => !firmaRec(testi[String(b.first)]).testo && [1, 3, 6, 10].some(dm => {
    const t = new Date(today); t.setHours(0, tm(b.e) + PRONTA + dm, 0, 0);
    return now >= t && S.lastFetch < t.getTime();
  }));
}

/* ---------- documenti trascinati: invio, calendario, download ---------- */
const DOC_MAX_MB = 20;
async function inviaDocumenti(files) {
  if (!files.length) return;
  if (S.mock) { S.invioErr = 'Nel mock di sviluppo l\'invio dei documenti non è disponibile.'; render(); return; }
  const tot = files.reduce((n, f) => n + f.size, 0);
  if (tot > DOC_MAX_MB * 1048576) { S.invioErr = 'File troppo grandi: massimo ' + DOC_MAX_MB + ' MB per invio.'; render(); return; }
  const notaEl = document.getElementById('doc-nota'), nota = notaEl ? notaEl.value.trim() : '';
  S.invio = 'Invio di ' + files.length + ' file…'; S.invioErr = ''; render();
  try {
    const dati = await Promise.all(files.map(f => new Promise((ok, ko) => {
      const r = new FileReader(); r.onload = () => ok({ nome: f.name, tipo: f.type || '', dati: String(r.result).split(',')[1] || '' }); r.onerror = () => ko(r.error); r.readAsDataURL(f);
    })));
    const res = await fetch(ls.get(K.endpoint, ''), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, credentials: 'omit', redirect: 'follow',
      body: JSON.stringify({ azione: 'documenti', token: ls.get(K.token, ''), nota, files: dati }) });
    const j = await res.json();
    if (j.errore) throw new Error(j.errore);
    S.invio = null; S.attesaDocumenti = Date.now();
    await carica();
  } catch (e) { S.invio = null; S.invioErr = 'Invio non riuscito: ' + (e.message || e); render(); }
}
function salvaFile(nome, blob) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 30000);
}
async function scaricaDocumento(id) {
  try {
    const r = await fetch(ls.get(K.endpoint, '') + '?token=' + encodeURIComponent(ls.get(K.token, '')) + '&file=' + encodeURIComponent(id), { credentials: 'omit', redirect: 'follow' });
    const j = await r.json(); if (j.errore) throw new Error(j.errore);
    const bin = atob(j.dati), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    salvaFile(j.nome, new Blob([buf], { type: j.mime }));
    S.copied = 'dl-' + id; render();
  } catch (e) { S.invioErr = 'Download non riuscito: ' + (e.message || e); render(); }
}
// Evento .ics con gli avvisi della skill: la sera prima alle 20:00 e un'ora prima (orari flottanti, CRLF).
function scaricaIcs(jobId, ci, pi) {
  const j = (S.data.documenti || []).find(x => x.id === jobId), pm = j && j.analisi.circolari[ci].promemoria[pi]; if (!pm) return;
  const d8 = s2 => s2.replace(/-/g, ''), t6 = s2 => s2.replace(':', '') + '00';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const escI = s2 => String(s2 || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dashboard Docente//IT', 'BEGIN:VEVENT', 'UID:' + jobId + '-' + ci + '-' + pi + '@dashboard-docente', 'DTSTAMP:' + stamp, 'SUMMARY:' + escI(pm.titolo)];
  const alarm = (trig, testo) => L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escI(testo), 'TRIGGER:' + trig, 'END:VALARM');
  if (pm.inizio) {
    L.push('DTSTART:' + d8(pm.data) + 'T' + t6(pm.inizio), 'DTEND:' + d8(pm.data_fine || pm.data) + 'T' + t6(pm.fine || pm.inizio));
    const [h, m] = pm.inizio.split(':').map(Number), tot = h * 60 + m + 240;
    if (pm.luogo) L.push('LOCATION:' + escI(pm.luogo)); if (pm.descrizione) L.push('DESCRIPTION:' + escI(pm.descrizione));
    alarm('-PT' + Math.floor(tot / 60) + 'H' + (tot % 60 ? (tot % 60) + 'M' : ''), 'Domani ' + pm.inizio + ': ' + pm.titolo);
    alarm('-PT1H', pm.inizio + ': ' + pm.titolo);
  } else {
    const fine = new Date((pm.data_fine || pm.data) + 'T12:00:00'); fine.setDate(fine.getDate() + 1);
    L.push('DTSTART;VALUE=DATE:' + d8(pm.data), 'DTEND;VALUE=DATE:' + iso(fine).replace(/-/g, ''));
    if (pm.luogo) L.push('LOCATION:' + escI(pm.luogo)); if (pm.descrizione) L.push('DESCRIPTION:' + escI(pm.descrizione));
    alarm('-PT4H', 'Domani: ' + pm.titolo);
  }
  L.push('END:VEVENT', 'END:VCALENDAR');
  salvaFile((pm.titolo || 'evento').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 40) + '.ics', new Blob([L.join('\r\n') + '\r\n'], { type: 'text/calendar' }));
}
// Trascinamento di file ovunque nella pagina.
['dragenter', 'dragover'].forEach(ev => addEventListener(ev, e => {
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files') || !S.data) return;
  e.preventDefault(); if (!S.trascina) { S.trascina = true; const z = document.getElementById('drop'); if (z) { z.classList.add('on'); z.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
}));
addEventListener('dragleave', e => { if (e.relatedTarget === null) { S.trascina = false; const z = document.getElementById('drop'); if (z) z.classList.remove('on'); } });
addEventListener('drop', e => {
  if (!e.dataTransfer || !e.dataTransfer.files.length) return;
  e.preventDefault(); S.trascina = false; inviaDocumenti([...e.dataTransfer.files]);
});
// Mentre un invio è in analisi o in compilazione, ricarica ogni 30 secondi (per 20 minuti).
function documentiInCorso() {
  const j = S.data && Array.isArray(S.data.documenti) ? S.data.documenti : [];
  return j.some(x => x.stato === 'in_coda' || x.stato === 'produzione') && Date.now() - S.lastFetch > 30e3 && Date.now() - (S.attesaDocumenti || 0) < 20 * 60e3;
}

/* ---------- azioni ---------- */
function copia(key) {
  const text = COPIE[key] || (key.startsWith('cmd-') ? CMD[key.slice(4)] : ''); if (!text) return;
  const ok = () => { S.copied = key; render(); clearTimeout(copia._t); copia._t = setTimeout(() => { S.copied = null; render(); }, 1600); };
  const fb = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); ok(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fb); else fb();
}
function setTickets(t) { S.tickets = t; ls.set(K.ut, t); render(); }
function addTicket() {
  const tx = S.utText.trim(); if (!tx) return;
  S.utText = ''; setTickets([{ id: String(Date.now()), lab: S.utLab, text: tx, data: dmy(new Date()), stato: 'Aperta' }, ...S.tickets]);
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  if (a === 'copy') copia(el.dataset.key);
  else if (a === 'refresh') carica(true);
  else if (a === 'pagina') vaiPagina(id || '');
  else if (a === 'menu') { S.menu = !S.menu; render(); }
  else if (a === 'credito') salvaCredito();
  else if (a === 'ver-sel') { S.verSel = id; render(); if (matchMedia('(max-width:860px)').matches) { const d = document.getElementById('ver-dettaglio'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
  else if (a === 'ver-classe') { S.verClasse = id; S.verSel = ''; render(); }
  else if (a === 'ver-aggiorna') aggiornaVerifiche();
  else if (a === 'ver-corretta') {
    const v = ((S.ver.dati && S.ver.dati.verifiche) || []).find(x => x.id === S.verSel) || null, sel = document.querySelector('.ver-i.on');
    const vid = v ? v.id : sel && sel.dataset.id; if (!vid) return;
    S.verCorr = { ...S.verCorr, [vid]: el.dataset.val === '1' };
    accoda({ azione: 'verifica_corretta', id: vid, valore: el.dataset.val === '1' }, q => q.azione === 'verifica_corretta' && q.id === vid);
    render();
  }
  else if (a === 'copyfirma') copiaFirma(el);
  else if (a === 'scegli') { const f = document.getElementById('doc-file'); if (f) f.click(); }
  else if (a === 'ics') scaricaIcs(el.dataset.job, Number(el.dataset.c), Number(el.dataset.p));
  else if (a === 'scarica') scaricaDocumento(el.dataset.file);
  else if (a === 'scaricafile') { const r = FILE_REP[el.dataset.file]; if (r) salvaFile(r.nome, blobFile(r)); }
  else if (a === 'ripristina') { const r = firmaRec(((S.data.firme || {})[el.dataset.data] || {})[el.dataset.ora]); S.mod[el.dataset.key] = r.bozza || ''; ls.set(K.mod, S.mod); render(); }
  else if (a === 'fase') { S.pin = id === modelloFase() ? null : id; render(); }
  else if (a === 'pickfase') { S.pin = id === el.dataset.auto ? null : id; render(); }
  else if (a === 'unpin') { S.pin = null; render(); }
  else if (a === 'firma') {
    const v = Number(el.dataset.val); S.done = { ...S.done, [el.dataset.key]: v }; ls.set(K.done, S.done);
    if (v) S.ultimaFirmata = Date.now();
    accoda({ azione: 'firmata', data: el.dataset.data, ora: Number(el.dataset.ora), valore: !!v }, q => q.azione === 'firmata' && q.data === el.dataset.data && q.ora === Number(el.dataset.ora));
    render();
  }
  else if (a === 'letta') {
    const id = el.dataset.id; S.lette = [id, ...S.lette.filter(z => z !== id)].slice(0, 300); ls.set(K.lette, S.lette);
    accoda({ azione: 'letta', id }, q => q.azione === 'letta' && q.id === id);
    render();
  }
  else if (a === 'nascondi') {
    const id = el.dataset.id; S.nascoste = [id, ...S.nascoste.filter(z => z !== id)].slice(0, 300); ls.set(K.nascoste, S.nascoste);
    accoda({ azione: 'nascondi', id }, q => q.azione === 'nascondi' && q.id === id);
    render();
  }
  else if (a === 'ut-cycle') setTickets(S.tickets.map(t => String(t.id) === id ? { ...t, stato: STATI[(STATI.indexOf(t.stato) + 1) % 3] } : t));
  else if (a === 'ut-del') setTickets(S.tickets.filter(t => String(t.id) !== id));
  else if (a === 'ut-add') addTicket();
  else if (a === 'setup') { S.setup = true; S.setupErr = ''; render(); }
  else if (a === 'setup-annulla') { S.setup = false; render(); }
  else if (a === 'scollega') {
    if (el.dataset.conferma !== '1') { el.dataset.conferma = '1'; el.textContent = 'Conferma: scollega e cancella i dati salvati'; return; }
    [K.endpoint, K.token, K.last].forEach(ls.del);
    if (window.caches) caches.delete('data-v1');
    S.data = null; S.mock = false; S.error = null; S.setup = false; render();
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'ut-text') { e.preventDefault(); addTicket(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && (e.target.dataset.act === 'pickfase' || (e.target.dataset.act === 'pagina' && e.target.tagName === 'LI'))) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Escape' && S.menu) { S.menu = false; render(); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'note') { S.note = t.value; ls.set(K.note, t.value); }
  else if (t.id && t.id.startsWith('fx-')) { S.mod[t.id.slice(3)] = t.value; ls.set(K.mod, S.mod); }
  else if (t.id === 'ut-text') S.utText = t.value;
  else if (t.id === 'cr-usd') S.crUsd = t.value;
  else if (t.id === 'cr-data') S.crData = t.value;
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'ut-lab') S.utLab = t.value;
  else if (t.id === 'doc-file') { inviaDocumenti([...t.files]); t.value = ''; }
  else if (t.dataset && t.dataset.set === 'variante') { S.variante = t.value; ls.set(K.variante, t.value); render(); }
  else if (t.dataset && t.dataset.set === 'tema') { S.tema = t.value; ls.set(K.tema, t.value); render(); }
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'setup-form') return;
  e.preventDefault();
  const ep = e.target.ep.value.trim(), tk = e.target.tk.value.trim();
  if (LOCALE && ep === 'mock') { ls.set(K.endpoint, 'mock'); S.mock = true; S.setup = false; S.setupErr = ''; S.data = null; carica(); return; }
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(ep)) { S.setupErr = 'L\'indirizzo deve essere quello della web app: https://script.google.com/macros/s/…/exec'; render(); return; }
  if (!tk) { S.setupErr = 'Inserisci il codice di accesso.'; render(); return; }
  S.loading = true; S.setupErr = ''; render();
  try {
    const { j } = await scarica(ep + '?token=' + encodeURIComponent(tk) + '&_=' + Date.now());
    ls.set(K.endpoint, ep); ls.set(K.token, tk); ls.set(K.last, j);
    S.mock = false; S.data = j; S.offline = false; S.error = null; S.setup = false; S.lastFetch = Date.now();
  } catch (err) {
    S.setupErr = err.auth ? 'Codice di accesso non valido.' : 'Endpoint non raggiungibile: ' + (err.message || err) + '. Controlla l\'indirizzo e che la web app sia pubblicata con accesso “Chiunque”.';
  } finally { S.loading = false; render(); }
});
function modelloFase() { const n = adesso(), m = n.getHours() * 60 + n.getMinutes(); return m >= 360 && m < 840 ? 'mattina' : m >= 840 && m < 1195 ? 'pomeriggio' : 'sera'; }

/* ---------- ciclo di vita ---------- */
if (S.pagina === 'verifiche' || (collegato() && !S.ver.dati)) caricaVerifiche(); // anche per il contatore delle verifiche da correggere
setInterval(() => {
  if (S.setup || !collegato()) return;
  if (document.visibilityState === 'visible' && verificheInAttesa()) caricaVerifiche();
  if (document.visibilityState === 'visible' && (Date.now() - S.lastFetch > 15 * 60e3 || bozzaInArrivo() || reportInArrivo() || documentiInCorso())) carica(); else render();
}, 30e3);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || S.setup || !collegato()) return;
  if (Date.now() - S.lastFetch > 10 * 60e3) carica(); else render();
});

/* pull-to-refresh (iPhone/iPad in modalità app) */
(() => {
  let y0 = null, armed = false;
  addEventListener('touchstart', e => { y0 = (scrollY <= 0 && !S.setup && collegato()) ? e.touches[0].clientY : null; armed = false; }, { passive: true });
  addEventListener('touchmove', e => {
    if (y0 === null) return;
    armed = e.touches[0].clientY - y0 > 90;
    const p = document.getElementById('ptr'); if (p) p.classList.toggle('show', armed);
  }, { passive: true });
  addEventListener('touchend', () => {
    const p = document.getElementById('ptr'); if (p) p.classList.remove('show');
    if (armed && !S.loading) carica(true);
    y0 = null; armed = false;
  });
})();

if ('serviceWorker' in navigator && !S.mock) {
  // Quando una nuova versione del service worker prende il controllo, ricarica una volta per usare i file nuovi.
  const primoController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (primoController && !sessionStorage.getItem('pd_ricaricata')) { sessionStorage.setItem('pd_ricaricata', '1'); location.reload(); } });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}

if (!S.mock && collegato()) { const last = ls.json(K.last, null); if (valido(last)) { S.data = last; S.offline = false; } }
render();
carica();
