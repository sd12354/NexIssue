import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        "surface-border": "var(--color-surface-border)",
        foreground: "var(--color-foreground)",
        muted: "var(--color-muted)",
        accent: "var(--color-accent)",
        "accent-pressed": "var(--color-accent-pressed)",
        danger: "var(--color-danger)",
        input: "var(--color-input)",
      },
      borderRadius: {
        card: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
