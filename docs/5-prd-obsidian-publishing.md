---
title: 'PRD: Obsidian Publishing'
---

# PRD: Obsidian-Like Publishing with fea-docs

## Problem Statement

Authors want to use an Obsidian-style local writing workflow while publishing a free, static, interactive documentation site through `fea-docs`. `fea-docs` is currently built on Astro, but it is the rendering and publishing integration surface for this product. The current research shows that Obsidian should not become the publishing engine and that the `fea-docs` publishing pipeline should remain the deployment path. The gap is an Obsidian-flavored content intelligence layer that prepares vault content for `fea-docs` without pretending to support every Obsidian plugin or preview behavior.

The product must support a constrained, reliable subset of Obsidian behavior through a target-aware normalization layer: wikilinks, aliases, heading links, basic embeds, callouts, backlinks, graph data, search, explicit target-based public/private filtering, safe asset handling, and strict validation. It must preserve MDX and component support because normalized documents are handed to `fea-docs` for rendering and publishing integration.

## Goals

1. Let a documentation folder be opened and edited as an Obsidian vault while still building as a `fea-docs` site.
2. Support `.md` and `.mdx` as first-class source formats.
3. Convert common Obsidian syntax into normalized Markdown or MDX before `fea-docs` renders static output.
4. Generate relationship data for backlinks and graph views without requiring a server.
5. Prevent accidental publication of private notes, private assets, and private static files by publishing nothing unless it is explicitly opted into a configured publishing target.
6. Allow one vault to publish different subsets of content to different configured targets, such as engineering, recipes, crafting, or house-and-garden.
7. Publish both the normalized docs artifact and the static output artifact to destinations configured per publishing target.
8. Preserve `fea-docs` simplicity by keeping vault discovery, target filtering, Obsidian syntax handling, and privacy validation outside the renderer.
9. Clearly define unsupported Obsidian behavior so authors do not rely on fragile or misleading compatibility.

## Non-Goals

1. Replacing Obsidian Publish.
2. Building a full Obsidian plugin runtime inside `fea-docs` or the normalization layer.
3. Supporting arbitrary Dataview queries, embedded search queries, or plugin-rendered code blocks.
4. Making Obsidian preview match deployed MDX exactly.
5. Creating a separate non-`fea-docs` docs platform.
6. Providing hard privacy for files committed to a public source repository.
7. Advanced multi-target deployment orchestration such as parallel scheduling, cross-target dependency management, aggregate rollback, or coordinated recovery after partial failure.

## Actors

1. **Author**: writes and edits notes locally, optionally in Obsidian.
2. **Publisher**: runs normalization, local preview, static builds, and target publication.
3. **Maintainer**: configures target definitions, normalization rules, `fea-docs`, CI validation, and publishing destinations.
4. **Reader**: uses the generated `fea-docs` site.

## Pipeline Architecture

1. **Authoring layer**: Authors use Obsidian, VS Code, or any text editor against a source vault containing Markdown, MDX, assets, private notes, drafts, and notes for one or more publishing targets.
2. **Normalization layer**: A target-aware publishing preparation solution scans the source vault, selects one configured publishing target, applies ignore/draft/publish filtering, resolves supported Obsidian syntax, validates privacy and links, selects assets, and emits a normalized docs tree for that target.
3. **Rendering layer**: `fea-docs` consumes the normalized docs tree and builds static output. `fea-docs` should not need to understand Obsidian vault semantics, private notes, target membership, wikilink resolution, or source-vault filtering.
4. **Publishing layer**: The publisher writes both the normalized docs artifact and the generated static output artifact to destinations configured for the selected publishing target. It can run for one selected target or iterate over all configured targets by invoking the same target-specific pipeline for each target.
5. The normalized docs artifact is treated as public generated output. It must satisfy the same target/privacy constraints as the static output.
6. The normalization layer should preserve plain `.md` files when no MDX features are needed and emit `.mdx` when the source is MDX or the normalized output requires MDX/component syntax.

## User Stories

1. As an author, I want to open the docs folder as an Obsidian vault, so that I can use a familiar note-taking UI.
2. As an author, I want `.md` and `.mdx` files to be discovered, so that Markdown notes and MDX component pages can coexist.
3. As an author, I want `[[Note]]` links to resolve in the published site, so that vault-style links work for readers.
4. As an author, I want `[[Note|Alias]]` links to render with alias text, so that natural prose can link to canonical pages.
5. As an author, I want `[[Note#Heading]]` links to resolve to page headings, so that I can link to precise sections.
6. As an author, I want unresolved wikilinks to be visible during development and fail strict builds, so that broken references are caught before publishing.
7. As an author, I want simple note embeds such as `![[Note]]` to render in pages public for the selected target, so that reusable note fragments can be included.
8. As an author, I want heading embeds such as `![[Note#Heading]]` to render the selected section where feasible, so that content can be reused at section granularity.
9. As an author, I want image and asset embeds such as `![[image.png]]` to render as normal assets, so that Obsidian-style media embeds work.
10. As an author, I want unsupported embeds to fail clearly in strict mode, so that readers do not see broken output.
11. As an author, I want Obsidian callouts such as `> [!info]` to render as `fea-docs`-compatible asides, so that note annotations preserve their meaning.
12. As an author, I want common callout types to map predictably, so that `note`, `info`, `tip`, `warning`, `danger`, `question`, and similar types look consistent.
13. As an author, I want foldable callouts to degrade safely or render as collapsible UI, so that source notes remain usable even when exact parity is not available.
14. As an author, I want nested callouts to render without corrupting page structure, so that complex notes remain readable.
15. As an author, I want to opt a page into backlinks, so that readers can discover related pages where backlinks add value.
16. As a reader, I want backlink labels to use page titles or aliases, so that relationship lists are understandable.
17. As a reader, I want a built-in graph view generated from pages public for the selected target, so that I can explore note relationships visually without adding a separate integration.
18. As a maintainer, I want graph data emitted as static JSON, so that the site stays static and deployable to GitHub Pages.
19. As a reader, I want full-text search over content public for the selected target, so that I can find pages quickly.
20. As a maintainer, I want pages to opt out of search, so that generated helper pages or sensitive target-public pages can be excluded from Pagefind.
21. As a publisher, I want explicit target-based public allowlisting as the default behavior, so that only notes intended for the selected publishing target are emitted.
22. As a publisher, I want to publish different subsets of the same vault to different configured targets, so that work content, recipes, crafting notes, and household notes can have separate sites.
23. As a maintainer, I want allowed publishing target IDs to be defined in central config, so that frontmatter cannot silently create accidental destinations.
24. As a maintainer, I want strict mode to fail on unknown or malformed publish targets, so that CI catches configuration drift.
25. As a publisher, I want notes not assigned to the current publishing target excluded from site output, navigation, search, backlinks, and graph data, so that generated output does not reveal non-target content.
26. As a publisher, I want private assets and static files excluded unless reachable from pages public for the current target or explicitly public for that target, so that attachments and other files are not leaked.
27. As a maintainer, I want strict mode to fail on private-to-public and cross-target leaks, so that CI blocks unsafe deployments.
28. As a maintainer, I want ignored paths to honor `.gitignore`, default ignores, and user config, so that existing repository hygiene rules apply.
29. As an author, I want frontmatter titles, global aliases, slugs, drafts, backlink flags, and publish targets to be understood, so that metadata controls routing and publishing.
30. As an author, I want README or index behavior to remain compatible with `fea-docs` navigation, so that directory hierarchy still drives the sidebar.
31. As an MDX author, I want ESM imports, JSX, and configured component aliases to continue working, so that interactive docs remain possible.
32. As an MDX author, I want Obsidian normalization not to break MDX syntax, so that valid MDX remains valid after normalization.
33. As a publisher, I want strict mode to fail on MDX import errors, duplicate slugs, invalid frontmatter, missing titles, missing assets, and broken internal links, so that builds are reliable.
34. As an author, I want development mode to warn instead of fail for recoverable issues, so that I can iterate quickly.
35. As a maintainer, I want a config surface for Obsidian compatibility, so that teams can choose allowed syntax, publishing targets, and strictness.
36. As a maintainer, I want clear documentation of supported and unsupported Obsidian syntax, so that authors know what to rely on.
37. As a publisher, I want GitHub Pages-compatible static output, so that publishing remains free and simple.
38. As a publisher, I want normalized docs and static output to publish to separately configured repo, branch, and path destinations, so that source snapshots and deployed sites can use different branch layouts.
39. As a publisher, I want a single command to publish all configured targets, so that routine deployment does not require manually invoking each target.
40. As a maintainer, I want automated tests for parsing, routing, target filtering, privacy filtering, normalization, publishing, and build integration, so that compatibility does not regress.

