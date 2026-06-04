import path from 'node:path';

// Non-Markdown extensions that are treated as embeddable/linkable assets.
const ASSET_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif',
  'mp4', 'webm', 'ogg', 'mp3', 'wav',
  'pdf', 'csv', 'json', 'xml',
  'zip', 'tar', 'gz',
  'woff', 'woff2', 'ttf', 'eot',
  'ico', 'bmp', 'tiff', 'tif',
  'js', 'css',
  'txt', 'yaml', 'yml', 'toml',
]);

function isAssetExtension(ext: string): boolean {
  return ASSET_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Scan Markdown/MDX content for asset references and return a set of
 * referenced filenames/paths that could match static files in the vault.
 *
 * Returns both relative paths (as written in the source) and basenames
 * so Obsidian-style short references (`![[image.png]]`) can be matched
 * against the vault-wide flat file list.
 *
 * @param content  The raw content of the source file.
 * @param pageRelativePath  The relative path of the source file within the vault.
 * @returns Object with `relativePaths` (resolved relative to source file) and
 *          `basenames` (flat names for Obsidian-style embeds).
 */
export function extractAssetReferences(
  content: string,
  pageRelativePath: string,
): { relativePaths: string[]; basenames: string[] } {
  const relativePaths: string[] = [];
  const basenames: string[] = [];

  const pageDir = path.dirname(pageRelativePath);

  // Strip fenced code blocks before scanning to avoid false positives.
  const stripped = stripCodeAndMdxSyntax(content);

  // 1. Markdown images: ![alt](path) — path must not start with http/https.
  const mdImage = /!\[(?:[^\]]*)\]\(([^)]+)\)/g;
  for (const match of stripped.matchAll(mdImage)) {
    const ref = match[1].split(/[?#]/)[0].trim();
    if (ref && !isExternalUrl(ref) && isAssetExtension(extOf(ref))) {
      relativePaths.push(resolveRef(ref, pageDir));
    }
  }

  // 2. Markdown links to non-Markdown files: [text](path.ext)
  const mdLink = /\[(?:[^\]]*)\]\(([^)]+)\)/g;
  for (const match of stripped.matchAll(mdLink)) {
    const ref = match[1].split(/[?#]/)[0].trim();
    if (ref && !isExternalUrl(ref) && isAssetExtension(extOf(ref))) {
      relativePaths.push(resolveRef(ref, pageDir));
    }
  }

  // 3. Obsidian embed: ![[filename.ext]] — treated as vault-wide basename.
  const obsidianEmbed = /!\[\[([^\]]+)\]\]/g;
  for (const match of stripped.matchAll(obsidianEmbed)) {
    const ref = match[1].split(/[|#]/)[0].trim();
    if (ref && isAssetExtension(extOf(ref))) {
      basenames.push(ref);
    }
  }

  // 4. MDX static imports: import X from './path.ext' or import './path.ext'
  const mdxImport = /import(?:\s+\w+\s+from)?\s+['"]([^'"]+)['"]/g;
  for (const match of stripped.matchAll(mdxImport)) {
    const ref = match[1].trim();
    if (!isExternalUrl(ref) && isAssetExtension(extOf(ref))) {
      relativePaths.push(resolveRef(ref, pageDir));
    }
  }

  return {
    relativePaths: [...new Set(relativePaths)],
    basenames: [...new Set(basenames)],
  };
}

/**
 * Given a list of all static files in the vault, a list of target-public
 * pages (with their content), and an optional list of public asset
 * directories, return the subset of static files that should be copied
 * into the normalized docs tree.
 *
 * @param allStaticFiles  All non-Markdown files discovered in the vault (relative paths).
 * @param publicPages  Pages that are public for the selected target.
 * @param publicAssetDirs  Optional explicit public asset directory prefixes (e.g. ['assets/']).
 */
export function selectStaticFilesToCopy(
  allStaticFiles: string[],
  publicPages: Array<{ relativePath: string; rawContent: string }>,
  publicAssetDirs: string[] = [],
): string[] {
  const selected = new Set<string>();

  // Build a basename → relative path map for Obsidian-style flat resolution.
  const basenameMap = new Map<string, string[]>();
  for (const filePath of allStaticFiles) {
    const base = path.basename(filePath);
    const list = basenameMap.get(base) ?? [];
    list.push(filePath);
    basenameMap.set(base, list);
  }

  // Normalise paths to POSIX-style (forward slashes) for comparison.
  const normStatic = new Map<string, string>();
  for (const f of allStaticFiles) {
    normStatic.set(f.replace(/\\/g, '/'), f);
  }

  for (const page of publicPages) {
    const { relativePaths, basenames } = extractAssetReferences(page.rawContent, page.relativePath);

    for (const refPath of relativePaths) {
      const normalised = refPath.replace(/\\/g, '/');
      const original = normStatic.get(normalised);
      if (original) selected.add(original);
    }

    for (const basename of basenames) {
      const matches = basenameMap.get(basename) ?? [];
      for (const match of matches) {
        selected.add(match);
      }
    }
  }

  // Include explicitly configured public asset directories.
  for (const dir of publicAssetDirs) {
    const prefix = dir.replace(/\\/g, '/').replace(/\/?$/, '/');
    for (const f of allStaticFiles) {
      if (f.replace(/\\/g, '/').startsWith(prefix)) {
        selected.add(f);
      }
    }
  }

  return Array.from(selected).sort();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isExternalUrl(ref: string): boolean {
  return /^https?:\/\//i.test(ref) || /^\/\//.test(ref);
}

function extOf(ref: string): string {
  return path.extname(ref).replace(/^\./, '').toLowerCase();
}

function resolveRef(ref: string, pageDir: string): string {
  if (ref.startsWith('/')) return ref.slice(1); // root-relative
  return path.join(pageDir, ref).replace(/\\/g, '/');
}

function stripCodeAndMdxSyntax(content: string): string {
  // Remove fenced code blocks.
  return content.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1\s*$/gm, '');
}
