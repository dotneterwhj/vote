#!/usr/bin/env node
// 高并发投票压测：模拟 N 名观众在时间窗口内投票。
//
// 用法：
//   node scripts/loadtest.mjs                          # 默认 200 人 / 10s 窗口（新建投票）
//   node scripts/loadtest.mjs --users 200 --window 10  # 显式指定
//   node scripts/loadtest.mjs --poll <pollId>          # 压已有投票（不新建、不清数据，跳过预热/reset）
//   node scripts/loadtest.mjs --burst                  # 全部同时发出（瞬时洪峰）
//   node scripts/loadtest.mjs --readers 100            # 附加 H5 轮询读负载（1s 间隔）
//   node scripts/loadtest.mjs --base http://192.168.x.x:3000 --password xxx
//
// 流程：登录 →（新建模式：创建→预热→重置）→ 错峰投票 → 校验一致性。
import fs from "node:fs";

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const flag = (k) => process.argv.includes(k);

const BASE = arg("--base", "http://localhost:3000");
const USERS = parseInt(arg("--users", "200"), 10);
const WINDOW = parseFloat(arg("--window", "10"));
const OPTIONS = parseInt(arg("--options", "4"), 10);
const READERS = parseInt(arg("--readers", "0"), 10);
const BURST = flag("--burst");
const EXISTING_POLL = arg("--poll", null);

let PASSWORD = arg("--password", null);
if (!PASSWORD) {
  try {
    const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    PASSWORD = env.match(/^ADMIN_PASSWORD=(.*)$/m)?.[1]?.trim();
  } catch {}
}
if (!PASSWORD) {
  console.error("缺少密码：--password 或 .env.local 的 ADMIN_PASSWORD");
  process.exit(1);
}

const pct = (arr, p) => {
  if (arr.length === 0) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const ms = (v) => (Number.isFinite(v) ? `${Math.round(v)}ms` : "-");

// ── 1. 登录拿 cookie ──────────────────────────────────────────
const loginRes = await fetch(`${BASE}/api/admin/auth`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: PASSWORD }),
  signal: AbortSignal.timeout(10000),
});
if (!loginRes.ok) {
  console.error(`登录失败 ${loginRes.status}: ${await loginRes.text()}`);
  process.exit(1);
}
const cookie = loginRes.headers
  .getSetCookie()
  .find((c) => c.startsWith("admin_session="))
  ?.split(";")[0];
if (!cookie) {
  console.error("未拿到 admin_session cookie");
  process.exit(1);
}
const authHeaders = { Cookie: cookie, "Content-Type": "application/json" };

// ── 2. 确定目标投票：压已有投票 或 新建 ──────────────────────
let pollId;
let optionIds;
let minChoices = 1;
let maxChoices = 1;

if (EXISTING_POLL) {
  const state = await (
    await fetch(`${BASE}/api/vote/${EXISTING_POLL}/state?user_id=probe_${Date.now()}`)
  ).json();
  if (!state?.poll) {
    console.error(`投票 ${EXISTING_POLL} 不存在或不可读`);
    process.exit(1);
  }
  pollId = state.poll.poll_id;
  optionIds = state.poll.options.map((o) => o.id);
  minChoices = state.poll.min_choices;
  maxChoices = Math.min(state.poll.max_choices, optionIds.length);
  console.log(
    `poll_id = ${pollId}「${state.poll.title}」（压已有投票，${optionIds.length} 选项，选 ${minChoices}~${maxChoices} 项）`
  );
  if (state.status !== "active") {
    console.error(`⚠ 该投票状态为 ${state.status}，写入会全部 409。用后台"一键清空重投"恢复后再压。`);
  }
} else {
  const createRes = await fetch(`${BASE}/api/admin/polls`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      title: `压测 ${new Date().toLocaleTimeString("zh-CN")}`,
      options: Array.from({ length: OPTIONS }, (_, i) => `选项${i + 1}`),
      max_choices: 1,
      min_choices: 1,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    console.error(`创建投票失败: ${JSON.stringify(created)}`);
    process.exit(1);
  }
  pollId = created.poll.poll_id;
  optionIds = created.poll.options.map((o) => o.id);
  console.log(`poll_id = ${pollId}（${OPTIONS} 选 1）`);
}

// ── 按投票规则随机选 N 个不同选项（minChoices~maxChoices）────
function pickOptions() {
  const n =
    minChoices + Math.floor(Math.random() * (maxChoices - minChoices + 1));
  const pool = [...optionIds];
  const picked = [];
  for (let i = 0; i < n; i++) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return picked;
}

