# -*- coding: utf-8 -*-
"""
El bisturí de Edita Sobrio.

Este módulo NO sabe nada de web: recibe texto, devuelve marcas. La gracia es
que los adjetivos, los verbos y los sustantivos los decide spaCy leyendo la
oración completa, no un diccionario. Con diccionario, "el viejo salió" marcaba
"viejo" como adjetivo cuando ahí es sustantivo, y ese fue justo el problema de
la versión anterior.

Cada marca es {"ini": int, "fin": int, "cat": str}, con offsets sobre el texto
original tal como llegó. El front las pinta.

Categorías:
    mania   las muletillas que cada quien se apuntó
    mente   adverbios en -mente
    adj     adjetivos (POS de spaCy, no lista)
    rep     repeticiones totales (palabras iguales o casi iguales, cerca)
    rima    rimas parciales (marca sólo el pedazo que rima)
    peri    perífrasis: dobles verbos y gerundios
    pret    pretérito compuesto (he dicho, ha llegado)
    cliche  frases hechas
    dim     diminutivos y superlativos

Ortografía y gramática no están aquí a propósito: eso lo hace cualquier
procesador de textos. Esta app busca los vicios de estilo, que no los marca
nadie.
"""

import difflib
import json
import os
import re
import string
import unicodedata

CLAVES = ["mania", "mente", "adj", "rep", "rima", "peri", "pret", "cliche", "dim"]

# Cuando dos marcas se enciman, gana la de arriba. Las mañas propias van
# primero: si alguien se tomó la molestia de apuntar su muletilla, esa marca
# importa más que cualquier regla general.
PRIORIDAD = {
    "mania": 0, "cliche": 1, "mente": 2, "pret": 3, "peri": 4, "dim": 5,
    "rep": 6, "rima": 7, "adj": 8,
}

VENTANA = 45          # tokens a cada lado para buscar repeticiones y rimas
LARGO_MAXIMO = 120000  # caracteres; más que eso y no es un cuento, es un tomo

# Verbos que arrastran a otro verbo. "Empezó a correr", "estaba corriendo".
MODALES = {
    "poder", "querer", "deber", "soler", "seguir", "empezar", "comenzar",
    "tratar", "acabar", "terminar", "ir", "venir", "andar", "volver",
    "dejar", "llegar", "continuar", "estar", "tener", "necesitar", "lograr",
    "intentar", "buscar", "pensar", "decidir",
}
PUENTES = {"a", "de", "que", "por"}

# Palabras que terminan en -ito/-ita/-illo sin ser diminutivos.
NO_SON_DIMINUTIVOS = set("""
escrito escritos escrita escritas grito gritos mito mitos rito ritos éxito éxitos
delito delitos maldito malditos bendito benditos apetito infinito propósito
requisito circuito distrito crédito gratuito bonito bonita bonitos bonitas
señorita señorita cita citas visita visitas hito hitos ámbito ámbitos límite
depósito tránsito espíritu apetitos débito rédito senecto perito peritos
cabrito velita ermita dinamita marchita pepita cerillo cepillo bolsillo
pasillo tornillo cuchillo martillo castillo colmillo ladrillo membrillo
platillo tobillo bolsillos pasillos cigarrillo estribillo sencillo sencilla
amarillo amarilla amarillos amarillas milla millas silla sillas villa villas
orilla orillas rodilla rodillas semilla semillas pesadilla pesadillas
maravilla maravillas mejilla mejillas ardilla ardillas costilla costillas
pastilla pastillas botella
""".split())

# Funciones sintácticas en las que un adjetivo dejó de ser adjetivo y está
# haciendo de sustantivo: "el viejo salió", "lo bueno es que…".
FUNCIONES_DE_SUSTANTIVO = {"nsubj", "nsubj:pass", "nmod", "obl", "obl:arg", "iobj", "appos", "flat"}

_RE_MENTE = re.compile(r"mente$", re.IGNORECASE)
# Red de seguridad para cuando el modelo se equivoca de categoría: en
# "empezó a llover", spaCy lee "llover" como sustantivo. Después de un verbo
# modal, una palabra así casi siempre es infinitivo o gerundio.
_RE_INFINITIVO = re.compile(
    r"(?:[aei]r(?:se|le|lo|la|me|te|nos)?|[aá]ndo(?:se|le|lo|la)?|[ií]éndo(?:se|le|lo|la)?|iendo)$",
    re.IGNORECASE)
_NO_SON_VERBOS = {"SCONJ", "CCONJ", "ADP", "DET", "PRON", "PUNCT", "NUM"}
_RE_DIMINUTIVO = re.compile(
    r"^.{2,}(?:it[oa]s?|ill[oa]s?|ísim[oa]s?|císim[oa]s?|ot[ea]s?)$",
    re.IGNORECASE,
)
_TRADUCTOR_PUNTUACION = str.maketrans("", "", string.punctuation)


