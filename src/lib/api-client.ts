/**
 * VectorTinta — Cliente HTTP tipado (plan §3 + §5.6).
 *
 * Responsabilidades:
 *  - Adjunta `Authorization: Bearer` (el accessToken vive SOLO en memoria).
 *  - 401 → intenta `POST /api/auth/refresh` (cookie httpOnly, single-flight)
 *    y reintenta UNA vez; si el refresh falla → `SessionExpiredError`.
 *  - 503 temporal → reintento con backoff exponencial (hasta 3 intentos,
 *    failure-modes.md) en las mutaciones marcadas `retryOnTemporales`.
 *  - TODO error 4xx/5xx se parsea como RFC 7807 (domain/errors) y se lanza
 *    como `ApiProblem`; los toasts y paneles consumen `.problem`.
 *  - sha-256 con WebCrypto (subidas y exportaciones, S-06).
 */
"use client";

import {
  ApiProblem,
  looksLikeProblem,
  makeProblem,
  type Problem,
} from "@/lib/domain/errors";
import type {
  AssetDto,
  AuthResponseDto,
  ExportDto,
  HealthDto,
  LayerDto,
  MetricsDto,
  Paginated,
  ProjectDto,
  ProjectListItemDto,
  ProjectWorkspaceDto,
  RawImageData,
  UserDto,
  VectorizationDto,
  VectorParams,
} from "@/lib/domain/entities";

/* ─────────────────────── Token holder (memoria) ─────────────────────── */

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Sesión caducada: el AuthGate reacciona presentando el acceso. */
export class SessionExpiredError extends Error {
  constructor() {
    super("La sesión ha caducado");
    this.name = "SessionExpiredError";
  }
}

/* ─────────────────────── Núcleo fetch ─────────────────────── */

interface RequestOptions {
  method?: string;
  body?: BodyInit;
  headers?: Record<string, string>;
  /** false → ni Bearer ni refresh (rutas públicas). */
  auth?: boolean;
  /** Reintentos con backoff ante 503 (errores temporales). */
  retryTemporal?: boolean;
  signal?: AbortSignal;
}

const BACKOFF_MS = [600, 1500, 3000] as const; // reintentos 503 (3 intentos)

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include", // cookie httpOnly vt_refresh
    });
    if (!res.ok) return false;
    const data = (await res.json()) as AuthResponseDto;
    accessToken = data.accessToken;
    return true;
  } catch {
    return false;
  }
}

async function rawRequest(path: string, opts: RequestOptions, depth503 = 0): Promise<Response> {
  const headers = new Headers(opts.headers);
  if (opts.auth !== false && accessToken !== null) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (opts.body !== undefined && !headers.has("Content-Type") && typeof opts.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, {
    method: opts.method ?? "GET",
    body: opts.body,
    headers,
    credentials: "include",
    signal: opts.signal,
  });

  // 503 temporal → backoff y reintento (failure-modes: error temporal).
  if (res.status === 503 && opts.retryTemporal && depth503 < BACKOFF_MS.length) {
    await new Promise((r) => setTimeout(r, BACKOFF_MS[depth503]));
    return rawRequest(path, opts, depth503 + 1);
  }

  // 401 → refresh single-flight y reintento único.
  if (res.status === 401 && opts.auth !== false && !path.startsWith("/api/auth/")) {
    const refreshed = await tryRefresh();
    if (refreshed) return rawRequest(path, opts);
  }
  return res;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await rawRequest(path, opts);
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") throw e;
    throw new ApiProblem(
      makeProblem("temporal", {
        title: "Sin conexión con el servidor",
        detail: e instanceof Error ? e.message : "Error de red",
      }),
    );
  }

  if (res.status === 401 && opts.auth !== false) {
    throw new SessionExpiredError();
  }

  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    if (looksLikeProblem(payload)) {
      throw new ApiProblem(payload as Problem);
    }
    throw new ApiProblem(
      makeProblem("interno", {
        title: `Error HTTP ${res.status}`,
        detail: text.slice(0, 300) || `La petición a ${path} falló sin cuerpo.`,
      }),
    );
  }
  return payload as T;
}

