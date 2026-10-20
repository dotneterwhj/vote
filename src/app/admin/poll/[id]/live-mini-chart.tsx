"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { PollOption, Snapshot } from "@/lib/types";
import { computeRankByIndex, getBarColor } from "@/lib/chart";

export default function LiveMiniChart({
  options,
  snapshot,
  hidden,
}: {
  options: PollOption[];
  snapshot: Snapshot | null;
  hidden: boolean;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

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
    const chart = chartRef.current;
    if (!chart) return;
    const labels = options.map((o) => o.label);
    const counts = options.map((o) =>
      hidden ? 0 : (snapshot?.counts[o.id] ?? 0)
    );
    const rankByIndex = computeRankByIndex(counts);
    chart.setOption({
      grid: { top: 8, bottom: 24, left: 90, right: 40 },
      xAxis: {
        type: "value",
        minInterval: 1,
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
        data: labels,
        inverse: true,
        axisLabel: { color: "#94a3b8" },
        axisLine: { lineStyle: { color: "#334155" } },
      },
      series: [
        {
          type: "bar",
          data: counts,
          barWidth: "60%",
          realtimeSort: true,
          itemStyle: {
            color: (p: { dataIndex: number }) => {
              const rank = rankByIndex[p.dataIndex];
              return getBarColor(rank);
            },
            borderRadius: [0, 6, 6, 0],
          },
          label: {
            show: true,
            position: "right",
            distance: 6,
            color: "#e2e8f0",
            textBorderColor: "#0f172a",
            textBorderWidth: 3,
            valueAnimation: true,
            formatter: hidden ? "·" : "{c}",
          },
          animationDuration: 0,
          animationDurationUpdate: 500,
          animationEasingUpdate: "linear",
        },
      ],
    });
  }, [options, snapshot, hidden]);

  return <div ref={elRef} className="h-56 w-full" />;
}
