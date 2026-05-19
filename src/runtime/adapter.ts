import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import type { DocsGraph, NavItem, NavTree, ResolvedConfig } from '../types.js';

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
    await this.writeRemarkPlugin();
    await this.writeStripLeadH1Plugin();
    await this.writeAstroConfig();
    await this.writeContentLinks();
    await this.writeContentConfig();
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
        astro: '^6.3.5',
        '@astrojs/starlight': '^0.39.2',
        'unist-util-visit': '^5.1.0',
        'mdast-util-to-string': '^4.0.0',
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
        deps['@astrojs/react'] = '^5.0.5';
        deps['react'] = '^19.0.0';
        deps['react-dom'] = '^19.0.0';
      } else if (fw === 'vue') {
        deps['@astrojs/vue'] = '^6.0.1';
        deps['vue'] = '^3.5.0';
      } else if (fw === 'svelte') {
        deps['@astrojs/svelte'] = '^8.1.1';
        deps['svelte'] = '^5.0.0';
      } else if (fw === 'solid') {
        deps['@astrojs/solid-js'] = '^6.0.1';
        deps['solid-js'] = '^1.9.0';
      }
    }
    return deps;
  }

  private entryIdToLink(entryId: string): string {
    return `/${entryId}/`;
  }

  /**
   * Convert our NavTree into Starlight's sidebar format.
   * Leaf: { label, link }  — `link` is the Starlight entry-id URL
   * Group: { label, items } — recursively converted children
   */
  private navItemToStarlight(item: NavItem): unknown {
    if (item.children && item.children.length > 0) {
      return {
        label: item.label,
        ...(item.entryId !== undefined ? { link: this.entryIdToLink(item.entryId) } : {}),
        items: item.children.map((c) => this.navItemToStarlight(c)),
      };
    }
    return {
      label: item.label,
      link: item.entryId !== undefined ? this.entryIdToLink(item.entryId) : '/',
    };
  }

  private navTreeToStarlightConfig(navTree: NavTree): string {
    const sidebar = navTree.map((item) => this.navItemToStarlight(item));
    return JSON.stringify(sidebar, null, 2);
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
import remarkRewriteMdLinks from './remark-rewrite-md-links.mjs';
import remarkStripLeadH1 from './remark-strip-lead-h1.mjs';
${frameworkImports}

export default defineConfig({
  integrations: [
    starlight({
      title: 'Docs',
      sidebar: ${navJson},
    }),
    ${frameworkIntegrations}
  ],
  markdown: {
    remarkPlugins: [remarkRewriteMdLinks, remarkStripLeadH1],
  },
  vite: {
    resolve: {
      preserveSymlinks: true,
      ${aliasEntries ? `alias: {\n        ${aliasEntries}\n      },` : ''}
    },
    server: {
      fs: {
        allow: [${JSON.stringify(this.projectDir)}, ${JSON.stringify(path.join(this.workdir, 'content-stage'))}],
      },
    },
  },
  server: {
    port: ${config.port},
  },
});
`.trimStart();

    fs.writeFileSync(path.join(this.projectDir, 'astro.config.mjs'), astroConfig);
  }

  /**
   * Write a remark plugin that rewrites .md/.mdx links to their slug URLs
   * at render time. This runs inside Astro so it operates on the actual
   * source files via the symlink — no file copying needed.
   */
  private async writeRemarkPlugin(): Promise<void> {
    // Map relativePath → entryId URL (what Starlight actually serves).
    const slugMap = Object.fromEntries(
      this.options.graph.pages.map((p) => [p.relativePath.replace(/\\/g, '/'), p.entryId]),
    );
    // Astro 6 Content Layer resolves file paths through the symlink chain and
    // passes the full app-internal path to remark: e.g.
    //   <projectDir>/src/content/docs/docs/2-plan.md
    // We need to strip the app content dir prefix to get the slug-map key.
    // We also keep stageDir and sourceRoot as fallbacks for other Astro versions.
    const appContentDir = path
      .join(this.projectDir, 'src', 'content', 'docs')
      .replace(/\\/g, '/');
    const stageDir = path.join(this.workdir, 'content-stage').replace(/\\/g, '/');
    const sourceRoot = this.options.config.root.replace(/\\/g, '/');

    const plugin = `
import path from 'node:path';
import { visit } from 'unist-util-visit';

const slugMap = ${JSON.stringify(slugMap, null, 2)};
const appContentDir = ${JSON.stringify(appContentDir)};
const stageDir = ${JSON.stringify(stageDir)};
const sourceRoot = ${JSON.stringify(sourceRoot)};

function stripPrefix(absPath, prefix) {
  const p = absPath.replace(/\\\\/g, '/');
  if (p.startsWith(prefix + '/')) return p.slice(prefix.length + 1);
  return null;
}

export default function remarkRewriteMdLinks() {
  return (tree, file) => {
    const filePath = file.history?.[0] ?? '';
    const absPath = filePath.replace(/\\\\/g, '/');
    // Astro 6 passes the full app-internal path; try each prefix in order.
    const relPath =
      stripPrefix(absPath, appContentDir) ??
      stripPrefix(absPath, stageDir) ??
      stripPrefix(absPath, sourceRoot) ??
      path.posix.relative(sourceRoot, absPath);
    const sourceDir = path.posix.dirname(relPath);

    visit(tree, 'link', (node) => {
      const href = node.url;
      if (!href || /^https?:\\/\\/|^mailto:|^#/.test(href)) return;
      if (!/\\.mdx?$/i.test(href)) return;

      const [hrefPath, fragment] = href.split('#');
      const resolved = path.posix.normalize(
        sourceDir === '.' ? hrefPath : sourceDir + '/' + hrefPath,
      );
      const entryId = slugMap[resolved];
      if (entryId === undefined) return;
      node.url = '/' + entryId + '/' + (fragment ? '#' + fragment : '');
    });
  };
}
`.trimStart();

    fs.writeFileSync(path.join(this.projectDir, 'remark-rewrite-md-links.mjs'), plugin);
  }

  /**
   * Write a remark plugin that removes a leading h1 when its text duplicates
   * the frontmatter title. Starlight already renders the frontmatter title as
   * a large h1 above the content, so the in-body h1 would be a visible dupe.
   *
   * Only the FIRST h1 is considered, and only when its plain-text content
   * (case-insensitively trimmed) matches the frontmatter title.
   */
  private async writeStripLeadH1Plugin(): Promise<void> {
    const plugin = `
import { toString } from 'mdast-util-to-string';

export default function remarkStripLeadH1() {
  return (tree, file) => {
    const title = file.data?.astro?.frontmatter?.title;
    if (!title) return;
    const normalised = String(title).trim().toLowerCase();

    const firstH1Idx = tree.children.findIndex(
      (node) => node.type === 'heading' && node.depth === 1,
    );
    if (firstH1Idx === -1) return;

    const h1 = tree.children[firstH1Idx];
    const text = toString(h1).trim().toLowerCase();
    if (text === normalised) {
      tree.children.splice(firstH1Idx, 1);
    }
  };
}
`.trimStart();

    fs.writeFileSync(path.join(this.projectDir, 'remark-strip-lead-h1.mjs'), plugin);
  }

  /**
   * Build a staging directory of per-file symlinks, then point
   * src/content/docs at it.
   *
   * We cannot symlink src/content/docs directly to the repo root because the
   * repo root contains .fea-docs/ which would create an infinite cycle.
   * Instead we create .fea-docs/content-stage/ and populate it with one
   * symlink per discovered page, preserving directory structure. Astro then
   * sees a clean tree with no cycles.
   *
   * preserveSymlinks: true in Vite ensures Astro resolves each file's path
   * relative to the symlink location (inside content-stage/) rather than the
   * real path (repo root), so collection membership is correctly determined.
   */
  async writeContentLinks(): Promise<void> {
    const stageDir = path.join(this.workdir, 'content-stage');
    const contentParent = path.join(this.projectDir, 'src', 'content');
    const contentDir = path.join(contentParent, 'docs');

    // Rebuild staging dir from scratch
    fs.rmSync(stageDir, { recursive: true, force: true });
    fs.mkdirSync(stageDir, { recursive: true });

    for (const page of this.options.graph.pages) {
      const destPath = path.join(stageDir, page.relativePath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.symlinkSync(page.absolutePath, destPath, 'file');
    }

    // Point src/content/docs at the staging dir
    fs.rmSync(contentDir, { recursive: true, force: true });
    fs.mkdirSync(contentParent, { recursive: true });
    fs.symlinkSync(stageDir, contentDir, 'dir');

    // Always write a redirect from / to the first content page.
    // A top-level README gets slug '' but Starlight serves it at /readme/,
    // not /, so we can never rely on Starlight to handle the root URL itself.
    this.writeIndexRedirect();
  }

  private writeIndexRedirect(): void {
    // Prefer a top-level section index (README) as the landing page; fall back
    // to the first page in the graph.
    const landingPage =
      this.options.graph.pages.find((p) => p.isSectionIndex && !p.relativePath.includes('/')) ??
      this.options.graph.pages[0];
    if (!landingPage) return;
    const target = `/${landingPage.entryId}/`;
    const pagesDir = path.join(this.projectDir, 'src', 'pages');
    fs.mkdirSync(pagesDir, { recursive: true });
    fs.writeFileSync(
      path.join(pagesDir, 'index.astro'),
      `---\nconst response = Astro.redirect(${JSON.stringify(target)});\nreturn response;\n---\n`,
    );
  }

  /**
   * Write src/content.config.ts — Astro 6 Content Layer API.
   * Uses glob() loader pointing at src/content/docs (the symlink to content-stage).
   * docsSchema() ensures Starlight's head/sidebar fields are initialised.
   * All source files are guaranteed to have a title by the time this runs
   * because parseDocFile injects one if missing during the scan phase.
   */
  private async writeContentConfig(): Promise<void> {
    const config = `\
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: glob({
      base: 'src/content/docs',
      pattern: ['**/[^_]*.{md,mdx}', '!**/node_modules/**'],
    }),
    schema: docsSchema(),
  }),
};
`;
    fs.writeFileSync(path.join(this.projectDir, 'src', 'content.config.ts'), config);
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
