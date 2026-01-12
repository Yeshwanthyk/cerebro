#!/usr/bin/env bun
/**
 * Bun build script for Cerebro web frontend.
 * Uses Bun's native bundler - no Vite, no webpack.
 */

import path from "node:path";

const outdir = path.join(import.meta.dir, "dist");

console.log("\n🚀 Building Cerebro Web with Bun...\n");

// Clean previous build
const distExists = await Bun.file(path.join(outdir, "index.html")).exists();
if (distExists) {
  console.log("🗑️  Cleaning previous build");
  await Bun.$`rm -rf ${outdir}`;
}

const start = performance.now();

// Find all HTML entry points
const entrypoints = [...new Bun.Glob("**/*.html").scanSync("src")]
  .map((f) => path.resolve("src", f))
  .filter((f) => !f.includes("node_modules"));

console.log(`📄 Found ${entrypoints.length} HTML file(s)\n`);

const result = await Bun.build({
  entrypoints,
  outdir,
  minify: true,
  target: "browser",
  sourcemap: "linked",
  splitting: true,
  naming: {
    chunk: "[name]-[hash].[ext]",
    asset: "[name]-[hash].[ext]",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  loader: {
    ".otf": "file",
    ".ttf": "file",
    ".woff": "file",
    ".woff2": "file",
  },
});

const elapsed = performance.now() - start;

if (!result.success) {
  console.error("\n❌ Build failed:");
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Print results
const formatSize = (bytes: number): string => {
  const units = ["B", "KB", "MB"];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return `${size.toFixed(2)} ${units[idx]}`;
};

console.table(
  result.outputs.map((o) => ({
    File: path.relative(import.meta.dir, o.path),
    Type: o.kind,
    Size: formatSize(o.size),
  }))
);

// Copy static assets from src/images (canonical location)
const imagesDir = path.join(import.meta.dir, "src", "images");
if (await Bun.file(path.join(imagesDir, ".gitkeep")).exists().catch(() => false) || 
    (await Bun.$`ls ${imagesDir} 2>/dev/null`.quiet().then(() => true).catch(() => false))) {
  console.log("📁 Copying images...");
  await Bun.$`cp -r ${imagesDir} ${outdir}/images`.quiet().catch(() => {});
}

// Copy diffs worker for offloading syntax highlighting
const workerSrc = path.join(import.meta.dir, "node_modules/@pierre/diffs/dist/worker/worker-portable.js");
const workerDest = path.join(outdir, "diffs-worker.js");
if (await Bun.file(workerSrc).exists()) {
  console.log("📁 Copying diffs worker...");
  await Bun.$`cp ${workerSrc} ${workerDest}`.quiet();
}

// Workaround: Bun bundler sometimes points HTML to wrong chunk.
// Find the main bundle (contains createRoot) and fix the script src.
const htmlPath = path.join(outdir, "index.html");
let html = await Bun.file(htmlPath).text();

const jsFiles = [...new Bun.Glob("index-*.js").scanSync(outdir)];
let mainBundle = "";
let maxSize = 0;

for (const file of jsFiles) {
  const content = await Bun.file(path.join(outdir, file)).text();
  if (content.length > maxSize && content.includes("createRoot")) {
    maxSize = content.length;
    mainBundle = file;
  }
}

if (mainBundle) {
  const scriptMatch = html.match(/src="\.\/index-[^"]+\.js"/);
  if (scriptMatch && !scriptMatch[0].includes(mainBundle)) {
    console.log(`🔧 Fixing script ref → ${mainBundle}`);
    html = html.replace(/src="\.\/index-[^"]+\.js"/, `src="./${mainBundle}"`);
    await Bun.write(htmlPath, html);
  }
}

console.log(`\n✅ Done in ${elapsed.toFixed(0)}ms\n`);
