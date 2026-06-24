// daemon.mjs — JSON HTTP companion for the opencode-keybar menu app.
// Listens on 127.0.0.1 only. The menu bar app reaches it over an SSH tunnel
// (`ssh -N -L 127.0.0.1:PORT:127.0.0.1:PORT user@server`), so no remote port
// needs to be exposed publicly.
import http from "http";
import { getStatus, setProfile, addProfile, deleteProfile, getCredits } from "./keys-lib.mjs";

const PORT = parseInt(process.env.OPENCODE_KEYBAR_PORT || "47788", 10);
const HOST = process.env.OPENCODE_KEYBAR_HOST || "127.0.0.1";
const TOKEN = process.env.OPENCODE_KEYBAR_TOKEN || ""; // optional shared secret

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 65536) req.destroy(); });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({ __parseError: true }); }
    });
    req.on("error", () => resolve({}));
  });
}

function authorized(req) {
  if (!TOKEN) return true;
  const h = req.headers["authorization"] || "";
  return h === `Bearer ${TOKEN}`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  const path = url.pathname;

  if (path === "/health") return send(res, 200, { ok: true, service: "opencode-keybar", time: Date.now() });
  if (!authorized(req)) return send(res, 401, { error: "unauthorized" });

  try {
    if (req.method === "GET" && path === "/status") {
      return send(res, 200, { providers: getStatus() });
    }

    const profMatch = path.match(/^\/profiles\/([^/]+)$/);
    if (req.method === "GET" && profMatch) {
      const list = getStatus();
      const found = list.find((p) => p.provider === decodeURIComponent(profMatch[1]));
      if (!found) return send(res, 404, { error: "unknown provider" });
      return send(res, 200, found);
    }

    const credMatch = path.match(/^\/credits\/([^/]+)$/);
    if (req.method === "GET" && credMatch) {
      const result = getCredits(decodeURIComponent(credMatch[1]));
      return send(res, 200, result);
    }

    if (req.method === "POST" && path === "/set") {
      const b = await readBody(req);
      if (b.__parseError) return send(res, 400, { error: "invalid JSON" });
      const r = setProfile(b.provider, b.name);
      return send(res, r.ok ? 200 : 400, r);
    }

    if (req.method === "POST" && path === "/add") {
      const b = await readBody(req);
      if (b.__parseError) return send(res, 400, { error: "invalid JSON" });
      const r = addProfile(b.provider, b.name, b.key, b.description);
      return send(res, r.ok ? 200 : 400, r);
    }

    if (req.method === "POST" && path === "/delete") {
      const b = await readBody(req);
      if (b.__parseError) return send(res, 400, { error: "invalid JSON" });
      const r = deleteProfile(b.provider, b.name);
      return send(res, r.ok ? 200 : 400, r);
    }

    return send(res, 404, { error: "not found", path });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`opencode-keybar daemon listening on http://${HOST}:${PORT}`);
});
