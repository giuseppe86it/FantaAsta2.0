FantaAsta2.0 — Alpha 2.1 · Storage Isolation + Analysis Scope

PERCHÉ QUESTA PATCH
FantaAsta2.0 e asta-mantra sono pubblicate entrambe sotto giuseppe86it.github.io.
Il localStorage del browser è condiviso per dominio, non per cartella: Alpha 2 poteva quindi leggere assegnazioni e stato della vecchia app.

COSA CAMBIA
- Tutte le chiavi dati ereditate dalla v1 passano dal prefisso am_ al prefisso fa2_.
- FantaAsta2.0 non legge né modifica più automaticamente i dati locali di asta-mantra.
- Il service worker elimina solo cache FantaAsta2.0 e non le cache della v1.
- Strategy Lab aggiunge BASE ANALISI:
  * LISTONE COMPLETO = strategia pre-asta, ignora le assegnazioni.
  * MERCATO LIVE = strategia adattiva, considera solo i calciatori ancora disponibili.
- Il vecchio risultato Alpha 2 in sessione viene ignorato e va rigenerato.

INSTALLAZIONE
Nel repository FantaAsta2.0 sostituisci:
index.html
app.js
styles.css
sw.js
strategy-engine.js

regulation-engine.js non cambia, ma puoi caricare anche l'intero pacchetto cumulativo.

DOPO IL DEPLOY
1. Chiudi e riapri FantaAsta2.0.
2. Vai su Giocatori e premi Aggiorna se vuoi risincronizzare il Listone.
3. Vai su Strategia.
4. Lascia LISTONE COMPLETO.
5. Premi AUTO LISTONE > ANALIZZA LISTONE.
6. Confronta il nuovo risultato con quello Alpha 2.

NOTA
La v1 asta-mantra rimane separata. I suoi acquisti, vendite, PIN, lega, watchlist e backup non vengono cancellati.
