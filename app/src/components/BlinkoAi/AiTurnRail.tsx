import { useEffect, useRef, useState } from 'react';

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
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const parent = track.current;
    const active = parent?.querySelector<HTMLButtonElement>('[aria-current="true"]');
    if (parent && active) {
      const top = active.offsetTop;
      if (top < parent.scrollTop || top + 24 > parent.scrollTop + parent.clientHeight) parent.scrollTop = top - parent.clientHeight / 2;
    }
  }, [activeIndex, markers.length]);
  if (markers.length < 2) return null;
  const preview = markers.find(marker => marker.index === hovered);

  return (
    <nav className="ai-turn-rail" aria-label="对话轮次导航">
      <div ref={track} className="ai-turn-rail-track" onKeyDown={event => {
        const position = markers.findIndex(marker => marker.index === activeIndex);
        const next = event.key === 'ArrowDown' ? position + 1 : event.key === 'ArrowUp' ? position - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? markers.length - 1 : -1;
        if (next >= 0 && next < markers.length) { event.preventDefault(); onSelect(markers[next].index); }
      }}>
        {markers.map(marker => {
          const active = marker.index === activeIndex;
          const passed = marker.index < activeIndex;
          return (
            <button
              key={marker.index}
              type="button"
              className={`ai-turn-tick${active ? ' is-active' : passed ? ' is-passed' : ''}`}
              title={`第 ${marker.index + 1} / ${markers.length} 轮 · ${marker.label}`}
              aria-current={active ? 'true' : undefined}
              aria-label={`跳到第 ${marker.index + 1} 轮提问：${marker.label}`}
              onMouseEnter={() => setHovered(marker.index)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(marker.index)}
              onBlur={() => setHovered(null)}
              onClick={() => onSelect(marker.index)}
            >
            </button>
          );
        })}
      </div>
      {preview && <span className="ai-turn-tick-tip" role="tooltip" data-visible="true">
        <span className="ai-turn-tick-tip-time">第 {preview.index + 1} / {markers.length} 轮 · {preview.time}</span>
        <span className="ai-turn-tick-tip-label">{preview.label}</span>
      </span>}
    </nav>
  );
};
