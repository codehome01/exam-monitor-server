import http from "http";
import { WebSocketServer } from "ws";

// --- Data stores ---
const clients = new Map();
const visitors = new Map();

// --- HTTP server (for visit tracking + CORS) ---
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url.startsWith("/visit")) {
    const urlParams = new URLSearchParams(req.url.replace("/visit?", ""));
    const id = urlParams.get("id") || "unknown";

    console.log(`👀 User ${id} visited the page`);
    visitors.set(id, Date.now());

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Visit recorded");
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const urlParams = new URLSearchParams(req.url.replace("/", ""));
  const id = urlParams.get("id");

  if (!id) {
    ws.close(1008, "Missing ID");
    return;
  }

  ws.isAlive = true;
  clients.set(id, ws);
  visitors.delete(id);

  console.log(`✅ User ${id} connected (JS active)`);

  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", (msg) => {
    if (msg.toString() === "alive") ws.isAlive = true;
  });

  ws.on("close", () => {
    console.warn(`❌ User ${id} disconnected`);
    clients.delete(id);
  });
});

setInterval(() => {
  const now = Date.now();

  for (const [id, time] of visitors.entries()) {
    if (!clients.has(id) && now - time > 2000) {
      console.warn(`🚨 User ${id} loaded page but never started JS`);
      visitors.delete(id);
    }
  }

  for (const [id, ws] of clients.entries()) {
    if (!ws.isAlive) {
      console.warn(`⚠️ ${id} is unresponsive -> forcing logout`);
      try {
        ws.send(
          JSON.stringify({ type: "forceLogout", reason: "Unresponsive" })
        );
      } catch (e) {
        console.error("Error sending logout:", e);
      }
      ws.terminate();
      clients.delete(id);
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 5000);

server.listen(8080, () =>
  console.log("🚀 Exam monitor running on http://localhost:8080")
);
