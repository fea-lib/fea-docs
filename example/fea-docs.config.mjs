import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exampleDir = path.resolve(__dirname, '.');

/** @type {import('fea-docs').FeaDocsConfig} */
export default {
  root: path.join(exampleDir, 'docs'),
  frameworks: ['react', 'svelte'],
  aliases: {
    '@react-lib': path.join(exampleDir, 'react-lib'),
    '@svelte-lib': path.join(exampleDir, 'svelte-lib'),
    '@astro-lib': path.join(exampleDir, 'astro-lib'),
  },
  obsidian: {
    enabled: true,
    targets: {
      engineering: {
        label: 'Engineering',
        normalizedDocs: {
          repo: '.',
          branch: 'generated/engineering-docs',
          path: 'docs',
        },
        staticOutput: {
          repo: '.',
          branch: 'generated/engineering-site',
          path: '.',
        },
      },
      recipes: {
        label: 'Recipes',
        normalizedDocs: {
          repo: '.',
          branch: 'generated/recipes-docs',
          path: 'docs',
        },
        staticOutput: {
          repo: '.',
          branch: 'generated/recipes-site',
          path: '.',
        },
      },
    },
  },
};
