"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Falha no login.");
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Falha de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 p-4">
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-600/40 blur-3xl" aria-hidden />
      <div className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-mega-400/25 blur-3xl" aria-hidden />

      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center text-white">
          <Logo size={112} large className="shadow-lift ring-4 ring-white/10" />
          <h1 className="mt-4 text-2xl font-extrabold">Mega Esfiha Jurema</h1>
          <p className="text-sm text-white/60">Portal da loja</p>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-3xl bg-white p-6 shadow-lift">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-semibold text-stone-600">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="voce@megaesfiha.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              maxLength={254}
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-semibold text-stone-600">
              Senha
            </label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              maxLength={200}
              required
            />
          </div>
          {error && (
            <p className="rounded-xl bg-brand-50 p-3 text-sm font-medium text-brand-800" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base">
            {loading ? "Entrando..." : "Entrar no painel"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-white/40">Acesso restrito à equipe da loja</p>
      </div>
    </main>
  );
}
