import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCliForTest } from './test-runner.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fea-docs-cli-'));
}

interface Captured {
  code: number;
  stdout: string;
  stderr: string;
}

async function capture(argv: string[]): Promise<Captured> {
  let stdout = '';
  let stderr = '';
  const outSpy = vi
    .spyOn(process.stdout, 'write')
    // @ts-expect-error the stream accepts strings, the type returns number
    .mockImplementation((chunk) => {
      stdout += String(chunk);
      return String(chunk).length;
    });
  const errSpy = vi
    .spyOn(process.stderr, 'write')
    // @ts-expect-error the stream accepts strings, the type returns number
    .mockImplementation((chunk) => {
      stderr += String(chunk);
      return String(chunk).length;
    });
  const logSpy = vi.spyOn(console, 'log').mockImplementation((msg) => {
    stdout += `${String(msg)}\n`;
  });
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((msg) => {
    stderr += `${String(msg)}\n`;
  });

  let code: number;
  try {
    code = await runCliForTest(argv);
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
  return { code, stdout, stderr };
}

describe('fea-docs CLI', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    originalCwd = process.cwd();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.chdir(originalCwd);
  });

  async function runInDir(argv: string[]): Promise<Captured> {
    process.chdir(tmpDir);
    return capture(argv);
  }

  it('--help prints usage and exits 0', async () => {
    const captured = await capture(['--help']);

    expect(captured.code).toBe(0);
    expect(captured.stdout).toContain('Usage:');
    expect(captured.stdout).toContain('build');
  });

  it('bare invocation prints usage and exits 0', async () => {
    const captured = await capture([]);

    expect(captured.code).toBe(0);
    expect(captured.stdout).toContain('Usage:');
  });

  it('an unknown subcommand prints an error plus usage and exits non-zero', async () => {
    const captured = await capture(['frobnicate']);

    expect(captured.code).toBe(1);
    expect(captured.stderr).toContain("Unknown command 'frobnicate'");
    expect(captured.stderr).toContain('Usage:');
  });

  it('an unknown flag at the top level prints an error plus usage and exits non-zero', async () => {
    const captured = await capture(['--bogus']);

    expect(captured.code).toBe(1);
    expect(captured.stderr).toContain("unknown option '--bogus'");
    expect(captured.stderr).toContain('Usage:');
  });

  it('an unknown flag on build prints an error and exits non-zero', async () => {
    const captured = await capture(['build', '--bogus']);

    expect(captured.code).toBe(1);
    expect(captured.stderr).toContain("unknown option '--bogus'");
  });

  it('build of an empty directory exits 0 and writes the default output', async () => {
    const captured = await runInDir(['build']);

    expect(captured.code).toBe(0);
    const output = path.join(tmpDir, 'dist', 'index.html');
    expect(fs.existsSync(output)).toBe(true);
    expect(fs.readFileSync(output, 'utf-8')).toContain('No documentation pages');
  });

  it('build of a populated directory exits 0 and emits an index', async () => {
    fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'docs', 'intro.md'), '# Intro');

    const captured = await runInDir(['build']);

    expect(captured.code).toBe(0);
    const index = path.join(tmpDir, 'dist', 'index.html');
    expect(fs.existsSync(index)).toBe(true);
    expect(captured.stdout).toContain('found 1 page(s)');
  });

  it('a build that must fail surfaces as a non-zero exit', async () => {
    const captured = await runInDir(['build', '--out-dir', '.']);

    expect(captured.code).toBe(1);
  });

  it('--help advertises a default for every build option', async () => {
    const captured = await capture(['build', '--help']);

    expect(captured.code).toBe(0);
    const help = captured.stdout.replace(/\s+/g, ' ');
    expect(help).toContain('--out-dir <path>');
    expect(help).toContain('(default: "dist")');
    expect(help).toContain('--config <path>');
    expect(help).toContain('(default: "fea-docs.config.js")');
    expect(help).toContain('--strict');
    expect(help).toContain('(default: false)');
  });

  it('accepts --strict and a custom --config without error', async () => {
    fs.writeFileSync(path.join(tmpDir, 'index.md'), '# Index');

    const captured = await runInDir(['build', '--strict', '--config', 'custom.config.js']);

    expect(captured.code).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, 'dist', 'index.html'))).toBe(true);
  });

  it('an option value rejected by the schema surfaces as a non-zero exit', async () => {
    const captured = await runInDir(['build', '--out-dir', '']);

    expect(captured.code).toBe(1);
  });

  it('honors --out-dir', async () => {
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '# Readme');

    const captured = await runInDir(['build', '--out-dir', 'web']);

    expect(captured.code).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, 'web', 'index.html'))).toBe(true);
  });
});