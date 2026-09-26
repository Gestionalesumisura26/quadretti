"""Definisce i disegni dei livelli, calcola gli indizi e verifica che ogni
puzzle abbia una e una sola soluzione. Scrive js/levels.js."""

import json
import sys
from functools import lru_cache
from itertools import combinations


def clues_for(line):
    out, run = [], 0
    for c in line:
        if c:
            run += 1
        elif run:
            out.append(run)
            run = 0
    if run:
        out.append(run)
    return out or [0]


def line_candidates(clue, n):
    """Tutte le disposizioni possibili di una riga lunga n dati gli indizi."""
    clue = tuple(c for c in clue if c)
    res = []

    def place(i, pos, acc):
        if i == len(clue):
            res.append(tuple(acc + [0] * (n - len(acc))))
            return
        need = sum(clue[i:]) + (len(clue) - i - 1)
        for start in range(pos, n - need + 1):
            block = [0] * (start - len(acc)) + [1] * clue[i]
            nxt = start + clue[i]
            tail = [0] if i < len(clue) - 1 else []
            place(i + 1, nxt + 1, acc + block + tail)

    place(0, 0, [])
    return res


def count_solutions(row_clues, col_clues, limit=2):
    """Conta le soluzioni (fino a `limit`) con DFS riga per riga e potatura
    sulle colonne."""
    h, w = len(row_clues), len(col_clues)
    cands = [line_candidates(c, w) for c in row_clues]
    if any(not c for c in cands):
        return 0

    col_opts = [line_candidates(c, h) for c in col_clues]
    # prefissi ammessi per ogni colonna
    col_prefix = []
    for opts in col_opts:
        s = set()
        for o in opts:
            for i in range(h + 1):
                s.add(o[:i])
        col_prefix.append(s)

    found = 0
    grid = []

    def dfs(r):
        nonlocal found
        if found >= limit:
            return
        if r == h:
            found += 1
            return
        for cand in cands[r]:
            grid.append(cand)
            ok = True
            for c in range(w):
                pref = tuple(grid[i][c] for i in range(r + 1))
                if pref not in col_prefix[c]:
                    ok = False
                    break
            if ok:
                dfs(r + 1)
            grid.pop()
            if found >= limit:
                return

    dfs(0)
    return found


def make(name, art):
    rows = [r for r in art.strip("\n").split("\n")]
    grid = [[1 if ch in "#X" else 0 for ch in r] for r in rows]
    h, w = len(grid), len(grid[0])
    assert all(len(r) == w for r in grid), f"{name}: righe di lunghezza diversa"
    rc = [clues_for(r) for r in grid]
    cc = [clues_for([grid[y][x] for y in range(h)]) for x in range(w)]
    n = count_solutions(rc, cc)
    return {
        "name": name,
        "size": w,
        "rows": rc,
        "cols": cc,
        "solution": ["".join(str(v) for v in r) for r in grid],
        "_unique": n == 1,
        "_count": n,
    }


SMALL = [
    ("Cuore", """
.X.X.
XXXXX
XXXXX
.XXX.
..X..
"""),
    ("Freccia", """
..X..
.XXX.
XXXXX
..X..
..X..
"""),
    ("Casa", """
..X..
.XXX.
XXXXX
XX.XX
XX.XX
"""),
    ("Croce", """
.XXX.
.X.X.
XXXXX
.X.X.
.XXX.
"""),
    ("Vela", """
...X.
..XX.
.XXX.
XXXXX
.XXX.
"""),
    ("Chiave", """
.XXX.
.X.X.
.XXX.
..X..
..XXX
"""),
    ("Luna", """
..XX.
.XX..
XX...
.XX..
..XX.
"""),
    ("Clessidra", """
XXXXX
.XXX.
..X..
.XXX.
XXXXX
"""),
    ("Dado", """
XXXXX
X.X.X
XXXXX
X.X.X
XXXXX
"""),
]

BIG = [
    ("Gatto", """
.X......X.
.XX....XX.
.XXXXXXXX.
XXXXXXXXXX
XX.XXXX.XX
XXXXXXXXXX
XXX.XX.XXX
XXXXXXXXXX
.XXXXXXXX.
..XX..XX..
"""),
    ("Ancora", """
....XX....
...X..X...
...X..X...
....XX....
..XXXXXX..
....XX....
X...XX...X
X...XX...X
XX.XXXX.XX
.XXXXXXXX.
"""),
    ("Fungo", """
...XXXX...
..XXXXXX..
.XXXXXXXX.
XXXXXXXXXX
XXXXXXXXXX
.XXXXXXXX.
....XX....
....XX....
...XXXX...
..XXXXXX..
"""),
    ("Pesce", """
..........
...XXXX..X
..XXXXXX.X
.XXX.XXXXX
XXXXXXXXXX
.XXXXXXXXX
..XXXXXX.X
...XXXX..X
..........
..........
"""),
    ("Nota", """
....XXXXXX
....XXXXXX
....X....X
....X....X
....X....X
....X....X
.XXXX..XXX
XXXXX.XXXX
XXXXX.XXXX
.XXX...XX.
"""),
    ("Tazza", """
..X..X....
..X..X....
..........
XXXXXXX...
X.....XXX.
X.....X.X.
X.....XXX.
X.....X...
.XXXXX....
..........
"""),
    ("Barca", """
..........
....X.....
....XX....
....XXX...
....XXXX..
....X.....
XXXXXXXXXX
.XXXXXXXX.
..XXXXXX..
..........
"""),
    ("Teschio", """
..XXXXXX..
.XXXXXXXX.
XXXXXXXXXX
XX.XXXX.XX
XX.XXXX.XX
XXXXXXXXXX
XXXX..XXXX
XXXXXXXXXX
.XXXXXXXX.
..X.XX.X..
"""),
    ("Albero", """
....XX....
...XXXX...
..XXXXXX..
.XXXXXXXX.
...XXXX...
..XXXXXX..
.XXXXXXXX.
XXXXXXXXXX
....XX....
...XXXX...
"""),
]

levels = []
for name, art in SMALL + BIG:
    lv = make(name, art)
    flag = "OK " if lv["_unique"] else f"AMBIGUO ({lv['_count']}+)"
    print(f"{flag:16} {lv['size']}x{lv['size']}  {name}")
    levels.append(lv)

good = [l for l in levels if l["_unique"]]
print(f"\nUnivoci: {len(good)}/{len(levels)}")
assert len(good) == len(levels), "ci sono livelli ambigui: correggere i disegni"

out = []
for i, l in enumerate(good):
    out.append({
        "id": i + 1,
        "name": l["name"],
        "size": l["size"],
        "rows": l["rows"],
        "cols": l["cols"],
        "solution": l["solution"],
    })

body = ",\n".join(
    "  " + json.dumps(o, ensure_ascii=False, separators=(", ", ": ")) for o in out
)
js = ("// Livelli di Quadretti. Ogni puzzle e' stato verificato: ammette una sola\n"
      "// soluzione, quindi si risolve sempre per deduzione, mai a tentativi.\n"
      "// Generato da build_levels.py - non modificare a mano.\n\n"
      "const LEVELS = [\n" + body + "\n];\n")
open("/home/claude/quadretti/levels.js", "w").write(js)
print(f"Scritti {len(out)} livelli in quadretti/levels.js")
