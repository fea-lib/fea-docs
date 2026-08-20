---
title: "03 — Default theme & HTML shell"
---

# 03 — Default theme & HTML shell

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §10

**What to build:** A default theme that is responsive and works well on mobile, delivered as an HTML/CSS contract later tickets build on. This ticket fixes the page shell, the navigation-tree markup, the collapse/expand mechanism (`<details>`/`<summary>`, JS-free by default), the frontmatter-toggle structure, and the base responsive styles. Everything that needs DOM/CSS (frontmatter box, nav expander, dev server's experienced UI) lands on this contract.

**Blocked by:** 02 — Core markdown rendering & routes

**Status:** ready-for-agent

- [ ] Default page shell defined (layout, content area, nav area)
- [ ] Navigation-tree markup defined as the single structure other tickets extend
- [ ] Collapse/expand implemented with JS-free HTML/CSS (`<details>`/`<summary>`) and usable on mobile
- [ ] Frontmatter-toggle structure (collapsed-by-default box) lands on a `<details>`-style disclosure
- [ ] Default styles are responsive and mobile-friendly out of the box
- [ ] No JavaScript required for rendering or navigation

**Blocks:** 04 (frontmatter disclosure), 06 (nav ordering/state), 10 (theming) — all build on the DOM/CSS contract fixed here.

## Requirements & constraints

**Shell contract — PRD §5, §7**
- This ticket fixes the **single nav structure**: one markup other tickets extend, repositioned responsively (that positioning is implementation detail, PRD §5).
- Directories are **expander-only nodes**: the label toggles open/closed and never navigates; a full-width row keeps it a good mobile touch target (PRD §5). *Whether* a directory is open is ticket 06 — 03 fixes the mechanism only.
- Collapse/expand default state: **works without JS** (HTML/CSS disclosure, e.g. `<details>`/`<summary>`); JS used only when it adds clear UX value (PRD §5).
- **Core (rendering + navigation) works with JavaScript disabled** (PRD §7); custom components being JS-dependent is ticket 05, outside this contract.
- The frontmatter-toggle structure (ticket 04) and the dev server's experienced UI land on this contract; ticket 03 owns the structure they inherit.

**Theming boundary — PRD §10 (with ticket 10)**
- §10 guarantees a default theme that is responsive and mobile-good by default; light/dark capability and local/remote override are ticket 10. 03 therefore ships structure + base responsive styles, and must leave appearance hooks (stable classes, structure-agnostic theming seam) intact so ticket 10 changes appearance without restructuring markup.

**Boundary with ticket 02**
- 02 emits per-page shells and a nav tree; 03 replaces/refines that output into the definitive contract. The two tickets must not maintain parallel shells.

## Open decisions

1. **Where the contract lives.** A single shell renderer module (replacing ticket-02's `site-pages.ts` scaffold) that every page passes through, vs the contract being a documented markup spec. *Rec:* one shell module under `src/publish/` that 02/04/06/08 all consume.
2. **Single disclosure mechanism.** One generic `<details>`-style disclosure underpinning both nav expanders and the frontmatter box (rec: yes — ticket 04 reuses it), or two specialized structures.
3. **CSS delivery.** Default theme emitted as an external CSS asset (name/contract e.g. `assets/theme.css`) vs inline `<style>`. *Rec:* external file so 07's asset copy, 09's `base` prefixing, and 10's local/remote theme override can target a stable path.
4. **Light/dark scaffolding in 03.** Ship CSS custom properties + `prefers-color-scheme` support now (making 10 a theme-layer change) vs leave all color decisions to 10. *Rec:* 03 ships a structural, color-light contract; 10 owns the color scheme.
5. **Responsive layout strategy.** Sidebar-at-large / collapsible-at-small (e.g. anchor to top) positioning decided here, since 06 (nav markup) and 08 (dev toolbar) build against it. Mobile: one nav structure repositioned, no JS-only UX.
6. **Tree data source.** The nav renders a derived tree data model (ticket 02 decision 5: graph → tree model) — decide now where that model lives and what shape (nested dirs, sibling file/dir ordering) so 06 implements ordering and 03 implements rendering against one shape.
7. **Accessibility/state seam.** How the server-side "current path is open" state (ticket 06) will slot into the markup — decide the `open`/`aria-current` contract so 06 only computes booleans, never markup shapes.