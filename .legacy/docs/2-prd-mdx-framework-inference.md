---
title: "1.2: MDX Framework Inference"
---

## Context

This document defines an iteration of `@docs/1-prd.md` focused on reducing MDX component import failures when running from broad scopes (for example, repo root in a monorepo).

It does not replace or modify the base PRD.

## Problem Statement

When users run `fea-docs start` from a broad directory, discovered MDX files may import custom components that require framework adapters not explicitly configured in the active run context.

Today, this can produce runtime failures like unresolved imports or missing framework integration modules, even though content works when run from a narrower subtree with hand-tuned config.

## Goal

Infer required framework adapters directly from discovered MDX usage so docs preview works by default without requiring users to manually pass framework flags in common cases.

## Non-Goals

- Auto-installing arbitrary third-party packages inferred from bare imports.
- Full static analysis of all JavaScript/TypeScript in the repository.
- Perfect framework identification for every JSX/TSX edge case.
- Rewriting user source files or mutating existing config files.

## User Stories

1. As a docs author, I want `start` from repo root to infer required adapters from MDX imports so mixed docs trees still render.
2. As a docs author, I want unique file-extension signals (for example `.svelte`, `.vue`) to auto-enable the right adapter with high confidence.
3. As a docs author, I want ambiguous `.jsx`/`.tsx` component trees to remain usable without manual triage.
4. As a docs author, I want clear diagnostics explaining what was inferred and why, so behavior is transparent.
5. As a power user, I want explicit config/flags to continue overriding inferred behavior.

## Proposed Solution

Add an MDX-only import inference pipeline:

1. Discover `.mdx` pages from the existing content graph.
2. Parse static `import` declarations in each MDX file.
3. Follow local imports recursively (component graph walk) for supported source types (`.mdx`, `.astro`, `.tsx`, `.jsx`, `.ts`, `.js`, `.mjs`, `.cjs`, `.svelte`, `.vue`).
4. Infer frameworks from evidence using a known-framework map.
5. Merge inferred frameworks into runtime adapter selection before materializing Astro/Starlight runtime.
6. Print a concise inference report (detected signals and any ambiguity fallback).

## Framework Inference Rules

### High-confidence signals

- **Svelte:** any `.svelte` file or import from `svelte`.
- **Vue:** any `.vue` file or import from `vue`.
- **Solid:** import from `solid-js` or `solid-js/web`.
- **Qwik:** import from `@builder.io/qwik` or `@builder.io/qwik-city`.
- **React:** import from `react`, `react-dom`, or `react/jsx-runtime`.

### Ambiguous JSX/TSX policy

If the MDX component graph includes `.jsx` or `.tsx` and no high-confidence framework signal resolves the ambiguity, enable:

- `react`
- `solid`
- `qwik`

This is an intentional compatibility-first fallback. Users can optimize via explicit config.

### Precedence

- Explicit CLI flags/config remain authoritative.
- Inference augments missing frameworks; it does not remove explicitly set frameworks.

## Functional Requirements

- Inference must run for both `start` and `build`.
- Only MDX-rooted import graphs are scanned.
- Only static `import ... from ...` declarations are considered in v1 of this extension.
- Cycles in component import graphs must be safely handled.
- Missing local imports should produce non-fatal warnings in dev and strict failures in strict mode/build validation paths where applicable.

## Diagnostics Requirements

The CLI must emit short, actionable messages, for example:

- Inferred frameworks: `react, solid, qwik` (from ambiguous JSX/TSX in `example/docs/integrations.mdx`)
- Inferred frameworks: `svelte` (from `.svelte` component import)
- Could not resolve local import `...` (with source file path)

## Deep Module Impact

- **Content Graph Engine:** no schema change required; existing MDX discovery is reused.
- **Runtime Adapter:** add Qwik adapter support and consume inferred framework set.
- **Strict Validator:** include MDX import graph resolution diagnostics in strict outcomes.
- **CLI Commands (`start`/`build`):** run inference before runtime materialization.

## Acceptance Criteria

1. Running from repo root with MDX importing `.svelte` components enables Svelte integration automatically.
2. Running from repo root with MDX importing `.vue` components enables Vue integration automatically.
3. Running from repo root with ambiguous JSX/TSX-only component graph enables React+Solid+Qwik integrations automatically.
4. Explicit `--framework` settings are preserved and not overridden by inference.
5. CLI output includes a one-line inference summary when inference changed framework selection.
6. Strict mode reports unresolved MDX-local imports with file-level diagnostics.

## Testing Decisions

- Unit tests for framework-signal classification.
- Unit tests for recursive import traversal and cycle handling.
- Unit tests for ambiguous JSX/TSX fallback behavior.
- Integration tests for `start` and `build` ensuring inferred frameworks alter generated runtime config correctly.
- Regression tests confirming existing explicit config precedence remains intact.

## Rollout Notes

- Ship behind default-on behavior for zero-config UX.
- Document fallback behavior and optimization guidance in README (`--framework` / config overrides).
- Track startup performance impact; keep traversal bounded to MDX-reachable files only.

## Proposed Vertical Slices (Tracer Bullets)

