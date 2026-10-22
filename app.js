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
  circolari: 'Controlla le nuove circolari in posta/ClasseViva e gestiscile con la skill gestione-circolari-ciusa.',
  supplenze: 'Controlla le variazioni d\'orario: ci sono supplenze a mio nome? (skill gestione-circolari-ciusa)'
};
const FASI = [
  {id:'mattina',nome:'Mattina',range:'06:00 – 13:55',desc:'Orario e lezioni'},
  {id:'pomeriggio',nome:'Pomeriggio',range:'14:00 – 19:54',desc:'Firme registro'},
  {id:'sera',nome:'Sera',range:'dalle 19:55',desc:'Report lezioni di domani'}
];
const ORDINI = {
  mattina:['orario','firme','circolari','scadenze','supplenze','classi','report','ricond','orient','ut','note'],
  pomeriggio:['firme','circolari','scadenze','orario','supplenze','report','classi','ricond','orient','ut','note'],
  sera:['report','orario','circolari','scadenze','supplenze','firme','classi','ricond','orient','ut','note']
};
const NUM = {orario:'01',firme:'02',report:'03',circolari:'04',scadenze:'05',supplenze:'06',classi:'07',ricond:'08',orient:'09',ut:'10',note:'11'};
const FONTI = [['gmail','Gmail'],['classroom','Classroom'],['calendar','Calendar'],['classeviva','ClasseViva']];
const STATI = ['Aperta','In corso','Chiusa'];
const LABS = ['Arrakis','Matrix','Lab. 21','Neo Tokio','Skynet','Altro'];
const MOCK_NOME = new URLSearchParams(location.search).get('mock') || '';
const MOCK_URL = './dev/' + (/^[a-z_][\w-]*$/i.test(MOCK_NOME) ? MOCK_NOME : 'esempio-21-10-2026') + '.json';
const LOCALE = ['localhost','127.0.0.1'].includes(location.hostname);
// "Apri in Claude" apre l'app, non il browser: sul Mac lo schema claude:// dell'app desktop,
// su iPhone/iPad claude.ai/new, che è un link universale dell'app Claude per iOS.
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MAC = !IOS && /Macintosh/.test(navigator.userAgent);
const claudeLink = t => `href="${(MAC ? 'claude://claude.ai/new?q=' : 'https://claude.ai/new?q=') + encodeURIComponent(t)}"${MAC ? '' : ' target="_blank" rel="noopener"'}`;
const K = {endpoint:'pd_endpoint',token:'pd_token',last:'pd_last',ut:'pd_ut',note:'pd_note',done:'pd_firme_done',variante:'pd_variante',tema:'pd_tema'};

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
  done: ls.json(K.done, {}), tickets: ls.json(K.ut, []), note: ls.get(K.note, ''),
  utLab: LABS[0], utText: '',
  variante: ls.get(K.variante, 'A'), tema: ls.get(K.tema, 'auto')
};
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
    if (!daCache && !S.mock) ls.set(K.last, j);
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
  const root = document.getElementById('app');
  document.documentElement.dataset.theme = S.tema;
  const act = document.activeElement, focusId = act && act.id, sel = act && 'selectionStart' in act ? [act.selectionStart, act.selectionEnd] : null, top = act ? act.scrollTop : 0;

  if (!collegato() || S.setup) root.innerHTML = renderSetup();
  else if (!S.data) root.innerHTML = renderAttesa();
  else root.innerHTML = renderDashboard();

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

