---
title: "PRD: fea-docs"
---

## Problem Statement

Teams want to spin up a documentation app from existing Markdown and MDX content inside any repository in minutes, without manually creating and maintaining a separate docs application, dependency stack, and framework-specific configuration.

Today, this requires too much setup work: choosing and installing a docs framework, wiring configuration, deciding content roots, handling link and asset resolution, and solving deployment concerns such as GitHub Pages. This overhead is especially painful when docs are distributed across a repository, including monorepos, and when users want to run from different working directories.

The result is that documentation publishing is delayed, fragmented, and inconsistent, even when source docs already exist.

## Solution

Build `fea-docs`, a CLI that starts a Starlight-based docs app from the current directory with near-zero setup.

The user runs a simple command (`npx fea-docs start`) and gets a local docs site that discovers all Markdown/MDX content under the current directory, renders it with hierarchical navigation, supports internal/external links and assets, and updates live during edits.

The tool abstracts Starlight setup by generating and managing runtime scaffolding internally, while exposing only minimal, framework-agnostic configuration for UX controls (scope, ignores, port, frameworks, strictness, and slug overrides).

The CLI also supports static build output (`build`) and one-command GitHub Pages bootstrap (`setup --gh-pages`) that generates workflow files and guided instructions.

## User Stories

1. As a docs author, I want to run `fea-docs start` from the current directory, so that I can preview documentation immediately.
2. As a docs author, I want the CLI to print the local URL clearly, so that I can open the docs app quickly.
3. As a docs author, I want hot reload while editing docs, so that I can iterate without restarting the process.
4. As a docs author, I want all `.md` files under my current directory to be discovered automatically, so that existing docs are visible without configuration.
5. As a docs author, I want all `.mdx` files under my current directory to be discovered automatically, so that interactive docs are included by default.
6. As a docs author, I want gitignored paths to be excluded from discovery, so that private/generated content is not surfaced.
7. As a docs author, I want common technical directories to be ignored by default, so that indexing avoids irrelevant files.
8. As a docs author, I want to add extra ignore globs in config, so that I can tune discovery behavior.
9. As a docs author, I want nested directory hierarchy reflected in navigation, so that readers can browse docs by structure.
10. As a docs author, I want folder `README` pages treated as section index pages, so that sections land on meaningful overviews.
11. As a docs author, I want link labels to prefer frontmatter titles, so that navigation uses human-friendly names.
12. As a docs author, I want the first H1 used when title metadata is missing, so that labeling still looks clean.
13. As a docs author, I want filename fallback when both title and H1 are missing, so that every page remains reachable.
14. As a docs author, I want external links to work without rewriting, so that references behave as expected.
15. As a docs author, I want internal links across docs to resolve correctly, so that cross-page navigation is reliable.
16. As a docs author, I want links to static files (PDFs/binaries) to work, so that downloadable artifacts remain usable.
17. As a docs author, I want local images to render correctly, so that visual documentation works out of the box.
18. As a docs author, I want remote images to render correctly, so that externally hosted assets can be used.
19. As a docs author, I want permissive link validation in dev, so that I can keep writing while seeing warnings.
20. As a CI owner, I want a strict mode that fails on broken links and unresolved assets, so that docs quality is enforceable.
21. As a docs author, I want strict mode to fail on duplicate URL paths, so that routing remains deterministic.
22. As a docs author, I want strict mode to fail on frontmatter schema errors, so that metadata quality stays consistent.
23. As a docs author, I want strict mode to fail on MDX import resolution issues, so that broken interactive pages are caught early.
24. As a docs author, I want strict mode to fail when page title fallback cannot be determined, so that navigation labels are always valid.
25. As a docs author, I want to run `fea-docs build`, so that I can generate static output for deployment.
26. As a deployer, I want build-time assets copied into output, so that deployed links to static files remain valid.
27. As a local user, I want asset symlinks in dev, so that preview is fast and filesystem-efficient.
28. As a docs author, I want explicit port control (`--port`), so that fea-docs can run alongside other local servers.
29. As a docs author, I want deterministic port precedence (flag over env over config), so that runtime behavior is predictable.
30. As a docs author, I want optional browser auto-open (`--open`), so that startup remains script-friendly by default.
31. As a monorepo user, I want one run from my repo root to include all docs in the repo tree, so that package docs are visible together.
32. As a package maintainer, I want one run from a package/docs subdirectory to scope only to that subtree, so that focused previews are easy.
33. As a docs author, I want MDX support auto-enabled only when needed, so that markdown-only repos avoid extra overhead.
34. As a docs author, I want to import custom components from relative paths, so that local reusable docs UI can be embedded.
35. As a docs author, I want to import components from configured alias roots, so that cross-folder imports remain clean.
36. As a docs author, I want to import npm components in MDX, so that ecosystem components are usable.
37. As a docs author, I want to enable React/Vue/Svelte/Solid integrations via flag or config, so that multi-framework content works without full manual setup.
38. As a team, I want no required persistent docs app dependency management in my repo, so that fea-docs stays plug-and-play.
39. As a user, I want runtime setup details abstracted away, so that Starlight complexity is hidden behind the CLI.
40. As a team, I want persistent caching between runs, so that repeated starts/builds are fast.
41. As a security-conscious user, I want no telemetry in v1, so that usage is fully local and private.
42. As a remote-access user, I want `--tailscale-serve`, so that I can share my local docs safely when needed.
43. As a macOS user, I want `--caffeinate`, so that long-running docs sessions are not interrupted by sleep.
44. As a cross-platform user, I want clear warnings if `caffeinate` is unavailable, so that behavior is understandable.
45. As a security-conscious user, I want explicit `--expose` consent for remote serving flows, so that docs are not accidentally published.
46. As a repo owner, I want `setup --gh-pages` to generate GitHub Actions workflow files, so that deployment bootstrapping is nearly automatic.
47. As a repo owner, I want `setup --gh-pages` to print step-by-step repository configuration instructions, so that non-experts can complete setup confidently.
48. As a repo owner, I want optional generated deployment documentation, so that setup can be reviewed later by teammates.
49. As a maintainer, I want the generated docs app to handle hundreds of pages in v1, so that medium repositories are supported.
50. As a maintainer, I want behavior to remain stable with mixed markdown dialect realities, so that users can adopt incrementally.

