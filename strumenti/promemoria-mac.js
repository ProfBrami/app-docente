// Crea in Promemoria di Apple (elenco «Scuola») i promemoria ricevuti dal backend. Lo avvia promemoria-mac.sh:
//   osascript -l JavaScript promemoria-mac.js <file JSON con { promemoria: [{ id, titolo, scadenza, note }] }>
// Stampa l'elenco JSON degli id presenti in Promemoria (creati ora o già esistenti), da confermare al backend.
// Scadenza: il giorno indicato, con avviso la sera prima alle 18:00 (o la mattina stessa alle 8:00 se la vigilia è passata).
ObjC.import('Foundation');
function run(argv) {
  const testo = $.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null);
  if (!testo || !testo.js) throw new Error('file dei promemoria illeggibile');
  let j; try { j = JSON.parse(testo.js); } catch (e) { throw new Error('il backend non ha risposto con dati validi'); }
  if (j.errore) throw new Error('backend: ' + j.errore);
  if (!Array.isArray(j.promemoria)) throw new Error('il backend non conosce ancora i promemoria (va ridistribuito Code.gs)');
  if (!j.promemoria.length) return '[]';
  const R = Application('Reminders');
  let lista = R.lists.whose({ name: 'Scuola' })();
  if (lista.length) lista = lista[0]; else { R.lists.push(R.List({ name: 'Scuola' })); lista = R.lists.whose({ name: 'Scuola' })()[0]; }
  const fatti = [], adesso = new Date();
  j.promemoria.forEach(p => {
    const nome = String(p.titolo || '').trim(); if (!nome || !/^doc-[\w-]+$/.test(String(p.id))) return;
    try {
      if (!lista.reminders.whose({ name: nome, completed: false })().length) {
        const prop = { name: nome, body: String(p.note || '') };
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.scadenza || '');
        let avviso = null;
        if (m) {
          const g = new Date(+m[1], +m[2] - 1, +m[3]);
          prop.alldayDueDate = g;
          const vigilia = new Date(+m[1], +m[2] - 1, +m[3] - 1, 18, 0), mattina = new Date(+m[1], +m[2] - 1, +m[3], 8, 0);
          avviso = vigilia > adesso ? vigilia : mattina > adesso ? mattina : null;
        }
        const r = R.Reminder(prop); lista.reminders.push(r);
        if (avviso) try { r.remindMeDate = avviso; } catch (e) {} // senza avviso resta comunque la scadenza
      }
      fatti.push(String(p.id));
    } catch (e) { console.log('non creato «' + nome + '»: ' + e.message); }
  });
  return JSON.stringify(fatti);
}
