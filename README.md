# App Docente

PWA statica (HTML/CSS/JS, nessuna build) della **Dashboard Docente**: si installa nel Dock del Mac e sulla Home di iPhone/iPad e, all'apertura, si aggiorna dal JSON prodotto da un Google Apps Script personale.

Il repo **non contiene dati personali**: l'indirizzo dell'endpoint e il codice di accesso si inseriscono al primo avvio e restano nel `localStorage` del dispositivo.

| File | Ruolo |
|---|---|
| `index.html`, `app.js`, `app.css` | app (render, logica oraria, stati vuoti) |
| `industry-styles.css` | design system Industry, invariato |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA: cache offline, installazione, icone |
| `apps-script/` | backend Google Apps Script (`Code.gs`, `appsscript.json`) |
| `dashboard.schema.json` | contratto JSON backend → app |
| `dev/` | mock locale, escluso da git (vedi `dev/README.md`) |

## Comportamento
- Fasi: Mattina 06:00–13:55, Pomeriggio 14:00–19:54, Sera dalle 19:55. L'ordine delle sezioni cambia con la fase; la si può fissare a mano.
- Testata: "Aggiornato alle HH:MM" e stato per fonte (Gmail, Classroom, Calendar, ClasseViva). Se l'endpoint non risponde: ultimo snapshot in cache con l'avviso "Dati del … — offline".
- ⟳ (o trascinare verso il basso su iPhone/iPad) chiede `&refresh=1`: lo snapshot viene ricostruito, servono 5–15 s.
- Al ritorno in primo piano ricarica se l'ultimo fetch ha più di 10 minuti.
- **Mai dati di esempio**: se una fonte non risponde, la sezione mostra "Nessun dato da …".
- Restano locali sul dispositivo: firme fatte, segnalazioni Ufficio Tecnico, note, vista, tema.

## Aggiornare l'app pubblicata
Modifica, poi incrementa `VERSION` in `sw.js` e fai push: i dispositivi prendono la nuova versione alla seconda apertura.
