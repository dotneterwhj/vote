"use client";

import { useEffect, useState, useMemo } from "react";
import type { PollVoterRecord } from "@/lib/poll-service";

interface VotersModalProps {
  isOpen: boolean;
  onClose: () => void;
  pollId: string;
  pollTitle: string;
}

export function VotersModal({
  isOpen,
  onClose,
  pollId,
  pollTitle,
}: VotersModalProps) {
  const [loading, setLoading] = useState(false);
  const [voters, setVoters] = useState<PollVoterRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setKeyword("");
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/admin/polls/${pollId}/export?format=json`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `请求失败 (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        setVoters(data.voters || []);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "获取投票名单失败");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, pollId]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return voters;
    return voters.filter((v) => {
      const name = (v.nickname || "").toLowerCase();
      const uid = (v.user_id || "").toLowerCase();
      const labels = v.option_labels.join(" ").toLowerCase();
      return name.includes(q) || uid.includes(q) || labels.includes(q);
    });
  }, [voters, keyword]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between border-b border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                投票人员明细
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                投票主题：<span className="text-slate-200">{pollTitle}</span>
              </p>
            </div>
            <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400 ring-1 ring-blue-500/20">
              共 {voters.length} 人投票
            </span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`/api/admin/polls/${pollId}/export`}
              download
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-emerald-500 active:scale-95"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              导出 CSV / Excel
            </a>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              title="关闭"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* 筛选与搜索 */}
        <div className="border-b border-slate-800/80 bg-slate-900/50 px-5 py-3">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索姓名、投票人ID 或所选选项…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-1.5 pl-9 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <svg
              className="absolute left-2.5 top-2 h-4 w-4 text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        {/* 列表内容区 */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex h-48 items-center justify-center text-sm text-slate-400">
              加载投票人员名单中…
            </div>
          ) : error ? (
            <div className="rounded-lg bg-rose-500/10 p-4 text-center text-xs text-rose-400">
              {error}
            </div>
          ) : voters.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-slate-500">
              <span className="text-3xl">🗳️</span>
              <p className="mt-2 text-sm">当前暂无任何投票记录</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-36 items-center justify-center text-xs text-slate-500">
              未找到与“{keyword}”匹配的记录
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-2.5 pl-2 font-medium">#</th>
                  <th className="pb-2.5 font-medium">投票人姓名</th>
                  <th className="pb-2.5 font-medium">投票人ID</th>
                  <th className="pb-2.5 font-medium">所选选项</th>
                  <th className="pb-2.5 pr-2 text-right font-medium">
                    投票时间
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filtered.map((item, idx) => {
                  const timeStr = item.voted_at
                    ? new Date(item.voted_at).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                        hour12: false,
                      })
                    : "--";

                  return (
                    <tr
                      key={item.user_id + idx}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 pl-2 text-slate-500">{idx + 1}</td>
                      <td className="py-3 font-medium text-slate-100">
                        {item.nickname ? (
                          <div className="flex items-center gap-1.5">
                            <span>{item.nickname}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">
                            未填写
                          </span>
                        )}
                      </td>
                      <td className="py-3 font-mono text-slate-400 text-[11px] max-w-[140px] truncate" title={item.user_id}>
                        {item.user_id}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-1">
                          {item.option_labels.map((lbl, i) => (
                            <span
                              key={i}
                              className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-200"
                            >
                              {lbl}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 pr-2 text-right font-mono text-slate-400 text-[11px]">
                        {timeStr}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 弹窗底部 */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/60 px-5 py-3 text-xs text-slate-500">
          <span>
            显示 {filtered.length} / {voters.length} 条记录
          </span>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