# ----------------------------------------------------------------------
# Banco de clichés
# ----------------------------------------------------------------------

def cargar_cliches(ruta=None):
    """Lee datos/cliches.json. Si no está, no truena: regresa lista vacía."""
    if ruta is None:
        ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datos", "cliches.json")
    try:
        with open(ruta, encoding="utf-8") as f:
            return [f for f in json.load(f).get("frases", []) if f.strip()]
    except (OSError, ValueError):
        return []


_EQUIVALENTES = {
    "a": "aáàä", "e": "eéèë", "i": "iíìï", "o": "oóòö", "u": "uúùü", "n": "nñ",
}


def _patron_flexible(frase):
    """
    Convierte "a flor de piel" en una regex que también pesca "a flór de piel"
    y "a  flor   de piel". Así el texto original no se toca y los offsets que
    devolvemos siguen siendo válidos.
    """
    partes = []
    for palabra in frase.strip().split():
        letras = []
        for c in palabra.lower():
            grupo = _EQUIVALENTES.get(c)
            letras.append("[" + grupo + "]" if grupo else re.escape(c))
        partes.append("".join(letras))
    return r"\s+".join(partes)


def compilar_cliches(frases):
    if not frases:
        return None
    alternativas = "|".join(_patron_flexible(f) for f in frases)
    return re.compile(r"(?<![\wáéíóúñü])(?:" + alternativas + r")(?![\wáéíóúñü])", re.IGNORECASE)


# ----------------------------------------------------------------------
# Herramientas de comparación de palabras
# ----------------------------------------------------------------------

def es_adjetivo_de_verdad(token):
    """
    spaCy etiqueta como ADJ tanto "la casa vieja" (adjetivo) como "el viejo
    salió" (sustantivo). Lo que los distingue no es la palabra: es cómo está
    colgada en la oración.

    Si el adjetivo trae artículo o preposición pegada — "EL viejo", "AL viejo",
    "para EL borracho" — está sustantivado y no se marca. Si además hace de
    sujeto o de complemento nominal, menos.
    """
    if token.pos_ != "ADJ":
        return False
    for hijo in token.children:
        if hijo.dep_ in ("det", "case"):
            return False
    if token.dep_ in FUNCIONES_DE_SUSTANTIVO:
        return False
    return True


def _arrastra_verbo(token):
    """¿Este token es el infinitivo o el gerundio que cuelga de un modal?"""
    forma = str(token.morph)
    if "VerbForm=Inf" in forma or "VerbForm=Ger" in forma:
        return True
    if token.pos_ in _NO_SON_VERBOS:
        return False
    return len(token.text) >= 4 and bool(_RE_INFINITIVO.search(token.text))


def _limpia(palabra):
    return palabra.translate(_TRADUCTOR_PUNTUACION).strip().lower()


def _sin_acentos(palabra):
    return "".join(c for c in unicodedata.normalize("NFD", palabra)
                   if unicodedata.category(c) != "Mn")


def _son_parecidas(a, b, cache):
    """
    Misma regla que la versión vieja: iguales, o parecidas al 80% según
    difflib. Lo único nuevo es el caché y los atajos baratos de difflib, que
    en un cuento largo son la diferencia entre medio segundo y quince.
    """
    if a == b:
        return True
    if min(len(a), len(b)) < 4:
        return False
    llave = (a, b) if a < b else (b, a)
    if llave in cache:
        return cache[llave]
    m = difflib.SequenceMatcher(None, llave[0], llave[1])
    resultado = (m.real_quick_ratio() >= 0.8
                 and m.quick_ratio() >= 0.8
                 and m.ratio() >= 0.8)
    cache[llave] = resultado
    return resultado


def _sufijo_comun(a, b, minimo=3):
    i = 0
    while i < len(a) and i < len(b) and a[-1 - i] == b[-1 - i]:
        i += 1
    return a[len(a) - i:] if i >= minimo else ""


# ----------------------------------------------------------------------
# El análisis
# ----------------------------------------------------------------------

