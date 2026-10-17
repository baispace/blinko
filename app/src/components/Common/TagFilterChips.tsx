import { observer } from 'mobx-react-lite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { Icon } from '@/components/Common/Iconify/icons';

type TagItem = { id: number; path: string; icon?: string; count: number };
type CountMode = 'all' | 'blinko' | 'note' | 'todo';

/**
 * 笔记列表顶部的标签筛选 chips：
 * 「全部 N」+ 各标签「名字 N」，选中态使用浅主色，横向滚动、吸顶。
 * 计数来自 tags.listWithCount（排除回收/归档笔记），随 updateTicker 刷新。
 */
export const TagFilterChips = observer(() => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const [searchParams, setSearchParams] = useSearchParams();
  const path = searchParams.get('path');
  const contentType = searchParams.get('contentType');
  const activeTagParam = searchParams.get('tagId');
  const activeTagId = activeTagParam === null ? null : Number(activeTagParam);

  const hidden = path === 'archived' || path === 'trash';
  const tagList = blinko.tagList.value;

  const countMode: CountMode =
    path === 'notes'
      ? 'note'
      : path === 'todo'
        ? 'todo'
        : path === 'all'
          ? contentType === '0'
            ? 'blinko'
            : contentType === '1'
              ? 'note'
              : contentType === '2'
                ? 'todo'
                : 'all'
          : 'blinko';

  // 「全部」数字 = 当前视图及 contentType 筛选下的笔记总数
  const viewTotal = useMemo(() => {
    const counts = tagList?.viewCounts;
    if (!counts) return 0;
    if (countMode === 'note') return counts.note;
    if (countMode === 'todo') return counts.todo;
    if (countMode === 'all') return counts.blinko + counts.note + counts.todo;
    return counts.blinko;
  }, [tagList?.viewCounts, countMode]);

  // 展平标签树为完整路径；零计数标签通常隐藏，但当前 URL 激活项始终保留。
  const tagItems = useMemo<TagItem[]>(() => {
    const tree = tagList?.listTags ?? [];
    const counts =
      countMode === 'note'
        ? (tagList?.tagNoteCounts ?? {})
        : countMode === 'todo'
          ? (tagList?.tagTodoCounts ?? {})
          : countMode === 'all'
            ? (tagList?.tagCounts ?? {})
            : (tagList?.tagBlinkoCounts ?? {});
    const items: TagItem[] = [];
    const walk = (nodes: any[], parentPath: string) => {
      nodes.forEach(node => {
        const tagPath = parentPath ? `${parentPath}/${node.name}` : node.name;
        items.push({
          id: Number(node.id),
          path: tagPath,
          icon: node.metadata?.icon,
          count: counts[Number(node.id)] ?? 0
        });
        if (node.children?.length) walk(node.children, tagPath);
      });
    };
    walk(tree, '');
    return items.filter(item => item.count > 0 || item.id === activeTagId);
  }, [
    tagList?.listTags,
    tagList?.tagCounts,
    tagList?.tagBlinkoCounts,
    tagList?.tagNoteCounts,
    tagList?.tagTodoCounts,
    countMode,
    activeTagId
  ]);

  /**
   * 横向翻页：chips 超出可视宽度时显示翻页按钮。到达末尾后，同一按钮用于
   * 平滑回到开头，避免隐藏滚动条后没有明显的回退方式。
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  useEffect(() => {
    const list = scrollRef.current;
    const selected = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!list || !selected) return;
    const area = list.getBoundingClientRect(), chip = selected.getBoundingClientRect();
    if (chip.left < area.left) list.scrollLeft -= area.left - chip.left;
    else if (chip.right > area.right - 56) list.scrollLeft += chip.right - area.right + 56;
  }, [activeTagId, tagItems]);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setOverflowing(max > 1);
    setAtEnd(max > 1 && el.scrollLeft >= max - 1);
  }, []);

  // ResizeObserver 同时覆盖容器与 chip 内容宽度变化；window.resize 作为兼容补充。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resizeObserver?.observe(el);
    Array.from(el.children).forEach(child => resizeObserver?.observe(child));

    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      resizeObserver?.disconnect();
    };
  }, [measure, tagItems, viewTotal]);

  const page = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) return;
    // 留出相邻 chip 的一角，提示横向仍有内容。
    const step = Math.max(200, el.clientWidth - 96);
    const next = el.scrollLeft >= max - 1 ? 0 : Math.min(max, el.scrollLeft + step);
    el.scrollTo({ left: next, behavior: 'smooth' });
  };

  const goAll = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('tagId');
    setSearchParams(next);
  };

  const goTag = (id: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('tagId', String(id));
    setSearchParams(next);
  };

  if (hidden) return null;
  if (!tagItems.length && viewTotal === 0) return null;

  const chipBase =
    'shrink-0 inline-flex h-8 cursor-pointer select-none items-center gap-1 rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap !transition-colors';
  const chipIdle =
    'border-default-200/60 bg-background/65 text-default-600 hover:border-primary/30 hover:bg-primary/5 hover:text-primary';
  const chipActive =
    'border-primary/20 bg-primary/10 text-primary hover:border-primary/30 hover:bg-primary/15';

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-1 bg-background"
      data-testid="tag-filter-chips"
    >
      <div className="relative min-w-0 flex-1">
        {/* 始终预留翻页按钮空间，避免按钮显隐反过来改变溢出测量结果。 */}
        <div
          ref={scrollRef}
          className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-1.5 scroll-smooth pr-14"
        >
          <button
            type="button"
            onClick={goAll}
            aria-pressed={activeTagId === null}
            aria-label={`${t('all')} (${viewTotal})`}
            className={`${chipBase} ${activeTagId === null ? chipActive : chipIdle}`}
          >
            <span>{t('all')}</span>
            <span
              className={`text-[11px] tabular-nums ${activeTagId === null ? 'opacity-75' : 'opacity-60'}`}
            >
              {viewTotal}
            </span>
          </button>
          {tagItems.map(item => {
            const selected = activeTagId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goTag(item.id)}
                aria-pressed={selected}
                aria-label={`${item.path} (${item.count})`}
                className={`${chipBase} ${selected ? chipActive : chipIdle}`}
              >
                {item.icon &&
                  (item.icon.includes(':') ? (
                    <Icon icon={item.icon} width={14} height={14} />
                  ) : (
                    <span className="text-[13px] leading-none">{item.icon}</span>
                  ))}
                <span>{item.path}</span>
                <span
                  className={`text-[11px] tabular-nums ${selected ? 'opacity-75' : 'opacity-60'}`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>

        {overflowing && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-background/90 to-transparent"
            />
            <button
              type="button"
              onClick={page}
              aria-label={atEnd ? t('tags-pager-back') : t('tags-pager-forward')}
              title={atEnd ? t('tags-pager-back') : t('tags-pager-forward')}
              className="absolute right-1 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-default-200/60 bg-background/80 text-default-500 shadow-sm backdrop-blur-md !transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
            >
              <Icon
                icon="mdi:chevron-double-right"
                width={18}
                height={18}
                className={atEnd ? 'scale-x-[-1]' : undefined}
              />
            </button>
          </>
        )}
      </div>
      {activeTagId !== null && <button type="button" onClick={goAll} aria-label="清除标签筛选" title="清除标签筛选" className="grid size-8 shrink-0 place-items-center rounded-lg text-default-500 hover:bg-default-100 focus-visible:outline-primary"><Icon icon="tabler:x" width={16} /></button>}
    </div>
  );
});
