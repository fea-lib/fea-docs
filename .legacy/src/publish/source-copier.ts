import fs from 'node:fs';
import path from 'node:path';

const LOCAL_REF_RE = /(?:!\[.*?\]\(([^)]+)\)|\[.*?\]\(([^)]+)\)|<(?:img|a|Code)\s[^>]*?(?:src|href)=["']([^"']+)["'])/g;

function extractLocalRefs(content: string, docDir: string, root: string): string[] {
  const refs: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(LOCAL_REF_RE.source, 'g');
  while ((match = re.exec(content)) !== null) {
    const rawPath = match[1] || match[2] || match[3];
    if (!rawPath) continue;
    if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) continue;
    const resolved = path.resolve(docDir, rawPath);
    if (resolved.startsWith(root) && fs.existsSync(resolved)) {
      refs.push(resolved);
    }
  }
  return refs;
}

export interface SourceCopierOptions {
  matchedPages: { absolutePath: string; relativePath: string }[];
  root: string;
  outputDir: string;
}

export function collectSources(options: SourceCopierOptions): void {
  const { matchedPages, root, outputDir } = options;
  const copied = new Set<string>();

  for (const page of matchedPages) {
    const docDir = path.dirname(page.absolutePath);
    const content = fs.readFileSync(page.absolutePath, 'utf-8');
    const refs = extractLocalRefs(content, docDir, root);

    const docDest = path.join(outputDir, page.relativePath);
    fs.mkdirSync(path.dirname(docDest), { recursive: true });
    fs.copyFileSync(page.absolutePath, docDest);
    copied.add(page.absolutePath);

    for (const ref of refs) {
      const relRef = path.relative(root, ref);
      const dest = path.join(outputDir, relRef);
      if (!copied.has(ref)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(ref, dest);
        copied.add(ref);
      }
    }
  }

  console.log(`  Sources collected: ${copied.size} file(s)`);
}