// ── 3. 新建投票才需要预热与重置（已有投票绝不能动现场数据）────
if (!EXISTING_POLL) {
  await fetch(`${BASE}/api/vote/${pollId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "warmup", option_ids: [optionIds[0]] }),
    signal: AbortSignal.timeout(30000),
  });
  await fetch(`${BASE}/api/admin/polls/${pollId}/reset`, {
    method: "POST",
    headers: authHeaders,
    signal: AbortSignal.timeout(10000),
  });
}

// ── 4. 读负载（可选）：模拟 H5 3s 轮询的读压力 ────────────────
const readLatencies = [];
let readersRunning = false;
async function reader(id) {
  while (readersRunning) {
    const t = performance.now();
    try {
      await fetch(`${BASE}/api/vote/${pollId}/state?uid=r${id}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      readLatencies.push(performance.now() - t);
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// ── 5. 发起投票 ───────────────────────────────────────────────
const runId = Date.now().toString(36);
const latencies = [];
const statusCounts = new Map();
const failSamples = [];
let okCount = 0;

async function voter(i) {
  const uid = `load_${runId}_${i}`;
  const opts = pickOptions();
  const t = performance.now();
  let res;
  try {
    res = await fetch(`${BASE}/api/vote/${pollId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: uid, option_ids: opts }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    latencies.push(performance.now() - t);
    statusCounts.set("network_error", (statusCounts.get("network_error") ?? 0) + 1);
    failSamples.push(`${uid}: ${e.message}`);
    return;
  }
  latencies.push(performance.now() - t);
  statusCounts.set(res.status, (statusCounts.get(res.status) ?? 0) + 1);
  if (res.ok) {
    okCount++;
  } else if (failSamples.length < 5) {
    failSamples.push(`${uid}: ${res.status} ${await res.text()}`);
  }
}

console.log(
  `\n▶ ${USERS} 人 ${BURST ? "瞬时并发（--burst）" : `摊在 ${WINDOW}s 窗口`}` +
    (READERS ? `，读负载 ${READERS} 路 × 1s 轮询` : "")
);
const t0 = performance.now();
readersRunning = READERS > 0;
const readerPromises = Array.from({ length: READERS }, (_, i) => reader(i));

await Promise.all(
  Array.from({ length: USERS }, (_, i) => {
    const delay = BURST ? 0 : Math.random() * WINDOW * 1000;
    return new Promise((r) => setTimeout(r, delay)).then(() => voter(i));
  })
);
const wall = (performance.now() - t0) / 1000;
readersRunning = false;
await Promise.allSettled(readerPromises);

// ── 6. 结果 ───────────────────────────────────────────────────
console.log(`\n耗时 ${wall.toFixed(1)}s（目标窗口 ${WINDOW}s）`);
console.log(`吞吐 ≈ ${(USERS / wall).toFixed(0)} req/s`);
const statusLine = [...statusCounts.entries()]
  .sort()
  .map(([s, n]) => `${s}×${n}`)
  .join("  ");
console.log(`状态码: ${statusLine}`);
console.log(
  `写延迟 p50=${ms(pct(latencies, 50))}  p95=${ms(pct(latencies, 95))}  p99=${ms(pct(latencies, 99))}  max=${ms(Math.max(...latencies))}`
);
if (READERS > 0) {
  console.log(
    `读延迟(${readLatencies.length} 次) p50=${ms(pct(readLatencies, 50))}  p95=${ms(pct(readLatencies, 95))}  max=${ms(Math.max(...readLatencies))}`
  );
}
if (failSamples.length) {
  console.log(`失败样例:\n  ${failSamples.join("\n  ")}`);
}

// ── 7. 一致性校验 ─────────────────────────────────────────────
const snap = await (await fetch(`${BASE}/api/screen/${pollId}`)).json();
const countsSum = Object.values(snap.counts).reduce((a, b) => a + b, 0);
let auditVotes = null;
if (EXISTING_POLL) {
  // 压已有投票：无法从 jsonl 区分现场票与压测票，直接跳过审计对账
  console.log("（压已有投票模式：审计对账跳过，以 counts/voters 为准）");
} else {
  try {
    const lines = fs
      .readFileSync(new URL(`../.data/votes-${pollId}.jsonl`, import.meta.url), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    // reset 之后的 vote 行才是本轮压测的（warmup 投票被 reset 清了账，但审计是追加写）
    const resetTs = Math.max(...lines.filter((l) => l.type === "reset").map((l) => l.ts));
    auditVotes = lines.filter((l) => l.type === "vote" && l.ts > resetTs).length;
  } catch {}
}

console.log(`\n一致性: counts 合计 ${countsSum} / 成功 ${okCount} · voters ${snap.voters}${auditVotes === null ? "" : ` · 审计 ${auditVotes} 行`}`);
// 压已有投票时现场原有数据未知，无法精确对账；只验证 counts 合计 ≥ 成功数
// （多选投票 total ≥ voters 是常态，二者相等仅单选成立）
const consistent =
  countsSum >= okCount &&
  snap.voters >= 1 &&
  (auditVotes === null || auditVotes === okCount);
console.log(consistent ? "✅ 账目一致" : "❌ 账目不一致，检查上方数字");
console.log(`控场页: ${BASE}/admin/poll/${pollId}`);
