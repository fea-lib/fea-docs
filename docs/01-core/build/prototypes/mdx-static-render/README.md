# Prototype: MDX static-render & minimal-JS by declaration

Answers ticket `issues/14-mdx-static-render-minimal-js-prototype.md` Z1–Z3.

## Run

```
npm run
```

(installs `@mdx-js/mdx`, `react`, `react-dom`, `esbuild` from this dir's `package.json`; then `node spike.mjs`.)

## What it proves

- **Static page** (`renderMode="static"` components only) → correct static HTML, **zero JS shipped**.
- **Hybrid page** (`renderMode="hybrid"` component used) → correct static HTML **plus** a page-scoped chunk and a shared vendor chunk.
- **Vendor chunk is shared/cacheable** (emitted once, referenced from every page).
- **React server render is the mechanism** — `react-dom/server` `renderToStaticMarkup` / `react-dom/static` `prerender` executes `useState`, `useMemo`, `useCallback`, etc. at build.

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

A static-only page ships **0 bytes of JS**; a hybrid page ships only its own
provides chunk. React's runtime is paid **once** in the shared vendor chunk.

## Verdict

- **Wrapper/adapter contract works**: one render path via `react-dom/server`/`static` + a hydration signal (the chunk set) is enough to separate static from interactive.
- **Minimal-JS-by-declaration is sound**: zero-JS for static pages is real; hybrid pages' JS is page-scoped and vendor is cached. The noop-effect finding records the exact boundary of what static HTML can promise.
- **Feed-back into 02 D4 / 05**: 
  - 05 must implement hydration via the page chunk (which contains the component's **complete transitive graph** — the "did-run vs must-ship" guarantee).
  - The heading slug revisit (02 D4) stands — but note effect-based components render *pre-effect* HTML, so any slugging typed from rendered headings is exercised on pre-effect state. Component with effects: slug extraction happens even if the heading text is effect-generated — a new coverage gap to confirm in that revisit.