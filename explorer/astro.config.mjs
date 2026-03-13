import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';
import tailwind from '@astrojs/tailwind';
import path from 'node:path';
import { readdirSync, statSync } from 'node:fs';

function listFilesRelative(rootDir, currentDir = rootDir) {
  const entries = readdirSync(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRelative(rootDir, absolutePath));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    files.push(path.relative(process.cwd(), absolutePath));
  }

  return files;
}

function listWorkspaceFiles(relativeDir) {
  const absoluteDir = path.resolve(process.cwd(), relativeDir);
  if (!statSync(absoluteDir, { throwIfNoEntry: false })?.isDirectory()) {
    return [];
  }
  return listFilesRelative(absoluteDir);
}

const includeFiles = [
  ...listWorkspaceFiles('../agents'),
  ...listWorkspaceFiles('../entities'),
  ...listWorkspaceFiles('../entity-defs'),
  ...listWorkspaceFiles('../src'),
  ...listWorkspaceFiles('../docs'),
  ...listWorkspaceFiles('../skills'),
  ...listWorkspaceFiles('../prompts'),
  '../README.md',
  '../LICENSE',
];

export default defineConfig({
  output: 'server',
  adapter: vercel({
    includeFiles,
  }),
  integrations: [tailwind()],
  publicDir: path.resolve(process.cwd(), '..', 'public'),
  vite: {
    resolve: {
      alias: {
        'gray-matter': path.resolve(process.cwd(), 'node_modules/gray-matter'),
        'js-yaml': path.resolve(process.cwd(), 'node_modules/gray-matter/node_modules/js-yaml'),
        slugify: path.resolve(process.cwd(), 'node_modules/slugify'),
      },
    },
    server: {
      fs: {
        allow: [path.resolve(process.cwd(), '..')],
      },
    },
  },
});
