"use client";

/**
 * VectorTinta — Puerta de acceso (plan §3.1: register/login/guest).
 *
 * Design v2 "Taller Vivo": panel de marca con malla de tinta animada,
 * trama halftone serigráfica, tintas que levitan y escalonado de entrada.
 * Todo el motion pasa por los tokens de src/lib/motion.ts y se apaga con
 * prefers-reduced-motion. El acceso de invitado (ADR-11) queda intacto.
 */
import * as React from "react";
import { Droplets, Loader2, LogIn, ShieldCheck, UserPlus, WandSparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appConfig } from "@/lib/config/app.config";
import { useStudio } from "@/lib/state/store";
import { toast } from "sonner";
import { ColorSwatch } from "@/components/studio/molecules";
import { DUR, EASE, riseIn, stagger, SPRING, TAP } from "@/lib/motion";

export function AuthGate() {
  const login = useStudio((s) => s.login);
  const register = useStudio((s) => s.register);
  const guest = useStudio((s) => s.guest);
  const authStatus = useStudio((s) => s.authStatus);
  const authProblem = useStudio((s) => s.authProblem);
  const busy = authStatus === "busy";
  const reduced = useReducedMotion();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");

  const handle = (fn: () => Promise<void>) => {
    fn().catch(() => {
      /* El problema se muestra inline desde authProblem; sonner para lo imprevisto.
         Lectura FRESCA del store (ARB1-12): el closure del render aún no lo tiene. */
      const fresh = useStudio.getState().authProblem;
      toast.error("No se pudo iniciar la sesión", {
        description: authProblemErr(fresh),
      });
    });
  };

  const inks = appConfig.colors.inkPalette.slice(0, 9);
  const features = [
    {
      icon: WandSparkles,
      text: "Vectoriza en el navegador: tu imagen no viaja a ningún servidor para procesarse.",
    },
    {
      icon: ShieldCheck,
      text: "Capas por color plano con recolor reversible y deshacer ilimitado.",
    },
    {
      icon: Droplets,
      text: "Preparación de tintas con manifiesto y orden de impresión.",
    },
  ];

  return (
    <div className="vt-mesh relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Grano de papel (estático, feTurbulence) + trama halftone decorativa */}
      <div aria-hidden className="vt-grain pointer-events-none absolute inset-0 opacity-[0.06]" />
      <div aria-hidden className="vt-halftone-dense pointer-events-none absolute inset-0 opacity-60" />

      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_24px_70px_-30px_rgba(27,27,27,0.4)] md:grid-cols-2">
        {/* ── Panel de marca ── */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-8 text-primary-foreground md:flex">
          {/* halftone + glow interior */}
          <div aria-hidden className="vt-halftone-dense absolute inset-0 opacity-40" />
          <div
            aria-hidden
            className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full opacity-70 blur-2xl"
            style={{ background: "radial-gradient(circle, rgba(191,25,50,0.55), transparent 65%)" }}
          />

          <motion.div
            className="relative"
            initial="hidden"
            animate="show"
            variants={stagger(0.12, 0.05)}
          >
            <motion.div variants={riseIn} className="flex items-center gap-2">
              <motion.span
                aria-hidden
                className="inline-flex"
                // Caso de firma (único): vaivén lento de la gota, 5s + pausa;
                // NO mover a SPRING/tokens: es identidad, no micro-interacción.
                animate={reduced ? undefined : { rotate: [0, -8, 6, 0] }}
                transition={{ duration: 5, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" }}
              >
                <Droplets className="h-7 w-7" />
              </motion.span>
              <span className="font-mono text-xl font-bold tracking-tight">{appConfig.product.name}</span>
            </motion.div>
            <motion.p variants={riseIn} className="mt-3 max-w-[38ch] text-sm leading-relaxed text-primary-foreground/80">
              {appConfig.product.tagline}
            </motion.p>
          </motion.div>

          <motion.ul
            className="relative space-y-3 text-sm text-primary-foreground/90"
            initial="hidden"
            animate="show"
            variants={stagger(0.14, 0.25)}
          >
            {features.map((f) => (
              <motion.li key={f.text} variants={riseIn} className="flex items-start gap-2">
                <f.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary-foreground/70" aria-hidden />
                <span>{f.text}</span>
              </motion.li>
            ))}
          </motion.ul>

          {/* Paleta de tintas que levita (cada muestra con fase propia) */}
          <motion.div
            className="relative flex flex-wrap gap-1.5"
            aria-label="Paleta de tintas del taller"
            initial="hidden"
            animate="show"
            variants={stagger(0.05, 0.5)}
          >
            {inks.map((ink, i) => (
              <motion.span
                key={ink.hex}
                variants={{ hidden: { opacity: 0, scale: 0.5 }, show: { opacity: 1, scale: 1, transition: SPRING.pop } }}
                animate={reduced ? undefined : { y: [0, -4, 0] }}
                transition={reduced ? undefined : { duration: 2.6, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
                className="inline-flex"
              >
                <ColorSwatch hex={ink.hex} size={20} title={`${ink.name} · ${ink.hex}`} className="border-white/30" />
              </motion.span>
            ))}
          </motion.div>
        </div>

        {/* ── Formulario ── */}
        <motion.div
          initial={{ opacity: 0, y: reduced ? 0 : 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.slow, ease: EASE.signature, delay: 0.08 }}
        >
          <Card className="rounded-none border-0 shadow-none">
            <CardHeader>
              <CardTitle className="font-mono text-2xl tracking-tight">Entrar al estudio</CardTitle>
              <CardDescription>Tu taller de serigrafía, directo en el navegador.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Iniciar sesión</TabsTrigger>
                  <TabsTrigger value="register">Crear cuenta</TabsTrigger>
                </TabsList>
                <TabsContent value="login" className="mt-4 space-y-3">
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handle(() => login(email, password));
                    }}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="login-email">Email</Label>
                      <Input id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="taller@serigrafia.es" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="login-pass">Contraseña</Label>
                      <Input id="login-pass" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    {authProblem !== null && (
                      <motion.p
                        role="alert"
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: DUR.fast }}
                        className="text-xs text-destructive"
                      >
                        {authProblem.detail ?? authProblem.title}
                      </motion.p>
                    )}
                    <motion.div whileTap={reduced ? undefined : TAP}>
                      <Button type="submit" className="w-full" disabled={busy}>
                        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <LogIn className="mr-1 h-4 w-4" aria-hidden />}
                        Entrar
                      </Button>
                    </motion.div>
                  </form>
                </TabsContent>
                <TabsContent value="register" className="mt-4 space-y-3">
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handle(() => register(email, password, name.trim() !== "" ? name.trim() : undefined));
                    }}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-name">Nombre del taller (opcional)</Label>
                      <Input id="reg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Serigrafía Trellat" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-email">Email</Label>
                      <Input id="reg-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="taller@serigrafia.es" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-pass">Contraseña (mínimo 10 caracteres)</Label>
                      <Input id="reg-pass" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    {authProblem !== null && (
                      <motion.p
                        role="alert"
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: DUR.fast }}
                        className="text-xs text-destructive"
                      >
                        {authProblem.detail ?? authProblem.title}
                      </motion.p>
                    )}
                    <motion.div whileTap={reduced ? undefined : TAP}>
                      <Button type="submit" className="w-full" disabled={busy}>
                        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="mr-1 h-4 w-4" aria-hidden />}
                        Crear cuenta
                      </Button>
                    </motion.div>
                  </form>
                </TabsContent>
              </Tabs>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-[11px] tracking-widest text-muted-foreground">
                  <span className="bg-card px-2">o</span>
                </div>
              </div>

              <motion.div whileTap={reduced ? undefined : TAP} whileHover={reduced ? undefined : { scale: 1.01 }}>
                <Button variant="secondary" className="w-full" disabled={busy} onClick={() => handle(() => guest())}>
                  <WandSparkles className="mr-1 h-4 w-4" aria-hidden /> Entrar como taller invitado
                </Button>
              </motion.div>
              <p className="text-center text-[11px] text-muted-foreground">
                Invitado = cuenta desechable con datos propios; el plan gratuito admite {appConfig.limits.projects.maxPerUserFree} proyectos.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function authProblemErr(problem: { detail?: string; title: string } | null): string {
  return problem?.detail ?? problem?.title ?? "Revisa tus credenciales.";
}