function renderDashboard() {
  COPIE = {};
  const d = S.data, now = adesso(), M = modello(d);
  const mins = now.getHours() * 60 + now.getMinutes();
  const today = new Date(now); today.setHours(12, 0, 0, 0);
  const todayL = M.lessons(today), todayB = M.blocks(today);
  const autoFase = mins >= 360 && mins < 840 ? 'mattina' : mins >= 840 && mins < 1195 ? 'pomeriggio' : 'sera';
  const fase = S.pin || autoFase;
  const c = { o: {}, g: {}, fb: {}, k: {} };
  ORDINI[fase].forEach((id, i) => { c.o[id] = i; c.g[id] = i === 0 ? '1 / -1' : 'auto'; c.fb[id] = i === 0 ? 'var(--color-accent)' : 'var(--color-divider)'; c.k[id] = i === 0 ? 'In evidenza ora · ' + NUM[id] : NUM[id]; });
  const nextDay = M.nextSchool(today), ndL = M.lessons(nextDay), ndLabel = GG[nextDay.getDay()] + ' ' + dmy(nextDay);
  const crOk = fonte('classroom').ok;
  const agg = d.meta.aggiornato ? new Date(d.meta.aggiornato) : null;
  const aggTxt = agg && !isNaN(agg) ? dmy(agg) + ' ' + hm(agg) : 'data sconosciuta';
  const ctx = { d, now, M, mins, today, todayL, todayB, autoFase, fase, nextDay, ndL, ndLabel, crOk, agg, aggTxt };

  /* barra Adesso */
  let A = { k: 'Adesso', t: '', s: '', bg: 'transparent', fg: 'var(--color-text)', bd: 'var(--color-divider)' };
  const cur = todayL.find(l => mins >= tm(l.s) && mins < tm(l.e)), nxt = todayL.find(l => tm(l.s) > mins);
  if (!M.has) {
    A = { ...A, k: FASI.find(f => f.id === autoFase).nome, t: 'Orario non disponibile', s: 'Nessun dato da orario.json: lo produce la skill orario-docente-promemoria nella cartella Drive “Dashboard Docente/dati”.' };
  } else if (cur) {
    const left = tm(cur.e) - mins, after = todayL.find(l => l.n === cur.n + 1);
    if (left <= 5) A = { ...A, k: 'Firma ora', t: 'Fine ' + cur.n + 'ª ora tra ' + left + ' min: firma ' + cur.cls + ' su Classeviva', s: after ? 'Poi ' + after.n + 'ª ora · ' + after.cls + (after.lab ? ' · ' + after.lab : '') : 'Ultima ora della giornata', bg: 'var(--color-accent)', fg: 'var(--color-bg)', bd: 'var(--color-accent)' };
    else A = { ...A, k: 'In corso', t: cur.n + 'ª ora · ' + cur.cls + (cur.lab ? ' · ' + cur.lab : ''), s: 'Termina alle ' + cur.e + ' · ' + (after ? 'poi ' + after.cls + (after.lab ? ' in ' + after.lab : '') : 'ultima ora') };
  } else if (nxt) {
    A = { ...A, k: 'Prossima', t: nxt.n + 'ª ora alle ' + nxt.s + ' · ' + nxt.cls + (nxt.lab ? ' · ' + nxt.lab : ''), s: mins < tm(todayL[0].s) ? 'Avviso consigliato: 30 min prima' : 'Intervallo in corso' };
  } else if (!todayL.length) {
    A = { ...A, k: 'Giorno libero', t: 'Nessuna lezione oggi', s: 'Prossime lezioni: ' + ndLabel + ' · ' + ndL.map(l => l.cls).join(', ') };
  } else if (mins < 1195) {
    const left = todayB.filter(b => !S.done[iso(today) + '-' + b.first]).length;
    A = { ...A, k: mins < 840 ? 'Lezioni concluse' : 'Pomeriggio', t: left ? left + ' firme da apporre sul registro' : 'Tutte le firme di oggi sono apposte', s: 'Report di ' + ndLabel + ' dalle 19:55' };
  } else {
    A = { ...A, k: 'Sera', t: 'Report lezioni di ' + ndLabel + (crOk ? '' : ': dati Classroom non aggiornati'), s: ndL.map(l => l.n + 'ª ' + l.cls).join(' · ') };
  }

  const isB = S.variante === 'B';
  const fasi = isB ? '' : `<nav class="fasi" aria-label="Fase della giornata">${FASI.map(f => `<button class="fase${f.id === fase ? ' on' : ''}" data-act="fase" data-id="${f.id}" aria-pressed="${f.id === fase}"><span class="fase-r">${f.range}</span><span class="fase-n">${f.nome}</span><span class="fase-d">${f.desc}</span></button>`).join('')}</nav>`;
  const pinned = S.pin ? `<div class="pinned"><span>Vista fissata manualmente: ${esc(FASI.find(f => f.id === S.pin).nome)}.</span><button class="btn btn-ghost" data-act="unpin">Torna automatica</button></div>` : '';

  const avvisi = [];
  if (S.offline) avvisi.push(alertBox(`<strong>Offline.</strong> Mostro gli ultimi dati salvati (${esc(S.cachedAt ? dmy(new Date(S.cachedAt)) + ' ' + hm(new Date(S.cachedAt)) : 'data sconosciuta')}). ${esc(S.error || '')}`));
  else if (S.error) avvisi.push(alertBox(`<strong>Aggiornamento non riuscito.</strong> ${esc(S.error)} <button class="btn btn-ghost" data-act="setup">Modifica collegamento</button>`));

  return `<div class="wrap">
    ${renderTop(now)}
    ${avvisi.join('')}
    <div class="blueprint now" style="background:${A.bg};color:${A.fg};border-color:${A.bd}">${CORNERS}
      <span class="now-k">${esc(A.k)}</span><span class="now-t">${esc(A.t)}</span><span class="now-s">${esc(A.s)}</span>
    </div>
    ${fasi}${pinned}
    <div class="body">
      ${isB ? renderTimeline(ctx) : ''}
      <main class="grid">
        ${secOrario(ctx, c)}${secFirme(ctx, c)}${secReport(ctx, c)}${secCircolari(ctx, c)}${secScadenze(ctx, c)}
        ${secSupplenze(ctx, c)}${secClassi(ctx, c)}${secRicond(ctx, c)}${secOrient(ctx, c)}${secUT(ctx, c)}${secNote(ctx, c)}
      </main>
    </div>
    ${renderFoot()}
  </div><div class="ptr tag tag-accent" id="ptr" aria-hidden="true">Rilascia per aggiornare</div>`;
}

