import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface FilePublisherOptions {
  targetDir: string;
  sourcesTargetDir?: string;
  buildDir: string;
  sourceFilesDir?: string;
}

export function publishToFile(options: FilePublisherOptions): void {
  const { targetDir, sourcesTargetDir, buildDir, sourceFilesDir } = options;

  fs.mkdirSync(targetDir, { recursive: true });

  execSync(`rsync -a --delete "${buildDir}/" "${targetDir}/"`, { stdio: 'inherit' });
  console.log(`  Build output → ${targetDir}`);

  if (sourcesTargetDir && sourceFilesDir) {
    const sourceTarget = path.join(targetDir, sourcesTargetDir);
    fs.mkdirSync(sourceTarget, { recursive: true });
    execSync(`rsync -a --delete "${sourceFilesDir}/" "${sourceTarget}/"`, { stdio: 'inherit' });
    console.log(`  Sources → ${sourceTarget}`);
  }
}