## Functional Requirements

### Source Discovery

1. The normalization layer must scan `.md` and `.mdx` files recursively from the configured source vault or docs root.
2. The normalization layer must honor `.gitignore`, a default ignore set, and user-configured ignore patterns.
3. The system must treat `.md` and `.mdx` as publishable content source files.
4. The normalization layer must also discover non-Markdown files under the configured root so they can be copied as static assets when referenced by target-public content or allowed by target-specific asset rules.
5. The normalized docs tree must preserve existing `fea-docs` routing and navigation behavior where no Obsidian-specific syntax is present.
6. The normalized docs tree must support directory-based navigation and README/index section pages.

### Metadata Model

1. The system must parse frontmatter for at least `title`, `aliases`, `slug`, `draft`, `publish`, `backlinks`, and `pagefind`.
2. The system must derive a title from frontmatter, first H1, or filename according to the existing `fea-docs` fallback order.
3. The system must support frontmatter `aliases` as global vault-wide alternate link targets for wikilink resolution.
4. The system must track headings and generated heading anchors for heading-level links.
5. The system should track tags when present in frontmatter or Markdown text for future graph/search facets.
6. The system must track Obsidian block IDs when present and support links or embeds that target explicit block IDs.

### Publishing Targets and Public/Private Filtering

1. The system must publish nothing by default.
2. The system must support centrally configured publishing targets with stable target IDs such as `engineering`, `recipes`, `crafting`, or `house-and-garden`.
3. The system must support building, serving, and publishing one selected publishing target at a time.
4. The system should support publishing all configured targets by iterating over the target-specific normalization, build, and publish workflow for each configured target.
5. The system must support explicit target allowlisting with frontmatter `publish` values that name one or more configured targets.
6. The system must support a single target string, such as `publish: engineering`, and a YAML target list, such as `publish: [engineering, recipes]`.
7. The system should support frontmatter `publish: false` as an explicit non-public marker for Obsidian Publish compatibility and clearer author intent.
8. The system may support `publish: true` only as a documented shorthand for a configured default target; if no default target is configured, `publish: true` must produce a diagnostic.
9. The system must reject or warn on unknown publish target IDs instead of treating them as public destinations.
10. A page is public only for publishing targets listed in its `publish` frontmatter and configured centrally; for all other targets, the page is non-public.
11. The system must support excluding pages with `draft: true` from production builds.
12. The system must define the precedence between `publish`, configured targets, `draft`, ignore patterns, and build mode.
13. Ignore patterns must win first, then `draft: true` in production, then explicit membership in the selected configured publishing target; absent target membership means non-public for that build.
14. The system must exclude pages outside the selected target from normalized docs and rendered static output.
15. The system must exclude pages outside the selected target from navigation, backlinks, graph data, and search indexes.
16. The system must detect links from pages public for the selected target to private pages or pages assigned only to other targets.
17. In strict mode, public-to-private and cross-target page links must fail the build.
18. In development mode, public-to-private and cross-target page links must produce clear warnings.
19. The system must document that source privacy is separate from generated-site privacy.

### Normalized Docs Artifact

1. The normalization layer must emit a target-specific normalized docs tree before `fea-docs` rendering begins.
2. The normalized docs tree must contain only pages and assets allowed for the selected publishing target.
3. The normalized docs tree must preserve plain `.md` files when no MDX syntax is needed.
4. The normalized docs tree must emit `.mdx` when the source file is MDX or when transformed output requires MDX/component syntax.
5. The normalization layer must only transform `.md` and `.mdx` source files; other file types must be copied unchanged when included in the normalized docs tree.
6. Copied non-Markdown files must preserve their relative paths from the configured root unless target config explicitly remaps them.
7. The normalized docs tree must include any generated data files needed by `fea-docs`, backlinks, graph views, or search behavior.
8. The normalized docs tree must include a manifest that maps source files to normalized output files and records target ID, routes, included assets, copied static files, generated data files, and diagnostics summary.
9. The normalized docs tree is public generated output and must not include private or cross-target content.
10. `fea-docs` must consume the normalized docs tree as its input for preview and static builds.
11. `fea-docs` must not be responsible for resolving Obsidian syntax, source-vault filtering, publishing target membership, or private-content exclusion.

### Wikilinks

1. The system must recognize `[[Note]]` wikilinks in Markdown and MDX prose.
2. The system must recognize `[[Note|Alias]]` wikilinks and render alias text.
3. The system must recognize `[[Note#Heading]]` wikilinks and resolve them to heading anchors.
4. The system must recognize `[[Note#Heading|Alias]]` links.
5. The system must recognize `[[Note#^block-id]]` wikilinks and resolve them to explicit block anchors.
6. The system must resolve wikilinks by canonical path, page title, and global frontmatter aliases.
7. The system must treat pipe aliases such as `[[Note|Alias]]` as per-link display text, not as global alias definitions.
8. The normalization layer must handle URL generation using `fea-docs` route rules.
9. The normalization layer must avoid transforming wikilink-like text inside fenced code blocks, inline code, MDX JSX expressions, or import/export statements.
10. The system must produce diagnostics for ambiguous wikilink targets.
11. In strict mode, unresolved or ambiguous wikilinks on pages public for the selected target must fail the build.

### Embeds and Transclusion

1. The system must recognize note embeds using `![[Note]]`.
2. The system must recognize heading embeds using `![[Note#Heading]]`.
3. The system must recognize asset embeds using `![[asset.ext]]` for supported image and media assets.
4. The system must render simple note embeds as safe, clearly bounded embedded content.
5. The system must prevent recursive embed loops and report them.
6. The system must respect target-based public/private filtering for embedded notes and assets.
7. In strict mode, unresolved embeds, private embed leaks, and cross-target embed leaks must fail the build.
8. The system must recognize block embeds using `![[Note#^block-id]]` and render the targeted block when the block exists in a note public for the selected target.
9. The system must preserve stable block anchors for explicit `^block-id` markers in target-public content.

### Callouts

1. The system must recognize Obsidian callout syntax beginning with `> [!type]`.
2. The system must map common Obsidian callout types to `fea-docs` asides or equivalent accessible components.
3. The system must preserve custom callout titles where provided.
4. The system must preserve callout body Markdown.
5. The system should support nested callouts without breaking blockquote parsing.
6. The system should support foldable callout indicators by rendering an accessible details/summary UI or by documented graceful degradation.
7. Unknown callout types must render safely with a default style and diagnostic metadata.

### Backlinks

1. The normalization layer must build a link graph from Markdown links, wikilinks, and supported embeds.
2. The normalization layer must generate backlink data for each page public for the selected publishing target from inbound references that are also public for that target.
3. Backlink output must exclude private source pages, pages assigned only to other targets, and private-only references.
4. Backlink entries must include source page title, route, and optional excerpt or context when feasible.
5. Backlinks must render only when opted in globally or per page.
6. Per-page backlink opt-in must use frontmatter `backlinks: true` rather than custom Markdown syntax.
7. The system may also provide an explicit `fea-docs`/MDX component for advanced placement, but frontmatter is the primary author-facing control.
8. Documentation must explain that Obsidian itself exposes backlinks through app/plugin UI and an optional in-document display setting, not through portable Markdown syntax.

### Graph Data

