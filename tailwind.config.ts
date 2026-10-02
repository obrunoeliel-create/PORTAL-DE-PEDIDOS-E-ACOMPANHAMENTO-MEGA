import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Vermelho Mega (mascote)
        brand: {
          50: "#fff1f1",
          100: "#ffdfdf",
          200: "#ffc5c5",
          300: "#ff9d9d",
          400: "#f75454",
          500: "#e8262a",
          600: "#d3151b",
          700: "#b00f14",
          800: "#911116",
          900: "#6e0d10",
          950: "#3d0406",
        },
        // Amarelo Mega (fundo do logo)
        mega: {
          50: "#fffde6",
          100: "#fff9bf",
          200: "#fff27f",
          300: "#ffe83d",
          400: "#ffdc0a",
          500: "#f5c400",
          600: "#d19a00",
          700: "#a66e02",
        },
        ink: {
          900: "#16110f",
          950: "#0c0908",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-outfit)", "var(--font-inter)", "ui-sans-serif", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(22 17 15 / 0.04), 0 4px 16px -4px rgb(22 17 15 / 0.08)",
        lift: "0 2px 4px rgb(22 17 15 / 0.05), 0 12px 32px -8px rgb(22 17 15 / 0.18)",
        glow: "0 8px 30px -6px rgb(211 21 27 / 0.45)",
      },
      keyframes: {
        flash: {
          "0%, 100%": { backgroundColor: "rgb(254 226 226)" },
          "50%": { backgroundColor: "rgb(254 202 202)" },
        },
        "slide-up": {
          from: { transform: "translateY(24px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-4deg)" },
          "50%": { transform: "rotate(4deg)" },
        },
      },
      animation: {
        flash: "flash 1s ease-in-out infinite",
        "slide-up": "slide-up 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)",
        "fade-in": "fade-in 0.2s ease-out",
        wiggle: "wiggle 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
