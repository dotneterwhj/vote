"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { AllowedAuthType, PollMeta } from "@/lib/types";
import { useSnapshotWs, useCountdown } from "@/lib/use-snapshot-ws";
import { ConfirmModal } from "@/components/confirm-modal";
import { VotersModal } from "@/components/voters-modal";
import LiveMiniChart from "./live-mini-chart";

export default function PollControlPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const pollId = params.id;
  const { snapshot, connected } = useSnapshotWs(pollId);
  const [meta, setMeta] = useState<PollMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showVotersModal, setShowVotersModal] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/polls/${pollId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setMeta(d.poll))
      .catch(() => { });
  }, [pollId]);

  const remaining = useCountdown(
    snapshot?.expire_at ?? 0,
    snapshot?.server_ts
  );
  const expired =
    snapshot?.status === "ended" ||
    (snapshot ? snapshot.expire_at > 0 && remaining === 0 : false);

  const voteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/poll/vote/${pollId}`
      : `/poll/vote/${pollId}`;
  const screenUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/screen/${pollId}`
      : `/screen/${pollId}`;

  const action = async (path: string, body?: object) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/polls/${pollId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) {
        // 操作成功后重新拉取 meta
        fetch(`/api/admin/polls/${pollId}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d && setMeta(d.poll))
          .catch(() => { });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAuthModeChange = async (mode: AllowedAuthType) => {
    if (meta?.allowed_auth === mode || busy) return;
    await action("auth-mode", { allowed_auth: mode });
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(voteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDeleteConfirm = async () => {
    setBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/polls/${pollId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "删除失败");
      }
      setShowDeleteModal(false);
      router.replace("/admin");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "删除失败，请重试";
      setDeleteError(msg);
      setBusy(false);
    }
  };

  const title = meta?.title ?? "…";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/admin" className="text-sm text-slate-400 hover:text-slate-200">
            ← 返回列表
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{title}</h1>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${expired
            ? "bg-rose-500/15 text-rose-400"
            : "bg-emerald-500/15 text-emerald-400"
            }`}
        >
          {expired ? "已结束" : connected ? "实时连接中" : "连接中…"}
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        {/* 二维码区 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-center">
          <img
            src={`/api/qr?text=${encodeURIComponent(voteUrl)}&size=200`}
            alt="投票二维码"
            width={200}
            height={200}
            className="mx-auto rounded-lg bg-white p-2"
          />
          <p className="mt-3 text-xs text-slate-400">扫码投票</p>
          <div className="mt-3 flex gap-2">
            <a
              href={`/api/qr?text=${encodeURIComponent(voteUrl)}&size=600`}
              download={`vote-qr-${pollId}.png`}
              className="flex-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:border-slate-500"
            >
              下载二维码
            </a>
            <button
              onClick={copyLink}
              className="flex-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:border-slate-500"
            >
              {copied ? "已复制 ✓" : "复制链接"}
            </button>
          </div>
          <a
            href={screenUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block rounded-lg bg-blue-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            打开大屏演示页 ↗
          </a>
        </div>

        {/* 控场区 */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-3 text-sm font-medium text-slate-300">控场开关</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => action("end")}
                disabled={busy || expired}
                className="rounded-lg bg-rose-600/90 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-40"
              >
                手动提前结束
              </button>
              <button
                onClick={() => {
                  if (confirm("确认清空所有票数并重新开始投票？原投票人将可以再次投票。")) {
                    action("reset");
                  }
                }}
                disabled={busy}
                className="rounded-lg border border-amber-600/60 px-4 py-2 text-sm text-amber-400 hover:bg-amber-500/10 disabled:opacity-40"
              >
                一键清空重投
              </button>
              <button
                onClick={() => action("visibility", { hidden: !snapshot?.hidden })}
                disabled={busy}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
              >
                {snapshot?.hidden ? "显示票数" : "隐藏票数"}
              </button>
              <button
                onClick={() => setShowVotersModal(true)}
                className="rounded-lg border border-blue-600/60 bg-blue-500/10 px-4 py-2 text-sm text-blue-400 hover:bg-blue-500/20 hover:border-blue-500 transition-colors cursor-pointer"
              >
                查看投票名单
              </button>
              <a
                href={`/api/admin/polls/${pollId}/export`}
                download
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/60 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500 transition-colors cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                导出名单 (CSV)
              </a>
              {(snapshot?.voters ?? 0) === 0 ? (
                <Link
                  href={`/admin/poll/${pollId}/edit`}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                >
                  编辑投票
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  title="已有投票数据，不可编辑。如需修改可先「一键清空重投」"
                  className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-2 text-sm text-slate-600 cursor-not-allowed opacity-60"
                >
                  编辑投票
                </button>
              )}
              <button
                onClick={() => {
                  setDeleteError(null);
                  setShowDeleteModal(true);
                }}
                disabled={busy}
                className="rounded-lg border border-rose-900/60 bg-rose-500/10 px-4 py-2 text-sm text-rose-400 hover:bg-rose-500/20 hover:border-rose-600 disabled:opacity-40 transition-colors cursor-pointer"
              >
                删除投票
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <button
                type="button"
                onClick={() => setShowVotersModal(true)}
                className="rounded-lg bg-slate-800/60 p-3 text-center transition hover:bg-slate-800/90 cursor-pointer"
                title="点击查看具体投票人名单"
              >
                <div className="text-2xl font-bold text-blue-400">
                  {snapshot?.voters ?? 0}
                </div>
                <div className="text-xs text-slate-500 flex items-center justify-center gap-1">
                  <span>参与人数</span>
                  <span className="text-[10px] text-blue-400/80">↗</span>
                </div>
              </button>
              <div className="rounded-lg bg-slate-800/60 p-3">
                <div className="text-2xl font-bold text-emerald-400">
                  {snapshot?.total ?? 0}
                </div>
                <div className="text-xs text-slate-500">总票数</div>
              </div>
              <div className="rounded-lg bg-slate-800/60 p-3">
                <div className="text-2xl font-bold text-slate-200">
                  {snapshot?.expire_at
                    ? remaining === null
                      ? "--"
                      : `${Math.floor(remaining / 60000)}:${String(
                        Math.floor((remaining % 60000) / 1000)
                      ).padStart(2, "0")}`
                    : "∞"}
                </div>
                <div className="text-xs text-slate-500">剩余时间</div>
              </div>
            </div>
          </div>

          {/* 投票客户端认证设定 */}
          {(() => {
            const currentAuth = meta?.allowed_auth ?? "any";
            const dingTalkChecked = currentAuth === "dingtalk" || currentAuth === "both";
            const weComChecked = currentAuth === "wecom" || currentAuth === "both";

            const toggleDingTalk = () => {
              if (busy) return;
              const nextDingTalk = !dingTalkChecked;
              let nextMode: AllowedAuthType = "any";
              if (nextDingTalk && weComChecked) nextMode = "both";
              else if (nextDingTalk && !weComChecked) nextMode = "dingtalk";
              else if (!nextDingTalk && weComChecked) nextMode = "wecom";
              else nextMode = "any";
              handleAuthModeChange(nextMode);
            };

            const toggleWeCom = () => {
              if (busy) return;
              const nextWeCom = !weComChecked;
              let nextMode: AllowedAuthType = "any";
              if (dingTalkChecked && nextWeCom) nextMode = "both";
              else if (dingTalkChecked && !nextWeCom) nextMode = "dingtalk";
              else if (!dingTalkChecked && nextWeCom) nextMode = "wecom";
              else nextMode = "any";
              handleAuthModeChange(nextMode);
            };

            return (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-medium text-slate-300">投票客户端要求</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      若都不勾选，则表示均可以通过任何方式扫码投票
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${currentAuth === "any"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : currentAuth === "both"
                        ? "bg-blue-500/15 text-blue-400"
                        : currentAuth === "dingtalk"
                          ? "bg-sky-500/15 text-sky-400"
                          : "bg-teal-500/15 text-teal-400"
                      }`}
                  >
                    {currentAuth === "any"
                      ? "无限制"
                      : currentAuth === "both"
                        ? "仅限钉钉与企业微信"
                        : currentAuth === "dingtalk"
                          ? "仅限钉钉"
                          : "仅限企业微信"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* 钉钉投票复选卡片 */}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={toggleDingTalk}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition cursor-pointer ${dingTalkChecked
                      ? "border-sky-500/60 bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30"
                      : "border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                      }`}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${dingTalkChecked
                        ? "border-sky-500 bg-sky-500 text-white"
                        : "border-slate-600 bg-slate-800"
                        }`}
                    >
                      {dingTalkChecked && (
                        <svg
                          className="h-3.5 w-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-slate-200 text-xs">
                        🔷 钉钉投票
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        钉钉微应用扫码免登实名
                      </p>
                    </div>
                  </button>

                  {/* 企业微信投票复选卡片 */}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={toggleWeCom}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition cursor-pointer ${weComChecked
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30"
                      : "border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                      }`}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${weComChecked
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-slate-600 bg-slate-800"
                        }`}
                    >
                      {weComChecked && (
                        <svg
                          className="h-3.5 w-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-slate-200 text-xs">
                        🟢 企业微信投票
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        企业微信扫码静默授权实名
                      </p>
                    </div>
                  </button>
                </div>

                {/* 当前生效提示 */}
                <div className="mt-3 rounded-lg bg-slate-950/60 px-3 py-2 text-xs text-slate-400">
                  {currentAuth === "any" && (
                    <span>
                      💡 当前<span className="font-semibold text-emerald-400">未勾选任何平台限制</span>：微信、钉钉、企微及手机浏览器均可直接扫码投票。
                    </span>
                  )}
                  {currentAuth === "both" && (
                    <span>
                      🔒 已勾选钉钉与企微：必须使用<span className="font-semibold text-blue-400">钉钉或企业微信 App</span> 扫码实名参与。
                    </span>
                  )}
                  {currentAuth === "dingtalk" && (
                    <span>
                      🔒 已仅勾选钉钉：必须使用<span className="font-semibold text-sky-400">钉钉 App</span> 扫码实名参与。
                    </span>
                  )}
                  {currentAuth === "wecom" && (
                    <span>
                      🔒 已仅勾选企业微信：必须使用<span className="font-semibold text-emerald-400">企业微信 App</span> 扫码实名参与。
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 实时小图 */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-3 text-sm font-medium text-slate-300">实时票况</h2>
            <LiveMiniChart
              options={meta?.options ?? []}
              snapshot={snapshot}
              hidden={snapshot?.hidden ?? false}
            />
          </div>
        </div>
      </div>

      <VotersModal
        isOpen={showVotersModal}
        onClose={() => setShowVotersModal(false)}
        pollId={pollId}
        pollTitle={title}
      />

      <ConfirmModal
        isOpen={showDeleteModal}
        title="确认删除该投票？"
        danger
        loading={busy}
        error={deleteError}
        confirmText="确认删除"
        cancelText="取消"
        onCancel={() => {
          if (!busy) {
            setShowDeleteModal(false);
            setDeleteError(null);
          }
        }}
        onConfirm={handleDeleteConfirm}
        message={
          <div className="space-y-2">
            <p>
              确定要删除投票{" "}
              <span className="font-semibold text-slate-100">
                “{title}”
              </span>{" "}
              吗？
            </p>
            <p className="text-xs text-rose-400/90 leading-relaxed">
              ⚠ 此操作不可逆。删除后该投票的所有选票、选项及统计数据都将被彻底清除。
            </p>
          </div>
        }
      />
    </main>
  );
}
