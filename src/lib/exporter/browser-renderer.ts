/**
 * VectorTinta — Renderizador de capas para el mockup PNG (SOLO NAVEGADOR).
 *
 * Este módulo es la frontera explícita con el DOM del hilo principal:
 * `createBrowserMockupDeps()` fabrica las dependencias que `buildMockup`
 * (formats/png-mockup.ts) inyecta. Al mantenerlas INYECTABLES, la lógica de
 * composición y el manifest son verificables fuera del navegador (scripts de
 * verificación con deps falsos); aquí solo queda la parte irreductiblemente
 * del navegador: Blob → objectURL → <img> → drawImage y canvas.toBlob.
 *
 * No se importa desde ningún Worker (export.worker rechaza png-mockup).
 */

/** Imagen de capa ya decodificada, lista para dibujarse sobre el contexto 2D. */
export interface LayerImage {
  width: number;
  height: number;
  draw(ctx: CanvasRenderingContext2D): void;
}

/** Canvas abstracto: suficiente para componer y extraer los bytes del PNG. */
export interface MockupCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): CanvasRenderingContext2D | null;
  toBlob(): Promise<Uint8Array>;
}

/** Dependencias de rasterización que `buildMockup` consume. */
export interface MockupDeps {
  loadImage(svg: string): Promise<LayerImage>;
  createCanvas(width: number, height: number): MockupCanvas;
}

/** Implementación real de navegador de las dependencias del mockup. */
export function createBrowserMockupDeps(): MockupDeps {
  return {
    async loadImage(svg: string): Promise<LayerImage> {
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        img.src = url;
        await img.decode(); // el bitmap queda en memoria; revocar la URL no lo invalida
        return {
          width: img.naturalWidth,
          height: img.naturalHeight,
          draw(ctx: CanvasRenderingContext2D): void {
            ctx.drawImage(img, 0, 0);
          },
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    createCanvas(width: number, height: number): MockupCanvas {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return {
        width,
        height,
        getContext(type: "2d"): CanvasRenderingContext2D | null {
          return canvas.getContext(type);
        },
        async toBlob(): Promise<Uint8Array> {
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
          if (blob === null) {
            throw new Error("canvas.toBlob no produjo un PNG (image/png)");
          }
          return new Uint8Array(await blob.arrayBuffer());
        },
      };
    },
  };
}
