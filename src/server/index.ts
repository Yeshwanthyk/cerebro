import type { Server } from "bun";
import { matchRoute, handleRepoDelete } from "./routes";

export interface ServerOptions {
  port: number;
  // Optional embedded assets map (used by single-binary build)
  assets?: Map<string, { content: string; mimeType: string }>;
}

type BunServer = Server<unknown>;

let serverInstance: BunServer | null = null;

export function getServer(): BunServer | null {
  return serverInstance;
}

export async function startServer(options: ServerOptions): Promise<BunServer> {
  const { port } = options;

  // Embedded assets (populated during build)
  const embeddedAssets: Map<string, { content: string; mimeType: string }> =
    options.assets ||
    // Allow single-binary build to inject assets via globalThis
    ((globalThis as any).__EMBEDDED_ASSETS__ as Map<string, { content: string; mimeType: string }>) ||
    new Map();

  // CORS headers helper
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  serverInstance = Bun.serve({
    port,
    idleTimeout: 30,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Handle preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // API routes
      if (path.startsWith("/api/")) {
        try {
          const response = await handleApi(req, url);
          const headers = new Headers(response.headers);
          for (const [key, value] of Object.entries(corsHeaders)) {
            headers.set(key, value);
          }
          return new Response(response.body, {
            status: response.status,
            headers,
          });
        } catch (error) {
          console.error("API error:", error);
          return Response.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500, headers: corsHeaders }
          );
        }
      }

      // Production: serve from embedded assets
      return serveStatic(path, embeddedAssets);
    },
  });

  console.log(`Server running at http://localhost:${port}`);
  return serverInstance;
}

export function stopServer(): void {
  if (serverInstance) {
    serverInstance.stop();
    serverInstance = null;
  }
}

// API route handler
async function handleApi(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  // Check for dynamic DELETE route first
  if (method === "DELETE" && path.startsWith("/api/repos/")) {
    const response = await handleRepoDelete(path);
    if (response) return response;
  }

  // Match against route table
  const route = matchRoute(path, method);
  if (route) {
    return route.handler(req, url);
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

// Static file serving (production only - assets embedded in binary)
function serveStatic(
  path: string,
  embeddedAssets: Map<string, { content: string; mimeType: string }>
): Response {
  // Normalize path
  let filePath = path === "/" ? "/index.html" : path;

  // Check embedded assets (production)
  const embedded = embeddedAssets.get(filePath) || embeddedAssets.get(filePath.slice(1));
  if (embedded) {
    const content = Buffer.from(embedded.content, "base64");
    return new Response(content, {
      headers: { "Content-Type": embedded.mimeType },
    });
  }

  // Fallback: return index.html for SPA routing
  const indexAsset = embeddedAssets.get("index.html") || embeddedAssets.get("/index.html");
  if (indexAsset) {
    const content = Buffer.from(indexAsset.content, "base64");
    return new Response(content, {
      headers: { "Content-Type": "text/html" },
    });
  }

  return new Response("Not found", { status: 404 });
}
