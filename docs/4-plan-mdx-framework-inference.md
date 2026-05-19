---
title: "MDX Inference Plan"
---

## Source PRD

- Base PRD: [`1-prd.md`](1-prd.md)
- Iteration PRD: [`3-prd-mdx-framework-inference.md`](3-prd-mdx-framework-inference.md)

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
