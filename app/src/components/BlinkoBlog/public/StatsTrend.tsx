import { useEffect, useMemo, useRef, useState } from "react";

/**
 * 阅读趋势图（自绘 SVG）。
 *
 * 为什么自己画而不用 echarts：这一页是公开页，首屏之外的图表不该拖着一整套
 * 图表库进场。数据在服务端已经聚合好（每天/每月一个点），前端只负责把点连起来。
 *
 * 三条底线：
 *   1. 没有数据就不画曲线 —— 宁可空着，也不画一条虚构的线；
 *   2. 「早于最早统计数据的区间」画成空白带，不是 0 —— 数据缺失不等于零；
 *   3. 图例带文字，不靠颜色区分两条线。
 */

export type StatsTrendPoint = {
  key: string;
  label: string;
  views: number;
  visitors: number;
  /** 这个时间桶是否落在可统计窗口内（false = 当时还没有数据）。 */
  covered: boolean;
};

type Props = {
  points: StatsTrendPoint[];
  granularity: "day" | "month";
  /** 图表下方的口径说明（随粒度变化）。 */
  caption: string;
};

const PAD = { top: 14, right: 14, bottom: 26, left: 38 };
const HEIGHT = 260;
const MOBILE_HEIGHT = 210;

/** 把上界取整成好看的刻度（1/2/5 × 10ⁿ）。 */
function niceCeil(value: number) {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const n = value / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * base;
}

/** 连续的可统计区间（用于把曲线断开 + 画空白带）。 */
function coveredSegments(points: StatsTrendPoint[]) {
  const segments: { from: number; to: number }[] = [];
  let start = -1;
  points.forEach((point, index) => {
    if (point.covered && start < 0) start = index;
    if (!point.covered && start >= 0) {
      segments.push({ from: start, to: index - 1 });
      start = -1;
    }
  });
  if (start >= 0) segments.push({ from: start, to: points.length - 1 });
  return segments;
}

