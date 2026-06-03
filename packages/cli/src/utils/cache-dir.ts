import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export function resolveUserCacheBaseDir(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches');
  }

  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA ?? process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  }

  return process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');
}

export function feaDocsCacheRoot(cacheBaseDir?: string): string {
  return path.join(cacheBaseDir ?? resolveUserCacheBaseDir(), 'fea-docs');
}

export function workspaceHash(root: string): string {
  const normalized = path.resolve(root);
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export function feaDocsWorkspaceCacheDir(root: string, cacheBaseDir?: string): string {
  return path.join(feaDocsCacheRoot(cacheBaseDir), 'workspaces', workspaceHash(root));
}
