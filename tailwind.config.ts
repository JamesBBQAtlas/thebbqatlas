import type { Config } from "tailwindcss";

/**
 * The BBQ Atlas — design tokens.
 * Warm-dark base with burnt-sienna undertones, gold primary accent,
 * sienna secondary accent. Dark-only (no light mode by design).
 * Values mirror design/bbq-atlas-design-spec.md §2, §3, §7.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Base scale — warm blacks (burnt-sienna-tinted)
        background: "#0C0907",
        "surface-0": "#141010",
        "surface-1": "#1E1814",
        "surface-2": "#2A221C",
        "surface-3": "#362C24",

        // Borders
        "border-subtle": "#2A221C",
        "border-default": "#3D2E24",
        "border-strong": "#5A4838",

        // Text
        "text-primary": "#F5F0EB",
        "text-secondary": "#C4B8AB",
        "text-muted": "#8C7B6C",
        "text-inverse": "#0C0907",

        // Brand
        "brand-red": "#8B0000",
        "brand-gold": {
          DEFAULT: "#D4AF37",
          light: "#E8C94A",
          dark: "#B8962E",
        },
        "brand-sienna": {
          DEFAULT: "#C4622D",
          light: "#D87A45",
          dark: "#A85220",
        },
        "brand-orange": "#E85D04",

        // Semantic
        success: "#22C55E",
        warning: "#F59E0B",
        error: "#DC2626",
        info: "#3B82F6",

        // shadcn bridge tokens (consume the CSS variables in globals.css)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },

      fontFamily: {
        heading: ["var(--font-heading)", "Georgia", "Times New Roman", "serif"],
        body: [
          "var(--font-body)",
          "Source Sans Pro",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },

      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.625rem" }],
        lg: ["1.0625rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
        "5xl": ["3rem", { lineHeight: "1" }],
        "6xl": ["3.75rem", { lineHeight: "1" }],
        "7xl": ["4.5rem", { lineHeight: "1" }],
      },

      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "24px",
      },

      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.4)",
        md: "0 4px 12px rgba(0,0,0,0.5)",
        lg: "0 12px 36px rgba(0,0,0,0.6)",
        xl: "0 24px 48px rgba(0,0,0,0.7)",
        "glow-gold": "0 0 24px rgba(212, 175, 55, 0.25)",
        "glow-sienna": "0 0 20px rgba(196, 98, 45, 0.2)",
      },

      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
        "30": "7.5rem",
      },

      transitionTimingFunction: {
        confident: "cubic-bezier(0.4, 0, 0.2, 1)",
      },

      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },

      animation: {
        "pulse-slow": "pulse 2s ease-in-out infinite",
        "ping-slow": "ping 2s ease-out infinite",
        "fade-up": "fade-up 0.5s ease both",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};

export default config;
