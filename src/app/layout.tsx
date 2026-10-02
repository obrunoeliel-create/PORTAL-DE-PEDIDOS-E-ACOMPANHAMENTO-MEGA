import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

// Baixadas no build e servidas pelo próprio site (sem requisições ao Google em produção).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  // Nome da aba: "Mega Esfiha Jurema" (páginas internas: "Mega Esfiha Jurema · <página>").
  title: { default: "Mega Esfiha Jurema", template: "Mega Esfiha Jurema · %s" },
  description: "Esfihas, pizzas, lanches e muito mais. Peça delivery, retire no balcão ou peça na mesa.",
  applicationName: "Mega Esfiha Jurema",
  // Ícone da aba = logo da loja. Nomes novos de arquivo para não reaproveitar o ícone antigo do cache.
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon-48.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#d3151b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${outfit.variable}`}>
      <body>{children}</body>
    </html>
  );
}