export default function StatsTrend({ points, granularity, caption }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);

  // 容器宽度变了要重画（侧栏折叠、窗口缩放、旋转屏幕）。
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isMobile = width > 0 && width < 560;
  const height = isMobile ? MOBILE_HEIGHT : HEIGHT;

  const chart = useMemo(() => {
    if (!width || points.length === 0) return null;
    const innerW = Math.max(10, width - PAD.left - PAD.right);
    const innerH = Math.max(10, height - PAD.top - PAD.bottom);
    const maxValue = points.reduce(
      (max, p) => Math.max(max, p.views, p.visitors),
      0,
    );
    const top = niceCeil(maxValue);
    const x = (index: number) =>
      points.length === 1
        ? PAD.left + innerW / 2
        : PAD.left + (innerW * index) / (points.length - 1);
    const y = (value: number) => PAD.top + innerH - (innerH * value) / top;
    const segments = coveredSegments(points);

    const line = (pick: (p: StatsTrendPoint) => number) => {
      let d = "";
      let pen = false;
      points.forEach((point, index) => {
        if (!point.covered) {
          pen = false;
          return;
        }
        d += `${pen ? "L" : "M"}${x(index).toFixed(2)},${y(pick(point)).toFixed(2)}`;
        pen = true;
      });
      return d;
    };

    const areas = segments.map((segment) => {
      let d = `M${x(segment.from).toFixed(2)},${(PAD.top + innerH).toFixed(2)}`;
      for (let i = segment.from; i <= segment.to; i++) {
        d += `L${x(i).toFixed(2)},${y(points[i].views).toFixed(2)}`;
      }
      d += `L${x(segment.to).toFixed(2)},${(PAD.top + innerH).toFixed(2)}Z`;
      return d;
    });

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      value: Math.round(top * ratio),
      pos: PAD.top + innerH - innerH * ratio,
    }));

    // 只有一两个数据点时画不出线，得补一个点 —— 否则「有数据」看起来像「没数据」。
    const coveredIndices = points
      .map((point, index) => (point.covered ? index : -1))
      .filter((index) => index >= 0);
    const singlePoints =
      coveredIndices.length <= 2
        ? coveredIndices.map((index) => ({
            index,
            views: points[index].views,
            visitors: points[index].visitors,
          }))
        : [];

    // X 轴标签太密会糊成一片 —— 按可用宽度抽稀。
    const maxLabels = isMobile ? 4 : width < 900 ? 6 : 8;
    const step = Math.max(1, Math.ceil(points.length / maxLabels));

    return {
      innerW,
      innerH,
      top,
      x,
      y,
      segments,
      areas,
      ticks,
      step,
      singlePoints,
      hasNoDataZone: coveredIndices.length > 0 && coveredIndices.length < points.length,
      viewsPath: line((p) => p.views),
      visitorsPath: line((p) => p.visitors),
      hasData: maxValue > 0 && segments.length > 0,
    };
  }, [width, height, points, isMobile]);

  /** 鼠标/触摸位置 → 最近的点。 */
  const pick = (clientX: number) => {
    if (!chart || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const local = clientX - rect.left;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((_, index) => {
      const dist = Math.abs(chart.x(index) - local);
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    });
    setActive(best);
  };

  const activePoint = active !== null ? points[active] : null;
  const activeCovered = activePoint?.covered;

  // 整段区间都没有数据：明确空状态，不画任何曲线。
  if (chart && !chart.hasData) {
    return (
      <div className="ink-stat-trend" ref={wrapRef}>
        <div className="ink-stat-trend-empty" role="status">
          这个区间还没有可统计的阅读数据。
        </div>
        <p className="ink-stat-trend-caption">{caption}</p>
      </div>
    );
  }

  return (
    <div className="ink-stat-trend" ref={wrapRef}>
      <div
        className="ink-stat-trend-canvas"
        style={{ height }}
        onMouseMove={(event) => {
          if (!touched) pick(event.clientX);
        }}
        onMouseLeave={() => {
          if (!touched) setActive(null);
        }}
        onTouchStart={(event) => {
          setTouched(true);
          const touch = event.touches[0];
          if (touch) pick(touch.clientX);
        }}
        onTouchMove={(event) => {
          const touch = event.touches[0];
          if (touch) pick(touch.clientX);
        }}
        onTouchEnd={() => {
          // 触摸时保留浮层，方便看清数值再移开。
          setTimeout(() => {
            setTouched(false);
          }, 2600);
        }}
      >
        {chart && (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`阅读趋势图：有效阅读与独立访客随${granularity === "day" ? "日期" : "月份"}变化`}
          >
            <title>阅读趋势</title>
            <desc>
              折线图：紫色是有效阅读次数，蓝色是独立访客数。下方说明给出了口径。
            </desc>

            {/* Y 轴刻度与网格线 */}
            {chart.ticks.map((tick) => (
              <g key={tick.value}>
                <line
                  className="ink-stat-trend-grid"
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={tick.pos}
                  y2={tick.pos}
                />
                <text
                  className="ink-stat-trend-axis"
                  x={PAD.left - 8}
                  y={tick.pos + 4}
                  textAnchor="end"
                >
                  {tick.value}
                </text>
              </g>
            ))}

            {/* 可统计窗口之外的区间：画成空白带，不是 0 */}
            {chart.segments.length > 0 &&
              points.map((point, index) =>
                point.covered ? null : (
                  <rect
                    key={point.key}
                    className="ink-stat-trend-nodata"
                    x={chart.x(index) - (chart.innerW / Math.max(1, points.length - 1)) / 2}
                    y={PAD.top}
                    width={chart.innerW / Math.max(1, points.length - 1)}
                    height={chart.innerH}
                  />
                ),
              )}

            {/* 阅读量的面积与折线 */}
            {chart.areas.map((d, index) => (
              <path key={`area-${index}`} className="ink-stat-trend-area" d={d} />
            ))}
            <path className="ink-stat-trend-line ink-stat-trend-line-views" d={chart.viewsPath} />
            <path
              className="ink-stat-trend-line ink-stat-trend-line-visitors"
              d={chart.visitorsPath}
            />

            {/* 数据点太少时补上圆点：单个数据桶画不出线 */}
            {chart.singlePoints.map((point) => (
              <g key={`p-${point.index}`}>
                <circle
                  className="ink-stat-trend-dot ink-stat-trend-dot-views"
                  cx={chart.x(point.index)}
                  cy={chart.y(point.views)}
                  r={4}
                />
                <circle
                  className="ink-stat-trend-dot ink-stat-trend-dot-visitors"
                  cx={chart.x(point.index)}
                  cy={chart.y(point.visitors)}
                  r={4}
                />
              </g>
            ))}

            {/* X 轴标签 */}
            {points.map((point, index) =>
              index % chart.step === 0 || index === points.length - 1 ? (
                <text
                  key={point.key}
                  className="ink-stat-trend-axis"
                  x={chart.x(index)}
                  y={height - 8}
                  textAnchor="middle"
                >
                  {point.label}
                </text>
              ) : null,
            )}

            {/* 悬停指示 */}
            {active !== null && activeCovered && chart && (
              <g className="ink-stat-trend-cursor">
                <line
                  x1={chart.x(active)}
                  x2={chart.x(active)}
                  y1={PAD.top}
                  y2={PAD.top + chart.innerH}
                />
                <circle
                  className="ink-stat-trend-dot ink-stat-trend-dot-views"
                  cx={chart.x(active)}
                  cy={chart.y(points[active].views)}
                  r={4}
                />
                <circle
                  className="ink-stat-trend-dot ink-stat-trend-dot-visitors"
                  cx={chart.x(active)}
                  cy={chart.y(points[active].visitors)}
                  r={4}
                />
              </g>
            )}
          </svg>
        )}

        {activePoint && activeCovered && chart && (
          <div
            className="ink-stat-trend-tip"
            style={{
              left: Math.min(
                Math.max(chart.x(active ?? 0), 64),
                Math.max(64, width - 64),
              ),
              top: 6,
            }}
            role="status"
          >
            <b>{activePoint.key}</b>
            <span>
              <i className="ink-stat-trend-dot-views" aria-hidden="true" />
              有效阅读 {activePoint.views} 次
            </span>
            <span>
              <i className="ink-stat-trend-dot-visitors" aria-hidden="true" />
              独立访客 {activePoint.visitors} 位
            </span>
          </div>
        )}
      </div>

      {/* 图例：带文字，不只靠颜色 */}
      <div className="ink-stat-trend-legend">
        <span>
          <i className="ink-stat-trend-dot-views" aria-hidden="true" />
          有效阅读
        </span>
        <span>
          <i className="ink-stat-trend-dot-visitors" aria-hidden="true" />
          独立访客
        </span>
        {chart?.hasNoDataZone && (
          <span className="ink-stat-trend-legend-note">
            浅色区间为无数据（早于可统计起点）
          </span>
        )}
      </div>

      <p className="ink-stat-trend-caption">{caption}</p>
    </div>
  );
}
