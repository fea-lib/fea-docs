import fs from 'node:fs';
import path from 'node:path';

const GITIGNORE_ENTRY = '.fea-docs';
const GITIGNORE_COMMENT = '# fea-docs workdir';

/**
 * Ensure `.fea-docs` is listed in the repo root `.gitignore`.
 * - If `.gitignore` exists and already contains the entry, does nothing.
 * - If `.gitignore` exists but lacks the entry, prepends it at the top.
 * - If `.gitignore` does not exist, creates it with only the entry.
 */
export function ensureGitignore(root: string): void {
  const gitignorePath = path.join(root, '.gitignore');
  const entry = `${GITIGNORE_COMMENT}\n${GITIGNORE_ENTRY}\n`;

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, entry);
    return;
  }

  const existing = fs.readFileSync(gitignorePath, 'utf-8');
  // Check if the entry is already present (any line that is exactly '.fea-docs')
  const lines = existing.split('\n');
  if (lines.some((l) => l.trim() === GITIGNORE_ENTRY)) {
    return;
  }

  // Prepend to the top of the existing file
  fs.writeFileSync(gitignorePath, entry + '\n' + existing);
}