function renderTimeline(x) {
  const { mins, todayL, todayB, autoFase, ndLabel, ndL, M, today } = x;
  const tl = todayL.map(l => { const st = mins >= tm(l.e) ? 'done' : mins >= tm(l.s) ? 'now' : 'next'; return { time: l.s, label: l.n + 'ª ora · ' + l.cls, sub: (l.lab ? l.lab + ' · ' : '') + 'firma alle ' + l.e + ' · bozza alle ' + hhmm(tm(l.e) + PRONTA), st }; });
  tl.push({ time: '14:00', label: 'Firme registro', sub: !M.has ? 'Orario non disponibile' : todayB.length ? todayB.filter(b => !S.done[iso(today) + '-' + b.first]).length + ' firme da apporre · bozze 5 min dopo ogni ora' : 'Nessuna lezione oggi', st: mins >= 1195 ? 'done' : mins >= 840 ? 'now' : 'next', pick: 'pomeriggio' });
  tl.push({ time: '19:55', label: 'Report lezioni', sub: 'Per ' + ndLabel, st: mins >= 1195 ? 'now' : 'next', pick: 'sera' });
  const li = tl.map(t => {
    const dot = t.st === 'now' ? 'var(--color-accent)' : t.st === 'done' ? 'color-mix(in srgb,var(--color-accent) 35%,transparent)' : 'transparent';
    const attrs = t.pick ? ` class="click" data-act="pickfase" data-id="${t.pick}" data-auto="${autoFase}" role="button" tabindex="0"` : '';
    return `<li${attrs} style="opacity:${t.st === 'done' ? 0.5 : 1}"><span class="tl-time">${t.time}</span><span class="tl-dot" style="background:${dot}"></span><span class="col" style="min-width:0"><span class="tl-l">${esc(t.label)}</span><span class="small m62">${esc(t.sub)}</span></span></li>`;
  }).join('');
  return `<aside class="blueprint side">${CORNERS}
    <div class="col" style="gap:2px"><span class="kicker">Giornata</span><h3 style="margin:0;font-size:24px">${GG[today.getDay()]} ${dmy(today)}</h3></div>
    ${M.has ? '' : empty('Nessun dato da orario.json', 'Le ore di lezione compariranno quando l\'orario è su Drive.')}
    <ol class="plain tl">${li}</ol>
    <div class="side-next"><span class="kicker">Prossimo giorno di scuola</span><span class="hd" style="font-size:18px">${esc(ndLabel)}</span><span style="font-size:13px">${esc(ndL.map(l => l.n + 'ª ' + l.cls + (l.lab ? ' · ' + l.lab : '')).join('  ·  '))}</span></div>
  </aside>`;
}

