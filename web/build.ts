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

// Find all HTML entry points
const entrypoints = [...new Bun.Glob("**/*.html").scanSync("src")]
  .map((f) => path.resolve("src", f))
  .filter((f) => !f.includes("node_modules"));

console.log(`📄 Found ${entrypoints.length} HTML file(s) to process\n`);

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
