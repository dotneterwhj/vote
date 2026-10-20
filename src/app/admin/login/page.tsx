"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/* ── 选票入场：票箱 + 不规则节奏落票 ─────────────────────────
   页面唯一的装饰与动效。选票从视口上方落下，落入右下票箱并逐张
   堆叠；节奏刻意不均匀（随机 0.9–2.6s），像现场陆陆续续的进场
   投票。投满一箱后被整体「收走」，开始新一轮。
   prefers-reduced-motion 时静止为一摞已投的票。 */

const BALLOT_LABELS = ["A", "B", "C", "D", "E", "F", "H"];
const MAX_IN_BOX = 7;

interface Ballot {
  id: number;
  label: string;
  x: number; // 落点（容器百分比，保持在箱口范围）
  tilt: number;
  drift: number;
  duration: number;
  restY: number; // 箱内堆叠高度 px
  leaving: boolean;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function BallotCanvas() {
  const reduced = useReducedMotion();
  const [ballots, setBallots] = useState<Ballot[]>([]);
  const stackRef = useRef<Ballot[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const drop = () => {
      const id = nextId.current++;
      const slot = stackRef.current.filter((b) => !b.leaving).length;
      const ballot: Ballot = {
        id,
        label: BALLOT_LABELS[id % BALLOT_LABELS.length],
        x: 38 + Math.random() * 18,
        tilt: -8 + Math.random() * 16,
        drift: -14 + Math.random() * 28,
        duration: 1.5 + Math.random() * 1.1,
        restY: 44 + slot * 9,
        leaving: false,
      };
      if (slot >= MAX_IN_BOX) {
        // 投满一箱：整箱收走，新票开启下一轮
        stackRef.current = [
          ...stackRef.current.map((b) => ({ ...b, leaving: true })),
          ballot,
        ];
        setTimeout(() => {
          stackRef.current = stackRef.current.filter((b) => !b.leaving);
          setBallots([...stackRef.current]);
        }, 700);
      } else {
        stackRef.current = [
          ...stackRef.current.filter((b) => !b.leaving),
          ballot,
        ];
      }
      setBallots([...stackRef.current]);
      timer = setTimeout(drop, 900 + Math.random() * 1700);
    };
    timer = setTimeout(drop, 500);
    return () => clearTimeout(timer);
  }, [reduced]);

  return (
    <div aria-hidden className="relative h-full min-h-64 w-full overflow-hidden">
      {/* 票箱，唯一具象元素 */}
      <div className="absolute bottom-16 left-1/2 h-40 w-60 -translate-x-1/2 sm:w-72">
        {/* 箱背板 */}
        <div className="absolute inset-0 rounded-lg border border-slate-700/60 bg-slate-800/40" />
        {/* reduced-motion：静止的一摞票 */}
        {reduced &&
          [0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="absolute inset-x-4 h-6 rounded-sm border border-slate-700/80 bg-slate-700/60"
              style={{
                bottom: `${12 + i * 8}px`,
                transform: `rotate(${(i % 2 ? 1 : -1) * (1.5 + i)}deg)`,
              }}
            />
          ))}
        {/* 下落 / 堆叠中的选票（画在背板之上、前板之下，透过玻璃可见） */}
        {ballots.map((b) => (
          <div
            key={b.id}
            className={`ballot absolute flex h-10 w-16 items-center justify-center rounded-sm border border-slate-600 bg-slate-700/90 shadow-lg shadow-black/40 ${
              b.leaving ? "ballot-collect" : ""
            }`}
            style={
              reduced
                ? { left: `${b.x}%`, bottom: `${b.restY}px`, opacity: 0 }
                : {
                    left: `${b.x}%`,
                    bottom: `${b.restY}px`,
                    transform: `rotate(${b.tilt}deg)`,
                    animation: `ballot-drop ${b.duration}s cubic-bezier(.3,.7,.4,1) both`,
                    ["--drift" as string]: `${b.drift}px`,
                  }
            }
          >
            <span className="text-xs font-medium text-slate-300">{b.label}</span>
          </div>
        ))}
        {/* 箱前板：半透明玻璃 + 投票口 */}
        <div className="absolute inset-0 rounded-lg border border-slate-600/70 bg-slate-800/30 backdrop-blur-[2px]">
          <div className="absolute inset-x-10 top-4 h-2.5 rounded-full border border-slate-500/80 bg-slate-950/80" />
        </div>
        <p className="absolute -bottom-7 inset-x-0 text-center text-xs tracking-[0.3em] text-slate-500">
          票箱
        </p>
      </div>

      <style>{`
        @keyframes ballot-drop {
          0% { translate: 0 -46vh; opacity: 0; }
          8% { opacity: 1; }
          60% { translate: var(--drift, 0px) -12vh; }
          92% { translate: 0 -5px; opacity: 1; }
          100% { translate: 0 0; opacity: 1; }
        }
        @keyframes ballot-collect {
          to { translate: 0 96px; opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ballot { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!password) return setError("请输入管理密码");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "登录失败");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/admin") ? next : "/admin");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative h-dvh overflow-hidden bg-slate-950">
      {/* 左侧竖排定位文字 */}
      <p
        aria-hidden
        className="absolute left-5 top-1/2 hidden -translate-y-1/2 text-sm leading-8 tracking-[0.5em] text-slate-600 md:block [writing-mode:vertical-rl]"
      >
        现场实时投票
      </p>

      <div className="grid h-full md:grid-cols-[1fr_1.1fr]">
        {/* 左：表单 */}
        <div className="flex items-center justify-center px-8">
          <div className="w-full max-w-sm">
            <h1 className="text-5xl font-bold tracking-tight text-slate-100">
              控场
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              实时投票管理后台。登录后可创建投票、
              生成入场二维码、在大屏上实时控场。
            </p>

            <form onSubmit={submit} className="mt-10">
              <label
                htmlFor="admin-password"
                className="block text-sm font-medium text-slate-300"
              >
                管理密码
              </label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
                className="mt-2 w-full border-0 border-b border-slate-700 bg-transparent px-0 py-2 text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-slate-400"
                placeholder="••••••••"
              />

              {error && (
                <p className="mt-3 text-sm text-rose-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-8 w-full border border-slate-600 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-slate-400 hover:bg-slate-900 disabled:opacity-40"
              >
                {submitting ? "验证中…" : "进入控场台"}
              </button>
            </form>
          </div>
        </div>

        {/* 右：票箱落票（唯一装饰） */}
        <div className="relative hidden items-center justify-center md:flex">
          <BallotCanvas />
        </div>
      </div>
    </main>
  );
}
