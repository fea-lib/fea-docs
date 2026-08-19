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
npx fea-docs@latest start --config fea-docs.config.mjs
```
