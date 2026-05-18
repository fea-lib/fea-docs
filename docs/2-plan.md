---
title: "Docs App Issue Plan"
---

## Source PRD

- Local PRD: `docs/tools/docs-app.prd.md`
- Parent GitHub PRD issue: TBD (needed before creating child issues)

## Proposed Vertical Slices (Tracer Bullets)

1. **Title:** Bootstrap `start` with CWD-scoped Markdown preview
   - **Type:** AFK
   - **Blocked by:** None - can start immediately
   - **User stories covered:** 1, 2, 3, 4, 32
   - **What this slice proves:** Running `fea-docs start` from any directory launches a local Starlight preview from CWD and serves discovered Markdown files with live updates.

2. **Title:** Hierarchical navigation with robust page labeling
   - **Type:** AFK
   - **Blocked by:** #1
   - **User stories covered:** 9, 10, 11, 12, 13
   - **What this slice proves:** Sidebar mirrors directory hierarchy; `README` acts as section index; labels resolve via `title -> H1 -> filename`.

3. **Title:** Full discovery controls (ignore defaults, gitignore, custom ignore)
   - **Type:** AFK
   - **Blocked by:** #1
   - **User stories covered:** 6, 7, 8, 31
   - **What this slice proves:** Discovery includes all docs under CWD while excluding ignored/default technical paths and user-defined ignored globs.

4. **Title:** Internal/external links and image/static asset resolution in dev
   - **Type:** AFK
   - **Blocked by:** #1, #2, #3
   - **User stories covered:** 14, 15, 16, 17, 18, 19, 27
   - **What this slice proves:** External links pass through, internal links and file references resolve, images render, and dev mode uses warning-first behavior with symlinked assets.

5. **Title:** `build` command with deployable static output
   - **Type:** AFK
   - **Blocked by:** #4
   - **User stories covered:** 25, 26
   - **What this slice proves:** `fea-docs build` emits deterministic static output with copied assets suitable for deployment.

6. **Title:** Strict validation mode for CI quality gates
   - **Type:** AFK
   - **Blocked by:** #4, #5
   - **User stories covered:** 20, 21, 22, 23, 24
   - **What this slice proves:** `--strict` fails on broken internal links, unresolved assets/images, duplicate slugs, metadata failures, and MDX import resolution errors.

7. **Title:** MDX activation with local and npm component imports
   - **Type:** AFK
   - **Blocked by:** #1, #2
   - **User stories covered:** 5, 33, 34, 36
   - **What this slice proves:** `.mdx` files are discovered and rendered, with component imports from relative paths and npm packages.

8. **Title:** Opt-in framework adapters and alias import roots
   - **Type:** AFK
   - **Blocked by:** #7
   - **User stories covered:** 35, 37
   - **What this slice proves:** `--framework`/config enables React, Vue, Svelte, and Solid integrations plus alias-based component import roots.

9. **Title:** Runtime controls (config path, port precedence, open behavior)
   - **Type:** AFK
   - **Blocked by:** #1
   - **User stories covered:** 28, 29, 30
   - **What this slice proves:** `--config` is explicit-only, port precedence is deterministic, and browser auto-open is opt-in.

10. **Title:** Persistent cache/workdir acceleration between runs
    - **Type:** AFK
    - **Blocked by:** #1, #3
    - **User stories covered:** 40
    - **What this slice proves:** repeated `start`/`build` runs reuse cache safely with invalidation keyed by scope/config changes.

11. **Title:** Remote session helpers (`--tailscale-serve`, `--caffeinate`, `--expose`)
    - **Type:** AFK
    - **Blocked by:** #1
    - **User stories covered:** 42, 43, 44, 45
    - **What this slice proves:** remote-share convenience works with explicit exposure consent and platform-aware behavior for `caffeinate`.

12. **Title:** GitHub Pages bootstrap (`setup --gh-pages`)
    - **Type:** AFK
    - **Blocked by:** #5
    - **User stories covered:** 46, 47, 48
    - **What this slice proves:** command generates workflow artifacts and gives complete, actionable setup guidance for repo configuration.

13. **Title:** V1 hardening and docs (no telemetry, scale target, adoption guide)
    - **Type:** AFK
    - **Blocked by:** #6, #8, #10, #12
    - **User stories covered:** 38, 39, 41, 49, 50
    - **What this slice proves:** v1 UX is documented, telemetry is explicitly absent, and behavior is validated against the target scale envelope.

## Dependency Graph (summary)

- Foundation: #1
- Core structure: #2, #3, #9, #11
- Content correctness: #4 -> #5 -> #6
- MDX path: #7 -> #8
- Performance path: #10
- Deployment bootstrap: #12
- Final hardening: #13

## Notes for GitHub Issue Creation

- Create issues in dependency order above.
- Include a placeholder for the parent PRD issue number until assigned.
- Use acceptance criteria that verify end-to-end behavior for each slice (not internal implementation details).

## Review Questions

1. Does this granularity feel right, or should any slices be merged/split?
2. Are dependencies correct, especially around `build`/`strict`/`setup --gh-pages`?
3. Should any slice be HITL instead of AFK?
4. Do the user-story mappings align with your intent?
