---
title: "PRD: User-Configurable Dependencies (v1.0)"
---

## Context

This document defines an extension to fea-docs that addresses a gap between the existing framework-inference system (PRD v1.2) and the real-world need for third-party npm packages required by custom components imported in MDX files.

## Problem Statement

When users author MDX documentation that imports custom components (Astro, React, Vue, Svelte, etc.), those components may depend on third-party npm packages. fea-docs currently installs only a fixed set of dependencies into the ephemeral Starlight project — Astro, Starlight, framework adapters, and a handful of remark utilities.

If a component depends on a package like `@codesandbox/sandpack-react`, the build fails at Astro/Vite resolution time because the package is not present in the ephemeral project's `node_modules`. There is no mechanism for users to declare such dependencies.

The existing `fea-docs.config.mjs` already supports `frameworks`, `aliases`, and `ignore` — but there is no `dependencies` equivalent.

## Goal

Allow users to declare additional npm dependencies in their fea-docs configuration that are merged into the ephemeral Starlight project's `package.json` and installed alongside fea-docs' own dependencies.

## Non-Goals

- Auto-detecting third-party imports from MDX component graph.
- Installing packages without explicit user declaration.
- Runtime validation that declared dependencies match actual imports.
- Allowing dependency declaration via CLI flags (dependencies are a project-level concern).
- Support for `devDependencies`, `peerDependencies`, or other npm package.json fields.
- Handling of lockfile persistence across runs (ephemeral project is rebuilt as needed).
- Support for local workspace dependencies (`file:`, `workspace:`) — npm packages only.

## User Stories

1. As a docs author, I want to declare npm packages my custom MDX components depend on, so that the docs preview resolves imports correctly.
2. As a docs author, I want declared dependencies merged with fea-docs' own dependencies, so that I don't need to manually replicate the base dependency set.
3. As a docs author, I want my dependency versions to take precedence over fea-docs' internal versions when conflicts arise, so that I can control compatibility.
4. As a docs author, I want the cache to invalidate when I change my dependency declarations, so that a fresh install is triggered automatically.

## Proposed Solution

Add a `dependencies` field to `FeaDocsConfig` (and `ResolvedConfig`):

```ts
// fea-docs.config.mjs
export default {
  dependencies: {
    "@codesandbox/sandpack-react": "^2.0.0",
  },
};
```

### Changes by module

**Config type (`src/types.ts`):**
- Add `dependencies?: Record<string, string>` to `FeaDocsConfig`.
- Add `dependencies: Record<string, string>` to `ResolvedConfig`.

**Config resolver (`src/config/resolver.ts`):**
- Default `dependencies: {}` in `DEFAULT_CONFIG`.
- The top-level `resolveConfig()` spread merge already handles it.
- In `inferConfigFromDocs()`, merge `dependencies` from nested config files using first-wins semantics (matching the existing `aliases` merge pattern).

**Cache manager (`src/cache/manager.ts`):**
- Include `dependencies` in the SHA-256 fingerprint so changing deps invalidates the cache and triggers a fresh `npm install`.

**Runtime adapter (`src/runtime/adapter.ts`):**
- In `writePackageJson()`, spread `config.dependencies` after `this.frameworkDeps()` so user versions override fea-docs' internal version pins.

**Example config (`example/fea-docs.config.mjs`):**
- Add `@codesandbox/sandpack-react` to the example's dependencies so the `amelcraft.mdx` page works out of the box.

## Deep Module Impact

- **Types:** Two interfaces gain one field each.
- **Config Resolver:** `inferConfigFromDocs` gets a merge loop for `dependencies` analogous to the existing `aliases` merge.
- **Session Cache Manager:** Fingerprint input gains the `dependencies` field for correct cache invalidation.
- **Runtime Adapter:** `writePackageJson()` spreads user deps after framework deps.
- **CLI Commands:** No changes needed — both `start` and `build` already pass the full `ResolvedConfig` to `RuntimeAdapter`.

## Acceptance Criteria

1. A config file with `dependencies: { "left-pad": "^1.0.0" }` results in `left-pad` being present in the ephemeral project's `node_modules`.
2. Multiple nested config files merge `dependencies` with closer-to-root versions winning.
3. Changing `dependencies` in the config invalidates the session cache and triggers a fresh `npm install`.
4. User-declared dependency versions override fea-docs' internal version pins when names collide.
5. The example `amelcraft.mdx` page renders correctly after adding `@codesandbox/sandpack-react` to the example config.

## Testing Decisions

- Unit test that config resolver parses and merges `dependencies` correctly.
- Unit test that `writePackageJson()` includes user deps in the output.
- Unit test that cache fingerprint changes when `dependencies` changes.
- Manual verification that `amelcraft.mdx` renders without import errors.

