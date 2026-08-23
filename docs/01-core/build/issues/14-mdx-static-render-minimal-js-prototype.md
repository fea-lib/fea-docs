---
title: "14 — MDX static-render & minimal-JS prototype"
---

# 14 — MDX static-render & minimal-JS prototype

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §3, §7; Case-4 grilling decisions with ticket 02

**What to build:** A throwaway spike verifying the **React-backed MDX render approach** decided in ticket 02's Case-4: MDX components are rendered to static HTML **at build time** (hooks run at build, correct markup), through a **single swappable runtime wrapper** that receives the component set and their declared `renderMode` to later switch the backend from React to Vue/Solid without touching consumers. The spike also verifies the **minimal-JS-by-declaration model**: a `renderMode="static"` component ships **zero JS** (pure static HTML); a `renderMode="hybrid"` component ships its full transitive module graph in the **page-scoped chunk**, hydrated in place on the same URL, with the vendor/runtime chunk shared/cached across pages. The verdict gates ticket 05's render commitment and feeds the heading-slug coverage revisit in ticket 02 decision 4.

**Blocked by:** 02 — Core markdown rendering & routes (verifies against the renderer pipeline seam; can start as a standalone spike before 02 lands)

**Status:** ready-for-agent

## Resolutions

Grilled with ticket 02; each recorded before the next decision.

