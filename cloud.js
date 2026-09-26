/* Quadretti - classifica del quadro del giorno.
   Parla con Supabase via richieste HTTP semplici: nessuna libreria da
   scaricare, cosi' il gioco resta autosufficiente e continua a funzionare
   offline.

   Regola di fondo: la classifica e' un di piu'. Se il server dorme, se non
   c'e' rete, se la chiamata va storta, qui dentro non deve MAI uscire un
   errore che blocchi la partita. Ogni funzione restituisce null e amen. */

var Cloud = (function () {
  'use strict';

  // ------------------------------------------------------------------
  // Indirizzo e chiave del progetto Supabase.
  // La chiave "publishable" e' pensata per stare dentro una pagina web:
  // e' pubblica per definizione e non da' accesso a niente che le regole
  // del database non consentano gia' a chiunque.
  // ------------------------------------------------------------------
  var URL = 'https://qzzgtjpnswnpsbjvlpzr.supabase.co';
  var KEY = 'sb_publishable_sTNlFg45QhjH78kFLxHpTQ_IFhbDILj';

  var TABLE = '/rest/v1/daily_times';
  var TIMEOUT = 6000;      // un server addormentato non deve piantare lo schermo

  function headers(extra) {
    var h = {
      'apikey': KEY,
      'Authorization': 'Bearer ' + KEY,
      'Content-Type': 'application/json'
    };
    for (var k in extra) if (extra.hasOwnProperty(k)) h[k] = extra[k];
    return h;
  }

  function ask(path, options) {
    if (!URL || !KEY) return Promise.resolve(null);

    var stop = null;
    var signal;
    try {
      var ctrl = new AbortController();
      signal = ctrl.signal;
      stop = setTimeout(function () { ctrl.abort(); }, TIMEOUT);
    } catch (e) { /* browser senza AbortController: pazienza */ }

    var conf = { method: options.method || 'GET', headers: options.headers };
    if (options.body) conf.body = options.body;
    if (signal) conf.signal = signal;

    return fetch(URL + path, conf)
      .then(function (res) {
        if (stop) clearTimeout(stop);
        return res;
      })
      .catch(function () {
        if (stop) clearTimeout(stop);
        return null;
      });
  }

  /* Numero totale di righe, letto dall'intestazione Content-Range che
     Supabase manda quando gli si chiede il conteggio: "0-4/37". */
  function totalFrom(res) {
    try {
      var r = res.headers.get('content-range');
      if (!r) return null;
      var n = r.split('/')[1];
      return n === '*' ? null : parseInt(n, 10);
    } catch (e) {
      return null;
    }
  }

  return {
    configured: function () { return !!(URL && KEY); },

    /* Manda il proprio tempo. Restituisce 'ok', 'gia' se per quel giorno
       c'era gia' una riga di questa persona, oppure null se non si e'
       riusciti a parlare col server. */
    send: function (day, clientId, name, seconds) {
      return ask(TABLE, {
        method: 'POST',
        headers: headers({ 'Prefer': 'return=minimal' }),
        body: JSON.stringify([{
          day: day,
          client_id: clientId,
          name: String(name).trim().slice(0, 20),
          seconds: seconds
        }])
      }).then(function (res) {
        if (!res) return null;
        if (res.status === 409) return 'gia';      // una riga sola per giorno
        return res.ok ? 'ok' : null;
      });
    },

    /* Classifica del giorno: i primi cinque, quanti hanno giocato e quanti
       sono stati piu' veloci del tempo passato. */
    board: function (day, seconds) {
      var q = '?day=eq.' + encodeURIComponent(day);

      var top = ask(TABLE + q + '&select=name,seconds&order=seconds.asc&limit=5', {
        headers: headers({ 'Prefer': 'count=exact', 'Range': '0-4' })
      }).then(function (res) {
        if (!res || !res.ok) return null;
        return res.json().then(function (rows) {
          return { rows: rows, total: totalFrom(res) };
        }).catch(function () { return null; });
      });

      var faster = (typeof seconds === 'number')
        ? ask(TABLE + q + '&seconds=lt.' + seconds + '&select=id', {
            headers: headers({ 'Prefer': 'count=exact', 'Range': '0-0' })
          }).then(function (res) {
            return (res && res.ok) ? totalFrom(res) : null;
          })
        : Promise.resolve(null);

      return Promise.all([top, faster]).then(function (out) {
        if (!out[0]) return null;
        return {
          rows: out[0].rows || [],
          total: out[0].total,
          faster: out[1]
        };
      }).catch(function () { return null; });
    }
  };
})();
