import { MarkdownRender } from '@/components/Common/MarkdownRender';
import { FilesAttachmentRender } from "../Common/AttachmentRender";
import { Note } from '@shared/lib/types';
import { BlinkoStore } from '@/store/blinkoStore';
import { observer } from 'mobx-react-lite';
import { ReferencesContent } from './referencesContent';
import { helper } from '@/lib/helper';
import { useMemo } from 'react';

interface NoteContentProps {
  blinkoItem: Note;
  blinko: BlinkoStore;
  isExpanded?: boolean;
  isShareMode?: boolean;
}

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

export const NoteContent = observer(({ blinkoItem, blinko, isExpanded, isShareMode }: NoteContentProps) => {
  const displayContent = useMemo(
    () => {
      if (!blinkoItem.content) return blinkoItem.content;
      const tagPaths = getNoteTagPaths(blinkoItem);
      return tagPaths.length ? stripTagTokens(blinkoItem.content, tagPaths) : blinkoItem.content;
    },
    [blinkoItem.content, blinkoItem.tags]
  );

  return (
    <>
      <MarkdownRender
        content={displayContent}
        onChange={(updater) => {
          if (isShareMode) return;
          const newContent = updater(blinkoItem.content);
          blinkoItem.content = newContent
          blinko.upsertNote.call({ id: blinkoItem.id, content: newContent, refresh: false })
        }}
        isShareMode={isShareMode}
        largeSpacing={isShareMode || isExpanded}
      />
      <ReferencesContent blinkoItem={blinkoItem} className={`${isExpanded ? 'my-4' : 'my-2'}`} />
      <div className={blinkoItem.attachments?.length != 0 ? 'my-2' : ''}>
        <FilesAttachmentRender files={blinkoItem.attachments ?? []} preview />
      </div>
    </>
  );
});