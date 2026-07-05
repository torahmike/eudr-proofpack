import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17211b",
        leaf: "#2f6b4f",
        moss: "#8a9a5b",
        clay: "#b96845",
        flax: "#f6f1e7",
        steel: "#d6dde1",
      },
      boxShadow: {
        soft: "0 18px 40px rgb(23 33 27 / 0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
