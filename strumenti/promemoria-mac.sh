#!/bin/zsh
# Promemoria di Apple dalle circolari trascinate nell'app Progetto Docente.
# Una volta al giorno ritira dal backend le cose da fare con scadenza e le crea in Promemoria (elenco «Scuola»);
# iCloud le porta su iPhone e iPad. launchd lo avvia all'accensione e poi ogni 30 minuti: dopo il primo giro
# riuscito della giornata esce subito, quindi se il Mac era spento il giro si fa alla prima accensione.
# Collegamento: collegamento.txt in questa cartella, riga 1 l'indirizzo della web app, riga 2 il codice di accesso.
# Uso a mano: promemoria-mac.sh --forza
D="$HOME/Library/Application Support/AppDocente"
OGGI=$(date +%Y-%m-%d); FATTO="$D/log/promemoria-ok-$OGGI"; LOG="$D/log/promemoria.log"
mkdir -p "$D/log"
[[ -e "$FATTO" && "$1" != "--forza" ]] && exit 0
scrivi() { print -r -- "$(date '+%Y-%m-%d %H:%M') $1" >>"$LOG"; }
notifica() { osascript -e "display notification \"${2//\"/\'}\" with title \"$1\""; }
EP=$(sed -n 1p "$D/collegamento.txt" 2>/dev/null | tr -d '[:space:]'); TK=$(sed -n 2p "$D/collegamento.txt" 2>/dev/null | tr -d '[:space:]')
if [[ "$EP" != https://script.google.com/* || -z "$TK" ]]; then
  [[ -e "$D/log/promemoria-avviso-$OGGI" ]] || { touch "$D/log/promemoria-avviso-$OGGI"; scrivi "collegamento.txt mancante o incompleto"; notifica "Promemoria circolari" "Manca il collegamento: copia indirizzo e codice dalle Impostazioni dell'app."; }
  exit 1
fi
T=$(mktemp -t promemoria) || exit 1
trap 'rm -f "$T"' EXIT
# senza rete o con il backend che non risponde: nessun segno di «fatto», si riprova al prossimo giro
curl -sL --max-time 90 -G "$EP" --data-urlencode "token=$TK" --data-urlencode "promemoria=1" -o "$T" || { scrivi "backend non raggiungibile"; exit 1; }
IDS=$(osascript -l JavaScript "$D/promemoria-mac.js" "$T" 2>>"$LOG") || { scrivi "Promemoria non aggiornato (vedi sopra)"; exit 1; }
if [[ "$IDS" == "[]" ]]; then touch "$FATTO"; exit 0; fi
[[ "$IDS" == \[*\] ]] || { scrivi "risposta inattesa: ${IDS[1,120]}"; exit 1; }
R=$(curl -sL --max-time 90 -H 'Content-Type: text/plain;charset=utf-8' --data-binary "{\"azione\":\"promemoria_fatti\",\"token\":\"$TK\",\"ids\":$IDS}" "$EP")
N=$(print -r -- "$IDS" | tr -cd ',' | wc -c | tr -d ' '); N=$((N + 1))
if [[ "$R" == *'"ok":true'* ]]; then
  touch "$FATTO"; scrivi "$N promemoria creati"
  notifica "Promemoria circolari" "$N promemoria aggiunti all'elenco Scuola."
else
  # creati ma non confermati: al prossimo giro lo script li ritrova in Promemoria e li conferma senza duplicarli
  scrivi "$N promemoria creati, conferma al backend non riuscita: ${R[1,120]}"
fi
find "$D/log" -name 'promemoria-ok-*' -mtime +7 -delete; find "$D/log" -name 'promemoria-avviso-*' -mtime +7 -delete
