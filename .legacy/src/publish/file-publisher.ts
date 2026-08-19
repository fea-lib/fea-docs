import { execSync } from 'node:child_process';
import fs from 'node:fs';

export interface FilePublisherOptions {
  targetDir: string;
  contentDir: string;
}

export function publishToFile(options: FilePublisherOptions): void {
  const { targetDir, contentDir } = options;

  fs.mkdirSync(targetDir, { recursive: true });

  execSync(`rsync -a --delete "${contentDir}/" "${targetDir}/"`, { stdio: 'inherit' });
  console.log(`  → ${targetDir}`);
}
