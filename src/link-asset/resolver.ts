import fs from 'node:fs';
import path from 'node:path';
import type { DocsGraph, Diagnostic } from '../types.js';

export interface LinkResolutionResult {
  resolved: boolean;
  /** Rewritten href suitable for the generated site. */
  href?: string;
  diagnostic?: Diagnostic;
}

/**
 * LinkAssetResolver validates and rewrites internal references.
 * - External links (http://, https://, mailto:, #) pass through unchanged.
 * - Internal doc links are resolved relative to the docs graph.
 * - Images and static assets are validated for existence.
 */
export class LinkAssetResolver {
  private graph: DocsGraph;
  private entryIdByRelPath: Map<string, string>;
  private devMode: boolean;

  constructor(graph: DocsGraph, devMode = true) {
    this.graph = graph;
    this.devMode = devMode;
    this.entryIdByRelPath = new Map(graph.pages.map((p) => [p.relativePath, p.entryId]));
  }

  /**
   * Classify a href: 'external', 'anchor', 'internal-doc', 'asset'.
   */
  classify(href: string): 'external' | 'anchor' | 'internal-doc' | 'asset' {
    if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return 'external';
    if (href.startsWith('#')) return 'anchor';
    if (/\.(md|mdx)$/i.test(href)) return 'internal-doc';
    return 'asset';
  }

  /**
   * Resolve a link href found in `sourceRelPath` to a site URL.
   */
  resolveLink(href: string, sourceRelPath: string): LinkResolutionResult {
    const type = this.classify(href);

    if (type === 'external' || type === 'anchor') {
      return { resolved: true, href };
    }

    const sourceDir = path.dirname(sourceRelPath).replace(/\\/g, '/');

    if (type === 'internal-doc') {
      // Strip anchor fragment from href before resolving
      const [hrefPath, fragment] = href.split('#');
      const resolved = path
        .posix
        .normalize(sourceDir === '.' ? hrefPath : `${sourceDir}/${hrefPath}`);

      const entryId = this.entryIdByRelPath.get(resolved);
      if (!entryId) {
        const diagnostic: Diagnostic = {
          type: this.devMode ? 'warning' : 'error',
          code: 'BROKEN_INTERNAL_LINK',
          message: `Cannot resolve internal link "${href}" in "${sourceRelPath}"`,
          file: sourceRelPath,
        };
        return { resolved: false, diagnostic };
      }

      const finalHref = fragment ? `/${entryId}/#${fragment}` : `/${entryId}/`;
      return { resolved: true, href: finalHref };
    }

    // Asset: validate existence on disk
    const assetRelPath = path.posix.normalize(
      sourceDir === '.' ? href : `${sourceDir}/${href}`,
    );
    const absoluteAssetPath = path.join(this.graph.root, assetRelPath);

    if (!fs.existsSync(absoluteAssetPath)) {
      const diagnostic: Diagnostic = {
        type: this.devMode ? 'warning' : 'error',
        code: 'UNRESOLVED_ASSET',
        message: `Cannot find asset "${href}" referenced in "${sourceRelPath}"`,
        file: sourceRelPath,
      };
      return { resolved: false, diagnostic };
    }

    return { resolved: true, href: `/${assetRelPath}` };
  }
}
