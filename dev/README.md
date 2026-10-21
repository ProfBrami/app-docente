# Sviluppo locale

Questa cartella non va su GitHub (vedi `.gitignore`): i JSON qui dentro contengono dati reali.

1. Copia `dati/esempio-21-10-2026.json` del pacchetto di handoff in `dev/`.
2. `python3 -m http.server 8000` dalla radice del repo.
3. Apri `http://localhost:8000/?mock=1`, oppure scrivi `mock` come endpoint nella schermata di primo avvio.

Parametri utili (anche in produzione mostrano il tag "Ora simulata"):
- `?ora=11:06` e `?data=2026-10-20` simulano l'ora e il giorno;
- `?mock=nomefile` carica `dev/nomefile.json` (solo su localhost).
