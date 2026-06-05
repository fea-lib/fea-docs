---
title: 'fea-docs'
---

# fea-docs

Zero-config documentation previewer and builder for any repository.

Run `npx @fea-docs/cli@latest start` from any directory and get a live Starlight-powered docs site from your existing Markdown and MDX files — no framework setup, no configuration required.

The npm package has moved from `fea-docs` to `@fea-docs/cli`. The installed command remains `fea-docs`, so existing CLI commands such as `fea-docs start`, `fea-docs build`, and `fea-docs setup gh-pages` continue to work.

## Features

- **Instant preview** — discovers all `.md` and `.mdx` files under the current directory
- **Hierarchical navigation** — sidebar mirrors your directory structure; `README` files become section indexes
- **Smart labeling** — page titles resolve via frontmatter `title` → first H1 → filename; missing titles are injected automatically
- **No title duplication** — when a page has both a frontmatter title and an H1, the redundant H1 is suppressed at render time
- **Gitignore-aware** — respects `.gitignore` and common technical directories (node_modules, dist, etc.)
- **MDX support** — local, relative, and npm component imports work out of the box
- **Framework adapters** — opt-in React, Vue, Svelte, and Solid integrations
- **Strict CI mode** — fails on broken links, duplicate slugs, missing labels, and frontmatter errors
- **Static build** — `fea-docs build` emits deployable output with copied assets
- **GitHub Pages bootstrap** — `fea-docs setup gh-pages` generates a workflow file and setup instructions
- **Session cache** — repeated runs reuse the Starlight runtime; only reinstalls on config change
- **No telemetry** — fully local and private

## Usage

> Always use `npx @fea-docs/cli@latest` to ensure you get the newest version. Without `@latest`, npx may use a previously cached version.

```sh
# Start a live preview from the current directory
npx @fea-docs/cli@latest start

# Start on a specific port and open the browser
npx @fea-docs/cli@latest start --port 3000 --open

# Start with a custom base path (for subpath hosting)
npx @fea-docs/cli@latest start --base /my-repo

# Build static output for deployment
npx @fea-docs/cli@latest build --out-dir ./dist

# Build static output for GitHub Pages project site
npx @fea-docs/cli@latest build --out-dir ./dist --base /my-repo

# Bootstrap GitHub Pages deployment
npx @fea-docs/cli@latest setup gh-pages

# Bootstrap GitHub Pages deployment with base path
npx @fea-docs/cli@latest setup gh-pages --base /my-repo

# Enable strict validation (default in build mode)
npx @fea-docs/cli@latest start --strict

# Enable a framework adapter
npx @fea-docs/cli@latest start --framework react

# Share via Tailscale (requires explicit --expose consent)
npx @fea-docs/cli@latest start --tailscale-serve --expose

# Prevent macOS sleep during a long session
npx @fea-docs/cli@latest start --caffeinate

# Use both together (macOS + Tailscale sharing)
npx @fea-docs/cli@latest start --caffeinate --tailscale-serve --expose
```

### Port precedence

`--port` flag > `FEA_DOCS_PORT` environment variable > config file `port` > default `4321`

### Config file

Pass an explicit config file with `--config <path>`. No implicit config search is performed.

```js
// fea-docs.config.mjs
export default {
  base: '/my-repo',
  ignore: ['**/drafts/**'],
  port: 3000,
  frameworks: ['react'],
  aliases: {
    '@components': './src/components',
  },
};
```

### Base path deployments

When deploying docs under a subpath (for example GitHub Pages project sites at
`https://<user>.github.io/<repo>/`), set `base` to `/<repo>` either in config
or via `--base` on `start`/`build`. This ensures redirects, internal links,
and static asset URLs are generated correctly for that mount point.

## How it works

On first run, `fea-docs` materializes an ephemeral Starlight project under `.fea-docs/app/` inside your working directory, installs its dependencies there, and starts the Astro dev server. Your content is symlinked into the generated project so edits are reflected live.

During the scan phase, any file missing a frontmatter `title` has one injected automatically (derived from the first H1 or the filename). This mutation is idempotent and required by Starlight's content schema. If a file already has both a `title` in frontmatter and a matching H1, the H1 is suppressed at render time to avoid visual duplication.

The `.fea-docs/` directory should be gitignored. A session cache fingerprints your config so subsequent runs skip the install step.

## Example

