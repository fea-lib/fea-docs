import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';
import matter from 'gray-matter';
import { Command } from 'commander';
import pc from 'picocolors';
import { resolveConfig } from '../../config/resolver.js';
import type { ResolvedConfig } from '../../types.js';

interface CoverageCheck {
  label: string;
  covered: boolean;
}

export function auditCommand(): Command {
  return new Command('audit')
    .description('Audit the configured POC vault for Phase 1 coverage')
    .option('--config <path>', 'Path to an explicit config file')
    .option('--root <path>', 'Source docs root')
    .option('--out-file <path>', 'Audit report output file')
    .action(async (opts) => {
      const cliFlags: Partial<ResolvedConfig> = {
        ...(opts.root ? { root: String(opts.root) } : {}),
      };
      const config = await resolveConfig(cliFlags, opts.config);
      const outFile = path.resolve(
        opts.outFile ? String(opts.outFile) : path.join(path.dirname(config.root), 'poc-vault-audit.md'),
      );

      try {
        const report = await auditVault(config);
        writeAuditReport(outFile, report);
        const missing = report.filter((check) => !check.covered).length;
        const summary = missing === 0 ? pc.green('all checks covered') : pc.yellow(`${missing} missing/weak check(s)`);
        console.log(`Wrote ${outFile} (${summary}).`);
      } catch (err) {
        console.error(pc.red('Error:'), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

export async function auditVault(config: ResolvedConfig): Promise<CoverageCheck[]> {
  const files = await fg(['**/*'], {
    cwd: config.root,
    onlyFiles: true,
    dot: true,
    ignore: ['**/node_modules/**', '**/.*/**'],
  });
  files.sort();

  const contentFiles = files.filter((file) => /\.mdx?$/i.test(file));
  const staticFiles = files.filter((file) => !/\.mdx?$/i.test(file));
  const sources = contentFiles.map((file) => {
    const raw = fs.readFileSync(path.join(config.root, file), 'utf-8');
    const parsed = matter(raw);
    return { file, raw, frontmatter: parsed.data as Record<string, unknown> };
  });
  const allText = sources.map((source) => source.raw).join('\n');
  const publishValues = sources.map((source) => source.frontmatter.publish);

  return [
    { label: '.md source file', covered: contentFiles.some((file) => file.endsWith('.md')) },
    { label: '.mdx source file', covered: contentFiles.some((file) => file.endsWith('.mdx')) },
    { label: 'arbitrary static files', covered: staticFiles.length > 0 },
    { label: 'target-specific public metadata', covered: publishValues.some((value) => typeof value === 'string') },
    { label: 'multiple publishing targets', covered: Object.keys(config.obsidian?.targets ?? {}).length >= 2 },
    { label: 'shared multi-target page', covered: publishValues.some((value) => Array.isArray(value) && value.length >= 2) },
    { label: 'private publish:false page', covered: publishValues.includes(false) },
    { label: 'draft page', covered: sources.some((source) => source.frontmatter.draft === true) },
    { label: 'wikilinks', covered: /\[\[[^\]]+\]\]/.test(allText) },
    { label: 'callouts', covered: />\s*\[![^\]]+\]/.test(allText) },
    { label: 'embeds', covered: /!\[\[[^\]]+\]\]/.test(allText) },
    { label: 'block IDs', covered: /\s\^[A-Za-z0-9_-]+/.test(allText) },
    { label: 'backlink candidates', covered: sources.some((source) => source.frontmatter.backlinks === true) },
    { label: 'graph candidates', covered: /\[\[[^\]]+\]\]|\]\([^\)]+\.mdx?/.test(allText) },
    { label: 'search exclusion', covered: sources.some((source) => source.frontmatter.pagefind === false) },
    { label: 'MDX component usage', covered: /import\s+.+from\s+['"][^'"]+['"]/.test(allText) && /<\w+[^>]*\/>|<\w+[^>]*>/.test(allText) },
    { label: 'normalized docs destination config', covered: Object.values(config.obsidian?.targets ?? {}).some((target) => !!target.normalizedDocs) },
    { label: 'static output destination config', covered: Object.values(config.obsidian?.targets ?? {}).some((target) => !!target.staticOutput) },
  ];
}

function writeAuditReport(outFile: string, checks: CoverageCheck[]): void {
  const missing = checks.filter((check) => !check.covered);
  const lines = [
    '---',
    "title: 'POC Vault Audit'",
    '---',
    '',
    '# POC Vault Audit',
    '',
    `Covered checks: ${checks.length - missing.length}/${checks.length}.`,
    '',
    '## Coverage',
    '',
    ...checks.map((check) => `- [${check.covered ? 'x' : ' '}] ${check.label}`),
    '',
  ];
  if (missing.length > 0) {
    lines.push('## Missing Or Weak Coverage', '', ...missing.map((check) => `- ${check.label}`), '');
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${lines.join('\n')}\n`);
}
