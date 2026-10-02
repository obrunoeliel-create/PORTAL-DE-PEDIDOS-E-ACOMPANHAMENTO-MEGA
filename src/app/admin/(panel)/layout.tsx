import Link from "next/link";
import { requirePageSession } from "@/lib/auth";
import { LogoutButton } from "@/components/admin/LogoutButton";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Pedidos", managerOnly: false },
  { href: "/admin/despacho", label: "Despacho", managerOnly: false },
  { href: "/admin/cardapio", label: "Cardápio", managerOnly: false },
  { href: "/admin/financeiro", label: "Financeiro", managerOnly: true },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageSession();

  return (
    <div className="flex min-h-screen flex-col bg-stone-100">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-stone-900 px-4 py-3 text-white">
        <span className="font-bold">OrderFlow OS</span>
        <nav className="flex flex-1 flex-wrap gap-1">
          {NAV.filter((n) => !n.managerOnly || user.role === "MANAGER").map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-sm text-stone-300 hover:bg-white/10 hover:text-white">
              {n.label}
            </Link>
          ))}
        </nav>
        <span className="text-sm text-stone-400">
          {user.name} · {user.role === "MANAGER" ? "Gerente" : "Operador"}
        </span>
        <LogoutButton />
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
