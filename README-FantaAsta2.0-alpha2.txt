FantaAsta2.0 — Alpha 2 · Regulation + Strategy Intelligence
=============================================================

COSA AGGIUNGE
- Regulation Engine schema 2 con migrazione automatica da Alpha 1.
- Pannello Regolamento v2 dentro Impostazioni.
- Modifica di: disponibilità singola/multipla, Mantra/Classic, budget,
  dimensione rosa, portieri, limite club, U23/U21, panchina, Switch,
  timeout, formazioni nascoste, ammonito SV, bonus principali,
  D Factor, Fairplay e Capitano.
- Strategy Engine Alpha 2 con Strategy Score basato su:
  qualità XI, titolarità LIVE, profondità, costo, flessibilità,
  scarsità per slot e compatibilità col regolamento.
- AUTO Listone sceglie anche la coppia di moduli con migliore sinergia.
- Spiegazioni: punti di forza, rischi e priorità di asta.

IMPORTANTE
Durante Alpha 2 il nuovo Strategy Engine NON sostituisce ancora il vecchio
motore A/B dentro Asta Live. Serve a validare il nuovo modello senza rischiare
la parte già stabile dell'app.

INSTALLAZIONE
Nel repository GitHub FantaAsta2.0 sostituire SOLO:
- index.html
- app.js
- styles.css
- sw.js
- regulation-engine.js
- strategy-engine.js

Non toccare players.js, market.js, formations.js, listone-current.json,
formations-current.json o i workflow già funzionanti.

Dopo il commit attendere pages build and deployment = Success.
Poi chiudere completamente la PWA/browser e riaprire il sito.

PRIMO TEST
1. Aprire Impostazioni > Regolamento v2.
2. Verificare che il preset sia 2500, 25 giocatori, 3 POR,
   U23 2, U21 1, Switch Plus.
3. Tornare in Strategia.
4. AUTO LISTONE > ANALIZZA LISTONE.
5. Controllare che compaiano: Qualità XI, Titolarità, Profondità,
   Costo, Flessibilità, Scarsità, Regolamento e spiegazioni.