1. The normalization layer must emit static graph data for pages public for the selected publishing target.
2. Graph nodes must include at least page ID, title, route, and optional tags.
3. Graph edges must include source, target, and edge type where known.
4. Graph data must exclude pages outside the selected publishing target, private assets, private static files, and unresolved targets.
5. The system must include a built-in client-side graph view as part of the base product.
6. The built-in graph view must require no separate integration package.
7. The graph UI must avoid increasing baseline page weight for pages where the graph is not shown.

### Search

1. The normalized docs tree and `fea-docs` build must support Pagefind full-text search.
2. The normalization layer must ensure only pages public for the selected publishing target are available for indexing.
3. The system must honor `pagefind: false` or equivalent search exclusion metadata.
4. The system must ensure embedded private or cross-target content cannot enter the search index.

### Asset Handling

1. The normalization layer must resolve Markdown image links, Markdown links to non-Markdown files, MDX asset imports, MDX references to files under the configured root, and supported Obsidian asset embeds.
2. The normalization layer must preserve `fea-docs` support for referencing arbitrary non-Markdown files from within the configured root.
3. The normalization layer must copy referenced non-Markdown files unchanged into the normalized docs tree when they are allowed for the selected publishing target.
4. The normalization layer must copy or reference only assets and static files needed by pages public for the selected publishing target or explicitly configured public asset directories for that target.
5. The system must fail strict builds on unresolved assets or static files referenced by pages public for the selected target.
6. The system must fail strict builds when pages public for the selected target reference private or cross-target assets or static files.
7. The system must avoid emitting arbitrary non-Markdown files from ignored, private, or cross-target paths.

### MDX and Component Compatibility

1. The normalized docs tree and `fea-docs` build must preserve existing `fea-docs` MDX support.
2. The system must preserve configured framework integrations such as React.
3. The system must preserve configured import aliases.
4. Obsidian syntax normalization must run in a way that does not corrupt MDX ESM, JSX, expressions, or component imports.
5. MDX compilation errors from `fea-docs` must remain visible and must fail strict builds.

### Validation and Diagnostics

1. Development mode must favor warnings for recoverable content issues.
2. Strict mode must fail on unresolved links, embeds, or assets referenced by pages public for the selected target, duplicate routes/slugs, invalid frontmatter, unknown publish targets, missing title fallback, MDX import errors, ambiguous wikilinks, embed cycles, privacy leaks, and cross-target leaks.
3. Diagnostics must include source file, location where feasible, issue code, severity, and suggested fix.
4. The system must provide a summary of warnings and errors at the end of build/start output.
5. The system should support machine-readable diagnostics for CI or editor integrations.

### Configuration

1. The system must expose an optional Obsidian compatibility config section.
2. The config must allow enabling or disabling wikilinks, callouts, embeds, backlinks, graph output, and explicit target-based publish allowlisting.
3. The config must allow defining publishing targets, a selected/default target, optional target-specific output or site settings, public roots, ignored paths, public asset directories, normalized docs destinations, static output destinations, and strictness behavior.
4. Defaults must be safe: no content is public unless explicitly assigned to a configured publishing target or included through a deliberate future public-root configuration.
5. Defaults must be simple: existing non-Obsidian `fea-docs` usage should continue with minimal config when Obsidian compatibility is not enabled.
6. Each publishing target may define separate repo, branch, and path settings for normalized docs and static output.

### Authoring UX

1. The system must document that Obsidian is an optional editor, not the publishing compiler.
2. The system must document recommended Obsidian settings and plugins for `.mdx` editing.
3. The system must recommend standard Markdown links where possible for portability.
4. The system must provide examples for wikilinks, aliases, callouts, embeds, publishing target frontmatter, and MDX components.
5. The system must document unsupported Obsidian features and their expected diagnostics.

### Deployment

1. The system must produce a normalized docs artifact and static output compatible with GitHub Pages-style static hosting.
2. The system must require no runtime server for links, backlinks, graph data, or search.
3. The system must remain compatible with `fea-docs start`, `fea-docs build`, and `fea-docs setup --gh-pages` concepts after normalization.
4. The publishing layer must be able to publish normalized docs and static output to separate configured destinations.
5. Each destination must support at least repo, branch, and path configuration.
6. The publishing layer should support a publish-all mode that iterates over all configured publishing targets using the same target-specific normalization, build, and publish workflow.
7. Publish-all mode may run sequentially in the first version and must report per-target success or failure.
8. Publish-all mode is not required to provide aggregate rollback or coordinated recovery after partial failure.

## Non-Functional Requirements

### Privacy and Security

1. Generated output, including normalized docs and static output, must not include pages outside the selected publishing target, private-only graph nodes, private-only backlinks, private search content, private assets, or private static files.
2. Strict mode must block known private-content and cross-target leaks.
3. The system must not execute arbitrary Obsidian plugin code.
4. The system must not execute arbitrary note content during parsing beyond normal MDX compilation rules.
5. The documentation must warn that committing private files to a public repository makes them public regardless of build filtering.
6. The documentation must warn that normalized docs are published artifacts and must be treated with the same care as static output.

### Correctness

1. Link resolution must be deterministic.
2. Ambiguous aliases or titles must be reported instead of resolved silently.
3. Route generation must match `fea-docs` output.
4. Normalization must preserve source intent for supported syntax.
5. Unsupported syntax must degrade clearly or fail with actionable diagnostics.

### Performance

1. Local dev startup must remain fast for small and medium documentation sets.
2. Incremental rebuilds should reuse cached discovery and graph data where feasible.
3. Full builds should scale to thousands of notes without quadratic link-resolution behavior.
4. Optional graph UI code must not load on every page unless enabled and needed.
5. Search indexing must not process private, cross-target, or ignored content.

### Reliability

1. Normalized docs and static build output must be reproducible from the same source tree and config.
2. Strict mode must be suitable for CI.
3. Diagnostics must be stable enough for documentation and tests.
4. Failure modes must leave no partially published private or cross-target assets or static files in normalized docs, static output, or configured destination branches.

### Maintainability

1. Parsing, resolution, target filtering, privacy filtering, normalization, rendering integration, and publishing should be separated into testable modules.
2. The public configuration API should remain small and stable.
3. Obsidian compatibility should be implemented in the normalization layer rather than as a fork of `fea-docs` behavior.
4. Obsidian syntax normalization must be implemented as a dedicated isolated module with a clear input/output contract.
5. The syntax normalization module should be extensible so additional source syntaxes can be supported alongside Obsidian syntax without rewriting target filtering, rendering integration, or publishing.
6. The syntax normalization module should be reusable outside the static publishing pipeline, including future editor integrations such as a VS Code extension that previews, validates, or assists with the supported authoring syntax.
7. Tests should focus on observable behavior rather than internal implementation details.

### Accessibility

1. Callouts, backlinks, and graph controls must be keyboard navigable where interactive.
2. Collapsible callouts must use accessible semantics.
3. Graph visualization must have a non-visual fallback such as a link list or table.
4. Generated links must have readable text.

### Compatibility

1. The system must support current `fea-docs` Markdown and MDX behavior.
2. The system must not require paid Obsidian Publish.
3. The system must work in a static hosting environment.
4. The system should remain usable when authors do not use Obsidian at all.
5. Alias resolution should follow Obsidian's vault-wide mental model: aliases are global alternate note names, and duplicate aliases require disambiguation rather than silent local scoping.

## Implementation Decisions

