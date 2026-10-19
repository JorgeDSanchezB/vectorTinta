/**
 * VectorTinta — Motor propio de vectorización `imagetracer-js` (ADR-001).
 *
 * Implementación íntegra en el cliente (Web Worker) con cero dependencias:
 * cuantización de color por histograma, filtro de motas por componentes
 * conexas 4-vecinos, trazado de contornos por marching squares SOBRE la
 * retícula de píxeles (esquinas enteras, agujeros incluidos), simplificación
 * Ramer-Douglas-Peucker con conservación de esquinas y serialización a
 * Bézier cúbicas (Catmull-Rom, tensión 1.0) o polígono.
 *
 * DETERMINISMO (requisito del producto): misma entrada + params → misma
 * salida byte a byte. Todos los desempates son de orden estable (clave
 * lexicográfica, primer índice, orden de escaneo por filas); no se usa
 * Math.random ni estructuras con orden no definido.
 *
 * RENDIMIENTO: typed arrays planos, cero creación de objetos dentro de los
 * bucles internos, O(W·H) por fase y O(borde) en trazado. Presupuesto:
 * 2000×2000 en < 10 s dentro del Worker (verificado en /tmp, ver worklog).
 *
 * Coordenadas: la retícula de esquinas es (0..W)×(0..H) con Y hacia abajo
 * (igual que SVG); un píxel (x,y) ocupa el cuadrado [x,x+1]×[y,y+1].
 */
import type { LayerDraft, RawImageData, VectorParams, VectorizeResult } from "@/lib/domain/entities";
import { suggestInkName } from "@/lib/domain/invariants";
import { makeProblem } from "@/lib/domain/errors";
import { EngineFailure, OperationCancelled, type VectorizerEngine, type VectorizerRunContext, type VectorizerRunInput } from "../types";

/* ───────────────────────── Utilidades ───────────────────────── */

/** Direcciones sobre la retícula: 0=arriba, 1=derecha, 2=abajo, 3=izquierda (Y hacia abajo). */
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/** Cada cuántos píxeles se comprueba la señal de cancelación y se emite progreso. */
const SIGNAL_EVERY = 1 << 16;

/** Pasos máximos de un paseo de contorno (defensa ante bugs; la biyección de aristas garantiza menos). */
const MAX_WALK_STEPS = 8 * 4096 * 4096 + 64;

/** Número serializado con máx. 2 decimales (tamaño de SVG contenido, sin ceros ni "-0"). */
function fmt(n: number): string {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? "0" : String(v);
}

/** Cancelación cooperativa entre fases y dentro de bucles largos. */
function ensureNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new OperationCancelled();
}

/** HEX mayúscula de 6 dígitos a partir de canales 0..255. */
function toHex(r: number, g: number, b: number): string {
  const h = (v: number) => v.toString(16).padStart(2, "0").toUpperCase();
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Ángulo del vértice (en grados) formado por prev–v y v–next; 180 = colineal. */
function anguloVertice(px: number, py: number, vx: number, vy: number, nx: number, ny: number): number {
  const v1x = px - vx;
  const v1y = py - vy;
  const v2x = nx - vx;
  const v2y = ny - vy;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return 180; // vértice duplicado (auto-tangencia): no es esquina
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/* ───────────────────── Anillo simplificado ───────────────────── */

/** Anillo cerrado ya simplificado: puntos planos [x0,y0,x1,y1,…] + esquinas marcadas. */
interface Anillo {
  pts: number[];
  esquinas: boolean[];
}

/**
 * Simplifica un anillo cerrado con Ramer-Douglas-Peucker (iterativo, con pila
 * explícita para no agotar la pila de llamadas en contornos enormes) y marca
 * las esquinas vivas sobre el RESULTADO simplificado.
 *
 * Regla de esquinas (contrato compartido: "ángulos menores se conservan vivos",
 * ver FieldMeta del preset): el vértice es CORNER cuando su ángulo es
 * ≤ cornerThreshold. Se usa ≤ y no < para que el caso límite exacto —p. ej.
 * una esquina de 90° con el preset 'baja' de umbral 90— cuente como esquina
 * viva; con un '<' estricto TODA esquina recta de un póster se redondearía
 * en modo spline, que contradice la semántica del preset.
 *
 * Las esquinas se marcan tras la simplificación (y no antes) porque sobre la
 * retícula original todos los ángulos son de 90°/270°: marcarlas antes sería
 * degenerado y bloquearía RDP por completo. RDP nunca elimina puntos tras el
 * marcado; la protección se aplica donde realmente se podrían "perder": en la
 * conversión a spline, que parte la curva en cada CORNER para mantenerla viva.
 *
 * Descarta anillos con menos de 3 puntos o área ~0 (|área| < 0.5 px²).
 */
/**
 * Anillo SIN simplificar para el fallback de cobertura: si RDP colapsa un
 * contorno con píxeles reales, se conserva la geometría bruta (mismo criterio
 * de degeneración que simplificarAnillo: <3 puntos o área < 0,5 px²).
 */
function anilloBruto(pts: number[]): Anillo | null {
  const n = pts.length / 2;
  if (n < 3) return null;
  let a2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a2 += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1];
  }
  if (Math.abs(a2 * 0.5) < 0.5) return null;
  return { pts, esquinas: new Array<boolean>(n).fill(false) };
}

