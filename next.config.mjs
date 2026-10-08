const isDev = process.env.NODE_ENV !== "production";

// CSP: Next.js sem nonce exige 'unsafe-inline' para os scripts de hidratação.
// Em produção, considere migrar para CSP com nonce via middleware.
const cspParts = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' ws: wss:",
  "worker-src 'self'",
  "media-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
];
// Páginas de impressão abrem num quadro invisível do próprio portal; o resto do site não pode ser emoldurado.
const csp = [...cspParts, "frame-ancestors 'none'"].join("; ");
const cspPrint = [...cspParts, "frame-ancestors 'self'"].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    if (!isDev) {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" });
    }
    return [
      {
        source: "/((?!admin/imprimir/).*)",
        headers: [{ key: "Content-Security-Policy", value: csp }, { key: "X-Frame-Options", value: "DENY" }, ...headers],
      },
      {
        source: "/admin/imprimir/:path*",
        headers: [{ key: "Content-Security-Policy", value: cspPrint }, { key: "X-Frame-Options", value: "SAMEORIGIN" }, ...headers],
      },
    ];
  },
};

export default nextConfig;
