import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { readBlogTheme } from "@/lib/blogTheme";

export type TrendPoint = {
  bucket: string;
  views: number;
  visitors: number;
};

/**
 * 访问趋势折线图。
 *
 * 复用项目里已有的 echarts（app/package.json 已依赖，BlinkoAnalytics 下有 6 处用法）。
 * 图表只负责画，不做聚合 —— 缺日期补 0 的逻辑在服务端做，前端拿到什么画什么。
 */
export function BlogTrendChart({
  data,
  granularity,
  height = 260,
}: {
  data: TrendPoint[];
  granularity: "day" | "week" | "month";
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inst = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!inst.current)
      inst.current = echarts.init(ref.current, undefined, { renderer: "canvas" });
    const dark = readBlogTheme() === "dark";
    const muted = dark ? "#9aa0aa" : "#7c7a72";
    const line = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
    const buckets = data.map((d) => d.bucket);
    const label =
      granularity === "day"
        ? buckets.map((b) => b.slice(5))
        : granularity === "week"
          ? buckets.map((b) => b.slice(5) + " 周")
          : buckets.map((b) => b.slice(0, 7));
    inst.current.setOption(
      {
        tooltip: {
          trigger: "axis",
          formatter: (params: any) => {
            const list = Array.isArray(params) ? params : [params];
            const head = list[0]?.axisValue ?? "";
            const full = buckets[list[0]?.dataIndex ?? 0] ?? head;
            return (
              `<div style="font-weight:600">${full}</div>` +
              list
                .map(
                  (p: any) =>
                    `${p.marker}${p.seriesName} <strong>${p.value}</strong>`,
                )
                .join("<br/>")
            );
          },
        },
        legend: {
          data: ["阅读次数", "访客数"],
          right: 8,
          top: 0,
          itemWidth: 10,
          itemHeight: 10,
          textStyle: { color: muted, fontSize: 12 },
        },
        grid: { top: 34, right: 16, bottom: 24, left: 44, containLabel: true },
        xAxis: {
          type: "category",
          boundaryGap: false,
          data: label,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: muted, fontSize: 12 },
        },
        yAxis: {
          type: "value",
          minInterval: 1,
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: line } },
          axisLabel: { color: muted, fontSize: 12 },
        },
        series: [
          {
            name: "阅读次数",
            type: "line",
            smooth: true,
            showSymbol: false,
            data: data.map((d) => d.views),
            lineStyle: { width: 2, color: "#7055f8" },
            itemStyle: { color: "#7055f8" },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(112,85,248,0.22)" },
                { offset: 1, color: "rgba(112,85,248,0.02)" },
              ]),
            },
          },
          {
            name: "访客数",
            type: "line",
            smooth: true,
            showSymbol: false,
            data: data.map((d) => d.visitors),
            lineStyle: { width: 2, color: "#a78bfa" },
            itemStyle: { color: "#a78bfa" },
          },
        ],
      },
      true,
    );
  }, [data, granularity]);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => inst.current?.resize());
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  useEffect(
    () => () => {
      inst.current?.dispose();
      inst.current = null;
    },
    [],
  );

  return <div ref={ref} style={{ height, width: "100%" }} />;
}
