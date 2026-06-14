import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { deriveLabel, injectFrontmatterTitle } from '../../content-graph/parser.js';
import { DEFAULT_IGNORE_GLOBS } from '../../content-graph/defaults.js';

const IMPORT_RE = /(?:^|\n)\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;

function stripJsonComments(raw: string): string {
  return raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseTsconfigAliases(root: string): Record<string, string> | null {
  const candidates = ['tsconfig.json', 'jsconfig.json'];
  let configPath: string | null = null;
  for (const name of candidates) {
    const candidate = path.join(root, name);
    if (fs.existsSync(candidate)) {
      configPath = candidate;
      break;
    }
  }
  if (!configPath) return null;

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch {
    return null;
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw);
  } catch {
    try {
      json = JSON.parse(stripJsonComments(raw));
    } catch {
      return null;
    }
  }

  const paths = (json as { compilerOptions?: { paths?: Record<string, string[]> } })
    .compilerOptions?.paths;
  if (!paths || typeof paths !== 'object') return null;

  const result: Record<string, string> = {};
  for (const [pattern, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets) || targets.length === 0) continue;

    const aliasKey = pattern.includes('/*') ? pattern.replace('/*', '') : pattern;
    if (!aliasKey.startsWith('@') && !aliasKey.startsWith('~')) continue;

    const target = targets[0];
    const resolvedTarget = target.replace('/*', '').replace('*', '');
    const absPath = path.resolve(root, resolvedTarget);
    result[aliasKey] = absPath;
  }

  return Object.keys(result).length > 0 ? result : null;
}

interface InitOptions {
  root: string;
  dryRun: boolean;
}

