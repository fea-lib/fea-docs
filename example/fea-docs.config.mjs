import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exampleDir = path.resolve(__dirname, '.');
const repoRoot = path.resolve(exampleDir, '..');

/** @type {import('fea-docs').FeaDocsConfig} */
export default {
  frameworks: ['react', 'svelte'],
  aliases: {
    '@react-lib': path.join(exampleDir, 'react-lib'),
    '@svelte-lib': path.join(exampleDir, 'svelte-lib'),
    '@astro-lib': path.join(exampleDir, 'astro-lib'),
    '@components': path.join(exampleDir, 'components'),
  },
  dependencies: {
    '@codesandbox/sandpack-react': '^2.20.0',
  },
  publish: {
    recipes: {
      static: {
        type: 'file',
        config: {
          targetDir: path.join(repoRoot, 'tmp', 'recipes'),
        },
      },
      sources: {
        type: 'file',
        config: {
          targetDir: path.join(repoRoot, 'tmp', 'recipes', 'sources'),
        },
      },
    },
    engineering: {
      static: {
        type: 'git',
        config: {
          repo: 'git@github.com:fea-lib/demo-fea-docs.git',
          branch: 'main',
          targetDir: 'static/engineering',
        },
      },
      sources: {
        type: 'git',
        config: {
          repo: 'git@github.com:fea-lib/demo-fea-docs.git',
          branch: 'main',
          targetDir: 'docs/engineering',
        },
      },
    },
  },
};
