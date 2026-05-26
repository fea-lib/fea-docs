---
title: "PRD: Improvements (v2.0)"
---

## Context

This PRD defines the `2.0.0` adjustments to `fea-docs` based on `@docs/1-prd.md`.

It is a focused delta PRD for runtime mounting and live-update behavior. The base PRD remains valid unless explicitly overridden here.

## Problem Statement

Current runtime materialization symlinks discovered docs files individually into a staged tree under `.fea-docs/app/src/content/docs` and writes explicit sidebar configuration.

This causes usability and maintenance issues:

1. Add/delete/rename of docs in the source tree may require a `fea-docs start` restart to reflect new content structure.
2. Non-doc files referenced by docs (images, JSON, binaries, local imports) are not always available with stable path behavior.
3. Runtime concerns (content mount + sidebar generation) are split between source scanning and generated config, increasing drift risk.
4. Site title in generated runtime is fixed and not consistently configurable from CLI/config.

## Goals

1. Make docs and referenced files available through a directory-level mount strategy.
2. Ensure add/delete/rename/change flows are refreshed by Astro's native watcher behavior in dev mode.
3. Delegate sidebar and label behavior to native Starlight behavior.
4. Keep implementation simple and avoid custom watch infrastructure.
5. Align static asset URL behavior with natural source-relative paths.
6. Support explicit docs site naming (`name`/`title`) from config and CLI.

## Non-Goals

- No new custom watcher process.
- No navigation label normalization pipeline.
- No redirect layer for renamed documents.
- No perf optimization milestone in this release.
- No required end-to-end test suite expansion.
- No narrowing of static serving scope beyond selected CWD in this release.

## Scope

This release applies to:

- `fea-docs start`
- `fea-docs build`
- Runtime adapter mount/config behavior
- Navigation generation behavior
- Runtime static file serving behavior
- Site title/name resolution behavior

This release does not redefine broader v1 contracts outside these areas.

## Functional Requirements

1. Runtime workdir location
   - Runtime artifacts MUST be materialized in a persistent user cache location, not under the target CWD.
   - Runtime path MUST be stable per CWD via deterministic hashing.

2. Content mount model
   - Runtime MUST mount the selected CWD via directory-level symlink strategy.
   - Runtime MUST NOT stage one symlink per discovered file.

3. Document discovery
   - Page discovery remains `.md` and `.mdx` only.
   - Existing ignore semantics should remain enabled unless they conflict with mandatory behavior in this PRD.

4. Referenced file availability
   - Files referenced from docs (links, embeds, imports, static references) within effective scope MUST be path-available in runtime.
   - Runtime rewrite behavior MUST preserve `.md`/`.mdx` route rewriting and additionally rewrite relative non-doc URLs to absolute source-root paths (e.g. `/docs/foo.json`) where applicable.
   - Rewrite coverage MUST include markdown links, inline images, and link-reference definitions.

5. Static file serving model
   - Generated Astro runtime config MUST set `publicDir` to resolved `config.root`.
   - Static files in scope MUST be available at natural absolute paths derived from source-relative location.
   - Build path MUST avoid duplicate asset-copy work when Astro public-dir copy already handles static files.

6. Asset URL consistency
   - Internal asset resolver output MUST use natural absolute paths (`/<relative-path>`) instead of `/_assets/...`.
   - Dev and build output behavior for asset URLs MUST be consistent.

7. Dev live update behavior
   - Changes to existing docs MUST refresh without restart.
   - Adding a doc MUST refresh and expose the new page in sidebar/navigation.
   - Deleting a doc MUST refresh and remove page visibility in sidebar/navigation.
   - Renaming a doc MUST refresh with the new slug/path (no legacy redirect requirement).

8. Navigation behavior
   - Sidebar/navigation structure and labels MUST be derived from Starlight native behavior.
   - Runtime MUST NOT inject custom nav entry trees into generated config for normal routing.

9. Site title/name behavior
   - CLI/config MUST support explicit docs site naming via `name` (preferred) and `title`.
   - Runtime title resolution order MUST be: `name` -> `title` -> CWD basename (title-cased) -> `Docs`.

10. Build parity
   - `build` MUST align with the same content-mount semantics used by `start`.
   - Existing build portability expectations (deployable static output) remain in force.

11. Watcher constraints
   - File update responsiveness in dev MUST rely on Astro watcher behavior only.

## Inverse Requirements

The implementation for `2.0.0` MUST NOT:

- Introduce another watcher in addition to Astro watcher behavior.
- Copy documents/assets into a dedicated staged content directory as the primary strategy.
- Symlink single files into docs content as the primary strategy.
- Manage sidebar entries as a custom generated nav tree.
- Normalize nav entry labels via custom fallback logic in this scope.
- Use a bespoke asset export path contract (`/_assets/...`) as the canonical runtime/build URL strategy.

## Compatibility and Risk Notes

