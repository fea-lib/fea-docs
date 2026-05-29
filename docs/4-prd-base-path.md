---
title: "Implementation Plan: Base Path Support"
---

## Requirements

- Deployments to GitHub Pages with a custom base path must work correctly.
- `fea-docs build` and `fea-docs start` must support a custom base path.
- Automatic root redirection must remain correct when a base path is configured.
- Internal links, assets, and other resource URLs must be rewritten for the configured base path.

## Goal

Add first-class custom base-path support to `fea-docs` so `start` and `build`
work correctly when docs are hosted under a subpath (for example GitHub Pages
project sites like `/my-repo/`).

## Scope

- CLI: add `--base` to `start`, `build`, and `setup gh-pages`.
- Config model: support `base` in config and resolved runtime config.
- Runtime: generate Astro config and URL rewrites that respect base.
- Redirects: root redirect must include base path.
- GH Pages bootstrap: generate workflow with base-aware build command.
- Tests: update and extend config/runtime/link/gh-pages coverage.
- Docs: add usage examples and explanation to README.

## Implementation Steps

1. Extend config types and resolver
   - Add `base: string` to `ResolvedConfig` and optional `base?: string` to `FeaDocsConfig`.
   - Add `base: '/'` to default config.
   - Normalize base values in resolver (`/`, `/repo`, `/docs/v2`).
   - Keep precedence as CLI > env (if later added) > config file > defaults.

2. Add CLI flags
   - `fea-docs start --base <path>`
   - `fea-docs build --base <path>`
   - `fea-docs setup gh-pages --base <path>`
   - Pass base into `resolveConfig`/bootstrapper options.

3. Make runtime generation base-aware
   - In generated `astro.config.mjs`, set `base`.
   - In generated remark rewrite plugin:
     - Internal docs rewrite to `base + '/' + entryId + '/'`.
     - Relative non-doc links/assets rewrite to `base + '/' + relativePath`.
   - Keep external/absolute/anchor handling unchanged.

4. Fix root redirect behavior under subpaths
   - Generate redirect target as base-prefixed route.
   - Ensure no duplicate slashes for root/non-root base.

5. Align link resolver output
   - Add base-aware URL joining in `LinkAssetResolver`.
   - Return base-prefixed URLs for internal docs and assets.
   - Keep strict diagnostics behavior unchanged.

6. Update GitHub Pages bootstrap output
   - Add base option to bootstrapper.
   - If provided, include `--base <path>` in workflow build step.
   - Update generated setup instructions to mention base path usage.

7. Add/update tests
   - `config-resolver`: default and normalized custom base resolution.
   - `runtime-adapter`: Astro `base`, rewrite plugin base prefix, redirect target.
   - `link-resolver`: base-prefixed doc/asset hrefs.
   - `gh-pages`: workflow includes base flag when configured.

8. Update README
   - Add `--base` examples for start/build/setup gh-pages.
   - Document why GH Pages project sites need base paths.

## Validation

- Run `npm test` and ensure all tests pass.
- Spot-check generated runtime files in tests for correct base handling.
- Confirm workflow template contains expected build command for base-enabled setup.
