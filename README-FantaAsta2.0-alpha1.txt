FantaAsta2.0 — Alpha 1 · Strategy Lab
=====================================

OBIETTIVO
Questa prima Alpha crea il progetto v2 sopra la base stabile v1.45.5 e aggiunge:
- Regulation Engine indipendente
- nuova sezione Strategia nella barra inferiore
- strategia MONO MODULO
- strategia DOPPIO MODULO
- strategia AUTO LISTONE
- analisi preliminare di copertura, qualità, flessibilità e scarsità
- budget guida per reparto calcolato sul modulo
- classifica automatica degli 11 moduli Mantra

IMPORTANTE
In Alpha 1 il nuovo Strategy Engine lavora in parallelo al vecchio motore A/B.
NON modifica ancora ranking Asta Live, TARGET, ALT o MAX. Questo è intenzionale:
prima validiamo il nuovo motore, poi lo rendiamo autorevole nell'asta.

COME CREARE IL NUOVO REPOSITORY
1. Crea su GitHub un nuovo repository, consigliato: FantaAsta2.0
2. Copia TUTTI i file del repository asta-mantra stabile (v1.45.5) nel nuovo repository.
3. Dal presente pacchetto sostituisci:
   - index.html
   - app.js
   - styles.css
   - sw.js
4. Aggiungi:
   - regulation-engine.js
   - strategy-engine.js
5. Mantieni nel nuovo repository gli altri file già funzionanti:
   players.js, formations.js, market.js, manifest, icone, workflow, scripts, json live, ecc.
6. Attiva GitHub Pages sul nuovo repository.

DATI
La v2 usa nuove chiavi localStorage (fa2_*) per Regulation/Strategy.
I dati asta legacy restano per ora compatibili con la v1, in modo da poter testare senza perdere funzionalità.

PROSSIMA MILESTONE (Alpha 2)
- menu Regolamento v2 completo
- preset "La mia lega" / "Mantra base" / "Personalizzato"
- impatto regolamento sul Strategy Engine
- Strategy Score per slot Mantra
- primo Player Intelligence Score
