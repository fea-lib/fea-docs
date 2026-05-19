---
title: "PRD: MDX Framework Inference"
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
