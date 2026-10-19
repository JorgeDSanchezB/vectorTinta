/**
 * VectorTinta — Slice de autenticación (ADR-007, plan §5.6).
 *
 * `boot()` se ejecuta UNA vez al montar la app: intenta refresh con la
 * cookie httpOnly; si hay sesión → carga el borrador (localStorage SIN PII:
 * solo el id del proyecto abierto) y abre el último proyecto.
 */
import type { StateCreator } from "zustand";
import { api, setAccessToken, SessionExpiredError } from "@/lib/api-client";
import type { Problem, ProblemKind } from "@/lib/domain/errors";
import { ApiProblem } from "@/lib/domain/errors";
import type { UserDto } from "@/lib/domain/entities";

export type AuthStatus = "boot" | "anon" | "busy" | "auth";

export interface AuthSlice {
  user: UserDto | null;
  authStatus: AuthStatus;
  authProblem: Problem | null;

  boot: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  guest: () => Promise<void>;
  logout: () => Promise<void>;
}

/** Borrador local SIN PII (failure-modes §5): solo ids, sin datos personales. */
const DRAFT_KEY = "vt_draft";

export function readDraft(): { projectId?: string } {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as { projectId?: unknown };
    if (typeof parsed.projectId === "string") return { projectId: parsed.projectId };
    return {};
  } catch {
    return {};
  }
}

export function writeDraft(projectId: string | null): void {
  try {
    if (projectId === null) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify({ projectId }));
  } catch {
    /* almacenamiento no disponible: no bloquea la app */
  }
}

/** Clase de diagnóstico a partir de una excepción (ApiProblem.kind o red). */
export function claseDeError(e: unknown): string {
  if (e instanceof ApiProblem) return e.kind ?? "interno";
  return "red";
}

export const createAuthSlice: StateCreator<
  AuthSlice & { openProject: (id: string, opts?: { fromDraft?: boolean }) => Promise<void> } & object,
  [],
  [],
  AuthSlice
> = (set) => ({
  user: null,
  authStatus: "boot",
  authProblem: null,

  async boot() {
    try {
      const data = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!data.ok) {
        set({ authStatus: "anon" });
        return;
      }
      const auth = (await data.json()) as { user: UserDto; accessToken: string };
      setAccessToken(auth.accessToken);
      set({ user: auth.user, authStatus: "auth", authProblem: null });
      const draft = readDraft();
      if (draft.projectId !== undefined) {
        void openProjectRefGlobal?.(draft.projectId, { fromDraft: true });
      }
    } catch {
      set({ authStatus: "anon" });
    }
  },

  async login(email, password) {
    set({ authStatus: "busy", authProblem: null });
    try {
      const data = await api.auth.login({ email, password });
      set({ user: data.user, authStatus: "auth" });
    } catch (e) {
      set({ authStatus: "anon", authProblem: (e as ApiProblem).problem ?? null });
      throw e;
    }
  },

  async register(email, password, name) {
    set({ authStatus: "busy", authProblem: null });
    try {
      const data = await api.auth.register({ email, password, name });
      set({ user: data.user, authStatus: "auth" });
    } catch (e) {
      set({ authStatus: "anon", authProblem: (e as ApiProblem).problem ?? null });
      throw e;
    }
  },

  async guest() {
    set({ authStatus: "busy", authProblem: null });
    try {
      const data = await api.auth.guest();
      set({ user: data.user, authStatus: "auth" });
    } catch (e) {
      set({ authStatus: "anon", authProblem: (e as ApiProblem).problem ?? null });
      throw e;
    }
  },

  async logout() {
    try {
      await api.auth.logout();
    } catch {
      /* el logout local procede aunque falle la red */
    }
    setAccessToken(null);
    writeDraft(null);
    set({ user: null, authStatus: "anon" });
  },
});

/**
 * Referencia tardía al openProject del slice de proyecto (el boot necesita
 * abrir el borrador sin acoplar los slices): la fija store.ts al crear el store.
 */
let openProjectRefGlobal: ((id: string, opts?: { fromDraft?: boolean }) => Promise<void>) | null = null;

export function setOpenProjectRef(fn: (id: string, opts?: { fromDraft?: boolean }) => Promise<void>): void {
  openProjectRefGlobal = fn;
}
