---
title: 'Obsidian Release Notes'
---

# Obsidian Publishing Release Notes

The Obsidian-compatible publishing flow is a constrained static-site pipeline, not full Obsidian parity. Obsidian remains an optional local editor. Publishing runs through `@fea-docs/normalizer`, `@fea-docs/cli`, and the configured publishing destinations.

## Supported v1 Behavior

- Target allowlisting through frontmatter `publish` is required; nothing is public by default.
- `.md` and `.mdx` source files are discovered and normalized for a selected configured target.
- Wikilinks, aliases, heading links, block links, callouts, note embeds, heading embeds, block embeds, asset embeds, backlinks, graph data, and Pagefind inclusion metadata are supported within the documented subset.
- Normalized docs and static output are separate public artifacts and can be published to separate repo, branch, and path destinations.
- Strict mode is intended for CI and deployment gates; it fails on unresolved references, malformed metadata, privacy leaks, cross-target leaks, and build errors.

## Not Full Obsidian Parity

The pipeline does not execute Obsidian plugins and does not attempt to make Obsidian preview match deployed MDX. Dataview, Canvas, embedded search results, arbitrary plugin-rendered code blocks, and unsupported media embeds remain out of scope.

Use standard Markdown links when portability matters. Use wikilinks and embeds only where the documented normalizer behavior is acceptable.

## Privacy Model

Source privacy and generated-site privacy are different concerns. Build filtering prevents non-target content from entering normalized docs, graph data, backlinks, search reports, and static output. It does not make committed source files private.

Treat normalized docs with the same care as deployed static output. They are generated public artifacts, not internal build scratch space.

## Release Readiness Checks

- Run `fea-docs normalize --target <target> --strict` for each configured target.
- Run `fea-docs build --root .fea-docs/normalized/<target>` before publishing static output.
- Run `fea-docs publish --all --strict` when all configured destinations are ready.
- Verify graph pages include the non-visual fallback table when graph output is enabled.
- Keep `obsidian.features.graph: false` for sites that do not need graph UI; this removes the generated graph page and sidebar entry.
