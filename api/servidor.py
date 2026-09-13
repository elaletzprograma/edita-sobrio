# -*- coding: utf-8 -*-
"""
API de Edita Sobrio.

Un solo trabajo: recibir texto y devolver dónde están los vicios. El diseño y
todo lo que se ve vive en el front estático; aquí nada más está el cerebro.

    POST /api/analizar   {"texto": "...", "manias": ["de pronto", ...]}
    GET  /api/salud

Se levanta con:
    uvicorn servidor:app --host 127.0.0.1 --port 8600
"""

import logging
import os
import threading
import time
from typing import List

import spacy
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import analizador

log = logging.getLogger("edita-sobrio")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

MODELO = os.environ.get("EDITA_MODELO_SPACY", "es_core_news_md")

log.info("Cargando spaCy (%s)…", MODELO)
NLP = spacy.load(MODELO, disable=["ner"])
CLICHES_FRASES = analizador.cargar_cliches()
CLICHES = analizador.compilar_cliches(CLICHES_FRASES)
log.info("Listo: %d frases hechas en el banco.", len(CLICHES_FRASES))

app = FastAPI(title="Edita Sobrio", docs_url=None, redoc_url=None)

# En producción el front vive en el mismo dominio y Caddy manda /api/ para acá,
# así que esto es sólo para desarrollar en la laptop.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8777", "http://localhost:8777",
        "https://editasobrio.elaletz.com", "https://edita.tintachida.cloud",
    ],
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


MAXIMO_MANIAS = 300
MAXIMO_LARGO_MANIA = 120


class Peticion(BaseModel):
    texto: str = Field(default="", max_length=analizador.LARGO_MAXIMO)
    # El banco propio de muletillas. Vive en el navegador de cada quien y viaja
    # con cada análisis: aquí no se guarda nada de nadie.
    manias: List[str] = Field(default_factory=list)


# ----------------------------------------------------------------------
# Un freno por si alguien se emociona
# ----------------------------------------------------------------------

ANALISIS_POR_MINUTO = 90
_visitas = {}
_candado_visitas = threading.Lock()


def de_donde(peticion):
    """La IP de verdad: detrás de Caddy, request.client es siempre localhost."""
    reenviada = peticion.headers.get("x-forwarded-for", "")
    if reenviada:
        return reenviada.split(",")[0].strip()
    return peticion.client.host if peticion.client else "?"


def muy_seguido(ip):
    """True si esa IP ya pidió demasiados análisis en el último minuto."""
    ahora = time.time()
    with _candado_visitas:
        recientes = [t for t in _visitas.get(ip, []) if ahora - t < 60]
        if len(recientes) >= ANALISIS_POR_MINUTO:
            _visitas[ip] = recientes
            return True
        recientes.append(ahora)
        _visitas[ip] = recientes
        if len(_visitas) > 10000:          # que no crezca para siempre
            _visitas.clear()
        return False


# ----------------------------------------------------------------------
# Rutas
# ----------------------------------------------------------------------

@app.get("/api/salud")
def salud():
    return {"ok": True, "motor": "spacy", "modelo": MODELO, "cliches": len(CLICHES_FRASES)}



# Compilar la regex de las mañas cuesta poco, pero en la edición en vivo se
# piden muchos análisis seguidos con la misma lista. Un cachecito y ya.
_manias_compiladas = {}


def regex_de_manias(frases):
    limpias = []
    for f in frases[:MAXIMO_MANIAS]:
        f = " ".join((f or "").split())[:MAXIMO_LARGO_MANIA]
        if f:
            limpias.append(f)
    if not limpias:
        return None, []
    llave = tuple(limpias)
    if llave not in _manias_compiladas:
        if len(_manias_compiladas) > 64:
            _manias_compiladas.clear()
        _manias_compiladas[llave] = analizador.compilar_cliches(limpias)
    return _manias_compiladas[llave], limpias


@app.post("/api/analizar")
def analizar(peticion: Peticion, request: Request):
    texto = peticion.texto
    if not texto.strip():
        return {"marcas": [], "motor": "spacy", "manias": 0, "ms": 0}

    if muy_seguido(de_donde(request)):
        raise HTTPException(status_code=429,
                            detail="Vas muy rápido. Espérate un momento.")

    arranque = time.time()
    manias, frases = regex_de_manias(peticion.manias)

    marcas = analizador.analizar(texto, NLP, cliches=CLICHES, manias=manias)
    return {
        "marcas": marcas,
        "motor": "spacy",
        "manias": len(frases),
        "ms": int((time.time() - arranque) * 1000),
    }
