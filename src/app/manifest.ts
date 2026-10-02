import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OrderFlow — Cardápio Digital",
    short_name: "OrderFlow",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#ea4d0f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
