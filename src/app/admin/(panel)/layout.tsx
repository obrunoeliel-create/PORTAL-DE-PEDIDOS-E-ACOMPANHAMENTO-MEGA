import { requirePageSession } from "@/lib/auth";
import { Logo } from "@/components/brand/Logo";
import { AdminNav } from "@/components/admin/AdminNav";
import { LogoutButton } from "@/components/admin/LogoutButton";

export const dynamic = "force-dynamic";

export const metadata = { title: "Portal da loja" };

const NAV = [
  { href: "/admin", label: "Pedidos", icon: "🔔", managerOnly: false },
  { href: "/admin/despacho", label: "Despacho", icon: "🛵", managerOnly: false },
  { href: "/admin/cardapio", label: "Cardápio", icon: "📋", managerOnly: false },
  { href: "/admin/financeiro", label: "Financeiro", icon: "💰", managerOnly: true },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageSession();
  const items = NAV.filter((n) => !n.managerOnly || user.role === "MANAGER").map(({ managerOnly: _, ...n }) => n);

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f1ec]">
      <header className="sticky top-0 z-30 bg-ink-950 text-white shadow-lift">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo size={42} className="ring-2 ring-white/10" />
            <div className="leading-tight">
              <p className="font-display font-bold">Mega Esfiha Jurema</p>
              <p className="text-[11px] uppercase tracking-wider text-mega-400">Portal da loja</p>
            </div>
          </div>
          <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">
            <AdminNav items={items} />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-[11px] text-white/50">{user.role === "MANAGER" ? "Gerente" : "Operador"}</p>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 font-display font-bold">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
