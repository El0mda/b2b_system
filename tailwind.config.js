/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Brand hues sampled from the etriplesoft logo — for direct, deliberate
        // use (decorative gradients, brand marks), not as semantic UI tokens.
        brand: {
          navy: "hsl(var(--brand-navy))",
          cyan: "hsl(var(--brand-cyan))",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        premium:
          "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 8px 24px -8px rgb(0 0 0 / 0.10)",
        "premium-lg":
          "0 2px 4px 0 rgb(0 0 0 / 0.04), 0 16px 40px -12px rgb(0 0 0 / 0.16)",
        glow: "0 0 0 1px hsl(var(--primary) / 0.15), 0 8px 30px -4px hsl(var(--primary) / 0.35)",
      },
      keyframes: {
        "spin-slow": {
          to: { transform: "rotate(360deg)" },
        },
        "fade-in": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        "slide-up": {
          from: { opacity: 0, transform: "translateY(6px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: 0, transform: "scale(0.97)" },
          to: { opacity: 1, transform: "scale(1)" },
        },
      },
      animation: {
        "pulse-subtle": "pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fade-in 0.4s ease-out",
        "slide-up": "slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scale-in 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
