"use client";

/**
 * VectorTinta — Puerta de acceso (plan §3.1: register/login/guest).
 *
 * El acceso de invitado (ADR-011) crea un taller desechable con un solo clic:
 * pensado para evaluar el estudio sin registro. Las credenciales reales usan
 * la política de contraseñas del servidor (RFC 7807 con el detalle exacto).
 */
import * as React from "react";
import { Droplets, Loader2, LogIn, ShieldCheck, UserPlus, WandSparkles } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appConfig } from "@/lib/config/app.config";
import { useStudio } from "@/lib/state/store";
import { toast } from "sonner";
import { ColorSwatch } from "@/components/studio/molecules";

export function AuthGate() {
  const login = useStudio((s) => s.login);
  const register = useStudio((s) => s.register);
  const guest = useStudio((s) => s.guest);
  const authStatus = useStudio((s) => s.authStatus);
  const authProblem = useStudio((s) => s.authProblem);
  const busy = authStatus === "busy";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");

  const handle = (fn: () => Promise<void>) => {
    fn().catch(() => {
      /* el problema se muestra inline desde authProblem; sonner para lo imprevisto */
      toast.error("No se pudo iniciar la sesión", {
        description: authProblemErr(authProblem),
      });
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card shadow-lg md:grid-cols-2">
        {/* Panel de marca */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="relative hidden flex-col justify-between bg-primary p-8 text-primary-foreground md:flex"
        >
          <div>
            <div className="flex items-center gap-2">
              <Droplets className="h-7 w-7" aria-hidden />
              <span className="font-mono text-xl font-bold tracking-tight">{appConfig.product.name}</span>
            </div>
            <p className="mt-3 max-w-[38ch] text-sm text-primary-foreground/80">{appConfig.product.tagline}</p>
          </div>
          <ul className="space-y-3 text-sm text-primary-foreground/90">
            <li className="flex items-start gap-2">
              <WandSparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Vectoriza en el navegador: tu imagen no viaja a ningún servidor para procesarse.
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Capas por color plano con recolor reversible y deshacer ilimitado.
            </li>
            <li className="flex items-start gap-2">
              <Droplets className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Preparación de tintas con manifiesto y orden de impresión.
            </li>
          </ul>
          <div className="flex flex-wrap gap-1.5" aria-label="Paleta de tintas del taller">
            {appConfig.colors.inkPalette.slice(0, 9).map((ink) => (
              <ColorSwatch key={ink.hex} hex={ink.hex} size={18} title={`${ink.name} · ${ink.hex}`} />
            ))}
          </div>
        </motion.div>

        {/* Formulario */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
          <Card className="rounded-none border-0 shadow-none">
            <CardHeader>
              <CardTitle className="font-mono text-2xl">Entrar al estudio</CardTitle>
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
                      <p role="alert" className="text-xs text-destructive">
                        {authProblem.detail ?? authProblem.title}
                      </p>
                    )}
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <LogIn className="mr-1 h-4 w-4" aria-hidden />}
                      Entrar
                    </Button>
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
                      <p role="alert" className="text-xs text-destructive">
                        {authProblem.detail ?? authProblem.title}
                      </p>
                    )}
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="mr-1 h-4 w-4" aria-hidden />}
                      Crear cuenta
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-[11px] uppercase tracking-widest text-muted-foreground">
                  <span className="bg-card px-2">o</span>
                </div>
              </div>
              <Button variant="secondary" className="w-full" disabled={busy} onClick={() => handle(() => guest())}>
                <WandSparkles className="mr-1 h-4 w-4" aria-hidden /> Entrar como taller invitado
              </Button>
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
