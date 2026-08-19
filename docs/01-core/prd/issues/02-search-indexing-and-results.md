---
title: "Search Indexing & Result Requirements"
labels: wayfinder:grilling
---

Type: grilling
Status: resolved
Blocked by:

## Question

The PRD must pin down search beyond "JS-only widget." The pattern is settled (build-time index + JS widget, search box only appears with JS enabled), but these requirement-level details are not:

- **What gets indexed:** full rendered text? headings only? filenames + headings? frontmatter fields?
- **Ranking/relevance bar:** does the PRD promise relevance ordering, or just "matches, sorted deterministically"?
- **Result presentation:** how a result maps to a page (title, snippet of matched text, route link)?
- **Index generation:** produced during `build` (and `dev`)? Stored as a static asset inside the output — requirement-level, not the format.
- **Failure policy:** search failure without the index present (e.g. page served without its static index) — what does the widget do?

Decide each as a v1 requirement. **Recommended defaults:** index full rendered text + filename; deterministic match ordering with basic score as a nice-to-have; result shows page title + first matching snippet + link; index generated in both `build` and `dev`; missing index → widget shows a "search unavailable" message without error noise.

## Answer

**What gets indexed:** filename + headers/headings + frontmatter + full rendered text. (Requirement: frontmatter searchable when valid, excluded when malformed; whether the index stores parsed values, raw YAML, or both is implementation.)

**Result navigation:** primary requirement is **section-anchor navigation** — a result scrolls/lands on the containing heading (`#<section>`), where the user sees surrounding content. **Optional exact-text highlight** ("land literally on the searched phrase") is a nice-to-have, to be added when feasible — that prioritisation is an implementation decision.

**Result presentation:** each hit shows page title + matching section heading + a snippet of the matched text + link.

**Ranking:** relevance-ordered results (best match first) is the PRD-level requirement; the exact scoring formula is implementation.

**Index generation / robustness:** the search index is a **static asset emitted at `build`** (and `dev`), hosted with the site — no backend, no server, all query-time work in the browser. If the page is served without its index (misconfiguration only), the widget shows a small "search unavailable" message — no error noise, no console crash.

**Dev search (nice-to-have):** search working on the **dev server** too, not only production builds (Starlight exposes it on prod only, likely for performance). Desirable if the index/rebuild cost on `dev` stays small — to be judged by the scale smoke-test.

**Progressive enhancement (unchanged):** search is JS-only — the search box appears only when JS is enabled; core render/navigation work without it.

**Performance note:** client-side querying over a downloaded static index stays comfortably fast at 1000+ docs (single-digit-MB index, sub-100ms–low-hundreds-ms queries). Build cost is bounded by MDX compilation (seconds-to-minutes for large trees), not by the search index. PRD promise: *handles 1000+ docs on a typical laptop*; exact build-time budget deferred to a scale smoke-test rather than in the PRD.