import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export function createServer({ apiUrl = process.env.CLEANMATE_API_URL || "http://localhost:5238", root = process.env.CLEANMATE_ADMIN_ROOT || fileURLToPath(new URL(".", import.meta.url)) } = {}) {
  const api = new URL(apiUrl);
  if (!["http:", "https:"].includes(api.protocol) || api.username || api.password || api.pathname !== "/") throw new Error("CLEANMATE_API_URL must be an HTTP(S) origin without credentials.");
  return http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "same-origin");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    response.setHeader("Cache-Control", "no-store");
    const url = new URL(request.url, "http://localhost");
    try {
      if (url.pathname.startsWith("/api/")) {
        if (!(url.pathname === "/api/auth/login" || ["/api/auth/forgot-password","/api/auth/reset-password","/api/auth/request-email-verification","/api/auth/verify-email"].includes(url.pathname) || url.pathname === "/api/auth/change-password" || url.pathname === "/api/auth/logout-all" || url.pathname === "/api/me" || /^\/api\/notifications(?:\/(?:unread-count|read-all|\d+\/read))?$/.test(url.pathname) || url.pathname === "/api/management" || url.pathname.startsWith("/api/management/"))) {
          response.writeHead(404).end(); return;
        }
        if (!["GET", "POST", "PUT"].includes(request.method)) { response.writeHead(405).end(); return; }
        let body = Buffer.alloc(0);
        for await (const chunk of request) {
          body = Buffer.concat([body, chunk]);
          if (body.length > 524288) { response.writeHead(413).end(); return; }
        }
        const headers = { Accept: "application/json", "Content-Type": "application/json" };
        // Overwrite any browser-supplied forwarding header with the actual peer.
        if (request.socket.remoteAddress) headers['X-Forwarded-For'] = request.socket.remoteAddress;
        if (request.headers.authorization) headers.Authorization = request.headers.authorization;
        const upstream = await fetch(new URL(url.pathname + url.search, api), {
          method: request.method, headers, body: body.length ? body : undefined,
          signal: AbortSignal.timeout(30000), redirect: "manual"
        });
        const retryAfter = upstream.headers.get('retry-after');
        response.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json", ...(retryAfter ? {'Retry-After':retryAfter} : {}) });
        response.end(Buffer.from(await upstream.arrayBuffer())); return;
      }
      const files = new Map([["/src/ui/core.js", "src/ui/core.js"], ["/src/ui/catalog.js", "src/ui/catalog.js"], ["/src/ui/preferences.js", "src/ui/preferences.js"], ["/src/ui/preferences.css", "src/ui/preferences.css"], ["/", "index.html"], ["/index.html", "index.html"], ["/src/app.js", "src/app.js"], ["/src/api.js", "src/api.js"], ["/src/support.js", "src/support.js"], ["/src/account.js", "src/account.js"], ["/src/password.js", "src/password.js"], ["/src/conversation.js", "src/conversation.js"], ["/src/notifications.js", "src/notifications.js"], ["/src/styles.css", "src/styles.css"]]);
      const file = files.get(url.pathname);
      if (!file || !["GET", "HEAD"].includes(request.method)) { response.writeHead(404).end(); return; }
      const content = await readFile(path.join(root, file));
      response.writeHead(200, { "Content-Type": file.endsWith(".js") ? "text/javascript; charset=utf-8" : file.endsWith(".css") ? "text/css; charset=utf-8" : "text/html; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch {
      if (!response.headersSent) response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ message: "Không thể kết nối API. Kiểm tra backend và thử lại." }));
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  createServer().listen(port, "127.0.0.1", () => console.log(`CleanMate Admin: http://127.0.0.1:${port}`));
}
