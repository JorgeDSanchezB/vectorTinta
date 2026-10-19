/**
 * VectorTinta — Motor propio de eliminación de fondo `chroma-edge` (ADR-009).
 *
 * Algoritmo (implementación real, O(W·H), typed arrays planos):
 *  1. SEMBRADO ('sembrando', 5 %): todos los píxeles del PERÍMETRO son
 *     semillas del relleno por similitud. Cada semilla recuerda su propio
 *     color como COLOR DE REFERENCIA de su componente ("similitud al color de
 *     la semilla de su componente"): los colores duplicados del borde
 *     comparten id de referencia (paleta pequeña de tags).
 *  2. RELLENADO ('rellenando', 5→80 %): BFS multi-fuente con cola plana
 *     Uint32Array; un píxel se alcanza si su distancia euclídea RGB al color
 *     de referencia del componente que lo reclama es ≤ tolerance/100 · 441.67
 *     (normalización del rango máximo √(255²·3)). Primera reclamación gana
 *     (orden FIFO determinista). Los alcanzados → alfa 0.
 *  3. Píxeles con alfa < 128 ENTRADA: se tratan como fondo alcanzado (máscara
 *     0) pero NO propagan el relleno (su RGB es arbitrario tras un recorte
 *     previo); el flujo les rodea.
 *  4. SUAVIZADO ('suavizando', 80→100 %): con `feather`, los píxeles opacos
 *     4-adyacentes a la frontera alcanzable con distancia ≤ tolerance·1.35
 *     reciben alfa interpolado linealmente 0..255 (suavizado de 1 paso).
 *
 * `alphaMask` es un RawImageData RGBA cuyo canal A ES la máscara (0/255/inter-
 * polado) y cuyos RGB van a blanco (la máscara es SOLO alfa). `removedPx`
 * cuenta los píxeles con alfa 0 tras la operación (incluidos los que ya eran
 * transparentes en la entrada). Resultado REVERSIBLE: la máscara es un
 * comando del historial (undo restaura el alfa original).
 */
import type { BgRemovalResult, RawImageData } from "@/lib/domain/entities";
import { makeProblem } from "@/lib/domain/errors";
import { EngineFailure, OperationCancelled, type BackgroundRemovalEngine, type BgRemovalRunContext, type BgRemovalRunInput } from "../types";

/** Rango máximo de la distancia euclídea RGB: √(255² · 3) ≈ 441.67. */
const MAX_RGB_DISTANCE = 441.67;

/** Cada cuántos píxeos se comprueba cancelación/progreso. */
const SIGNAL_EVERY = 1 << 16;