function secOrario(x, c) {
  const { M, mins, today, todayL, ndLabel } = x;
  if (!M.has) return sec('orario', c, head('orario', c, 'Orario · prossimi giorni') + empty('Nessun dato da orario.json', 'Esegui la skill orario-docente-promemoria: salva orario.json nella cartella Drive “Dashboard Docente/dati”.') + cmdFooter('orario', false));
  const cols = `grid-template-columns:72px repeat(${M.ore.length},minmax(52px,1fr))`;
  let html = `<div class="og" style="${cols}"><span></span>${M.ore.map(h => `<span class="og-h"><b>${h.n}ª</b><span class="m60">${h.s}–${h.e}</span></span>`).join('')}</div>`;
  let rows = 0;
  for (let i = 0; rows < 6 && i < 8; i++) {
    const d = addDays(today, i); if (d.getDay() === 0) continue; rows++;
    const ls_ = M.lessons(d), byN = {}; ls_.forEach(l => { byN[l.n] = l; });
    const label = i === 0 ? 'Oggi' : i === 1 ? 'Domani' : G3[d.getDay()] + ' ' + d.getDate();
    const cells = !ls_.length ? '<span class="og-free m60">Giorno libero</span>' : M.ore.map(h => {
      const l = byN[h.n], isNow = i === 0 && l && mins >= tm(h.s) && mins < tm(h.e), past = i === 0 && mins >= tm(h.e);
      const bd = l ? (isNow ? 'var(--color-accent)' : 'var(--color-divider)') : 'transparent';
      const bg = isNow ? 'var(--color-accent)' : l ? 'transparent' : 'color-mix(in srgb,var(--color-text) 3%,transparent)';
      const fg = isNow ? 'var(--color-bg)' : l ? 'var(--color-text)' : 'color-mix(in srgb,var(--color-text) 35%,transparent)';
      return `<span class="og-c" style="border-color:${bd};background:${bg};color:${fg};opacity:${past ? 0.45 : 1}"><b>${esc(l ? l.cls : '·')}</b><span>${esc(l ? l.lab : '')}</span></span>`;
    }).join('');
    html += `<div class="og" style="${cols}"><span class="og-d"><b style="color:${i === 0 ? 'var(--color-accent-700)' : 'var(--color-text)'}">${label}</b><span class="m60">${G3[d.getDay()]} ${dmy(d)}</span></span>${cells}</div>`;
  }
  const pend = todayL.filter(l => tm(l.e) > mins);
  const prom = pend.length ? pend.map(l => l.e + ' firma ' + l.cls).join(' · ') + '  (avviso 5 min prima della fine dell\'ora)'
    : todayL.length ? 'Lezioni di oggi concluse: le firme sono nella sezione 02.' : 'Oggi nessuna ora da firmare. Prossimo giorno: ' + ndLabel + '.';
  const tag = M.vigore ? `<span class="tag tag-accent">In vigore dal ${esc(M.vigore)}</span>` : '';
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
    const key = iso(today) + '-' + b.first, done = !!S.done[key]; if (done) nDone++;
    const text = testi[String(b.first)] || '';
    const avail = mins >= pronta(b), show = avail && !!text;
    if (show) COPIE['f-' + key] = text;
    const ph = !avail ? 'In attesa: la bozza compare alle ' + hhmm(pronta(b)) + ', 5 minuti dopo la fine dell\'ora.' : 'Bozza non ancora generata: usa il comando qui sotto.';
    return `<article class="art" style="opacity:${done ? 0.55 : 1}">
      <div class="art-h"><span class="art-t">${esc(b.cls)} <small>· ${oreLabel(b)}</small></span><span class="m65" style="font-size:11px">Num ore ${b.num}${crOk ? '' : ' · da verificare'}</span></div>
      ${show ? `<p class="firma">${esc(text)}</p>` : `<p class="empty" style="display:block">${ph}</p>`}
      <div class="row">${show ? `<button class="btn btn-secondary" data-act="copy" data-key="f-${key}">${S.copied === 'f-' + key ? 'Copiato' : 'Copia testo'}</button>` : ''}
        <button class="btn btn-ghost" data-act="firma" data-key="${key}">${done ? 'Firmata ✓ (annulla)' : 'Segna come firmata'}</button></div>
    </article>`;
  }).join('');
  const prossima = todayB.find(b => mins < pronta(b));
  const status = !todayB.length ? 'Nessuna lezione' : !todayB.some(b => mins >= pronta(b)) ? 'Dalle ' + hhmm(pronta(todayB[0])) : nDone + ' / ' + todayB.length + ' firmate';
  let inner = head('firme', c, esc(titolo), `<span class="tag tag-accent">${status}</span>`);
  if (prossima) inner += alertBox(`<strong>Prossima bozza alle ${hhmm(pronta(prossima))}</strong> (${esc(prossima.cls)} · ${oreLabel(prossima)}): ogni firma compare 5 minuti dopo la fine dell'ora. Mancano ${durata(pronta(prossima) - mins)}.`);
  if (!crOk && todayB.length) inner += alertBox(`<strong>Classroom non raggiungibile.</strong> ${esc(fonte('classroom').errore || '')} Le bozze vanno verificate su Classroom prima di firmare.`);
  if (!todayB.length) inner += '<p style="margin:0;font-size:14px">Nessuna lezione oggi: niente da firmare.</p>';
  inner += `<div class="cards">${items}</div>` + cmdFooter('firme', true);
  return sec('firme', c, inner);
}

