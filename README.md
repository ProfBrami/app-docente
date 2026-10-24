# App Docente

PWA statica (HTML/CSS/JS, nessuna build) della **Dashboard Docente**: si installa nel Dock del Mac e sulla Home di iPhone/iPad e, all'apertura, si aggiorna dal JSON prodotto da un Google Apps Script personale.

Il repo **non contiene dati personali**: l'indirizzo dell'endpoint e il codice di accesso si inseriscono al primo avvio e restano nel `localStorage` del dispositivo.

| File | Ruolo |
|---|---|
| `index.html`, `app.js`, `app.css` | app (render, logica oraria, stati vuoti) |
| `industry-styles.css` | design system Industry, invariato |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA: cache offline, installazione, icone |
| `apps-script/` | backend Google Apps Script sull'account personale (`Code.gs`, `appsscript.json`): posta, calendario, Drive, firme |
| `apps-script-scuola/` | script sull'account della scuola (`Classroom.gs`): legge gli stream Classroom e li invia al backend |
| `dashboard.schema.json` | contratto JSON backend → app |
| `dev/` | mock locale, escluso da git (vedi `dev/README.md`) |

## Comportamento
- Fasi: Mattina 06:00–13:55, Pomeriggio 14:00–19:54, Sera dalle 19:55. L'ordine delle sezioni cambia con la fase; la si può fissare a mano.
- Testata: "Aggiornato alle HH:MM" e stato per fonte (Gmail, Classroom, Calendar, ClasseViva). Se l'endpoint non risponde: ultimo snapshot in cache con l'avviso "Dati del … — offline".
- ⟳ (o trascinare verso il basso su iPhone/iPad) chiede `&refresh=1`: lo snapshot viene ricostruito, servono 5–15 s.
- Al ritorno in primo piano ricarica se l'ultimo fetch ha più di 10 minuti.
- **Mai dati di esempio**: se una fonte non risponde, la sezione mostra "Nessun dato da …".
- Firme: 5 minuti dopo ogni ora (o blocco di ore consecutive) lo script della scuola invia al backend i contenuti Classroom nuovi; il backend genera la bozza con Claude (`claude-opus-5-5`). Nell'app la bozza è modificabile; "Copia firma" la copia negli appunti e la salva sul backend, nello storico della classe usato per le bozze successive.
- Report lezioni: impaginato come l'artefatto «Report lezioni» (barra di stato, premessa con campanelle, una scheda per classe con argomento, ultima cosa, prossimo passo, avviso e testo da pubblicare). I file (soluzioni scritte da Claude, schemi SVG, file già presenti su Classroom) hanno anteprima, Copia, Scarica e si trascinano: in Chrome il file viene salvato dove lo si rilascia (Finder, cartella Drive); in Safari e su iPhone/iPad si usa Scarica. Il docente in compresenza viene da `orario.compresenza` (facoltativo).
- Circolari di ClasseViva: su iPhone/iPad il clic esegue il Comando rapido «Apri ClasseViva» (azione Apri app › ClasseViva Docenti), da creare una volta per dispositivo; sul Mac apre la bacheca web.
- Circolari: le notifiche in posta compaiono senza le variazioni d'orario e senza le firme già apposte. I PDF scaricati dalla bacheca (circolari, variazioni, moduli) si trascinano nella sezione Circolari: il backend li analizza con le regole della skill gestione-circolari-ciusa, mette le supplenze nell'orario, le scadenze in Scadenze, offre i promemoria .ics e compila i moduli richiesti (Agent Skills docx/xlsx/pdf), scaricabili dall'app.
- Restano locali sul dispositivo: firme fatte, segnalazioni Ufficio Tecnico, note, vista, tema.

## Aggiornare l'app pubblicata
Modifica, poi incrementa `VERSION` in `sw.js` e fai push: i dispositivi prendono la nuova versione alla seconda apertura.
