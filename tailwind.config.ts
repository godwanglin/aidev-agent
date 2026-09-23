import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#101010',
        sidebar: '#151515',
        'sidebar-secondary': '#1b1b1b',
        surface: '#191919',
        'surface-card': '#191919',
        card: '#191919',
        'card-border': '#222222',
        border: '#191919',
        'border-subtle': '#222222',
        'border-hover': '#2d2d2d',
        secondary: '#272727',
        'secondary-foreground': '#9d9d9d',
        muted: '#151515',
        'muted-foreground': '#6e6e6e',
        placeholder: '#484848',
        primary: '#007acc',
        'primary-foreground': '#ffffff',
        success: '#7aae66',
        warning: '#e8975f',
        error: '#de5555',
        'code-foreground': '#d7ba7d',
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: [
          '"Fira Code"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Liberation Mono"',
          '"Courier New"',
          'monospace',
        ],
      },
      boxShadow: {
        soft: '0 4px 20px -2px rgba(0, 0, 0, 0.45)',
        dock: '0 12px 32px -4px rgba(0, 0, 0, 0.55), 0 0 0 1px #222222',
      },
    },
  },
  plugins: [
    plugin(function ({ addVariant }) {
      addVariant('light', ['html.light &', '.light &', ':is(html.light, .light) &']);
    }),
  ],
};

export default config;
