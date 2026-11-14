"use client";

/**
 * VectorTinta — Tokens de motion (sistema "Taller Vivo").
 *
 * ÚNICA fuente de duraciones/easings/variants: nada de números mágicos
 * dispersos por los componentes (misma disciplina que app.config.ts, pero
 * para presentación). Todas las animaciones deben:
 *   1. Respetar prefers-reduced-motion (useReducedMotion de framer-motion).
 *   2. Animar composición (transform/opacity), jamás layout en bucles.
 *   3. Usar springs para entradas físicas y easings para transiciones UI.
 */
import type { TargetAndTransition, Transition, Variants } from "framer-motion";

/* ── Duraciones (s) ── */
export const DUR = {
  instant: 0.12,
  fast: 0.2,
  base: 0.32,
  slow: 0.5,
} as const;

/* ── Momentos firma en ms (Web Animations API sobre el lienzo, VectorStage) ── */
export const REVEAL = {
  /** Duración de la entrada de cada capa al terminar una vectorización. */
  durMs: 320,
  /** Escalonado entre capas. */
  staggerMs: 70,
  /** Retardo base antes de la primera capa. */
  baseDelayMs: 80,
} as const;
/** Pulso de opacity al seleccionar una capa en el lienzo. */
export const PULSE_MS = 180;

/* ── Easings ── */
export const EASE = {
  /** Entrada suave, salida con carácter (curva firma del producto). */
  signature: [0.22, 1, 0.36, 1],
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

/* ── Springs (para física de arrastre/entradas) ── */
export const SPRING = {
  /** Entradas de paneles y overlays. */
  gentle: { type: "spring", stiffness: 260, damping: 26, mass: 0.9 },
  /** Herramientas flotantes (toolbar del lienzo). */
  tool: { type: "spring", stiffness: 300, damping: 26, mass: 0.85 },
  /** Pop de elementos que aparecen (chips, swatches, badges). */
  pop: { type: "spring", stiffness: 480, damping: 18, mass: 0.8 },
  /** Píldora del conmutador de vista (layoutId). */
  pill: { type: "spring", stiffness: 480, damping: 34, mass: 0.9 },
  /** Barras de cobertura (scaleX). */
  bar: { type: "spring", stiffness: 180, damping: 26, mass: 0.9 },
  /** Micro-interacción de press. */
  snappy: { type: "spring", stiffness: 420, damping: 30, mass: 0.8 },
} satisfies Record<string, Transition>;

/* ── Variantes reutilizables ── */

/** Entrada estándar de paneles: sube 10px + fade con curva firma. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE.signature } },
};

/** Contenedor que escalona hijos con riseIn (usa `custom` para offsets). */
export const stagger = (gap = 0.06, delayChildren = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren } },
});

/** Estados de aparición tipados para props initial/animate (ARB: Variants
 *  incluye TargetResolver y TS rechaza esa unión en initial/animate). */
export const popStart: TargetAndTransition = { opacity: 0, scale: 0.9 };
export const popEnd: TargetAndTransition = { opacity: 1, scale: 1, transition: SPRING.pop };

/** Estados vacíos: levitación lenta e infinita (se apaga con reduced motion). */
export const floatLoop: Transition = {
  duration: 3.2,
  repeat: Infinity,
  repeatType: "mirror",
  ease: "easeInOut",
};

/** Pulsos para loaders de tinta. */
export const inkPulse: Variants = {
  hidden: { scale: 0.85, opacity: 0.6 },
  show: {
    scale: [0.85, 1.08, 0.85],
    opacity: [0.6, 1, 0.6],
    transition: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
  },
};

/* ── Press de botones (whileTap estándar del producto) ── */
export const TAP = { scale: 0.965 } as const;