function simplificarAnillo(pts: number[], eps: number, umbralEsquina: number): Anillo | null {
  const n = pts.length / 2;
  if (n < 3) return null;

  // Área por shoelace (anillo cerrado): descarta contornos degenerados.
  let a2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a2 += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1];
  }
  if (Math.abs(a2 * 0.5) < 0.5) return null;

  // Segundo ancla: vértice más lejano del 0 (empate → menor índice, orden estable).
  let lejos = 1;
  let mejorD = -1;
  for (let i = 1; i < n; i++) {
    const dx = pts[2 * i] - pts[0];
    const dy = pts[2 * i + 1] - pts[1];
    const d = dx * dx + dy * dy;
    if (d > mejorD) {
      mejorD = d;
      lejos = i;
    }
  }

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[lejos] = 1;

  // Punto(k): el índice n equivale al vértice 0 (cierre del anillo).
  const x = (k: number): number => (k >= n ? pts[0] : pts[2 * k]);
  const y = (k: number): number => (k >= n ? pts[1] : pts[2 * k + 1]);

  const eps2 = eps * eps;
  const rdp = (a: number, b: number): void => {
    const pila: number[] = [a, b];
    while (pila.length > 0) {
      const j = pila.pop() as number;
      const i = pila.pop() as number;
      if (j - i < 2) continue;
      const ax = x(i);
      const ay = y(i);
      const ex = x(j) - ax;
      const ey = y(j) - ay;
      const el2 = ex * ex + ey * ey;
      let mk = -1;
      let md = eps2;
      for (let k = i + 1; k < j; k++) {
        const qx = x(k) - ax;
        const qy = y(k) - ay;
        let d2: number;
        if (el2 === 0) {
          d2 = qx * qx + qy * qy;
        } else {
          const dot = qx * ex + qy * ey;
          d2 = qx * qx + qy * qy - (dot * dot) / el2;
        }
        if (d2 > md) {
          md = d2;
          mk = k;
        }
      }
      if (mk !== -1) {
        keep[mk] = 1;
        pila.push(i, mk, mk, j);
      }
    }
  };
  rdp(0, lejos);
  rdp(lejos, n);

  const fuera: number[] = [];
  for (let k = 0; k < n; k++) {
    if (keep[k] === 1) fuera.push(pts[2 * k], pts[2 * k + 1]);
  }
  if (fuera.length < 6) return null; // colapsó a menos de 3 puntos

  const m = fuera.length / 2;
  const esquinas = new Array<boolean>(m);
  for (let i = 0; i < m; i++) {
    const p = (i - 1 + m) % m;
    const q = (i + 1) % m;
    const ang = anguloVertice(fuera[2 * p], fuera[2 * p + 1], fuera[2 * i], fuera[2 * i + 1], fuera[2 * q], fuera[2 * q + 1]);
    esquinas[i] = ang <= umbralEsquina;
  }
  return { pts: fuera, esquinas };
}

/* ───────────────────── Serialización de anillos ───────────────────── */

