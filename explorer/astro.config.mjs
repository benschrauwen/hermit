import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import path from 'node:path';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  vite: {
    server: {
      fs: {
        allow: [path.resolve(process.cwd(), '..')],
      },
    },
  },
});
