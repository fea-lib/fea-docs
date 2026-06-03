import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GithubPagesBootstrapper } from '../gh-pages/bootstrapper.js';

describe('GithubPagesBootstrapper', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-ghpages-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates the workflow file', async () => {
    const bootstrapper = new GithubPagesBootstrapper({ root: tmpDir });
    await bootstrapper.bootstrap();

    const workflowPath = path.join(tmpDir, '.github', 'workflows', 'deploy-docs.yml');
    expect(fs.existsSync(workflowPath)).toBe(true);

    const content = fs.readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('fea-docs build');
    expect(content).toContain('deploy-pages');
  });

  it('includes a normalized base flag in workflow when provided', async () => {
    const bootstrapper = new GithubPagesBootstrapper({ root: tmpDir, base: 'repo/' });
    await bootstrapper.bootstrap();

    const workflowPath = path.join(tmpDir, '.github', 'workflows', 'deploy-docs.yml');
    const content = fs.readFileSync(workflowPath, 'utf-8');

    expect(content).toContain('npx fea-docs build --out-dir ./dist --base "/repo"');
  });

  it('optionally generates deployment docs', async () => {
    const bootstrapper = new GithubPagesBootstrapper({ root: tmpDir, generateDocs: true });
    await bootstrapper.bootstrap();

    const docsPath = path.join(tmpDir, 'docs', 'gh-pages-setup.md');
    expect(fs.existsSync(docsPath)).toBe(true);
  });
});
