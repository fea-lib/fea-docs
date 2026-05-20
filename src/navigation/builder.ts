import path from 'node:path';
import type { DocsGraph, NavItem, NavTree } from '../types.js';

interface DirNode {
  label: string;
  entryId?: string;
  children: Map<string, DirNode>;
  isSectionIndex?: boolean;
}

function dirNodeToNavItem(node: DirNode): NavItem {
  const children = Array.from(node.children.values()).map(dirNodeToNavItem);
  return {
    label: node.label,
    ...(node.entryId !== undefined ? { entryId: node.entryId } : {}),
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
      const pathParts = page.relativePath.replace(/\\/g, '/').split('/');
      if (pathParts.some((part) => part.startsWith('.'))) {
        continue;
      }

      const parts = page.relativePath.replace(/\\/g, '/').split('/');
      let current = root;

      if (parts.length === 1) {
        // Top-level file
        if (page.isSectionIndex) {
          current.entryId = page.entryId;
          current.label = page.label;
          current.isSectionIndex = true;
        } else {
          current.children.set(parts[0], {
            label: page.label,
            entryId: page.entryId,
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
        current.entryId = page.entryId;
        current.label = page.label;
        current.isSectionIndex = true;
      } else {
        current.children.set(filename, {
          label: page.label,
          entryId: page.entryId,
          children: new Map(),
        });
      }
    }

    // Return top-level children as nav tree.
    // If root itself has an entryId it means there was a top-level README —
    // emit it as the first nav item so it appears in the sidebar.
    const items = Array.from(root.children.values()).map(dirNodeToNavItem);
    if (root.entryId !== undefined) {
      items.unshift({
        label: root.label || 'Home',
        entryId: root.entryId,
        isSectionIndex: true,
      });
    }
    return items;
  }
}
