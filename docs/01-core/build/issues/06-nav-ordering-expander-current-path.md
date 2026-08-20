---
title: "06 — Nav ordering, expander & current-path"
---

# 06 — Nav ordering, expander & current-path

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §5, §7

**What to build:** The file-browser navigation applies a deterministic ordering and the expander behavior defined on the ticket-03 shell. Ordering per group: files first, directories second; `index` first if present, `README` second if present, then all other files ordered alphanumerically with numbers before letters; directories follow files, likewise alphanumeric with numbers before letters. Every directory (including the root, which behaves like any other group) is an expander-only node — its label expands/collapses and never navigates; there is no directory landing-page link. All directories are collapsed by default except the path to the currently rendered document (its ancestors plus itself), which is open and rendered server-side with no JS.

**Blocked by:** 03 — Default theme & HTML shell (explicitly: built on the shell's expander mechanism)

**Status:** ready-for-agent

- [ ] Ordering per group: files first, dirs second; `index` 1st, `README` 2nd; alphanumeric, numbers before letters
- [ ] Directories (root included) are expander-only — label toggles open/closed, never a page link
- [ ] `index`/`README` appear as ordinary file entries (not merged into the directory, not hidden)
- [ ] All directories collapsed by default except the current document's path (ancestors + itself), rendered server-side
- [ ] Navigation and expand/collapse work with JavaScript disabled

## Requirements & constraints

**Navigation — PRD §5 (whole)**
- The site's nav is a **file-browser tree** derived from the directory structure, **filenames as nav entries**.
- **Ordering (deterministic, per group):**
  1. files first, directories second
  2. `index` first within a group, if present
  3. `README` second, if present
  4. remaining files ordered alphanumerically, **numbers before letters**
  5. directories follow files, likewise alphanumeric, numbers before letters
- **`index`/`README` are ordinary file nav entries** — never merged into the directory node, never hidden. This includes the root: a root `index.md` and a directory `index.md` behave identically; `index` is never a directory's landing proxy and **produces no directory nav link at any level**.
- **Every directory (incl. the root) is an expander-only node**: its label toggles open/closed and **never navigates**; a full-width row keeps it a good mobile touch target (PRD §5); **no directory is ever a page link**.
- **Default state**: all directories collapsed **except the path to the currently rendered document** (ancestors + itself), which is open — rendered **server-side, no JS** (PRD §5).
- Collapse/expand mechanism is ticket 03's disclosure contract; **core nav works without JS** (PRD §7).

**Boundary:**
- 03 fixes the markup/disclosure mechanism; 06 computes per-group **order** and **open/closed state** producing them into the usable contract — two tickets must not define two tree shapes.
- Ticket 02 decision 5 (graph → tree data model) feeds 03+06.

## Open decisions

1. **Where ordering lives.** A pure, unit-testable **ordering/comparator module** (rec) separate from the markup layer, so tests cover sorting without HTML, and the shell (03) consumes order from it. Decide module/interface now.
2. **Canonical sort semantics.** “alphanumeric, numbers before letters”: define the exact comparator — byte-order (what the content graph uses today) vs a natural sort (e.g. `a2` < `a10`) with numbers before letters within a group. Determinism per CONVENTIONS.md requires a single host comparator reused by nav and anywhere else (asset naming etc.).
3. **Group position of the root.** Root is described as a group like any other — decide whether the root itself renders as a sibling “expander” `<details>` group or as the top-level `<ul>`; both must keep it never-navigating.
4. **Current-path open state computation.** Server-side computation of ancestors+self in 06, vs 03's contract already carrying an `open`-boolean-producing server pass. *Rec:* 03's contract takes a computed state (per ticket 03 decision 7); 06 owns the compute. Decide how it flows into the shell — per-page emit (no global JS state).
5. **Non-ASCII / case ordering.** “Numbers before letters” for non-ASCII slugs (e.g. `ä`, `ü`) — collation vs byte order. The exact comparator matters for deterministic nav; pick one and record it once.
6. **Current-page visual marker (beyond expander state).** The path is open; is the current document also highlighted server-side (`aria-current`)? PRD §5 doesn't demand it but nav scannability does; decide if this ticket adds a marker (it is adjacent machinery).