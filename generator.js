/* Quadretti - generatore di quadri nuovi.
   Due lavori distinti:
   1) inventare una griglia che assomigli a qualcosa;
   2) verificare col solver che si risolva per pura deduzione, e misurare
      quanto e' faticosa.
   Il secondo punto e' quello che conta: un quadro generato a caso spesso
   NON e' risolvibile ragionando, e va scartato. */

var Nono = (function () {
  'use strict';

  /* ---------- numeri casuali ripetibili ----------
     Stesso seme -> stessa griglia, su qualunque telefono. Serve per il
     quadro del giorno: tutti devono vedere lo stesso. */

  function seedFrom(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rngFrom(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- righe e indizi ---------- */

  function cluesOf(line) {
    var out = [], run = 0;
    for (var i = 0; i < line.length; i++) {
      if (line[i] === 1) run++;
      else if (run) { out.push(run); run = 0; }
    }
    if (run) out.push(run);
    return out.length ? out : [0];
  }

  var cache = {};

  function lineCandidates(clue, n) {
    var key = n + '|' + clue.join(',');
    if (cache[key]) return cache[key];

    var blocks = [];
    for (var b = 0; b < clue.length; b++) if (clue[b] > 0) blocks.push(clue[b]);

    var out = [];
    (function place(i, from, acc) {
      if (i === blocks.length) {
        var line = acc.slice();
        while (line.length < n) line.push(0);
        out.push(line);
        return;
      }
      var need = 0;
      for (var k = i; k < blocks.length; k++) need += blocks[k];
      need += blocks.length - i - 1;

      for (var start = from; start <= n - need; start++) {
        var next = acc.slice();
        while (next.length < start) next.push(0);
        for (var q = 0; q < blocks[i]; q++) next.push(1);
        if (i < blocks.length - 1) next.push(0);
        place(i + 1, start + blocks[i] + 1, next);
      }
    })(0, 0, []);

    cache[key] = out;
    return out;
  }

  /* Data una riga parzialmente nota e i suoi indizi, restituisce le caselle
     ancora ignote su cui TUTTE le disposizioni possibili sono d'accordo.
     null = nessuna disposizione possibile, cioe' c'e' una contraddizione. */
  function analyseLine(known, clue) {
    var all = lineCandidates(clue, known.length);
    var fit = [];
    for (var c = 0; c < all.length; c++) {
      var ok = true;
      for (var i = 0; i < known.length; i++) {
        if (known[i] !== -1 && known[i] !== all[c][i]) { ok = false; break; }
      }
      if (ok) fit.push(all[c]);
    }
    if (!fit.length) return null;

    var forced = [];
    for (var j = 0; j < known.length; j++) {
      if (known[j] !== -1) continue;
      var v = fit[0][j], same = true;
      for (var f = 1; f < fit.length; f++) {
        if (fit[f][j] !== v) { same = false; break; }
      }
      if (same) forced.push({ index: j, value: v });
    }
    forced.options = fit.length;
    return forced;
  }

  /* ---------- il solver che misura ----------
     Risolve come farebbe una persona: passa e ripassa righe e colonne,
     segnando solo cio' che e' certo, finche' non scopre piu' nulla.
     Ogni giro e' un'"ondata". Registra quante caselle ha dedotto per
     ondata: e' da li' che esce il voto di difficolta'. */

  function solve(rows, cols, n) {
    var g = new Array(n * n).fill(-1);
    var waves = [];

    for (;;) {
      // Si guardano TUTTE le righe e colonne sulla stessa fotografia della
      // griglia, non una dopo l'altra: e' quello che vede una persona che
      // si ferma a cercare la prossima mossa.
      var snap = g.slice();
      var moves = [];
      var lines = 0;
      var hardest = 0;

      for (var y = 0; y < n; y++) {
        var kr = [];
        for (var x = 0; x < n; x++) kr.push(snap[y * n + x]);
        var fr = analyseLine(kr, rows[y]);
        if (!fr) return { solved: false, clash: true, waves: waves };
        var useful = 0;
        for (var i = 0; i < fr.length; i++) {
          if (snap[y * n + fr[i].index] === -1) {
            moves.push({ at: y * n + fr[i].index, v: fr[i].value });
            useful++;
          }
        }
        if (useful) { lines++; if (fr.options > hardest) hardest = fr.options; }
      }

      for (var x2 = 0; x2 < n; x2++) {
        var kc = [];
        for (var y2 = 0; y2 < n; y2++) kc.push(snap[y2 * n + x2]);
        var fc = analyseLine(kc, cols[x2]);
        if (!fc) return { solved: false, clash: true, waves: waves };
        var useful2 = 0;
        for (var j = 0; j < fc.length; j++) {
          if (snap[fc[j].index * n + x2] === -1) {
            moves.push({ at: fc[j].index * n + x2, v: fc[j].value });
            useful2++;
          }
        }
        if (useful2) { lines++; if (fc.options > hardest) hardest = fc.options; }
      }

      if (!moves.length) break;

      var cells = 0;
      for (var m = 0; m < moves.length; m++) {
        if (g[moves[m].at] === -1) { g[moves[m].at] = moves[m].v; cells++; }
      }
      waves.push({ cells: cells, lines: lines, hardest: hardest });
    }

    var left = 0;
    for (var z = 0; z < g.length; z++) if (g[z] === -1) left++;
    return { solved: left === 0, left: left, waves: waves };
  }

  /* Voto di difficolta'.
     - ondate: quante volte devi ripassare tutta la griglia da capo;
     - apertura: nel momento piu' avaro, quante righe o colonne avevano
       qualcosa da dirti. Una sola su venti significa cercarla ovunque;
     - intrico: quante disposizioni diverse ammetteva la riga piu'
       ingarbugliata nel momento in cui e' diventata utile.
     L'ultima ondata e' esclusa: chiudere gli ultimi buchi e' sempre facile
     e falserebbe la misura. */
  function score(waves) {
    if (!waves.length) return null;
    var body = waves.length > 1 ? waves.slice(0, -1) : waves;

    var open = body[0].lines, tangle = 0;
    for (var i = 0; i < body.length; i++) {
      if (body[i].lines < open) open = body[i].lines;
      if (body[i].hardest > tangle) tangle = body[i].hardest;
    }

    return {
      waves: waves.length,
      open: open,
      tangle: tangle,
      value: Math.round(waves.length * 10 + (20 / open) * 12 + Math.log2(tangle + 1) * 3)
    };
  }

  /* ---------- disegno della griglia ----------
     Caselle sparse a caso fanno rumore visivo. Due accorgimenti:
     si ammorbidisce la griglia guardando i vicini, cosi' nascono macchie
     invece di puntini; e si specchia una meta' sull'altra, perche' l'occhio
     nella simmetria legge una forma voluta. */

  function draw(n, rng, density) {
    var g = new Array(n * n);
    var half = Math.ceil(n / 2);

    for (var y = 0; y < n; y++) {
      for (var x = 0; x < half; x++) g[y * n + x] = rng() < density ? 1 : 0;
    }

    for (var pass = 0; pass < 2; pass++) {
      var copy = g.slice();
      for (var y2 = 0; y2 < n; y2++) {
        for (var x2 = 0; x2 < half; x2++) {
          var near = 0;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              var ny = y2 + dy, nx = x2 + dx;
              if (ny < 0 || ny >= n || nx < 0 || nx >= half) continue;
              near += copy[ny * n + nx];
            }
          }
          g[y2 * n + x2] = near >= 5 ? 1 : (near <= 2 ? 0 : copy[y2 * n + x2]);
        }
      }
    }

    for (var y3 = 0; y3 < n; y3++) {
      for (var x3 = 0; x3 < half; x3++) g[y3 * n + (n - 1 - x3)] = g[y3 * n + x3];
    }
    return g;
  }

  function cluesFor(g, n) {
    var rows = [], cols = [];
    for (var y = 0; y < n; y++) {
      var r = [];
      for (var x = 0; x < n; x++) r.push(g[y * n + x]);
      rows.push(cluesOf(r));
    }
    for (var x2 = 0; x2 < n; x2++) {
      var c = [];
      for (var y2 = 0; y2 < n; y2++) c.push(g[y2 * n + x2]);
      cols.push(cluesOf(c));
    }
    return { rows: rows, cols: cols };
  }

  function attempt(n, rng) {
    var density = 0.42 + rng() * 0.22;
    var g = draw(n, rng, density);

    var filled = 0;
    for (var i = 0; i < g.length; i++) filled += g[i];
    // griglie quasi vuote o quasi piene non sono quadri, sono macchie
    if (filled < n * n * 0.25 || filled > n * n * 0.75) return null;

    var cl = cluesFor(g, n);
    var res = solve(cl.rows, cl.cols, n);
    if (!res.solved) return null;          // servirebbe tirare a indovinare

    var s = score(res.waves);
    if (!s) return null;

    return {
      size: n,
      rows: cl.rows,
      cols: cl.cols,
      solution: (function () {
        var out = [];
        for (var y = 0; y < n; y++) {
          var line = '';
          for (var x = 0; x < n; x++) line += g[y * n + x];
          out.push(line);
        }
        return out;
      })(),
      grade: s
    };
  }

  return {
    seedFrom: seedFrom,
    rngFrom: rngFrom,
    cluesOf: cluesOf,
    lineCandidates: lineCandidates,
    analyseLine: analyseLine,
    solve: solve,
    score: score,
    attempt: attempt
  };
})();

if (typeof module !== 'undefined') module.exports = Nono;
