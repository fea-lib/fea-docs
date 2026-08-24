---
title: "Prototype: MDX static-render & minimal-JS by declaration"
---

# Prototype: MDX static-render & minimal-JS by declaration

Answers ticket `issues/14-mdx-static-render-minimal-js-prototype.md` Z1–Z3.

## Run

```
npm run
```

(installs `@mdx-js/mdx`, `react`, `react-dom`, `esbuild` from this dir's `package.json`; then `node spike.mjs`.)

## What it proves

- **Static page** (`renderMode="static"` components only) → full HTML page, **zero JS shipped** (no `<script>`, no chunks referenced).
- **Hybrid page** (`renderMode="hybrid"` components used) → full HTML page **plus** `<script type="module">` references to the page-scoped chunk (`page-*.page.js`) and the shared `vendor.js`.
- **The emitted HTML carries the JS it must load** — the earlier spike emitted a bare fragment and silently omitted the script tags; the renderer now assembles a complete, loadable page (doctype, `<head>`/`<title>` from first H1, body, per-mode scripts). This is the extension that makes hydration actually reachable.
- **Mount markers**: a hybrid component renders `data-hydrate="<Name>"` on its root (the `renderMode` prop comes through MDX) — the marker contract the hydrate chunk hooks into.
- **Vendor chunk is shared/cacheable** (one `vendor.js`, react/jsx-runtime bundled self-contained via esbuild).
- **Page chunk** bundles the hydrate entry + component graph with esbuild (in this demo it re-includes react; real 05 would wire the import to the shared vendor — recorded).
- **React server render is the mechanism** — `react-dom/server` + `react-dom/static` execute `useState`/`useMemo`/`useCallback` at build.

## Key finding: effects do NOT run at build

React's server runtime is **effect-free by design**: in
`react-dom-server…node.development.js`, `useEffect`, `useLayoutEffect`,
`useInsertionEffect`, `useImperativeHandle` are all hardcoded **`noop`**.
Consequences that matter for the render model:

- `useState`/`useMemo`/`useCallback` compute correctly at build (static HTML is right for the pre-effect state).
- **`useEffect` mutations never reach the static HTML.** A component whose behavior depends on an effect therefore produces *pre-effect* HTML (`<output>idle</output>`), and its effect only exists on the **hydrated client pass**.
- This validates the **`renderMode="hybrid"` contract**: a hybrid component's full transitive graph ships precisely because its *runtime behavior* (especially effects) cannot exist in build-time HTML.
- The `error` you'd otherwise chase: expecting `<output>done</output>` from a build-time effect run — that's the noop trap.

## Byte reality (measured)

| sample | raw | gzip |
|---|---|---|
| page-static.html | 153 | 141 |
| page-hybrid.html | 202 | 149 |
| page-hybrid.page.js (page chunk) | 170 | 130 |
| vendor.js (shared, one copy) | 120 | 110 |

## Byte reality (measured, after the shell + real chunks)

| sample | raw | gzip |
|---|---|---|
| page-static.html (full page, no JS) | 349 | 257 |
| page-hybrid.html (full page + script refs) | 549 | 326 |
| page-hybrid.page.js (page chunk, bundled) | 61314 | ~13000 |
| vendor.js (shared react runtime, one copy) | 60186 | 13319 |

The page chunk + vendor re-include react in this demo (esbuild `bundle`). In 05 the page chunk wires to the shared vendor (`external`), so the page chunk shrinks to component-only and react is paid **once**. The essential split holds: a static-only page ships **0 bytes of JS**; a hybrid page ships its page chunk and references the shared vendor.

## Verdict

- **Wrapper/adapter contract works**: one render path via `react-dom/server`/`static` + a hydration signal (the chunk set) is enough to separate static from interactive.
- **Minimal-JS-by-declaration is sound**: zero-JS for pages fully static is real; hybrid pages' JS is page-scoped and vendor is shared/cacheable.
- **The renderer must emit a complete page, not a fragment** — corrected here: the emitted HTML now carries the `<script>` references the page must load (vendor + page chunk). A bare-body render is incomplete.
- **Mount markers work**: `data-hydrate` on hybrid roots (the `renderMode` prop survives MDX → component) is the hook the hydrate chunk targets.
- **Feed-back into 02 D4 / 05**:
  - 05 must hydrate via the page chunk (the component's complete transitive graph — the "did-run vs must-ship" guarantee) and wire the page chunk's react import to the shared `vendor.js` (esbuild `external` / alias) rather than re-bundling react per page.
  - The heading slug revisit (02 D4) stands — components render *pre-effect* HTML at build, so any slugging typed from rendered headings runs against pre-effect state; effect-generated heading text can't exist server-side.