import { observer } from 'mobx-react-lite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { Icon } from '@/components/Common/Iconify/icons';

type TagItem = { id: number; path: string; icon?: string; count: number };

/**
 * 笔记列表顶部的标签筛选 chips：
 * 「全部 N」+ 各标签「名字 N」，选中实心主色，未选中白底描边，横向滚动、吸顶。
 * 计数来自 tags.listWithCount（排除回收/归档笔记），随 updateTicker 刷新。
 */
export const TagFilterChips = observer(() => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const path = searchParams.get('path');

  const hidden = path === 'archived' || path === 'trash';
  const tagList = blinko.tagList.value;

  // 笔记增删后刷新计数（refreshData 会触发 updateTicker）
  useEffect(() => {
    if (!hidden) blinko.tagList.call();
  }, [blinko.updateTicker, hidden]);

  // 「全部」数字 = 当前视图的笔记总数
  const viewTotal = useMemo(() => {
    const c = tagList?.viewCounts;
    if (!c) return 0;
    if (path === 'notes') return c.note;
    if (path === 'todo') return c.todo;
    if (path === 'all') return c.blinko + c.note + c.todo;
    return c.blinko;
  }, [tagList?.viewCounts, path]);

  // 展平标签树为完整路径 + 计数，过滤无笔记的标签
  // 计数随当前视图变化：闪念/笔记/待办视图只统计该 type 的笔记数，「全部」视图统计跨类型总数
  const tagItems = useMemo<TagItem[]>(() => {
    const tree = tagList?.listTags ?? [];
    // 选择与当前视图匹配的计数表
    const counts =
      path === 'notes' ? (tagList?.tagNoteCounts ?? {}) :
      path === 'todo' ? (tagList?.tagTodoCounts ?? {}) :
      path === 'all' ? (tagList?.tagCounts ?? {}) :
      (tagList?.tagBlinkoCounts ?? {});
    const items: TagItem[] = [];
    const walk = (nodes: any[], parentPath: string) => {
      nodes.forEach(node => {
        const p = parentPath ? `${parentPath}/${node.name}` : node.name;
        items.push({ id: Number(node.id), path: p, icon: node.metadata?.icon, count: counts[Number(node.id)] ?? 0 });
        if (node.children?.length) walk(node.children, p);
      });
    };
    walk(tree, '');
    return items.filter(i => i.count > 0);
  }, [tagList?.listTags, tagList?.tagCounts, tagList?.tagBlinkoCounts, tagList?.tagNoteCounts, tagList?.tagTodoCounts, path]);

  const activeTagId = blinko.noteListFilterConfig.tagId;

  /**
   * 横向翻页：chips 超出可视宽度时右侧浮一个「»」按钮，点击左移一屏。
   *
   * 滚动条被 hide-scrollbar 藏了，光靠鼠标横向滚轮在触屏上完全够不到后面的标签，
   * 所以给一个显式控件。到底之后同一个按钮变成「«」并回到开头 —— 只做单向的话，
   * 用户翻到末尾就再也回不去了（滚动条隐藏意味着没有别的回退手段）。
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setOverflowing(max > 1);
    setAtEnd(max > 1 && el.scrollLeft >= max - 1);
  }, []);

  // 标签数量 / 计数会随 notes 增删和 tagList.call() 变化，宽度随之改变；
  // 这两个值进依赖，保证异步加载完 chips 后重新量一次。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure, tagItems.length, viewTotal]);

  const page = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) return;
    // 留 96px 让相邻 chip 露出一点边，暗示"还有内容"，而不是整屏硬切
    const step = Math.max(200, el.clientWidth - 96);
    const next = el.scrollLeft >= max - 1 ? 0 : Math.min(max, el.scrollLeft + step);
    el.scrollTo({ left: next, behavior: 'smooth' });
  };

  const goAll = () => {
    navigate(path ? `/?path=${path}` : '/');
  };

  const goTag = (id: number) => {
    // 与侧边栏 TagListPanel 一致：先写入筛选配置并发起查询，再更新地址栏
    // （blinkoStore.useQuery 有守卫：tagId 相同时不重复 reset，保证筛选生效）
    blinko.updateTagFilter(id);
    // 保持当前所在视图（闪念/笔记/待办），仅追加 tagId 筛选，不跳离当前页面
    navigate(path ? `/?path=${path}&tagId=${id}` : `/?tagId=${id}`);
  };

  if (hidden) return null;
  if (!tagItems.length && viewTotal === 0) return null;

  const chipBase =
    'shrink-0 inline-flex items-center gap-1 rounded-full h-8 px-3.5 text-[13px] font-medium select-none cursor-pointer whitespace-nowrap !transition-colors';
  const chipIdle = 'bg-background border border-default-300/60 text-default-600 hover:text-foreground hover:border-primary/50';
  const chipActive = 'bg-primary text-primary-foreground shadow-sm';

  return (
    /* pb-3（12px 下间距）拉开标签筛选和下方卡片的距离，
   避免卡片 hover 上浮/投影时被 sticky 筛选栏压住。 */
    <div className="sticky top-0 z-20 bg-background pb-3" data-testid="tag-filter-chips">
      <div className="relative">
        {/* pr-12 无条件预留翻页按钮的横向空间（按钮占 right-1.5 + w-7 = 34px，
            留 14px 间隙）。不能改成「仅溢出时加」：那样 scrollWidth 会跟着按钮
            显隐变化，measure() 读到的最大值会漂移，atEnd 判断跟着失准。 */}
        <div
          ref={scrollRef}
          className="flex items-center gap-2 overflow-x-auto hide-scrollbar py-1.5 scroll-smooth pr-12"
        >
          <button type="button" onClick={goAll} className={`${chipBase} ${activeTagId == null ? chipActive : chipIdle}`}>
            <span>{t('all')}</span>
            <span className={`text-[11px] tabular-nums ${activeTagId == null ? 'opacity-80' : 'opacity-60'}`}>{viewTotal}</span>
          </button>
          {tagItems.map(item => {
            const selected = activeTagId === item.id;
            return (
              <button key={item.id} type="button" onClick={() => goTag(item.id)} className={`${chipBase} ${selected ? chipActive : chipIdle}`}>
                {item.icon && (
                  item.icon.includes(':')
                    ? <Icon icon={item.icon} width={14} height={14} />
                    : <span className="text-[13px] leading-none">{item.icon}</span>
                )}
                <span>{item.path}</span>
                <span className={`text-[11px] tabular-nums ${selected ? 'opacity-80' : 'opacity-60'}`}>{item.count}</span>
              </button>
            );
          })}
        </div>

        {overflowing && (
          <>
            {/* 淡出宽度与 pr-12 对齐：滚到尽头时最后一枚 chip 恰好停在渐变之外，
                不会被按钮压住；中途滚动时经过按钮下方的 chip 则是柔和淡出，
                而不是硬生生切断。 */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent"
            />
            <button
              type="button"
              onClick={page}
              aria-label={atEnd ? t('tags-pager-back') : t('tags-pager-forward')}
              title={atEnd ? t('tags-pager-back') : t('tags-pager-forward')}
              className="absolute right-1.5 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-default-300/60 bg-background/90 text-default-600 shadow-sm backdrop-blur-sm !transition-colors hover:border-primary/50 hover:text-primary"
            >
              {/* mdi 只有 chevron-double-right，回退方向靠水平镜像 */}
              <Icon
                icon="mdi:chevron-double-right"
                width={16}
                height={16}
                className={atEnd ? 'scale-x-[-1]' : undefined}
              />
            </button>
          </>
        )}
      </div>
    </div>
  );
});
