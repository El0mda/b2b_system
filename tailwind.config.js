/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(214 32% 91%)",
        input: "hsl(214 32% 91%)",
        ring: "hsl(243 75% 59%)",
        background: "hsl(0 0% 100%)",
        foreground: "hsl(222 47% 11%)",
        primary: {
          DEFAULT: "hsl(243 75% 59%)",
          foreground: "hsl(0 0% 100%)",
        },
        secondary: {
          DEFAULT: "hsl(210 40% 96%)",
          foreground: "hsl(222 47% 11%)",
        },
        muted: {
          DEFAULT: "hsl(210 40% 96%)",
          foreground: "hsl(215 16% 47%)",
        },
        accent: {
          DEFAULT: "hsl(210 40% 96%)",
          foreground: "hsl(222 47% 11%)",
        },
        destructive: {
          DEFAULT: "hsl(0 84% 60%)",
          foreground: "hsl(0 0% 100%)",
        },
        card: {
          DEFAULT: "hsl(0 0% 100%)",
          foreground: "hsl(222 47% 11%)",
        },
        sidebar: {
          DEFAULT: "hsl(222 47% 11%)",
          foreground: "hsl(215 20% 75%)",
          accent: "hsl(217 33% 17%)",
          border: "hsl(217 33% 17%)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem",
      },
      keyframes: {
        "spin-slow": {
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        "pulse-subtle": "pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
