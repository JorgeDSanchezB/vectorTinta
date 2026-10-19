"use client";

/** Hooks compartidos del estudio. */
import * as React from "react";
import { appConfig } from "@/lib/config/app.config";

/** Ventana por debajo del umbral móvil de configuración (S-03). */
export function useSmallViewport(): boolean {
  const [small, setSmall] = React.useState(false);
  React.useEffect(() => {
    const check = (): void => setSmall(window.innerWidth < appConfig.mobile.blockHeavyOpsBelowViewportPx);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return small;
}
