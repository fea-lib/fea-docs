import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {compileSync} from "@mdx-js/mdx";
import {prerender} from "react-dom/static";
import {jsx} from "react/jsx-runtime";
import esbuild from "esbuild";

const fixturesDir = path.join(import.meta.dirname, "fixtures");
const outDir = path.join(import.meta.dirname, "out");
const tempDir = path.join(import.meta.dirname, ".out-build");

const bytes = (s) => Buffer.byteLength(s, "utf8");
const zipped = (s) => zlib.deflateSync(Buffer.from(s, "utf8")).length;

const STATIC = await import(path.join(fixturesDir, "Static.mjs"));
const HYBRID = await import(path.join(fixturesDir, "Hybrid.mjs"));

// The page's component registry (05's import resolution result).
const components = {
  Hello: STATIC.Hello,
  Timestamp: STATIC.Timestamp,
  Counter: HYBRID.Counter,
  Effect: HYBRID.Effect,
};

// Which components each fixture page uses, and their declared renderMode.
const MANIFEST = {
  "page-static.mdx": {uses: {Hello: "static", Timestamp: "static"}},
  "page-hybrid.mdx": {uses: {Counter: "hybrid", Effect: "hybrid"}},
};

function toFileUrl(p) {
  return "file://" + p.replaceAll(path.sep, "/");
}

// Compile the MDX page, load the module, render its MDXContent statically.
async function renderStaticHtml(file) {
  const source = fs.readFileSync(path.join(fixturesDir, file), "utf8");
  const compiled = compileSync(source, {jsxImportSource: "react"});
  const moduleCode = compiled.value;

  // Write the compiled module next to the fixtures it imports, so the
  // relative `./Static.mjs` import resolves.
  const tmp = path.join(fixturesDir, `_module-${file.replace(/\.mdx$/, "")}.mjs`);
  fs.writeFileSync(tmp, moduleCode);
  const {default: MDXContent} = await import(toFileUrl(tmp));
  fs.unlinkSync(tmp);

  const {prelude} = await prerender(jsx(MDXContent, {components}));
  return new Response(prelude).text();
}

function firstH1(html) {
  const m = html.match(/<h1[^>]*>(.*?)<\/h1>/);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, "").replaceAll("&amp;", "&");
}

