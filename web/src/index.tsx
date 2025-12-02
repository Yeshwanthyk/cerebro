import { serve } from "bun";
import index from "./index.html";

// Get port from environment or default
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5173;
const backendPort = process.env.BACKEND_PORT ? parseInt(process.env.BACKEND_PORT, 10) : 3030;

const server = serve({
  port,
  routes: {
    // Proxy API requests to the Bun backend
    "/api/*": async (req) => {
      const url = new URL(req.url);
      const backendUrl = `http://localhost:${backendPort}${url.pathname}${url.search}`;

      try {
        const fetchOptions: RequestInit = {
          method: req.method,
          headers: req.headers,
        };
        if (req.method !== "GET" && req.method !== "HEAD") {
          fetchOptions.body = req.body;
        }
        const response = await fetch(backendUrl, fetchOptions);

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (error) {
        console.error("Proxy error:", error);
        return new Response(JSON.stringify({ error: "Backend server unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
    },

    // Serve images
    "/images/*": async (req) => {
      const url = new URL(req.url);
      const file = Bun.file(`./src${url.pathname}`);
      if (await file.exists()) {
        return new Response(file);
      }
      return new Response("Not found", { status: 404 });
    },

    // Serve index.html for all unmatched routes (SPA)
    "/*": index,
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Cerebro Web running at ${server.url}`);
console.log(`📡 Proxying API to http://localhost:${backendPort}`);
