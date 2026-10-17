import { useState } from 'react';

export interface AiTurnMarker {
  /** 该轮在对话里的序号（从 0 开始，按用户提问计数） */
  index: number;
  /** 该轮在可滚动文档中的相对位置 0–1，用来把 marker 摆到轨道对应高度 */
  ratio: number;
  /** 首行摘要，作为 tooltip */
  label: string;
  /** 该轮提问时间 */
  time: string;
}

/**
 * 对话流左侧的轮次导航轨（进度条式 marker）。
 * 每轮一个刻度，位置按该轮在文档中的实际高度分布，刻度按滚动进度点亮；
 * 点击 / 回车跳到对应轮次。轮次少于 2 个时不渲染，避免无意义的装饰。
 */
export const AiTurnRail = ({ markers, activeIndex, onSelect }: {
  markers: AiTurnMarker[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) => {
  const [hovered, setHovered] = useState<number | null>(null);
  if (markers.length < 2) return null;

  return (
    <nav className="ai-turn-rail" aria-label="对话轮次导航">
      <div className="ai-turn-rail-track">
        {markers.map(marker => {
          const active = marker.index === activeIndex;
          const passed = marker.index < activeIndex;
          return (
            <button
              key={marker.index}
              type="button"
              className={`ai-turn-tick${active ? ' is-active' : passed ? ' is-passed' : ''}`}
              style={{ top: `${marker.ratio * 100}%` }}
              aria-current={active ? 'true' : undefined}
              aria-label={`跳到第 ${marker.index + 1} 轮提问：${marker.label}`}
              onMouseEnter={() => setHovered(marker.index)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(marker.index)}
              onBlur={() => setHovered(null)}
              onClick={() => onSelect(marker.index)}
            >
              <span className="ai-turn-tick-tip" role="tooltip" data-visible={hovered === marker.index || undefined}>
                <span className="ai-turn-tick-tip-time">{marker.time}</span>
                <span className="ai-turn-tick-tip-label">{marker.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
