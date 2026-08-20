---
title: "04 — Frontmatter box & title resolution"
---

# 04 — Frontmatter box & title resolution

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §4, §11

**What to build:** Frontmatter is never required. When present, it renders as a collapsed-by-default box (the structure from ticket 03), showing the raw block; its `title` value feeds the page `<title>` precedence chain (frontmatter `title` → first H1 → filename), and the raw-block display intentionally duplicates the title. Malformed frontmatter degrades gracefully: it renders as a plain code block instead of a parsed box, the page title falls back through the chain, and a warning is emitted.

**Blocked by:** 03 — Default theme & HTML shell

**Status:** ready-for-agent

- [ ] Files without frontmatter render normally
- [ ] Valid frontmatter renders as a collapsed-by-default box showing the raw block
- [ ] `title` participates in the `<title>` precedence: frontmatter `title` → first H1 → filename
- [ ] Malformed frontmatter renders as a plain code block (not a parsed box) and emits a warning
- [ ] Malformed frontmatter's page title falls back through the chain (H1 → filename)
- [ ] Frontmatter `title` duplication with the box is intended (no de-duplication required)

**Blocks:** 11 (search — valid-frontmatter indexing rides on frontmatter handling)

## Requirements & constraints

**Documents & titles — PRD §4**
- Frontmatter is **never required**; files without it render normally.
- When present, frontmatter is **ignored by rendering except `title`**; everything else is display-only raw block.
- The raw block renders as a **collapsed-by-default box**; duplication with the page title (when `title` is present) is intended — no de-duplication.
- **`<title>` precedence:** frontmatter `title` → first H1 → filename. Ticket 02 implements the H1 → filename tail; 04 inserts the frontmatter step on top of a stable seam (do not re-do 02's resolution).
- **Nav entry is the filename, not the title** — frontmatter `title` never leaks into navigation (PRD §4).
- `title` only feeds the page `<title>`.

**Failsafe — PRD §11 (malformed frontmatter)**
- Malformed frontmatter **renders as a plain code block** (not a collapsed box), the page title falls back through the chain (H1 → filename), and a warning is emitted; it is also **excluded from the search index** (PRD §11, §8). The index exclusion matters to ticket 11.

**Discovery — PRD §9**
- Frontmatter lives in a fixed position at the top of the file; the collapsed-box mechanism is ticket 03's disclosure contract (a `<details>`-style structure).

## Open decisions

1. **Frontmatter parsing approach.** Hand-rolled top-of-file splitter + minimal YAML/JSON value extraction vs a YAML library dependency. Only `title` is read, so the parser can be small — but it must judge “valid vs malformed” consistently (that judgment also gates search indexing in 11). *Rec:* parse the raw block only enough to read `title`, with a clear definition of malformed; avoid an unneeded YAML dependency.
2. **Where title resolution lives.** A shared title-resolution helper used by 02's H1 → filename tail and 04's frontmatter step, so the chain is one function in one module (and 11 can reuse it for deduplication/display). Decide its module and interface.
3. **Title extraction must not see the frontmatter box.** The “first H1” is the first H1 of *document content* — a frontmatter block containing `#`-lines must not count. Extraction should happen at the parse/AST stage (frontmatter peeled first), not by scanning rendered HTML.
4. **Malformed definition.** What exactly counts as malformed: unparsable YAML, valid-YAML-but-not-an-object, missing `title`, non-string `title`? Each path degrades to the same code-block fallback, but the boundary affects warning text and search-index exclusion. Decide the rule table now so 11 and 12 align.
5. **Title extraction origin.** Is `title` an unquoted YAML string (`title: Foo`) only, or also a quoted/typed value, and how are special chars escaped into the HTML `<title>`? (Sanitization: escape; the PRD trust model does not apply to text *we* generate.)