## Rollout Notes

- Ship behind default-off (empty `dependencies: {}`) — no breaking change.
- Add usage example to README documenting the `dependencies` config field.
- The example config should be updated as part of the PR.

## Proposed Vertical Slices (Tracer Bullets)

1. **Title:** Add `dependencies` to type definitions and config resolver
   - **Type:** AFK
   - **Blocked by:** None
   - **What this slice proves:** `FeaDocsConfig` and `ResolvedConfig` accept `dependencies`, the resolver defaults and merges it, and nested configs accumulate deps with first-wins semantics.
   - **Acceptance checks:**
     - `resolveConfig()` with a config containing `dependencies` returns them in `ResolvedConfig.dependencies`.
     - `inferConfigFromDocs()` merges dependencies from ancestor configs without overriding closer-to-root values.
     - `DEFAULT_CONFIG` includes an empty `dependencies: {}`.

2. **Title:** Wire `dependencies` into runtime adapter and cache fingerprint
   - **Type:** AFK
   - **Blocked by:** #1
   - **What this slice proves:** User deps appear in the ephemeral `package.json`, are installed, and trigger cache invalidation on change.
   - **Acceptance checks:**
     - `writePackageJson()` outputs a `package.json` containing both fea-docs' own deps and user deps.
     - User deps appear after framework deps in the spread order (user overrides win).
     - Changing `dependencies` in config produces a different cache fingerprint.
   - **Additional notes:** Cache invalidation is critical — without it, changing deps silently reuses the old `node_modules`.

3. **Title:** Update example config and verify end-to-end
   - **Type:** HITL
   - **Blocked by:** #2
   - **What this slice proves:** The `amelcraft.mdx` page renders correctly with the `@codesandbox/sandpack-react` dependency installed.
   - **Acceptance checks:**
     - `fea-docs start` from the `example/` directory succeeds without module-not-found errors.
     - The Sandpack component renders on the Amelcraft docs page.
     - The session cache is populated and reused on subsequent starts.

## Dependency Graph (summary)

- Foundation: #1
- Runtime and caching: #2
- End-to-end verification: #3

## Risks and Mitigations

- **Risk:** Version conflicts between user deps and fea-docs' internal deps (e.g., user pins Astro to an incompatible version).
  - **Mitigation:** This is explicit user choice — npm will resolve per standard semver rules. We document that overrides may break fea-docs and are at the user's own risk.
- **Risk:** Large dependency trees slow down `npm install` on every cache miss.
  - **Mitigation:** No special handling beyond the existing cache mechanism. Users who add heavy deps accept the trade-off.
- **Risk:** User forgets to declare a dependency and gets a runtime import error with an unclear message.
  - **Mitigation:** This is out of scope for v1. A future iteration could add strict-mode validation that checks third-party imports against declared dependencies.

## Review Questions

1. Should `dependencies` also be mergeable from ancestor `fea-docs.config.*` files (via `inferConfigFromDocs`), or only from the root config?
2. Should we support `devDependencies` for packages only needed at build time?
3. Should a future strict-mode diagnostic warn about undeclared third-party imports in MDX files?

---

## Implementation Plan

### Ticket 1: Add `dependencies` to type definitions and defaults (AFK)

**Files to modify:**
- `src/types.ts` — add field to both `FeaDocsConfig` and `ResolvedConfig`

**Changes:**

`FeaDocsConfig` (user-facing, line 48):
```ts
dependencies?: Record<string, string>;
```

`ResolvedConfig` (runtime, line 72):
```ts
dependencies: Record<string, string>;
```

**Acceptance checks:**
- The config field is optional in `FeaDocsConfig` (backward compatible).
- `ResolvedConfig` requires it at runtime (pre-populated by defaults).

---

### Ticket 2: Wire `dependencies` into config resolver (AFK)

**Blocked by:** Ticket 1

**Files to modify:**
- `src/config/resolver.ts`

**Changes:**

Add default to `DEFAULT_CONFIG` (line 16):
```ts
const DEFAULT_CONFIG: ResolvedConfig = {
  ...
  dependencies: {},
};
```

In `inferConfigFromDocs()` (around line 133), add `dependencies` merge alongside the existing `aliases` merge — same first-wins semantics. After the existing `inferredAliases` block:
```ts
const inferredDependencies = { ...config.dependencies };

for (const source of sources) {
  ...
  for (const [key, version] of Object.entries(fromFile.dependencies ?? {})) {
    if (!(key in inferredDependencies)) {
      inferredDependencies[key] = version;
    }
  }
}
```