- Moving runtime out of CWD resolves circular `.fea-docs` self-reference risk for directory-level mounts.
- Symlink behavior is platform-sensitive; platform caveats must be preserved or documented.
- If ignore rules conflict with mandatory file availability behavior, conflict resolution should prefer meeting mandatory runtime behavior while minimizing scope expansion.
- `publicDir = config.root` intentionally broadens serving scope to non-hidden static files under CWD (not just docs subtree). This is accepted for natural-path behavior and must be documented as an explicit tradeoff.

## Acceptance Criteria

1. Starting from a repo root with nested docs and assets, `fea-docs start` serves docs without restart for content edits.
2. Adding a new `.md`/`.mdx` file while dev server is running makes it accessible and visible via sidebar/navigation without restarting.
3. Deleting a previously visible doc removes it from navigation and route availability after refresh.
4. Renaming a doc updates route/slug visibility after refresh (old path is not required to redirect).
5. Docs referencing in-scope local assets/imports resolve with mounted-path behavior.
6. Generated runtime config does not depend on custom nav tree injection for normal sidebar generation.
7. Generated runtime config sets `publicDir` to the resolved project root.
8. Relative non-doc URLs in markdown content are rewritten to absolute natural source-root paths where applicable.
9. Asset resolver emits natural absolute paths (`/<relative-path>`) instead of `/_assets/...`.
10. `start` and `build` accept explicit `--name` and render resolved runtime title per precedence rules.
11. `fea-docs build` succeeds with the new mount semantics and preserves deployable output expectations without duplicate asset copy steps.

## Test Strategy (v2.0)

- Prefer unit/integration coverage in existing test style.
- No mandatory end-to-end suite expansion for this release.
- Add targeted tests for:
  - runtime cache-dir path resolution and stability
  - directory-level mount behavior
  - nav config generation changes (Starlight-native mode)
  - runtime astro config includes `publicDir` and expected title resolution behavior
  - remark link rewrite coverage for markdown links + images + link-reference definitions
  - asset resolver output format for natural absolute paths
  - add/delete/rename expectations at adapter/command integration level where feasible

## Concrete Implementation Plan

### Ticket 1: Runtime cache-dir foundation

- Type: AFK
- Blocked by: None
- Outcome:
  - Resolve runtime workdir to persistent user cache dir keyed by CWD hash.
  - Remove dependence on `<cwd>/.fea-docs` for runtime app materialization.
- Acceptance checks:
  - Same CWD resolves to stable runtime path.
  - Different CWD values resolve to different runtime paths.

### Ticket 2: Directory-level content mount

- Type: AFK
- Blocked by: Ticket 1
- Outcome:
  - Replace per-file staging symlink logic with directory-level mount strategy.
  - Ensure runtime can read docs and non-doc referenced files from mounted scope.
- Acceptance checks:
  - No per-discovered-file symlink staging remains in runtime mount path.
  - Referenced local assets/imports are path-available in dev runtime.

### Ticket 3: Starlight-native sidebar/navigation

- Type: AFK
- Blocked by: Ticket 2
- Outcome:
  - Remove custom nav tree injection and related missing-entry fallback pathing from runtime config flow.
  - Use Starlight native sidebar/label behavior for this mode.
- Acceptance checks:
  - Generated config no longer depends on injected custom sidebar tree.
  - Navigation and labels reflect Starlight behavior.

### Ticket 4: `start`/`build` parity and behavior alignment

- Type: AFK
- Blocked by: Ticket 2, Ticket 3
- Outcome:
  - Align `start` and `build` execution path to shared mount semantics.
  - Preserve build deployability expectations.
- Acceptance checks:
  - `start` works with add/delete/rename refresh expectations.
  - `build` succeeds and output contract remains valid.
  - Build flow does not perform redundant asset copy after Astro public-dir handling.

### Ticket 5: Title/name and asset-path consistency

- Type: AFK
- Blocked by: Ticket 4
- Outcome:
  - Add CLI/config support for docs site naming (`name`, `title`) and runtime title precedence.
  - Standardize asset URLs to natural absolute paths and update runtime rewrite behavior for non-doc relative links.
- Acceptance checks:
  - Runtime config includes `publicDir` and resolved title precedence.
  - Asset URLs resolve as `/<relative-path>` consistently in dev/build.
  - Relative non-doc markdown/image/reference URLs rewrite to stable absolute natural paths.

### Ticket 6: Regression-focused tests and docs

- Type: AFK
- Blocked by: Ticket 5
- Outcome:
  - Update/add unit and integration tests for new runtime path, mount model, and navigation behavior.
  - Update internal documentation notes as needed for runtime location, static serving scope, and title behavior changes.
- Acceptance checks:
  - Test suite passes with updated expectations.
  - `docs/3-prd-adjustments.md` is aligned with implemented behavior.

## Dependency Graph

- Foundation: Ticket 1
- Runtime mount core: Ticket 2
- Navigation model: Ticket 3
- Command parity: Ticket 4
- Title/path consistency: Ticket 5
- Hardening: Ticket 6
