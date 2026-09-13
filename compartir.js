/* Rólala con la banda.
 *
 * Un solo archivo para los tres sitios: el original vive en comun/compartir.js
 * y deploy.sh lo copia a cada carpeta. Si le mueves, muévele AQUÍ.
 *
 * Se pinta dentro de un <div id="compartir" data-app="escribe|edita|portal">.
 * El data-app decide el recado, porque no es lo mismo recomendar la app donde
 * escribes que la app donde editas, y el compa que recibe el mensaje merece
 * saber a cuál lo están mandando.
 *
 * Los colores no se declaran: todo va con currentColor, así el bloque se pinta
 * igual en el fondo negro de las apps que en el crema de Edita Sobrio.
 *
 * Con data-flotante="si" no se queda en el flujo de la página: se vuelve una
 * pestañita fija en la esquina que se abre al picarle. Eso es para el portal,
 * que es de una sola pantalla y ahí abajo estorbaba. Flotando sí se pinta de
 * rojo, porque pasa encima de los dos paneles —uno negro y uno crema— y
 * currentColor no puede quedar bien en los dos al mismo tiempo.
 */
(function () {
  'use strict';

  var CAJA = document.getElementById('compartir');
  if (!CAJA) return;

  var APPS = {
    escribe: {
      titulo: 'Rólala con la banda',
      liga: 'https://escribeborracho.elaletz.com',
      recado: 'Compa, vi esta app que está bien chida, a ti que te gusta escribir: ' +
              'pruébale a Escribe Borracho, te pone a teclear sin parar y si te detienes ' +
              'tres segundos lo pierdes todo. Rólala con la banda. Además es gratis, wei.'
    },
    edita: {
      titulo: 'Rólala con la banda',
      liga: 'https://editasobrio.elaletz.com',
      recado: 'Compa, vi esta app que está bien chida, a ti que te gusta escribir: ' +
              'pruébale a Edita Sobrio, te marca tus clichés, tus muletillas y todas ' +
              'tus mañas de escritura. Rólala con la banda. Además es gratis, wei.'
    },
    portal: {
      titulo: 'Rólalas con la banda',
      liga: 'https://apps.elaletz.com',
      recado: 'Compa, vi estas apps que están bien chidas, a ti que te gusta escribir: ' +
              'Escribe Borracho para sacar el borrador sin pensarle, y Edita Sobrio para ' +
              'limpiarlo ya en frío. Rólalas con la banda. Además son gratis, wei.'
    }
  };

  var app = APPS[CAJA.getAttribute('data-app')] || APPS.portal;
  var COMPLETO = app.recado + '\n' + app.liga;
  var FLOTA = CAJA.getAttribute('data-flotante') === 'si';

  var ESTILOS = [
    '.compartir{display:flex;flex-direction:column;gap:9px}',
    '.compartir__titulo{',
    '  font-family:"Special Elite",Courier,monospace;font-weight:400;',
    '  font-size:15px;letter-spacing:2px;text-transform:uppercase;',
    '  margin:0;color:inherit;',
    '}',
    '.compartir__nota{font-size:12px;line-height:1.6;margin:0;opacity:.7}',
    '.compartir__botones{display:flex;gap:9px;flex-wrap:wrap}',
    '.compartir__boton{',
    '  font-family:"Courier Prime",Courier,monospace;font-size:13px;',
    '  padding:7px 13px;cursor:pointer;white-space:nowrap;',
    '  background:transparent;color:inherit;text-decoration:none;',
    '  border:2px dashed currentColor;opacity:.72;',
    '}',
    '.compartir__boton:hover{opacity:1;background:rgba(128,128,128,.2)}',
    '.compartir__boton:focus-visible{outline:2px solid currentColor;outline-offset:2px}',

    /* ---- de pestañita en la esquina ---- */
    '.compartir--flota{',
    '  position:fixed;right:18px;bottom:18px;z-index:400;',
    '  align-items:flex-end;gap:10px;',
    '}',
    '.compartir--flota .compartir__panel{',
    '  display:none;flex-direction:column;gap:8px;',
    '  background:#c93a32;color:#f2ede3;',
    '  padding:15px 17px;max-width:310px;',
    '  box-shadow:0 4px 0 rgba(20,17,14,.28);',
    '}',
    '.compartir--flota.compartir--abierto .compartir__panel{display:flex}',
    '.compartir--flota .compartir__boton{opacity:.9}',
    '.compartir--flota .compartir__boton:hover{opacity:1;background:rgba(242,237,227,.18)}',
    '.compartir__pestana{',
    '  font-family:"Special Elite",Courier,monospace;font-size:15px;',
    '  letter-spacing:2px;text-transform:uppercase;',
    '  background:#c93a32;color:#f2ede3;cursor:pointer;',
    /* Borde crema: en el portal la pestaña cae encima de la franja roja de la
       cita y sin esto se camufla con ella. */
    '  border:2px dashed rgba(242,237,227,.6);',
    '  padding:10px 17px;box-shadow:0 3px 0 rgba(20,17,14,.28);',
    '}',
    '.compartir__pestana:hover{background:#e0564d}',
    '.compartir__pestana:focus-visible{outline:2px solid #f2ede3;outline-offset:3px}',
    '@media (max-width:520px){',
    '  .compartir--flota{right:12px;bottom:12px;left:12px;align-items:stretch}',
    '  .compartir--flota .compartir__panel{max-width:none}',
    '}'
  ].join('\n');

  var hoja = document.createElement('style');
  hoja.textContent = ESTILOS;
  document.head.appendChild(hoja);

  CAJA.className = 'compartir';

  var titulo = document.createElement('p');
  titulo.className = 'compartir__titulo';
  titulo.textContent = app.titulo;

  var nota = document.createElement('p');
  nota.className = 'compartir__nota';
  nota.textContent = 'El recado ya va escrito. Nada más escoge a quién.';

  var botones = document.createElement('div');
  botones.className = 'compartir__botones';

  // El truco del textarea de toda la vida, para cuando no hay API o cuando la
  // hay pero el navegador la niega.
  function copiarALaMala(texto) {
    var t = document.createElement('textarea');
    t.value = texto;
    t.setAttribute('readonly', '');
    t.style.position = 'fixed';
    t.style.top = '0';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    var listo = false;
    try { listo = document.execCommand('copy'); } catch (e) { listo = false; }
    document.body.removeChild(t);
    return listo;
  }

  // Ojo: no basta con preguntar si existe navigator.clipboard. Safari y varios
  // navegadores con el permiso apagado lo tienen y aun así truenan al usarlo,
  // así que si la promesa se cae, todavía intentamos a la antigüita.
  function copiar(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).catch(function () {
        return copiarALaMala(texto) ? undefined : Promise.reject(new Error('no se pudo'));
      });
    }
    return copiarALaMala(texto)
      ? Promise.resolve()
      : Promise.reject(new Error('no se pudo'));
  }

  function decirYVolver(boton, dice) {
    var antes = boton.textContent;
    boton.textContent = dice;
    setTimeout(function () { boton.textContent = antes; }, 2400);
  }

  function agregarBoton(texto, alClic) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'compartir__boton';
    b.textContent = texto;
    b.addEventListener('click', function () { alClic(b); });
    botones.appendChild(b);
    return b;
  }

  // WhatsApp sí se lleva el recado completo: abre la lista de contactos con el
  // mensaje ya puesto.
  var wa = document.createElement('a');
  wa.className = 'compartir__boton';
  wa.href = 'https://wa.me/?text=' + encodeURIComponent(COMPLETO);
  wa.target = '_blank';
  wa.rel = 'noopener noreferrer';
  wa.textContent = 'whatsapp';
  botones.appendChild(wa);

  // Facebook, en cambio, hace años que tira cualquier texto que le mandes: sólo
  // acepta la liga. Así que antes de abrirlo le copiamos el recado al
  // portapapeles y se lo decimos, para que nada más lo pegue.
  agregarBoton('facebook', function (boton) {
    var abrir = function () {
      window.open(
        'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(app.liga),
        '_blank', 'noopener,noreferrer'
      );
    };
    copiar(COMPLETO).then(function () {
      decirYVolver(boton, 'recado copiado — pégalo allá');
      abrir();
    }, function () {
      abrir();
    });
  });

  // Telegram, Messenger, Signal, mensajes, correo: lo que el teléfono tenga.
  // Sólo sale si el navegador de verdad lo puede hacer.
  if (navigator.share) {
    agregarBoton('otro lado', function () {
      navigator.share({ text: app.recado, url: app.liga }).catch(function () {
        /* le picó y se arrepintió: no pasa nada */
      });
    });
  }

  agregarBoton('copiar recado', function (boton) {
    copiar(COMPLETO).then(function () {
      decirYVolver(boton, '¡copiado! ya pégalo');
    }, function () {
      decirYVolver(boton, 'no se dejó copiar');
    });
  });

  if (!FLOTA) {
    CAJA.appendChild(titulo);
    CAJA.appendChild(nota);
    CAJA.appendChild(botones);
    return;
  }

  /* ---------------- de pestañita ---------------- */

  CAJA.className += ' compartir--flota';

  var panel = document.createElement('div');
  panel.className = 'compartir__panel';
  panel.id = 'compartir-panel';
  panel.appendChild(titulo);
  panel.appendChild(nota);
  panel.appendChild(botones);

  var pestana = document.createElement('button');
  pestana.type = 'button';
  pestana.className = 'compartir__pestana';
  pestana.setAttribute('aria-expanded', 'false');
  pestana.setAttribute('aria-controls', 'compartir-panel');
  pestana.textContent = 'rólala ↗';

  function abrir(si) {
    CAJA.classList.toggle('compartir--abierto', si);
    pestana.setAttribute('aria-expanded', si ? 'true' : 'false');
    pestana.textContent = si ? 'rólala ✕' : 'rólala ↗';
  }

  pestana.addEventListener('click', function () {
    abrir(!CAJA.classList.contains('compartir--abierto'));
  });

  // Picarle afuera o darle escape la cierra: es un menú, no un anuncio.
  document.addEventListener('click', function (ev) {
    if (!CAJA.contains(ev.target)) abrir(false);
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && CAJA.classList.contains('compartir--abierto')) {
      abrir(false);
      pestana.focus();
    }
  });

  CAJA.appendChild(panel);
  CAJA.appendChild(pestana);
})();
