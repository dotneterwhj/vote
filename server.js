require("dotenv").config({ path: ".env" });
const { createServer } = require("http");
const next = require("next");
const { WebSocketServer, WebSocket } = require("ws");

const port = parseInt(process.env.PORT || "80", 10);
const host = process.env.HOSTNAME || process.env.HOST || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev, hostname: host, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const nextUpgradeHandler = app.getUpgradeHandler();
  const server = createServer((req, res) => handle(req, res));

  // ── WS 房间机制 ────────────────────────────────────────────
  const wss = new WebSocketServer({ noServer: true });
  /** pollId → Set<WebSocket> */
  const rooms = new Map();
  /** pollId → 最近一次快照（供新连接立即单发） */
  const latest = new Map();
  /** 本轮有变化、待广播的 pollId 集合 */
  const pending = new Set();

  const broadcast = (pollId, payload) => {
    const room = rooms.get(pollId);
    if (!room) return;
    const data = JSON.stringify(payload);
    for (const client of room) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, (err) => {
          if (err) client.terminate();
        });
      }
    }
  };

  // 300ms 节流 flusher：latest-wins 合并
  setInterval(() => {
    for (const pollId of pending) {
      const snap = latest.get(pollId);
      if (snap) broadcast(pollId, { type: "snapshot", snapshot: snap });
    }
    pending.clear();
  }, 300);

  // 30s 心跳：两周期无 pong 即 terminate
  setInterval(() => {
    for (const room of rooms.values()) {
      for (const client of room) {
        if (client.isAlive === false) {
          client.terminate();
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }
  }, 30000);

  // 监听 Next route handler 发出的变更事件（跨模块注册表仅此通道；
  // 快照由 route handler 组装后随事件附带，server.js 不接触 Redis）
  const g = globalThis;
  g.__voteBus ??= new (require("events").EventEmitter)();
  g.__voteBus.setMaxListeners(50);
  g.__voteBus.on("votes-changed", (pollId, snapshot) => {
    latest.set(pollId, snapshot);
    pending.add(pollId);
  });

  wss.on("connection", (ws, req) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    const url = new URL(req.url, "http://localhost");
    const pollId = url.searchParams.get("poll_id");
    if (!pollId) {
      ws.close(4000, "missing poll_id");
      return;
    }
    if (!rooms.has(pollId)) rooms.set(pollId, new Set());
    rooms.get(pollId).add(ws);

    // 初次快照：latest 已有则立即单发；没有（如服务器刚重启）则从内部 API 拉一次
    const snap = latest.get(pollId);
    if (snap) {
      ws.send(JSON.stringify({ type: "snapshot", snapshot: snap }));
    } else {
      fetch(`http://127.0.0.1:${port}/api/screen/${pollId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((fresh) => {
          if (!fresh || ws.readyState !== WebSocket.OPEN) return;
          latest.set(pollId, fresh);
          pending.add(pollId);
          ws.send(JSON.stringify({ type: "snapshot", snapshot: fresh }));
        })
        .catch(() => { });
    }

    ws.on("close", () => {
      const room = rooms.get(pollId);
      if (room) {
        room.delete(ws);
        if (room.size === 0) rooms.delete(pollId);
      }
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url, "http://localhost");
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } else {
      // 交还 Next（dev 下 /_next/webpack-hmr 是 WebSocket 通道）
      nextUpgradeHandler(req, socket, head);
    }
  });

  server.listen(port, host, () => {
    console.log(`> vote ready on http://${host === "0.0.0.0" ? "0.0.0.0 (all interfaces)" : host}:${port} (${dev ? "dev" : "production"})`);
  });
});