## Implementation Decisions

- Use Starlight as the rendering foundation and Astro runtime.
- Support three primary commands: `start`, `build`, and `setup --gh-pages`.
- Keep deployment orchestration out of core scope; only provide GH Pages bootstrap automation and guidance.
- Default discovery scope is the current working directory subtree only.
- Discovery includes all Markdown and MDX files recursively.
- Discovery excludes paths from `.gitignore`, default technical ignore list, and user-defined ignore globs.
- Navigation generation ignores dot-prefixed files/directories by default because Astro's content `glob()` loader does not reliably surface dot-path entries as valid Starlight sidebar slugs.
- Navigation model mirrors source directory hierarchy.
- Section index behavior maps directory `README` files to directory landing pages.
- Navigation labels resolve by priority: frontmatter `title`, first H1, then filename.
- Routing uses source-derived URL paths (`entryId` = relative path without extension, lowercased) that match Starlight's Content Layer routing exactly. No slug override mechanism.
- Internal links and static-file references are rewritten/resolved for generated docs structure.
- Dev mode favors productivity: warnings over hard failures for unresolved content issues.
- Strict mode is CI-oriented and fails on broken links, duplicate URL paths, metadata, asset, and MDX import integrity errors.
- MDX processing and framework adapters are activated only when required by discovered content and selected flags/config.
- Custom component imports are supported from relative paths, alias roots, and npm dependencies.
- Framework integrations (React, Vue, Svelte, Solid) are opt-in via CLI/config.
- Runtime architecture uses ephemeral generated app artifacts with persistent cache/work data.
- Port resolution priority is fixed: CLI flag, environment, config, automatic fallback.
- Dev asset strategy uses symlinks for speed; build asset strategy copies for deploy portability.
- No telemetry in v1.
- Tailscale and caffeinate are first-class convenience integrations with explicit exposure controls and platform-aware behavior.
- Config is optional and experience-focused, with explicit `--config` path; no implicit repo-root config search.
- v1 scale target is optimized for repositories up to approximately 500 documentation pages.

### Deep Modules

- **Content Graph Engine:** discovers files, applies ignore rules, builds normalized docs graph, and emits stable identities for pages and assets.
- **Navigation Builder:** converts docs graph into hierarchical navigation with label fallback and section index semantics.
- **Link and Asset Resolver:** validates and rewrites internal references (docs, images, binaries) across dev and build contexts.
- **Runtime Adapter:** materializes/updates ephemeral Starlight runtime input, manages dev server lifecycle, and coordinates framework adapter activation.
- **Build Exporter:** produces deployable static output with deterministic asset copying and slug mapping.
- **Strict Validator:** enforces CI-grade quality rules with actionable diagnostics.
- **GitHub Pages Bootstrapper:** generates workflow artifacts and setup instructions for repository configuration.
- **Session Cache Manager:** persists scan/transformation cache keyed by scope/config fingerprint.

These modules are intentionally deep and interface-driven so implementation details (Starlight internals, watcher strategy, path rewriting specifics) can evolve without changing user-facing contracts.

## Testing Decisions

- Good tests validate externally observable behavior through module interfaces, not internal implementation details.
- Tests prioritize deterministic fixtures over network-dependent execution.
- Tests should verify outputs and diagnostics users care about: discovered pages, nav structure, resolved links, generated build artifacts, and command outcomes.

- Modules to test:
  - Content Graph Engine
  - Navigation Builder
  - Link and Asset Resolver
  - Strict Validator
  - Runtime Adapter (command-facing behavior)
  - Build Exporter
  - GitHub Pages Bootstrapper
  - Session Cache Manager

- Required coverage themes:
  - CWD scoping behavior across nested directories
  - Ignore precedence (`.gitignore`, defaults, user ignore)
  - README-as-index semantics in nested hierarchies
  - Label fallback chain (title -> H1 -> filename)
  - Internal link and static asset resolution in dev and build
  - MDX discovery and conditional adapter activation
  - Strict failure matrix (links, assets, duplicate slugs, metadata, imports)
  - Port precedence contract
  - GH Pages setup generation and instruction completeness
  - Cache hit/miss correctness across config/scope changes

- Prior art for tests should follow existing repository patterns for CLI command tests, content-graph fixtures, and markdown/MDX rendering validation utilities where available.

## Out of Scope

- Full multi-provider deployment automation beyond GitHub Pages bootstrap.
- Telemetry, analytics, or remote usage reporting.
- A persistent user-managed Starlight app inside each target repository.
- Full plugin marketplace or extension API in v1.
- Advanced content governance workflows (review workflows, permissions, editorial workflow tooling).
- First-class versioning and i18n orchestration beyond what users can compose manually in content.
- Optimization for very large repositories well beyond v1 scale target.

## Further Notes

- The design intentionally keeps setup friction minimal while preserving escape hatches through explicit config and flags.
- Starlight is selected for static-first docs UX and multi-framework embedding capabilities under Astro.
- The GH Pages bootstrap flow is treated as a UX-critical feature even though generic deployment orchestration is out of scope.
- Consistency and predictability of path, nav, and validation rules are prioritized over framework-specific compatibility shims.
