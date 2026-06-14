import fs from 'node:fs';
import path from 'node:path';
import type { DocsGraph, FrameworkAdapter } from '../types.js';

const IMPORT_RE = /(?:^|\n)\s*import\s+(?:[^'"\n]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const SUPPORTED_SOURCE_EXTS = [
  '.mdx',
  '.astro',
  '.tsx',
  '.jsx',
  '.ts',
  '.js',
  '.mjs',
  '.cjs',
  '.svelte',
  '.vue',
];

export interface MdxInferenceDiagnostic {
  code: 'MDX_IMPORT_UNRESOLVED';
  message: string;
  file: string;
}

export interface FrameworkInferenceResult {
  frameworks: FrameworkAdapter[];
  diagnostics: MdxInferenceDiagnostic[];
  reasons: string[];
}

const FILE_SPECIFIER_EXT_RE = /\.(mdx?|astro|[cm]?[jt]sx?|svelte|vue)$/i;

function frameworkFromSourceExtension(specifier: string): FrameworkAdapter | null {
  const lower = specifier.toLowerCase();
  if (lower.endsWith('.svelte')) return 'svelte';
  if (lower.endsWith('.vue')) return 'vue';
  return null;
}

function isAmbiguousJsxSpecifier(specifier: string): boolean {
  const lower = specifier.toLowerCase();
  return lower.endsWith('.jsx') || lower.endsWith('.tsx');
}

function isLikelyFileSpecifier(specifier: string): boolean {
  return FILE_SPECIFIER_EXT_RE.test(specifier);
}

function extractImports(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1]?.trim();
    if (specifier) out.push(specifier);
  }
  return out;
}

function resolveAliasImport(specifier: string, aliases: Record<string, string>): string | null {
  const sorted = Object.entries(aliases).sort(([a], [b]) => b.length - a.length);
  for (const [alias, target] of sorted) {
    if (specifier === alias) return target;
    if (specifier.startsWith(`${alias}/`)) {
      return path.join(target, specifier.slice(alias.length + 1));
    }
  }
  return null;
}

function resolveLocalImport(
  importerPath: string,
  specifier: string,
  aliases: Record<string, string>,
): string | null {
  let candidateBase: string | null = null;
  if (specifier.startsWith('.')) {
    candidateBase = path.resolve(path.dirname(importerPath), specifier);
  } else {
    const aliased = resolveAliasImport(specifier, aliases);
    if (aliased) candidateBase = path.resolve(aliased);
  }

  if (!candidateBase) return null;

  const ext = path.extname(candidateBase).toLowerCase();
  if (ext && fs.existsSync(candidateBase) && fs.statSync(candidateBase).isFile()) {
    return candidateBase;
  }

  for (const suffix of SUPPORTED_SOURCE_EXTS) {
    const filePath = `${candidateBase}${suffix}`;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }
  }

  for (const suffix of SUPPORTED_SOURCE_EXTS) {
    const indexPath = path.join(candidateBase, `index${suffix}`);
    if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
      return indexPath;
    }
  }

  return null;
}

export function inferFrameworksFromMdxGraph(
  graph: DocsGraph,
  aliases: Record<string, string>,
): FrameworkInferenceResult {
  const frameworks = new Set<FrameworkAdapter>();
  const diagnostics: MdxInferenceDiagnostic[] = [];
  const reasons = new Set<string>();
  const visited = new Set<string>();
  const queue = graph.pages.filter((p) => p.ext === 'mdx').map((p) => p.absolutePath);
  let sawAmbiguousJsxTsx = false;
  let sawConfidentJsxSignal = false;

  while (queue.length > 0) {
    const currentPath = queue.pop()!;
    if (visited.has(currentPath)) continue;
    visited.add(currentPath);

    if (!fs.existsSync(currentPath) || !fs.statSync(currentPath).isFile()) {
      continue;
    }

    const ext = path.extname(currentPath).toLowerCase();
    if (ext === '.svelte') {
      frameworks.add('svelte');
      reasons.add(`detected .svelte component (${path.basename(currentPath)})`);
    }
    if (ext === '.vue') {
      frameworks.add('vue');
      reasons.add(`detected .vue component (${path.basename(currentPath)})`);
    }
    if (ext === '.jsx' || ext === '.tsx') {
      sawAmbiguousJsxTsx = true;
    }

    const source = fs.readFileSync(currentPath, 'utf-8');
    const imports = extractImports(source);

    for (const specifier of imports) {
      if (specifier === 'react' || specifier === 'react-dom' || specifier === 'react/jsx-runtime') {
        frameworks.add('react');
        sawConfidentJsxSignal = true;
        reasons.add(`detected React import (${specifier})`);
      } else if (specifier === 'solid-js' || specifier === 'solid-js/web') {
        frameworks.add('solid');
        sawConfidentJsxSignal = true;
        reasons.add(`detected Solid import (${specifier})`);
      } else if (specifier === 'vue') {
        frameworks.add('vue');
        reasons.add('detected Vue import (vue)');
      } else if (specifier === 'svelte') {
        frameworks.add('svelte');
        reasons.add('detected Svelte import (svelte)');
      } else if (specifier === '@builder.io/qwik' || specifier === '@builder.io/qwik-city') {
        frameworks.add('qwik');
        sawConfidentJsxSignal = true;
        reasons.add(`detected Qwik import (${specifier})`);
      }

      const extensionFramework = frameworkFromSourceExtension(specifier);
      if (extensionFramework) {
        frameworks.add(extensionFramework);
        reasons.add(`detected ${extensionFramework} file import (${specifier})`);
      }
      if (isAmbiguousJsxSpecifier(specifier)) {
        sawAmbiguousJsxTsx = true;
      }

      const resolvedLocalPath = resolveLocalImport(currentPath, specifier, aliases);
      if (resolvedLocalPath) {
        queue.push(resolvedLocalPath);
        continue;
      }

      const isLocalLike =
        specifier.startsWith('.') ||
        resolveAliasImport(specifier, aliases) !== null ||
        isLikelyFileSpecifier(specifier);
      if (isLocalLike) {
        diagnostics.push({
          code: 'MDX_IMPORT_UNRESOLVED',
          message: `Cannot resolve local MDX import "${specifier}" from "${currentPath}"`,
          file: path.relative(graph.root, currentPath).replace(/\\/g, '/'),
        });
      }
    }
  }

  if (sawAmbiguousJsxTsx && !sawConfidentJsxSignal) {
    frameworks.add('react');
    frameworks.add('solid');
    frameworks.add('qwik');
    reasons.add('detected ambiguous JSX/TSX components; enabling react+solid+qwik fallback');
  }

  return {
    frameworks: Array.from(frameworks),
    diagnostics,
    reasons: Array.from(reasons),
  };
}
