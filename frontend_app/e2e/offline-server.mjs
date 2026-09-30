import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const folder = { id: "offline-area", name: "Offline service area", is_business_unit: true, business_unit_id: "offline-area", parent_id: null, created_at: 1, updated_at: 1 };
const templates = Array.from({ length: 105 }, (_, index) => ({ id: `template-${index}`, name: `Offline meeting ${index}`, folder_id: folder.id, prompts: {}, pre_session_talking_points: [], in_session_talking_points: [], created_at: 1, updated_at: 1, visibility: "all", analysis_workflow: "standard", speaker_identification_enabled: false, recording_disclaimer_enabled: false }));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".wasm": "application/wasm" };
const root = resolve("dist");
createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:3107");
  if (url.pathname.startsWith("/api/") || url.pathname === "/health/ready") {
    let data = [];
    if (url.pathname.endsWith("/auth/me")) data = { user_id: "offline-user", email: "offline@example.test", permission: "User", business_unit_id: folder.id, business_unit_ids: [folder.id], favourite_prompt_ids: [] };
    else if (url.pathname === "/api/v1/folders" || url.pathname === "/api/v1/templates") {
      const all = url.pathname.endsWith("folders") ? [folder] : templates;
      const limit = Number(url.searchParams.get("limit") ?? 100), offset = Number(url.searchParams.get("offset") ?? 0);
      data = { items: all.slice(offset, offset + limit), total: all.length, limit, offset, has_more: offset + limit < all.length };
    } else if (url.pathname.startsWith("/api/v1/templates/")) data = templates.find((item) => url.pathname.endsWith(`/${item.id}`));
    else if (url.pathname.startsWith("/api/v1/folders/")) data = folder;
    else if (url.pathname === "/health/ready") data = { status: "ok" };
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); return;
  }
  const path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
  if (!path.startsWith(root + "/") && !path.startsWith(root + "\\") && path !== root) { res.writeHead(403); res.end(); return; }
  try {
    const file = await readFile(path);
    res.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream" }); res.end(file);
  } catch {
    if (extname(path)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": "text/html" }); res.end(await readFile(resolve(root, "index.html")));
  }
}).listen(3107, "127.0.0.1");