1. The product is split into authoring, normalization, rendering, and publishing layers.
2. Obsidian is treated as an optional local editor.
3. The normalization layer is the build-time content intelligence layer: discovery, metadata extraction, graph construction, target filtering, privacy filtering, syntax normalization, asset selection, and diagnostics.
4. The initial supported Obsidian subset is wikilinks, global aliases, heading links, block links, common callouts, simple note embeds, heading embeds, block embeds, asset embeds, backlinks, graph data, and target-based public/private filtering.
5. Full Dataview, arbitrary Obsidian plugin rendering, and embedded search results are out of scope unless later reintroduced through separate PRDs.
6. Public output must use explicit target allowlisting by default; absent membership in the selected configured publishing target means non-public for that build.
7. Strict mode is the gate for deployment correctness and privacy safety.
8. Development mode prioritizes iteration and should provide actionable warnings.
9. Backlinks are a base capability but are rendered only when opted in globally or with per-page frontmatter `backlinks: true`.
10. The graph view ships as part of the base product.
11. Global aliases match Obsidian's vault-wide model; ambiguous aliases fail strict validation.
12. `fea-docs` consumes normalized Markdown/MDX and remains responsible for rendering static output, not source-vault semantics.
13. Normalized docs and static output are both publishable artifacts with independently configurable repo, branch, and path destinations per target.
14. Obsidian syntax normalization is a reusable engine module with a stable contract, not a one-off transform embedded in the publisher or `fea-docs` integration.

## Acceptance Criteria

1. A sample source vault containing `.md`, `.mdx`, wikilinks, aliases, callouts, embeds, target-specific public/private notes, and assets can be normalized for at least two configured publishing targets.
2. Each normalized sample docs tree can be served locally through `fea-docs` and built to static output compatible with GitHub Pages-style hosting.
3. Wikilinks on pages public for the selected target resolve to correct routes and anchors.
4. Callouts on pages public for the selected target render as accessible `fea-docs`-compatible UI.
5. Simple, heading, block, and asset embeds on pages public for the selected target render or fail with documented diagnostics.
6. Backlinks render for inbound links public to the selected target only and only where opted in.
7. Static graph data and the built-in graph view contain nodes and edges public to the selected target only.
8. Search indexes searchable pages public to the selected target only.
9. Strict mode fails on unresolved links, missing assets, duplicate routes, invalid frontmatter, unknown publish targets, MDX import errors, ambiguous wikilinks, embed cycles, private-content leaks, and cross-target leaks.
10. Normalized docs and static output can be published to separate configured repo, branch, and path destinations for the selected target.
11. Publish-all mode can publish every configured target by reusing the target-specific pipeline and reporting per-target success or failure.
12. Documentation clearly states supported syntax, unsupported syntax, Obsidian authoring limits, source privacy limits, and normalized-docs privacy limits.

## Testing Decisions

1. Unit tests should cover parsing of wikilinks, embeds, callouts, frontmatter, global aliases, headings, and block IDs.
2. Unit tests should cover deterministic route and target resolution, including ambiguous targets.
3. Unit tests should cover target filtering, privacy filtering, and asset inclusion rules.
4. Integration tests should normalize sample vaults, build normalized docs with `fea-docs`, and inspect generated routes, HTML, graph JSON, search inclusion, publishing artifacts, and diagnostics.
5. MDX compatibility tests should include imports, JSX, expressions, and Obsidian-like text in code blocks.
6. Accessibility tests should cover callouts, backlink sections, collapsible UI, and graph fallbacks.
7. Regression fixtures should include unsupported syntax to verify diagnostics remain clear.

## Resolved Product Decisions

1. **Default publication**: Nothing is published by default. A page must opt into one or more centrally configured publishing targets through frontmatter `publish`, such as `publish: engineering` or `publish: [engineering, recipes]`. This preserves the safe allowlist direction from the research while supporting one Obsidian-style vault that publishes different content subsets to different destinations. `publish: false` remains an explicit non-public marker. `publish: true` is allowed only as a documented shorthand for a configured default target; otherwise it must warn in development or fail strict validation.
2. **Backlink display**: Backlinks are a base capability but are rendered only when opted in globally or per page. Per-page opt-in uses frontmatter `backlinks: true`; custom Markdown syntax is avoided because Obsidian exposes backlinks through app/plugin UI and settings rather than portable Markdown syntax.
3. **Graph view**: Graph visualization ships as part of the base product, backed by static graph data for the selected publishing target. It must not require a separate integration and must not add page weight where the graph is not shown.
4. **Block references**: Explicit block IDs and block targets are in scope. The system must preserve `^block-id` anchors and support `[[Note#^block-id]]` and `![[Note#^block-id]]` for target-public content.
5. **Aliases**: Aliases are global across the docs vault by default, matching Obsidian's vault-wide note-linking model. Frontmatter `aliases` define global alternate note names; pipe syntax defines per-link display text. Duplicate aliases are ambiguous and must warn in development or fail strict validation.


---

# Implementation Plan: Obsidian-Like Publishing with fea-docs

> Source PRD: `docs/research/obsidian-mdx-starlight-publishing/3-prd.md`

## Architectural Decisions

1. **Layered pipeline**: The product is implemented as authoring source vault → `@fea-docs/normalizer` → `@fea-docs/cli` rendering layer → publishing layer.
2. **Authoring model**: Obsidian is an optional editor over the source vault, not the compiler or source of truth.
3. **Package namespace**: The existing `fea-docs` package will move under the npm organization scope as `@fea-docs/cli`, and the repository will become a simple pnpm workspace monorepo for related public packages.
4. **Normalization layer**: `@fea-docs/normalizer` provides the Obsidian compatibility and publishing preparation layer around discovery, metadata extraction, content graph construction, route resolution, target filtering, privacy filtering, Markdown/MDX normalization, asset selection, and diagnostics.
5. **Rendering layer**: `@fea-docs/cli` consumes normalized Markdown/MDX and assets. It should not own Obsidian syntax resolution, source-vault filtering, publishing target membership, or private-content exclusion.
6. **Publishing layer**: Publish both normalized docs and static output artifacts to destinations configured per publishing target. A publish-all mode may iterate over configured targets by reusing the same target-specific pipeline. Publishing starts as an internal module unless the API stabilizes enough to publish `@fea-docs/publisher`.
7. **Content formats**: `.md` and `.mdx` remain first-class source formats. Normalized output preserves `.md` when possible and emits `.mdx` when the source or normalized content requires MDX/component syntax.
8. **Target model**: Nothing is published by default. Pages must opt into one or more centrally configured targets with frontmatter such as `publish: engineering` or `publish: [engineering, recipes]`.
9. **Privacy model**: Generated-output privacy is enforced at normalization and build time; source privacy is the user's repository responsibility. Normalized docs are public generated artifacts and must satisfy the same target/privacy constraints as static output.
10. **Strictness model**: Development mode warns where possible. Strict mode fails on content correctness, MDX, target configuration, and privacy errors.
11. **Static data**: Backlinks and graph data are generated by `@fea-docs/normalizer` and emitted as static data. No server runtime is required.
12. **Compatibility boundary**: Wikilinks, global aliases, heading links, block links, common callouts, simple note embeds, heading embeds, block embeds, asset embeds, backlinks, graph data, and target-based public/private filtering are in scope. Dataview, arbitrary Obsidian plugins, and embedded search results are out of scope for the first complete version.
13. **Backlink display**: Backlinks are generated as a base capability but rendered only when enabled globally or with per-page frontmatter `backlinks: true`.
14. **Graph view**: Graph visualization ships in the base product using static target-public graph data while avoiding added page weight where graph UI is not shown.
15. **Alias scope**: Frontmatter aliases are global across the vault by default. Duplicate aliases are ambiguous and must produce diagnostics.
16. **Syntax normalization engine**: `@fea-docs/syntax-engine` is an isolated module with a stable input/output contract, so additional authoring syntaxes can be added later and the same engine can be reused by future tooling such as a VS Code extension.
17. **Obsidian syntax handlers**: `@fea-docs/obsidian` provides Obsidian-specific handlers for wikilinks, callouts, embeds, block references, and related diagnostics.

## Public Package Overview