/** Trozo de path `d` de un anillo + nº de puntos de control (comandos M/C/L). */
interface AnilloSerializado {
  d: string;
  nodes: number;
}

/**
 * Convierte un anillo a path `d`.
 * `polygon` → M/L/Z directo. `spline` → Catmull-Rom uniforme (tensión 1.0)
 * convertido a Bézier cúbicas; en cada CORNER se parte la curva (los tramos
 * entre esquinas usan extremos clampados) para que la esquina quede viva.
 */
function serializarAnillo(anillo: Anillo, mode: "spline" | "polygon"): AnilloSerializado {
  const pts = anillo.pts;
  const n = pts.length / 2;
  const ix = (i: number): number => (((i % n) + n) % n); // módulo siempre positivo (anillo cerrado)
  const X = (i: number): string => fmt(pts[2 * ix(i)]);
  const Y = (i: number): string => fmt(pts[2 * ix(i) + 1]);
  const numX = (i: number): number => pts[2 * ix(i)];
  const numY = (i: number): number => pts[2 * ix(i) + 1];

  if (mode === "polygon") {
    let d = `M ${X(0)} ${Y(0)}`;
    for (let i = 1; i < n; i++) d += ` L ${X(i)} ${Y(i)}`;
    return { d: `${d} Z`, nodes: n };
  }

  // spline: Catmull-Rom → Bézier con tensión 1.0 (control = ±vecino/6).
  const tieneEsquinas = anillo.esquinas.some((e) => e);
  let d = `M ${X(0)} ${Y(0)}`;
  let nodes = 1;

  if (!tieneEsquinas) {
    // Anillo cerrado liso: Catmull-Rom cíclico sobre todos los vértices.
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const pm = (i - 1 + n) % n;
      const pp = (j + 1) % n;
      const c1x = numX(i) + (numX(j) - numX(pm)) / 6;
      const c1y = numY(i) + (numY(j) - numY(pm)) / 6;
      const c2x = numX(j) - (numX(pp) - numX(i)) / 6;
      const c2y = numY(j) - (numY(pp) - numY(i)) / 6;
      d += ` C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${X(j)} ${Y(j)}`;
      nodes += 1;
    }
    return { d: `${d} Z`, nodes };
  }

  // Con esquinas: trocear el anillo en tramos [esquinaA → esquinaB].
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (anillo.esquinas[i]) idx.push(i);
  const m = idx.length;
  for (let t = 0; t < m; t++) {
    const a = idx[t];
    const b = idx[(t + 1) % m];
    // nº de vértices del tramo (ambas esquinas incluidas); con una única
    // esquina el tramo recorre el anillo completo y vuelve a ella.
    const len = m === 1 ? n + 1 : ((b - a + n) % n) + 1;
    if (len <= 2) {
      // Tramo recto entre dos esquinas contiguas.
      d += ` L ${X(b)} ${Y(b)}`;
      nodes += 1;
      continue;
    }
    for (let s = 0; s < len - 1; s++) {
      const i0 = (a + s) % n;
      const i1 = (a + s + 1) % n;
      const prev = s === 0 ? i0 : (a + s - 1) % n; // clampado: la esquina no toma tangente cruzada
      const next = s === len - 2 ? i1 : (a + s + 2) % n;
      const c1x = numX(i0) + (numX(i1) - numX(prev)) / 6;
      const c1y = numY(i0) + (numY(i1) - numY(prev)) / 6;
      const c2x = numX(i1) - (numX(next) - numX(i0)) / 6;
      const c2y = numY(i1) - (numY(next) - numY(i0)) / 6;
      d += ` C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${X(i1)} ${Y(i1)}`;
      nodes += 1;
    }
  }
  return { d: `${d} Z`, nodes };
}

/* ───────────────────────── Motor ───────────────────────── */

export const imagetracerEngine: VectorizerEngine = {
  id: "imagetracer-js",
  metadata: {
    license: "audited-ok",
    description:
      "Motor propio de VectorTinta: cuantización por histograma, filtro de motas por componentes conexas, contornos por marching squares sobre la retícula de píxeles, simplificación RDP con esquinas protegidas y curvas Catmull-Rom→Bézier. Implementación original de dominio público del proyecto (sin licencias de terceros).",
  },
  run(input: VectorizerRunInput, ctx: VectorizerRunContext): VectorizeResult {
    return vectorizar(input, ctx);
  },
};

