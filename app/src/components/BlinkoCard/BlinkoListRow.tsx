import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Tooltip } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import dayjs from '@/lib/dayjs';
import { Note, NoteType } from '@shared/lib/types';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { _ } from '@/lib/lodash';
import { DialogStore } from '@/store/module/Dialog';
import { BlinkoShareDialog } from '../BlinkoShareDialog';
import { LeftCickMenu } from '../BlinkoRightClickMenu';
import { CardActionMenu } from './cardActionMenu';
import { ShareButton } from './cardHeader';
import { useIsIOS } from '@/lib/hooks';

interface BlinkoListRowProps {
  blinkoItem: Note & { isBlog?: boolean; title?: string; titleFromMetadata?: boolean };
}

/**
 * 行内标签 chip —— 跟顶部 TagFilterChips 风格统一，但 chips 太"色块化"了
 * 跟 title（medium 主色）抢视觉焦点，所以这里改成裸文字：
 *   `#tag` 或 `icon #tag` 形式，color 与 meta 行一致（muted），
 *   让 title 真正成为行内的视觉焦点。
 */
const RowTagChip = ({ tag }: { tag: any }) => {
  if (!tag) return null;
  const icon = tag.icon as string | undefined;
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0 text-[11px] text-default-500 whitespace-nowrap">
      {icon && (
        icon.includes(':')
          ? <Icon icon={icon} width="11" height="11" />
          : <span className="text-[11px] leading-none">{icon}</span>
      )}
      <span className="truncate max-w-[120px]">#{tag.name}</span>
    </span>
  );
};

/**
 * 列表视图行 —— 严格按 prototype blinko-home-redesign.html .row 结构：
 *   [drag handle] [checkbox/emoji] [content (flex-1)] [actions (hover)]
 *
 * - hover 时浅灰底色（hover:bg-hover）
 * - margin: 0 -12px 让 hover 区扩展到内容容器外
 * - padding: 8px 12px / gap: 12px / rounded-md
 * - 选中态：左侧 2px 主题色竖条 + bg-selected
 * - 闪念/待办：checkbox 可点击切换 isArchived（完成）
 * - 笔记：emoji（metadata.icon）作为类型图标
 * - 右侧：actions 默认 opacity-0，hover 行才显示
 * - 点击行 → 跳 /detail?id=X（复用 BlinkoCard 的 fullscreenEditorNoteId 信号）
 */
