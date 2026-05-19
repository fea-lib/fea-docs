import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import type { DocsGraph, NavTree, ResolvedConfig } from '../types.js';

const WORKDIR_NAME = '.fea-docs';

export interface RuntimeAdapterOptions {
  config: ResolvedConfig;
  graph: DocsGraph;
  navTree: NavTree;
}

/**
 * RuntimeAdapter materializes an ephemeral Starlight project,
 * symlinks source content, and manages the dev server lifecycle.
 */
export class RuntimeAdapter {
  private options: RuntimeAdapterOptions;
  private workdir: string;
  private devProcess: ChildProcess | null = null;

  constructor(options: RuntimeAdapterOptions) {
    this.options = options;
    this.workdir = path.join(options.config.root, WORKDIR_NAME);
  }

  /** Return path to the ephemeral Starlight project. */
  get projectDir(): string {
    return path.join(this.workdir, 'app');
  }

  /** Ensure the ephemeral project exists and is up to date. */
  async materialize(): Promise<void> {
    fs.mkdirSync(this.projectDir, { recursive: true });
    await this.writePackageJson();
    await this.writeAstroConfig();
    await this.writeContentLinks();
    await this.installDeps();
  }

  private async writePackageJson(): Promise<void> {
    const pkg = {
      name: 'fea-docs-app',
      private: true,
      type: 'module',
      scripts: {
        dev: 'astro dev',
        build: 'astro build',
      },
      dependencies: {
        astro: '^4.0.0',
        '@astrojs/starlight': '^0.21.0',
        ...this.frameworkDeps(),
      },
    };
    fs.writeFileSync(
      path.join(this.projectDir, 'package.json'),
      JSON.stringify(pkg, null, 2),
    );
  }

  private frameworkDeps(): Record<string, string> {
    const deps: Record<string, string> = {};
    for (const fw of this.options.config.frameworks) {
      if (fw === 'react') {
        deps['@astrojs/react'] = '^3.0.0';
        deps['react'] = '^18.0.0';
        deps['react-dom'] = '^18.0.0';
      } else if (fw === 'vue') {
        deps['@astrojs/vue'] = '^4.0.0';
        deps['vue'] = '^3.0.0';
      } else if (fw === 'svelte') {
        deps['@astrojs/svelte'] = '^5.0.0';
        deps['svelte'] = '^4.0.0';
      } else if (fw === 'solid') {
        deps['@astrojs/solid-js'] = '^4.0.0';
        deps['solid-js'] = '^1.0.0';
      }
    }
    return deps;
  }

  private navTreeToStarlightConfig(navTree: NavTree): string {
    return JSON.stringify(navTree, null, 2);
  }

  private async writeAstroConfig(): Promise<void> {
    const { config, navTree } = this.options;
    const navJson = this.navTreeToStarlightConfig(navTree);

    const frameworkImports = config.frameworks
      .map((fw) => {
        const map: Record<string, string> = {
          react: `import react from '@astrojs/react';`,
          vue: `import vue from '@astrojs/vue';`,
          svelte: `import svelte from '@astrojs/svelte';`,
          solid: `import solidJs from '@astrojs/solid-js';`,
        };
        return map[fw] ?? '';
      })
      .filter(Boolean)
      .join('\n');

    const frameworkIntegrations = config.frameworks
      .map((fw) => {
        const map: Record<string, string> = {
          react: 'react()',
          vue: 'vue()',
          svelte: 'svelte()',
          solid: 'solidJs()',
        };
        return map[fw] ?? '';
      })
      .filter(Boolean)
      .join(', ');

    const aliasEntries = Object.entries(config.aliases)
      .map(([k, v]) => `'${k}': '${v}'`)
      .join(',\n    ');

    const astroConfig = `
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
${frameworkImports}

export default defineConfig({
  integrations: [
    starlight({
      title: 'Docs',
      sidebar: ${navJson},
    }),
    ${frameworkIntegrations}
  ],
  ${
    aliasEntries
      ? `vite: {
    resolve: {
      alias: {
        ${aliasEntries}
      },
    },
  },`
      : ''
  }
  server: {
    port: ${config.port},
  },
});
`.trimStart();

    fs.writeFileSync(path.join(this.projectDir, 'astro.config.mjs'), astroConfig);
  }

  /**
   * Symlink (dev) or copy (build) the source content into the Starlight content directory.
   */
  async writeContentLinks(): Promise<void> {
    const contentDir = path.join(this.projectDir, 'src', 'content', 'docs');
    fs.mkdirSync(contentDir, { recursive: true });

    // Create a symlink from the content dir to the docs root
    const linkTarget = path.join(contentDir, '_source');
    if (fs.existsSync(linkTarget)) {
      fs.rmSync(linkTarget, { recursive: true, force: true });
    }
    fs.symlinkSync(this.options.config.root, linkTarget, 'dir');
  }

  private async installDeps(): Promise<void> {
    const lockFile = path.join(this.projectDir, 'node_modules', '.package-lock.json');
    if (!fs.existsSync(lockFile)) {
      execSync('npm install --prefer-offline --loglevel=warn', {
        cwd: this.projectDir,
        stdio: 'pipe',
      });
    }
  }

  /** Start the Astro dev server. Returns the port it started on. */
  async startDev(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      this.devProcess = spawn(
        'node',
        ['node_modules/.bin/astro', 'dev', '--port', String(port)],
        {
          cwd: this.projectDir,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      const onData = (chunk: Buffer) => {
        const line = chunk.toString();
        process.stdout.write(line);
        const match = line.match(/localhost:(\d+)/);
        if (match) {
          resolve(Number(match[1]));
        }
      };

      this.devProcess.stdout?.on('data', onData);
      this.devProcess.stderr?.on('data', (chunk: Buffer) => {
        process.stderr.write(chunk);
      });

      this.devProcess.on('error', reject);
      this.devProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Astro dev server exited with code ${code}`));
        }
      });
    });
  }

  /** Stop the dev server. */
  stopDev(): void {
    this.devProcess?.kill();
    this.devProcess = null;
  }

  /** Run Astro build. */
  async runBuild(outputDir: string): Promise<void> {
    execSync(
      `node node_modules/.bin/astro build --out-dir ${JSON.stringify(outputDir)}`,
      {
        cwd: this.projectDir,
        stdio: 'inherit',
      },
    );
  }
}
