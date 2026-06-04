import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import ignoreLib from 'ignore';
import { artifactFileNames, type FeaDocsDiagnosticsFile, type FeaDocsManifest } from '@fea-docs/schema';

// The `ignore` package exports itself differently across module modes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createIgnore: () => ReturnType<typeof ignoreLib['default']> = (ignoreLib as any).default ?? ignoreLib;

export interface NormalizeOptions {
  sourceRoot: string;
  outputRoot: string;
  targetId: string;
  strict?: boolean;
  configuredTargets?: string[];
  ignore?: string[];
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
}

export async function normalizeVault(options: NormalizeOptions): Promise<NormalizeResult> {
  const sourceRoot = path.resolve(options.sourceRoot);
  const outputRoot = path.resolve(options.outputRoot);
  const configuredTargets = new Set(options.configuredTargets ?? [options.targetId]);
  const generatedAt = new Date().toISOString();

  if (!configuredTargets.has(options.targetId)) {
    throw new Error(`Unknown target "${options.targetId}". Configure it before normalizing.`);
  }

  const diagnostics: FeaDocsDiagnosticsFile = {
    version: 1,
    generatedAt,
    diagnostics: [],
  };

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  const gitignoreFilter = buildGitignoreFilter(sourceRoot);
  const ignoreGlobs = [...DEFAULT_IGNORE_GLOBS, ...(options.ignore ?? [])];
  const files = await fg(['**/*'], {
    cwd: sourceRoot,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: ignoreGlobs,
  });

  const filteredFiles = files
    .filter((file) => !gitignoreFilter?.ignores(file))
    .sort();

  const pages: SourcePage[] = [];
  const staticFiles: string[] = [];

  for (const relativePath of filteredFiles) {
    const absolutePath = path.join(sourceRoot, relativePath);
    if (/\.mdx?$/i.test(relativePath)) {
      const page = readPage(sourceRoot, absolutePath, relativePath);
      const unknownTargets = publishTargets(page.frontmatter.publish as PublishValue)
        .filter((target) => !configuredTargets.has(target));
      for (const target of unknownTargets) {
        diagnostics.diagnostics.push({
          code: 'UNKNOWN_PUBLISH_TARGET',
          severity: options.strict ? 'error' : 'warning',
          sourcePath: relativePath,
          message: `Unknown publish target "${target}".`,
          suggestion: 'Add the target to fea-docs config or remove it from frontmatter.',
        });
      }

      if (isPublicForTarget(page.frontmatter, options.targetId)) {
        pages.push(page);
      }
    } else if (!relativePath.startsWith('private/') && !relativePath.startsWith('drafts/')) {
      staticFiles.push(relativePath);
    }
  }

  if (options.strict && diagnostics.diagnostics.some((d) => d.severity === 'error')) {
    writeJson(path.join(outputRoot, artifactFileNames.diagnostics), diagnostics);
    throw new Error('Normalization failed due to strict diagnostics.');
  }

  for (const page of pages) {
    copyFile(page.absolutePath, path.join(outputRoot, page.outputPath));
  }
  for (const staticFile of staticFiles) {
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
    })),
    assets: staticFiles.filter((file) => file.startsWith('assets/')),
    staticFiles,
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
    nodes: pages.map((page) => ({ id: page.route, title: page.title, route: page.route })),
    edges: [],
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
      included: page.frontmatter.pagefind !== false,
      ...(page.frontmatter.pagefind === false ? { reason: 'pagefind:false' } : {}),
    })),
  });

  return { manifest, diagnostics };
}

function buildGitignoreFilter(root: string): ReturnType<typeof ignoreLib.default> | null {
  const gitignorePath = path.join(root, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return null;
  return createIgnore().add(fs.readFileSync(gitignorePath, 'utf-8'));
}

function readPage(root: string, absolutePath: string, relativePath: string): SourcePage {
  const raw = fs.readFileSync(absolutePath, 'utf-8');
  const parsed = matter(raw);
  const format = relativePath.endsWith('.mdx') ? 'mdx' : 'md';
  const title = deriveTitle(parsed.data, parsed.content, relativePath);
  return {
    relativePath,
    absolutePath,
    outputPath: relativePath,
    route: routeFor(relativePath),
    title,
    format,
    frontmatter: parsed.data,
  };
}

function deriveTitle(frontmatter: Record<string, unknown>, content: string, relativePath: string): string {
  if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) return frontmatter.title.trim();
  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (h1) return h1;
  return path.basename(relativePath).replace(/\.(md|mdx)$/i, '').replace(/[-_]/g, ' ');
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
