/**
 * Phase 7: Backlink Renderer
 *
 * After `normalizeVault()` produces a normalized docs tree, this module reads
 * `fea-docs.manifest.json` and `fea-docs.backlinks.json` from the output root
 * and appends a `## Backlinks` section to each normalized page that has opted
 * in via frontmatter `backlinks: true` (or when global backlinks are enabled).
 *
 * This ensures backlink rendering appears in `@fea-docs/cli` static output
 * without requiring a runtime server.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { FeaDocsManifest, FeaDocsBacklinks } from '@fea-docs/schema';
import { artifactFileNames } from '@fea-docs/schema';

export interface RenderBacklinksOptions {
  /** Normalized docs output root (contains manifest + backlinks JSON). */
  outputRoot: string;
  /** When true, render backlinks on all pages regardless of frontmatter. */
  globalBacklinks?: boolean;
}

export interface RenderBacklinksResult {
  /** Number of pages that had a backlinks section appended. */
  pagesRendered: number;
}

/**
 * Read backlinks artifact and inject `## Backlinks` sections into eligible
 * normalized page files in the output root.
 *
 * A page is eligible if:
 *   - `globalBacklinks` is true, OR
 *   - the manifest entry has `backlinks: true`
 *
 * If the page has no incoming backlinks, no section is appended.
 */
export function renderBacklinks(options: RenderBacklinksOptions): RenderBacklinksResult {
  const manifestPath = path.join(options.outputRoot, artifactFileNames.manifest);
  const backlinksPath = path.join(options.outputRoot, artifactFileNames.backlinks);

  if (!fs.existsSync(manifestPath) || !fs.existsSync(backlinksPath)) {
    return { pagesRendered: 0 };
  }

  const manifest: FeaDocsManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const backlinks: FeaDocsBacklinks = JSON.parse(fs.readFileSync(backlinksPath, 'utf-8'));

  let pagesRendered = 0;

  for (const page of manifest.pages) {
    const shouldRender = options.globalBacklinks === true || page.backlinks === true;
    if (!shouldRender) continue;

    const incomingLinks = backlinks.pages[page.route];
    if (!incomingLinks || incomingLinks.length === 0) continue;

    const outputFilePath = path.join(options.outputRoot, page.outputPath);
    if (!fs.existsSync(outputFilePath)) continue;

    const existing = fs.readFileSync(outputFilePath, 'utf-8');

    // Do not append if a backlinks section already exists (idempotency).
    if (existing.includes('## Backlinks')) continue;

    const backlinksSection = buildBacklinksSection(incomingLinks);
    const updated = existing.trimEnd() + '\n\n' + backlinksSection + '\n';
    fs.writeFileSync(outputFilePath, updated, 'utf-8');
    pagesRendered++;
  }

  return { pagesRendered };
}

function buildBacklinksSection(
  entries: Array<{ sourceId: string; sourceTitle: string; sourceRoute: string }>,
): string {
  const lines = ['## Backlinks', ''];
  for (const entry of entries) {
    lines.push(`- [${entry.sourceTitle}](${entry.sourceRoute})`);
  }
  return lines.join('\n');
}
