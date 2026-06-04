import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import ignoreLib from 'ignore';
import { artifactFileNames, type FeaDocsDiagnosticsFile, type FeaDocsGraphEdge, type FeaDocsManifest } from '@fea-docs/schema';
import { deriveTitle, extractMetadata } from './metadata.js';
import { selectStaticFilesToCopy } from './assets.js';
import { buildPageIndex, transformWikilinks, type PageRef } from './wikilinks.js';

// The `ignore` package exports itself differently across module modes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createIgnore: () => ReturnType<typeof ignoreLib['default']> = (ignoreLib as any).default ?? ignoreLib;

export type NormalizeMode = 'development' | 'production';

export interface NormalizeOptions {
  sourceRoot: string;
  outputRoot: string;
  targetId: string;
  strict?: boolean;
  /** 'production' (default) or 'development'. Development mode emits info diagnostics instead of skipping silently. */
  mode?: NormalizeMode;
  configuredTargets?: string[];
  ignore?: string[];
  /** Explicit public asset directories (relative to sourceRoot) always copied regardless of references. */
  publicAssetDirs?: string[];
}

export interface NormalizeResult {
  manifest: FeaDocsManifest;
  diagnostics: FeaDocsDiagnosticsFile;
}

export type Normalizer = (options: NormalizeOptions) => Promise<NormalizeResult>;

const DEFAULT_IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.git/**',
  '**/.*/**',
  '**/.DS_Store',
  '**/*.log',
];

type PublishValue = string | string[] | boolean | undefined;

interface SourcePage {
  relativePath: string;
  absolutePath: string;
  outputPath: string;
  route: string;
  title: string;
  format: 'md' | 'mdx';
  frontmatter: Record<string, unknown>;
  rawContent: string;
  metadata: ReturnType<typeof extractMetadata>;
}

/** Diagnostics emitted for filtering decisions — useful in development mode. */
interface FilterDecision {
  file: string;
  reason: 'ignored' | 'draft' | 'private' | 'not-for-target';
}

