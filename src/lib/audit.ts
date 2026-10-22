import { getEnv } from "./env";

export interface AuditRecord {
  type: "vote" | "reset" | "end" | "create" | "delete" | "edit";
  poll_id: string;
  ts: number;
  user_id?: string;
  nickname?: string;
  option_ids?: string[];
}

export async function appendAudit(record: AuditRecord): Promise<void> {
  // Cloudflare Worker / Edge 环境下没有本地 Node.js 读写文件系统，安全跳过
  if (typeof process === "undefined" || !process.cwd) {
    return;
  }

  try {
    // 动态引入，避免在 Edge/Worker 环境构建时强依赖 node:fs
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path");
    const dir = path.resolve(process.cwd(), getEnv().dataDir);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `votes-${record.poll_id}.jsonl`);
    await fs.promises.appendFile(file, JSON.stringify(record) + "\n", "utf8");
  } catch {
    // 忽略只读文件系统或无本地磁盘环境下的文件写入
  }
}
