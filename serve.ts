/* serve.ts — tiny static dev server so index.html loads dist assets.
 * Run with: bun run dev  (builds once) or bun run serve.
 */
import { serve } from "bun";

const ROOT = import.meta.dir;
const PORT = Number(process.env.PORT) || 5173;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let path = decodeURIComponent(url.pathname);
    if (path === "/") path = "/index.html";
    const file = Bun.file(ROOT + path);
    if (await file.exists()) {
      const ext = path.slice(path.lastIndexOf("."));
      return new Response(file, {
        headers: { "content-type": MIME[ext] || "application/octet-stream" },
      });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`🐜  Neural Ant Farm → http://localhost:${PORT}`);