def analizar(texto, nlp, cliches=None, manias=None):
    """
    texto    : el texto tal cual lo pegó quien escribe
    nlp      : modelo de spaCy ya cargado
    cliches  : regex del banco compartido, o None
    manias   : regex del banco propio de quien escribe, o None
    """
    marcas = []
    doc = nlp(texto)

    # --- frases hechas y mañas propias: sobre el texto crudo, no por tokens ---
    if cliches is not None:
        for m in cliches.finditer(texto):
            marcas.append({"ini": m.start(), "fin": m.end(), "cat": "cliche"})
    if manias is not None:
        for m in manias.finditer(texto):
            marcas.append({"ini": m.start(), "fin": m.end(), "cat": "mania"})

    # --- tokens, con el POS ya corregido ---
    tokens = []
    for t in doc:
        pos = t.pos_
        bajo = t.text.lower()
        # spaCy a veces lee los diminutivos como adjetivos ("un cafecito").
        if pos == "ADJ" and bajo.endswith(("ita", "ito", "itas", "itos", "ote", "otes")):
            pos = "NOUN"
        tokens.append({
            "texto": t.text,
            "bajo": bajo,
            "limpio": _limpia(t.text),
            "lema": t.lemma_.lower(),
            "pos": pos,
            "morph": str(t.morph),
            "ini": t.idx,
            "fin": t.idx + len(t.text),
            "marcado": False,   # ya lo agarró alguna categoría de palabra
            "tomado": False,    # ya es parte de una perífrasis
        })
    n = len(tokens)

    # --- adverbios en -mente ---
    for tk in tokens:
        if tk["pos"] == "ADV" and _RE_MENTE.search(tk["bajo"]):
            marcas.append({"ini": tk["ini"], "fin": tk["fin"], "cat": "mente"})
            tk["marcado"] = True

    # --- adjetivos: aquí es donde spaCy se gana el sueldo ---
    for t, tk in zip(doc, tokens):
        if tk["pos"] == "ADJ" and es_adjetivo_de_verdad(t):
            marcas.append({"ini": tk["ini"], "fin": tk["fin"], "cat": "adj"})
            tk["marcado"] = True

    # --- diminutivos y superlativos ---
    for tk in tokens:
        if tk["pos"] not in ("NOUN", "ADJ", "ADV"):
            continue
        if tk["bajo"] in NO_SON_DIMINUTIVOS:
            continue
        if _RE_DIMINUTIVO.match(tk["bajo"]):
            marcas.append({"ini": tk["ini"], "fin": tk["fin"], "cat": "dim"})
            tk["marcado"] = True

    # --- pretérito compuesto: haber en presente + participio ---
    i = 0
    while i < n - 1:
        tk, sig = tokens[i], tokens[i + 1]
        if tk["lema"] == "haber" and "Pres" in tk["morph"] and "VerbForm=Part" in sig["morph"]:
            marcas.append({"ini": tk["ini"], "fin": sig["fin"], "cat": "pret"})
            tk["marcado"] = sig["marcado"] = True
            tk["tomado"] = sig["tomado"] = True
            i += 2
            continue
        i += 1

    # --- perífrasis: verbo que arrastra a otro verbo ---
    i = 0
    while i < n:
        tk = tokens[i]
        if tk["tomado"] or tk["pos"] not in ("VERB", "AUX") or tk["lema"] not in MODALES:
            i += 1
            continue
        j = i + 1
        if j < n and tokens[j]["bajo"] in PUENTES:
            j += 1
        if j < n and not tokens[j]["tomado"]:
            if _arrastra_verbo(doc[j]):
                marcas.append({"ini": tk["ini"], "fin": tokens[j]["fin"], "cat": "peri"})
                for k in range(i, j + 1):
                    tokens[k]["marcado"] = True
                    tokens[k]["tomado"] = True
                i = j + 1
                continue
        i += 1

    # --- repeticiones y rimas, en una sola pasada por ventana ---
    interesantes = {"NOUN", "ADJ", "VERB", "PROPN"}
    cache = {}

    for i, tk in enumerate(tokens):
        if tk["pos"] not in interesantes or not tk["limpio"]:
            continue
        desde, hasta = max(0, i - VENTANA), min(n, i + VENTANA + 1)
        repetida = False
        mejor_sufijo = ""
        for j in range(desde, hasta):
            if j == i:
                continue
            otro = tokens[j]
            if otro["pos"] not in interesantes or not otro["limpio"]:
                continue
            if _son_parecidas(tk["limpio"], otro["limpio"], cache):
                repetida = True
            else:
                sufijo = _sufijo_comun(tk["limpio"], otro["limpio"], 3)
                if len(sufijo) > len(mejor_sufijo):
                    mejor_sufijo = sufijo
        if repetida:
            marcas.append({"ini": tk["ini"], "fin": tk["fin"], "cat": "rep"})
            tk["marcado"] = True
        elif mejor_sufijo and not tk["marcado"]:
            # Como en la versión vieja: se resalta nada más el pedazo que rima.
            corte = tk["bajo"].rfind(mejor_sufijo)
            if corte >= 0:
                marcas.append({
                    "ini": tk["ini"] + corte,
                    "fin": tk["ini"] + corte + len(mejor_sufijo),
                    "cat": "rima",
                })

    marcas.sort(key=lambda m: (m["ini"], PRIORIDAD.get(m["cat"], 99), -m["fin"]))
    return marcas
