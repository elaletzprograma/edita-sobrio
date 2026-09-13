/* Edita Sobrio — etapa 02
 *
 * La interfaz. El análisis de verdad lo hace la API (spaCy leyendo la oración
 * completa); aquí sólo pedimos, pintamos y dejamos editar.
 *
 * Un detalle que importa: los interruptores de la barra NO vuelven a pedir el
 * análisis. La API devuelve todas las marcas de un jalón y aquí nomás se
 * filtran, así prender y apagar es instantáneo.
 */
(function () {
  'use strict';

  var API = (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
    ? 'http://127.0.0.1:8600/api'
    : '/api';

  // Un color por vicio. Orden = orden en la barra lateral.
  var CATS = [
    { k: 'mania',  etiqueta: 'Mis mañas',                     color: '#2f7f83', porDefecto: true  },
    { k: 'mente',  etiqueta: 'Adverbios en -mente',            color: '#3f8f5f', porDefecto: true  },
    { k: 'adj',    etiqueta: 'Adjetivos',                      color: '#d16a62', porDefecto: true  },
    { k: 'rep',    etiqueta: 'Repeticiones totales',           color: '#d9962e', porDefecto: true  },
    { k: 'rima',   etiqueta: 'Rimas parciales',                color: '#bfa437', porDefecto: true  },
    { k: 'peri',   etiqueta: 'Perífrasis (gerundios/dobles)',  color: '#8b6fae', porDefecto: true  },
    { k: 'pret',   etiqueta: 'Pretérito compuesto',            color: '#5b84b1', porDefecto: false },
    { k: 'cliche', etiqueta: 'Frases hechas / clichés',        color: '#b8443c', porDefecto: true  },
    { k: 'dim',    etiqueta: 'Diminutivos y superlativos',     color: '#a3785a', porDefecto: true  },
  ];

  // Cuando dos marcas se encinan, gana la de arriba.
  var PRIORIDAD = { mania: 0, cliche: 1, mente: 2, pret: 3, peri: 4, dim: 5,
                    rep: 6, rima: 7, adj: 8 };

  var LLAVE_TEXTO = 'es.texto';
  var LLAVE_OPCIONES = 'es.opciones';
  var LLAVE_MANIAS = 'es.manias';
  var MAXIMO_MANIAS = 300;
  var MAXIMO_LARGO = 120;

  function guardar(l, v) { try { localStorage.setItem(l, v); } catch (e) {} }
  function leer(l) { try { return localStorage.getItem(l); } catch (e) { return null; } }
  function borrar(l) { try { localStorage.removeItem(l); } catch (e) {} }

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    lateral: $('lateral'), opciones: $('btn-opciones'), vicios: $('vicios'),
    banco: $('banco'), btnBanco: $('btn-banco'),
    aviso: $('aviso'),
    entrada: $('pantalla-entrada'), texto: $('texto'), analizar: $('btn-analizar'),
    resultados: $('pantalla-resultados'), leyenda: $('leyenda'), anotado: $('anotado'),
    pie: $('pie'), editar: $('btn-editar'), pdf: $('btn-pdf'), limpiar: $('btn-limpiar'),
    formaMania: $('forma-mania'), fraseMania: $('mania-frase'),
    listaManias: $('manias'), errorMania: $('mania-error'),
    bajarManias: $('btn-bajar-manias'), subirManias: $('btn-subir-manias'),
    archivoManias: $('archivo-manias')
  };

  var estado = {
    texto: '',
    marcas: [],          // lo último que devolvió el analizador
    textoAnalizado: '',  // a qué texto corresponden esas marcas
    activas: {},
    editando: false,
    motor: 'spacy',
    pidiendo: false,
    manias: []                     // puras cadenas, guardadas en este navegador
  };

  /* ---------------- opciones ---------------- */

  (function cargarOpciones() {
    var guardadas = {};
    try { guardadas = JSON.parse(leer(LLAVE_OPCIONES) || '{}') || {}; } catch (e) {}
    CATS.forEach(function (c) {
      estado.activas[c.k] = (typeof guardadas[c.k] === 'boolean') ? guardadas[c.k] : c.porDefecto;
    });
  })();

  function guardarOpciones() {
    guardar(LLAVE_OPCIONES, JSON.stringify(estado.activas));
  }

  function pintarOpciones() {
    el.vicios.innerHTML = '';
    CATS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'vicio';
      b.setAttribute('role', 'checkbox');
      b.setAttribute('aria-checked', estado.activas[c.k] ? 'true' : 'false');
      b.dataset.cat = c.k;

      var caja = document.createElement('span');
      caja.className = 'vicio__caja';
      caja.textContent = estado.activas[c.k] ? '✕' : '';

      var nombre = document.createElement('span');
      nombre.className = 'vicio__nombre';
      nombre.style.setProperty('--tono', c.color + '88');
      nombre.textContent = c.etiqueta;

      b.appendChild(caja);
      b.appendChild(nombre);
      el.vicios.appendChild(b);
    });
  }

  el.vicios.addEventListener('click', function (ev) {
    var boton = ev.target.closest('.vicio');
    if (!boton) return;
    var cat = boton.dataset.cat;
    estado.activas[cat] = !estado.activas[cat];
    guardarOpciones();
    pintarOpciones();

    if (!el.resultados.hidden) pintarResultados();   // filtrar lo que ya está: instantáneo
  });

  /* ---------------- avisos ---------------- */

  function avisar(mensaje, textoBoton, alDarClic) {
    el.aviso.innerHTML = '';
    var t = document.createElement('span');
    t.textContent = mensaje;
    el.aviso.appendChild(t);
    if (textoBoton) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = textoBoton;
      b.addEventListener('click', alDarClic);
      el.aviso.appendChild(b);
    }
    el.aviso.hidden = false;
  }

  function callar() { el.aviso.hidden = true; }

  /* ---------------- el análisis ---------------- */

  function api(ruta, opciones) {
    opciones = opciones || {};
    var control = new AbortController();
    var reloj = setTimeout(function () { control.abort(); }, 30000);
    return fetch(API + ruta, {
      method: opciones.metodo || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
      signal: control.signal
    }).then(function (r) {
      clearTimeout(reloj);
      return r.json().catch(function () { return {}; }).then(function (datos) {
        if (!r.ok) {
          // El servidor manda el motivo en "detail"; ése es el que sirve mostrar.
          var falla = new Error(datos.detail || ('HTTP ' + r.status));
          falla.codigo = r.status;
          throw falla;
        }
        return datos;
      });
    });
  }

  function pedirAlServidor(texto) {
    return api('/analizar', {
      metodo: 'POST',
      cuerpo: { texto: texto, manias: estado.manias }
    });
  }

  var cliches = null;

  function traerCliches() {
    if (cliches) return Promise.resolve(cliches);
    return fetch('cliches.json')
      .then(function (r) { return r.json(); })
      .then(function (d) { cliches = d.frases || []; return cliches; })
      .catch(function () { cliches = []; return cliches; });
  }

  function analizarLocalmente(texto) {
    return traerCliches().then(function (frases) {
      estado.marcas = window.MotorLocal.analizar(texto, frases, estado.manias);
      estado.textoAnalizado = texto;
      estado.traeOrto = false;
      estado.motor = 'local';
      avisar('El analizador no contestó, así que revisé aquí mismo en tu navegador. ' +
             'En este modo no marco adjetivos: eso necesita el análisis gramatical ' +
             'del servidor. Tus mañas sí siguen marcándose.',
             'reintentar', function () { analizar(); });
      pintarResultados();
    });
  }

  function analizar(opciones) {
    opciones = opciones || {};
    var texto = estado.texto;
    if (!texto.trim() || estado.pidiendo) return;

    estado.pidiendo = true;
    if (!opciones.silencioso) {
      el.analizar.disabled = true;
      el.analizar.textContent = 'Analizando…';
    }

    pedirAlServidor(texto).then(function (datos) {
      estado.marcas = datos.marcas || [];
      estado.textoAnalizado = texto;
      estado.motor = datos.motor || 'spacy';
      callar();
      pintarResultados();
    }).catch(function () {
      return analizarLocalmente(texto);
    }).then(function () {
      estado.pidiendo = false;
      el.analizar.disabled = false;
      el.analizar.textContent = 'Analizar';
    });
  }

  /* ---------------- pintar el resultado ---------------- */

  function color(k) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].k === k) return CATS[i].color;
    return '#000';
  }

  function segmentos(texto, marcas) {
    var activas = estado.activas;

    // Las marcas no se pueden encimar: donde dos coinciden, gana la de mayor
    // prioridad y la otra se descarta.
    var elegibles = marcas
      .filter(function (m) { return activas[m.cat]; })
      .sort(function (a, b) {
        return a.ini - b.ini ||
               (PRIORIDAD[a.cat] - PRIORIDAD[b.cat]) ||
               (b.fin - b.ini) - (a.fin - a.ini);
      });

    var firmes = [], hasta = 0;
    elegibles.forEach(function (m) {
      if (m.ini >= hasta && m.fin > m.ini) { firmes.push(m); hasta = m.fin; }
    });

    var salida = [], pos = 0;
    firmes.forEach(function (m) {
      if (m.ini > pos) salida.push({ texto: texto.slice(pos, m.ini), cat: null });
      salida.push({ texto: texto.slice(m.ini, m.fin), cat: m.cat });
      pos = m.fin;
    });
    if (pos < texto.length) salida.push({ texto: texto.slice(pos), cat: null });

    var cuentas = {};
    firmes.forEach(function (m) { cuentas[m.cat] = (cuentas[m.cat] || 0) + 1; });

    return { segmentos: salida, cuentas: cuentas };
  }

  function pintarResultados() {
    var r = segmentos(estado.textoAnalizado, estado.marcas);

    el.anotado.innerHTML = '';
    r.segmentos.forEach(function (s) {
      if (!s.cat) {
        el.anotado.appendChild(document.createTextNode(s.texto));
        return;
      }
      var span = document.createElement('span');
      span.className = 'm';
      span.style.setProperty('--tono', color(s.cat));
      span.style.background = color(s.cat) + '2e';
      span.textContent = s.texto;
      el.anotado.appendChild(span);
    });

    el.leyenda.innerHTML = '';
    var total = 0;
    CATS.forEach(function (c) {
      if (!estado.activas[c.k]) return;
      if (estado.motor === 'local' && c.k === 'adj') return;
      var n = r.cuentas[c.k] || 0;
      total += n;
      var s = document.createElement('span');
      s.style.background = c.color + '2e';
      s.style.boxShadow = 'inset 0 -2px ' + c.color;
      s.textContent = c.etiqueta + ' (' + n + ')';
      el.leyenda.appendChild(s);
    });

    el.pie.textContent = total + (total === 1 ? ' vicio encontrado.' : ' vicios encontrados.') +
                         ' Menos adornos, más verdad.';

    el.entrada.hidden = true;
    el.resultados.hidden = false;
  }

  /* ---------------- entrada ---------------- */

  el.texto.value = leer(LLAVE_TEXTO) || '';
  estado.texto = el.texto.value;

  el.texto.addEventListener('input', function () {
    estado.texto = el.texto.value;
    guardar(LLAVE_TEXTO, estado.texto);
  });

  el.texto.addEventListener('keydown', function (ev) {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
      ev.preventDefault();
      analizar();
    }
  });

  el.analizar.addEventListener('click', function () { analizar(); });

  /* ---------------- editar en vivo ----------------
   * La caja de resultados se vuelve editable y el análisis se rehace solo
   * mientras escribes. Lo peleado es el cursor: al repintar los <span> se
   * pierde, así que lo medimos en caracteres antes y lo reponemos después.
   */

  function posicionDelCursor(caja) {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    var rango = sel.getRangeAt(0);
    if (!caja.contains(rango.startContainer)) return null;
    var previo = rango.cloneRange();
    previo.selectNodeContents(caja);
    previo.setEnd(rango.startContainer, rango.startOffset);
    return previo.toString().length;
  }

  function reponerCursor(caja, posicion) {
    if (posicion === null || posicion === undefined) return;
    var recorrido = document.createTreeWalker(caja, NodeFilter.SHOW_TEXT, null);
    var contado = 0, nodo;
    while ((nodo = recorrido.nextNode())) {
      var largo = nodo.nodeValue.length;
      if (contado + largo >= posicion) {
        var rango = document.createRange();
        rango.setStart(nodo, Math.max(0, posicion - contado));
        rango.collapse(true);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(rango);
        return;
      }
      contado += largo;
    }
    // Si el texto se acortó, al final.
    var r2 = document.createRange();
    r2.selectNodeContents(caja);
    r2.collapse(false);
    var s2 = window.getSelection();
    s2.removeAllRanges();
    s2.addRange(r2);
  }

  var temporizador = null;

  function alEditar() {
    var texto = el.anotado.innerText.replace(/\r\n/g, '\n');
    estado.texto = texto;
    el.texto.value = texto;
    guardar(LLAVE_TEXTO, texto);

    clearTimeout(temporizador);
    temporizador = setTimeout(function () {
      var cursor = posicionDelCursor(el.anotado);
      var promesa = estado.motor === 'local'
        ? analizarLocalmente(texto)
        : (pedirAlServidor(texto).then(function (datos) {
            estado.marcas = datos.marcas || [];
            estado.textoAnalizado = texto;
            pintarResultados();
          }).catch(function () { return analizarLocalmente(texto); }));

      promesa.then(function () {
        if (estado.editando) {
          prenderEdicion(true);
          el.anotado.focus();
          reponerCursor(el.anotado, cursor);
        }
      });
    }, 900);
  }

  function prenderEdicion(encendida) {
    if (encendida) {
      // plaintext-only evita que el navegador meta <div> y <b> al pegar.
      el.anotado.setAttribute('contenteditable', 'plaintext-only');
      if (el.anotado.contentEditable !== 'plaintext-only') {
        el.anotado.setAttribute('contenteditable', 'true');
      }
    } else {
      el.anotado.removeAttribute('contenteditable');
    }
    el.editar.setAttribute('aria-pressed', encendida ? 'true' : 'false');
    el.editar.textContent = encendida ? 'Dejar de editar' : 'Editar en vivo';
  }

  el.editar.addEventListener('click', function () {
    estado.editando = !estado.editando;
    prenderEdicion(estado.editando);
    if (estado.editando) {
      el.anotado.focus();
      el.anotado.addEventListener('input', alEditar);
    } else {
      el.anotado.removeEventListener('input', alEditar);
      clearTimeout(temporizador);
    }
  });

  /* ---------------- PDF ---------------- */

  el.pdf.addEventListener('click', function () {
    var titulo = document.title;
    document.title = 'edita-sobrio-analisis';   // así se llama el PDF por defecto
    window.print();
    setTimeout(function () { document.title = titulo; }, 500);
  });

  /* ---------------- limpiar ---------------- */

  el.limpiar.addEventListener('click', function () {
    estado.texto = '';
    estado.marcas = [];
    estado.textoAnalizado = '';
    estado.editando = false;
    prenderEdicion(false);
    el.anotado.removeEventListener('input', alEditar);
    el.texto.value = '';
    guardar(LLAVE_TEXTO, '');
    callar();
    el.resultados.hidden = true;
    el.entrada.hidden = false;
    el.texto.focus();
  });

  /* ---------------- banco de clichés ---------------- */

  el.btnBanco.addEventListener('click', function () {
    var abierto = !el.banco.hidden;
    if (abierto) {
      el.banco.hidden = true;
      el.btnBanco.textContent = 'Banco de clichés';
      el.btnBanco.setAttribute('aria-expanded', 'false');
      return;
    }
    traerCliches().then(function (frases) {
      el.banco.innerHTML = '';
      frases.forEach(function (f) {
        var d = document.createElement('div');
        d.textContent = f;
        el.banco.appendChild(d);
      });
      el.banco.hidden = false;
      el.btnBanco.textContent = 'Cerrar banco de clichés';
      el.btnBanco.setAttribute('aria-expanded', 'true');
    });
  });

  /* ---------------- barra lateral en celular ---------------- */

  el.opciones.addEventListener('click', function () {
    var abierta = el.lateral.classList.toggle('abierta');
    el.opciones.setAttribute('aria-expanded', abierta ? 'true' : 'false');
  });

  /* ---------------- el banco propio de mañas ----------------
   * Cada quien tiene sus muletillas. Viven en este navegador y viajan con cada
   * análisis: aquí no hay cuentas ni nada que se guarde en el servidor.
   *
   * Como el navegador se puede limpiar, hay copia de respaldo a un .txt.
   */

  function decirError(mensaje) {
    el.errorMania.textContent = mensaje;
    el.errorMania.hidden = !mensaje;
  }

  function guardarManias() {
    guardar(LLAVE_MANIAS, JSON.stringify(estado.manias));
  }

  function cargarManias() {
    var guardadas = [];
    try { guardadas = JSON.parse(leer(LLAVE_MANIAS) || '[]') || []; } catch (e) {}
    estado.manias = guardadas.filter(function (m) { return typeof m === 'string'; });
  }

  function normalizar(frase) {
    return (frase || '').replace(/\s+/g, ' ').trim();
  }

  // Para comparar: sin acentos ni mayúsculas, para no acabar con "sonrió" y
  // "sonrio" apuntadas por separado.
  function comparable(frase) {
    return normalizar(frase).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function yaEstaba(frase) {
    var buscada = comparable(frase);
    return estado.manias.some(function (m) { return comparable(m) === buscada; });
  }

  function agregarManias(frases) {
    var agregadas = 0, ultimoProblema = '';
    frases.forEach(function (cruda) {
      var frase = normalizar(cruda);
      if (!frase) return;
      if (frase.length > MAXIMO_LARGO) {
        ultimoProblema = 'Esa frase está larguísima (máximo ' + MAXIMO_LARGO + ' caracteres).';
        return;
      }
      if (estado.manias.length >= MAXIMO_MANIAS) {
        ultimoProblema = 'Ya tienes ' + MAXIMO_MANIAS + ' mañas apuntadas. Borra alguna.';
        return;
      }
      if (yaEstaba(frase)) {
        ultimoProblema = 'Esa ya la tenías apuntada.';
        return;
      }
      estado.manias.push(frase);
      agregadas++;
    });

    if (agregadas) {
      estado.manias.sort(function (a, b) { return a.localeCompare(b, 'es'); });
      guardarManias();
      pintarManias();
      rehacerSiHayResultados();
    }
    decirError(agregadas ? '' : ultimoProblema);
    return agregadas;
  }

  function quitarMania(frase) {
    estado.manias = estado.manias.filter(function (m) { return m !== frase; });
    guardarManias();
    pintarManias();
    rehacerSiHayResultados();
  }

  function pintarManias() {
    el.listaManias.innerHTML = '';
    if (!estado.manias.length) {
      var vacio = document.createElement('p');
      vacio.className = 'manias__vacio';
      vacio.textContent = 'Todavía no apuntas ninguna. Empieza por esa palabra ' +
                          'que sabes que repites de más.';
      el.listaManias.appendChild(vacio);
      return;
    }
    estado.manias.forEach(function (frase) {
      var fila = document.createElement('div');
      fila.className = 'mania';

      var texto = document.createElement('span');
      texto.textContent = frase;

      var quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.textContent = '✕';
      quitar.title = 'Quitar esta maña';
      quitar.setAttribute('aria-label', 'Quitar ' + frase);
      quitar.addEventListener('click', function () { quitarMania(frase); });

      fila.appendChild(texto);
      fila.appendChild(quitar);
      el.listaManias.appendChild(fila);
    });
  }

  // Si cambian las mañas, el análisis que está en pantalla ya no es fiel.
  function rehacerSiHayResultados() {
    if (!el.resultados.hidden && estado.texto.trim()) analizar({ silencioso: true });
  }

  el.formaMania.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!el.fraseMania.value.trim()) return;
    if (agregarManias([el.fraseMania.value])) el.fraseMania.value = '';
  });

  el.bajarManias.addEventListener('click', function () {
    if (!estado.manias.length) {
      decirError('Todavía no hay nada que guardar.');
      return;
    }
    var blob = new Blob([estado.manias.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'mis-manias.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  el.subirManias.addEventListener('click', function () { el.archivoManias.click(); });

  el.archivoManias.addEventListener('change', function () {
    var archivo = el.archivoManias.files && el.archivoManias.files[0];
    if (!archivo) return;
    var lector = new FileReader();
    lector.onload = function () {
      var cuantas = agregarManias(String(lector.result).split(/\r?\n/));
      if (!cuantas && !el.errorMania.textContent) {
        decirError('Ese archivo no traía mañas nuevas.');
      }
      el.archivoManias.value = '';
    };
    lector.onerror = function () {
      decirError('No se pudo leer ese archivo.');
      el.archivoManias.value = '';
    };
    lector.readAsText(archivo, 'utf-8');
  });

  cargarManias();
  pintarManias();
  pintarOpciones();
})();
