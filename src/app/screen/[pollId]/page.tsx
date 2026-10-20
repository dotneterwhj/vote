"use client";

import { use, useEffect, useRef, useState, type ReactNode } from "react";
import * as echarts from "echarts";
import { useSnapshotWs, useCountdown } from "@/lib/use-snapshot-ws";
import type { PollMeta, Snapshot } from "@/lib/types";
import { computeRankByIndex, getBarColor } from "@/lib/chart";

function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

const QR_SIZES = [140, 440] as const;

export default function ScreenPage({
  params,
}: {
  params: Promise<{ pollId: string }>;
}) {
  const { pollId } = use(params);
  const { snapshot, connected } = useSnapshotWs(pollId);
  const [meta, setMeta] = useState<PollMeta | null>(null);
  const [qrScale, setQrScale] = useState(1);
  const lastScaleRef = useRef(1);

  useEffect(() => {
    // 大屏无 admin 会话，meta 走公开的 H5 state 接口（/api/admin/* 已被鉴权保护）
    fetch(`/api/vote/${pollId}/state`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setMeta(d.poll))
      .catch(() => { });
  }, [pollId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") {
        e.preventDefault();
        setQrScale((prev) => {
          const next = prev === 0 ? (lastScaleRef.current || 1) : Math.min(QR_SIZES.length, prev + 1);
          lastScaleRef.current = next;
          return next;
        });
      } else if (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract") {
        e.preventDefault();
        setQrScale((prev) => {
          if (prev <= 1) return 1;
          const next = Math.max(1, prev - 1);
          lastScaleRef.current = next;
          return next;
        });
      } else if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        setQrScale((prev) => {
          if (prev > 0) {
            lastScaleRef.current = prev;
            return 0;
          }
          return lastScaleRef.current || 1;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const remaining = useCountdown(snapshot?.expire_at ?? 0, snapshot?.server_ts);
  const ended =
    snapshot?.status === "ended" ||
    (snapshot ? snapshot.expire_at > 0 && remaining === 0 : false);

  const voteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/poll/vote/${pollId}`
      : "";

  if (!meta) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-slate-500">
        加载中…
      </main>
    );
  }

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-slate-950">
      {meta.bg_image && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${meta.bg_image})` }}
          />
          <div className="absolute inset-0 bg-slate-950/70" />
        </>
      )}
      {/* 头部 */}
      <header className="relative flex items-center justify-between px-10 pt-8">
        <div>
          <h1 className="text-4xl font-bold tracking-wide text-white">{meta.title}</h1>
          {meta.desc && (
            <p className="mt-1 text-lg text-slate-400">{meta.desc}</p>
          )}
        </div>
        <div className="flex items-center gap-6">
          <Stat label="参与人数" value={snapshot?.voters ?? 0} color="#38bdf8" />
          <Stat label="总票数" value={snapshot?.total ?? 0} color="#34d399" />
          {snapshot && snapshot.expire_at > 0 && !ended && (
            <Stat
              label="剩余时间"
              value={remaining === null ? "--" : fmtClock(remaining)}
              color={(remaining ?? 0) < 60000 ? "#fb7185" : "#e2e8f0"}
              mono
            />
          )}
          {ended && (
            <span className="rounded-xl bg-rose-500/15 px-4 py-2 text-xl font-bold text-rose-400">
              投票已结束
            </span>
          )}
          <span
            className={`h-3 w-3 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-500"}`}
            title={connected ? "实时连接正常" : "连接中断"}
          />
        </div>
      </header>

      {/* 图表 */}
      <div className="relative min-h-0 flex-1 px-10 py-6">
        <RankChart options={meta.options} snapshot={snapshot} hidden={!!snapshot?.hidden} />
      </div>

      {/* 隐藏遮罩 */}
      {snapshot?.hidden && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-7xl">🗳️</div>
            <p className="mt-4 text-2xl font-bold text-slate-300">
              投票进行中 · 票数已隐藏
            </p>
            <p className="mt-2 text-lg text-slate-500">结果将在投票结束后公布</p>
          </div>
        </div>
      )}

      {/* 右下角二维码 */}
      <QrPanel
        voteUrl={voteUrl}
        scale={qrScale}
        allowedAuth={meta.allowed_auth}
        onScale={(next) => {
          lastScaleRef.current = next;
          setQrScale(next);
        }}
        onHide={() => {
          if (qrScale > 0) lastScaleRef.current = qrScale;
          setQrScale(0);
        }}
        onShow={() => setQrScale(lastScaleRef.current || 1)}
      />
    </main>
  );
}