export function initCommand(): Command {
  return new Command('init')
    .description('Initialize a fea-docs.config.mjs in the current directory')
    .option('--dry-run', 'Preview the generated config without writing files')
    .option('--root <path>', 'Scan root directory (default: cwd)')
    .action(async (opts) => {
      try {
        await runInit({
          root: opts.root ? String(opts.root) : process.cwd(),
          dryRun: Boolean(opts.dryRun),
        });
      } catch (err) {
        console.error(pc.red('Error:'), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

async function runInit(options: InitOptions): Promise<void> {
  const { root, dryRun } = options;

  const configPath = path.join(root, 'fea-docs.config.mjs');
  if (fs.existsSync(configPath)) {
    console.log(pc.yellow('fea-docs.config.mjs already exists — delete it first to regenerate.'));
    return;
  }

  const docFiles = await fg(['**/*.md', '**/*.mdx'], {
    cwd: root,
    ignore: DEFAULT_IGNORE_GLOBS,
    dot: true,
  });

  if (docFiles.length === 0) {
    console.log(pc.yellow('No documentation files found.'));
    return;
  }

  let titleInjected = 0;
  const mdxFiles: string[] = [];

  for (const relPath of docFiles) {
    const absPath = path.join(root, relPath);
    const raw = fs.readFileSync(absPath, 'utf-8');
    const { data: frontmatter, content } = matter(raw);
    const label = deriveLabel(frontmatter, content, relPath);

    if (!dryRun) {
      const updated = injectFrontmatterTitle(absPath, raw, label);
      if (updated !== raw) titleInjected++;
    } else {
      if (!frontmatter.title || !String(frontmatter.title).trim()) {
        titleInjected++;
      }
    }

    if (relPath.endsWith('.mdx')) {
      mdxFiles.push(relPath);
    }
  }

  const componentExts = ['.astro', '.tsx', '.jsx', '.svelte', '.vue'];
  const componentFiles = await fg(
    componentExts.map(e => `**/*${e}`),
    { cwd: root, ignore: DEFAULT_IGNORE_GLOBS, dot: true },
  );

  const allSpecifiers = new Set<string>();
  const scanTargets = [
    ...mdxFiles,
    ...componentFiles.filter(f =>
      /\.(astro|tsx|jsx|svelte|vue)$/i.test(f),
    ),
  ];

  for (const relPath of scanTargets) {
    const absPath = path.join(root, relPath);
    const fileContent = fs.readFileSync(absPath, 'utf-8');
    for (const match of fileContent.matchAll(IMPORT_RE)) {
      const specifier = match[1]?.trim();
      if (specifier) allSpecifiers.add(specifier);
    }
  }

  const frameworks = new Set<string>();
  const aliases: Record<string, string> = {};
  const dependencies: Record<string, string> = {};
  const unresolved: string[] = [];

  const tsconfigAliases = parseTsconfigAliases(root);

  const frameworkPackageRoots = new Set([
    'react', 'react-dom', 'solid-js', 'vue', 'svelte', '@builder.io',
  ]);

  for (const specifier of allSpecifiers) {
    if (specifier.startsWith('.')) continue;

    const rootSeg = specifier.split('/')[0]!;

    if (specifier === 'react' || specifier === 'react-dom' || specifier === 'react/jsx-runtime') {
      frameworks.add('react');
    } else if (specifier === 'solid-js' || specifier === 'solid-js/web') {
      frameworks.add('solid');
    } else if (specifier === 'vue') {
      frameworks.add('vue');
    } else if (specifier === 'svelte') {
      frameworks.add('svelte');
    } else if (specifier.startsWith('@builder.io/qwik')) {
      frameworks.add('qwik');
    }

    const ext = path.extname(specifier).toLowerCase();
    if (ext === '.svelte') frameworks.add('svelte');
    if (ext === '.vue') frameworks.add('vue');

    let aliasTarget: string | null = null;
    if (rootSeg.startsWith('@')) {
      const stripped = rootSeg.slice(1);
      if (stripped.length > 0) {
        const candidate = path.join(root, stripped);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          aliasTarget = candidate;
        } else {
          const fullAlias = path.join(root, rootSeg);
          if (fs.existsSync(fullAlias) && fs.statSync(fullAlias).isDirectory()) {
            aliasTarget = fullAlias;
          }
        }
      }
    } else if (rootSeg.startsWith('~')) {
      const candidate = path.join(root, rootSeg.slice(1));
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        aliasTarget = candidate;
      }
    }

    if (aliasTarget) {
      aliases[rootSeg] = aliasTarget;
      continue;
    }

    let matchedTsconfigAlias = false;
    if (tsconfigAliases) {
      const sorted = Object.entries(tsconfigAliases).sort(([a], [b]) => b.length - a.length);
      for (const [aliasKey, aliasTarget] of sorted) {
        if (specifier === aliasKey || specifier.startsWith(`${aliasKey}/`)) {
          aliases[aliasKey] = aliasTarget;
          matchedTsconfigAlias = true;
          break;
        }
      }
    }
    if (matchedTsconfigAlias) continue;

    if (frameworkPackageRoots.has(rootSeg)) continue;

    const isScoped = specifier.startsWith('@');
    const pkgRoot = isScoped
      ? `${rootSeg}/${specifier.split('/')[1]}`
      : rootSeg;
    const pkgJsonPath = path.join(root, 'node_modules', pkgRoot, 'package.json');

    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        dependencies[specifier] = `^${pkg.version}`;
      } catch {
        dependencies[specifier] = '*';
      }
    } else {
      dependencies[specifier] = '*';
      unresolved.push(specifier);
    }
  }

  const hasJsxTsx = componentFiles.some(f => /\.tsx?$/.test(f));
  const hasConfidentSignal =
    frameworks.has('react') || frameworks.has('solid') || frameworks.has('qwik');

  if (hasJsxTsx && !hasConfidentSignal) {
    frameworks.add('react');
    frameworks.add('solid');
    frameworks.add('qwik');
  }

  if (componentFiles.some(f => f.endsWith('.svelte'))) frameworks.add('svelte');
  if (componentFiles.some(f => f.endsWith('.vue'))) frameworks.add('vue');

  const configContent = generateConfig({
    frameworks: Array.from(frameworks).sort(),
    aliases,
    dependencies,
    root,
  });

  if (dryRun) {
    console.log(pc.cyan('\n=== Generated fea-docs.config.mjs (dry-run) ===\n'));
    console.log(configContent);
  } else {
    fs.writeFileSync(configPath, configContent, 'utf-8');
    console.log(pc.green(`\nWrote ${configPath}`));
  }

  console.log(pc.cyan('\nSummary:'));
  console.log(`  Doc files found:        ${docFiles.length}`);
  console.log(`  Titles injected:        ${titleInjected}`);
  console.log(`  Component files found:  ${componentFiles.length}`);
  console.log(`  Frameworks detected:    ${Array.from(frameworks).join(', ') || '(none)'}`);
  console.log(`  Aliases discovered:     ${Object.keys(aliases).length}`);
  console.log(`  Dependencies found:     ${Object.keys(dependencies).length}`);

  if (unresolved.length > 0) {
    console.log(pc.yellow(`\n  Warning: ${unresolved.length} import(s) not found in node_modules (version set to '*')`));
    for (const spec of unresolved) {
      console.log(pc.yellow(`    ${spec}`));
    }
  }
}

function generateConfig(data: {
  frameworks: string[];
  aliases: Record<string, string>;
  dependencies: Record<string, string>;
  root: string;
}): string {
  const { frameworks, aliases, dependencies, root } = data;
  const lines: string[] = [];

  lines.push('// Auto-generated by `fea-docs init` — review before using.');
  lines.push("import { fileURLToPath } from 'node:url';");
  lines.push("import path from 'node:path';");
  lines.push('');
  lines.push("const __dirname = path.dirname(fileURLToPath(import.meta.url));");
  lines.push("const root = path.resolve(__dirname, '.');");
  lines.push('');
  lines.push("/** @type {import('fea-docs').FeaDocsConfig} */");
  lines.push('export default {');

  if (frameworks.length > 0) {
    lines.push(`  frameworks: [${frameworks.map(f => `'${f}'`).join(', ')}],`);
  }

  if (Object.keys(aliases).length > 0) {
    lines.push('  aliases: {');
    for (const [key, val] of Object.entries(aliases).sort(([a], [b]) => b.length - a.length || a.localeCompare(b))) {
      const rel = path.relative(root, val);
      lines.push(`    '${key}': path.join(root, '${rel}'),`);
    }
    lines.push('  },');
  }

  if (Object.keys(dependencies).length > 0) {
    lines.push('  dependencies: {');
    for (const [key, val] of Object.entries(dependencies).sort()) {
      lines.push(`    '${key}': '${val}',`);
    }
    lines.push('  },');
  }

  lines.push('};');
  return lines.join('\n') + '\n';
}

export { runInit, generateConfig };