export const chromaEdgeEngine: BackgroundRemovalEngine = {
  id: "chroma-edge",
  metadata: {
    license: "audited-ok",
    description:
      "Relleno por similitud de color desde los cuatro bordes de la imagen (croma de borde), pensado para los fondos planos del taller de estampación. Reversible: el resultado es una máscara alfa que el historial puede deshacer. Implementación propia.",
  },
  remove(input: BgRemovalRunInput, options: { tolerance: number; feather: boolean }, ctx: BgRemovalRunContext): BgRemovalResult {
    const { width: W, height: H, data } = input.imageData;
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
    const tolPx = (options.tolerance / 100) * MAX_RGB_DISTANCE;
    const tol2 = tolPx * tolPx;

    // Máscara RGBA: RGB blanco fijo, A = 0 (fondo) | 255 (sujeto) | interpolado.
    const mask = new Uint8ClampedArray(total * 4);
    for (let o = 0; o < mask.length; o += 4) {
      mask[o] = 255;
      mask[o + 1] = 255;
      mask[o + 2] = 255;
      mask[o + 3] = 255;
    }
    const visitado = new Uint8Array(total);
    const claim = new Uint16Array(total); // id del color de referencia del componente que alcanzó el píxel
    const cola = new Int32Array(total);
    let head = 0;
    let tail = 0;

    // Paleta de colores de referencia (uno por color distinto del perímetro).
    const tagColors: number[] = []; // [r,g,b, r,g,b, …]
    const tagId = new Map<number, number>();

    report("sembrando", 5);
    const sembrar = (x: number, y: number): void => {
      const p = y * W + x;
      if (visitado[p] === 1) return;
      visitado[p] = 1;
      const o = p << 2;
      if (data[o + 3] < 128) {
        mask[o + 3] = 0; // ya transparente: fondo alcanzado, no propaga
        return;
      }
      mask[o + 3] = 0; // todo el perímetro es fondo por definición
      const key = (data[o] << 16) | (data[o + 1] << 8) | data[o + 2];
      let t = tagId.get(key);
      if (t === undefined) {
        t = tagColors.length / 3;
        tagId.set(key, t);
        tagColors.push(data[o], data[o + 1], data[o + 2]);
      }
      claim[p] = t;
      cola[tail++] = p;
    };
    for (let x = 0; x < W; x++) {
      sembrar(x, 0);
      sembrar(x, H - 1);
    }
    for (let y = 1; y < H - 1; y++) {
      sembrar(0, y);
      sembrar(W - 1, y);
    }
    if (signal?.aborted) throw new OperationCancelled();

    // Relación de un píxel con el color de referencia de la componente que lo alcanza.
    const intentarAlcanzar = (q: number, t: number): void => {
      if (visitado[q] === 1) return;
      visitado[q] = 1;
      const o = q << 2;
      if (data[o + 3] < 128) {
        mask[o + 3] = 0; // fondo ya transparente; no propaga
        return;
      }
      const tr = tagColors[3 * t];
      const tg = tagColors[3 * t + 1];
      const tb = tagColors[3 * t + 2];
      const dr = data[o] - tr;
      const dg = data[o + 1] - tg;
      const db = data[o + 2] - tb;
      if (dr * dr + dg * dg + db * db <= tol2) {
        mask[o + 3] = 0;
        claim[q] = t;
        cola[tail++] = q;
      }
    };

    report("rellenando", 8);
    let procesados = 0;
    while (head < tail) {
      const p = cola[head++];
      procesados += 1;
      const t = claim[p];
      const px = p % W;
      const py = (p - px) / W;
      if (px > 0) intentarAlcanzar(p - 1, t);
      if (px < W - 1) intentarAlcanzar(p + 1, t);
      if (py > 0) intentarAlcanzar(p - W, t);
      if (py < H - 1) intentarAlcanzar(p + W, t);
      if ((head & (SIGNAL_EVERY - 1)) === 0) {
        if (signal?.aborted) throw new OperationCancelled();
        report("rellenando", 8 + Math.round((72 * procesados) / Math.max(1, total)));
      }
    }
    if (signal?.aborted) throw new OperationCancelled();
    report("rellenando", 80);

    // Suavizado de 1 paso: banda de 1 px en la frontera del sujeto.
    report("suavizando", 80);
    if (options.feather && tolPx > 0) {
      const relajado = tolPx * 1.35;
      const rel2 = relajado * relajado;
      const ancho = relajado - tolPx; // > 0 garantizado por el guard
      for (let p = 0; p < total; p++) {
        const o = p << 2;
        if (mask[o + 3] === 255) {
          const px = p % W;
          const py = (p - px) / W;
          let mejor2 = Infinity;
          // Vecinos alcanzados por el FLUJO (opacos en la entrada): dan la
          // distancia al color de referencia de su componente.
          const considerar = (q: number): void => {
            if (visitado[q] !== 1) return;
            const oq = q << 2;
            if (data[oq + 3] < 128) return; // pre-transparente: sin tag
            const t = claim[q];
            const tr = tagColors[3 * t];
            const tg = tagColors[3 * t + 1];
            const tb = tagColors[3 * t + 2];
            const dr = data[o] - tr;
            const dg = data[o + 1] - tg;
            const db = data[o + 2] - tb;
            const d2 = dr * dr + dg * dg + db * db;
            if (d2 < mejor2) mejor2 = d2;
          };
          if (px > 0) considerar(p - 1);
          if (px < W - 1) considerar(p + 1);
          if (py > 0) considerar(p - W);
          if (py < H - 1) considerar(p + W);
          if (mejor2 <= rel2) {
            const d = Math.sqrt(mejor2);
            const alfa = Math.round((255 * (d - tolPx)) / ancho);
            mask[o + 3] = alfa < 0 ? 0 : alfa > 255 ? 255 : alfa;
          }
        }
        if ((p & (SIGNAL_EVERY - 1)) === 0) {
          if (signal?.aborted) throw new OperationCancelled();
          report("suavizando", 80 + Math.round((20 * p) / total));
        }
      }
    }
    if (signal?.aborted) throw new OperationCancelled();
    report("suavizando", 100);

    let removedPx = 0;
    for (let p = 0; p < total; p++) {
      if (mask[(p << 2) + 3] === 0) removedPx += 1;
    }
    const alphaMask: RawImageData = { width: W, height: H, data: mask };
    return { alphaMask, removedPx, totalPx: total };
  },
};