The [`example/`](./example/) directory contains a minimal repository you can use to try fea-docs locally:

```sh
cd example
npx @fea-docs/cli@latest start
```

## Requirements

- Node.js 18 or later
- npm (used to install the ephemeral Starlight runtime on first run)
- pnpm for repository development

## Contributing

```sh
git clone https://github.com/your-org/fea-docs
cd fea-docs
pnpm install

# Type-check
pnpm run typecheck

# Run tests
pnpm test

# Watch mode
pnpm run test:watch

# Compile
pnpm run build
```

### Running locally

After building, link the package globally so you can invoke `fea-docs` directly:

```sh
pnpm --filter @fea-docs/cli run build
pnpm --dir packages/cli link --global

# Run against any directory on your machine
cd /path/to/your/project
fea-docs start
```

Alternatively, run without linking using `node`:

```sh
pnpm --filter @fea-docs/cli run build
node packages/cli/dist/cli.js start
```

To test changes without rebuilding every time, use watch mode alongside `node`:

```sh
# Terminal 1 — recompile on save
pnpm run dev

# Terminal 2 — run the CLI
node packages/cli/dist/cli.js start
```

When you are done, remove the global link:

```sh
pnpm remove --global @fea-docs/cli
```

### Project structure

```
package.json                 Private workspace metadata
pnpm-workspace.yaml          pnpm workspace packages
packages/
  cli/                       @fea-docs/cli package and source
    src/
      cli.ts                 Entry point (bin)
      types.ts               Shared TypeScript types
      config/resolver.ts     Config merge (CLI > env > file > defaults)
      content-graph/         File discovery and page parsing
      navigation/            NavTree builder
      link-asset/            Link and asset resolver
      strict/                CI validation rules
      runtime/               Ephemeral Starlight app lifecycle
      build/                 Static asset export
      gh-pages/              GitHub Pages workflow generator
      cache/                 Session fingerprint cache
      cli/commands/          start, build, setup subcommands
  schema/                    Shared artifact TypeScript types
  normalizer/                Source-vault normalization layer
  syntax-engine/             Reusable syntax normalization engine
  obsidian/                  Obsidian syntax handlers
```

Tests live alongside source in `packages/cli/src/__tests__/` and cover all deep modules through their public interfaces.

### Package responsibilities

`@fea-docs/cli` is the renamed public CLI and rendering layer. It owns user-facing commands and the Starlight preview/build runtime, while preserving the `fea-docs` executable name for compatibility.

`@fea-docs/normalizer` will prepare source vault content for rendering by handling discovery, metadata, target filtering, privacy validation, route resolution, generated data files, and normalized docs output.

`@fea-docs/syntax-engine` will provide reusable syntax normalization contracts and handler registration independent of the CLI.

`@fea-docs/obsidian` will provide Obsidian-specific syntax handlers for wikilinks, callouts, embeds, block references, and assets.

`@fea-docs/schema` defines shared TypeScript types for generated artifacts such as `fea-docs.manifest.json`, `fea-docs.diagnostics.json`, `fea-docs.graph.json`, `fea-docs.backlinks.json`, `fea-docs.search.json`, and `fea-docs.publish.json`.

## Versioning and publishing

This repository uses [Changesets](https://github.com/changesets/changesets) for independent per-package versioning. Each package under `packages/` is published to npm separately and carries its own semver version.

### Adding a changeset

Whenever you make a change that warrants a version bump, create a changeset alongside your code:

```sh
pnpm changeset
```

The CLI will ask which packages are affected and what kind of bump each one needs (`patch`, `minor`, or `major`). A markdown file is added to `.changeset/` — commit it with your changes.

### Releasing

Once changesets have been merged to `main`, apply them and push:

```sh
./scripts/publish.sh
```

This runs `pnpm changeset version` (bumps each affected package independently and updates internal dependency ranges), commits the result, and pushes to `main`. The CI will then publish every package whose version changed.

### CI behaviour

The `Release` GitHub Actions workflow runs on every push to `main` via `changesets/action`:

- **Pending changesets present** — opens or updates a "Version Packages" pull request with the computed version bumps and generated changelogs.
- **"Version Packages" PR merged** — publishes each changed package to npm at its new version.

The workflow requires two repository secrets: `GITHUB_TOKEN` (provided automatically) and `NPM_TOKEN` (an npm access token with publish rights to the `@fea-docs` scope).

## License

MIT