export const BlinkoListRow = observer(({ blinkoItem }: BlinkoListRowProps) => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const navigate = useNavigate();
  const isIOSDevice = useIsIOS();

  // 计算 isBlog / title / isTop 跟 BlinkoCard 保持一致（masonry 视图分支会用到这些字段）
  const contentLength = blinkoItem.content?.length ?? 0;
  blinkoItem.isBlog = contentLength >= (blinko.config.value?.textFoldLength ?? 1000);

  const rawFirstLine = blinkoItem.content?.split('\n').find(line => {
    if (!line.trim()) return false;
    if (/^#+\s/.test(line) || /^\s*[-*+]\s/.test(line)) return false;
    return true;
  });
  const metadataTitle = blinkoItem.metadata?.title?.trim();
  const titleFromContent = rawFirstLine ? rawFirstLine
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/\s*#[^#\s]+/g, '')
    .trim() : undefined;
  blinkoItem.titleFromMetadata = !!metadataTitle;
  blinkoItem.title = metadataTitle || titleFromContent || '';

  const isSelected = blinko.curMultiSelectIds?.includes(blinkoItem.id!);
  const isBlinko = blinkoItem.type === NoteType.BLINKO;
  const isTodo = blinkoItem.type === NoteType.TODO;
  const isNote = blinkoItem.type === NoteType.NOTE;
  const isDone = isTodo && blinkoItem.isArchived;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (blinko.isMultiSelectMode) {
      blinko.onMultiSelectNote(blinkoItem.id!);
      return;
    }
    if (blinkoItem.id == null) return;
    blinko.fullscreenEditorNoteId = blinkoItem.id;
    navigate(`/detail?id=${blinkoItem.id}`);
  };

  const handleTodoToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!blinkoItem.id) return;
    await blinko.upsertNote.call({
      id: blinkoItem.id,
      isArchived: !blinkoItem.isArchived,
    });
    blinko.updateTicker++;
  };

  const handlePinToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!blinkoItem.id) return;
    blinko.upsertNote.call({ id: blinkoItem.id, isTop: !blinkoItem.isTop });
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    blinko.curSelectedNote = _.cloneDeep(blinkoItem);
    RootStore.Get(DialogStore).setData({
      isOpen: true,
      size: 'md',
      title: t('share'),
      content: <BlinkoShareDialog defaultSettings={{
        shareUrl: blinkoItem.shareEncryptedUrl ? window.location.origin + '/share/' + blinkoItem.shareEncryptedUrl : undefined,
        expiryDate: blinkoItem.shareExpiryDate ?? undefined,
        password: blinkoItem.sharePassword ?? '',
        isShare: blinkoItem.isShare,
      }} />,
    });
  };

  // 行主体内容：闪念/待办/笔记 各 2 段：title + meta
  // 时间单独渲染在 row 最右侧（跟 actions 同行），不再挤进 meta 行
  const renderContent = () => {
    if (isNote) {
      const title = blinkoItem.title || rawFirstLine || '';
      const tags = (blinkoItem.tags ?? []).map(t => t.tag).filter(Boolean);
      return (
        <>
          {/* title：medium 主色，行内视觉焦点 */}
          <div className={`text-[14.5px] font-medium leading-[1.45] truncate ${isDone ? 'text-default-400 line-through' : 'text-foreground'}`}>
            {title || t('no-title')}
          </div>
          {/* meta：tags + 附件数，muted；时间挪到 row 右侧，不再这里 */}
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-default-500 min-w-0">
            {tags.slice(0, 3).map((tag, i) => <RowTagChip key={i} tag={tag} />)}
            {blinkoItem._count?.attachments > 0 && (
              <span className="shrink-0 inline-flex items-center gap-0.5">
                <Icon icon="solar:paperclip-linear" width="11" height="11" />
                {blinkoItem._count.attachments}
              </span>
            )}
          </div>
        </>
      );
    }

    if (isTodo) {
      const priority = (blinkoItem as any).metadata?.priority;
      const dueDate = (blinkoItem as any).metadata?.expireAt;
      return (
        <>
          <div className={`text-[14.5px] leading-[1.45] truncate ${isDone ? 'text-default-400 line-through' : 'text-foreground'}`}>
            {blinkoItem.content?.split('\n').find(l => l.trim()) || ''}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-default-500 min-w-0">
            {priority === 1 && <span className="text-danger font-medium inline-flex items-center gap-0.5 shrink-0"><Icon icon="solar:flag-bold" width="11" height="11" />{t('high-priority')}</span>}
            {priority === 2 && <span className="text-warning font-medium inline-flex items-center gap-0.5 shrink-0"><Icon icon="solar:flag-bold" width="11" height="11" />{t('mid-priority')}</span>}
            {dueDate && <span className="text-danger inline-flex items-center gap-0.5 shrink-0"><Icon icon="solar:clock-circle-bold" width="11" height="11" />{dayjs(dueDate).format('MM-DD HH:mm')}</span>}
            {(blinkoItem.tags ?? []).slice(0, 2).map((tag, i) => <RowTagChip key={i} tag={tag.tag} />)}
          </div>
        </>
      );
    }

    // BLINKO
    return (
      <>
        <div className={`text-[14.5px] leading-[1.45] truncate ${isDone ? 'text-default-400 line-through' : 'text-foreground'}`}>
          {blinkoItem.content?.split('\n').find(l => l.trim()) || ''}
        </div>
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-default-500 min-w-0">
          {(blinkoItem.tags ?? []).slice(0, 2).map((tag, i) => <RowTagChip key={i} tag={tag.tag} />)}
        </div>
      </>
    );
  };

  // 时间格式单独算
  const formattedTime = blinko.config.value?.timeFormat == 'relative'
    ? dayjs(blinko.config.value?.isOrderByCreateTime ? blinkoItem.createdAt : blinkoItem.updatedAt).fromNow()
    : dayjs(blinko.config.value?.isOrderByCreateTime ? blinkoItem.createdAt : blinkoItem.updatedAt).format(blinko.config.value?.timeFormat ?? 'YYYY-MM-DD HH:mm');

  return (
    <div
      role="row"
      data-type={blinkoItem.type}
      data-id={blinkoItem.id}
      data-pinned={blinkoItem.isTop ? '1' : '0'}
      data-done={isDone ? '1' : '0'}
      onClick={handleClick}
      className={`group/row relative flex items-start gap-3 py-2 px-3 cursor-pointer
        !transition-colors duration-100 -mx-3
        border-b border-default-200/40 last:border-b-0
        ${isSelected ? '!bg-primary/10' : 'hover:!bg-hover'}
      `}
    >
      {/* 选中态左侧 2px 主题色条（对齐 prototype） */}
      <span
        aria-hidden
        className={`absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-primary transition-opacity duration-150
          ${isSelected ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* 左：drag handle（hover-only） */}
      <span className="mt-1 shrink-0 opacity-0 group-hover/row:opacity-100 !transition-opacity cursor-grab text-default-400">
        <Icon icon="solar:list-arrow-down-minimalistic-linear" width="14" height="14" />
      </span>

      {/* 类型标识位：
          - TODO：checkbox（任务有完成语义）
          - NOTE：emoji（笔记类型标识，metadata.icon 兜底 📝）
          - BLINKO：小 ⚡ 图标 muted，跟 NOTE 的 emoji 视觉对称 —— 让人一眼
            看出"这是闪念"，不再跟 NOTE 混淆。 */}
      {isTodo ? (
        <span
          onClick={handleTodoToggle}
          className={`mt-1.5 w-[15px] h-[15px] border-[1.5px] rounded-[3px] shrink-0 inline-flex items-center justify-center
            !transition-all cursor-pointer
            ${isDone
              ? 'bg-primary border-primary text-white'
              : 'border-default-300 hover:border-primary/50'}`}
        >
          {isDone && <Icon icon="solar:check-read-linear" width="10" height="10" />}
        </span>
      ) : isNote ? (
        <span className="text-xl mt-0.5 shrink-0 leading-none select-none">
          {(blinkoItem as any).metadata?.icon || '📝'}
        </span>
      ) : (
        /* BLINKO 类型标识：⚡ muted，对齐 NOTE emoji 的大小和位置 */
        <span className="mt-0.5 shrink-0 leading-none select-none text-default-400">
          ⚡
        </span>
      )}

      {/* 中：content（title + meta，无 time 无 excerpt） */}
      <div className="flex-1 min-w-0 cursor-pointer">
        {renderContent()}
      </div>

      {/* 右：time + actions（time 一直可见；actions hover-only） */}
      <div className="flex items-center gap-2 shrink-0 mt-0.5">
        {/* time：单独在最右，muted 小字，跟 chip 行解耦，不抢视觉 */}
        <span className="text-[11px] text-default-400 tabular-nums whitespace-nowrap">
          {formattedTime}
        </span>
        {/* actions：hover-only */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 !transition-opacity">
          <Tooltip content={blinkoItem.isTop ? t('cancel-top') : t('top')} delay={500}>
            <button
              type="button"
              onClick={handlePinToggle}
              className={`p-1 rounded hover:!bg-hover !transition-colors ${blinkoItem.isTop ? 'text-[#EFC646]' : 'text-default-500 hover:text-foreground'}`}
              title={blinkoItem.isTop ? t('cancel-top') : t('top')}
            >
              <Icon icon={blinkoItem.isTop ? "solar:pin-bold" : "solar:pin-linear"} width="14" height="14" />
            </button>
          </Tooltip>
          <ShareButton blinkoItem={blinkoItem} isIOSDevice={isIOSDevice} alwaysShow />
          {isTodo ? (
            <Tooltip content={t('schedule')} delay={500}>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded hover:!bg-hover text-default-500 hover:text-foreground !transition-colors"
                title={t('schedule')}
              >
                <Icon icon="solar:calendar-mark-bold" width="14" height="14" />
              </button>
            </Tooltip>
          ) : null}
          <CardActionMenu blinkoItem={blinkoItem} isDetailPage={false} />
        </div>
      </div>
    </div>
  );
});