| Package | Public v1 | Responsibility |
|---|---:|---|
| `@fea-docs/cli` | Yes | Renamed existing `fea-docs` CLI; user-facing commands for `start`, `build`, `normalize`, `audit`, `publish`, and `publish --all`. |
| `@fea-docs/normalizer` | Yes | Discovery, metadata indexing, target filtering, privacy validation, route resolution, normalized docs tree generation, static-file copying, generated data files, and manifest emission. |
| `@fea-docs/syntax-engine` | Yes | Generic syntax normalization engine with handler registration, diagnostics, and reusable editor-tool boundaries. |
| `@fea-docs/obsidian` | Yes | Obsidian-specific syntax handlers for wikilinks, callouts, embeds, block IDs, block links, block embeds, and asset embeds. |
| `@fea-docs/schema` | Yes | Shared TypeScript types and schemas for manifests, diagnostics, graph data, backlinks, search reports, and publish summaries. |
| `@fea-docs/publisher` | No, internal first | Repo, branch, path publishing utilities and publish-all orchestration. Publish later only if the API stabilizes. |
| `@fea-docs/vscode` | Later | Future editor integration built on `@fea-docs/syntax-engine` and `@fea-docs/obsidian`; not part of v1. |

## Artifact Names

| Artifact | File name |
|---|---|
| Normalized docs manifest | `fea-docs.manifest.json` |
| Diagnostics output | `fea-docs.diagnostics.json` |
| Graph data | `fea-docs.graph.json` |
| Backlinks data | `fea-docs.backlinks.json` |
| Search inclusion report | `fea-docs.search.json` |
| Publish summary | `fea-docs.publish.json` |
| Repository POC audit report | `poc-vault-audit.md` |
| Step 1 Markdown/MDX boundary review | `markdown-mdx-boundary-review.md` |

## CLI Command Names

1. `fea-docs start`: serve normalized docs with `@fea-docs/cli`.
2. `fea-docs build`: build normalized docs with `@fea-docs/cli`.
3. `fea-docs normalize --target <target>`: normalize one configured target.
4. `fea-docs audit`: audit the repository POC for missing coverage and emit `poc-vault-audit.md`.
5. `fea-docs publish --target <target>`: normalize, build, and publish one target.
6. `fea-docs publish --all`: run the target-specific publish pipeline for every configured target.

## Phase 0: pnpm Monorepo and npm Package Preparation

**Status**: Complete. Implemented in `cee3c58` by migrating the repository to a pnpm workspace, moving the CLI into `packages/cli`, and scaffolding the initial public package set.

### What to Build

Turn the `fea-docs` repository into a simple pnpm workspace monorepo, rename the existing package to `@fea-docs/cli`, and scaffold the public package layout for the normalization, syntax, Obsidian, and schema packages.

### Acceptance Criteria

- [x] The repository has a minimal `pnpm-workspace.yaml`.
- [x] The existing `fea-docs` package is renamed to `@fea-docs/cli`.
- [x] `@fea-docs/cli` can be published publicly under the `@fea-docs` npm organization scope.
- [x] Workspace packages are scaffolded for `@fea-docs/normalizer`, `@fea-docs/syntax-engine`, `@fea-docs/obsidian`, and `@fea-docs/schema`.
- [x] `@fea-docs/schema` defines initial TypeScript types for `fea-docs.manifest.json`, `fea-docs.diagnostics.json`, `fea-docs.graph.json`, `fea-docs.backlinks.json`, `fea-docs.search.json`, and `fea-docs.publish.json`.
- [x] Package exports are defined for each scaffolded public package.
- [x] Workspace-local dependency references are used between packages during development.
- [x] Existing `fea-docs` CLI commands continue to work after the package rename.
- [x] Documentation explains the package rename from `fea-docs` to `@fea-docs/cli` and the intended package responsibilities.

## Markdown-First Normalization Targets

`@fea-docs/normalizer` should emit Markdown-only output whenever feasible. It should emit MDX only when the source is already MDX or when the target behavior cannot be represented safely and accessibly with Markdown plus `@fea-docs/cli` built-ins.

## Two-Step Delivery Strategy

1. **Step 1: Markdown-only end-to-end slice**: Deliver the complete authoring → `@fea-docs/normalizer` → `@fea-docs/cli` build → publishing flow using only constructs from the likely Markdown-only replacement list. This slice must include target filtering, normalized docs generation, arbitrary static-file copying, `@fea-docs/cli` static builds, single-target publishing, publish-all mode, diagnostics, and privacy validation.
2. **Step 1 assessment gate**: After the Markdown-only end-to-end slice works against the repository POC, reassess the practical boundary between Markdown-only constructs and MDX/non-Markdown constructs. Update the plan and requirements if real implementation findings show that a construct belongs in a different category.
3. **Step 2: Adjusted completion pass**: Finish the remaining implementation using the adjusted requirements. This includes constructs that require MDX, generated UI, richer component behavior, or other non-Markdown artifacts, plus any changes discovered during the Step 1 assessment.
4. Step 1 should not block on interactive graph UI, advanced backlink placement components, full foldable callout parity, or custom embed wrappers if the Markdown-only fallback is sufficient for the end-to-end proof.

### Likely Markdown-Only Replacements

1. **Basic wikilinks**: `[[Note]]` can normalize to standard Markdown links such as `[Note](/resolved/route/)`.
2. **Aliased wikilinks**: `[[Note|Label]]` can normalize to `[Label](/resolved/route/)`.
3. **Heading links**: `[[Note#Heading]]` and `[[Note#Heading|Label]]` can normalize to standard Markdown links with heading anchors.
4. **Block links**: `[[Note#^block-id]]` can normalize to a standard Markdown link to the resolved block anchor.
5. **Asset embeds**: `![[image.png]]` can normalize to Markdown image syntax when the asset is target-public, for example `![image](./image.png)`.
6. **Links to arbitrary static files**: Markdown links to non-Markdown files under the configured root can stay as normal Markdown links after path normalization.
7. **Standard Obsidian callouts**: Common callouts can normalize to Starlight aside directive syntax consumed by `@fea-docs/cli`, for example `> [!warning] Title` to `:::caution[Title]`. Starlight supports Markdown asides for `note`, `tip`, `caution`, and `danger`.
8. **Unknown callout types**: Unknown callouts can normalize to a default Markdown aside such as `:::note` with diagnostics, as long as no custom visual behavior is required.
9. **Simple note embeds**: `![[Note]]` can usually normalize to a bounded Markdown section or Starlight aside consumed by `@fea-docs/cli` containing the target-public normalized Markdown from the embedded note plus a source link.
10. **Heading embeds**: `![[Note#Heading]]` can usually normalize to a bounded Markdown section containing the selected target-public heading content plus a source link.
11. **Block embeds**: `![[Note#^block-id]]` can usually normalize to a bounded Markdown section containing the target-public block content plus a source link, if the embedded block content itself is Markdown-compatible.
12. **Default backlinks**: Generated backlinks can normalize to a Markdown heading and list of links when automatic placement is sufficient.

### Known MDX Or Non-Markdown Requirements

1. **Existing MDX source files**: Source `.mdx` files must remain MDX because ESM imports, JSX, expressions, and framework components are not representable as pure Markdown.
2. **Embeds containing MDX-only content**: Note, heading, or block embeds that include MDX imports, JSX, expressions, or components must emit MDX in the containing normalized document.
3. **Interactive graph view**: The built-in graph visualization requires client-side behavior and cannot be represented as pure Markdown. The graph fallback can be Markdown, but the interactive graph UI requires a component, script, or generated page integration.
4. **Advanced backlink placement components**: The default backlink list can be Markdown, but explicit component-based placement or interactive backlink controls require MDX or a `fea-docs` integration point.
5. **Foldable callouts with full behavior parity**: Standard callouts can be Markdown asides, but Obsidian foldable callout parity may require an accessible details/disclosure component or raw HTML. If the chosen implementation needs component props or richer behavior, the normalized output must be MDX.
6. **Custom embed wrappers with component semantics**: Embeds that require structured props, interactive controls, or custom client behavior are not pure Markdown and must emit MDX or generated `fea-docs` UI code.
7. **Arbitrary Obsidian plugin output**: Plugin-rendered syntax remains out of scope because it cannot be normalized deterministically without executing plugin-specific behavior.

## Phase 1: Repository POC Vault Audit and Pipeline Baseline

