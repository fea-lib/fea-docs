import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exampleDir = path.resolve(__dirname, '.');

/** @type {import('fea-docs').FeaDocsConfig} */
export default {
  frameworks: ['react', 'svelte'],
  aliases: {
    '@react-lib': path.join(exampleDir, 'react-lib'),
    '@svelte-lib': path.join(exampleDir, 'svelte-lib'),
    '@astro-lib': path.join(exampleDir, 'astro-lib'),
  },
};
