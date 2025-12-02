#!/usr/bin/env bun
/**
 * Build script for creating a single executable Cerebro binary
 *
 * This script:
 * 1. Builds the React frontend using Bun
 * 2. Embeds all static assets as base64
 * 3. Generates a self-contained server
 * 4. Compiles to a single executable using `bun build --compile`
 */

import { existsSync } from "fs";
import { mkdir, rm, writeFile, readdir, readFile, stat } from "fs/promises";
import path from "path";
import { $ } from "bun";

console.log("\n🚀 Building Cerebro as a single executable...\n");

const rootDir = path.resolve(import.meta.dir, "..");
const webDir = path.join(rootDir, "web");
const distDir = path.join(webDir, "dist");
const buildDir = path.join(rootDir, "dist-exe");

// Clean previous build
if (existsSync(buildDir)) {
  console.log(`🗑️  Cleaning previous executable build at ${buildDir}`);
  await rm(buildDir, { recursive: true, force: true });
}
await mkdir(buildDir, { recursive: true });

// Build the React frontend with Bun
console.log("📦 Building React frontend with Bun...");
await $`cd ${webDir} && bun run build`;

// Recursively read all files from a directory
async function getAllFiles(dir: string, baseDir = ""): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];
  const entries = await readdir(dir);

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const fileStat = await stat(fullPath);

    if (fileStat.isDirectory()) {
      const subFiles = await getAllFiles(fullPath, path.join(baseDir, entry));
      files.push(...subFiles);
    } else {
      const relativePath = path.join(baseDir, entry);
      const content = await readFile(fullPath);
      files.push({
        path: relativePath.replace(/\\/g, "/"),
        content: content.toString("base64"),
      });
    }
  }

  return files;
}

// Read all static files
console.log("📂 Reading static files from dist...");
const staticFiles = await getAllFiles(distDir);
console.log(`   Found ${staticFiles.length} files to embed`);

// Generate embedded files code
const embeddedFilesCode = staticFiles
  .map((file) => `  assets.set("${file.path}", "${file.content}");\n  assets.set("/${file.path}", "${file.content}");`)
  .join("\n");

// Create the self-contained server
const serverCode = `#!/usr/bin/env bun
/**
 * Cerebro - Git diff review tool
 * Single executable with embedded frontend
 */

import { program } from "commander";
import simpleGit from "simple-git";
import { homedir } from "os";
import { join, basename, resolve } from "path";

const VERSION = "0.1.0";

// Embedded assets (base64)
const assets = new Map<string, string>();
${embeddedFilesCode}

function getMimeType(file: string): string {
  const ext = file.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: "text/html", js: "application/javascript", css: "text/css",
    json: "application/json", png: "image/png", jpg: "image/jpeg",
    svg: "image/svg+xml", ico: "image/x-icon", woff: "font/woff",
    woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", map: "application/json",
  };
  return types[ext || ""] || "application/octet-stream";
}

// State management
const CONFIG_DIR = join(homedir(), ".config", "cerebro");
const REPOS_FILE = join(CONFIG_DIR, "repos.json");

async function ensureDir(path: string) {
  const file = Bun.file(join(path, ".keep"));
  if (!(await file.exists())) await Bun.write(join(path, ".keep"), "");
}

function genId() { return \`\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`; }

interface Repo { id: string; path: string; name: string; baseBranch: string; addedAt: number; }
interface ReposState { repos: Repo[]; currentRepo?: string; }
interface Comment { id: string; file_path: string; line_number?: number; text: string; timestamp: number; branch: string; commit: string; resolved: boolean; resolved_by?: string; resolved_at?: number; }
interface Note { id: string; file_path: string; line_number: number; text: string; timestamp: number; branch: string; commit: string; author: string; type: string; dismissed: boolean; dismissed_by?: string; dismissed_at?: number; }

async function getReposState(): Promise<ReposState> {
  await ensureDir(CONFIG_DIR);
  const f = Bun.file(REPOS_FILE);
  if (await f.exists()) { try { return await f.json(); } catch {} }
  return { repos: [] };
}

async function saveReposState(s: ReposState) { await ensureDir(CONFIG_DIR); await Bun.write(REPOS_FILE, JSON.stringify(s, null, 2)); }
async function getRepo(id: string) { return (await getReposState()).repos.find(r => r.id === id); }
async function getCurrentRepo() { const s = await getReposState(); return s.repos.find(r => r.id === s.currentRepo) || s.repos[0]; }

