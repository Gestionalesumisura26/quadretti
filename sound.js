/* Quadretti - suoni.
   Niente file audio: le note si generano sul momento con Web Audio, cosi'
   l'app resta leggera e funziona offline. Suoni cortissimi e sommessi:
   su una griglia da cento caselle, un rumore invadente diventa una tortura.

   Nota su iPhone: il contesto audio va creato e risvegliato dentro un
   gesto dell'utente, altrimenti Safari lo tiene muto. Per questo si accende
   al primo tocco e non al caricamento della pagina. */

var Sfx = (function () {
  'use strict';

  var ctx = null;
  var on = true;

  function wake() {
    if (!on) return null;
    try {
      if (!ctx) {
        var Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        ctx = new Ctor();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) {
      return null;
    }
  }

  /* Una nota sola: attacco immediato, spegnimento rapido.
     durata in secondi, volume fra 0 e 1. */
  function note(freq, when, length, volume, shape) {
    var c = ctx;
    var osc = c.createOscillator();
    var gain = c.createGain();

    osc.type = shape || 'triangle';
    osc.frequency.setValueAtTime(freq, when);

    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length);

    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(when);
    osc.stop(when + length + 0.02);
  }

  function play(list) {
    var c = wake();
    if (!c) return;
    var t = c.currentTime;
    for (var i = 0; i < list.length; i++) {
      note(list[i].f, t + (list[i].d || 0), list[i].l || 0.06, list[i].v || 0.05, list[i].s);
    }
  }

  return {
    setEnabled: function (v) { on = !!v; },
    isEnabled: function () { return on; },

    // tocco: riempire ha una nota piu' alta di cancellare
    fill:  function () { play([{ f: 620, l: 0.05, v: 0.05 }]); },
    erase: function () { play([{ f: 380, l: 0.05, v: 0.04 }]); },
    mark:  function () { play([{ f: 500, l: 0.04, v: 0.035, s: 'sine' }]); },

    // una riga o una colonna torna: due note che salgono
    line: function () {
      play([
        { f: 700, l: 0.07, v: 0.045 },
        { f: 1050, l: 0.10, v: 0.04, d: 0.07 }
      ]);
    },

    // quadro finito
    win: function () {
      play([
        { f: 523, l: 0.14, v: 0.06, d: 0 },
        { f: 659, l: 0.14, v: 0.06, d: 0.11 },
        { f: 784, l: 0.16, v: 0.06, d: 0.22 },
        { f: 1047, l: 0.34, v: 0.07, d: 0.33 }
      ]);
    },

    // errore segnalato dai suggerimenti
    warn: function () {
      play([
        { f: 300, l: 0.12, v: 0.05, s: 'sine' },
        { f: 240, l: 0.16, v: 0.05, s: 'sine', d: 0.1 }
      ]);
    }
  };
})();
