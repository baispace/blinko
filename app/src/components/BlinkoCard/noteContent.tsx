import { MarkdownRender } from '@/components/Common/MarkdownRender';
import { FilesAttachmentRender } from "../Common/AttachmentRender";
import { Note } from '@shared/lib/types';
import { BlinkoStore } from '@/store/blinkoStore';
import { observer } from 'mobx-react-lite';
import { ReferencesContent } from './referencesContent';
import { helper } from '@/lib/helper';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';

interface NoteContentProps {
  blinkoItem: Note;
  blinko: BlinkoStore;
  isExpanded?: boolean;
  isShareMode?: boolean;
  /** When provided (blinko gallery split), replaces blinkoItem.attachments. */
  attachments?: Note['attachments'];
  /**
   * Weibo-style fold for compact blinko cards: long text is height-capped
   * with a gradient fade and an expand/collapse toggle, media below still
   * renders. Long NOTE cards use the blog layout instead.
   */
  foldable?: boolean;
  /** Char threshold above which the text is folded (cardFoldLength). */
  foldLength?: number;
  /**
   * Weibo-style: keep #tag tokens inline in the body (highlighted and
   * clickable) instead of extracting them into footer chips.
   */
  inlineTags?: boolean;
  /** 标题已从 content 第一行提取出来时，正文不再重复渲染第一行 */
  skipFirstLine?: boolean;
}

/** Max visible height of folded text (≈ 7 lines, Weibo-style preview). */
const FOLD_MAX_HEIGHT = 200;

/** 笔记关联标签的完整路径（父子标签只保留最深层级） */
export const getNoteTagPaths = (blinkoItem: Note): string[] => {
  if (!blinkoItem.tags?.length) return [];
  const tagTree = helper.buildHashTagTreeFromDb(blinkoItem.tags.map(t => t.tag));
  const paths = tagTree.flatMap(node => helper.generateTagPaths(node));
  return paths.filter(path => !paths.some(other => other !== path && other.startsWith(path + '/')));
};

/**
 * 把正文中的 #标签 token 从展示内容中剔除（标签已在卡片左下角单独展示）。
 * 仅剔除与笔记关联标签匹配的 token；纯标签行整行移除，避免留下空段落。
 */
const stripTagTokens = (content: string, tagPaths: string[]) => {
  const pathSet = new Set(tagPaths);
  const isTagToken = (token: string) => {
    if (token.length < 2 || !token.startsWith('#') || /^#+$/.test(token)) return false;
    const bare = token.slice(1);
    return pathSet.has(bare) || pathSet.has(bare.replace(/[**?.。]+$/u, ''));
  };
  const originalLines = content.split('\n');
  const strippedLines = originalLines.map(line =>
    line.includes('#') ? line.split(/\s+/).filter(token => !isTagToken(token)).join(' ') : line
  );
  return originalLines
    .map((line, i) => {
      const tokens = line.trim().split(/\s+/).filter(Boolean);
      const isPureTagLine = tokens.length > 0 && tokens.every(isTagToken);
      if (isPureTagLine && strippedLines[i].trim() === '') return null;
      return strippedLines[i];
    })
    .filter((line): line is string => line !== null)
    .join('\n');
};

export const NoteContent = observer(({ blinkoItem, blinko, isExpanded, isShareMode, attachments, foldable, foldLength, inlineTags, skipFirstLine }: NoteContentProps) => {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);
  const [isTextExpanded, setTextExpanded] = useState(!!isExpanded);
  const [needsFold, setNeedsFold] = useState(false);
  const foldThreshold = foldLength ?? blinko.config.value?.cardFoldLength ?? 300;
  const isLongText = (blinkoItem.content?.length ?? 0) > foldThreshold;
  const isClamped = !!foldable && isLongText && !isTextExpanded && needsFold;

  // Fold only when the rendered content actually overflows the cap
  // (scrollHeight reports the full height even when maxHeight clips it).
  useEffect(() => {
    const el = contentRef.current;
    if (!foldable || !isLongText || !el) { setNeedsFold(false); return; }
    setNeedsFold(el.scrollHeight > FOLD_MAX_HEIGHT + 40);
  }, [foldable, isLongText, blinkoItem.content]);

  const displayContent = useMemo(
    () => {
      if (!blinkoItem.content) return blinkoItem.content;
      let content = blinkoItem.content;
      if (skipFirstLine) {
        const idx = content.indexOf('\n');
        content = idx >= 0 ? content.slice(idx + 1) : '';
      }
      if (inlineTags) return content;
      const tagPaths = getNoteTagPaths(blinkoItem);
      return tagPaths.length ? stripTagTokens(content, tagPaths) : content;
    },
    [blinkoItem.content, blinkoItem.tags, inlineTags, skipFirstLine]
  );

  return (
    <>
      <div className="relative" onClick={e => { if (isClamped) e.stopPropagation(); }}>
        <div
          ref={contentRef}
          className={isClamped ? 'overflow-hidden' : ''}
          style={isClamped ? { maxHeight: FOLD_MAX_HEIGHT } : undefined}
        >
          <MarkdownRender
            content={displayContent}
            onChange={(updater) => {
              if (isShareMode) return;
              const newContent = updater(blinkoItem.content ?? '');
              blinkoItem.content = newContent
              blinko.upsertNote.call({ id: blinkoItem.id, content: newContent, refresh: false })
            }}
            isShareMode={isShareMode}
            largeSpacing={isShareMode || isExpanded}
          />
        </div>
        {isClamped && (
          <>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background via-background/80 to-transparent" />
            <button
              className="absolute bottom-1.5 right-2 text-[color:var(--tag)] text-sm font-medium flex items-center gap-0.5 bg-background/70 rounded px-1.5 py-0.5 hover:opacity-80"
              onClick={(e) => { e.stopPropagation(); setTextExpanded(true); }}
            >
              {t('expand')}
              <Icon icon="mdi:chevron-down" width="14" height="14" />
            </button>
          </>
        )}
      </div>
      {foldable && isLongText && isTextExpanded && (
        <button
          className="text-[color:var(--tag)] text-sm font-medium mt-1 flex items-center gap-0.5 hover:opacity-80"
          onClick={(e) => { e.stopPropagation(); setTextExpanded(false); }}
        >
          {t('collapse')}
          <Icon icon="mdi:chevron-down" width="14" height="14" className="rotate-180" />
        </button>
      )}
      <ReferencesContent blinkoItem={blinkoItem} className={`${isExpanded ? 'my-4' : 'my-2'}`} />
      <div className={(attachments ?? blinkoItem.attachments)?.length != 0 ? 'my-2' : ''}>
        <FilesAttachmentRender files={attachments ?? blinkoItem.attachments ?? []} preview />
      </div>
    </>
  );
});