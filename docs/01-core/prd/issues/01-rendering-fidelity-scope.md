---
title: "Rendering Fidelity Scope"
labels: wayfinder:grilling
---

Type: grilling
Status: resolved
Blocked by:

## Question

What markdown surface does the PRD promise the renderer handles? `fea-docs v2` parses `.md`/`.mdx` as MDX, but "renders markdown" can mean anything from bare CommonMark to the full GitHub-flavored surface plus MDX components. The PRD must state the *requirement*, not the parser.

Decide, in-scope vs out-of-scope, for:

- CommonMark block/inline constructs (headings, emphasis, lists, blockquotes, links, images, code spans/blocks, tables, task lists, footnotes, strikethrough)
- Extended constructs: tables, task lists, footnotes, definition lists, math (LaTeX), mermaid/diagrams, callouts/`:::` directives
- MDX: JSX components, `import`/`export` statements, expression evaluation (`{expr}`)
- Raw HTML passthrough
- Syntax highlighting for fenced code blocks (which one is default, is plugin-based highlighting required?)
- Embeds beyond images (video, iframes, pdfs)

For each: **required in v1**, **nice-to-have**, or **out of scope**. The answer becomes a "rendering surface" section in the PRD.

**Raw HTML / MDX trust model (decided):** all files are treated as potential MDX; raw HTML and JSX/imports render as written — **no sanitization; content is trusted**, matching the common static-generator norm (Jekyll/Hugo/11ty; GitHub Pages adds no CSP/sandbox to served content). Documented trust boundary: if content ever becomes *untrusted* (third-party ingest), stored-XSS and build-time MDX code-execution are then real risks requiring a sanitizer/ingest policy — a later concern, not a v1 feature.

**Recommended default:** v1 required = CommonMark core + GFM tables + fenced code with syntax highlighting + MDX (JSX/imports/exports) + raw HTML passthrough. Nice-to-have = footnotes, task lists. Out of scope for v1 = math/LaTeX, mermaid-as-syntax, definition lists.

## Answer

**v1 required:** CommonMark core (headings, emphasis, lists, links, images, code spans/blocks, blockquotes) + simple GFM tables (inline content in cells; multi-line block content in cells = nice-to-have) + fenced code with syntax highlighting (baked in at build, no JS) + MDX (`import`/`export`, `{expr}`, PascalCase components).

**Raw HTML / HTML-vs-JSX rule + per-file hybrid:** `.md`/`.mdx` share one renderer surface, but a **per-file hybrid** decides the parse: a file is compiled **as MDX when it uses MDX features** (an `import`/`export`, JSX, or an expression `{expr}`), otherwise as **plain markdown**. Either way the semantics are the same — **lowercase known-HTML tags render as raw HTML passthrough** (attributes exactly as written, e.g. `<table class="x">`); **PascalCase tags are MDX/JSX components** resolved from imports. The hybrid keeps `.md` able to include components while building at near-plain-markdown speed for plain files (MDX compile is ~10× heavier per file; only files that actually use MDX features pay it). No per-extension behavior split.

**Trust model:** no sanitization — content is trusted, matching the static-generator norm (Jekyll/Hugo/11ty; GitHub Pages adds no CSP/sandbox to served pages). Documented boundary: if content ever becomes *untrusted* (third-party ingest), stored-XSS and build-time MDX code-execution become real risks requiring a sanitizer/ingest policy — a later concern, not a v1 feature.

**Nice-to-have:** footnotes, task lists, strikethrough/autolinks, mermaid-as-syntax, callouts/`:::` directives, multi-line block content in table cells, iframe/video/audio embeds (generally — implicitly already possible via raw-HTML passthrough).

**Out of scope (v1):** math/LaTeX, definition lists.