function secReport(x, c) {
  const { M, mins, today, todayL, nextDay, crOk, d, aggTxt } = x;
  let target = nextDay, avail = mins >= 1195;
  if (mins < 480 && todayL.length) { target = today; avail = true; }
  const titolo = 'Report lezioni · ' + GG[target.getDay()] + ' ' + dmy(target);
  if (!M.has) return sec('report', c, head('report', c, esc(titolo)) + empty('Nessun dato da orario.json', 'Il report parte dalle classi e dai laboratori dell\'orario.') + cmdFooter('report', true));
  const classi = d.classi || {};
  let tutte = true;
  const cards = M.blocks(target).map(b => {
    const k = classi[b.cls]; const full = avail && !!k; if (!k) tutte = false;
    const lab = [b.lab, k && k.co].filter(Boolean).join(' · ');
    let body = '';
    if (full) {
      const rows = [['Argomento', [k.lang, k.arg].filter(Boolean).join(' · ')], ['Ultimo', k.ultimo], ['Prossimo', k.prossimo], ['Perché', k.motivo]].filter(r => r[1]);
      body += rows.length ? `<dl class="dl">${rows.map(r => `<dt>${r[0]}</dt><dd${r[0] === 'Prossimo' ? ' style="font-weight:500"' : ''}>${esc(r[1])}</dd>`).join('')}</dl>` : '';
      if (k.avviso) body += `<span class="avviso">Avviso: ${esc(k.avviso)}</span>`;
      if (k.testo) { const key = 't-' + b.cls + b.first; COPIE[key] = k.testo; body += `<div class="testo"><span class="kicker">Testo da pubblicare</span><span style="font-size:13px;text-wrap:pretty">${esc(k.testo)}</span><button class="btn btn-secondary" style="align-self:flex-start" data-act="copy" data-key="${key}">${S.copied === key ? 'Copiato' : 'Copia testo'}</button></div>`; }
      if (Array.isArray(k.files) && k.files.length) body += `<div class="row" style="gap:6px">${k.files.map(f => `<span class="tag tag-outline" style="gap:6px"><span class="mono">${esc(f.n)}</span> · ${esc(f.o)}</span>`).join('')}</div>`;
    } else {
      const lim = !avail ? 'Argomento e prossimo passo compariranno con il report delle 19:55.' : 'Nessun dato da Classroom o classi.json per la ' + b.cls + '.';
      body = `<span class="m62" style="font-size:13px">${esc(lim)}</span>`;
    }
    return `<article class="art r"><div class="art-h"><span class="art-t">${oreLabel(b)} · ${esc(b.cls)}</span><span class="m65 small">${esc(lab)}</span></div>${body}</article>`;
  });
  const status = !avail ? 'Dalle 19:55' : !cards.length ? 'Nessuna lezione' : tutte && crOk ? 'COMPLETO · ' + aggTxt : 'Non aggiornato';
  let inner = head('report', c, esc(titolo), `<span class="tag tag-accent">${status}</span>`);
  if (!avail) inner += alertBox(`<strong>Non è ancora l'ora.</strong> Il report serale parte alle 19:55 e si ripete ogni ora finché non è completo. Mancano ${durata(Math.max(0, 1195 - mins))}. Sotto: solo classi e laboratori dall'orario.`);
  if (avail && !crOk) inner += alertBox(`<strong>Classroom non raggiungibile: dati di Classroom non aggiornati.</strong> ${esc(fonte('classroom').errore || '')}`);
  inner += cards.length ? `<div class="cards r">${cards.join('')}</div>` : '<p style="margin:0;font-size:14px">Nessuna lezione in programma.</p>';
  return sec('report', c, inner + cmdFooter('report', true));
}

