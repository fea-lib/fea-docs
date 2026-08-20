---
title: "11 — Search index & widget"
---

# 11 — Search index & widget

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §7, §8

**What to build:** A build-time static search index covering filename + headings + valid frontmatter + full rendered text, emitted as a static asset with the site (no backend, no server). Search is JS-only: the search box appears only when JavaScript is enabled; core render/navigation never requires it. Results navigate to the containing section heading (`#<section>`), are relevance-ordered (best match first), and each hit shows page title + section heading + snippet + link. If the page is served without its index, the widget shows a small "search unavailable" message — no error noise, no console crash.

**Blocked by:** 04 — Frontmatter box & title resolution (valid-frontmatter indexing rides on frontmatter handling)

**Status:** ready-for-agent

- [ ] Static search index emitted at build covering filename + headings + valid frontmatter + full text
- [ ] Search box appears only when JavaScript is enabled; render/nav work without it
- [ ] Results navigate to the containing section heading (`#<section>`)
- [ ] Results are relevance-ordered; each shows title + section heading + snippet + link
- [ ] Missing index → "search unavailable" message, no error noise/console crash

**Blocks:** 13 (dev-search cost assessment + scale smoke-test read)

## Requirements & constraints

**Search — PRD §8, §7**
- Search is a **progressive enhancement**: a **build-time search index** plus a **JS widget**. The search box appears **only when JavaScript is enabled**; core render/navigation never requires it (§7, §8).
- **Indexed content:** filename + headings + **valid frontmatter** (excluded when malformed) + **full rendered text**.
- **Static asset** emitted at `build` (and `dev`), hosted with the site — **no backend, no server**; all query-time work happens in the browser.
- **Result navigation:** a result navigates to the **containing section heading** (`#<section>`) as the primary requirement; exact-text highlighting/landing is optional/implementation.
- **Result presentation:** each hit shows **page title + matching section heading + a snippet + a link**; relevance-ordered (best match first; scoring formula is implementation).
- **Missing index (misconfiguration only):** widget shows a small "search unavailable" message — no error noise, no console crash.
- **Performance promise:** **1000+ documents** comfortable on a typical laptop (client-side query over the downloaded index); build-time budgets deferred to the scale smoke-test (ticket 13).
- **Dev-server search**: may work on `dev` if the index/rebuild cost is small enough — **gated by 13's decision**.

**Dependencies**
- Valid-frontmatter indexing rides on ticket 04's frontmatter handling (this ticket is blocked by 04).
- Landing on `#<section>` requires the heading-slug contract from ticket 02 (decision 4).

## Open decisions

1. **Index format/asset.** A single JSON file vs a split/indexed structure (e.g. one store per doc or per section). 1000+ pages with client-side query → consider steady memory/load; *rec:* one deterministic JSON asset, schema pinned, optionally compressed.
2. **Section granularity & snippet source.** Because results land on a containing heading, the index almost certainly stores **per-section entries** (heading slug + text) rather than whole doc text. Decide granularity, how text is normalized (tokenization, case-fold, diacritics), and keep it deterministic.
3. **Query ranking algorithm.** Implement vs. select (TF-IDF / BM25 / a tiny FTS in the widget JS); decide the scoring factors (field weights: filename vs headings vs body) and the no-JS/query-time budget that satisfies comfort at 1000+ (13 validates).
4. **Widget delivery mechanism.** Inline script in each page shell (but never in no-JS core — gate it by JS) vs a single shared JS asset. Decide the mechanism for "search box appears only when JS": element hidden from no-js core (structure exists + client JS reveals) — and whether the widget is generated into every page or only emits a shared asset.
5. **Frontmatter indexing contract with 04.** What exactly gets indexed when frontmatter valid: raw block, parsed field values, whole `title`? Decide now so 04's "valid vs malformed" answer and §8's fields align (raw YAML vs parsed values both permissible per §8; pick the deterministic one).
6. **"Search unavailable" render policy.** Where the widget detects a missing index and what exactly it shows — without console errors — and whether dev emits the index (13) so dev-only serving is covered.