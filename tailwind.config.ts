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
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        twinkle: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.25", transform: "scale(0.7)" },
        },
        // Papai Noel: entra pela direita, cruza a tela e some pela esquerda; depois uma pausa.
        santa: {
          "0%": { transform: "translateX(105vw)" },
          "72%": { transform: "translateX(-110%)" },
          "100%": { transform: "translateX(-110%)" },
        },
        bob: {
          "0%, 100%": { transform: "translateY(0) rotate(-2deg)" },
          "50%": { transform: "translateY(-12px) rotate(2deg)" },
        },
        sway: {
          "0%, 100%": { transform: "rotate(-10deg)" },
          "50%": { transform: "rotate(10deg)" },
        },
        hop: {
          "0%, 100%": { transform: "translateY(0) scale(1)" },
          "40%": { transform: "translateY(-9px) scale(1.06)" },
          "60%": { transform: "translateY(0) scale(0.97)" },
        },
        confetti: {
          "0%": { transform: "translateY(0) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translateY(110vh) rotate(720deg)", opacity: "0.9" },
        },
        pop: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "70%": { transform: "scale(1.04)", opacity: "1" },
          "100%": { transform: "scale(1)" },
        },
        glow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgb(255 220 10 / 0.7)" },
          "50%": { boxShadow: "0 0 0 10px rgb(255 220 10 / 0)" },
        },
        snow: {
          "0%": { transform: "translate(0, 0) rotate(0deg)", opacity: "0" },
          "10%": { opacity: "1" },
          "100%": { transform: "translate(30px, 420px) rotate(240deg)", opacity: "0" },
        },
      },
      animation: {
        flash: "flash 1s ease-in-out infinite",
        "slide-up": "slide-up 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)",
        "fade-in": "fade-in 0.2s ease-out",
        wiggle: "wiggle 2.4s ease-in-out infinite",
        marquee: "marquee 28s linear infinite",
        twinkle: "twinkle 1.6s ease-in-out infinite",
        snow: "snow 9s linear infinite",
        confetti: "confetti 3s linear infinite",
        pop: "pop 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2)",
        glow: "glow 1.8s ease-out infinite",
        santa: "santa 14s linear infinite",
        bob: "bob 2.2s ease-in-out infinite",
        sway: "sway 2.6s ease-in-out infinite",
        hop: "hop 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
