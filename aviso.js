/* La barra de la comunidad.
 *
 * Un solo archivo para los tres sitios: el original vive en comun/aviso.js y
 * deploy.sh lo copia a cada carpeta. Si le mueves, muévele AQUÍ.
 *
 * Se cierra con la ✕ y no vuelve a salir en dos meses. Como los tres sitios
 * cuelgan de elaletz.com, eso se guarda en una cookie del dominio padre: la
 * cierras en el portal y ya no te sale en las apps. (localStorage no sirve
 * para esto: es de cada subdominio por separado.)
 */
(function () {
  'use strict';

  var ENLACE = 'https://chat.whatsapp.com/FHnxSNzEc8FBcYSOwzAM1Q';
  var GALLETA = 'aviso_comunidad';
  var DIAS = 60;

  function yaLoCerro() {
    return document.cookie.indexOf(GALLETA + '=cerrado') !== -1;
  }

  function recordarQueLoCerro() {
    // En elaletz.com la cookie es del dominio padre para que valga en los tres
    // subdominios. En localhost va sin dominio, si no el navegador la rechaza.
    var dominio = /(^|\.)elaletz\.com$/.test(location.hostname) ? '; domain=.elaletz.com' : '';
    document.cookie = GALLETA + '=cerrado; path=/; max-age=' + (DIAS * 86400) +
                      dominio + '; samesite=lax';
  }

  if (yaLoCerro()) return;

  var ESTILOS = [
    '.aviso-comunidad{',
    '  position:fixed;top:0;left:0;right:0;z-index:500;',
    '  background:#c93a32;color:#f2ede3;',
    '  font-family:"Courier Prime",Courier,monospace;',
    '  display:flex;align-items:center;gap:14px;',
    '  padding:10px 14px 10px 20px;',
    '  box-shadow:0 2px 0 rgba(20,17,14,.18);',
    '}',
    '.aviso-comunidad__texto{',
    '  flex:1;min-width:0;color:#f2ede3;text-decoration:none;',
    '  font-size:13.5px;line-height:1.5;text-align:center;',
    '}',
    '.aviso-comunidad__texto:hover{color:#fff}',
    '.aviso-comunidad__texto b{font-weight:700}',
    '.aviso-comunidad__entrar{',
    '  white-space:nowrap;border-bottom:2px solid rgba(242,237,227,.75);',
    '  padding-bottom:1px;margin-left:6px;',
    '}',
    '.aviso-comunidad__cerrar{',
    '  flex-shrink:0;background:transparent;border:none;cursor:pointer;',
    '  color:#f2ede3;opacity:.75;',
    '  font-family:"Courier Prime",Courier,monospace;font-size:16px;line-height:1;',
    '  padding:6px 8px;',
    '}',
    '.aviso-comunidad__cerrar:hover{opacity:1}',
    '.aviso-comunidad :focus-visible{outline:2px solid #f2ede3;outline-offset:2px}',
    '@media (max-width:640px){',
    '  .aviso-comunidad{padding:9px 8px 9px 14px;gap:6px}',
    '  .aviso-comunidad__texto{font-size:12.5px;text-align:left}',
    '}',
    '@media print{.aviso-comunidad{display:none}}'
  ].join('\n');

  var barra, alto = 0;

  function medir() {
    if (!barra || barra.hidden) {
      document.documentElement.style.setProperty('--alto-aviso', '0px');
      document.body.style.paddingTop = '';
      return;
    }
    alto = barra.offsetHeight;
    // Las hojas de estilo de cada sitio usan --alto-aviso para no quedar
    // tapadas: el portal le resta a su 100vh, las pantallas fijas se recorren.
    document.documentElement.style.setProperty('--alto-aviso', alto + 'px');
    document.body.style.paddingTop = alto + 'px';
  }

  function armar() {
    var hoja = document.createElement('style');
    hoja.textContent = ESTILOS;
    document.head.appendChild(hoja);

    barra = document.createElement('aside');
    barra.className = 'aviso-comunidad';
    barra.setAttribute('role', 'region');
    barra.setAttribute('aria-label', 'Invitación a la comunidad');

    var texto = document.createElement('a');
    texto.className = 'aviso-comunidad__texto';
    texto.href = ENLACE;
    texto.target = '_blank';
    texto.rel = 'noopener';
    texto.innerHTML =
      '<b>Únete a la comunidad de WhatsApp</b> de Tinta Chida y El Aletz: ' +
      'bájate un montón de regalitos, entre ellos un libro con 12 ideas ' +
      'bizarras para vivir de escribir.' +
      '<span class="aviso-comunidad__entrar">entrar al grupo →</span>';

    var cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'aviso-comunidad__cerrar';
    cerrar.textContent = '✕';
    cerrar.title = 'Cerrar este aviso';
    cerrar.setAttribute('aria-label', 'Cerrar este aviso');
    cerrar.addEventListener('click', function () {
      recordarQueLoCerro();
      barra.remove();
      barra = null;
      medir();
    });

    barra.appendChild(texto);
    barra.appendChild(cerrar);
    document.body.appendChild(barra);

    medir();
    window.addEventListener('resize', medir);
    // Las tipografías llegan después y cambian el alto de la barra.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(medir);
  }

  // Escribe Borracho la esconde mientras estás escribiendo: ahí la barra
  // taparía el reloj, y el chiste de esa pantalla es que no haya nada más.
  window.Aviso = {
    ocultar: function () { if (barra) { barra.hidden = true; medir(); } },
    mostrar: function () { if (barra) { barra.hidden = false; medir(); } }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', armar);
  } else {
    armar();
  }
})();