Then include in the returned config:
```ts
return {
  config: {
    ...config,
    frameworks: inferredFrameworks,
    aliases: inferredAliases,
    dependencies: inferredDependencies,
  },
  sources,
};
```

**Acceptance checks:**
- `resolveConfig()` without a config file yields `dependencies: {}`.
- A config with `dependencies: { "foo": "^1.0.0" }` is resolved into `ResolvedConfig.dependencies`.
- Nested ancestor configs merge dependencies; closer-to-root version wins on collision.
- The field is spread-merged correctly with CLI flags (no special CLI flag needed).

---

### Ticket 3: Include `dependencies` in cache fingerprint (AFK)

**Blocked by:** Ticket 1

**Files to modify:**
- `src/cache/manager.ts`

**Changes:**

In `fingerprint()` (line 29), add `dependencies` field to the signature object:
```ts
const sig = JSON.stringify({
  cacheVersion: CACHE_VERSION,
  root: config.root,
  base: config.base,
  ignore: config.ignore,
  frameworks: config.frameworks,
  aliases: config.aliases,
  dependencies: config.dependencies,
  pages: [...pages].sort(),
});
```

**Acceptance checks:**
- Two configs differing only in `dependencies` produce different fingerprints.
- Cache invalidates on dependency change, triggering fresh `npm install`.

---

### Ticket 4: Merge user deps into ephemeral `package.json` (AFK)

**Blocked by:** Ticket 1

**Files to modify:**
- `src/runtime/adapter.ts`

**Changes:**

In `writePackageJson()` (line 66), spread `config.dependencies` after `this.frameworkDeps()` so user versions win on name collision:
```ts
dependencies: {
  astro: '^6.3.5',
  '@astrojs/starlight': '^0.39.2',
  'unist-util-visit': '^5.1.0',
  'mdast-util-to-string': '^4.0.0',
  ...this.frameworkDeps(),
  ...this.options.config.dependencies,
},
```

**Acceptance checks:**
- User deps appear in the ephemeral project's `package.json`.
- User deps are placed after framework deps so user versions take precedence.
- No structural changes needed — `installDeps()` runs `npm install` as before.

---

### Ticket 5: Update example config and add tests (AFK)

**Blocked by:** Tickets 2, 3, 4

**Files to modify:**
- `example/fea-docs.config.mjs`
- `src/__tests__/config-resolver.test.ts`
- `src/__tests__/runtime-adapter.test.ts`
- `src/__tests__/cache-manager.test.ts`

**Changes:**

**Example config (`example/fea-docs.config.mjs`):**
```js
export default {
  frameworks: ['react', 'svelte'],
  aliases: { ... },
  dependencies: {
    '@codesandbox/sandpack-react': '^2.0.0',
  },
};
```

**Config resolver test (`src/__tests__/config-resolver.test.ts`):**
- Add test: config with deps resolves correctly.
- Add test: nested configs merge deps with first-wins.

**Runtime adapter test (`src/__tests__/runtime-adapter.test.ts`):**
- Update `makeConfig()` helper to include `dependencies: {}`.
- Add test: `writePackageJson()` output contains user deps.
- Add test: user version overrides framework dep version (e.g., override `react` version).

**Cache manager test (`src/__tests__/cache-manager.test.ts`):**
- Update base config to include `dependencies: {}`.
- Add test: same config yields same fingerprint.
- Add test: different deps yield different fingerprint.

**Acceptance checks:**
- All new and existing tests pass.
- `fea-docs start` from `example/` resolves `@codesandbox/sandpack-react` at runtime.
- The `amelcraft.mdx` page renders correctly with Sandpack.

---

### Dependency graph

```
Ticket 1 (types)
  ├─ Ticket 2 (config resolver)
  ├─ Ticket 3 (cache fingerprint)
  └─ Ticket 4 (runtime adapter)
       └─ Ticket 5 (example + tests)
```

Tickets 2, 3, and 4 are independent (all depend only on Ticket 1) and can be implemented in parallel.

---

### Files changed (summary)

| File | Change |
|---|---|
| `src/types.ts` | +2 lines (two interfaces) |
| `src/config/resolver.ts` | ~10 lines (default + merge loop) |
| `src/cache/manager.ts` | +1 line (fingerprint field) |
| `src/runtime/adapter.ts` | +1 line (spread in `writePackageJson`) |
| `example/fea-docs.config.mjs` | +3 lines (sandpack dep) |
| `src/__tests__/config-resolver.test.ts` | ~30 lines (new tests) |
| `src/__tests__/runtime-adapter.test.ts` | ~25 lines (helper + new tests) |
| `src/__tests__/cache-manager.test.ts` | ~20 lines (helper + new tests) |

Estimated total: ~90 lines across 8 files, all additive (no refactoring).