function secCircolari(x, c) {
  const { d, aggTxt } = x, g = fonte('gmail');
  const items = Array.isArray(d.circolari) ? d.circolari : [];
  const nNew = items.filter(i => i.nuova).length;
  const tagCls = r => (r === 'Informativa' || r === 'Completato') ? 'tag-neutral' : (r === 'Adempimento' || r === 'Da aprire') ? 'tag-outline' : 'tag-accent';
  let inner = head('circolari', c, 'Circolari', `<span class="tag tag-accent">${items.length ? (nNew ? nNew + ' nuove' : 'Nessuna nuova') : '—'}</span>`);
  inner += `<span class="small m62">Fonte: posta Gmail e notifiche ClasseViva · aggiornato ${esc(aggTxt)}</span>`;
  if (!items.length) inner += g.ok ? empty('Nessuna circolare negli ultimi 30 giorni', 'Le notifiche di ClasseViva, SIF2127, FEA, Cineca e Segreteria compariranno qui.') : empty('Nessun dato da Gmail', g.errore || 'Controlla il backend Apps Script.');
  else inner += `<ul class="plain">${items.map(i => {
    const u = safeUrl(i.url), t = esc(i.titolo);
    return `<li class="li circ"><div class="circ-h">${u ? `<a class="circ-t" href="${u}" target="_blank" rel="noopener">${i.nuova ? '<span class="dot-new" title="Non letta"></span>' : ''}${t}</a>` : `<span class="circ-t">${i.nuova ? '<span class="dot-new" title="Non letta"></span>' : ''}${t}</span>`}<span class="tag ${tagCls(i.rig)}">${esc(i.rig)}</span></div><span class="circ-n m70">${esc(i.nota)}</span></li>`;
  }).join('')}</ul>`;
  return sec('circolari', c, inner + cmdFooter('circolari', true, true), 12);
}

function secScadenze(x, c) {
  const { d, today } = x;
  const t0 = new Date(iso(today) + 'T12:00:00');
  const list = (Array.isArray(d.scadenze) ? d.scadenze : []).map(s => {
    if (!s.d) return { ...s, n: 99, dd: '—', count: 'senza data', col: 'var(--color-accent-700)', w: 500 };
    const dt = new Date(s.d + 'T12:00:00'); if (isNaN(dt)) return null;
    const n = Math.round((dt - t0) / 864e5);
    return { ...s, n, dd: dmy(dt), count: n < 0 ? 'scaduta' : n === 0 ? 'oggi' : n === 1 ? 'domani' : 'tra ' + n + ' gg', col: n <= 1 ? 'var(--color-accent-700)' : 'color-mix(in srgb,var(--color-text) 60%,transparent)', w: n <= 2 ? 700 : 400 };
  }).filter(s => s && s.n >= -1).sort((a, b) => a.n - b.n);
  let inner = `<header class="sec-h"><div><span class="kicker">${esc(c.k.scadenze)}</span><h3>Scadenze e adempimenti</h3></div></header>`;
  const gm = fonte('gmail'), ca = fonte('calendar');
  if (!list.length) inner += (gm.ok || ca.ok) ? empty('Nessuna scadenza in vista', 'Da posta e Calendar non risultano adempimenti nei prossimi giorni.') : empty('Nessun dato da Gmail e Calendar', [gm.errore, ca.errore].filter(Boolean).join(' · '));
  else inner += `<ul class="plain">${list.map(s => `<li class="li sc"><span class="col" style="align-items:flex-start"><span class="sc-dd">${s.dd}</span><span style="font-size:11px;color:${s.col};font-weight:${s.w}">${s.count}</span></span><span class="col" style="gap:2px;min-width:0"><span style="font-weight:500;text-wrap:pretty">${esc(s.t)}</span><span class="small m62">${esc(s.src)}</span></span></li>`).join('')}</ul>`;
  return sec('scadenze', c, inner, 12);
}

