import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInit } from '../cli/commands/init.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-init-test-'));
}

function writeFile(dir: string, relPath: string, content: string): void {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

describe('fea-docs init', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('refuses to overwrite existing config', async () => {
    writeFile(tmpDir, 'fea-docs.config.mjs', 'export default {};\n');
    writeFile(tmpDir, 'docs/index.md', '# Hello\n');
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => logs.push(m));

    await runInit({ root: tmpDir, dryRun: false });

    expect(logs.join(' ')).toContain('already exists');
    expect(fs.readFileSync(path.join(tmpDir, 'fea-docs.config.mjs'), 'utf-8')).toBe('export default {};\n');
    spy.mockRestore();
  });

  it('dry-run does not write config', async () => {
    writeFile(tmpDir, 'docs/index.md', '# Hello\n');
    await runInit({ root: tmpDir, dryRun: true });

    expect(fs.existsSync(path.join(tmpDir, 'fea-docs.config.mjs'))).toBe(false);
  });

  it('prints warning when no doc files found', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => logs.push(m));

    await runInit({ root: tmpDir, dryRun: false });

    expect(logs.join(' ')).toContain('No documentation files');
    spy.mockRestore();
  });

  it('injects title into file missing frontmatter', async () => {
    writeFile(tmpDir, 'docs/index.md', '# Hello\n');
    await runInit({ root: tmpDir, dryRun: false });

    const content = fs.readFileSync(path.join(tmpDir, 'docs/index.md'), 'utf-8');
    expect(content).toContain('title:');
  });

  it('injects title into file with frontmatter but no title', async () => {
    writeFile(tmpDir, 'docs/page.md', '---\nother: value\n---\n# Page\n');
    await runInit({ root: tmpDir, dryRun: false });

    const content = fs.readFileSync(path.join(tmpDir, 'docs/page.md'), 'utf-8');
    expect(content).toContain('title:');
  });

  it('preserves existing title in frontmatter', async () => {
    writeFile(tmpDir, 'docs/page.md', '---\ntitle: My Title\n---\n# Content\n');
    const before = fs.readFileSync(path.join(tmpDir, 'docs/page.md'), 'utf-8');
    await runInit({ root: tmpDir, dryRun: false });
    const after = fs.readFileSync(path.join(tmpDir, 'docs/page.md'), 'utf-8');

    expect(before).toBe(after);
    expect(after).toContain('title: My Title');
  });

  it('dry-run reports title injection count without mutating files', async () => {
    writeFile(tmpDir, 'docs/index.md', '# Hello\n');
    const before = fs.readFileSync(path.join(tmpDir, 'docs/index.md'), 'utf-8');
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => logs.push(m));

    await runInit({ root: tmpDir, dryRun: true });
    const after = fs.readFileSync(path.join(tmpDir, 'docs/index.md'), 'utf-8');

    expect(before).toBe(after);
    expect(logs.join(' ')).toContain('Titles injected:        1');
    spy.mockRestore();
  });

  it('detects framework from react import', async () => {
    writeFile(tmpDir, 'docs/page.mdx', "import { useState } from 'react';\n\n# Page\n");
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => logs.push(m));

    await runInit({ root: tmpDir, dryRun: false });

    const config = fs.readFileSync(path.join(tmpDir, 'fea-docs.config.mjs'), 'utf-8');
    expect(config).toContain('react');
    expect(logs.join(' ')).toContain('Framework');
    spy.mockRestore();
  });

  it('detects framework from .svelte component file', async () => {
    writeFile(tmpDir, 'src/Counter.svelte', '<script>let i = 0;</script>\n<button>{i}</button>\n');
    writeFile(tmpDir, 'docs/index.md', '# Hello\n');
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => logs.push(m));

    await runInit({ root: tmpDir, dryRun: false });

    const config = fs.readFileSync(path.join(tmpDir, 'fea-docs.config.mjs'), 'utf-8');
    expect(config).toContain('svelte');
    expect(logs.join(' ')).toContain('Framework');
    spy.mockRestore();
  });

  it('discovers aliases from @-prefixed imports with matching directories', async () => {
    writeFile(tmpDir, 'react-lib/Counter.tsx', 'export const Counter = () => null;\n');
    writeFile(tmpDir, 'docs/page.mdx', "import Counter from '@react-lib/Counter.tsx';\n\n# Page\n");
    await runInit({ root: tmpDir, dryRun: false });

    const config = fs.readFileSync(path.join(tmpDir, 'fea-docs.config.mjs'), 'utf-8');
    expect(config).toContain('@react-lib');
    expect(config).toContain("path.join(root, 'react-lib')");
  });

  it('discovers dependencies from npm imports', async () => {
    writeFile(tmpDir, 'docs/page.mdx', "import { Sandpack } from '@codesandbox/sandpack-react';\n\n# Page\n");

    const nodePkgDir = path.join(tmpDir, 'node_modules', '@codesandbox', 'sandpack-react');
    fs.mkdirSync(nodePkgDir, { recursive: true });
    fs.writeFileSync(path.join(nodePkgDir, 'package.json'), JSON.stringify({ version: '2.20.0' }));

    await runInit({ root: tmpDir, dryRun: false });

    const config = fs.readFileSync(path.join(tmpDir, 'fea-docs.config.mjs'), 'utf-8');
    expect(config).toContain('@codesandbox/sandpack-react');
    expect(config).toContain('^2.20.0');
  });

  it('outputs valid ESM config format', async () => {
    writeFile(tmpDir, 'lib/utils.ts', 'export const a = 1;\n');
    writeFile(tmpDir, 'docs/page.mdx', "import { a } from '@lib/utils.ts';\nimport { useState } from 'react';\n\n# Page\n");
    await runInit({ root: tmpDir, dryRun: false });

    const config = fs.readFileSync(path.join(tmpDir, 'fea-docs.config.mjs'), 'utf-8');
    expect(config).toContain('import { fileURLToPath }');
    expect(config).toContain('export default {');
    expect(config).toContain('@type {import(\'fea-docs\').FeaDocsConfig}');
  });

  it('only-md directory produces empty frameworks/aliases/dependencies', async () => {
    writeFile(tmpDir, 'docs/index.md', '# Hello\n');
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => logs.push(m));

    await runInit({ root: tmpDir, dryRun: false });

    const config = fs.readFileSync(path.join(tmpDir, 'fea-docs.config.mjs'), 'utf-8');
    expect(config).not.toContain('frameworks:');
    expect(config).not.toContain('aliases:');
    expect(config).not.toContain('dependencies:');
    expect(logs.join(' ')).toContain('(none)');
    spy.mockRestore();
  });

  it('full example directory detects react, svelte, aliases, deps', async () => {
    writeFile(tmpDir, 'components/Code.astro', '---\nimport React_Code from "@components/react/Code";\nimport type { SANDBOX_TEMPLATES } from "@codesandbox/sandpack-react";\n---\n<React_Code />\n');
    writeFile(tmpDir, 'components/react/Code.tsx', 'export default () => null;\n');
    writeFile(tmpDir, 'react-lib/Counter.tsx', 'export const Counter = () => null;\n');
    writeFile(tmpDir, 'svelte-lib/Toggle.svelte', '<script>let i = 0;</script>\n<p>{i}</p>\n');
    writeFile(tmpDir, 'astro-lib/Accordion.astro', '---\n---\n<div>Accordion</div>\n');
    writeFile(tmpDir, 'docs/integrations.mdx', '---\ntitle: Integrations\n---\n\nimport Counter from \'@react-lib/Counter.tsx\';\nimport Toggle from \'@svelte-lib/Toggle.svelte\';\nimport Accordion from \'@astro-lib/Accordion.astro\';\n\n# Integrations\n');

    const nodePkgDir = path.join(tmpDir, 'node_modules', '@codesandbox', 'sandpack-react');
    fs.mkdirSync(nodePkgDir, { recursive: true });
    fs.writeFileSync(path.join(nodePkgDir, 'package.json'), JSON.stringify({ version: '2.20.0' }));

    writeFile(tmpDir, 'types/FileResource.ts', 'export type FileResource = { path: string };\n');
    writeFile(tmpDir, 'utils/loadFileResource.ts', 'export async function loadFileResource(r: FileResource) { return r; }\n');

    await runInit({ root: tmpDir, dryRun: false });

    const config = fs.readFileSync(path.join(tmpDir, 'fea-docs.config.mjs'), 'utf-8');
    expect(config).toContain('react');
    expect(config).toContain('svelte');
    expect(config).toContain('@react-lib');
    expect(config).toContain('@svelte-lib');
    expect(config).toContain('@astro-lib');
    expect(config).toContain('@components');
    expect(config).toContain('@codesandbox/sandpack-react');
    expect(config).toContain('^2.20.0');
  });

  it('discovers aliases from tsconfig exact path entries (like @fea-lib/values)', async () => {
    writeFile(tmpDir, 'libs/fea-lib/values/src/index.ts', 'export const values = {};\n');
    writeFile(tmpDir, 'libs/fea-lib/jscad/src/index.ts', 'export const jscad = {};\n');
    writeFile(tmpDir, 'tsconfig.json', JSON.stringify({
      compilerOptions: {
        paths: {
          '@fea-lib/values': ['libs/fea-lib/values/src/index.ts'],
          '@fea-lib/jscad': ['libs/fea-lib/jscad/src/index.ts'],
        },
      },
    }));
    writeFile(tmpDir, 'docs/page.mdx', "import { values } from '@fea-lib/values';\nimport { jscad } from '@fea-lib/jscad';\n\n# Page\n");
    await runInit({ root: tmpDir, dryRun: false });

    const config = fs.readFileSync(path.join(tmpDir, 'fea-docs.config.mjs'), 'utf-8');
    expect(config).toContain('@fea-lib/values');
    expect(config).toContain('@fea-lib/jscad');
    expect(config).toContain("path.join(root, 'libs/fea-lib/values/src/index.ts')");
    expect(config).toContain("path.join(root, 'libs/fea-lib/jscad/src/index.ts')");
    expect(config).not.toContain("'@fea-lib/jscad': '");
  });

  it('discovers aliases from tsconfig wildcard path entries (like @lib/*)', async () => {
    writeFile(tmpDir, 'src/lib/utils.ts', 'export const utils = {};\n');
    writeFile(tmpDir, 'tsconfig.json', JSON.stringify({
      compilerOptions: {
        paths: {
          '@lib/*': ['src/lib/*'],
        },
      },
    }));
    writeFile(tmpDir, 'docs/page.mdx', "import { utils } from '@lib/utils';\n\n# Page\n");
    await runInit({ root: tmpDir, dryRun: false });

    const config = fs.readFileSync(path.join(tmpDir, 'fea-docs.config.mjs'), 'utf-8');
    expect(config).toContain('@lib');
    expect(config).toContain("path.join(root, 'src/lib')");
  });

  it('tsconfig aliases prevent dependency classification', async () => {
    writeFile(tmpDir, 'libs/fea-lib/values/src/index.ts', 'export const v = {};\n');
    writeFile(tmpDir, 'tsconfig.json', JSON.stringify({
      compilerOptions: {
        paths: {
          '@fea-lib/values': ['libs/fea-lib/values/src/index.ts'],
        },
      },
    }));
    writeFile(tmpDir, 'docs/page.mdx', "import { v } from '@fea-lib/values';\n\n# Page\n");

    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => logs.push(m));
    await runInit({ root: tmpDir, dryRun: false });
    spy.mockRestore();

    expect(logs.join(' ')).not.toContain('not found in node_modules');
    expect(logs.join(' ')).toMatch(/Aliases discovered:\s+1/);
  });

  it('handles missing tsconfig gracefully (existing behavior)', async () => {
    writeFile(tmpDir, 'docs/page.mdx', "import { useState } from 'react';\n\n# Page\n");
    await runInit({ root: tmpDir, dryRun: false });
    const config = fs.readFileSync(path.join(tmpDir, 'fea-docs.config.mjs'), 'utf-8');
    expect(config).toContain('react');
  });

  it('handles tsconfig with no paths gracefully', async () => {
    writeFile(tmpDir, 'tsconfig.json', JSON.stringify({ compilerOptions: {} }));
    writeFile(tmpDir, 'docs/index.md', '# Hello\n');
    await runInit({ root: tmpDir, dryRun: false });
    const config = fs.readFileSync(path.join(tmpDir, 'fea-docs.config.mjs'), 'utf-8');
    expect(config).not.toContain('aliases:');
  });

  it('handles malformed tsconfig gracefully', async () => {
    writeFile(tmpDir, 'tsconfig.json', '{ broken json!!! }');
    writeFile(tmpDir, 'docs/page.mdx', "import { useState } from 'react';\n\n# Page\n");
    await runInit({ root: tmpDir, dryRun: false });
    const config = fs.readFileSync(path.join(tmpDir, 'fea-docs.config.mjs'), 'utf-8');
    expect(config).toContain('react');
    expect(config).not.toContain('aliases:');
  });

  it('handles tsconfig with JSONC comments gracefully', async () => {
    writeFile(tmpDir, 'libs/fea-lib/values/src/index.ts', 'export const v = {};\n');
    writeFile(tmpDir, 'tsconfig.json', `{
      // This is a comment
      "compilerOptions": {
        /* another comment */
        "paths": {
          "@fea-lib/values": ["libs/fea-lib/values/src/index.ts"]
        }
      }
    }`);
    writeFile(tmpDir, 'docs/page.mdx', "import { v } from '@fea-lib/values';\n\n# Page\n");
    await runInit({ root: tmpDir, dryRun: false });

    const config = fs.readFileSync(path.join(tmpDir, 'fea-docs.config.mjs'), 'utf-8');
    expect(config).toContain('@fea-lib/values');
  });

  it('prints detailed summary after init', async () => {
    writeFile(tmpDir, 'docs/index.md', '# Hello\n');
    writeFile(tmpDir, 'lib/Counter.tsx', 'export const Counter = () => null;\n');
    writeFile(tmpDir, 'docs/page.mdx', "import { Counter } from '@lib/Counter.tsx';\n\n# Page\n");

    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m) => logs.push(m));

    await runInit({ root: tmpDir, dryRun: false });

    const output = logs.join(' ');
    expect(output).toContain('Doc files found');
    expect(output).toContain('Titles injected');
    expect(output).toContain('Component files found');
    expect(output).toContain('Frameworks detected');
    expect(output).toContain('Aliases discovered');
    expect(output).toContain('Dependencies found');
    spy.mockRestore();
  });
});
