import { mkdirSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import path from "node:path";
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
  try {
    const dir = path.resolve(process.cwd(), getEnv().dataDir);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `votes-${record.poll_id}.jsonl`);
    await appendFile(file, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    console.error("[audit] append failed:", err);
  }
}
