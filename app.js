/* Quadretti — logica di gioco.
   Stati di una casella: 0 = vuota, 1 = piena, 2 = segnata come vuota. */

(function () {
  'use strict';

  var STORE_KEY = 'quadretti.v1';
  var EMPTY = 0, FULL = 1, MARK = 2;

  var el = function (id) { return document.getElementById(id); };
  var store = load();

  var game = null;   // partita in corso
  var ticker = null;

  /* ---------------- salvataggio ---------------- */

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var s = raw ? JSON.parse(raw) : null;
      if (!s || typeof s !== 'object') throw 0;
      s.runs = s.runs || {};
      s.done = s.done || {};
      s.train = s.train || { grade: 1, solved: 0 };
      s.log = s.log || [];
      s.stats = s.stats || { solved: 0, seconds: 0 };
      return s;
    } catch (e) {
      return { runs: {}, done: {}, train: { grade: 1, solved: 0 }, log: [], stats: { solved: 0, seconds: 0 } };
    }
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  }

  function saveRun() {
    if (!game || game.won) return;
    if (game.level.generated) {
      if (store.train.current) {
        store.train.current.g = game.grid.join('');
        store.train.current.t = game.elapsed;
      }
    } else {
      store.runs[game.level.id] = { g: game.grid.join(''), t: game.elapsed };
    }
    save();
  }

  /* ---------------- utilita' ---------------- */

  function levelById(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return LEVELS[i];
    return null;
  }

  function cluesOf(line) {
    var out = [], run = 0;
    for (var i = 0; i < line.length; i++) {
      if (line[i] === FULL) run++;
      else if (run) { out.push(run); run = 0; }
    }
    if (run) out.push(run);
    return out.length ? out : [0];
  }

  function sameList(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function mmss(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function solutionCell(level, x, y) {
    return level.solution[y].charAt(x) === '1' ? 1 : 0;
  }

  /* ---------------- elenco livelli ---------------- */

  function drawThumb(canvas, level, solved) {
    var n = level.size;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var px = 100;
    canvas.width = px * dpr;
    canvas.height = px * dpr;
    var c = canvas.getContext('2d');
    c.scale(dpr, dpr);

    c.fillStyle = solved ? '#E7EAE3' : '#1E333B';
    c.fillRect(0, 0, px, px);

    var pad = 8, size = (px - pad * 2) / n;

    if (solved) {
      c.fillStyle = '#16333B';
      for (var y = 0; y < n; y++) {
        for (var x = 0; x < n; x++) {
          if (solutionCell(level, x, y)) {
            c.fillRect(pad + x * size, pad + y * size, size + 0.4, size + 0.4);
          }
        }
      }
    } else {
      c.strokeStyle = 'rgba(137,160,154,.30)';
      c.lineWidth = 1;
      for (var i = 0; i <= n; i++) {
        var p = Math.round(pad + i * size) + 0.5;
        c.beginPath(); c.moveTo(p, pad); c.lineTo(p, px - pad); c.stroke();
        c.beginPath(); c.moveTo(pad, p); c.lineTo(px - pad, p); c.stroke();
      }
    }
  }

  function renderHome() {
    var groups = { 5: el('tiles-5'), 10: el('tiles-10') };
    groups[5].innerHTML = '';
    groups[10].innerHTML = '';

    var done = 0;
    LEVELS.forEach(function (level, idx) {
      var best = store.done[level.id];
      var solved = typeof best === 'number';
      if (solved) done++;

      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile' + (solved ? ' is-done' : '');
      b.setAttribute('aria-label',
        solved ? level.name + ', risolto in ' + mmss(best) : 'Quadro numero ' + (idx + 1) + ', da risolvere');

      var cv = document.createElement('canvas');
      b.appendChild(cv);

      var nm = document.createElement('span');
      nm.className = 'tile-name';
      nm.textContent = solved ? level.name : 'n. ' + (idx + 1);
      b.appendChild(nm);

      if (level.hints) {
        var tg2 = document.createElement('span');
        tg2.className = 'tile-tag';
        tg2.textContent = 'con aiuti';
        b.appendChild(tg2);
      }

      if (solved) {
        var tm = document.createElement('span');
        tm.className = 'tile-time';
        tm.textContent = mmss(best);
        b.appendChild(tm);
      } else if (store.runs[level.id]) {
        var tg = document.createElement('span');
        tg.className = 'tile-time';
        tg.textContent = 'iniziato';
        b.appendChild(tg);
      }

      b.addEventListener('click', function () { openLevel(level.id); });
      groups[level.size].appendChild(b);
      drawThumb(cv, level, solved);
    });

    el('tally-done').textContent = done;
    el('tally-all').textContent = LEVELS.length;

    var sk = streaks();
    el('tally-streak').textContent = sk.now > 1 ? spell(sk.now, 'giorno', 'giorni') + ' di fila' : '';
    el('tally-streak').hidden = sk.now < 2;

    renderTrain();
  }

  /* ---------------- statistiche ----------------
     Tutto si ricava dal registro delle vittorie tenuto nel telefono.
     Niente esce di qui: non c'e' nessun server. */

  function dayNumber(key) {
    var p = key.split('-');
    return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }

  function streaks() {
    var days = {};
    for (var i = 0; i < store.log.length; i++) days[store.log[i].d] = true;

    var list = Object.keys(days).map(dayNumber).sort(function (a, b) { return a - b; });
    if (!list.length) return { now: 0, best: 0, days: 0 };

    var best = 1, run = 1;
    for (var j = 1; j < list.length; j++) {
      run = (list[j] === list[j - 1] + 1) ? run + 1 : 1;
      if (run > best) best = run;
    }

    // la serie corrente vale solo se arriva a oggi o a ieri
    var today = dayNumber(dayKey(new Date()));
    var last = list[list.length - 1];
    var now = 0;
    if (last === today || last === today - 1) {
      now = 1;
      for (var k = list.length - 1; k > 0; k--) {
        if (list[k] === list[k - 1] + 1) now++; else break;
      }
    }
    return { now: now, best: best, days: list.length };
  }

  function spell(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function longTime(sec) {
    var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    if (h) return h + 'h ' + m + 'm';
    if (sec < 60) return sec + 's';
    return m + ' min';
  }

  function renderStats() {
    var st = store.stats, sk = streaks();

    el('st-solved').textContent = st.solved || 0;
    el('st-streak').textContent = sk.now;
    el('st-time').textContent = longTime(st.seconds || 0);

    el('st-streak-note').textContent = sk.best > 1
      ? 'la piu\u0027 lunga e\u0027 stata di ' + spell(sk.best, 'giorno', 'giorni')
      : 'gioca domani per allungarla';

    el('st-days').textContent = sk.days === 0
      ? 'Non hai ancora risolto nulla.'
      : 'Hai giocato in ' + spell(sk.days, 'giornata', 'giornate') + '.';

    // galleria
    var owned = 0;
    for (var i = 0; i < LEVELS.length; i++) {
      if (typeof store.done[LEVELS[i].id] === 'number') owned++;
    }
    el('st-gallery').textContent = owned + ' di ' + LEVELS.length;
    el('st-train').textContent = store.train.solved === 0
      ? 'nessuno'
      : spell(store.train.solved, 'quadro', 'quadri') + ', fino al grado ' + (st.topGrade || 1);

    el('st-best5').textContent = st.best5 ? mmss(st.best5) : '\u2014';
    el('st-best10').textContent = st.best10 ? mmss(st.best10) : '\u2014';

    drawChart();
  }

  function drawChart() {
    var box = el('st-chart');
    box.innerHTML = '';

    var count = {};
    for (var i = 0; i < store.log.length; i++) {
      count[store.log[i].d] = (count[store.log[i].d] || 0) + 1;
    }

    var top = 1;
    var day = new Date();
    var bars = [];
    for (var back = 13; back >= 0; back--) {
      var d = new Date(day.getTime() - back * 86400000);
      var key = dayKey(d);
      var n = count[key] || 0;
      if (n > top) top = n;
      bars.push({ n: n, d: d, key: key });
    }

    var names = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
    for (var b = 0; b < bars.length; b++) {
      var col = document.createElement('div');
      col.className = 'bar' + (bars[b].n ? ' has' : '');
      col.title = bars[b].n + ' il ' + bars[b].key;

      var fill = document.createElement('i');
      fill.style.height = Math.round((bars[b].n / top) * 100) + '%';
      col.appendChild(fill);

      var lab = document.createElement('span');
      lab.textContent = names[bars[b].d.getDay()];
      col.appendChild(lab);

      box.appendChild(col);
    }
  }

  /* ---------------- allenamento ----------------
     Quadri creati sul momento, sempre diversi, che si fanno via via piu'
     impegnativi. La difficolta' non cresce allargando la griglia: resta
     10x10 e cresce la profondita' del ragionamento richiesto. */

  function targetFor(grade) {
    var t = 55 + (grade - 1) * 7;
    if (grade % 4 === 0) t = Math.round(t * 0.72);   // un respiro ogni quattro
    return Math.min(t, 210);
  }

  function gradeLabel(value) {
    if (value < 65) return 'Facile';
    if (value < 95) return 'Medio';
    if (value < 140) return 'Difficile';
    return 'Tosto';
  }

  function makePuzzle(grade) {
    var rng = Nono.rngFrom((Date.now() ^ Math.imul(grade, 2654435761)) >>> 0);
    var target = targetFor(grade);
    var best = null;

    // Si generano tanti candidati e si tiene quello piu' vicino al bersaglio:
    // cosi' non si rischia di cercare all'infinito una difficolta' esatta.
    for (var i = 0; i < 90; i++) {
      var p = Nono.attempt(10, rng);
      if (!p) continue;
      var d = Math.abs(p.grade.value - target);
      if (!best || d < best.d) best = { d: d, p: p };
    }
    return best ? best.p : null;
  }

  function asLevel(p, grade) {
    return {
      id: 'train',
      generated: true,
      grade: grade,
      value: p.grade.value,
      name: gradeLabel(p.grade.value),
      size: p.size,
      rows: p.rows,
      cols: p.cols,
      solution: p.solution
    };
  }

  function newTraining() {
    var grade = store.train.grade;
    var p = makePuzzle(grade);
    if (!p) {
      el('train-done').textContent = 'Non sono riuscito a creare un quadro. Riprova.';
      return;
    }
    store.train.current = {
      grade: grade, value: p.grade.value, size: p.size,
      rows: p.rows, cols: p.cols, solution: p.solution,
      g: '', t: 0
    };
    save();
    openTraining();
  }

  function openTraining() {
    var c = store.train.current;
    if (!c) return;

    var level = asLevel({ size: c.size, rows: c.rows, cols: c.cols, solution: c.solution,
                          grade: { value: c.value } }, c.grade);
    var grid = new Array(c.size * c.size).fill(EMPTY);
    if (c.g && c.g.length === c.size * c.size) {
      for (var i = 0; i < c.g.length; i++) grid[i] = +c.g.charAt(i) || 0;
    }

    game = { level: level, grid: grid, elapsed: c.t || 0, mode: 'fill', won: false };

    el('game-title').textContent = 'Allenamento, grado ' + c.grade;
    el('game-sub').textContent = c.size + ' \u00d7 ' + c.size + ' \u00b7 ' + gradeLabel(c.value);
    el('clock').textContent = mmss(game.elapsed);
    el('board').classList.remove('is-locked');
    el('hint-badge').hidden = true;
    el('hint').hidden = true;
    setMode('fill');

    buildBoard();
    show('game');
    startClock();
  }

  function renderTrain() {
    var t = store.train;
    el('train-grade').textContent = 'Grado ' + t.grade;
    el('train-label').textContent = gradeLabel(targetFor(t.grade));
    el('train-done').textContent = t.solved === 0
      ? 'Quadri creati sul momento, sempre diversi. Ogni volta che ne risolvi uno, il prossimo alza l\u0027asticella.'
      : (t.solved === 1 ? 'Un quadro risolto.' : t.solved + ' quadri risolti.');
    el('btn-train-resume').hidden = !t.current;
  }

  /* ---------------- costruzione del quadro ---------------- */

  function cellSize(level) {
    var gutter = maxLen(level.rows);
    var cols = gutter + level.size;
    var rows = maxLen(level.cols) + level.size;

    var availW = Math.min(window.innerWidth, 560) - 16;
    var availH = window.innerHeight - 210;

    var byW = availW / cols;
    var byH = availH / rows;
    return Math.max(20, Math.min(46, Math.floor(Math.min(byW, byH))));
  }

  function maxLen(list) {
    var m = 1;
    for (var i = 0; i < list.length; i++) m = Math.max(m, list[i].length);
    return m;
  }

  function buildBoard() {
    var level = game.level;
    var n = level.size;
    var board = el('board');
    var gutterX = maxLen(level.rows);
    var gutterY = maxLen(level.cols);
    var cs = cellSize(level);

    board.style.setProperty('--cell', cs + 'px');
    board.style.gridTemplateColumns = 'calc(var(--cell) * ' + gutterX + ') repeat(' + n + ', var(--cell))';
    board.style.gridTemplateRows = 'calc(var(--cell) * ' + gutterY + ') repeat(' + n + ', var(--cell))';
    board.innerHTML = '';

    var corner = document.createElement('div');
    corner.className = 'corner';
    board.appendChild(corner);

    game.colClueEls = [];
    for (var x = 0; x < n; x++) {
      var cc = document.createElement('div');
      cc.className = 'clue col';
      level.cols[x].forEach(function (v) {
        var s = document.createElement('span');
        s.textContent = v;
        cc.appendChild(s);
      });
      board.appendChild(cc);
      game.colClueEls.push(cc);
    }

    game.rowClueEls = [];
    game.cells = [];
    for (var y = 0; y < n; y++) {
      var rc = document.createElement('div');
      rc.className = 'clue row';
      level.rows[y].forEach(function (v) {
        var s = document.createElement('span');
        s.textContent = v;
        rc.appendChild(s);
      });
      board.appendChild(rc);
      game.rowClueEls.push(rc);

      for (var x2 = 0; x2 < n; x2++) {
        var sq = document.createElement('div');
        sq.className = 'sq';
        sq.dataset.x = x2;
        sq.dataset.y = y;
        sq.dataset.state = game.grid[y * n + x2];
        if (y === 0) sq.dataset.edgeTop = '1';
        if (x2 === 0) sq.dataset.edgeLeft = '1';
        if ((x2 + 1) % 5 === 0) sq.dataset.blockRight = '1';
        if ((y + 1) % 5 === 0) sq.dataset.blockBottom = '1';
        board.appendChild(sq);
        game.cells.push(sq);
      }
    }

    refreshClues();
  }

  function cellAt(x, y) {
    return game.cells[y * game.level.size + x];
  }

  function setCell(x, y, state) {
    var n = game.level.size, i = y * n + x;
    if (game.grid[i] === state) return false;
    game.grid[i] = state;
    cellAt(x, y).dataset.state = state;
    return true;
  }

  function refreshClues() {
    var level = game.level, n = level.size;
    for (var y = 0; y < n; y++) {
      var row = [];
      for (var x = 0; x < n; x++) row.push(game.grid[y * n + x]);
      game.rowClueEls[y].classList.toggle('is-done', sameList(cluesOf(row), level.rows[y]));
    }
    for (var x2 = 0; x2 < n; x2++) {
      var col = [];
      for (var y2 = 0; y2 < n; y2++) col.push(game.grid[y2 * n + x2]);
      game.colClueEls[x2].classList.toggle('is-done', sameList(cluesOf(col), level.cols[x2]));
    }
  }

  function isSolved() {
    var level = game.level, n = level.size;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var want = solutionCell(level, x, y);
        var got = game.grid[y * n + x] === FULL ? 1 : 0;
        if (want !== got) return false;
      }
    }
    return true;
  }

  /* ---------------- tocco ---------------- */

  var paint = null;

  function squareFromPoint(cx, cy) {
    var node = document.elementFromPoint(cx, cy);
    return node && node.classList && node.classList.contains('sq') ? node : null;
  }

  function onDown(e) {
    var sq = e.target.classList && e.target.classList.contains('sq') ? e.target : null;
    if (!sq || !game || game.won) return;
    e.preventDefault();

    var x = +sq.dataset.x, y = +sq.dataset.y;
    var cur = game.grid[y * game.level.size + x];
    var want = game.mode === 'fill'
      ? (cur === FULL ? EMPTY : FULL)
      : (cur === MARK ? EMPTY : MARK);

    paint = { want: want, axis: null, x0: x, y0: y, cx: e.clientX, cy: e.clientY, moved: false, longTimer: null };
    setCell(x, y, want);

    // pressione prolungata: scorciatoia per segnare una casella come vuota
    if (game.mode === 'fill' && cur === EMPTY) {
      paint.longTimer = setTimeout(function () {
        if (!paint || paint.moved) return;
        paint.want = MARK;
        setCell(paint.x0, paint.y0, MARK);
        refreshClues();
        if (navigator.vibrate) navigator.vibrate(12);
      }, 420);
    }

    el('board').setPointerCapture && el('board').setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    if (!paint) return;
    e.preventDefault();

    if (!paint.moved) {
      var dx = Math.abs(e.clientX - paint.cx), dy = Math.abs(e.clientY - paint.cy);
      if (dx > 6 || dy > 6) {
        paint.moved = true;
        clearTimeout(paint.longTimer);
      }
    }

    var sq = squareFromPoint(e.clientX, e.clientY);
    if (!sq) return;
    var x = +sq.dataset.x, y = +sq.dataset.y;
    if (x === paint.x0 && y === paint.y0) return;

    // il tratto si blocca sulla riga o sulla colonna di partenza
    if (!paint.axis) paint.axis = (y === paint.y0) ? 'h' : (x === paint.x0 ? 'v' : null);
    if (paint.axis === 'h' && y !== paint.y0) return;
    if (paint.axis === 'v' && x !== paint.x0) return;
    if (!paint.axis) return;

    setCell(x, y, paint.want);
  }

  function onUp() {
    if (!paint) return;
    clearTimeout(paint.longTimer);
    paint = null;
    refreshClues();
    hideHint();
    if (isSolved()) finish();
    else { saveRun(); armHint(); }
  }

  /* ---------------- suggerimenti ----------------
     Un suggerimento non e' mai inventato: si guarda una riga (o colonna),
     si elencano tutte le disposizioni compatibili con gli indizi E con
     quello che il giocatore ha gia' segnato, e si cerca una casella su cui
     tutte le disposizioni sono d'accordo. Quella casella e' certa.
     Se non resta nessuna disposizione possibile, vuol dire che in quella
     riga c'e' un errore, e lo si segnala. */

  var HINT_AFTER = 25000;     // fermo da tanti millisecondi -> arriva l'aiuto
  var hintTimer = null;

  function knownAt(x, y) {
    var s = game.grid[y * game.level.size + x];
    return s === FULL ? 1 : (s === MARK ? 0 : -1);
  }

  function findMistake() {
    var n = game.level.size;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var st = game.grid[y * n + x];
        var truth = solutionCell(game.level, x, y);
        if (st === FULL && !truth) return { x: x, y: y };
        if (st === MARK && truth) return { x: x, y: y };
      }
    }
    return null;
  }

  function findHint() {
    var n = game.level.size;
    var best = null;

    function consider(kind, idx, known, clue) {
      var res = Nono.analyseLine(known, clue);
      if (!res || !res.length) return;
      // si preferisce la riga con meno alternative: e' la piu' facile da vedere
      if (!best || res.options < best.options) {
        var f = res[0];
        best = {
          kind: kind,
          idx: idx,
          options: res.options,
          value: f.value,
          x: kind === 'row' ? f.index : idx,
          y: kind === 'row' ? idx : f.index
        };
      }
    }

    for (var y = 0; y < n; y++) {
      var row = [];
      for (var x = 0; x < n; x++) row.push(knownAt(x, y));
      consider('row', y, row, game.level.rows[y]);
    }
    for (var x2 = 0; x2 < n; x2++) {
      var col = [];
      for (var y2 = 0; y2 < n; y2++) col.push(knownAt(x2, y2));
      consider('col', x2, col, game.level.cols[x2]);
    }
    return best;
  }

  function hintText(h) {
    var dove = (h.kind === 'row' ? 'Riga ' : 'Colonna ') + (h.idx + 1);
    return h.value === 1
      ? dove + ': questa casella deve essere piena, non c\u0027e\u0027 altro modo.'
      : dove + ': questa casella resta per forza vuota.';
  }

  function showHint() {
    if (!game || game.won || !game.level.hints) return;
    clearHintMark();

    // Prima cosa: c'e' gia' un quadretto sbagliato? Se si', segnalarlo subito
    // e' piu' utile che dare un consiglio costruito su una premessa falsa.
    var bad = findMistake();
    if (bad) {
      el('hint-text').textContent = 'Riga ' + (bad.y + 1) +
        ': qui c\u0027e\u0027 un quadretto sbagliato. Meglio sistemarlo prima di andare avanti.';
      for (var i = 0; i < game.level.size; i++) cellAt(i, bad.y).classList.add('is-suspect');
      el('hint').hidden = false;
      return;
    }

    var h = findHint();
    if (!h) return;

    el('hint-text').textContent = hintText(h);
    cellAt(h.x, h.y).classList.add('is-hinted');
    el('hint').hidden = false;
  }

  function clearHintMark() {
    if (!game || !game.cells) return;
    for (var i = 0; i < game.cells.length; i++) {
      game.cells[i].classList.remove('is-hinted', 'is-suspect');
    }
  }

  function hideHint() {
    if (!game) return;
    el('hint').hidden = true;
    clearHintMark();
  }

  function armHint() {
    clearTimeout(hintTimer);
    if (!game || game.won || !game.level.hints) return;
    hintTimer = setTimeout(showHint, HINT_AFTER);
  }

  function disarmHint() {
    clearTimeout(hintTimer);
    hintTimer = null;
  }

  /* ---------------- partita ---------------- */

  function openLevel(id) {
    var level = levelById(id);
    if (!level) return;

    var n = level.size;
    var run = store.runs[id];
    var grid = new Array(n * n).fill(EMPTY);
    var elapsed = 0;

    if (run && run.g && run.g.length === n * n) {
      for (var i = 0; i < run.g.length; i++) grid[i] = +run.g.charAt(i) || 0;
      elapsed = run.t || 0;
    }

    game = { level: level, grid: grid, elapsed: elapsed, mode: 'fill', won: false };

    el('game-title').textContent = store.done[id] ? level.name : 'Quadro n. ' + (LEVELS.indexOf(level) + 1);
    el('game-sub').textContent = n + ' × ' + n;
    el('clock').textContent = mmss(elapsed);
    el('board').classList.remove('is-locked');
    setMode('fill');

    buildBoard();
    show('game');
    startClock();
    el('hint').hidden = true;
    el('hint-badge').hidden = !level.hints;
    armHint();
  }

  function startClock() {
    stopClock();
    ticker = setInterval(function () {
      if (!game || game.won) return;
      game.elapsed++;
      el('clock').textContent = mmss(game.elapsed);
      if (game.elapsed % 10 === 0) saveRun();
    }, 1000);
  }

  function stopClock() {
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  function dayKey(d) {
    var m = d.getMonth() + 1, g = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (g < 10 ? '0' : '') + g;
  }

  function record() {
    store.log.push({
      d: dayKey(new Date()),
      t: game.elapsed,
      k: game.level.generated ? 't' : 'g',
      s: game.level.size
    });
    // il registro non deve crescere all'infinito dentro il telefono
    if (store.log.length > 400) store.log = store.log.slice(-400);

    store.stats.solved++;
    store.stats.seconds += game.elapsed;

    var key = 'best' + game.level.size;
    if (!store.stats[key] || game.elapsed < store.stats[key]) store.stats[key] = game.elapsed;
  }

  function finish() {
    game.won = true;
    stopClock();
    disarmHint();
    hideHint();
    el('board').classList.add('is-locked');

    // le caselle segnate spariscono: resta solo il disegno
    for (var i = 0; i < game.grid.length; i++) {
      if (game.grid[i] === MARK) {
        game.grid[i] = EMPTY;
        game.cells[i].dataset.state = EMPTY;
      }
    }

    record();

    if (game.level.generated) {
      store.train.solved++;
      store.train.grade++;
      if (!store.stats.topGrade || game.level.grade > store.stats.topGrade) {
        store.stats.topGrade = game.level.grade;
      }
      delete store.train.current;
      save();
    } else {
      var id = game.level.id;
      var best = store.done[id];
      if (typeof best !== 'number' || game.elapsed < best) store.done[id] = game.elapsed;
      delete store.runs[id];
      save();
    }

    if (navigator.vibrate) navigator.vibrate([18, 60, 18]);

    el('win-name').textContent = game.level.name;
    el('win-time').textContent = 'Risolto in ' + mmss(game.elapsed);
    drawWinArt(game.level);

    if (game.level.generated) {
      el('btn-next').hidden = false;
      el('btn-next').dataset.next = 'train';
      el('btn-next').textContent = 'Un altro, piu\u0027 tosto';
    } else {
      var next = nextUnsolved(game.level.id);
      el('btn-next').hidden = !next;
      el('btn-next').dataset.next = next || '';
      el('btn-next').textContent = 'Quadro successivo';
    }

    setTimeout(function () { el('win').hidden = false; }, 520);
  }

  function nextUnsolved(afterId) {
    var start = LEVELS.findIndex(function (l) { return l.id === afterId; });
    for (var i = start + 1; i < LEVELS.length; i++) {
      if (typeof store.done[LEVELS[i].id] !== 'number') return LEVELS[i].id;
    }
    for (var j = 0; j < LEVELS.length; j++) {
      if (typeof store.done[LEVELS[j].id] !== 'number') return LEVELS[j].id;
    }
    return 0;
  }

  function drawWinArt(level) {
    var cv = el('win-art');
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var px = 240;
    cv.width = px * dpr; cv.height = px * dpr;
    var c = cv.getContext('2d');
    c.scale(dpr, dpr);
    c.fillStyle = '#E7EAE3';
    c.fillRect(0, 0, px, px);
    var pad = 18, n = level.size, size = (px - pad * 2) / n;
    c.fillStyle = '#16333B';
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (solutionCell(level, x, y)) c.fillRect(pad + x * size, pad + y * size, size + 0.4, size + 0.4);
      }
    }
  }

  function setMode(mode) {
    game.mode = mode;
    var btns = document.querySelectorAll('.mode');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].dataset.mode === mode;
      btns[i].classList.toggle('is-on', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function show(which) {
    el('home').hidden = which !== 'home';
    el('game').hidden = which !== 'game';
    el('stats').hidden = which !== 'stats';
    el('win').hidden = true;
    window.scrollTo(0, 0);
  }

  function goHome() {
    saveRun();
    stopClock();
    disarmHint();
    game = null;
    renderHome();
    show('home');
  }

  /* ---------------- collegamenti ---------------- */

  var board = el('board');
  board.addEventListener('pointerdown', onDown);
  board.addEventListener('pointermove', onMove);
  board.addEventListener('pointerup', onUp);
  board.addEventListener('pointercancel', onUp);
  board.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  document.querySelectorAll('.mode').forEach(function (b) {
    b.addEventListener('click', function () { if (game) setMode(b.dataset.mode); });
  });

  el('btn-back').addEventListener('click', goHome);
  el('btn-gallery').addEventListener('click', goHome);

  el('btn-restart').addEventListener('click', function () {
    if (!game || !confirm('Svuoti il quadro e riparti da zero?')) return;
    if (game.level.generated) {
      store.train.current.g = '';
      store.train.current.t = 0;
      save();
      openTraining();
      return;
    }
    var id = game.level.id;
    delete store.runs[id];
    save();
    openLevel(id);
  });

  el('btn-next').addEventListener('click', function () {
    var which = el('btn-next').dataset.next;
    el('win').hidden = true;
    if (which === 'train') newTraining();
    else if (+which) openLevel(+which);
    else goHome();
  });

  el('btn-stats').addEventListener('click', function () {
    renderStats();
    show('stats');
  });
  el('btn-stats-back').addEventListener('click', function () {
    renderHome();
    show('home');
  });

  el('btn-train').addEventListener('click', newTraining);
  el('btn-train-resume').addEventListener('click', openTraining);

  el('btn-wipe').addEventListener('click', function () {
    if (!confirm('Cancelli tutti i progressi? Non si torna indietro.')) return;
    store = { runs: {}, done: {}, train: { grade: 1, solved: 0 }, log: [], stats: { solved: 0, seconds: 0 } };
    save();
    renderHome();
  });

  window.addEventListener('resize', function () {
    if (game && !el('game').hidden) buildBoard();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { saveRun(); stopClock(); disarmHint(); }
    else if (game && !game.won && !el('game').hidden) { startClock(); armHint(); }
  });

  window.addEventListener('pagehide', saveRun);

  /* ---------------- aggiunta alla schermata Home ----------------
     Due mondi diversi. Su Android e desktop Chromium il browser avvisa che
     l'app e' installabile (evento beforeinstallprompt): mettiamo da parte
     l'avviso e lo rigiochiamo quando l'utente tocca il pulsante, cosi'
     l'installazione e' vera. Su iPhone quell'evento non esiste: Safari non
     l'ha mai implementato e non c'e' nessuna API per aggiungere una
     scorciatoia. Li' il pulsante puo' solo spiegare dove toccare. */

  var deferredPrompt = null;

  function isStandalone() {
    var mm = window.matchMedia && window.matchMedia('(display-mode: standalone)');
    return (mm && mm.matches) || window.navigator.standalone === true;
  }

  function isIOS() {
    var ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    // l'iPad recente si dichiara un Mac: lo si riconosce dal touch
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  }

  function isIOSSafari() {
    // dentro Instagram, Facebook, Chrome o Firefox su iOS la voce
    // "Aggiungi a Home" non c'e' proprio
    return isIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS|FBAN|FBAV|Instagram|Line\//.test(navigator.userAgent);
  }

  function refreshInstall() {
    var box = el('install');
    if (isStandalone()) { box.hidden = true; return; }

    if (deferredPrompt) {
      el('install-msg').textContent = 'Installalo: parte a schermo intero e funziona anche senza rete.';
      el('btn-install').textContent = 'Installa il gioco';
      box.hidden = false;
    } else if (isIOS()) {
      el('install-msg').textContent = 'Mettilo nella schermata Home: parte a schermo intero e funziona anche senza rete.';
      el('btn-install').textContent = 'Aggiungi alla Home';
      box.hidden = false;
    } else {
      box.hidden = true;
    }
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    refreshInstall();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    el('install').hidden = true;
  });

  el('btn-install').addEventListener('click', function () {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        refreshInstall();
      });
      return;
    }
    el('ios-safari').hidden = isIOSSafari() ? false : true;
    el('ios-other').hidden = isIOSSafari() ? true : false;
    el('sheet').hidden = false;
  });

  el('btn-sheet-close').addEventListener('click', function () {
    el('sheet').hidden = true;
  });

  /* ---------------- avvio ---------------- */

  renderHome();
  show('home');
  refreshInstall();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