// The *real* renderer extension: assemble a full, loadable page (doctype,
// head, title from first H1, body) and for hybrid pages reference the chunks —
// so the emitted HTML actually contains the JS it must load.
function pageShell(title, bodyHtml, scripts) {
  const lines = [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${title ?? "fea-docs"}</title>`,
    "</head>",
    "<body>",
    bodyHtml,
  ];
  for (const src of scripts) {
    lines.push(`<script type="module" src="${src}"></script>`);
  }
  lines.push("</body>", "</html>");
  return lines.join("\n");
}

// Build the *shared, cacheable* vendor chunk (react/jsx-runtime), via esbuild —
// a self-contained ESM module every hybrid page references.
async function buildVendorChunk() {
  const entry = path.join(tempDir, "vendor-entry.mjs");
  fs.writeFileSync(entry, `import {jsx, Fragment} from "react/jsx-runtime";\nexport {jsx, Fragment};\n`);
  return esbuildBuild(entry, "vendor.js");
}

// Build the page-scoped chunk that hydrates this page's hybrid components:
// esbuild bundles the hydrate entry + its transitive graph (components, react).
async function buildPageChunk(outName) {
  const entry = path.join(tempDir, "page-hydrate.mjs");
  let src = fs.readFileSync(path.join(fixturesDir, "page-hydrate.mjs"), "utf8");
  // The hydrate entry lives in tempDir; point its "./Hybrid.mjs" import at
  // the real fixture (relative from tempDir to fixtures/ is "../fixtures").
  src = src.replaceAll("./Hybrid.mjs", path.posix.relative(tempDir, fixturesDir) + "/Hybrid.mjs");
  fs.writeFileSync(entry, src);
  return esbuildBuild(entry, outName);
}

async function esbuildBuild(entry, outName) {
  const rel = path.relative(tempDir, entry);
  await esbuild.build({
    absWorkingDir: tempDir,
    entryPoints: [{in: rel, out: outName}],
    outdir: tempDir,
    format: "esm",
    bundle: true,
  });
  const named = path.join(tempDir, `${outName}.js`);
  const built = fs.readFileSync(named, "utf8");
  fs.writeFileSync(path.join(outDir, outName), built);
  return built;
}

async function main() {
  fs.mkdirSync(outDir, {recursive: true});
  fs.mkdirSync(tempDir, {recursive: true});
  for (const name of fs.readdirSync(outDir)) fs.unlinkSync(path.join(outDir, name));
  for (const name of fs.readdirSync(tempDir)) fs.unlinkSync(path.join(tempDir, name));

  const vendor = await buildVendorChunk();
  fs.writeFileSync(path.join(outDir, "vendor.js"), vendor);

  const lines = [];
  let pageChunks = 0;
  const failures = [];

  for (const [file, {uses}] of Object.entries(MANIFEST)) {
    const bodyHtml = await renderStaticHtml(file);
    const needsJs = Object.values(uses).some((mode) => mode === "hybrid");
    const base = file.replace(/\.mdx$/, "");

    const scripts = [];
    if (needsJs) {
      const chunk = await buildPageChunk(`${base}.page.js`);
      pageChunks += 1;
      scripts.push("vendor.js", `${base}.page.js`);
    }

    const html = pageShell(firstH1(bodyHtml), bodyHtml, scripts);
    fs.writeFileSync(path.join(outDir, `${base}.html`), html);

    lines.push(`PAGE    ${base}.html                 raw=${bytes(html)}  gz=${zipped(html)}`);
    lines.push(`        title=${JSON.stringify(firstH1(bodyHtml) ?? base)}  scripts=[${scripts.join(", ") || "none"}]`);

    if (file === "page-static.mdx") {
      if (!bodyHtml.includes("hallo tobi")) failures.push("static page missing <p>hallo tobi</p>");
      if (needsJs) failures.push("static page wrongly flagged needsJs");
      if (html.includes("<script")) failures.push("static page must ship ZERO JS — no <script> in the page");
      if (!html.includes("<title>Static page</title>")) failures.push("static page shell missing <title>Static page</title>");
    }
    if (file === "page-hybrid.mdx") {
      if (!bodyHtml.includes("<button data-hydrate=\"Counter\">count: 0</button>")) failures.push("hybrid page missing data-hydrate marker on Counter");
      if (!bodyHtml.includes("<output data-hydrate=\"Effect\">idle</output>")) failures.push("hybrid page: effect comp should render pre-effect state with marker (effects = build-time no-ops)");
      if (!html.includes('<script type="module" src="vendor.js"></script>')) failures.push("hybrid page HTML missing the vendor <script>");
      if (!html.includes(`<script type="module" src="page-hybrid.page.js"></script>`)) failures.push("hybrid page HTML missing the page-chunk <script>");
      if (firstH1(bodyHtml) !== "Hybrid page") failures.push("hybrid <title> should be 'Hybrid page'");
    }
    lines.push(`        needsJs=${needsJs}  (${Object.entries(uses).map(([n, m]) => `${n}:${m}`).join(", ")})\n`);
  }

  lines.push(`VENDOR  vendor.js             bytes=${bytes(vendor)}  gz=${zipped(vendor)}  (shared, cacheable)`);
  const jsFiles = fs.readdirSync(outDir).filter((f) => f.endsWith(".js"));
  const jsTotal = jsFiles.reduce((a, f) => a + bytes(fs.readFileSync(path.join(outDir, f))), 0);
  lines.push(`page chunks: ${pageChunks} · js files: ${jsFiles.join(", ")} · total JS: ${jsTotal}B raw`);

  console.log(lines.join("\n"));
  if (failures.length) {
    console.error("\nASSERTION FAILURES:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("\nVERDICT-CHECK PASSED — HTML carries the JS it must load; vendor shared; hybrid hydratable.");
}

await main();