**Status**: Baseline implemented. The POC vault is `example/docs`, configured by `example/fea-docs.config.mjs`. `fea-docs audit`, `fea-docs normalize --target <target>`, and `fea-docs publish --all` now exercise the Phase 1 flow for the `engineering` and `recipes` targets. Normalization is intentionally pass-through at this phase: target-public Markdown, MDX, static assets, and baseline artifact JSON are emitted without Obsidian syntax transformation.

**User stories covered**: 1, 2, 28, 31, 33, 34, 35, 38, 39

### What to Build

Use `example/` in this repository as the proof-of-concept source vault rather than creating a separate sample vault. The vault source root is `example/docs`. The agent audits the example vault against the required end-to-end cases, highlights missing test-case coverage, and fills those gaps in the example vault. Establish the baseline pipeline that proves a normalized docs tree can be handed from `@fea-docs/normalizer` to `@fea-docs/cli` for preview and static builds. At this phase, normalization can be a pass-through copy for target-public content and does not transform Obsidian syntax yet.

### Implemented Baseline

1. `example/fea-docs.config.mjs` defines the example vault root, framework aliases, and two publishing targets: `engineering` and `recipes`.
2. `example/docs` includes POC coverage for `.md`, `.mdx`, arbitrary static files, target-specific public/private metadata, multiple publishing targets, wikilinks, callouts, embeds, block IDs, backlink candidates, graph candidates, search inclusion/exclusion, and MDX component usage.
3. `@fea-docs/normalizer` emits target-filtered pass-through normalized docs under `example/.fea-docs/normalized/<target>`.
4. Normalization emits `fea-docs.manifest.json`, `fea-docs.diagnostics.json`, `fea-docs.graph.json`, `fea-docs.backlinks.json`, and `fea-docs.search.json` as baseline artifacts.
5. `fea-docs audit` writes `example/poc-vault-audit.md` and currently reports all Phase 1 POC coverage checks as present.
6. `fea-docs publish --all` writes baseline per-target publish summaries under `example/.fea-docs/publish/<target>`.
7. Static builds from both normalized target trees have been manually verified with `fea-docs build --root example/.fea-docs/normalized/<target>`.

### Acceptance Criteria

- [x] `example/` in this repository is treated as the POC source vault for the end-to-end flow.
- [x] The agent audits the POC vault for required POC coverage: `.md`, `.mdx`, arbitrary static files, target-specific public/private metadata, multiple publishing targets, wikilinks, callouts, embeds, block IDs, backlink candidates, graph candidates, search inclusion/exclusion, MDX component usage, normalized docs publishing, and static output publishing.
- [x] `fea-docs audit` produces `poc-vault-audit.md` with missing or weak test cases.
- [x] The user and agent fill identified POC gaps together instead of generating an isolated sample vault.
- [x] `fea-docs normalize --target <target>` emits a normalized docs tree for a selected target.
- [ ] Local dev can serve the normalized POC docs with `fea-docs start` without Obsidian normalization enabled.
- [x] Static build can produce GitHub Pages-compatible output from the normalized POC docs.
- [x] The POC covers publishing with multiple configured targets.
- [x] Existing MDX imports, JSX, configured aliases, and React integration continue to work.
- [ ] Initial documentation states that Obsidian is an optional editor, `@fea-docs/normalizer` prepares content, and `@fea-docs/cli` renders normalized docs.
- [ ] Automated baseline tests exist for successful normalization, POC build, multi-target publishing flow, and MDX compatibility.

### Remaining Phase 1 Follow-Ups

1. Manually verify `fea-docs start --root example/.fea-docs/normalized/<target> --config example/fea-docs.config.mjs` for at least one target.
2. Add user-facing documentation outside this implementation plan that explains the authoring, normalization, and rendering layer split.
3. Extend automated baseline tests to cover CLI-level publish-all, normalized static build invocation, and MDX compatibility through the generated normalized tree rather than only the normalizer/audit modules.

## Phase 2: Discovery, Metadata, Target Filtering, and Normalized Docs

**User stories covered**: 2, 21, 22, 23, 24, 25, 26, 27, 29, 30, 31, 38

### What to Build

Implement `@fea-docs/normalizer` content discovery and metadata indexing for Markdown and MDX files before `@fea-docs/cli` rendering. Also discover non-Markdown files under the configured root so referenced or allowed static files can be copied unchanged. Track title, global aliases, slug, draft, publish target membership, backlink status, pagefind status, headings, block IDs, tags, and source path. Apply ignore rules and target-based public/private filtering before navigation, graph, search, asset, static-file, and syntax normalization work. Emit a target-specific normalized docs tree and `fea-docs.manifest.json`.

### Acceptance Criteria

- [ ] `.md` and `.mdx` files are discovered recursively from the configured source vault or docs root.
- [ ] Non-Markdown files under the configured root are discovered as candidate static files.
- [ ] `.gitignore`, default ignores, and configured ignores are respected.
- [ ] Metadata is extracted for title, aliases, slug, draft, publish targets, backlinks, pagefind, headings, block IDs, and source path.
- [ ] Title fallback order remains frontmatter title, first H1, then filename.
- [ ] Nothing is published by default.
- [ ] Explicit frontmatter `publish: engineering` allowlisting makes a page public for the selected `engineering` target.
- [ ] YAML list frontmatter such as `publish: [engineering, recipes]` makes a page public for each listed configured target.
- [ ] Frontmatter `publish: false` is accepted as an explicit non-public marker.
- [ ] Unknown publish target IDs warn in development and fail strict validation.
- [ ] Production builds exclude `draft: true` pages.
- [ ] Ignore patterns win first, then `draft: true` in production, then explicit membership in the selected configured target; absent target membership means non-public for that build.
- [ ] Non-target pages are excluded from normalized docs, static output, navigation, search input, backlinks input, and graph input.
- [ ] The normalized docs tree preserves `.md` when no MDX syntax is required and emits `.mdx` when the source or normalized output requires MDX.
- [ ] Non-Markdown files are copied unchanged into the normalized docs tree when referenced by target-public content or allowed by target-specific asset rules.
- [ ] Copied non-Markdown files preserve their relative paths from the configured root unless target config explicitly remaps them.
- [ ] `fea-docs.manifest.json` maps source files to normalized output files and records target ID, routes, included assets, copied static files, generated data files, and diagnostics summary.
- [ ] Development mode reports filtering decisions in a debuggable way.
- [ ] Strict mode fails invalid frontmatter, duplicate routes/slugs, unknown targets, and missing title fallback.

## Phase 3: Route Resolver and Wikilinks

**User stories covered**: 3, 4, 5, 6, 26, 29, 30, 31

### What to Build

Implement deterministic target resolution for Obsidian wikilinks and normalize supported wikilinks into `fea-docs`-compatible Markdown/MDX links in the normalized docs tree. Resolution should use canonical source path, generated route, title, global aliases, headings, and block IDs while preserving MDX syntax safety.

### Acceptance Criteria

- [ ] `[[Note]]` resolves to the correct public page route.
- [ ] `[[Note|Alias]]` renders using alias link text.
- [ ] `[[Note#Heading]]` resolves to the correct heading anchor.
- [ ] `[[Note#Heading|Alias]]` resolves and renders using alias text.
- [ ] `[[Note#^block-id]]` resolves to the correct explicit block anchor.
- [ ] Links can resolve by source path, title, and global frontmatter aliases.
- [ ] Pipe aliases are treated as per-link display text, not global alias definitions.
- [ ] Ambiguous targets produce diagnostics instead of silent resolution.
- [ ] Wikilink-like text inside fenced code, inline code, MDX imports/exports, JSX expressions, and component attributes is not corrupted.
- [ ] Development mode warns on unresolved or ambiguous wikilinks on pages public for the selected target.
- [ ] Strict mode fails unresolved or ambiguous wikilinks on pages public for the selected target.
- [ ] Tests cover successful links, heading anchors, aliases, ambiguity, unresolved targets, and MDX safety cases.

## Phase 4: Privacy-Safe Link and Asset Validation

