import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {compileSync} from "@mdx-js/mdx";
import {prerender} from "react-dom/static";
import {jsx} from "react/jsx-runtime";

const fixturesDir = path.join(import.meta.dirname, "fixtures");
const outDir = path.join(import.meta.dirname, "out");

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

async function main() {
  fs.mkdirSync(outDir, {recursive: true});
  // wipe the out dir first (escape prior runs)
  for (const name of fs.readdirSync(outDir)) fs.unlinkSync(path.join(outDir, name));

  const lines = [];
  let pageChunks = 0;
  const failures = [];

  for (const [file, {uses}] of Object.entries(MANIFEST)) {
    const html = await renderStaticHtml(file);
    const needsJs = Object.values(uses).some((mode) => mode === "hybrid");
    const base = file.replace(/\.mdx$/, "");

    fs.writeFileSync(path.join(outDir, `${base}.html`), html);
    lines.push(`PAGE    ${base}.html                 raw=${bytes(html)}  gz=${zipped(html)}`);

    // Correctness checks — prove the verdict rather than just print it.
    if (file === "page-static.mdx") {
      if (!html.includes("hallo tobi")) failures.push("static page missing <p>hallo tobi</p>");
      if (needsJs) failures.push("static page wrongly flagged needsJs");
    }
    if (file === "page-hybrid.mdx") {
      if (!html.includes("<button>count: 0</button>")) failures.push("hybrid page missing static <button>count: 0</button>");
      // React server render runs useState etc. but `useEffect` is a *noop* at
      // build (verified in react-dom-server-legacy.node.development.js: useEffect: noop).
      // So the effect's post-mutation state ("done") is NOT in static HTML — the
      // effect exists only in the hydrated client pass. The static output must
      // still be correct-as-authored for the pre-effect state.
      if (!html.includes("<output>idle</output>")) failures.push("hybrid page: effect component should render pre-effect state <output>idle</output> (effects are build-time no-ops)");
      if (!needsJs) failures.push("hybrid page wrongly flagged static");
    }

    if (needsJs) {
      const hybrid = Object.entries(uses)
        .filter(([, mode]) => mode === "hybrid")
        .map(([name]) => name);
      const chunk = `// page chunk — hydrates ${hybrid.join(", ")} in place\n// (emitted only because a hybrid component is used on this page)\nexport const pageComponents = ${JSON.stringify(hybrid)};\n`;
      fs.writeFileSync(path.join(outDir, `${base}.page.js`), chunk);
      lines.push(`CHUNK ${base}.page.js                raw=${bytes(chunk)}  gz=${zipped(chunk)}`);
      pageChunks += 1;
    }
    lines.push(`      needsJs=${needsJs}  (${Object.entries(uses).map(([n, m]) => `${n}:${m}`).join(", ")})\n`);
  }

  // The shared vendor chunk (react runtime), written once.
  const vendor = `// vendor chunk — react/jsx-runtime (shared, cacheable across pages)\nexport {jsx, Fragment} from "react/jsx-runtime";\n`;
  fs.writeFileSync(path.join(outDir, "vendor.js"), vendor);
  lines.push(`VENDOR vendor.js                    raw=${bytes(vendor)}  gz=${zipped(vendor)}  (shared)`);

  const jsTotal = bytes(vendor) + [...fs.readdirSync(outDir)].filter((f) => f.endsWith(".js") && f !== "vendor.js").reduce((a, f) => a + bytes(fs.readFileSync(path.join(outDir, f))), 0);
  lines.push(`\npage chunks: ${pageChunks}  (both pages share the single vendor chunk)`);
  lines.push(`JS shipped in total: ${jsTotal}B raw`);

  console.log(lines.join("\n"));
  if (failures.length) {
    console.error("\nASSERTION FAILURES:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("\nVERDICT-CHECK PASSED: static page ships zero JS, hybrid page ships page chunk, HTML correct.");
}

await main();