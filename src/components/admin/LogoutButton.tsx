"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/admin/login");
    router.refresh();
  }
  return (
    <button onClick={logout} className="rounded-md border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10">
      Sair
    </button>
  );
}
