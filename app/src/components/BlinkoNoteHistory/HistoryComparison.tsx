import { useMemo } from 'react';
import { compareHistory } from '@/lib/historyDiff';

export function HistoryComparison({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => compareHistory(before, after), [before, after]);
  const changed = parts.some(part => part.kind !== 'same');
  return <div>
    <p className="mb-3 text-xs text-default-500">文字对比：<span className="text-success-700">＋新增</span> · <span className="text-danger-600">−删除</span>。格式与布局请切换到内容预览查看。</p>
    {!changed && <p className="mb-3 rounded-lg bg-default-100 p-3 text-sm text-default-500">文字内容一致。</p>}
    <div className="whitespace-pre-wrap break-words text-sm leading-7" aria-label="版本文字差异">
      {parts.map((part, index) => part.kind === 'added'
        ? <ins key={index} className="rounded bg-success/15 text-success-700 no-underline decoration-2" aria-label="新增">{part.text}</ins>
        : part.kind === 'removed' ? <del key={index} className="rounded bg-danger/10 text-danger-600" aria-label="删除">{part.text}</del>
        : <span key={index}>{part.text}</span>)}
    </div>
  </div>;
}
