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
      return s;
    } catch (e) {
      return { runs: {}, done: {} };
    }
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  }

  function saveRun() {
    if (!game || game.won) return;
    store.runs[game.level.id] = { g: game.grid.join(''), t: game.elapsed };
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
    if (isSolved()) finish();
    else saveRun();
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

  function finish() {
    game.won = true;
    stopClock();
    el('board').classList.add('is-locked');

    // le caselle segnate spariscono: resta solo il disegno
    for (var i = 0; i < game.grid.length; i++) {
      if (game.grid[i] === MARK) {
        game.grid[i] = EMPTY;
        game.cells[i].dataset.state = EMPTY;
      }
    }

    var id = game.level.id;
    var best = store.done[id];
    if (typeof best !== 'number' || game.elapsed < best) store.done[id] = game.elapsed;
    delete store.runs[id];
    save();

    if (navigator.vibrate) navigator.vibrate([18, 60, 18]);

    el('win-name').textContent = game.level.name;
    el('win-time').textContent = 'Risolto in ' + mmss(game.elapsed);
    drawWinArt(game.level);

    var next = nextUnsolved(id);
    el('btn-next').hidden = !next;
    el('btn-next').dataset.next = next || '';

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
    el('win').hidden = true;
    window.scrollTo(0, 0);
  }

  function goHome() {
    saveRun();
    stopClock();
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
    var id = game.level.id;
    delete store.runs[id];
    save();
    openLevel(id);
  });

  el('btn-next').addEventListener('click', function () {
    var id = +el('btn-next').dataset.next;
    el('win').hidden = true;
    if (id) openLevel(id); else goHome();
  });

  el('btn-wipe').addEventListener('click', function () {
    if (!confirm('Cancelli tutti i progressi? Non si torna indietro.')) return;
    store = { runs: {}, done: {} };
    save();
    renderHome();
  });

  window.addEventListener('resize', function () {
    if (game && !el('game').hidden) buildBoard();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { saveRun(); stopClock(); }
    else if (game && !game.won && !el('game').hidden) startClock();
  });

  window.addEventListener('pagehide', saveRun);

  /* ---------------- avvio ---------------- */

  renderHome();
  show('home');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
