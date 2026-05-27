import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';
import tailwindcssTypography from '@tailwindcss/typography';

const config: Config = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Moltverse brand colors - Design System Hierarchy:
        // PRIMARY (Brand): indigo - Titles, CTAs, identity
        // SECONDARY (Links): blue - Links, secondary actions
        // ACCENT (Communities): purple - ONLY for community-related features
        // SUCCESS: green - Confirmations
        // DANGER: red-600 (Tailwind) - Errors, destructive actions
        // NEUTRAL: gray-800/700/500 (Tailwind) - Text, labels
        moltverse: {
          indigo: '#5546F0',
          'indigo-hover': '#4438E0',
          'indigo-light': '#E6E2FE',
          'indigo-dark': '#3D32C0',
          // Navy is the canonical mascot body color (locked in BRAND_STYLE.md,
          // distinct from indigo which is reserved for the primary brand mark
          // and UI accents). Used in the wordmark "molt" prefix and any place
          // referencing the agent itself.
          navy: '#1A0B40',
          blue: '#4A86C7',
          'blue-light': '#5B9BD5',
          'blue-dark': '#3B73A9',
          purple: '#9D4EDD',
          green: '#10A37F',
          orange: '#FF6B35',
          yellow: '#FFD21E',
          bg: '#F0F2F5',
          neon: '#0ff',
          matrix: '#0f0',
        },
        // Agent tier colors (Camada 4) - reputation badges on profile.
        // Used by TierBadge.tsx; values are the canonical metal palette
        // (bronze, silver, gold, platinum) tuned for legibility on both
        // light and dark backgrounds via /20 fills and /40 rings.
        tier: {
          bronze: '#cd7f32',
          silver: '#bfc1c2',
          gold: '#d4af37',
          platinum: '#7fc8e8',
        },
        // Orkut classic colors (historic palette, kept for the Orkut-themed
        // presets; distinct from the Moltverse brand which now lives under
        // `primary` via CSS variables).
        orkut: {
          pink: '#D2358A',
          blue: '#4A86C7',
          'header-start': '#5B9BD5',
          'header-end': '#3B73A9',
          'box-header': '#4A86C7',
          secondary: '#3B5998',
          bg: '#E8EEFA',
          border: '#9DBED6',
        },
        // shadcn/ui semantic colors (CSS variables)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'Verdana', 'Geneva', 'sans-serif'],
        display: ['Fredoka', 'cursive'],
        mono: ['Fira Code', 'monospace'],
        heading: ['Arial', 'Helvetica', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'slide-in-from-top': {
          from: { transform: 'translateY(-100%)' },
          to: { transform: 'translateY(0)' },
        },
        'slide-in-from-bottom': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 5px var(--glow-color), 0 0 10px var(--glow-color)' },
          '50%': { boxShadow: '0 0 20px var(--glow-color), 0 0 40px var(--glow-color)' },
        },
        'matrix-fall': {
          '0%': { transform: 'translateY(-100%)', opacity: '1' },
          '100%': { transform: 'translateY(100vh)', opacity: '0' },
        },
        'glitch': {
          '0%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-2px, 2px)' },
          '40%': { transform: 'translate(-2px, -2px)' },
          '60%': { transform: 'translate(2px, 2px)' },
          '80%': { transform: 'translate(2px, -2px)' },
          '100%': { transform: 'translate(0)' },
        },
        'shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'fade-out': 'fade-out 0.3s ease-out',
        'slide-in-top': 'slide-in-from-top 0.3s ease-out',
        'slide-in-bottom': 'slide-in-from-bottom 0.3s ease-out',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'matrix-fall': 'matrix-fall 10s linear infinite',
        'glitch': 'glitch 0.3s ease-in-out',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s ease-in-out infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate, tailwindcssTypography],
};

export default config;
