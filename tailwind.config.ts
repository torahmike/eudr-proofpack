import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17211b",
        leaf: "#2f6b4f",
        moss: "#7f9358",
        clay: "#b96845",
        harbor: "#2f6476",
        saffron: "#d5a43f",
        berry: "#9f4d55",
        flax: "#f6f1e7",
        canvas: "#fbf8ef",
        steel: "#d6dde1",
      },
      boxShadow: {
        soft: "0 18px 40px rgb(31 49 57 / 0.13)",
      },
    },
  },
  plugins: [],
} satisfies Config;
