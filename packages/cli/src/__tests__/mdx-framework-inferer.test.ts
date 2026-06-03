import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DocsGraph } from '../types.js';
import { inferFrameworksFromMdxGraph } from '../mdx-framework/inferer.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-mdx-infer-test-'));
}

function writeFile(dir: string, relPath: string, content: string): void {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function graphFrom(root: string, pages: string[]): DocsGraph {
  return {
    root,
    pages: pages.map((relPath) => ({
      absolutePath: path.join(root, relPath),
      relativePath: relPath,
      entryId: relPath.replace(/\.(md|mdx)$/, '').toLowerCase(),
      label: relPath,
      frontmatter: {},
      isSectionIndex: false,
      ext: relPath.endsWith('.mdx') ? 'mdx' : 'md',
    })),
  };
}

describe('inferFrameworksFromMdxGraph', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('infers svelte from .svelte import', () => {
    writeFile(tmpDir, 'docs/page.mdx', "import Counter from '../components/Counter.svelte'\n\n# Page\n");
    writeFile(tmpDir, 'components/Counter.svelte', '<script>let i = 0;</script>\n<button>{i}</button>\n');

    const result = inferFrameworksFromMdxGraph(graphFrom(tmpDir, ['docs/page.mdx']), {});

    expect(result.frameworks).toContain('svelte');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('falls back to react+solid+qwik for ambiguous tsx imports', () => {
    writeFile(tmpDir, 'docs/page.mdx', "import Counter from '../components/Counter.tsx'\n\n# Page\n");
    writeFile(tmpDir, 'components/Counter.tsx', 'export const Counter = () => <button>Hi</button>;\n');

    const result = inferFrameworksFromMdxGraph(graphFrom(tmpDir, ['docs/page.mdx']), {});

    expect(result.frameworks).toEqual(expect.arrayContaining(['react', 'solid', 'qwik']));
  });

  it('infers aliases and reports unresolved local-like imports', () => {
    writeFile(tmpDir, 'docs/page.mdx', "import Good from '@lib/Good.tsx'\nimport Missing from '@lib/Missing.tsx'\n\n# Page\n");
    writeFile(tmpDir, 'lib/Good.tsx', "import { component$ } from '@builder.io/qwik';\nexport default component$(() => null);\n");

    const result = inferFrameworksFromMdxGraph(graphFrom(tmpDir, ['docs/page.mdx']), {
      '@lib': path.join(tmpDir, 'lib'),
    });

    expect(result.frameworks).toContain('qwik');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('MDX_IMPORT_UNRESOLVED');
  });
});
