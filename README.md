# Quadretti

Crucipixel (nonogram) giocabile dal browser e installabile sulla home dell'iPhone.
Niente framework, niente build, niente `npm`: sono file statici che il browser
apre così come sono.

## Cosa c'è dentro

| File | A cosa serve |
|---|---|
| `index.html` | struttura delle tre schermate: elenco, partita, vittoria |
| `app.css` | tutto l'aspetto grafico |
| `app.js` | logica di gioco: griglia, tocco, indizi, salvataggio, vittoria |
| `levels.js` | i 18 puzzle (indizi + soluzione) |
| `manifest.webmanifest` | dati per l'installazione sulla home |
| `sw.js` | fa funzionare il gioco anche senza rete |
| `icons/` | icone dell'app |

## Pubblicare su Vercel

1. Crea un repository nuovo su GitHub e carica dentro tutti questi file,
   mantenendo la cartella `icons/` com'è.
2. Su Vercel: **Add New → Project**, scegli il repository.
3. Alla domanda sul framework lascia **Other**. Non toccare né build command
   né output directory: sono file statici, Vercel li serve direttamente.
4. **Deploy**.

## Installare sull'iPhone

Apri l'indirizzo con **Safari** (non Chrome: su iOS solo Safari installa le PWA),
tocca il pulsante Condividi e poi *Aggiungi a Home*. Da lì parte a schermo
intero e funziona anche in aereo.

## Se modifichi qualcosa

Dopo ogni modifica **alza il numero di versione della cache** in `sw.js`:

```js
var CACHE = 'quadretti-v1';   // diventa 'quadretti-v2', poi 'quadretti-v3'...
```

Senza questo passaggio i telefoni che hanno già aperto il gioco continuano a
usare i file vecchi salvati in cache e le modifiche non si vedono.

## Se vuoi aggiungere livelli

I puzzle in `levels.js` sono stati generati e verificati da `build_levels.py`
(allegato a parte). Ogni livello è controllato con un solver: ammette **una
sola** soluzione, quindi si risolve sempre ragionando, mai tirando a indovinare.
Non aggiungere livelli a mano scrivendo gli indizi: è molto facile creare per
sbaglio un puzzle ambiguo, e il giocatore si blocca senza capire perché.

## I progressi

Sono salvati nel telefono con `localStorage`, legati al browser e al dominio.
Non ci sono account e niente esce dal dispositivo. Il pulsante *Azzera i
progressi* in fondo all'elenco cancella tutto.
