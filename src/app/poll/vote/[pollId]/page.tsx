"use client";

import { use, useCallback, useEffect, useState } from "react";
import { IdentityProvider, useIdentity } from "@/lib/auth/auth-context";
import type { VoteState } from "@/lib/types";
import { isDingTalk, isWeCom } from "@/lib/ua";
import { VoteGuard } from "@/components/vote-guard";

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function VotePageInner({ pollId }: { pollId: string }) {
  const identity = useIdentity();
  const [state, setState] = useState<VoteState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<string[] | null>(null);
  const [now, setNow] = useState(Date.now());

  const loadState = useCallback(async () => {
    const q = identity ? `?user_id=${encodeURIComponent(identity.userId)}` : "";
    const res = await fetch(`/api/vote/${pollId}/state${q}`, { cache: "no-store" });
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (res.ok) setState(await res.json());
  }, [pollId, identity]);

  useEffect(() => {
    void loadState();
    const timer = setInterval(loadState, 3000);
    const onVis = () => document.visibilityState === "visible" && void loadState();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadState]);

  // 本地倒计时秒表
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  if (notFound) {
    return <CenterCard>投票不存在或已被删除</CenterCard>;
  }
  if (!state || !identity) {
    return (
      <CenterCard>
        <div className="flex flex-col items-center justify-center gap-3">
          <svg className="h-8 w-8 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm font-medium text-slate-500">正在加载投票…</span>
        </div>
      </CenterCard>
    );
  }

  const { poll } = state;
  const allowedAuth = poll.allowed_auth ?? "any";

  if (allowedAuth === "dingtalk") {
    if (!isDingTalk()) {
      return <VoteGuard allowedAuth="dingtalk" />;
    }
  } else if (allowedAuth === "wecom") {
    if (!isWeCom()) {
      return <VoteGuard allowedAuth="wecom" />;
    }
  } else if (allowedAuth === "both") {
    if (!isDingTalk() && !isWeCom()) {
      return <VoteGuard allowedAuth="both" />;
    }
  }

  const ended =
    state.status === "ended" || (poll.expire_at > 0 && now > poll.expire_at);
  const remaining = poll.expire_at > 0 ? poll.expire_at - now : null;
  const isVoted = state.voted || submitted !== null;
  const myChoices = submitted ?? state.myChoices;

  const atMax = selected.length >= poll.max_choices;

  const toggle = (optId: string) => {
    if (ended || isVoted) return;
    setError("");
    setSelected((prev) => {
      if (prev.includes(optId)) return prev.filter((x) => x !== optId);
      if (prev.length >= poll.max_choices) return prev;
      return [...prev, optId];
    });
  };

  const canSubmit =
    !submitting &&
    !ended &&
    !isVoted &&
    selected.length >= poll.min_choices &&
    selected.length <= poll.max_choices;

  const submitBtnText = submitting
    ? "正在提交选票…"
    : selected.length === 0
      ? `请选择选项（需选 ${poll.min_choices === poll.max_choices
        ? `${poll.max_choices} 项`
        : `${poll.min_choices} ~ ${poll.max_choices} 项`
      }）`
      : selected.length < poll.min_choices
        ? `还需选择 ${poll.min_choices - selected.length} 项可提交`
        : `确认提交（已选 ${selected.length} 项）`;

  const submit = async () => {
    if (!canSubmit) {
      if (selected.length < poll.min_choices) {
        setError(`请至少选择 ${poll.min_choices} 项`);
      }
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/vote/${pollId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: identity.userId,
          option_ids: selected,
          nickname: identity.nickname,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitted(selected);
      } else if (data.code === "ALREADY_VOTED") {
        setSubmitted(null);
        await loadState();
      } else if (data.code === "ENDED" || data.code === "EXPIRED") {
        await loadState();
      } else {
        setError(data.error ?? "提交失败，请重试");
      }
    } catch {
      setError("网络异常，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  // ── 感谢页 ──
  if (isVoted) {
    const chosenOptions = poll.options.filter((o) => myChoices.includes(o.id));
    return (
      <CenterCard bg={poll.bg_image}>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-3xl shadow-sm border border-blue-100">
          🎉
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-slate-900">感谢参与！</h1>
        <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
          <svg className="h-3.5 w-3.5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          投票已成功提交
        </div>

        <div className="mt-6 text-left">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
            您所投的选项（{chosenOptions.length} 项）
          </p>
          <div className="space-y-2">
            {chosenOptions.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-3 text-sm font-semibold text-slate-800"
              >
                {o.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={o.image}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-full object-cover border border-slate-200"
                  />
                ) : (
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white shadow-sm"
                    style={{ backgroundColor: o.color }}
                  />
                )}
                <span className="flex-1 truncate">{o.label}</span>
                <span className="shrink-0 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/80">
                  已选
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-7 border-t border-slate-100 pt-4 text-center">
          <p className="text-xs text-slate-400">实时票数统计请关注现场大屏</p>
        </div>
      </CenterCard>
    );
  }

  // ── 结束页 ──
  if (ended) {
    return (
      <CenterCard bg={poll.bg_image}>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-3xl border border-slate-200">
          🔒
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">投票已结束</h1>
        <p className="mt-2 text-sm text-slate-500">感谢您的关注与参与</p>
      </CenterCard>
    );
  }

  // ── 投票表单 ──
  return (
    <BgWrapper bg={poll.bg_image}>
      <main className="relative mx-auto min-h-dvh max-w-md px-4 pb-36 pt-4">
        {/* 顶部投票信息卡片 */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-black tracking-tight text-slate-900 leading-snug">
            {poll.title}
          </h1>
          {poll.desc && (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {poll.desc}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {identity?.nickname && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 border border-blue-200/80">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                <span>当前投票人：{identity.nickname}</span>
              </div>
            )}
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 border border-slate-200/70">
              {poll.min_choices === poll.max_choices
                ? `需选择 ${poll.max_choices} 项`
                : `可选 ${poll.min_choices} ~ ${poll.max_choices} 项`}
            </span>
            {remaining !== null && (
              <span
                className={`rounded-full px-3 py-1 font-mono text-xs font-semibold ${remaining < 60000
                  ? "bg-rose-50 text-rose-600 border border-rose-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200/70"
                  }`}
              >
                剩余 {fmt(remaining)}
              </span>
            )}
          </div>
        </div>

        {/* 选满提示 */}
        {/* {atMax && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200/80 px-3.5 py-2.5 text-xs font-medium text-amber-800 shadow-sm">
            <span className="text-base leading-none">⚠️</span>
            <span>已选满 {poll.max_choices} 项，如需更换请先点击取消已选项</span>
          </div>
        )} */}

        {/* 选项列表 */}
        <div className="mt-4 space-y-3">
          {poll.options.map((o) => {
            const checked = selected.includes(o.id);
            const disabled = !checked && atMax;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                disabled={disabled}
                className={`group relative flex w-full items-center gap-3.5 rounded-2xl p-4 text-left transition-all select-none ${checked
                  ? "bg-blue-50/80 border-2 border-blue-600 shadow-md shadow-blue-500/10 ring-2 ring-blue-500/20 active:scale-[0.99] cursor-pointer"
                  : disabled
                    ? "bg-slate-100/70 border-2 border-slate-200/60 opacity-45 cursor-not-allowed"
                    : "bg-white border-2 border-slate-200/90 shadow-sm hover:border-slate-300 active:scale-[0.99] active:bg-slate-50 cursor-pointer"
                  }`}
              >
                {/* 勾选框 */}
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-all ${checked
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/30"
                    : "border-slate-300 bg-slate-50 group-active:border-slate-400"
                    }`}
                >
                  {checked && (
                    <svg
                      viewBox="0 0 16 16"
                      className="h-3.5 w-3.5 fill-none stroke-current stroke-[3]"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                    </svg>
                  )}
                </span>

                {o.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={o.image}
                    alt=""
                    className={`h-14 w-14 shrink-0 rounded-full object-cover border transition-all ${checked
                      ? "border-blue-500 ring-2 ring-blue-400/40"
                      : "border-slate-200"
                      }`}
                  />
                ) : (
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full shadow-sm ring-2 ring-white"
                    style={{ backgroundColor: o.color }}
                  />
                )}

                <span
                  className={`flex-1 text-sm font-semibold transition-colors ${checked ? "text-blue-950 font-bold" : "text-slate-800"
                    }`}
                >
                  {o.label}
                </span>

                {/* 已选徽章 */}
                {checked && (
                  <span className="shrink-0 rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm shadow-blue-600/20">
                    已选
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-center text-xs font-semibold text-rose-600">
            {error}
          </div>
        )}

        {/* 底部悬浮提交栏 */}
        <div className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-slate-200 px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-md">
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              style={{
                backgroundColor: canSubmit ? "#2563eb" : "#f1f5f9",
                color: canSubmit ? "#ffffff" : "#94a3b8",
                borderColor: canSubmit ? "#2563eb" : "#e2e8f0",
                WebkitAppearance: "none",
              }}
              className={`w-full h-12 rounded-xl px-4 font-bold text-base select-none flex items-center justify-center gap-2 border transition-all ${canSubmit
                ? "shadow-md shadow-blue-600/30 active:scale-[0.98] cursor-pointer"
                : "cursor-not-allowed opacity-90"
                }`}
            >
              {canSubmit ? (
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : !submitting && selected.length > 0 ? (
                <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
              ) : null}

              {submitting && (
                <svg
                  className="h-5 w-5 animate-spin shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="#ffffff"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
              )}
              <span
                className="whitespace-nowrap font-bold"
                style={{ color: canSubmit ? "#ffffff" : "#94a3b8" }}
              >
                {submitBtnText}
              </span>
            </button>
          </div>
        </div>
      </main>
    </BgWrapper>
  );
}

/** 移动端背景容器：无图时采用与钉钉原生白顶融合的雅致浅色背景，有图时毛玻璃遮罩 */
function BgWrapper({
  bg,
  children,
}: {
  bg?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-dvh w-full bg-[#f8fafc] text-slate-800 antialiased selection:bg-blue-100">
      {bg ? (
        <>
          <div
            className="fixed inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${bg})` }}
          />
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md" />
        </>
      ) : (
        <div className="fixed inset-0 bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/80 pointer-events-none" />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function CenterCard({
  children,
  bg,
}: {
  children: React.ReactNode;
  bg?: string;
}) {
  return (
    <BgWrapper bg={bg}>
      <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white p-7 shadow-xl shadow-slate-200/50 text-center">
          {children}
        </div>
      </main>
    </BgWrapper>
  );
}

export default function VotePage({
  params,
}: {
  params: Promise<{ pollId: string }>;
}) {
  const { pollId } = use(params);

  return (
    <IdentityProvider>
      <VotePageInner pollId={pollId} />
    </IdentityProvider>
  );
}
