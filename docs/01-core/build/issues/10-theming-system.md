---
title: "10 — Theming system"
---

# 10 — Theming system

**Requirement source:** [fea-docs v2 PRD](../../prd/prd.md) §9, §10

**What to build:** On top of the default theme (ticket 03) and the config/option machinery (ticket 09), add the theming system: light/dark capability with the preference read from the system, and a `theme` option (both flag and config entry) that overrides the default by pointing at either a local or a remote theme. This changes appearance over the established DOM/CSS contract rather than the structure itself.

**Blocked by:** 03 — Default theme & HTML shell; 09 — Config file & option surface

**Status:** ready-for-agent

- [ ] Default theme is light/dark capable, preference read from the system
- [ ] `theme` option overrides to a local theme
- [ ] `theme` option overrides to a remote theme
- [ ] Theme override changes appearance over the existing DOM/CSS contract (structure unchanged)

## Requirements & constraints

**Theming — PRD §10**
- Ships a **default theme** that is **responsive and works well on mobile by default**.
- The theme is **light/dark capable**, with the preference read from the system.
- The theme is **overridable** via the `theme` option (both a CLI flag and a config entry, per §9), pointing at **either a local or a remote** theme.
- Overrides **change appearance over the established DOM/CSS contract** (ticket 03), never the structure itself; no JS is added to core rendering/navigation (PRD §7).

**Boundaries**
- 03 fixes the shell contract + base responsive styles; this ticket layers look-and-feel on it (structure unchanged).
- 09 provides `theme` as a flag + config entry (precedence flag > config > default); this ticket consumes the merged option.
- Themes exist alongside the shell contract: `theme` selects the CSS, not modified markup.

## Open decisions

1. **Theme representation.** Is a theme a single CSS asset, a directory of assets (CSS + optional fonts/images), or a named set with variables? Because 10 must not restructure DOM, *rec:* themes are pure CSS (custom properties + token files) against 03's stable class contract.
2. **Light/dark mechanism.** Preference read from the system → client-side `prefers-color-scheme` CSS is the natural no-JS route. Decide whether the light/dark switch rides inside the default theme's CSS (media query per scheme) and whether users can force a scheme per remote/local theme.
3. **Remote theme mechanics.** Fetch at build time from a URL (deterministic per PRD §12 — state = whatever is fetched that run): copy into the emitted assets; failure policy (deterministic fallback to default + warning, or hard failure?); HTTP caching/headers; CI-accountable (13 may smoke-test a config-bearing build).
4. **Local theme mechanics.** A local path to CSS (relative to execution dir) copied into the output — decide whether the local theme still resolves `base` (ticket 09) correctly under a subpath.
5. **Who does the swapping.** Whether `theme` replaces the whole default stylesheet or layers over it (theme token set vs full drop-in file). This decides the future-author story and whether remote/default can coexist.
6. **File/URL contract.** Theme asset naming in output (e.g. `assets/theme.css` fixed vs themed filename) so 07's asset copy + 09's base prefixing and 10 all converge on one stable contract; and whether remote themes are allowed to embed more than CSS (fonts, JS) — and a policy on that.