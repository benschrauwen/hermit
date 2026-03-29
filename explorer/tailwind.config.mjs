import path from 'node:path';
import typography from '@tailwindcss/typography';

const workspaceEntityDefsGlob = process.env.WORKSPACE_ROOT
  ? path.join(process.env.WORKSPACE_ROOT, 'entity-defs/**/*.{js,ts}')
  : null;

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
    ...(workspaceEntityDefsGlob ? [workspaceEntityDefsGlob] : []),
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
        },
      },
      boxShadow: {
        panel: '0 1px 2px rgba(15, 23, 42, 0.05), 0 16px 40px rgba(15, 23, 42, 0.08)',
      },
    },
  },
  plugins: [typography],
};
