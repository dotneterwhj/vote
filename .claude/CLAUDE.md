# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 命令

```bash
npm run dev      # 开发（node server.js，含 WebSocket，端口 3000）
npm run build    # 生产构建
npm run start    # 生产启动（NODE_ENV=production node server.js）
npx tsc --noEmit # 类型检查（无 lint/test 配置）
```

前置条件：本机 Docker Redis 容器（容器名 `redis`，端口 6379，密码 `admin`）。验证连通性：`docker exec redis redis-cli -a admin --no-auth-warning ping`。连接串在 `.env.local`（`REDIS_URL=redis://:admin@localhost:6379`）。

改动 `server.js` 后必须重启 dev server；仅改 `src/` 下的代码热重载即可。

## 架构

三端实时投票系统：管理后台（`/admin`）、手机 H5（`/poll/vote/[pollId]`）、现场大屏（`/screen/[pollId]`）。

**单进程模型**（理解本项目的关键）：`server.js`（原生 CommonJS，不经过 Next 编译）创建 HTTP server，同时承载：
- Next.js 请求处理（`app.getRequestHandler()`）
- WebSocket 服务（`ws` 库，路径 `/ws?poll_id=xxx`，按 poll_id 分房间）
- upgrade 分发：`/ws` 走 ws 房间，其余转交 `app.getUpgradeHandler()`（dev 下 Next 的 HMR 也是 WebSocket，漏转会坏热更新）

**跨模块通信**：server.js 与 Next bundle 不共享模块实例（两套模块注册表），唯一共享点是 `globalThis.__voteBus`（EventEmitter，见 `src/lib/bus.ts`）。数据流：

```
H5 POST 投票 → route handler → Redis Lua 原子提交（src/lib/redis.ts 定义 vote 命令）
  → poll-service.ts 组装快照 → bus.emit('votes-changed', pollId, snapshot)
  → server.js 存入 latest Map + pending Set → 300ms flusher 广播（latest-wins 合并）
```

**Redis key 结构**（构造唯一出处 `src/lib/keys.ts`）：
- `poll:{id}:meta` Hash（title/options JSON/max_choices/min_choices/expire_at/status/hidden）
- `poll:{id}:counts` Hash（option_id → 票数）
- `poll:{id}:voters` Set（排重）
- `poll:{id}:choices:{uid}` Set（个人所选，供感谢页展示）
- `poll:{id}:index` → 实际是 `poll:index` Set（所有 poll_id）

**核心约定**：
- 投票原子性靠 Lua 脚本（`src/lib/redis.ts` 的 VOTE_LUA，ioredis `defineCommand` 注册）：校验 status/expire/排重/选项合法性/数量范围，错误码 -1~-6 映射在 `poll-service.ts` 的 ERROR_CODE_MAP
- 截止时间是**懒过期**：不做定时器，读（`getEffectiveStatus`）和写（Lua -3 分支）时校验
- globalThis 单例模式防 dev 热重载泄漏：redis 客户端（`src/lib/redis.ts`）、bus（`src/lib/bus.ts`）都用 `??=` 守卫
- H5 不接 WS：REST 3s 轮询 `GET /api/vote/{id}/state`（**刻意不下发 counts** 防现场作弊）；大屏/后台面板走 WS + REST 兜底（`src/lib/use-snapshot-ws.ts`，含时钟校准倒计时 hook）
- 审计明细追加写 `.data/votes-{poll_id}.jsonl`（`src/lib/audit.ts`，gitignore，失败不阻塞投票）
- 控场动作（end/reset/visibility）与投票一样都会 `notify()` → 组快照 → emit → WS 广播

**身份**：`src/lib/auth/provider.ts` 抽象 AuthProvider；默认 DeviceFingerprintProvider（localStorage UUID 模拟微信 OpenID），WechatOAuthProvider 是留空的占位实现。

## 已知陷阱

- next 锁定 15.5.x（npm latest 是 16）；`next.config.ts` 不要加 `output: 'standalone'`（与自定义 server 互斥）
- Next 15 动态路由 params 是 Promise，route handler 与页面都要 `await params` / `use()`
- ioredis `HSET` 对已存在 field 返回 0——不能用 hset 返回值判断"投票是否存在"，用 `hexists(meta, 'title')`（poll-service.ts 的 pollExists）
- ECharts 容器需要 definite 高度：flex 父链上用 `h-dvh` 而非 `min-h-dvh`，否则 canvas 高度为 0 不渲染
- ioredis `defineCommand` 注册在客户端创建时执行一次，改 Lua 后热重载不生效，需重启 dev server

*Always use Context7 when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.*