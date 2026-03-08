import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwind from '@astrojs/tailwind';
import path from 'node:path';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [tailwind()],
  publicDir: path.resolve(process.cwd(), '..', 'public'),
  vite: {
    server: {
      fs: {
        allow: [path.resolve(process.cwd(), '..')],
      },
    },
  },
});
