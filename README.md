# 实时投票系统

三端现场实时投票系统：**管理后台**（配置/二维码/控场）、**手机端 H5**（扫码投票）、**现场大屏**（实时排行动画）。

## 技术栈

- Next.js 15（App Router）+ React 19 + Tailwind CSS v4
- 自定义 server（`server.js`）：`ws` WebSocket 房间 + 300ms 节流聚合广播
- Redis：Lua 脚本原子投票（排重 + 计数 + 记录所选）
- ECharts：`realtimeSort` 横向条形竞速排行
- 审计：投票明细追加写 `.data/votes-{poll_id}.jsonl`

## 快速启动

```bash
# 1. 启动 Redis（本机已有 Docker 容器时跳过）
docker run -d --name vote-redis -p 6379:6379 redis:7-alpine redis-server --requirepass admin

# 2. 配置环境
cp .env.example .env.local   # 默认 redis://:admin@localhost:6379

# 3. 安装并启动
npm install
npm run dev                  # http://localhost:3000
```

生产模式：

```bash
npm run build
npm run start
```

## 使用流程

1. 打开 `/admin` → 创建投票（主题、选项、最少/最多可选、截止时间可留空=手动结束）
2. 控场面板（`/admin/poll/{id}`）：下载/展示二维码、复制投票链接、打开大屏演示页
3. 观众手机扫码 → `/poll/vote/{id}` 投票（身份为设备指纹模拟，见 `src/lib/auth/provider.ts`）
4. 大屏投屏 `/screen/{id}`：实时票数排行、总票数、倒计时、右下角补扫二维码
5. 控场开关：手动提前结束 / 一键清空重投 / 隐藏票数

## 架构

```
node server.js（单进程）
├── Next.js route handlers（API + 页面）
│     └── lib/poll-service.ts ── Lua 原子投票 / 快照构建
│     └── lib/bus.ts ── globalThis EventEmitter（唯一跨模块通道）
└── ws 房间（/ws?poll_id=xxx）
      └── latest Map + pending Set + 300ms flusher（latest-wins 合并）
```

- **WS 协议**：服务端唯一消息 `snapshot`（counts/total/voters/status/hidden/expire_at/server_ts）；连接即推初次快照；30s 心跳
- **H5**：不接 WS（REST 3s 轮询 state，不含 counts 防作弊）
- **大屏/后台面板**：WS 为主 + REST 兜底 + 假连接看门狗
- **截止时间**：懒过期（读/写时校验，无定时器）

1.在钉钉开发者后台安全设置页面增加
- 重定向URL（回调域名）
- 端内免登地址

2.windows
$env:NODE_ENV="production"

