# ADR-013 — Subidas que exceden límites: adaptación automática en cliente (no rechazo)

**Estado:** aceptado · **Fecha:** Iteración 2 (Fase 6, corrección posterior a uso real)

## Problema

Un usuario del taller intenta subir un arte y recibe «El archivo supera 15 MiB»
(toast del cliente; si llegara al servidor, 413 `payload-grande`). Las fotos de
móvil recientes y los PNG exportados por herramientas de diseño superan 15 MiB
con normalidad. El límite existía para proteger memoria/presupuesto del pipeline
(S-01), pero el RECHAZO puro rompía el flujo: «pasa de un JPG del cliente a los
fotolitos sin fricción».

## Decisión

Dos cambios que se complementan (ambos con los límites de `app.config.ts`,
jamás constantes nuevas — regla 1 del listón):

1. **Techo subido de 15 a 25 MiB** (`limits.image.maxUploadBytes` =
   26_214_400). El servidor MANTIENE todas sus revalidaciones (Content-Length,
   bytes reales, MIME, dimensiones, sha-256): sigue siendo el guardián.
2. **Adaptación automática en el navegador ANTES de subir**
   (`src/lib/image/fit-to-limits.ts`): si el archivo excede el tope de bytes o
   los 4096 px por lado, se escala al máximo por lado (proporción preservada)
   y se recodifica con una escalera calidad/dimensión hasta que quepa.
   - Con alfa (o PNG): solo WebP/PNG como destino — JPEG destruiría el alfa.
   - Si SOLO sobran dimensiones: se intenta PNG (sin pérdida) primero.
   - Suelo de 256 px por lado: no se degrada hasta lo inútil.
   - El toast informa de la adaptación con valores exactos (original → final);
     el checksum y las dimensiones declaradas corresponden al archivo ADAPTADO
     (lo que el servidor revalida y persiste).

## Alternativas descartadas

- **Solo subir el techo** (p. ej. a 100 MiB): trasladaría el problema a
  memoria/presupuesto del Worker de vectorización (R-04) y haría el rechazo
  más raro pero igual de seco.
- **Adaptar en el servidor** (sharp `resize`): añade cómputo de servidor y
  obliga a re-subir el resultado; contradice ADR-001 (el pesado va en cliente).
- **Preguntar al usuario qué hacer** (diálogo): fricción extra; el taller no
  conoce los píxeles ni los MiB, conoce el arte.

## Coste de la decisión

- **Coste aceptado:** una re-decodificación en cliente cuando hay adaptación
  (decodificar el resultado para que `source.imageData` sea EXACTAMENTE el
  arte persistido); y pérdida de fidelidad en archivos que exceden límites
  (explícita en el toast, nunca silenciosa).
- **Riesgo residual:** navegadores sin WebP en `canvas.toBlob` devuelven PNG
  (se valida el MIME REAL del blob de salida antes de aceptarlo); si ningún
  candidato cabe, el error es accionable y va al registro de diagnóstico.
