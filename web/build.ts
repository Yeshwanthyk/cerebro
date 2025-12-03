#!/usr/bin/env bun
/**
 * Bun build script for Cerebro web frontend
 * Uses Bun's native bundler - no Vite, no webpack, just Bun.
 */

import { existsSync } from "fs";
import { rm, cp } from "fs/promises";
import path from "path";

console.log("\n🚀 Building Cerebro Web with Bun...\n");

const outdir = path.join(process.cwd(), "dist");

// Clean previous build
if (existsSync(outdir)) {
  console.log(`🗑️  Cleaning previous build at ${outdir}`);
  await rm(outdir, { recursive: true, force: true });
}

const start = performance.now();

const result = await Bun.build({
  entrypoints: ["src/frontend.tsx"],
  outdir,
  minify: true,
  target: "browser",
  sourcemap: "linked",
  splitting: true,
  naming: {
    entry: "app.[ext]",
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

const end = performance.now();

// Format file size
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

// Print results
const table = result.outputs.map((output) => ({
  File: path.relative(process.cwd(), output.path),
  Type: output.kind,
  Size: formatSize(output.size),
}));

console.table(table);

if (!result.success) {
  console.error("\n❌ Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Copy static assets (images folder)
const imagesDir = path.join(process.cwd(), "images");
if (existsSync(imagesDir)) {
  console.log("📁 Copying static assets (images)...");
  await cp(imagesDir, path.join(outdir, "images"), { recursive: true });
}

console.log(`\n✅ Build completed in ${(end - start).toFixed(2)}ms\n`);

// Generate index.html that points to emitted entry + css
const jsEntry =
  result.outputs.find((o) => o.path.endsWith("app.js")) ||
  result.outputs.find((o) => o.kind === "entry" && o.path.endsWith(".js")) ||
  result.outputs.find((o) => o.path.endsWith(".js"));
const cssAsset = result.outputs.find((o) => o.path.endsWith(".css"));

if (!jsEntry) {
  console.error("❌ Could not find JS entry output");
  process.exit(1);
}

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#161616" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Cerebro" />
    <title>Cerebro - Git Diff Review</title>
    ${cssAsset ? `<link rel="stylesheet" href="./${path.basename(cssAsset.path)}" />` : ""}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./${path.basename(jsEntry.path)}"></script>
  </body>
</html>
`;

await Bun.write(path.join(outdir, "index.html"), html);
console.log("📝 Wrote dist/index.html");
