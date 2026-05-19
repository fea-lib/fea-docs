import path from 'node:path';
import type { DocsGraph, NavItem, NavTree } from '../types.js';

interface DirNode {
  label: string;
  slug?: string;
  children: Map<string, DirNode>;
  isSectionIndex?: boolean;
}

function dirNodeToNavItem(node: DirNode): NavItem {
  const children = Array.from(node.children.values()).map(dirNodeToNavItem);
  return {
    label: node.label,
    ...(node.slug !== undefined ? { slug: node.slug } : {}),
    ...(children.length > 0 ? { children } : {}),
    ...(node.isSectionIndex ? { isSectionIndex: true } : {}),
  };
}

/**
 * NavigationBuilder converts a DocsGraph into a hierarchical NavTree.
 * - Directory structure mirrors source layout.
 * - README files become section index pages for their directory.
 * - Labels resolve via page.label (already resolved by parser).
 */
export class NavigationBuilder {
  build(graph: DocsGraph): NavTree {
    const root: DirNode = {
      label: '',
      children: new Map(),
    };

    for (const page of graph.pages) {
      const parts = page.relativePath.replace(/\\/g, '/').split('/');
      let current = root;

      if (parts.length === 1) {
        // Top-level file
        if (page.isSectionIndex) {
          current.slug = page.slug;
          current.label = page.label;
          current.isSectionIndex = true;
        } else {
          current.children.set(parts[0], {
            label: page.label,
            slug: page.slug,
            children: new Map(),
          });
        }
        continue;
      }

      // Traverse/create directory nodes
      for (let i = 0; i < parts.length - 1; i++) {
        const dirPart = parts[i];
        if (!current.children.has(dirPart)) {
          current.children.set(dirPart, {
            label: dirPart.replace(/[-_]/g, ' '),
            children: new Map(),
          });
        }
        current = current.children.get(dirPart)!;
      }

      const filename = parts[parts.length - 1];
      if (page.isSectionIndex) {
        // README becomes the index of its parent dir
        current.slug = page.slug;
        current.label = page.label;
        current.isSectionIndex = true;
      } else {
        current.children.set(filename, {
          label: page.label,
          slug: page.slug,
          children: new Map(),
        });
      }
    }

    // Return top-level children as nav tree
    return Array.from(root.children.values()).map(dirNodeToNavItem);
  }
}