**User stories covered**: 22, 23, 24, 25, 30, 31

### What to Build

Extend normalization-layer validation so pages public for the selected target cannot reference private pages, cross-target pages, private assets, cross-target assets, private static files, or cross-target static files. Add asset/static-file resolution and inclusion rules for Markdown images, Markdown links to arbitrary files, MDX asset references, MDX references to files under the configured root, and Obsidian-style asset references once those are introduced.

### Acceptance Criteria

- [ ] Public-to-private and cross-target page links produce development warnings and strict build failures.
- [ ] Public-to-private and cross-target asset/static-file references produce development warnings and strict build failures.
- [ ] Unresolved Markdown images or linked static files referenced by pages public for the selected target fail strict builds.
- [ ] Unresolved MDX asset imports or static-file references on pages public for the selected target remain visible as MDX/build errors.
- [ ] Only assets and static files reachable from pages public for the selected target or explicitly public asset directories for that target are emitted into normalized docs/static output.
- [ ] Ignored, private, and cross-target asset/static-file paths are not emitted accidentally.
- [ ] Diagnostics include source location where feasible and actionable suggested fixes.
- [ ] Tests cover private page leaks, cross-target page leaks, private asset leaks, cross-target asset leaks, private static-file leaks, ignored assets/static files, and allowed target-public assets/static files.

## Phase 5: Isolated Syntax Normalization Engine and Callouts

**User stories covered**: 11, 12, 13, 14, 29, 31, 33

### What to Build

Create `@fea-docs/syntax-engine`, register `@fea-docs/obsidian` handlers, and implement common Obsidian callout normalization through that engine. Preserve titles and body content. Handle nested callouts and foldable indicators using either accessible collapsible UI or documented graceful degradation.

### Acceptance Criteria

- [ ] `@fea-docs/syntax-engine` exposes a clear input/output contract that does not depend on `@fea-docs/cli` internals or publishing destinations.
- [ ] `@fea-docs/syntax-engine` can register `@fea-docs/obsidian` syntax handlers without coupling them to target filtering, rendering, or publishing modules.
- [ ] The engine contract is suitable for reuse by future tools such as a VS Code extension for preview, validation, or authoring assistance.
- [ ] `> [!note]`, `> [!info]`, `> [!tip]`, `> [!warning]`, `> [!danger]`, and `> [!question]` render with predictable styles.
- [ ] Custom callout titles are preserved.
- [ ] Markdown inside callout bodies renders correctly.
- [ ] Nested callouts do not corrupt the surrounding page structure.
- [ ] Foldable callouts render with accessible semantics or a documented fallback.
- [ ] Unknown callout types render safely with a default style.
- [ ] Callout normalization does not break MDX component usage nearby.
- [ ] Tests cover common types, custom titles, nested cases, foldable markers, unknown types, and MDX-adjacent content.

## Phase 6: Embeds and Transclusion

**User stories covered**: 7, 8, 9, 10, 23, 24, 29, 30, 31

### What to Build

Normalize Obsidian-style embeds for simple notes, selected headings, explicit block IDs, and supported assets. Enforce recursion guards, target-based public/private filtering, and clear diagnostics for unsupported complex embeds.

### Acceptance Criteria

- [ ] `![[Note]]` normalizes to a clearly bounded embedded note when the note is public for the selected target.
- [ ] `![[Note#Heading]]` normalizes to the selected target-public section.
- [ ] `![[Note#^block-id]]` normalizes to the targeted target-public block.
- [ ] `![[asset.ext]]` normalizes to supported target-public image/media assets.
- [ ] Embeds respect target-based public/private filtering for both source notes and assets.
- [ ] Recursive embed loops are detected and reported.
- [ ] Explicit `^block-id` markers produce stable block anchors in target-public content.
- [ ] Embedded content cannot cause private or cross-target content to enter normalized docs, static output, or search.
- [ ] Tests cover note embeds, heading embeds, asset embeds, unresolved embeds, private embeds, recursive embeds, and unsupported block embeds.

## Phase 7: Backlinks

**User stories covered**: 15, 16, 22, 24, 32

### What to Build

Generate target-public backlinks from the normalized content graph and render them only when opted in globally or per page with frontmatter `backlinks: true`. Include enough metadata for readers to understand the source page and context while never exposing private or cross-target source pages.

### Acceptance Criteria

- [ ] Backlinks are generated from target-public Markdown links, wikilinks, and supported embeds.
- [ ] Backlink entries include source title and route.
- [ ] Backlinks exclude private source pages, cross-target source pages, and private-only references.
- [ ] Backlinks render when enabled globally.
- [ ] Backlinks render per page when frontmatter `backlinks: true` is present.
- [ ] Backlinks do not render by default on every page.
- [ ] Backlink rendering works in `@fea-docs/cli` static output from normalized docs.
- [ ] Strict mode fails if backlink data would expose private or cross-target content.
- [ ] Tests cover public backlinks, private source exclusion, alias labels, embed-derived backlinks, and disabled backlinks.

## Phase 8: Static Graph Data and Built-In Graph UI

**User stories covered**: 17, 18, 22, 24, 32, 34

### What to Build

Emit `fea-docs.graph.json` from the target-public normalized content graph and provide a built-in client-side graph view. Keep graph code out of baseline pages where the graph is not shown.

### Acceptance Criteria

- [ ] `fea-docs.graph.json` includes target-public nodes with page ID, title, route, and optional tags.
- [ ] `fea-docs.graph.json` includes target-public edges with source, target, and edge type where known.
- [ ] Private pages, cross-target pages, private assets, private static files, unresolved targets, and private-only references are excluded.
- [ ] Graph output is deterministic across builds for the same source and config.
- [ ] Built-in graph UI is available without a separate integration package.
- [ ] Graph UI can be disabled or omitted from pages where it is not needed.
- [ ] Graph UI has a non-visual fallback such as a link list or table.
- [ ] Static build requires no runtime server for graph behavior.
- [ ] Tests inspect generated `fea-docs.graph.json` and verify private-content and cross-target exclusion.

## Phase 9: Search Integration and Search Privacy

**User stories covered**: 19, 20, 22, 23, 24, 34

### What to Build

Ensure Pagefind indexes only target-public, searchable normalized content after Obsidian normalization and embeds. Honor per-page search exclusion and verify private or cross-target embedded content never enters the index.

### Acceptance Criteria

- [ ] Pages public for the selected target are included in Pagefind by default.
- [ ] Pages with `pagefind: false` or equivalent metadata are excluded.
- [ ] Private and cross-target pages are excluded from indexing.
- [ ] Private or cross-target embedded content cannot enter the search index.
- [ ] Search works in static build output.
- [ ] Tests verify search inclusion and exclusion behavior on POC repository content.

## Phase 10: Configuration, Publishing Destinations, and Author Documentation

**User stories covered**: 1, 21, 22, 23, 25, 32, 33, 34, 38

### What to Build

Expose a small Obsidian compatibility config surface, publishing target definitions, and destination configuration for normalized docs and static output. Document supported workflows, including Obsidian authoring, `.mdx` caveats, target-based publishing, wikilinks, embeds, callouts, backlinks, graph output, search exclusion, normalized docs, publishing destinations, and strict mode.

### Acceptance Criteria

- [ ] Config can enable or disable wikilinks, embeds, callouts, backlinks, graph output, and explicit target-based publish allowlisting.
- [ ] Config can define publishing targets, selected/default target, public roots, ignored paths, public asset directories, normalized docs destinations, static output destinations, and strictness behavior.
- [ ] Each publishing target can define separate repo, branch, and path settings for normalized docs and static output.
- [ ] Obsidian compatibility defaults to publishing nothing unless pages opt into a configured publishing target.
- [ ] Defaults preserve existing non-Obsidian `fea-docs` usage when Obsidian compatibility is not enabled.
- [ ] Documentation explains recommended Obsidian settings and `.mdx` plugin caveats.
- [ ] Documentation recommends standard Markdown links where possible.
- [ ] Documentation lists supported and unsupported Obsidian syntax.
- [ ] Documentation warns that build filtering does not make a public source repository private.
- [ ] Documentation warns that normalized docs are published artifacts and must be treated like static output.
- [ ] Example content demonstrates each supported feature.

