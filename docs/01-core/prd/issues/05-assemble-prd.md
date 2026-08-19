---
title: "Assemble the fea-docs v2 PRD"
labels: wayfinder:task
---

Type: task
Status: resolved
Blocked by:

## Question

Once every requirement decision is resolved, compose the terminal deliverable: a concise, compact **PRD** for `fea-docs v2` capturing *constraints and requirements only* — the destination of this map.

Scope of the document:

- Requirements and constraints settled across the whole map, collected into one readable PRD (no design/implementation decisions inside; any that surfaced get logged as issues, not PRD content).
- Follows the map's "short, compact" mandate: a document a reader finishes in one sitting, with every requirement stated once.
- Lives in this repo as `projects/fea-docs/01-core/prd/prd.md` once assembled.
- Present the draft to the user for review and iterate until it reads as final.

## Answer

Assembled and finalised at **`projects/fea-docs/01-core/prd/prd.md`** — 13 sections, constraints and requirements only, reviewed and iterated with the user (including a second-model review pass). All five decision tickets (01–04) feed it; the PRD is the single-source record for fea-docs v2 requirements.

Key points: standalone npm CLI (`dev`/`build`); filename-driven file-browser nav with dirs as expanders-only and `index`/`README` as ordinary file entries; per-file MDX hybrid; progressive enhancement with JS-only search (section-anchor nav, valid-frontmatter indexed / malformed excluded); flag-or-config options with flag > config > default; conditional `base`; graceful+warn failsafe with `--strict` and a full resolution rulebook; CI-safe deterministic build; trusted-content rendering with no sanitization. See the PRD.