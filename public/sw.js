// Service worker: cache de arquivos estáticos, fallback offline do cardápio e a tela do
// Modo Contingência do portal da loja (abre sem internet com a última cópia guardada no navegador).
const CACHE = "orderflow-v3";
const CONTINGENCY = "/admin/contingencia";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Tela do Modo Contingência: rede primeiro; sem internet, a versão guardada.
  // A tela não traz dados (eles ficam no navegador), então guardar o HTML não expõe nada.
  // (Só a página inteira: as trocas de tela internas do Next, com cabeçalho RSC, não entram aqui.)
  if (url.pathname === CONTINGENCY && !req.headers.get("RSC") && !url.searchParams.has("_rsc")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Só guarda a tela de verdade (não o redirecionamento para o login).
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(CONTINGENCY, copy));
          }
          return res;
        })
        .catch(() => caches.match(CONTINGENCY).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Nunca cachear API, o resto do painel ou socket.
  if (/^\/(api|admin|socket\.io)/.test(url.pathname)) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/") || /^\/(icon-\d+|apple-touch-icon|favicon-\d+)\.png$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || Response.error())),
    );
  }
});
