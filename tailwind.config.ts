import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Inter", "sans-serif"],
      },
      colors: {
        ink: "#0f1419",
        paper: "#fafaf7",
        accent: "#5b6cff",
        muted: "#9aa0a6",
      },
    },
  },
  plugins: [],
};

export default config;
