import type { DocPage, DocsGraph } from '../types.js';

export function filterDocsByTarget(graph: DocsGraph, targetName: string): DocPage[] {
  return graph.pages.filter((page) => {
    const pt = page.frontmatter.publishTo;
    if (!pt) return false;
    if (typeof pt === 'string') return pt === targetName;
    if (Array.isArray(pt)) return pt.includes(targetName);
    return false;
  });
}
