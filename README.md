# Edita Sobrio

Un analizador de estilo para textos en **español**. Pegas lo que escribiste y te
marca, con colores, los vicios que uno no alcanza a ver en su propio texto:
adjetivos de relleno, adverbios terminados en *-mente*, palabras repetidas,
rimas accidentales, perífrasis con gerundio, pretérito compuesto, frases hechas
y clichés, diminutivos y superlativos. Y las muletillas que tú le apuntes.

En vivo: **[editasobrio.elaletz.com](https://editasobrio.elaletz.com)**

**No es un corrector de ortografía ni de gramática.** Eso ya lo hace cualquier
aplicación. Esto no te dice que escribiste mal: te enseña dónde estás
escribiendo de más. Qué quitar y qué dejar siempre lo decides tú.

## Lo interesante: cómo distingue un adjetivo de verdad

Este fue el problema que tiró la primera versión. Si detectas adjetivos con una
lista de palabras, en *"el viejo salió de la casa vieja"* marcas los dos
`viejo`, y el primero no es un adjetivo: es un sustantivo. Un diccionario no
puede saberlo, porque la diferencia no está en la palabra sino en el trabajo que
hace dentro de la oración.

Por eso hay un backend. spaCy analiza la oración completa y devuelve el árbol
sintáctico; con eso se puede preguntar por la **función**, no por la palabra
([`api/analizador.py`](api/analizador.py)):

```python
FUNCIONES_DE_SUSTANTIVO = {"nsubj", "nsubj:pass", "nmod", "obl",
                           "obl:arg", "iobj", "appos", "flat"}

def es_adjetivo_de_verdad(token):
    if token.pos_ != "ADJ":
        return False
    for hijo in token.children:
        if hijo.dep_ in ("det", "case"):   # "el viejo", "del viejo"
            return False                    # trae determinante: es sustantivo
    if token.dep_ in FUNCIONES_DE_SUSTANTIVO:
        return False                        # hace de sujeto, complemento…
    return True
```

Cuesta un servidor de Python y unos 400 MB de modelo. Vale la pena: marcar mal
es peor que no marcar.

## Cómo correrlo

Son dos piezas: el front (estático, sin build) y la API (Python).

### La API

```bash
cd api
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt      # baja spaCy y el modelo es_core_news_md
uvicorn servidor:app --port 8600
```

Tarda unos 12 segundos en arrancar: está cargando el modelo. Cuando
`GET /api/salud` conteste `{"ok": true}`, ya está.

```bash
python3 pruebas.py                   # 23 casos, incluidos los del "viejo"
```

### El front

```bash
python3 -m http.server 8000
```

El front busca la API en `/api/`, así que para desarrollo necesitas que las dos
salgan del mismo origen. En producción lo hace Caddy:

```
editasobrio.ejemplo.com {
    handle /api/* { reverse_proxy localhost:8600 }
    handle        { root * /ruta/al/front; file_server }
}
```

Si la API no contesta, el front **no se cae**: se pasa a `motor-local.js`, un
motor de respaldo que corre en el navegador con puras expresiones regulares.
Marca menos cosas y —a propósito— no marca adjetivos, porque sin árbol
sintáctico volvería a marcar el `viejo` que no lo es.

## Qué hay adentro

```
index.html          la app
app.js              UI, marcas, edición en vivo, PDF, banco de mañas
motor-local.js      el respaldo de regex para cuando la API no está
estilo.css
cliches.json        97 frases hechas (copia de api/datos/)
api/analizador.py   el corazón: nueve categorías sobre el árbol de spaCy
api/servidor.py     FastAPI, dos rutas, con límite por IP
api/pruebas.py      23 casos
```

**Tus mañas** (las muletillas propias) se guardan en el `localStorage` de tu
navegador, no en ningún servidor, y puedes bajarlas en un `.txt`.

**El texto sí viaja a la API** para analizarse — es donde vive spaCy— pero no se
guarda ni se escribe en disco: se revisa, devuelve las marcas y se suelta.

## Licencia

[CC0 1.0](LICENSE) — dominio público. Bájalo, forkéalo, destrípalo, véndelo si
quieres. No tienes que pedir permiso ni darme crédito.

Si le haces algo chido, cuéntamelo: **escribele@elaletz.com**

---

Hecho por [El Aletz](https://elaletz.com) para los talleres de Tinta Chida.
¿Te falta el borrador? Empieza por
[Escribe Borracho](https://github.com/elaletzprograma/escribe-borracho).