/* ─────────────────────── sha-256 (WebCrypto, S-06) ─────────────────────── */

export async function sha256Hex(bytes: ArrayBuffer | Blob | Uint8Array): Promise<string> {
  const buf = bytes instanceof Blob ? await bytes.arrayBuffer() : bytes instanceof Uint8Array ? bytes.slice().buffer : bytes;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ─────────────────────── API tipada ─────────────────────── */

export const api = {
  /* ── Auth ── */
  auth: {
    async register(input: { email: string; password: string; name?: string }): Promise<AuthResponseDto> {
      const data = await request<AuthResponseDto>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
        auth: false,
      });
      accessToken = data.accessToken;
      return data;
    },
    async login(input: { email: string; password: string }): Promise<AuthResponseDto> {
      const data = await request<AuthResponseDto>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
        auth: false,
      });
      accessToken = data.accessToken;
      return data;
    },
    async guest(): Promise<AuthResponseDto> {
      const data = await request<AuthResponseDto>("/api/auth/guest", {
        method: "POST",
        auth: false,
      });
      accessToken = data.accessToken;
      return data;
    },
    async logout(): Promise<void> {
      try {
        await request<void>("/api/auth/logout", { method: "POST" });
      } finally {
        accessToken = null;
      }
    },
  },

  /* ── Proyectos ── */
  projects: {
    async list(params?: { limit?: number; cursor?: string }): Promise<Paginated<ProjectListItemDto>> {
      const q = new URLSearchParams();
      if (params?.limit !== undefined) q.set("limit", String(params.limit));
      if (params?.cursor !== undefined) q.set("cursor", params.cursor);
      const qs = q.toString();
      return request<Paginated<ProjectListItemDto>>(`/api/projects${qs ? `?${qs}` : ""}`);
    },
    async create(input: { name: string; description?: string | null }): Promise<ProjectDto> {
      const data = await request<{ project: ProjectDto }>("/api/projects", {
        method: "POST",
        body: JSON.stringify(input),
        retryTemporal: true,
      });
      return data.project;
    },
    async get(id: string): Promise<ProjectWorkspaceDto> {
      return request<ProjectWorkspaceDto>(`/api/projects/${id}`);
    },
    async patch(
      id: string,
      input: { name?: string; description?: string | null; thumbnailKey?: string; thumbnailAssetId?: string },
    ): Promise<ProjectDto> {
      const data = await request<{ project: ProjectDto }>(`/api/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
        retryTemporal: true,
      });
      return data.project;
    },
    async remove(id: string): Promise<void> {
      await request<void>(`/api/projects/${id}`, { method: "DELETE", retryTemporal: true });
    },
  },

  /* ── Assets ── */
  assets: {
    async upload(
      projectId: string,
      input: {
        file: File;
        role: "source" | "result" | "thumbnail";
        width: number;
        height: number;
        checksum: string;
      },
    ): Promise<AssetDto> {
      const form = new FormData();
      form.set("file", input.file);
      form.set("role", input.role);
      form.set("width", String(input.width));
      form.set("height", String(input.height));
      form.set("checksum", input.checksum);
      const data = await request<{ asset: AssetDto }>(`/api/projects/${projectId}/assets`, {
        method: "POST",
        body: form,
        retryTemporal: true,
      });
      return data.asset;
    },
    async list(projectId: string, params?: { limit?: number; cursor?: string }): Promise<Paginated<AssetDto>> {
      const q = new URLSearchParams();
      if (params?.limit !== undefined) q.set("limit", String(params.limit));
      if (params?.cursor !== undefined) q.set("cursor", params.cursor);
      const qs = q.toString();
      return request<Paginated<AssetDto>>(`/api/projects/${projectId}/assets${qs ? `?${qs}` : ""}`);
    },
  },

  /* ── Vectorización ── */
  vectorize: {
    async run(
      projectId: string,
      input: {
        presetId: string;
        engineId: string;
        sourceAssetId: string;
        params: VectorParams;
        svg: string;
        layers: { orden: number; colorHex: string; name: string; areaPx: number; fragmentSvg: string }[];
      },
    ): Promise<{ vectorization: VectorizationDto; layers: LayerDto[] }> {
      return request(`/api/projects/${projectId}/vectorize`, {
        method: "POST",
        body: JSON.stringify(input),
        retryTemporal: true,
      });
    },
  },

  /* ── Capas ── */
  layers: {
    async patch(
      projectId: string,
      layerId: string,
      input: { colorHex?: string; name?: string; visible?: boolean; orden?: number },
    ): Promise<LayerDto> {
      const data = await request<{ layer: LayerDto }>(`/api/projects/${projectId}/layers/${layerId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
        retryTemporal: true,
      });
      return data.layer;
    },
    async duplicate(
      projectId: string,
      input: { sourceLayerId: string; colorHex?: string; name?: string },
    ): Promise<LayerDto> {
      const data = await request<{ layer: LayerDto }>(`/api/projects/${projectId}/layers`, {
        method: "POST",
        body: JSON.stringify(input),
        retryTemporal: true,
      });
      return data.layer;
    },
  },

  /* ── Exportaciones ── */
  exports: {
    async register(
      projectId: string,
      input: { file: Blob; fileName: string; formatId: string; manifestJson: string; checksum: string },
    ): Promise<ExportDto> {
      const form = new FormData();
      form.set("file", input.file, input.fileName);
      form.set("formatId", input.formatId);
      form.set("manifestJson", input.manifestJson);
      form.set("checksum", input.checksum);
      const data = await request<{ export: ExportDto }>(`/api/projects/${projectId}/exports`, {
        method: "POST",
        body: form,
        retryTemporal: true,
      });
      return data.export;
    },
    async list(projectId: string, params?: { limit?: number; cursor?: string }): Promise<Paginated<ExportDto>> {
      const q = new URLSearchParams();
      if (params?.limit !== undefined) q.set("limit", String(params.limit));
      if (params?.cursor !== undefined) q.set("cursor", params.cursor);
      const qs = q.toString();
      return request<Paginated<ExportDto>>(`/api/projects/${projectId}/exports${qs ? `?${qs}` : ""}`);
    },
  },

  /* ── Sistema ── */
  system: {
    async health(): Promise<HealthDto> {
      return request<HealthDto>("/api/health", { auth: false });
    },
    async metrics(): Promise<MetricsDto> {
      return request<MetricsDto>("/api/metrics", { auth: false });
    },
  },

  /** Descarga bytes de un asset firmado (`/api/assets/…?t=…`). */
  async fetchAssetBlob(url: string, signal?: AbortSignal): Promise<Blob> {
    const res = await fetch(url, { credentials: "include", signal });
    if (!res.ok) {
      let problem: Problem = makeProblem("temporal", { title: `Descarga fallida (${res.status})` });
      try {
        const payload = await res.json();
        if (looksLikeProblem(payload)) problem = payload as Problem;
      } catch {
        /* cuerpo no JSON */
      }
      throw new ApiProblem(problem);
    }
    return res.blob();
  },
};

/* ─────────────────────── Utilidades de imagen (cliente) ─────────────────────── */

/** Decodifica un Blob/File a bitmap + píxeles RGBA (para el Worker de vectorización). */
export async function decodeImageFile(blob: Blob): Promise<{
  bitmap: ImageBitmap;
  imageData: RawImageData;
  width: number;
  height: number;
}> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) throw new Error("Canvas 2D no disponible en este navegador");
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return {
    bitmap,
    imageData: { width: img.width, height: img.height, data: img.data },
    width: bitmap.width,
    height: bitmap.height,
  };
}

export type { UserDto, VectorParams };