function QrPanel({
  voteUrl,
  scale,
  allowedAuth = "any",
  onScale,
  onHide,
  onShow,
}: {
  voteUrl: string;
  scale: number; // 0=隐藏, 1..QR_SIZES.length 对应 QR_SIZES 档位
  allowedAuth?: PollMeta["allowed_auth"];
  onScale: (s: number) => void;
  onHide: () => void;
  onShow: () => void;
}) {
  const size = QR_SIZES[scale - 1] ?? QR_SIZES[0];
  const scanTip =
    allowedAuth === "dingtalk"
      ? "钉钉 扫码参与投票"
      : allowedAuth === "wecom"
        ? "企业微信 扫码参与投票"
        : allowedAuth === "both"
          ? "钉钉 / 企微 扫码参与"
          : "扫码参与投票";
  const iconBtn =
    "flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30";
  return (
    <>
      {scale > 0 ? (
        <div className="absolute bottom-6 right-8 z-10 rounded-2xl bg-white p-3 shadow-2xl">
          <div className="flex justify-end gap-1">
            <button
              className={iconBtn}
              onClick={() => onScale(Math.max(1, scale - 1))}
              disabled={scale === 1}
              title="缩小 (-)"
              aria-label="缩小二维码"
            >
              <MinusIcon />
            </button>
            <button
              className={iconBtn}
              onClick={() => onScale(Math.min(QR_SIZES.length, scale + 1))}
              disabled={scale === QR_SIZES.length}
              title="放大 (+)"
              aria-label="放大二维码"
            >
              <PlusIcon />
            </button>
            <button
              className={iconBtn}
              onClick={onHide}
              title="隐藏 (H)"
              aria-label="隐藏二维码"
            >
              <EyeOffIcon />
            </button>
          </div>
          <img
            src={`/api/qr?text=${encodeURIComponent(voteUrl)}&size=${Math.min(size * 2, 1024)}`}
            alt="扫码投票"
            width={size}
            height={size}
            style={{ width: size, height: size }}
          />
          <p className="mt-1 text-center text-sm font-medium text-slate-700">
            {scanTip}
          </p>
        </div>
      ) : (
        <button
          className="absolute bottom-6 right-8 z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-2xl text-white backdrop-blur hover:bg-white/20"
          onClick={onShow}
          title="显示二维码 (H)"
          aria-label="显示二维码"
        >
          ⧉
        </button>
      )}
    </>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M5 12h14" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

function Stat({
  label,
  value,
  color,
  mono,
}: {
  label: string;
  value: number | string;
  color: string;
  mono?: boolean;
}) {
  return (
    <div className="text-right">
      <div
        className={`text-3xl font-bold ${mono ? "font-mono tabular-nums" : ""}`}
        style={{ color }}
      >
        {value}
      </div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}

const circularImageCache = new Map<string, string>();

function getCircularImageDataUrl(src: string): Promise<string> {
  const cached = circularImageCache.get(src);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const img = new Image();
    // 移除 crossOrigin="anonymous"，避免同源图片产生 CORS 缓存隔离与多秒网络停滞
    img.onload = () => {
      try {
        const naturalSize = Math.min(img.naturalWidth || 128, img.naturalHeight || 128);
        const outSize = Math.min(naturalSize, 128);
        const canvas = document.createElement("canvas");
        canvas.width = outSize;
        canvas.height = outSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(src);
          return;
        }

        const radius = outSize / 2;
        ctx.beginPath();
        ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // 居中裁剪 (cover 适应非正方形图片)
        const sx = (img.naturalWidth - naturalSize) / 2;
        const sy = (img.naturalHeight - naturalSize) / 2;
        ctx.drawImage(img, sx, sy, naturalSize, naturalSize, 0, 0, outSize, outSize);

        // 绘制圆形微边框，暗色大屏背景下更有质感
        ctx.beginPath();
        ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 2;
        ctx.stroke();

        const dataUrl = canvas.toDataURL("image/png");
        circularImageCache.set(src, dataUrl);
        resolve(dataUrl);
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

function RankChart({
  options,
  snapshot,
  hidden,
}: {
  options: PollMeta["options"];
  snapshot: Snapshot | null;
  hidden: boolean;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [circularImages, setCircularImages] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const opt of options) {
      const src = opt.image?.trim();
      if (src && circularImageCache.has(src)) {
        initial[src] = circularImageCache.get(src)!;
      }
    }
    return initial;
  });

  useEffect(() => {
    if (!elRef.current) return;
    const chart = echarts.init(elRef.current, null, { renderer: "canvas" });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let isMounted = true;
    options.forEach((opt) => {
      const src = opt.image?.trim();
      if (!src) return;
      getCircularImageDataUrl(src).then((dataUrl) => {
        if (!isMounted) return;
        setCircularImages((prev) => {
          if (prev[src] === dataUrl) return prev;
          return { ...prev, [src]: dataUrl };
        });
      });
    });
    return () => {
      isMounted = false;
    };
  }, [options]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const hasAnyImage = options.some((o) => !!o.image?.trim());
    const optionMap = new Map(options.map((o) => [o.id, o]));
    const counts = options.map((o) =>
      hidden ? 0 : (snapshot?.counts[o.id] ?? 0)
    );

    // 计算当前各选项名次档位：相同票数具有相同档位与颜色，0 票统一使用默认科技蓝色系
    const rankByIndex = computeRankByIndex(counts);

    // 构建 rich 富文本样式映射（如果选项有图片则配置圆形图片样式）
    const rich: Record<string, Record<string, unknown>> = {
      textWithImg: {
        color: "#e2e8f0",
        fontSize: 26,
        verticalAlign: "middle",
        padding: [0, 0, 0, 8],
      },
      text: {
        color: "#e2e8f0",
        fontSize: options.length < 8 ? 32 : 26,
        verticalAlign: "middle",
      },
    };

    options.forEach((opt) => {
      const src = opt.image?.trim();
      if (src) {
        const styleKey = `img_${opt.id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
        rich[styleKey] = {
          backgroundColor: {
            image: circularImages[src] || src,
          },
          width: 36,
          height: 36,
          verticalAlign: "middle",
        };
      }
    });

    chart.setOption({
      grid: {
        top: 20,
        bottom: 30,
        left: hasAnyImage ? 260 : 200,
        right: 120,
      },
      xAxis: {
        type: "value",
        max: "dataMax",
        minInterval: 1,
        axisLabel: { color: "#475569" },
        splitLine: {
          show: true,
          lineStyle: {
            color: "rgba(148, 163, 184, 0.12)",
            type: "dashed",
          },
        },
      },
      yAxis: {
        type: "category",
        data: options.map((o) => o.id),
        inverse: true,
        axisLabel: {
          color: "#e2e8f0",
          fontSize: 26,
          width: hasAnyImage ? 310 : 290,
          overflow: "truncate",
          margin: 12,
          formatter: (id: string) => {
            const opt = optionMap.get(id);
            if (!opt) return id;
            const safeLabel = opt.label.replace(/[{}\\|]/g, "");
            if (opt.image?.trim()) {
              const styleKey = `img_${opt.id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
              return `{${styleKey}|}{textWithImg|${safeLabel}}`;
            }
            return `{text|${safeLabel}}`;
          },
          rich,
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      series: [
        {
          type: "bar",
          realtimeSort: true,
          data: counts,
          barWidth: "55%",
          itemStyle: {
            color: (p: { dataIndex: number }) => {
              const rank = rankByIndex[p.dataIndex];
              return getBarColor(rank);
            },
            borderRadius: [0, 8, 8, 0],
          },
          label: {
            show: true,
            position: "right",
            distance: 10,
            valueAnimation: true,
            color: "#e2e8f0",
            fontSize: 26,
            fontWeight: "bold",
            textBorderColor: "#020617",
            textBorderWidth: 4,
            formatter: hidden
              ? "·"
              : (p: { dataIndex: number }) => {
                const c = counts[p.dataIndex];
                // 占比标签：票数 + 百分比
                // const total = counts.reduce((a, b) => a + b, 0);
                // const pct = total > 0 ? ` (${Math.round((c / total) * 100)}%)` : "";
                return `${c}`;
              },
          },
          animationDuration: 0,
          animationDurationUpdate: 1000,
          animationEasing: "linear",
          animationEasingUpdate: "linear",
        },
      ],
    });
  }, [options, snapshot, hidden]);

  return <div ref={elRef} className="h-full w-full min-h-[400px]" />;
}
