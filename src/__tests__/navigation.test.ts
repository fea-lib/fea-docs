import { describe, it, expect } from 'vitest';
import { NavigationBuilder } from '../navigation/builder.js';
import type { DocsGraph } from '../types.js';

function makeGraph(pages: Array<{ rel: string; label: string; slug: string; isIndex?: boolean }>): DocsGraph {
  return {
    root: '/tmp/test',
    pages: pages.map((p) => ({
      absolutePath: `/tmp/test/${p.rel}`,
      relativePath: p.rel,
      slug: p.slug,
      entryId: p.rel.replace(/\.(md|mdx)$/, '').toLowerCase(),
      label: p.label,
      frontmatter: {},
      isSectionIndex: p.isIndex ?? false,
      ext: 'md' as const,
    })),
  };
}

describe('NavigationBuilder', () => {
  it('builds flat nav for top-level files', () => {
    const graph = makeGraph([
      { rel: 'intro.md', label: 'Intro', slug: 'intro' },
      { rel: 'guide.md', label: 'Guide', slug: 'guide' },
    ]);
    const builder = new NavigationBuilder();
    const nav = builder.build(graph);

    expect(nav).toHaveLength(2);
    expect(nav[0].label).toBe('Intro');
    expect(nav[1].label).toBe('Guide');
  });

  it('builds hierarchical nav for nested dirs', () => {
    const graph = makeGraph([
      { rel: 'guide/intro.md', label: 'Intro', slug: 'guide/intro' },
      { rel: 'guide/advanced.md', label: 'Advanced', slug: 'guide/advanced' },
    ]);
    const builder = new NavigationBuilder();
    const nav = builder.build(graph);

    expect(nav).toHaveLength(1);
    expect(nav[0].label).toBe('guide');
    expect(nav[0].children).toHaveLength(2);
  });

  it('emits top-level README as first nav item', () => {
    const graph = makeGraph([
      { rel: 'README.md', label: 'Home', slug: '', isIndex: true },
      { rel: 'guide.md', label: 'Guide', slug: 'guide' },
    ]);
    const builder = new NavigationBuilder();
    const nav = builder.build(graph);

    expect(nav[0].label).toBe('Home');
    expect(nav[0].entryId).toBe('readme');
    expect(nav[0].isSectionIndex).toBe(true);
    expect(nav[1].label).toBe('Guide');
  });

  it('uses README as section index', () => {
    const graph = makeGraph([
      { rel: 'guide/README.md', label: 'Guide Overview', slug: 'guide/guide', isIndex: true },
      { rel: 'guide/setup.md', label: 'Setup', slug: 'guide/setup' },
    ]);
    const builder = new NavigationBuilder();
    const nav = builder.build(graph);

    expect(nav).toHaveLength(1);
    expect(nav[0].label).toBe('Guide Overview');
    expect(nav[0].entryId).toBe('guide/readme');
    expect(nav[0].isSectionIndex).toBe(true);
    expect(nav[0].children).toHaveLength(1);
  });

  it('ignores dot-prefixed files and directories in nav generation', () => {
    const graph = makeGraph([
      { rel: '.abc/LICENSE.md', label: 'License', slug: '.abc/license' },
      { rel: 'guide/.private.md', label: 'Private', slug: 'guide/.private' },
      { rel: 'guide/intro.md', label: 'Intro', slug: 'guide/intro' },
    ]);
    const builder = new NavigationBuilder();
    const nav = builder.build(graph);

    expect(nav).toHaveLength(1);
    expect(nav[0].label).toBe('guide');
    expect(nav[0].children).toHaveLength(1);
    expect(nav[0].children?.[0]?.entryId).toBe('guide/intro');
  });
});
