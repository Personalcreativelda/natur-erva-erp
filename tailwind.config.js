import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Tailwind compilado no build (antes: CDN cdn.tailwindcss.com a compilar no browser).
 * Configuração migrada 1:1 do <script>tailwind.config</script> de front/index.html.
 * @type {import('tailwindcss').Config}
 */
export default {
  content: [
    path.join(dir, 'front/index.html'),
    path.join(dir, 'front/**/*.{ts,tsx,js,jsx}'),
    `!${path.join(dir, 'front/node_modules/**')}`,
  ],
  darkMode: 'class',
  // `hover:` só em dispositivos com rato — em ecrãs tácteis o estado hover ficava "preso"
  // depois de um toque (comportamento típico de website). Desktop não muda.
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      colors: {
        brand: {
          50: 'var(--brand-50, #ecfdf5)',
          100: 'var(--brand-100, #d1fae5)',
          200: 'var(--brand-200, #a7f3d0)',
          300: 'var(--brand-300, #6ee7b7)',
          400: 'var(--brand-400, #34d399)',
          500: 'var(--brand-500, #10b981)',
          600: 'var(--brand-600, #059669)',
          700: 'var(--brand-700, #047857)',
          800: 'var(--brand-800, #065f46)',
          900: 'var(--brand-900, #064e3b)',
        },
        gray: {
          750: '#2d3748',
          850: '#1a202c',
          900: '#111827',
          950: '#0B0F19',
        },
        surface: {
          base: 'rgb(var(--surface-base-rgb) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised-rgb) / <alpha-value>)',
          overlay: 'rgb(var(--surface-overlay-rgb) / <alpha-value>)',
        },
        content: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        'border-default': 'rgb(var(--border-default-rgb) / <alpha-value>)',
        'border-strong': 'rgb(var(--border-strong-rgb) / <alpha-value>)',
        'brand-logo': {
          dark: 'rgb(var(--brand-logo-dark) / <alpha-value>)',
          light: 'rgb(var(--brand-logo-light) / <alpha-value>)',
        },
        semantic: {
          success: 'var(--color-success)',
          error: 'var(--color-error)',
          warning: 'var(--color-warning)',
          info: 'var(--color-info)',
        },
      },
      borderRadius: {
        'none': '0',
        'sm': 'var(--radius-sm, 3px)',
        DEFAULT: 'var(--radius-md, 6px)',
        'md': 'var(--radius-md, 6px)',
        'lg': 'var(--radius-lg, 8px)',
        'xl': 'var(--radius-xl, 12px)',
        '2xl': 'var(--radius-2xl, 16px)',
        '3xl': '24px',
        'full': '9999px',
      },
      boxShadow: {
        'sm': 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'xl': 'var(--shadow-xl)',
        '2xl': 'var(--shadow-2xl)',
        'none': 'none',
      },
    },
  },
  plugins: [],
};
