---
title: fea-docs README
---

# fea-docs

Zero-config documentation previewer and builder for any repository.

Run `npx fea-docs start` from any directory and get a live Starlight-powered docs site from your existing Markdown and MDX files — no framework setup, no configuration required.

## Features

- **Instant preview** — discovers all `.md` and `.mdx` files under the current directory
- **Hierarchical navigation** — sidebar mirrors your directory structure; `README` files become section indexes
- **Smart labeling** — page titles resolve via frontmatter `title` → first H1 → filename
- **Gitignore-aware** — respects `.gitignore` and common technical directories (node_modules, dist, etc.)
- **MDX support** — local, relative, and npm component imports work out of the box
- **Framework adapters** — opt-in React, Vue, Svelte, and Solid integrations
- **Strict CI mode** — fails on broken links, duplicate slugs, missing labels, and frontmatter errors
- **Static build** — `fea-docs build` emits deployable output with copied assets
- **GitHub Pages bootstrap** — `fea-docs setup gh-pages` generates a workflow file and setup instructions
- **Session cache** — repeated runs reuse the Starlight runtime; only reinstalls on config change
- **No telemetry** — fully local and private

## Usage

```sh
# Start a live preview from the current directory
npx fea-docs start

# Start on a specific port and open the browser
npx fea-docs start --port 3000 --open

# Build static output for deployment
npx fea-docs build --out-dir ./dist

# Bootstrap GitHub Pages deployment
npx fea-docs setup gh-pages

# Enable strict validation (default in build mode)
npx fea-docs start --strict

# Enable a framework adapter
npx fea-docs start --framework react

# Share via Tailscale (requires explicit --expose consent)
npx fea-docs start --tailscale-serve --expose

# Prevent macOS sleep during a long session
npx fea-docs start --caffeinate
```

### Port precedence

`--port` flag > `FEA_DOCS_PORT` environment variable > config file `port` > default `4321`

### Config file

Pass an explicit config file with `--config <path>`. No implicit config search is performed.

```js
// fea-docs.config.mjs
export default {
  ignore: ['**/drafts/**'],
  port: 3000,
  frameworks: ['react'],
  aliases: {
    '@components': './src/components',
  },
};
```

## How it works

On first run, `fea-docs` materializes an ephemeral Starlight project under `.fea-docs/app/` inside your working directory, installs its dependencies there, and starts the Astro dev server. Your content is symlinked into the generated project so edits are reflected live.

The `.fea-docs/` directory should be gitignored. A session cache fingerprints your config so subsequent runs skip the install step.

## Requirements

- Node.js 18 or later
- npm (used to install the ephemeral Starlight runtime on first run)

## Contributing

```sh
git clone https://github.com/your-org/fea-docs
cd fea-docs
npm install

# Type-check
npm run typecheck

# Run tests
npm test

# Watch mode
npm run test:watch

# Compile
npm run build
```

### Running locally

After building, link the package globally so you can invoke `fea-docs` directly:

```sh
npm run build
npm link

# Run against any directory on your machine
cd /path/to/your/project
fea-docs start
```

Alternatively, run without linking using `node`:

```sh
npm run build
node dist/cli.js start
```

To test changes without rebuilding every time, use watch mode alongside `node`:

```sh
# Terminal 1 — recompile on save
npm run dev

# Terminal 2 — run the CLI
node dist/cli.js start
```

When you are done, remove the global link:

```sh
npm unlink -g fea-docs
```

### Project structure

```
src/
  cli.ts                     Entry point (bin)
  types.ts                   Shared TypeScript types
  config/resolver.ts         Config merge (CLI > env > file > defaults)
  content-graph/             File discovery and page parsing
  navigation/                NavTree builder
  link-asset/                Link and asset resolver
  strict/                    CI validation rules
  runtime/                   Ephemeral Starlight app lifecycle
  build/                     Static asset export
  gh-pages/                  GitHub Pages workflow generator
  cache/                     Session fingerprint cache
  cli/commands/              start, build, setup subcommands
```

Tests live alongside source in `src/__tests__/` and cover all deep modules through their public interfaces.

## License

MIT
