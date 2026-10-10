import React, { useEffect, useRef, useState } from 'react';
import { Markmap } from 'markmap-view';
import { Transformer } from 'markmap-lib';

const transformer = new Transformer();

/**
 * Effie 风格的大纲 ↔ 思维导图 POC 渲染组件。
 *
 * 改进要点：
 * - 动态读取容器宽高（不再写死 800x600）
 * - ResizeObserver 跟随容器 resize 自适应 + fit
 * - 复用同一个 Markmap 实例，仅在内容变化时 setData；空内容时销毁，避免脏渲染
 * - 卸载时 destroy，防止热更新时叠多层 svg
 */
export const MarkmapWrapper = ({ content }: { content: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const mmRef = useRef<Markmap | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1. 初始化 markmap 实例（只跑一次）
  useEffect(() => {
    if (!svgRef.current) return;
    try {
      mmRef.current = Markmap.create(svgRef.current, {
        // 默认配色：Effie 蓝色系 + 灰阶，让根节点和分支有视觉层次
        color: (node) => {
          const depth = (node as any).__depth ?? 0;
          const palette = ['#007AFF', '#2F66C9', '#4275F2', '#658FD9', '#9DB7E5'];
          return palette[Math.min(depth, palette.length - 1)];
        },
        duration: 240,
        maxWidth: 240,
        paddingX: 12,
        autoFit: true,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Markmap init failed');
    }
    return () => {
      mmRef.current?.destroy();
      mmRef.current = null;
    };
  }, []);

  // 2. 内容变化时刷新数据
  useEffect(() => {
    if (!mmRef.current) return;
    try {
      const { root } = transformer.transform(content ?? '');
      mmRef.current.setData(root);
      mmRef.current.fit();
    } catch (e: any) {
      setError(e?.message ?? 'Markmap transform failed');
    }
  }, [content]);

  // 3. 容器尺寸变化时重新 fit（延迟一帧让 svg 自身先 reflow）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!svgRef.current) return;
      const rect = el.getBoundingClientRect();
      svgRef.current.setAttribute('width', String(rect.width));
      svgRef.current.setAttribute('height', String(rect.height));
      requestAnimationFrame(() => mmRef.current?.fit());
    });
    ro.observe(el);
    // 首次挂载同步尺寸
    const rect = el.getBoundingClientRect();
    svgRef.current?.setAttribute('width', String(rect.width));
    svgRef.current?.setAttribute('height', String(rect.height));
    requestAnimationFrame(() => mmRef.current?.fit());
    return () => ro.disconnect();
  }, []);

  if (error) {
    return (
      <div className="w-full p-4 text-sm text-red-500 bg-red-50 rounded-lg my-2">
        Markmap 渲染失败：{error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-[420px] my-3 rounded-xl border border-default-200/60 bg-[#fafbfc] overflow-hidden relative"
    >
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};
