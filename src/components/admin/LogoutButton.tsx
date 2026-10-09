"use client";

import { useRouter } from "next/navigation";
import { clearSnapshot } from "@/lib/contingency-store";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Quem saiu não deixa a cópia dos pedidos neste aparelho.
    await clearSnapshot();
    router.replace("/admin/login");
    router.refresh();
  }
  return (
    <button onClick={logout} className="rounded-xl border border-white/15 px-3 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white">
      Sair
    </button>
  );
}
