import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mega Esfiha Jurema — Peça online",
    short_name: "Mega Esfiha",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#d3151b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
