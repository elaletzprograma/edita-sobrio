/* Motor de emergencia.
 *
 * Si el analizador del servidor no contesta, esto corre aquí mismo en el
 * navegador para que la app no se quede muda. Es una versión más burda: no
 * entiende gramática, sólo patrones.
 *
 * Por eso NO marca adjetivos: sin análisis gramatical, un diccionario confunde
 * "el viejo salió" (sustantivo) con "el viejo perro" (adjetivo), y marcar de
 * más es peor que no marcar.
 */
window.MotorLocal = (function () {
  'use strict';

  var CATEGORIAS = ['mania', 'mente', 'rep', 'rima', 'peri', 'pret', 'cliche', 'dim'];

  var VACIAS = ('para pero como este esta esto estos estas todo toda todos todas ' +
    'cuando donde porque entre sobre hasta desde también aunque mientras luego ' +
    'entonces ahora antes después otra otro otros otras cada algo alguien nada ' +
    'nadie ella ellos ellas usted nosotros ustedes tiene tienen había estaba ' +
    'estaban fueron sido estar solo sólo').split(' ');

  var NO_DIMINUTIVOS = ('escrito escritos grito gritos mito mitos rito ritos éxito ' +
    'éxitos delito delitos maldito malditos bendito benditos apetito infinito ' +
    'propósito requisito circuito distrito crédito gratuito bonito bonita cita ' +
    'citas visita visitas sencillo sencilla amarillo amarilla silla sillas ' +
    'orilla orillas rodilla rodillas semilla semillas maravilla maravillas ' +
    'pasillo cepillo cuchillo martillo castillo ladrillo tobillo cigarrillo ' +
    'estribillo pastilla pastillas botella').split(' ');

  var vacias = {}, noDim = {};
  VACIAS.forEach(function (w) { vacias[w] = true; });
  NO_DIMINUTIVOS.forEach(function (w) { noDim[w] = true; });

  var UMBRAL_REPETICION = 3;

  function escapar(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function buscar(re, cat, marcas, texto, filtro) {
    var m;
    while ((m = re.exec(texto))) {
      if (!filtro || filtro(m[0])) {
        marcas.push({ ini: m.index, fin: m.index + m[0].length, cat: cat });
      }
      if (m.index === re.lastIndex) re.lastIndex++;   // no colgarse con vacíos
    }
  }

  function analizar(texto, frasesHechas, manias) {
    var marcas = [];

    // Las mañas propias sí funcionan sin servidor: son búsqueda de texto, no
    // gramática. Van primero para que le ganen a las demás marcas.
    if (manias && manias.length) {
      buscar(new RegExp('\\b(?:' + manias.map(escapar).join('|') + ')\\b', 'gi'),
             'mania', marcas, texto);
    }

    if (frasesHechas && frasesHechas.length) {
      buscar(new RegExp('\\b(?:' + frasesHechas.map(escapar).join('|') + ')\\b', 'gi'),
             'cliche', marcas, texto);
    }

    buscar(/\b[a-záéíóúñü]{3,}mente\b/gi, 'mente', marcas, texto);

    buscar(/\b(?:he|has|ha|hemos|habéis|han)\s+[a-záéíóúñü]+(?:ado|ido|to|cho|so)\b/gi,
           'pret', marcas, texto);

    buscar(/\b(?:puedo|puedes|puede|podemos|pueden|quiero|quieres|quiere|queremos|quieren|debo|debes|debe|debemos|deben|sigo|sigues|sigue|seguimos|siguen|suelo|sueles|suele|suelen|empiezo|empiezas|empieza|empezó|acabo|acabas|acaba|voy|vas|va|vamos|van|iba|ibas|íbamos|iban|estoy|estás|está|estamos|están|estaba|estaban|tengo\s+que|tienes\s+que|tiene\s+que)\s+(?:a\s+|de\s+)?[a-záéíóúñü]+(?:ar|er|ir|ando|iendo|éndo)\b/gi,
           'peri', marcas, texto);

    buscar(/\b[a-záéíóúñü]{2,}(?:it[oa]s?|ill[oa]s?|ísim[oa]s?|císim[oa]s?)\b/gi,
           'dim', marcas, texto, function (p) { return !noDim[p.toLowerCase()]; });

    // Palabras sueltas, para repeticiones y rimas.
    var tokens = [], re = /[a-záéíóúñüA-ZÁÉÍÓÚÑÜ]+/g, m;
    while ((m = re.exec(texto))) {
      tokens.push({ w: m[0].toLowerCase(), i: m.index, largo: m[0].length });
    }

    var cuentas = {};
    tokens.forEach(function (t) {
      if (t.largo >= 4 && !vacias[t.w]) cuentas[t.w] = (cuentas[t.w] || 0) + 1;
    });
    tokens.forEach(function (t) {
      if (cuentas[t.w] >= UMBRAL_REPETICION) {
        marcas.push({ ini: t.i, fin: t.i + t.largo, cat: 'rep' });
      }
    });

    var vistos = {};
    for (var i = 0; i < tokens.length; i++) {
      var a = tokens[i];
      if (a.largo < 5 || vacias[a.w]) continue;
      for (var j = i + 1; j < Math.min(tokens.length, i + 11); j++) {
        var b = tokens[j];
        if (b.largo < 5 || b.w === a.w || vacias[b.w]) continue;
        if (a.w.slice(-3) === b.w.slice(-3)) {
          if (!vistos[i]) { marcas.push({ ini: a.i, fin: a.i + a.largo, cat: 'rima' }); vistos[i] = true; }
          if (!vistos[j]) { marcas.push({ ini: b.i, fin: b.i + b.largo, cat: 'rima' }); vistos[j] = true; }
        }
      }
    }

    return marcas;
  }

  return { analizar: analizar, categorias: CATEGORIAS };
})();
