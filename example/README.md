---
title: Example Docs
---

# Example Docs

This directory contains documentation for the multi-framework component integration example.

It demonstrates `fea-docs` rendering `.mdx` files that import components from three different
component libraries co-located alongside this docs directory:

| Library | Path | Framework |
|---|---|---|
| React TS | `react-lib/` | React + TypeScript |
| Svelte JS | `svelte-lib/` | Svelte (JS) |
| Astro TS | `astro-lib/` | Astro + TypeScript |

## Start

```sh
npx @fea-docs/cli@latest start --config fea-docs.config.mjs
```

## Architecture

`fea-docs` treats Obsidian as an **optional authoring editor**. The three layers are independent:

| Layer | Package | Role |
|---|---|---|
| Authoring | _(any editor)_ | Write `.md` / `.mdx` in the source vault |
| Normalization | `@fea-docs/normalizer` | Filter by target, strip private/draft notes, emit a clean docs tree |
| Rendering | `@fea-docs/cli` | Serve or build the normalized tree with Starlight |

Obsidian-specific syntax (wikilinks, callouts, embeds) stays in the source vault. The normalizer
prepares content for the renderer — no Obsidian dependency is required at build or serve time.

## Obsidian POC Workflow

Run these commands from the repository root when working with the local workspace build:

```sh
pnpm run build

node packages/cli/dist/cli.js audit --config example/fea-docs.config.mjs
node packages/cli/dist/cli.js normalize --config example/fea-docs.config.mjs --target engineering
node packages/cli/dist/cli.js normalize --config example/fea-docs.config.mjs --target recipes
```

The audit writes `example/poc-vault-audit.md`. Normalized target output is written to `example/.fea-docs/normalized/<target>`.