function vectorizar({ imageData, params }: VectorizerRunInput, ctx: VectorizerRunContext): VectorizeResult {
  const { width: W, height: H, data } = imageData;
  if (!Number.isInteger(W) || !Number.isInteger(H) || W <= 0 || H <= 0 || data.length !== W * H * 4) {
    throw new EngineFailure(
      makeProblem("interno", {
        title: "Imagen malformada",
        detail: `RawImageData inconsistente: ${W}×${H} con ${data.length} bytes RGBA (esperados ${W * H * 4}).`,
        errors: [{ code: "raw_image_data_invalid" }],
      }),
    );
  }
  const report = ctx.onProgress ?? (() => undefined);
  const signal = ctx.signal;
  const total = W * H;

  /* ── Fase 1: cuantización de color ('cuantizando', 0→35 %) ──
     Histograma de buckets cuantizados con SUMAS de color ORIGINAL por bucket
     (el centro del bucket es su media real, no el valor cuantizado: fidelidad
     al arte). La paleta se elige con k-means ponderado (Lloyd) sobre buckets:
     los maxColors CENTROS de cluster, inicializados por frecuencia y
     refinados 12 pasadas. Contra la selección por frecuencia top (anterior),
     k-means no se deja robar clases por el RUIDO del arte de cliente (grano
     de generadores/JPEG reparte el histograma en miles de buckets y las
     "más frecuentes" dejan de ser los colores reales del diseño). Empates →
     menor índice de centro: determinismo total (misma entrada ⇒ misma salida).
  */
  report("cuantizando", 0);
  const shift = 8 - params.colorPrecision;
  const histCount = new Map<number, number>();
  const histSr = new Map<number, number>();
  const histSg = new Map<number, number>();
  const histSb = new Map<number, number>();
  for (let i = 0; i < total; i++) {
    const o = i << 2;
    if (data[o + 3] < 128) continue; // alfa < 128 = clase transparente: nunca forma capa
    const key = ((data[o] >> shift) << 16) | ((data[o + 1] >> shift) << 8) | (data[o + 2] >> shift);
    histCount.set(key, (histCount.get(key) ?? 0) + 1);
    histSr.set(key, (histSr.get(key) ?? 0) + data[o]);
    histSg.set(key, (histSg.get(key) ?? 0) + data[o + 1]);
    histSb.set(key, (histSb.get(key) ?? 0) + data[o + 2]);
    if ((i & (SIGNAL_EVERY - 1)) === 0) {
      ensureNotAborted(signal);
      report("cuantizando", Math.round((20 * i) / total));
    }
  }
  if (histCount.size === 0) {
    throw new EngineFailure(
      makeProblem("validacion", {
        title: "Nada que vectorizar",
        detail: "La imagen no tiene píxeles opacos: todas las clases serían transparentes y no quedaría ninguna capa.",
        errors: [{ code: "imagen_sin_pixeles_opacos" }],
      }),
    );
  }

  // Buckets ordenados por frecuencia DESC (empate → menor clave): semilla
  // determinista de los centros y orden de recorrido estable.
  const claves = Array.from(histCount.keys());
  claves.sort((a, b) => (histCount.get(b) as number) - (histCount.get(a) as number) || a - b);
  const K = Math.min(claves.length, params.maxColors);
  const TRANSPARENTE = K; // clase de los píxeles con alfa < 128

  // Centros iniciales: media REAL de color de los K buckets más frecuentes.
  const centros = new Float64Array(K * 3);
  for (let c = 0; c < K; c++) {
    const k = claves[c];
    const n = histCount.get(k) as number;
    centros[3 * c] = (histSr.get(k) as number) / n;
    centros[3 * c + 1] = (histSg.get(k) as number) / n;
    centros[3 * c + 2] = (histSb.get(k) as number) / n;
  }
  // Medias por bucket (fijas): el "color" del bucket para Lloyd y para el
  // mapeo píxel→clase.
  const br = new Float64Array(claves.length);
  const bg = new Float64Array(claves.length);
  const bb = new Float64Array(claves.length);
  for (let bi = 0; bi < claves.length; bi++) {
    const k = claves[bi];
    const n = histCount.get(k) as number;
    br[bi] = (histSr.get(k) as number) / n;
    bg[bi] = (histSg.get(k) as number) / n;
    bb[bi] = (histSb.get(k) as number) / n;
  }
  // Lloyd ponderado por recuento; 12 pasadas o estabilización (Δ centro < 0.5).
  const asignacion = new Int32Array(claves.length);
  for (let it = 0; it < 12; it++) {
    let delta = 0;
    const sumCr = new Float64Array(K);
    const sumCg = new Float64Array(K);
    const sumCb = new Float64Array(K);
    const sumCn = new Float64Array(K);
    for (let bi = 0; bi < claves.length; bi++) {
      const n = histCount.get(claves[bi]) as number;
      let mejor = 0;
      let mejorD = Infinity;
      for (let j = 0; j < K; j++) {
        const dr = br[bi] - centros[3 * j];
        const dg = bg[bi] - centros[3 * j + 1];
        const db = bb[bi] - centros[3 * j + 2];
        const d = dr * dr + dg * dg + db * db;
        if (d < mejorD) {
          mejorD = d;
          mejor = j;
        }
      }
      asignacion[bi] = mejor;
      sumCr[mejor] += br[bi] * n;
      sumCg[mejor] += bg[bi] * n;
      sumCb[mejor] += bb[bi] * n;
      sumCn[mejor] += n;
    }
    for (let j = 0; j < K; j++) {
      if (sumCn[j] === 0) continue; // centro sin buckets: conserva su posición
      const nr = sumCr[j] / sumCn[j];
      const ng = sumCg[j] / sumCn[j];
      const nb = sumCb[j] / sumCn[j];
      delta = Math.max(delta, Math.abs(nr - centros[3 * j]) + Math.abs(ng - centros[3 * j + 1]) + Math.abs(nb - centros[3 * j + 2]));
      centros[3 * j] = nr;
      centros[3 * j + 1] = ng;
      centros[3 * j + 2] = nb;
    }
    if (delta < 0.5) break; // estabilizado: pasadas extra no aportan
  }
  report("cuantizando", 25);

  // Mapa de clase por píxel: bucket → centro más cercano (caché por clave),
  // empate → menor índice de centro.
  const classMap = new Int32Array(total);
  const cache = new Map<number, number>();
  const claveAIndice = new Map<number, number>();
  for (let bi = 0; bi < claves.length; bi++) claveAIndice.set(claves[bi], bi);
  for (let i = 0; i < total; i++) {
    const o = i << 2;
    if (data[o + 3] < 128) {
      classMap[i] = TRANSPARENTE;
      continue;
    }
    const key = ((data[o] >> shift) << 16) | ((data[o + 1] >> shift) << 8) | (data[o + 2] >> shift);
    let cls = cache.get(key);
    if (cls === undefined) {
      const bi = claveAIndice.get(key) as number;
      const biIdx = bi;
      let mejor = 0;
      let mejorD = Infinity;
      for (let j = 0; j < K; j++) {
        const dr = br[biIdx] - centros[3 * j];
        const dg = bg[biIdx] - centros[3 * j + 1];
        const db = bb[biIdx] - centros[3 * j + 2];
        const d = dr * dr + dg * dg + db * db;
        if (d < mejorD) {
          mejorD = d;
          mejor = j;
        }
      }
      cls = mejor;
      cache.set(key, cls);
    }
    classMap[i] = cls;
    if ((i & (SIGNAL_EVERY - 1)) === 0) {
      ensureNotAborted(signal);
      report("cuantizando", 25 + Math.round((10 * i) / total));
    }
  }
  report("cuantizando", 35);

  /* ── Fase 2: filtro de motas ('filtrando', 35→55 %) ── */
  // Componentes conexas 4-vecinos POR CLASE; regiones con área < filterSpeckle
  // se reasignan a la clase vecina más frecuente en su frontera (empate →
  // menor índice de clase). Itera hasta estabilizar, máx. 3 pases. La clase
  // transparente participa como una clase más: los huecos diminutos se
  // rellenan y las islas sueltas se convierten en hueco.
  report("filtrando", 35);
  const minArea = params.filterSpeckle;
  if (minArea > 1) {
    const label = new Int32Array(total); // -1 = sin etiquetar en el pase actual
    const cola = new Int32Array(total);
    const conteo = new Int32Array(K + 1); // histograma de clases en la frontera
    const tocadas: number[] = []; // clases con conteo > 0 (reset selectivo)
    for (let pase = 0; pase < 3; pase++) {
      let cambios = 0;
      label.fill(-1);
      for (let s = 0; s < total; s++) {
        if (label[s] !== -1) continue;
        const cls = classMap[s];
        let head = 0;
        let tail = 0;
        cola[tail++] = s;
        label[s] = 0;
        tocadas.length = 0;
        let area = 0;
        while (head < tail) {
          const p = cola[head++];
          area += 1;
          const px = p % W;
          const py = (p - px) / W;
          const vecinos = [
            px > 0 ? p - 1 : -1,
            px < W - 1 ? p + 1 : -1,
            py > 0 ? p - W : -1,
            py < H - 1 ? p + W : -1,
          ];
          for (const q of vecinos) {
            if (q < 0) continue;
            const cq = classMap[q];
            if (cq === cls) {
              if (label[q] === -1) {
                label[q] = 0;
                cola[tail++] = q;
              }
            } else {
              if (conteo[cq] === 0) tocadas.push(cq);
              conteo[cq] += 1; // frecuencia por adyacencia de frontera
            }
          }
        }
        if (area < minArea && tocadas.length > 0) {
          // Objetivo: clase frontera más frecuente; empate → menor índice.
          let objetivo = tocadas[0];
          let mejor = conteo[objetivo];
          for (let ti = 1; ti < tocadas.length; ti++) {
            const c = tocadas[ti];
            const nC = conteo[c];
            if (nC > mejor || (nC === mejor && c < objetivo)) {
              objetivo = c;
              mejor = nC;
            }
          }
          for (let qi = 0; qi < tail; qi++) classMap[cola[qi]] = objetivo;
          cambios += 1;
        }
        for (const c of tocadas) conteo[c] = 0;
      }
      ensureNotAborted(signal);
      report("filtrando", 35 + Math.round((20 * (pase + 1)) / 3));
      if (cambios === 0) break; // estabilizado antes del tope de pases
    }
  } else {
    report("filtrando", 55);
  }

  /* ── Recuento tras el filtro + ordenación estable de píxeles por clase ── */
  const areas = new Int32Array(K);
  for (let i = 0; i < total; i++) {
    const c = classMap[i];
    if (c < K) areas[c] += 1;
  }
  const classStart = new Int32Array(K + 1);
  for (let c = 0; c < K; c++) classStart[c + 1] = classStart[c] + areas[c];
  const cursor = new Int32Array(classStart.subarray(0, K));
  const pixelDeClase = new Int32Array(classStart[K]); // solo píxeles opacos
  for (let i = 0; i < total; i++) {
    const c = classMap[i];
    if (c < K) pixelDeClase[cursor[c]++] = i;
  }

  /* ── Fases 3+4: trazado de contornos + simplificación ('trazando' 55→85 con
     'simplificando' dentro) ──
     Marching squares sobre la retícula de píxeles: aristas dirigidas por el
     borde entre píxeles de la clase y píxeles distintos (con la clase siempre
     a la IZQUIERDA de la marcha). El sucesor de cada arista se deduce del
     bloque 2×2 que rodea el vértice de llegada; en las sillas diagonales
     (dos píxeles tocándose por la esquina) se gira SIEMPRE a la izquierda,
     lo que mantiene como contornos separados dos regiones que solo se tocan
     en un punto. Exterior e islas/holes se obtienen con la misma regla y
     conviven en un único path con fill-rule="evenodd". */
  const stride = W + 2;
  const padded = new Int32Array(stride * (H + 2)).fill(-2); // -2 = fuera de rango
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) padded[(y + 1) * stride + (x + 1)] = classMap[y * W + x];
  }
  const visited = new Uint8Array((W + 1) * (H + 1) * 4); // arista dirigida → 1
  const anillosPorClase: Anillo[][] = new Array(K);
  for (let c = 0; c < K; c++) anillosPorClase[c] = [];
  const eps = params.lengthThreshold / 2;

  for (let c = 0; c < K; c++) {
    if (areas[c] === 0) continue; // clase vacía tras el filtro → excluida
    visited.fill(0);
    report("trazando", 55 + Math.round((30 * c) / K));

    const esDeClase = (vx: number, vy: number): number => (padded[vy * stride + vx] === c ? 1 : 0);

    const intentarAnillo = (vx: number, vy: number, dir: number): void => {
      const startKey = (vy * (W + 1) + vx) * 4 + dir;
      if (visited[startKey] === 1) return;
      visited[startKey] = 1;
      const pts: number[] = [vx, vy];
      let cx = vx;
      let cy = vy;
      let cd = dir;
      let pasos = 0;
      for (;;) {
        const nx = cx + DX[cd];
        const ny = cy + DY[cd];
        // Bloque 2×2 alrededor del vértice de llegada (nw, ne, sw, se).
        const nw = esDeClase(nx, ny);
        const ne = esDeClase(nx + 1, ny);
        const sw = esDeClase(nx, ny + 1);
        const se = esDeClase(nx + 1, ny + 1);
        // Salidas posibles (la clase siempre a la izquierda de la marcha):
        // UP: nw&&!ne · RIGHT: ne&&!se · DOWN: se&&!sw · LEFT: sw&&!nw.
        let cand = 0;
        if (nw === 1 && ne === 0) cand |= 1;
        if (ne === 1 && se === 0) cand |= 2;
        if (se === 1 && sw === 0) cand |= 4;
        if (sw === 1 && nw === 0) cand |= 8;
        let od: number;
        if (cand === 1) od = 0;
        else if (cand === 2) od = 1;
        else if (cand === 4) od = 2;
        else if (cand === 8) od = 3;
        else if (cand !== 0) od = (cd + 3) & 3; // silla diagonal: giro a la izquierda
        else {
          // Inalcanzable con el invariante in-degree = out-degree; defensa.
          throw new EngineFailure(
            makeProblem("interno", {
              title: "Trazado de contorno inconsistente",
              detail: `Vértice (${nx},${ny}) sin arista de salida para la clase ${c}.`,
              errors: [{ code: "marching_squares_sin_salida" }],
            }),
          );
        }
        const nkey = (ny * (W + 1) + nx) * 4 + od;
        if (nkey === startKey) {
          // Cierre: el vértice inicial solo es esquina si la dirección cambia.
          if (cd === dir) pts.splice(0, 2);
          break;
        }
        if (od !== cd) pts.push(nx, ny); // vértice solo en los cambios de dirección
        visited[nkey] = 1;
        cx = nx;
        cy = ny;
        cd = od;
        pasos += 1;
        if (pasos > MAX_WALK_STEPS) {
          throw new EngineFailure(
            makeProblem("interno", {
              title: "Trazado de contorno sin fin",
              detail: "El paseo de contorno superó el máximo de pasos físicamente posible.",
              errors: [{ code: "marching_squares_sin_terminacion" }],
            }),
          );
        }
      }
      const anillo = simplificarAnillo(pts, eps, params.cornerThreshold);
      if (anillo !== null) {
        anillosPorClase[c].push(anillo);
      } else {
        // RDP colapsó el anillo, pero sus píxeles son REALES (área ≥ filterSpeckle):
        // la simplificación jamás puede destruir cobertura; se conserva el
        // contorno bruto con las esquinas sin marcar (el spline las suaviza).
        const bruto = anilloBruto(pts);
        if (bruto !== null) anillosPorClase[c].push(bruto);
      }
      ensureNotAborted(signal);
    };

    // Descubrimiento de aristas: cada píxel de la clase aporta una arista por
    // lado que linda con un píxel distinto (o el borde exterior de la imagen).
    for (let pi = classStart[c]; pi < classStart[c + 1]; pi++) {
      const p = pixelDeClase[pi];
      const x = p % W;
      const y = (p - x) / W;
      // Lado este → arista Up desde (x+1, y+1); vecino (x+1, y).
      if (padded[(y + 1) * stride + (x + 2)] !== c) intentarAnillo(x + 1, y + 1, 0);
      // Lado oeste → arista Down desde (x, y); vecino (x-1, y).
      if (padded[(y + 1) * stride + x] !== c) intentarAnillo(x, y, 2);
      // Lado sur → arista Right desde (x, y+1); vecino (x, y+1).
      if (padded[(y + 2) * stride + (x + 1)] !== c) intentarAnillo(x, y + 1, 1);
      // Lado norte → arista Left desde (x+1, y); vecino (x, y-1).
      if (padded[y * stride + (x + 1)] !== c) intentarAnillo(x + 1, y, 3);
    }
    report("simplificando", 55 + Math.round((30 * (c + 1)) / K));
  }
  report("trazando", 85);
  report("simplificando", 85);

  /* ── Fase 5: serialización ('serializando', 85→100 %) ── */
  // Color REPRESENTATIVO de cada clase = media de los colores ORIGINALES de
  // sus píxeles (fidelidad al arte, no el valor cuantizado).
  const sumas = new Float64Array(K * 3);
  for (let i = 0; i < total; i++) {
    const c = classMap[i];
    if (c < K) {
      const o = i << 2;
      sumas[3 * c] += data[o];
      sumas[3 * c + 1] += data[o + 1];
      sumas[3 * c + 2] += data[o + 2];
    }
  }

  // Orden de capas: área total DESC (esa es el `orden` 0,1,2…); empate →
  // índice de clase ASC (orden estable). Clases sin geometría superviviente
  // quedan excluidas (p. ej. motas colapsadas por RDP hasta < 3 puntos).
  const candidatos: number[] = [];
  for (let c = 0; c < K; c++) {
    if (areas[c] > 0 && anillosPorClase[c].length > 0) candidatos.push(c);
  }
  candidatos.sort((a, b) => areas[b] - areas[a] || a - b);
  if (candidatos.length === 0) {
    throw new EngineFailure(
      makeProblem("validacion", {
        title: "Nada que vectorizar",
        detail: "Ninguna clase de color conserva contornos con área tras el filtro de motas y la simplificación.",
        errors: [{ code: "sin_geometria_exportable" }],
      }),
    );
  }

  report("serializando", 85);
  const layers: LayerDraft[] = [];
  const grupos: string[] = [];
  let nodeCount = 0;
  for (let i = 0; i < candidatos.length; i++) {
    const c = candidatos[i];
    const r = Math.round(sumas[3 * c] / areas[c]);
    const g = Math.round(sumas[3 * c + 1] / areas[c]);
    const b = Math.round(sumas[3 * c + 2] / areas[c]);
    const colorHex = toHex(Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b)));
    const orden = i; // índice en el orden de apilado por área DESC
    const name = suggestInkName(colorHex, orden);

    let d = "";
    for (const anillo of anillosPorClase[c]) {
      const s = serializarAnillo(anillo, params.mode);
      d += (d === "" ? "" : " ") + s.d;
      nodeCount += s.nodes;
    }
    const fragmentSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><path d="${d}" fill="${colorHex}" fill-rule="evenodd"/></svg>`;
    layers.push({ orden, colorHex, name, areaPx: areas[c], fragmentSvg });
    grupos.push(`<g data-layer-orden="${orden}"><path d="${d}" fill="${colorHex}" fill-rule="evenodd"/></g>`);
    report("serializando", 85 + Math.round((15 * (i + 1)) / candidatos.length));
  }

  /**
   * La composición exportada es EXACTAMENTE la unión de las separaciones (sin
   * fondos de relleno). Se PROBÓ un rect de fondo base para tapar los
   * filamentos subpíxel entre separaciones (medido: +0,03 en el caso-2), pero
   * era un error por grosero: entre dos clases OSCURAS el filamento se
   * rellenaba con el color claro de la capa 0 (−0,16 / −0,19 SSIM en los
   * casos 1 y 3; matriz completa en docs/fixtures/README.md, Iteración 2).
   * Los filamentos entre tintas son inherentes a la separación por tintas y
   * en serigrafía real se resuelven con trapping, no con capas de relleno.
   */
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${grupos.join("")}</svg>`;
  return { svg, nodeCount, layers };
}
