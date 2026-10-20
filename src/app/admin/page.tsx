"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PollMeta } from "@/lib/types";
import { ConfirmModal } from "@/components/confirm-modal";

interface PollListItem extends PollMeta {
  voters?: number;
}

function StatusBadge({ poll }: { poll: PollMeta }) {
  const expired = poll.expire_at > 0 && Date.now() > poll.expire_at;
  const ended = poll.status === "ended" || expired;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        ended
          ? "bg-rose-500/15 text-rose-400"
          : "bg-emerald-500/15 text-emerald-400"
      }`}
    >
      {ended ? "已结束" : "进行中"}
    </span>
  );
}

export default function AdminListPage() {
  const [polls, setPolls] = useState<PollListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pollToDelete, setPollToDelete] = useState<PollMeta | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  };

  const handleDeleteConfirm = async () => {
    if (!pollToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/polls/${pollToDelete.poll_id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "删除失败");
      }
      setPolls((prev) => prev.filter((p) => p.poll_id !== pollToDelete.poll_id));
      setPollToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "删除失败，请重试";
      setDeleteError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/polls", { cache: "no-store" });
        if (res.ok && alive) {
          const data = await res.json();
          setPolls(data.polls);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">投票管理</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/create"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            + 创建投票
          </Link>
          <button
            onClick={logout}
            title="退出登录"
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:border-slate-500 hover:text-slate-200"
          >
            退出
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-400">加载中…</p>
      ) : polls.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
          还没有投票，点击右上角创建一个
        </p>
      ) : (
        <ul className="space-y-3">
          {polls.map((p) => {
            const hasVotes = (p.voters ?? 0) > 0;
            return (
              <li
                key={p.poll_id}
                className="rounded-xl border border-slate-800 bg-slate-900 p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-semibold">{p.title}</h2>
                      <StatusBadge poll={p} />
                      {p.hidden && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
                          票数隐藏
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {p.options.length} 个选项 · {p.voters ?? 0} 人参与 · 最多选 {p.max_choices} 项
                      {p.expire_at > 0 &&
                        ` · 截止 ${new Date(p.expire_at).toLocaleString("zh-CN")}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/admin/poll/${p.poll_id}`}
                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                    >
                      控场 →
                    </Link>
                    {!hasVotes ? (
                      <Link
                        href={`/admin/poll/${p.poll_id}/edit`}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                      >
                        编辑
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        title="该投票已有投票数据，不可编辑。如需修改请先在控场中一键清空重投"
                        className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-sm text-slate-600 cursor-not-allowed opacity-60"
                      >
                        编辑
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setPollToDelete(p);
                      }}
                      className="rounded-lg border border-rose-900/50 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-500/20 hover:border-rose-600 transition-colors cursor-pointer"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmModal
        isOpen={Boolean(pollToDelete)}
        title="确认删除投票？"
        danger
        loading={isDeleting}
        error={deleteError}
        confirmText="确认删除"
        cancelText="取消"
        onCancel={() => {
          if (!isDeleting) {
            setPollToDelete(null);
            setDeleteError(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
        message={
          pollToDelete ? (
            <div className="space-y-2">
              <p>
                确定要删除投票{" "}
                <span className="font-semibold text-slate-100">
                  “{pollToDelete.title}”
                </span>{" "}
                吗？
              </p>
              <p className="text-xs text-rose-400/90 leading-relaxed">
                ⚠ 此操作不可逆。删除后该投票的所有选票、选项及统计数据都将被彻底清除，相关页面将无法再访问。
              </p>
            </div>
          ) : null
        }
      />
    </main>
  );
}