1. **Title:** Add MDX import graph scanner module
   - **Type:** AFK
   - **Blocked by:** None - can start immediately
   - **What this slice proves:** We can parse static `import` statements from `.mdx` files and follow local imports recursively with cycle protection.
   - **Acceptance checks:**
     - Scanner accepts MDX entry files and returns visited file graph.
     - Graph walk supports `.mdx`, `.astro`, `.tsx`, `.jsx`, `.ts`, `.js`, `.mjs`, `.cjs`, `.svelte`, `.vue`.
     - Cycles do not infinite-loop.

2. **Title:** Implement framework signal classifier
   - **Type:** AFK
   - **Blocked by:** #1
   - **What this slice proves:** Frameworks can be inferred from high-confidence extension/import signals.
   - **Acceptance checks:**
     - `.svelte` => `svelte`, `.vue` => `vue`.
     - `solid-js` imports => `solid`.
     - `@builder.io/qwik` imports => `qwik`.
     - `react`/`react-dom`/`react/jsx-runtime` imports => `react`.

3. **Title:** Add ambiguous JSX/TSX fallback policy
   - **Type:** AFK
   - **Blocked by:** #1, #2
   - **What this slice proves:** Unresolved JSX/TSX ambiguity is handled via compatibility fallback.
   - **Acceptance checks:**
     - If `.jsx`/`.tsx` appears without high-confidence framework signal, inferred frameworks include `react`, `solid`, and `qwik`.
     - Fallback is deterministic and de-duplicated.

4. **Title:** Integrate inference into `start` command runtime selection
   - **Type:** AFK
   - **Blocked by:** #2, #3
   - **What this slice proves:** `start` can augment framework adapters from MDX evidence before runtime materialization.
   - **Acceptance checks:**
     - Running from broader scope infers missing frameworks for MDX component trees.
     - Explicit framework flags/config remain preserved.

5. **Title:** Integrate inference into `build` command runtime selection
   - **Type:** AFK
   - **Blocked by:** #2, #3
   - **What this slice proves:** Build path applies same framework inference behavior as dev path.
   - **Acceptance checks:**
     - `build` uses inferred framework set when explicit configuration is incomplete.
     - Generated Astro config includes required integration imports consistently with `start`.

6. **Title:** Add Qwik framework support in runtime adapter
   - **Type:** AFK
   - **Blocked by:** #4, #5
   - **What this slice proves:** Inferred `qwik` can be fully materialized in generated Astro runtime.
   - **Acceptance checks:**
     - Framework type union accepts `qwik`.
     - Runtime package generation adds `@astrojs/qwik` and `@builder.io/qwik`.
     - Generated `astro.config` imports and activates Qwik integration when selected.

7. **Title:** Add inference diagnostics and UX messaging
   - **Type:** AFK
   - **Blocked by:** #4, #5
   - **What this slice proves:** Users get clear visibility into inferred frameworks and ambiguity fallback.
   - **Acceptance checks:**
     - CLI prints one-line summary when inference changes selected frameworks.
     - Unresolved local import warnings include source file and import specifier.

8. **Title:** Strict-mode and validation alignment for unresolved local imports
   - **Type:** AFK
   - **Blocked by:** #1, #7
   - **What this slice proves:** Import graph issues are warnings in dev and strict failures where strict checks apply.
   - **Acceptance checks:**
     - Non-strict start shows warnings and continues when possible.
     - Strict validation/build surfaces unresolved local import diagnostics as failures.

9. **Title:** Comprehensive tests for scanner, classifier, and command integration
   - **Type:** AFK
   - **Blocked by:** #1, #2, #3, #4, #5, #6, #8
   - **What this slice proves:** Behavior is covered end-to-end and regressions are guarded.
   - **Acceptance checks:**
     - Unit tests cover signal mapping and fallback policy.
     - Unit tests cover recursive traversal and cycle handling.
     - Integration tests confirm inferred frameworks affect generated runtime config in `start` and `build`.

10. **Title:** Documentation update for inference behavior and optimization guidance
    - **Type:** AFK
    - **Blocked by:** #7, #9
    - **What this slice proves:** Users understand default inference and how to override/optimize with explicit config.
    - **Acceptance checks:**
      - README includes inference rules and ambiguity fallback behavior.
      - README clarifies explicit config precedence.

## Dependency Graph (summary)

- Foundation: #1
- Inference core: #2 -> #3
- Command wiring: #4, #5
- Runtime framework completeness: #6
- UX and validation: #7 -> #8
- Quality gate: #9
- Docs hardening: #10

## Risks and Mitigations

- **Risk:** Over-inference may add unnecessary framework integrations and slow startup.
  - **Mitigation:** Restrict scanning to MDX-rooted graph only; de-duplicate; keep explicit config precedence.
- **Risk:** Complex import syntax reduces coverage.
  - **Mitigation:** Support static import declarations first; warn clearly for unresolved patterns.
- **Risk:** Qwik integration wiring mismatch across Astro versions.
  - **Mitigation:** Pin and test runtime dependency set in generated app with integration smoke tests.

## Review Questions

1. Should unresolved local imports in non-strict mode remain warnings only, or ever fail start when a referenced MDX route is requested?
2. Do we want a future opt-out flag for JSX ambiguity fallback (e.g. `--no-jsx-fallback`)?
3. Is Qwik support required in this iteration, or should we ship inference now and add Qwik adapter support in the next slice?
