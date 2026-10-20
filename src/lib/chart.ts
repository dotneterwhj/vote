import * as echarts from "echarts";

// 柱状图配色：前三名（按得票档位）单独高亮（金/银/铜），其余统一沉稳科技蓝色系
export function getBarColor(rank: number) {
  if (rank === 1) {
    // 冠军：璀璨金
    return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
      { offset: 0, color: "#f59e0b" },
      { offset: 1, color: "#fde047" },
    ]);
  }
  if (rank === 2) {
    // 亚军：流光银
    return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
      { offset: 0, color: "#94a3b8" },
      { offset: 1, color: "#f1f5f9" },
    ]);
  }
  if (rank === 3) {
    // 季军：琥珀铜
    return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
      { offset: 0, color: "#ea580c" },
      { offset: 1, color: "#fb923c" },
    ]);
  }
  // 其余或 0 票统一沉稳科技蓝
  return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
    { offset: 0, color: "#3b82f6" },
    { offset: 1, color: "#6eb5e5" },
  ]);
}

/**
 * 计算各选项名次档位：
 * - 提取所有大于 0 的不同票数从高到低排序，作为名次档位阶梯
 * - 相同票数的选项获得相同名次档位，因此柱状图颜色保持一致
 * - 0 票不参与前三名排位，档位为 0（显示默认科技蓝色）
 */
export function computeRankByIndex(counts: number[]): number[] {
  const positiveCounts = Array.from(
    new Set(counts.filter((c) => c > 0))
  ).sort((a, b) => b - a);

  return counts.map((c) => {
    if (c <= 0) return 0;
    return positiveCounts.indexOf(c) + 1;
  });
}
