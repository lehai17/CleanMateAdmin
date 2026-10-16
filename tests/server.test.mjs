import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createServer } from "../server.mjs";

test("static server refuses repository files and proxies authenticated management requests without changing failures", async () => {
  const upstream = http.createServer((request, response) => {
    assert.equal(request.headers.authorization, "Bearer test-token");
    response.writeHead(403, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "Denied by backend" }));
  });
  upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
  const app = createServer({ apiUrl: `http://127.0.0.1:${upstream.address().port}` });
  app.listen(0, "127.0.0.1"); await once(app, "listening");
  const origin = `http://127.0.0.1:${app.address().port}`;
  try {
    const index = await fetch(origin);
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    for (const path of ["/.git/config", "/server.mjs", "/package.json", "/api/auth/register", "/api/orders", "/%2e%2e/backend/appsettings.json"])
      assert.equal((await fetch(origin + path)).status, 404);
    const denied = await fetch(origin + "/api/management/dashboard", { headers: { Authorization: "Bearer test-token" } });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).message, "Denied by backend");
  } finally { app.closeAllConnections(); upstream.closeAllConnections(); await Promise.all([new Promise(done => app.close(done)), new Promise(done => upstream.close(done))]); }
});
