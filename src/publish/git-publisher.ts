import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface GitPublisherOptions {
  repo: string;
  branch: string;
  targetDir: string;
  sourcesTargetDir?: string;
  buildDir: string;
  sourceFilesDir?: string;
  name: string;
  docCount: number;
  clean?: boolean;
}

function getCloneDir(repo: string): string {
  const safeName = repo.replace(/[^a-zA-Z0-9_-]/g, '-');
  return path.join(os.tmpdir(), 'fea-docs-publish', safeName);
}

export function publishToGit(options: GitPublisherOptions): void {
  const { repo, branch, targetDir, buildDir, name, docCount, clean } = options;
  const cloneDir = getCloneDir(repo);

  if (clean && fs.existsSync(cloneDir)) {
    fs.rmSync(cloneDir, { recursive: true });
  }

  if (!fs.existsSync(cloneDir)) {
    fs.mkdirSync(cloneDir, { recursive: true });
    execSync(`git clone --depth 1 --branch "${branch}" "${repo}" "${cloneDir}"`, {
      stdio: 'inherit',
    });
  } else {
    execSync(`git -C "${cloneDir}" pull origin "${branch}"`, { stdio: 'inherit' });
  }

  const targetPath = path.join(cloneDir, targetDir);
  fs.mkdirSync(targetPath, { recursive: true });
  execSync(`rsync -a --delete "${buildDir}/" "${targetPath}/"`, { stdio: 'inherit' });

  if (options.sourcesTargetDir && options.sourceFilesDir) {
    const sourceTarget = path.join(cloneDir, options.sourcesTargetDir);
    fs.mkdirSync(sourceTarget, { recursive: true });
    execSync(`rsync -a --delete "${options.sourceFilesDir}/" "${sourceTarget}/"`, {
      stdio: 'inherit',
    });
  }

  execSync(`git -C "${cloneDir}" add .`, { stdio: 'inherit' });
  try {
    execSync(`git -C "${cloneDir}" commit -m "publish(${name}): publish ${docCount} docs"`, {
      stdio: 'inherit',
    });
  } catch {
    console.log('  No changes to commit.');
  }
  execSync(`git -C "${cloneDir}" push origin "${branch}"`, { stdio: 'inherit' });
}