- [x] **Z0 — Prototype location & reproducibility.** Lives under **`docs/01-core/build/prototypes/`** (repo scratch), e.g. `docs/01-core/build/prototypes/mdx-static-render/`, excluded from the shipped build (never under `src/`, never in `dist/`). Committed at least until the verdict writes back into 02's D4-revisit; the readable evidence (byte counts, method, verdict) is what 05 and 02's revisit cite — kept as reproducible docs, not a reference to a missing tmpdir.
- [x] **Z1 — Chunking, conceptual split, & caching.** **Everything static is static**: static-only pages ship **zero JS**; only components declaring `renderMode="hybrid"` ship JS. JS splits: the **vendor/runtime chunk (react.js + runtime) is a single cacheable asset shared across pages**; the **page-scoped chunk** holds exactly that page's hybrid components. **Progressive enhancement on the same URL**: hybrid pages hydrate in place (static HTML upgrades on load; no-JS core still works). Measurement records both raw-emitted and gzipped/on-wire sizes.
- [x] **Z1b — Render-mode declaration (replaces `needsJs`/recorder).** The **author declares each component's render mode**: `renderMode="static"` (default; must be statically renderable, ships zero JS) or `renderMode="hybrid"` (component may run client-side logic; the client bundle ships its **complete transitive module graph** — deferred effects, portals, custom JS all captured; the "does the bundle catch everything" problem is solved *by declaration*, because the must-ship set is the component's full graph, not a did-run subset). **No recorder, no instrumentation, no auto-detection.** Undeclared => `static`. `client` (client-only: build nothing, run entirely client-side) is **deferred to v2**, where the enum extends `static | hybrid | client` (recorded so 05 doesn't rename later). `--strict` (12) escalates declaration slack into failures (failsafe).
- [x] **Z2 — Detection removed.** The recorder and the executed-trace detector are **gone**. Nothing "detects" interactivity; the author's `renderMode` declaration is the single contract.
- [x] **Z3 — FrameworkAdapter contract.** **Single adapter per framework** (the one render backend seam), exposing: **(a)** `render` → static HTML from the page's component set, **(b)** `hydration` (hybrid only) → page chunk + shared vendor chunk ref + mount markers. Framework key from the **component declaration context** (per-file import graph; the `renderMode`/framework attribute — v1 always `'react'`, seam exists for Vue/Solid). Adapter owns mount markers + vendor-vs-page split — future frameworks supply their own without consumer changes.

- [ ] Static `renderMode="static"` component renders to correct static HTML (no client JS needed)
- [ ] `renderMode="hybrid"` component renders correct HTML at build and its full transitive graph ships in the page chunk (deferred effects included)
- [ ] Zero JS emitted for a page whose components are all `renderMode="static"`
- [ ] Page-scoped minimal JS emitted for pages containing `renderMode="hybrid"` components — measured shipped-bytes reality recorded and compared
- [ ] Wrapper contract verified: one adapter per framework, invoked with enough signal to swap React → Vue/Solid later without consumer changes
- [ ] Verdict recorded for ticket 05 (render approach to commit) and for ticket 02 decision 4 (slug coverage input)

## Requirements & constraints

**Case-4 decisions (from ticket 02's grilling) — what this spike must prove:**

- **React-backed MDX** is agreed: `@mdx-js/mdx` compile → static render with `react-dom/server` at build. Non-React frameworks (Vue/Solid/hand-wired) are excluded from being components in v1 — a deliberate product decision to record; the wrapper is the future seam for them.
- **Wrapper seam:** rendering goes through one abstraction (e.g. `src/render/framework-runtime.ts`) exposing a `renderToStaticHtml`-class API plus bundle/props signals. It gets invoked with the component set and their declared `renderMode` values to switch backend later. The spike must verify this contract shape.
- **Minimal JS via declaration:** the "does a component need client JS" question is answered **by the author's `renderMode` declaration**, not by detection. `renderMode="static"` (default) ⇒ builds static HTML, ships zero JS. `renderMode="hybrid"` ⇒ builds static HTML *and* ships the component's complete transitive module graph so the page can hydrate in place. The bundled JS for a hybrid page is exactly the set of hybrid components on that page plus the shared vendor chunk — no recorder, no runtime analysis, no tree-shaking heuristics. The spike must verify this model: declarations, the vendor/page chunk split, and that the hybrid page's hydration actually works on the same URL.
- **No-JS core (PRD §7):** static HTML is the source of truth; JS only upgrades it. Custom components may be JavaScript-dependent — that dependency is the interactive remainder and is *author-owned* (their bundle, their hydration), outside the tool (recorded boundary).

**Why this gates 05 (re-scoped):** ticket 05 is no longer "swap the parser" — it becomes "React MDX: compile → static render → hydrate (for `renderMode="hybrid"` components)". That commitment should only land after this spike answers: does the wrapper shape hold, does the declaration model work, and is the shipped-JS split worth its complexity (bytes reality)?

**Why this feeds the slug revisit (02 decision 4):** component-rendered headings become *visible in the rendered tree* only when components render at build. Which headings get slugs (covered) and which remain missed (raw-JSX-in-props, dynamic render) must be re-examined once the build-time render solution is established. The revisit in 02 decision 4 is **dependent on this ticket's verdict**.

## Open decisions

Resolved already (below); the remaining open item for the prototype run is recorded here.

- [x] **Chunking & bytes reality** — resolved by Z1 (vendor chunk shared/cacheable; page chunk = hybrid set; measure raw + gzipped).
- [x] **Detection granularity & ownership** — resolved by Z1b/Z2: there is **no detection**; the author declares `renderMode`; the wrapper takes the declared set, not an analyzer.
- [x] **Wrapper contract shape** — resolved by Z3: one `FrameworkAdapter` with `render` + `hydration`, keyed by the component's framework; mount markers + chunk split are adapter-owned.
- [x] **`renderMode` placement & syntax.** **Per-usage, on the PascalCase tag**: `<Clock renderMode="static" />` (explicit === default) or `<Clock renderMode="hybrid" />`. Astro-style directive on the use site — works for third-party components (never touches component internals), lets usage context vary (interactive on one page, static-only elsewhere). The adapter reads the declared set from the component uses; 05's component resolution already establishes where those uses live in the AST.

## Gates (blocking edges)

- **Blocked by:** 02 (pipeline seam for the honest in-context verification; standalone spike possible earlier).
- **Blocks:** 05 (render approach + hydration decision), the slug-coverage revisit in 02 decision 4.