# -*- coding: utf-8 -*-
"""
Pruebas del bisturí. Se corren a mano cuando le muevas al analizador:

    venv/bin/python pruebas.py

Cada caso dice qué debe marcar UNA categoría en una frase. Si algo se pone
rojo, o le erraste al analizador o la prueba está mal escrita: revisa las dos.
"""

import sys

import spacy

import analizador

CASOS = [
    # (categoría, frase, lo que debe quedar marcado)

    # Adjetivos: lo difícil no es hallarlos, es no marcar los sustantivados.
    ("adj", "El viejo salió de la casa vieja.", ["vieja"]),
    ("adj", "Lo bueno es que llegó temprano.", []),
    ("adj", "Vi al viejo en la esquina.", []),
    ("adj", "Un desconocido tocó la puerta.", []),
    ("adj", "La casa era hermosa.", ["hermosa"]),
    ("adj", "Una casa enorme, hermosa y terrible.", ["enorme", "hermosa", "terrible"]),
    ("adj", "Tenía los ojos rojos y la boca seca.", ["rojos", "seca"]),
    ("adj", "Nada es imposible para el borracho.", ["imposible"]),

    # Adverbios en -mente
    ("mente", "Caminaba lentamente y hablaba dulcemente.", ["lentamente", "dulcemente"]),
    ("mente", "La mente le daba vueltas.", []),

    # Pretérito compuesto
    ("pret", "He dicho que ya ha llegado.", ["He dicho", "ha llegado"]),
    ("pret", "Había dicho otra cosa.", []),

    # Perífrasis
    ("peri", "Estaba caminando cuando empezó a llover.", ["Estaba caminando", "empezó a llover"]),
    ("peri", "Quería correr pero no podía correr.", ["Quería correr", "podía correr"]),

    # Frases hechas
    ("cliche", "Se lo dijo con el corazón en la mano.", ["con el corazón en la mano"]),
    ("cliche", "Le quedó como anillo al dedo.", ["como anillo al dedo"]),

    # Diminutivos y superlativos
    ("dim", "La casita era pequeñita y rapidísima.", ["casita", "pequeñita", "rapidísima"]),
    ("dim", "Lo tenía escrito en un delito bonito.", []),

    # Repeticiones: la misma palabra cerca, o casi la misma.
    ("rep", "La casa de la casa era una casa.", ["casa", "casa", "casa"]),
]

# Las mañas propias son de cada quien, así que se prueban aparte, con un banco
# de mentiritas. Lo que importa: que le ganen al cliché cuando se enciman.
CASOS_DE_MANIAS = [
    (["de pronto"], "De pronto se fue.", ["De pronto"]),
    (["en realidad"], "En realidad no pasó nada.", ["En realidad"]),
    (["sonrió de oreja a oreja"], "Sonrió de oreja a oreja.", ["Sonrió de oreja a oreja"]),
    (["mirada"], "Su mirada, esa mirada.", ["mirada", "mirada"]),
]


def main():
    nlp = spacy.load("es_core_news_md", disable=["ner"])
    cliches = analizador.compilar_cliches(analizador.cargar_cliches())

    fallas = 0
    for categoria, frase, esperado in CASOS:
        marcas = analizador.analizar(frase, nlp, cliches=cliches)
        hallado = [frase[m["ini"]:m["fin"]] for m in marcas if m["cat"] == categoria]
        if hallado == esperado:
            print("  ok    %-6s %s" % (categoria, frase))
        else:
            fallas += 1
            print("  FALLA %-6s %s" % (categoria, frase))
            print("        esperaba %s" % (esperado,))
            print("        encontró %s" % (hallado,))

    for banco, frase, esperado in CASOS_DE_MANIAS:
        marcas = analizador.analizar(frase, nlp, cliches=cliches,
                                     manias=analizador.compilar_cliches(banco))
        hallado = [frase[m["ini"]:m["fin"]] for m in marcas if m["cat"] == "mania"]
        if hallado == esperado:
            print("  ok    mania  %s" % frase)
        else:
            fallas += 1
            print("  FALLA mania  %s" % frase)
            print("        esperaba %s" % (esperado,))
            print("        encontró %s" % (hallado,))

    total = len(CASOS) + len(CASOS_DE_MANIAS)
    print("\n%d casos, %d fallas" % (total, fallas))
    return 1 if fallas else 0


if __name__ == "__main__":
    sys.exit(main())