export async function normalizeVault(options: NormalizeOptions): Promise<NormalizeResult> {
  const sourceRoot = path.resolve(options.sourceRoot);
  const outputRoot = path.resolve(options.outputRoot);
  const configuredTargets = new Set(options.configuredTargets ?? [options.targetId]);
  const mode: NormalizeMode = options.mode ?? 'production';
  const generatedAt = new Date().toISOString();

  if (!configuredTargets.has(options.targetId)) {
    throw new Error(`Unknown target "${options.targetId}". Configure it before normalizing.`);
  }

  const diagnostics: FeaDocsDiagnosticsFile = {
    version: 1,
    generatedAt,
    diagnostics: [],
  };

  const addDiagnostic = (
    code: string,
    severity: 'info' | 'warning' | 'error',
    message: string,
    sourcePath?: string,
    suggestion?: string,
    location?: { line?: number; column?: number },
  ) => {
    diagnostics.diagnostics.push({ code, severity, message, ...(sourcePath ? { sourcePath } : {}), ...(suggestion ? { suggestion } : {}), ...(location ? { location } : {}) });
  };

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  const gitignoreFilter = buildGitignoreFilter(sourceRoot);
  const ignoreGlobs = [...DEFAULT_IGNORE_GLOBS, ...(options.ignore ?? [])];
  const allFiles = await fg(['**/*'], {
    cwd: sourceRoot,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: ignoreGlobs,
  });

  const filteredFiles = allFiles
    .filter((file) => !gitignoreFilter?.ignores(file))
    .sort();

  const filterDecisions: FilterDecision[] = [];
  const pages: SourcePage[] = [];
  const allStaticFiles: string[] = [];

  for (const relativePath of filteredFiles) {
    const absolutePath = path.join(sourceRoot, relativePath);

    if (/\.mdx?$/i.test(relativePath)) {
      const raw = fs.readFileSync(absolutePath, 'utf-8');
      const parsed = matter(raw);
      const fm = parsed.data as Record<string, unknown>;
      const format: 'md' | 'mdx' = relativePath.endsWith('.mdx') ? 'mdx' : 'md';
      const { title, titleFromFilename } = deriveTitle(fm, parsed.content, relativePath);
      const meta = extractMetadata(fm, parsed.content, relativePath);

      // Validate frontmatter types.
      if (fm.title !== undefined && typeof fm.title !== 'string') {
        addDiagnostic(
          'FRONTMATTER_SCHEMA_ERROR',
          options.strict ? 'error' : 'warning',
          `Frontmatter "title" must be a string but got ${typeof fm.title}.`,
          relativePath,
          'Change the title value to a string.',
        );
      }
      if (fm.aliases !== undefined && !Array.isArray(fm.aliases) && typeof fm.aliases !== 'string') {
        addDiagnostic(
          'FRONTMATTER_SCHEMA_ERROR',
          options.strict ? 'error' : 'warning',
          `Frontmatter "aliases" must be a string or array.`,
          relativePath,
          'Use a YAML string or list for aliases.',
        );
      }

      // Warn/fail on unknown targets.
      const unknownTargets = publishTargets(fm.publish as PublishValue)
        .filter((t) => !configuredTargets.has(t));
      for (const target of unknownTargets) {
        addDiagnostic(
          'UNKNOWN_PUBLISH_TARGET',
          options.strict ? 'error' : 'warning',
          `Unknown publish target "${target}".`,
          relativePath,
          'Add the target to fea-docs config or remove it from frontmatter.',
        );
      }

      // Warn in dev mode when title falls back to filename.
      if (titleFromFilename) {
        addDiagnostic(
          'MISSING_TITLE',
          options.strict ? 'error' : 'warning',
          `No frontmatter title or H1 found; using filename "${title}" as title.`,
          relativePath,
          'Add a frontmatter title or an H1 heading to the page.',
        );
      }

      // Filter: draft pages.
      if (fm.draft === true) {
        filterDecisions.push({ file: relativePath, reason: 'draft' });
        if (mode === 'development') {
          addDiagnostic('FILTERED_DRAFT', 'info', `Page excluded (draft: true).`, relativePath);
        }
        continue;
      }

      // Filter: not public for this target.
      if (!isPublicForTarget(fm, options.targetId)) {
        const reason = fm.publish === false || fm.publish === undefined ? 'private' : 'not-for-target';
        filterDecisions.push({ file: relativePath, reason });
        if (mode === 'development') {
          addDiagnostic(
            'FILTERED_NON_TARGET',
            'info',
            `Page excluded from target "${options.targetId}" (publish=${JSON.stringify(fm.publish)}).`,
            relativePath,
          );
        }
        continue;
      }

      pages.push({
        relativePath,
        absolutePath,
        outputPath: relativePath,
        route: routeFor(relativePath),
        title,
        format,
        frontmatter: fm,
        rawContent: raw,
        metadata: { ...meta, titleFromFilename },
      });
    } else {
      allStaticFiles.push(relativePath);
    }
  }

  // Check for duplicate routes/slugs (strict: error, dev: warning).
  const routeMap = new Map<string, string>();
  for (const page of pages) {
    const existing = routeMap.get(page.route);
    if (existing) {
      addDiagnostic(
        'DUPLICATE_SLUG',
        options.strict ? 'error' : 'warning',
        `Duplicate route "${page.route}" from "${page.relativePath}" and "${existing}".`,
        page.relativePath,
        'Rename one of the files or set a unique frontmatter slug.',
      );
    } else {
      routeMap.set(page.route, page.relativePath);
    }
  }

  // Fail early if strict and there are errors.
  if (options.strict && diagnostics.diagnostics.some((d) => d.severity === 'error')) {
    writeJson(path.join(outputRoot, artifactFileNames.diagnostics), diagnostics);
    throw new Error('Normalization failed due to strict diagnostics.');
  }

  // Determine which static files to copy (referenced from public pages + explicit dirs).
  const publicAssetDirs = options.publicAssetDirs ?? [];
  const staticFilesToCopy = selectStaticFilesToCopy(
    allStaticFiles,
    pages.map((p) => ({ relativePath: p.relativePath, rawContent: p.rawContent })),
    publicAssetDirs,
  );

  // Emit filter decisions as debug log if in development mode.
  if (mode === 'development' && filterDecisions.length > 0) {
    for (const decision of filterDecisions) {
      // Already emitted as info diagnostics above; just ensure they're recorded.
      void decision;
    }
  }

  // Build the page index for wikilink resolution.
  const pageRefs: PageRef[] = pages.map((page) => ({
    relativePath: page.relativePath,
    route: page.route,
    title: page.title,
    aliases: page.metadata.aliases,
    headings: page.metadata.headings,
    blockIds: page.metadata.blockIds,
  }));
  const pageIndex = buildPageIndex(pageRefs);

  // Collect graph edges from wikilink resolution across all pages.
  const allGraphEdges: FeaDocsGraphEdge[] = [];

  // Write pages to output — transform wikilinks in each page's content.
  for (const page of pages) {
    const { content: transformed, edges, diagnostics: wikilinkDiags } = transformWikilinks(
      page.rawContent,
      page.relativePath,
      page.route,
      pageIndex,
      options.strict ?? false,
    );

    // Surface wikilink diagnostics.
    for (const d of wikilinkDiags) {
      addDiagnostic(d.code, d.severity, d.message, d.sourcePath, d.suggestion, d.location);
    }

    allGraphEdges.push(...edges);

    // Write transformed content (may differ from source if wikilinks were resolved).
    const outputFilePath = path.join(outputRoot, page.outputPath);
    fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
    fs.writeFileSync(outputFilePath, transformed, 'utf-8');
  }

  // Fail strict builds if wikilink errors were introduced.
  if (options.strict && diagnostics.diagnostics.some((d) => d.severity === 'error')) {
    writeJson(path.join(outputRoot, artifactFileNames.diagnostics), diagnostics);
    throw new Error('Normalization failed due to strict diagnostics.');
  }

  for (const staticFile of staticFilesToCopy) {
    copyFile(path.join(sourceRoot, staticFile), path.join(outputRoot, staticFile));
  }

  const manifest: FeaDocsManifest = {
    version: 1,
    targetId: options.targetId,
    generatedAt,
    pages: pages.map((page) => ({
      sourcePath: page.relativePath,
      outputPath: page.outputPath,
      route: page.route,
      title: page.title,
      format: page.format,
      aliases: page.metadata.aliases.length > 0 ? page.metadata.aliases : undefined,
      slug: page.metadata.slug,
      headings: page.metadata.headings.length > 0 ? page.metadata.headings : undefined,
      blockIds: page.metadata.blockIds.length > 0 ? page.metadata.blockIds : undefined,
      tags: page.metadata.tags.length > 0 ? page.metadata.tags : undefined,
      backlinks: page.metadata.backlinks,
      pagefind: page.metadata.pagefind,
      titleFromFilename: page.metadata.titleFromFilename || undefined,
    })),
    assets: staticFilesToCopy.filter((f) => /\.(png|jpe?g|gif|svg|webp|avif)$/i.test(f)),
    staticFiles: staticFilesToCopy,
    generatedDataFiles: [
      artifactFileNames.diagnostics,
      artifactFileNames.graph,
      artifactFileNames.backlinks,
      artifactFileNames.search,
    ],
    diagnostics: {
      info: diagnostics.diagnostics.filter((d) => d.severity === 'info').length,
      warnings: diagnostics.diagnostics.filter((d) => d.severity === 'warning').length,
      errors: diagnostics.diagnostics.filter((d) => d.severity === 'error').length,
    },
  };

  writeJson(path.join(outputRoot, artifactFileNames.manifest), manifest);
  writeJson(path.join(outputRoot, artifactFileNames.diagnostics), diagnostics);
  writeJson(path.join(outputRoot, artifactFileNames.graph), {
    version: 1,
    targetId: options.targetId,
    nodes: pages.map((page) => ({
      id: page.route,
      title: page.title,
      route: page.route,
      tags: page.metadata.tags.length > 0 ? page.metadata.tags : undefined,
    })),
    edges: allGraphEdges,
  });
  writeJson(path.join(outputRoot, artifactFileNames.backlinks), {
    version: 1,
    targetId: options.targetId,
    pages: {},
  });
  writeJson(path.join(outputRoot, artifactFileNames.search), {
    version: 1,
    targetId: options.targetId,
    pages: pages.map((page) => ({
      pageId: page.route,
      route: page.route,
      included: page.metadata.pagefind,
      ...(page.metadata.pagefind ? {} : { reason: 'pagefind:false' }),
    })),
  });

  return { manifest, diagnostics };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildGitignoreFilter(root: string): ReturnType<typeof ignoreLib.default> | null {
  const gitignorePath = path.join(root, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return null;
  return createIgnore().add(fs.readFileSync(gitignorePath, 'utf-8'));
}

function routeFor(relativePath: string): string {
  let route = relativePath.replace(/\\/g, '/').replace(/\.(md|mdx)$/i, '').toLowerCase();
  if (route === 'index') route = '';
  if (route.endsWith('/index')) route = route.slice(0, -'/index'.length);
  return `/${route}`.replace(/\/+/g, '/');
}

function publishTargets(value: PublishValue): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function isPublicForTarget(frontmatter: Record<string, unknown>, targetId: string): boolean {
  if (frontmatter.draft === true) return false;
  const publish = frontmatter.publish as PublishValue;
  if (publish === false || publish === undefined || publish === true) return false;
  return publishTargets(publish).includes(targetId);
}

function copyFile(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