## Phase 11: Target Publishing Workflow

**User stories covered**: 22, 23, 24, 25, 26, 27, 37, 38

### What to Build

Add the internal publishing workflow behind `fea-docs publish --target <target>` and `fea-docs publish --all`. It takes a selected target's normalized docs artifact and static output artifact and writes them to configured repo, branch, and path destinations. Add a simple publish-all mode that iterates over all configured targets and invokes the same target-specific normalization, build, and publish workflow for each target. Keep advanced orchestration such as aggregate rollback, cross-target dependency handling, and coordinated partial-failure recovery out of the first version.

### Acceptance Criteria

- [ ] Publishing runs for one selected target at a time.
- [ ] Publish-all mode discovers all configured publishing targets and invokes the target-specific pipeline for each one.
- [ ] Publish-all mode may run sequentially in the first version.
- [ ] Publish-all mode reports per-target success and failure.
- [ ] Normalized docs can be published to a configured repo, branch, and path.
- [ ] Static output can be published to a configured repo, branch, and path.
- [ ] Normalized docs and static output destinations can be different.
- [ ] Publishing refuses unknown target IDs and missing destination config in strict mode.
- [ ] Publish-all mode continues or stops after a target failure according to documented strict-mode behavior.
- [ ] Publishing does not push private or cross-target normalized docs, assets, graph data, backlinks, or search content.
- [ ] Publishing produces `fea-docs.publish.json` with destination refs and artifact paths.
- [ ] Tests cover same-repo destinations, separate-repo destinations, publish-all sequencing, per-target failure summaries, missing destination config, and private/cross-target artifact prevention.

## Phase 12: Strict CI, Diagnostics, and Build Hardening

**User stories covered**: 6, 10, 24, 27, 30, 31, 35, 38

### What to Build

Consolidate diagnostics and strict-mode behavior across `@fea-docs/normalizer`, `@fea-docs/cli` rendering, and publishing. Ensure failures are actionable, stable enough for CI, and optionally machine-readable. Harden output cleanup so failed normalization, builds, or publishing runs cannot leave private or cross-target artifacts behind.

### Acceptance Criteria

- [ ] Diagnostics include source file, location where feasible, issue code, severity, and suggested fix.
- [ ] Machine-readable diagnostics are emitted to `fea-docs.diagnostics.json`.
- [ ] Normalize/build/publish output ends with a warning/error summary.
- [ ] Strict mode fails on unresolved target-public links, unresolved target-public embeds, unresolved target-public assets, duplicate routes/slugs, invalid frontmatter, unknown publish targets, missing title fallback, MDX import errors, ambiguous wikilinks, embed cycles, privacy leaks, and cross-target leaks.
- [ ] Development mode warns for recoverable issues and keeps the local server usable.
- [ ] `@fea-docs/schema` exports diagnostics, manifest, graph, backlinks, search report, and publish summary types/schemas for CI and editor integration.
- [ ] Failed strict normalization, build, or publish runs do not leave private or cross-target artifacts in normalized docs, static output, or destination branches.
- [ ] End-to-end tests cover strict success, strict failure, dev warnings, publishing failures, and privacy leak prevention.

## Phase 13: Performance, Accessibility, and Release Readiness

**User stories covered**: 17, 18, 19, 33, 34, 35

### What to Build

Optimize and verify the complete normalization, rendering, and publishing pipeline against representative vault sizes. Run accessibility checks for callouts, backlinks, graph UI, and generated links. Prepare release notes that accurately describe the constrained Obsidian compatibility boundary and normalized-docs artifact model.

### Acceptance Criteria

- [ ] Full normalization/build runs avoid quadratic link-resolution behavior on the POC repository and representative larger vault fixtures.
- [ ] Incremental development rebuilds reuse cached discovery or graph data where feasible.
- [ ] Optional graph UI code is not loaded on pages where graph features are disabled.
- [ ] Callouts, backlinks, and graph controls are keyboard accessible.
- [ ] Graph visualization has a non-visual fallback.
- [ ] Generated links have readable text.
- [ ] Release documentation clearly distinguishes supported Obsidian-like behavior from full Obsidian parity.
- [ ] Final POC pipeline passes strict mode and produces normalized docs plus static output suitable for configured destinations.

## Cross-Cutting Test Matrix

1. **Parser fixtures**: wikilinks, global aliases, pipe display aliases, heading links, block links, callouts, embeds, frontmatter, tags, block IDs, code blocks, and MDX syntax.
2. **Resolver fixtures**: title resolution, global alias resolution, path resolution, heading anchors, block anchors, duplicate aliases, duplicate titles, missing targets, and private targets.
3. **Syntax engine fixtures**: isolated engine input/output, Obsidian handler registration, non-Obsidian handler extension points, diagnostics shape, and editor-tool reuse boundaries.
4. **Target fixtures**: single-target pages, multi-target pages, unknown targets, target-specific assets, cross-target links, and cross-target embeds.
5. **Privacy fixtures**: private notes, private assets, private static files, public-to-private links, private embeds, cross-target leaks, graph leaks, backlink leaks, and search leaks.
6. **Normalized docs fixtures**: `fea-docs.manifest.json`, `.md` preservation, `.mdx` emission, unchanged non-Markdown file copying, relative path preservation, copied assets, generated data files, and private/cross-target exclusion.
7. **Build fixtures**: clean `@fea-docs/cli` build, strict failure, development warnings, MDX import failure, duplicate routes, invalid frontmatter, unknown targets, and missing title fallback.
8. **Publishing fixtures**: same-repo destinations, separate-repo destinations, missing destination config, branch/path layout, and `fea-docs.publish.json` summaries.
9. **Static output fixtures**: generated HTML, `fea-docs.graph.json`, Pagefind indexing behavior, copied assets/static files, and GitHub Pages-compatible output.
10. **Accessibility fixtures**: callouts, collapsible callouts, backlink sections, graph fallback, and keyboard navigation.

## Delivery Risks

1. MDX and Obsidian syntax can conflict if normalization operates on raw text without respecting MDX AST boundaries.
2. Global alias resolution can become confusing unless ambiguity is treated as an error.
3. Embeds and arbitrary static-file references can leak private or cross-target content unless filtering happens before normalization, after reference expansion, and again before publishing.
4. Block references are Obsidian-specific and need careful parsing to support useful block links and embeds without overbuilding plugin parity.
5. Graph UI can increase bundle size unless it remains optional.
6. Publishing normalized docs creates an additional public artifact that must be validated as strictly as static output.
7. If `@fea-docs/syntax-engine` is too tightly coupled to `@fea-docs/cli` or publishing, it will be hard to add other syntaxes or reuse the logic in future editor tooling.
8. Publish-all mode can make partial failures more visible; the first version should report them clearly but does not need aggregate rollback.
9. Obsidian preview will remain imperfect for MDX-heavy pages; documentation must set expectations.

## Suggested Milestones

1. **Step 1: Markdown-Only End-to-End POC**: Deliver the full repository POC flow using Markdown-replaceable constructs only. This includes Phase 0 package preparation, Phases 1 through 4, the reusable `@fea-docs/syntax-engine` foundation from Phase 5, Markdown-only callouts/embeds/backlinks from Phases 5 through 7, search privacy from Phase 9 where supported by normalized Markdown, and the config/publishing/strict diagnostics path from Phases 10 through 12.
2. **Step 1 Assessment Gate**: Review the working POC, classify each planned construct as Markdown-only, MDX-required, generated-UI-required, or out-of-scope, and update the plan/requirements before completing the remaining work.
3. **Step 2: Adjusted Completion Pass**: Complete the remaining constructs and productization work using the updated requirements. This includes interactive graph UI from Phase 8, any MDX-required embed/callout/backlink behavior, advanced UI integrations, performance, accessibility, and release readiness from Phase 13.
