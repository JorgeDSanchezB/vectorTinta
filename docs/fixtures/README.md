# Fixtures — protocolo de verificación perceptual y de rendimiento

Las tres imágenes de referencia de esta carpeta son **imágenes sintéticas generadas con IA** (generador de imágenes del entorno), elegidas para cubrir los tres casos límite del producto. No son fotos de clientes ni material con derechos de terceros.

**Nota de formato (verificada con `file`):** el generador produjo JPEG; se convirtieron a **PNG real** (contenedor sin pérdida adicional) con `sharp` (`sharp(input).png().toFile(...)`). Los artefactos propios de la codificación original del generador pueden persistir en el contenido; para el protocolo SSIM no afecta al comparar render del SVG contra el propio fixture, que es exactamente el binario listado aquí. Verificación reproducible: `file docs/fixtures/*.png` → `PNG image data, 1024 x 1024, 8-bit/color RGB, non-interlaced`.

| Fixture | Caso que ejercita | Qué se espera del vectorizador con presets por defecto |
|---|---|---|
| `caso-1-logo-plano.png` | Gráfico plano de 4 colores, bordes nítidos (caso ideal serigrafía) | SVG prácticamente idéntico: pocas zonas, colores exactos. Umbral SSIM exigible: **≥ 0,95** |
| `caso-2-producto-fondo-removible.png` | Producto fotográfico con fondo plano distinguible | Vectorizado aceptable (≥ 0,92) + máscara alfa del fondo recortable por el motor ONNX y **reversible con undo** |
| `caso-3-cartel-serigrafia.png` | Ilustración con 5 colores planos + textura de trama (halftone) | SSIM ≥ 0,92 con preset `media`; el trama se alisa con `filterSpeckle` (documentado: es una decisión de estilo, ajustable por preset) |

## Verificación 1 — fidelidad perceptual de la vectorización (LISTÓN: “vectorización fiel”)

Umbral acordado en el plan: **SSIM ≥ 0,92** con los presets por defecto (para el caso 1, ≥ 0,95). Protocolo reproducible cuando exista implementación (Fase 6):

```bash
# Requiere Python 3.10+ con scikit-image y Pillow instalados (entorno de CI o local):
#   pip install scikit-image pillow
python3 - <<'EOF'
import skimage.metrics as m, skimage.io as io, numpy as np, sys
src = io.imread('caso-1-logo-plano.png', as_gray=True)
# svg-out.png = render del SVG exportado al MISMO tamaño que el origen
out = io.imread('svg-out.png', as_gray=True)
print('SSIM:', m.structural_similarity(src, out))
sys.exit(0 if m.structural_similarity(src, out) >= 0.92 else 1)
EOF
```

El render SVG→PNG previo se hace con cualquier rasterizador declarado (p. ej. `resvg`/`sharp`). Alternativa sin Python: `magick compare -metric SSIM origen.png svg-out.png null:` (ImageMagick).

**Inspección visual del árbitro:** abrir origen y SVG al 100 % lado a lado y comprobar checklist: (1) nº de zonas de color ≈ esperado por preset, (2) bordes sin escalones, (3) sin fugas de color entre zonas, (4) fondo respetado. El resultado de la inspección se declara como tal (subjetivo, documentado), no como métrica automática.

**Estado actual (honestidad epistémica):** NO EJECUTADO en esta iteración (no hay implementación del vectorizador: la Fase 6 no se implementa por acuerdo). Este archivo define CÓMO se verificará; el Árbitro marcará el punto del listón como “no verificado hasta implementación”.

## Verificación 2 — presupuesto de interacción <100 ms (LISTÓN: “interfaz interactiva”)

Protocolo con imagen de 2000×2000 (redimensionar cualquier fixture con `magick caso-1-logo-plano.png -resize 2000x2000!\ grande.png`):

1. Instrumentar con `performance.mark/measure` (user timing) los cuatro hitos del plan §5.3: selección, recolor, zoom, aislar capa.
2. Registrar `PerformanceObserver({ entryTypes: ['longtask'] })`: el listón se cumple si ninguna interacción produce longtask (>50 ms) ni medida >100 ms.
3. 20 repeticiones por operación; se reporta p50 y p95 (no medias).

**Estado actual:** verificación estática del diseño (mecanismos y complejidades declaradas en §5.3). La medición real queda pendiente de implementación; no se afirma ninguna cifra ejecutada.

## Verificación 3 — reversibilidad de la eliminación de fondo

Comprobar que tras `RemoveBackgroundCommand` + `undo`, el histograma del alfa del raster vuelve a 255 en el 100 % de los píxeles (asser programático) y visualmente no queda residuo. El motor corre en el navegador: verificar en DevTools → Network que **ningún byte de la imagen sale del origen** (listón: “sin subir la imagen a ningún servidor externo”).
