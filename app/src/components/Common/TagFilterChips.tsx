import { observer } from 'mobx-react-lite';
import { useEffect, useMemo } from 'react';
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
    <div
      className="sticky top-0 z-20 flex items-center gap-2 overflow-x-auto hide-scrollbar py-1.5 bg-secondbackground"
      data-testid="tag-filter-chips"
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
  );
});
