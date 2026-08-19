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