function secSupplenze(x, c) {
  const { d, nextDay } = x, s = d.supplenze, g = fonte('gmail');
  let inner = head('supplenze', c, 'Supplenze e variazioni', `<span class="tag tag-neutral">Variazioni per ${G3[nextDay.getDay()]} ${dmy(nextDay)}</span>`);
  if (!s) inner += g.ok ? empty('Nessuna variazione d\'orario in posta', 'Le notifiche “Variazioni orario” di ClasseViva compariranno qui.') : empty('Nessun dato da Gmail', g.errore || '');
  else {
    const titolo = s.titolo || (s.stato === 'nessuna' ? 'Nessuna supplenza a tuo nome.' : '');
    if (titolo) inner += `<p class="hd" style="margin:0;font-size:20px;line-height:1.2">${esc(titolo)}</p>`;
    if (s.nota) inner += `<p class="m70" style="margin:0;font-size:13px;text-wrap:pretty">${esc(s.nota)}</p>`;
    if (Array.isArray(s.ore) && s.ore.length) inner += `<ul class="plain">${s.ore.map(o => `<li class="li sc"><span class="sc-dd" style="font-size:18px">${esc(o.ora)}ª</span><span class="col"><span style="font-weight:500">${esc(o.classe)}${o.aula ? ' · ' + esc(o.aula) : ''}</span><span class="small m62">${esc(o.data)}</span></span></li>`).join('')}</ul>`;
  }
  return sec('supplenze', c, inner + cmdFooter('supplenze', false, true), 12);
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
  return `<footer class="foot">
    <div class="foot-g"><span class="kicker">Vista</span>${seg('variante', S.variante, [['A', 'A · Plancia'], ['B', 'B · Giornata']])}</div>
    <div class="foot-g"><span class="kicker">Tema</span>${seg('tema', S.tema, [['auto', 'Automatico'], ['light', 'Chiaro'], ['dark', 'Scuro']])}</div>
    <div class="foot-g" style="flex:1 1 260px"><span class="kicker">Stato fonti</span><ul class="plain fonti">${fonti.map(([k, f]) => `<li><span class="tag ${f.ok ? 'tag-accent' : 'tag-outline'}">${esc(k)}</span><span class="m65">${f.ok ? esc(f.letti || 0) + ' elementi letti' : esc(f.errore || 'non raggiungibile')}</span></li>`).join('') || '<li class="m65">—</li>'}</ul></div>
    <div class="foot-g"><span class="kicker">Collegamento</span><div class="row"><button class="btn btn-ghost" data-act="setup">Modifica collegamento</button><button class="btn btn-ghost" data-act="scollega">Scollega</button></div></div>
  </footer>`;
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
  else if (a === 'fase') { S.pin = id === modelloFase() ? null : id; render(); }
  else if (a === 'pickfase') { S.pin = id === el.dataset.auto ? null : id; render(); }
  else if (a === 'unpin') { S.pin = null; render(); }
  else if (a === 'firma') { const d = { ...S.done }; if (d[el.dataset.key]) delete d[el.dataset.key]; else d[el.dataset.key] = 1; S.done = d; ls.set(K.done, d); render(); }
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
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.act === 'pickfase') { e.preventDefault(); e.target.click(); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'note') { S.note = t.value; ls.set(K.note, t.value); }
  else if (t.id === 'ut-text') S.utText = t.value;
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'ut-lab') S.utLab = t.value;
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
setInterval(() => {
  if (S.setup || !collegato()) return;
  if (document.visibilityState === 'visible' && Date.now() - S.lastFetch > 15 * 60e3) carica(); else render();
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

if ('serviceWorker' in navigator && !S.mock) navigator.serviceWorker.register('./sw.js').catch(() => {});

if (!S.mock && collegato()) { const last = ls.json(K.last, null); if (valido(last)) { S.data = last; S.offline = false; } }
render();
carica();
