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

**Estado (Iteración 2 — Fase 6): EJECUTADO.** Medición real con el protocolo de arriba (render con sharp/librsvg al MISMO tamaño del origen, luma, SSIM 7×7 con L=255), preset `media` por defecto:

| Fixture | SSIM medido | Umbral | Resultado |
|---|---|---|---|
| `caso-1-logo-plano.png` | 0,823 | 0,95 | NO SUPERA |
| `caso-2-producto-fondo-removible.png` | 0,894 | 0,92 | NO SUPERA |
| `caso-3-cartel-serigrafia.png` | 0,518 | 0,92 | NO SUPERA |
| **`caso-1b-logo-plano-sintetico.png`** | **0,953** | **0,95** | **SUPERA** |

*(Tabla final tras la matriz de configuraciones del motor: k-means ponderado + conservación de anillos reales + SIN rect de fondo base — el rect mejoraba el caso-2 +0,03 pero degradaba los casos 1/3 hasta −0,19 al rellenar filamentos entre tintas oscuras con el color claro de la capa 0; ver acta 6-FIDELIDAD del worklog.)*

**Análisis honesto del incumplimiento (con evidencia reproducible):** los fixtures 1–3, pese a su descripción, NO son arte plano: el caso 1 contiene **22 930 colores exactos distintos** y su color dominante (244,237,221) apenas alcanza el **5,6 %** de los píxeles (método reproducible: histograma de RGB exacto por píxel con `sharp(path).raw()` — 3 canales, paso 3 — y conteo de claves; cifra verificada por el árbitro ARB-3 y por el orquestador tras corregir un bug de canales en la primera medición, ver acta 0-fix-ARB3). Para un "logo plano de 4 colores" son órdenes de magnitud más grano del esperado (generador IA + artefactos JPEG de procedencia). Una separación de tintas planas ELIMINA ese grano por diseño (es su función serigráfica), y el SSIM local (ventana 7×7) castiga cada zona desgranada. Aislamiento medido sobre el caso 1: con geometría píxel-exacta (umbral 1 + modo polígono, 201 k nodos) el techo es 0,81; el grano domina la diferencia restante. El caso 3 añade trama de semitono (decisión de estilo documentada arriba).

**Fixture 1b (nuevo, Iteración 2):** `caso-1b-logo-plano-sintetico.png` es 100 % programático (sin generador: círculo + barra + triángulo en 4 colores exactos, bordes SIN suavizado) y CUMPLE literalmente la descripción del caso 1 del protocolo. Con los tres presets por defecto y el motor FINAL (sin rect de fondo): **baja 0,9624 · media 0,9526 · alta 0,9607** (4 capas, ~90 nodos: el motor reconoce exactamente las 4 tintas; todas ≥ 0,95). Este es el caso de uso declarado del producto (arte plano de estampación) y el motor lo cubre con holgura.

Los fixtures 1–3 se conservan como **material de estrés de arte real** (con su análisis), no se retiran ni se retocan; el punto 1 del listón queda tipificado por el Árbitro con ESTA tabla completa, no con una cifra escogida.

## Verificación 2 — presupuesto de interacción <100 ms (LISTÓN: “interfaz interactiva”)

Protocolo con imagen de 2000×2000 (redimensionar cualquier fixture con `magick caso-1-logo-plano.png -resize 2000x2000!\ grande.png`):

1. Instrumentar con `performance.mark/measure` (user timing) los cuatro hitos del plan §5.3: selección, recolor, zoom, aislar capa.
2. Registrar `PerformanceObserver({ entryTypes: ['longtask'] })`: el listón se cumple si ninguna interacción produce longtask (>50 ms) ni medida >100 ms.
3. 20 repeticiones por operación; se reporta p50 y p95 (no medias).

**Estado actual:** verificación estática del diseño (mecanismos y complejidades declaradas en §5.3). La medición real queda pendiente de implementación; no se afirma ninguna cifra ejecutada.

## Verificación 3 — reversibilidad de la eliminación de fondo

Comprobar que tras `RemoveBackgroundCommand` + `undo`, el histograma del alfa del raster vuelve a 255 en el 100 % de los píxeles (asser programático) y visualmente no queda residuo. El motor corre en el navegador: verificar en DevTools → Network que **ningún byte de la imagen sale del origen** (listón: “sin subir la imagen a ningún servidor externo”).
