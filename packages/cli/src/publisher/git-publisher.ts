/**
 * GitPublisher — writes a local directory to a configured git repo/branch/path destination.
 *
 * For same-repo destinations (`repo === '.'`), the publisher clones locally and pushes
 * back, so no remote is required. For external repos, it clones the remote and pushes.
 *
 * Each `publishDir()` call is atomic at the commit level: it creates exactly one commit
 * containing the full replacement of `dest.path` with the source directory contents.
 * If there is nothing to commit (identical tree), the operation is reported as skipped.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

export interface PublishDestination {
  /** Path to the git repository. Use `'.'` for the current repo. */
  repo: string;
  /** Branch to push the content to (created as an orphan if it does not exist). */
  branch: string;
  /** Relative path inside the branch to place the source directory contents. */
  path: string;
}

export interface PublishDirResult {
  destination: PublishDestination;
  /** Git commit SHA after a successful commit. Absent when skipped. */
  sha?: string;
  /** True when the destination was up-to-date and no commit was needed. */
  skipped: boolean;
  reason?: string;
}

export interface PublishDirOptions {
  /** Human-readable commit message. */
  message?: string;
  /** When true, no git mutations are performed. */
  dryRun?: boolean;
}

/**
 * Resolves the absolute path to the git root that contains `cwd`.
 * Throws if `cwd` is not inside a git repository.
 */
export function resolveGitRoot(cwd: string): string {
  try {
    return git(['rev-parse', '--show-toplevel'], { cwd }).trim();
  } catch {
    throw new Error(`Could not find a git repository containing "${cwd}".`);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function git(args: string[], opts: { cwd: string }): string {
  return execFileSync('git', args, { cwd: opts.cwd, encoding: 'utf8' });
}

function gitNoThrow(args: string[], opts: { cwd: string }): string | null {
  try {
    return git(args, opts);
  } catch {
    return null;
  }
}

/**
 * Replace the contents of `destDir` with the contents of `srcDir`.
 *
 * Non-`.git` entries in `destDir` are removed first, then `srcDir` contents
 * are copied in. The `.git` directory is never touched so that the clone
 * remains a valid git repository even when `destDir` is the worktree root.
 */
function replaceDir(srcDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  // Remove existing non-git entries
  for (const entry of fs.readdirSync(destDir)) {
    if (entry === '.git') continue;
    fs.rmSync(path.join(destDir, entry), { recursive: true, force: true });
  }
  copyRecursive(srcDir, destDir);
}

function copyRecursive(src: string, dest: string): void {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// GitPublisher
// ---------------------------------------------------------------------------

export class GitPublisher {
  /**
   * @param gitRoot Absolute path to the current repository root.
   *                Used to resolve `repo: '.'` destinations.
   */
  constructor(private readonly gitRoot: string) {}

  /**
   * Publish the contents of `sourceDir` to `dest.path` on `dest.branch` in `dest.repo`.
   *
   * For `repo === '.'`, the repository at `this.gitRoot` is used as the remote.
   * For any other value, it is passed directly to `git clone` (local path or URL).
   */
  async publishDir(
    sourceDir: string,
    dest: PublishDestination,
    options: PublishDirOptions = {},
  ): Promise<PublishDirResult> {
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Source directory does not exist: ${sourceDir}`);
    }

    const { message = `chore: publish ${dest.branch}/${dest.path}`, dryRun = false } = options;

    if (dryRun) {
      return { destination: dest, skipped: true, reason: 'dry-run' };
    }

    const remoteUrl = dest.repo === '.' ? this.gitRoot : dest.repo;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-publish-'));

    try {
      // Clone the target repo into a temp directory
      git(['clone', '--local', '--no-hardlinks', remoteUrl, tmpDir], { cwd: this.gitRoot });

      const branchExists =
        gitNoThrow(['rev-parse', '--verify', `origin/${dest.branch}`], { cwd: tmpDir }) !== null;

      if (branchExists) {
        git(['checkout', dest.branch], { cwd: tmpDir });
        git(['reset', '--hard', `origin/${dest.branch}`], { cwd: tmpDir });
      } else {
        // Create an orphan branch with no history
        git(['checkout', '--orphan', dest.branch], { cwd: tmpDir });
        // Remove everything so we start clean
        gitNoThrow(['rm', '-rf', '--quiet', '.'], { cwd: tmpDir });
      }

      // Prepare the destination path inside the clone
      const destPath = path.resolve(tmpDir, dest.path);
      replaceDir(sourceDir, destPath);

      // Stage all changes
      git(['add', '-A'], { cwd: tmpDir });

      // Check if there is anything to commit
      const status = git(['status', '--porcelain'], { cwd: tmpDir }).trim();
      if (!status) {
        return { destination: dest, skipped: true, reason: 'nothing-to-commit' };
      }

      // Commit
      git(['commit', '--message', message, '--allow-empty-message'], { cwd: tmpDir });
      const sha = git(['rev-parse', 'HEAD'], { cwd: tmpDir }).trim();

      // Push back to origin (the cloned remote)
      if (branchExists) {
        git(['push', 'origin', dest.branch], { cwd: tmpDir });
      } else {
        git(['push', '--set-upstream', 'origin', dest.branch], { cwd: tmpDir });
      }

      return { destination: dest, sha, skipped: false };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
