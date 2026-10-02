import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff4ed",
          100: "#ffe6d4",
          200: "#ffc9a8",
          400: "#ff8a4c",
          500: "#f9671f",
          600: "#ea4d0f",
          700: "#c2380f",
          900: "#7a2512",
        },
      },
      keyframes: {
        flash: {
          "0%, 100%": { backgroundColor: "rgb(254 226 226)" },
          "50%": { backgroundColor: "rgb(254 202 202)" },
        },
      },
      animation: {
        flash: "flash 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