async function addRepo(path: string, name: string, baseBranch: string): Promise<Repo> {
  const s = await getReposState();
  const existing = s.repos.find(r => r.path === path);
  if (existing) return existing;
  const repo: Repo = { id: genId(), path, name, baseBranch, addedAt: Date.now() };
  s.repos.push(repo);
  if (!s.currentRepo) s.currentRepo = repo.id;
  await saveReposState(s);
  return repo;
}

async function setCurrentRepo(id: string) { const s = await getReposState(); if (!s.repos.find(r => r.id === id)) return false; s.currentRepo = id; await saveReposState(s); return true; }
async function removeRepo(id: string) { const s = await getReposState(); const i = s.repos.findIndex(r => r.id === id); if (i === -1) return false; s.repos.splice(i, 1); if (s.currentRepo === id) s.currentRepo = s.repos[0]?.id; await saveReposState(s); return true; }

function repoStateDir(id: string) { return join(CONFIG_DIR, "repos", id); }

async function getViewed(repoId: string, branch: string, commit: string): Promise<Record<string, boolean>> {
  await ensureDir(repoStateDir(repoId));
  const f = Bun.file(join(repoStateDir(repoId), "viewed.json"));
  if (await f.exists()) { try { const d = await f.json(); return d[\`\${branch}:\${commit}\`] || {}; } catch {} }
  return {};
}

async function setViewed(repoId: string, branch: string, commit: string, path: string, viewed: boolean) {
  await ensureDir(repoStateDir(repoId));
  const loc = join(repoStateDir(repoId), "viewed.json");
  const f = Bun.file(loc);
  let d: Record<string, Record<string, boolean>> = {};
  if (await f.exists()) { try { d = await f.json(); } catch {} }
  const k = \`\${branch}:\${commit}\`;
  if (!d[k]) d[k] = {};
  if (viewed) d[k][path] = true; else delete d[k][path];
  await Bun.write(loc, JSON.stringify(d, null, 2));
}

async function getComments(repoId: string, branch?: string): Promise<Comment[]> {
  await ensureDir(repoStateDir(repoId));
  const f = Bun.file(join(repoStateDir(repoId), "comments.json"));
  if (await f.exists()) { try { const c: Comment[] = await f.json(); return branch ? c.filter(x => x.branch === branch && !x.resolved) : c; } catch {} }
  return [];
}

async function addComment(repoId: string, c: Omit<Comment, "id"|"timestamp"|"resolved">): Promise<Comment> {
  await ensureDir(repoStateDir(repoId));
  const loc = join(repoStateDir(repoId), "comments.json");
  const f = Bun.file(loc);
  let comments: Comment[] = [];
  if (await f.exists()) { try { comments = await f.json(); } catch {} }
  const nc: Comment = { ...c, id: genId(), timestamp: Date.now(), resolved: false };
  comments.push(nc);
  await Bun.write(loc, JSON.stringify(comments, null, 2));
  return nc;
}

async function resolveComment(repoId: string, commentId: string, by = "user") {
  const loc = join(repoStateDir(repoId), "comments.json");
  const f = Bun.file(loc);
  if (!(await f.exists())) return false;
  let comments: Comment[] = [];
  try { comments = await f.json(); } catch { return false; }
  const c = comments.find(x => x.id === commentId);
  if (!c) return false;
  c.resolved = true; c.resolved_by = by; c.resolved_at = Date.now();
  await Bun.write(loc, JSON.stringify(comments, null, 2));
  return true;
}

async function getNotes(repoId: string, branch?: string): Promise<Note[]> {
  await ensureDir(repoStateDir(repoId));
  const f = Bun.file(join(repoStateDir(repoId), "notes.json"));
  if (await f.exists()) { try { const n: Note[] = await f.json(); return branch ? n.filter(x => x.branch === branch && !x.dismissed) : n; } catch {} }
  return [];
}

async function dismissNote(repoId: string, noteId: string, by = "user") {
  const loc = join(repoStateDir(repoId), "notes.json");
  const f = Bun.file(loc);
  if (!(await f.exists())) return false;
  let notes: Note[] = [];
  try { notes = await f.json(); } catch { return false; }
  const n = notes.find(x => x.id === noteId);
  if (!n) return false;
  n.dismissed = true; n.dismissed_by = by; n.dismissed_at = Date.now();
  await Bun.write(loc, JSON.stringify(notes, null, 2));
  return true;
}

// Git
async function isGitRepo(p: string) { try { await simpleGit(p).status(); return true; } catch { return false; } }
function repoName(p: string) { return basename(p); }

async function getDefaultBranch(repoPath: string) {
  const git = simpleGit(repoPath);
  try { const r = await git.remote(["show", "origin"]); if (r) { const m = r.match(/HEAD branch:\\s*(\\S+)/); if (m) return m[1]; } } catch {}
  const b = await git.branchLocal();
  for (const n of ["main", "master", "develop"]) if (b.all.includes(n)) return n;
  return b.current || "main";
}

interface DiffFile { path: string; status: string; additions: number; deletions: number; patch: string; viewed: boolean; }

async function getDiff(repoPath: string, baseBranch: string, mode: string) {
  const git = simpleGit(repoPath);
  const br = (await git.branch()).current;
  const cm = (await git.revparse(["HEAD"])).trim().slice(0, 7);
  let files: DiffFile[] = [];

  if (mode === "working") {
    const status = await git.status();
    for (const fp of status.modified) {
      if (status.staged.includes(fp)) continue;
      const d = await git.diff([fp]);
      files.push({ path: fp, status: "modified", additions: (d.match(/^\\+[^+]/gm) || []).length, deletions: (d.match(/^-[^-]/gm) || []).length, patch: d, viewed: false });
    }
    for (const fp of status.not_added) {
      const c = await Bun.file(join(repoPath, fp)).text().catch(() => "");
      files.push({ path: fp, status: "untracked", additions: c.split("\\n").length, deletions: 0, patch: "", viewed: false });
    }
  } else if (mode === "staged") {
    const d = await git.diff(["--cached", "--name-status"]);
    if (d.trim()) {
      for (const line of d.trim().split("\\n")) {
        const [st, ...pp] = line.split("\\t");
        const fp = pp.join("\\t");
        if (!fp) continue;
        const pd = await git.diff(["--cached", "--", fp]);
        files.push({ path: fp, status: st.startsWith("A") ? "added" : st.startsWith("D") ? "deleted" : "modified", additions: (pd.match(/^\\+[^+]/gm) || []).length, deletions: (pd.match(/^-[^-]/gm) || []).length, patch: pd, viewed: false });
      }
    }
  } else {
    let mb: string;
    try { mb = (await git.raw(["merge-base", baseBranch, "HEAD"])).trim(); } catch { mb = baseBranch; }
    const d = await git.diff([mb, "--name-status"]);
    if (d.trim()) {
      for (const line of d.trim().split("\\n")) {
        const [st, ...pp] = line.split("\\t");
        const fp = pp.join("\\t");
        if (!fp) continue;
        const pd = await git.diff([mb, "--", fp]);
        files.push({ path: fp, status: st.startsWith("A") ? "added" : st.startsWith("D") ? "deleted" : "modified", additions: (pd.match(/^\\+[^+]/gm) || []).length, deletions: (pd.match(/^-[^-]/gm) || []).length, patch: pd, viewed: false });
      }
    }
  }
  return { files, branch: br, commit: cm, repo_path: repoPath, mode, base_branch: baseBranch };
}

// Server
async function startServer(port: number) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const p = url.pathname;
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
      if (req.method === "OPTIONS") return new Response(null, { headers: cors });

      if (p.startsWith("/api/")) {
        try {
          const r = await handleApi(req, url);
          const h = new Headers(r.headers);
          for (const [k, v] of Object.entries(cors)) h.set(k, v);
          return new Response(r.body, { status: r.status, headers: h });
        } catch (e: any) {
          return Response.json({ error: e.message || "Error" }, { status: 500, headers: cors });
        }
      }

      let fp = p === "/" ? "/index.html" : p;
      const a = assets.get(fp) || assets.get(fp.slice(1));
      if (a) return new Response(Buffer.from(a, "base64"), { headers: { "Content-Type": getMimeType(fp) } });
      const idx = assets.get("index.html");
      if (idx) return new Response(Buffer.from(idx, "base64"), { headers: { "Content-Type": "text/html" } });
      return new Response("Not found", { status: 404 });
    }
  });
  console.log(\`Server running at http://localhost:\${port}\`);
  return server;
}

async function handleApi(req: Request, url: URL): Promise<Response> {
  const p = url.pathname, m = req.method;
  const getRepoReq = async () => { const id = url.searchParams.get("repo"); return id ? await getRepo(id) : await getCurrentRepo(); };

  if (p === "/api/repos" && m === "GET") { const s = await getReposState(); return Response.json({ repos: s.repos, currentRepo: s.currentRepo }); }
  if (p === "/api/repos" && m === "POST") { const { path: rp } = await req.json() as any; if (!rp || !(await isGitRepo(rp))) return Response.json({ error: "Invalid" }, { status: 400 }); const bb = await getDefaultBranch(rp); return Response.json(await addRepo(rp, repoName(rp), bb)); }
  if (p.startsWith("/api/repos/") && m === "DELETE") { const id = p.split("/")[3]; return (await removeRepo(id)) ? Response.json({ success: true }) : Response.json({ error: "Not found" }, { status: 404 }); }
  if (p === "/api/repos/current" && m === "POST") { const { id } = await req.json() as any; return (await setCurrentRepo(id)) ? Response.json({ success: true }) : Response.json({ error: "Not found" }, { status: 404 }); }

  if (p === "/api/diff" && m === "GET") {
    const repo = await getRepoReq(); if (!repo) return Response.json({ error: "No repo" }, { status: 400 });
    const mode = url.searchParams.get("mode") || "branch";
    const diff = await getDiff(repo.path, repo.baseBranch, mode);
    const git = simpleGit(repo.path);
    const br = (await git.branch()).current, cm = (await git.revparse(["HEAD"])).trim().slice(0, 7);
    const v = await getViewed(repo.id, br, cm);
    diff.files = diff.files.map(f => ({ ...f, viewed: v[f.path] || false }));
    return Response.json(diff);
  }

  if (p === "/api/mark-viewed" && m === "POST") { const repo = await getRepoReq(); if (!repo) return Response.json({ error: "No repo" }, { status: 400 }); const { file_path } = await req.json() as any; const git = simpleGit(repo.path); const br = (await git.branch()).current, cm = (await git.revparse(["HEAD"])).trim().slice(0, 7); await setViewed(repo.id, br, cm, file_path, true); return Response.json({ success: true }); }
  if (p === "/api/unmark-viewed" && m === "POST") { const repo = await getRepoReq(); if (!repo) return Response.json({ error: "No repo" }, { status: 400 }); const { file_path } = await req.json() as any; const git = simpleGit(repo.path); const br = (await git.branch()).current, cm = (await git.revparse(["HEAD"])).trim().slice(0, 7); await setViewed(repo.id, br, cm, file_path, false); return Response.json({ success: true }); }

  if (p === "/api/stage" && m === "POST") { const repo = await getRepoReq(); if (!repo) return Response.json({ error: "No repo" }, { status: 400 }); const { file_path } = await req.json() as any; await simpleGit(repo.path).add(file_path); return Response.json({ success: true }); }
  if (p === "/api/unstage" && m === "POST") { const repo = await getRepoReq(); if (!repo) return Response.json({ error: "No repo" }, { status: 400 }); const { file_path } = await req.json() as any; await simpleGit(repo.path).reset(["HEAD", "--", file_path]); return Response.json({ success: true }); }
  if (p === "/api/discard" && m === "POST") { const repo = await getRepoReq(); if (!repo) return Response.json({ error: "No repo" }, { status: 400 }); const { file_path } = await req.json() as any; const git = simpleGit(repo.path); const s = await git.status(); if (s.not_added.includes(file_path)) await Bun.$\`rm \${join(repo.path, file_path)}\`; else await git.checkout(["--", file_path]); return Response.json({ success: true }); }
  if (p === "/api/commit" && m === "POST") { const repo = await getRepoReq(); if (!repo) return Response.json({ error: "No repo" }, { status: 400 }); const { message } = await req.json() as any; if (!message) return Response.json({ error: "Message required" }, { status: 400 }); const r = await simpleGit(repo.path).commit(message); return Response.json({ commit: r.commit }); }

  if (p === "/api/comments" && m === "GET") { const repo = await getRepoReq(); if (!repo) return Response.json({ error: "No repo" }, { status: 400 }); const br = (await simpleGit(repo.path).branch()).current; return Response.json(await getComments(repo.id, br)); }
  if (p === "/api/comments" && m === "POST") { const repo = await getRepoReq(); if (!repo) return Response.json({ error: "No repo" }, { status: 400 }); const { file_path, line_number, text } = await req.json() as any; const git = simpleGit(repo.path); const br = (await git.branch()).current, cm = (await git.revparse(["HEAD"])).trim().slice(0, 7); return Response.json(await addComment(repo.id, { file_path, line_number, text, branch: br, commit: cm })); }
  if (p === "/api/comments/resolve" && m === "POST") { const repo = await getRepoReq(); if (!repo) return Response.json({ error: "No repo" }, { status: 400 }); const { comment_id, resolved_by } = await req.json() as any; return (await resolveComment(repo.id, comment_id, resolved_by)) ? Response.json({ success: true }) : Response.json({ error: "Not found" }, { status: 404 }); }

  if (p === "/api/notes" && m === "GET") { const repo = await getRepoReq(); if (!repo) return Response.json({ error: "No repo" }, { status: 400 }); const br = (await simpleGit(repo.path).branch()).current; return Response.json(await getNotes(repo.id, br)); }
  if (p === "/api/notes/dismiss" && m === "POST") { const repo = await getRepoReq(); if (!repo) return Response.json({ error: "No repo" }, { status: 400 }); const { note_id, dismissed_by } = await req.json() as any; return (await dismissNote(repo.id, note_id, dismissed_by)) ? Response.json({ success: true }) : Response.json({ error: "Not found" }, { status: 404 }); }

  if (p === "/api/health") return Response.json({ status: "ok" });
  return Response.json({ error: "Not found" }, { status: 404 });
}

// CLI
program.name("cerebro").description("Git diff review tool").version(VERSION);

program.command("start").description("Start server").argument("[path]", "Repository path").option("-p, --port <n>", "Port", "3030").option("-o, --open", "Open browser")
  .action(async (rp: string | undefined, opts: { port: string; open?: boolean }) => {
    const p = resolve(rp || process.cwd());
    const port = parseInt(opts.port, 10);
    if (!(await isGitRepo(p))) { console.error(\`Error: \${p} is not a git repository\`); process.exit(1); }
    const bb = await getDefaultBranch(p);
    const repo = await addRepo(p, repoName(p), bb);
    await setCurrentRepo(repo.id);
    console.log(\`Starting Cerebro for \${repo.name}\`);
    await startServer(port);
    if (opts.open) Bun.spawn(["open", \`http://localhost:\${port}\`]);
    process.on("SIGINT", () => process.exit(0));
    process.on("SIGTERM", () => process.exit(0));
  });

const repoCmd = program.command("repo").description("Manage repos");
repoCmd.command("add").argument("<path>").action(async (p: string) => { const path = resolve(p); if (!(await isGitRepo(path))) { console.error("Not a git repo"); process.exit(1); } const bb = await getDefaultBranch(path); const r = await addRepo(path, repoName(path), bb); console.log(\`Added: \${r.name} (\${r.id})\`); });
repoCmd.command("list").action(async () => { const s = await getReposState(); if (s.repos.length === 0) { console.log("No repos"); return; } for (const r of s.repos) console.log(\`\${r.name}\${r.id === s.currentRepo ? " *" : ""} - \${r.path}\`); });
repoCmd.command("remove").argument("<id>").action(async (id: string) => { console.log((await removeRepo(id)) ? "Removed" : "Not found"); });

program.parse();
`;

// Write server file
const serverPath = path.join(buildDir, "server.ts");
await writeFile(serverPath, serverCode);
console.log("📝 Generated embedded server code");

// Compile to executable
console.log("\n🔨 Compiling to single executable with Bun...");
const exePath = path.join(buildDir, "cerebro");

try {
  await $`bun build ${serverPath} --compile --minify --outfile ${exePath}`;

  const stats = await stat(exePath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

  console.log("\n✅ Build successful!");
  console.log(`📦 Executable: ${exePath}`);
  console.log(`📏 Size: ${sizeMB} MB`);
  console.log("\n🚀 Usage:");
  console.log(`   ${exePath} start`);
  console.log(`   ${exePath} start /path/to/repo -p 3030 -o`);
  console.log(`   ${exePath} repo list`);
} catch (error) {
  console.error("❌ Build failed:", error);
  process.exit(1);
}
