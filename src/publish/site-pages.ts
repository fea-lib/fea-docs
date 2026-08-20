import type { DocPage } from '../types.js';
import type { EmittedFile } from './publisher.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function shell(title: string, navItems: string[], mainHtml: string): string {
  const nav =
    navItems.length === 0
      ? '    <ul></ul>'
      : `    <ul>\n${navItems.map((item) => `      <li>${item}</li>`).join('\n')}\n    </ul>`;
  const main = mainHtml
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeHtml(title)}</title>`,
    '</head>',
    '<body>',
    '  <nav>',
    nav,
    '  </nav>',
    '  <main>',
    main,
    '  </main>',
    '</body>',
    '</html>',
  ].join('\n');
}

/**
 * The default page for an empty/no-renderable tree: an empty navigation tree
 * plus a message page. Always emitted at `index.html` so the output is a
 * browsable static site even when nothing was found.
 */
export function emptySitePage(): EmittedFile {
  const content = shell(
    'fea-docs',
    [],
    '<p>No documentation pages were found in this build.</p>',
  );
  return { relativePath: 'index.html', content };
}

/**
 * Ticket-01 scaffold for the non-empty tree: a deterministic index page that
 * lists the discovered pages. Real per-page rendering and the HTML/CSS shell
 * land in later build tickets (02/03).
 */
export function indexPage(pages: DocPage[]): EmittedFile {
  const navItems = pages.map((page) => `<code>${escapeHtml(page.relativePath)}</code>`);
  const list = pages
    .map((page) => `<li><code>${escapeHtml(page.relativePath)}</code></li>`)
    .join('\n');
  const content = shell(
    'fea-docs',
    navItems,
    `<p>${pages.length} documentation page(s) discovered.</p>\n<ul>\n${list}\n</ul>`,
  );
  return { relativePath: 'index.html', content };
}