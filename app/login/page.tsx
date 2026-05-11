"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDemo() {
    if (demoLoading || submitting) return;
    setDemoLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/start", { method: "POST" });
      if (!res.ok) {
        setError("No se pudo iniciar la demo");
        setDemoLoading(false);
        return;
      }
      router.replace("/demo");
      router.refresh();
    } catch {
      setError("No se pudo conectar");
      setDemoLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Contraseña incorrecta" : "Error de servidor");
        setSubmitting(false);
        return;
      }
      const redirect = params.get("redirect") || "/";
      router.replace(redirect);
      router.refresh();
    } catch {
      setError("No se pudo conectar");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-background p-6 shadow-sm">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Neonet</h1>
        <p className="text-xs text-muted-foreground">Introduce la contraseña para continuar.</p>
      </div>
      <Input
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Contraseña"
        disabled={submitting}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" disabled={submitting || !password} className="w-full">
        {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Entrar
      </Button>
      <div className="relative my-2 flex items-center">
        <div className="flex-1 border-t border-border" />
        <span className="px-2 text-[10px] uppercase tracking-wider text-muted-foreground">o</span>
        <div className="flex-1 border-t border-border" />
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={demoLoading || submitting}
        onClick={onDemo}
        className="w-full"
      >
        {demoLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Probar demo
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        Datos ficticios. No accede al CRM real.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
