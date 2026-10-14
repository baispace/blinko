import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { RootStore } from '@/store';
import { BaseStore } from '@/store/baseStore';
import { BlinkoStore } from '@/store/blinkoStore';
import { Icon } from '@/components/Common/Iconify/icons';
import { getPageViewScope } from '@/lib/pageViewConfig';

const MODE_VISUAL: Record<string, { background: string; foreground: string }> = {
  blinko: { background: 'bg-amber-500/10', foreground: 'text-amber-500' },
  notes: { background: 'bg-primary/10', foreground: 'text-primary' },
  todo: { background: 'bg-emerald-500/10', foreground: 'text-emerald-500' },
  tag: { background: 'bg-violet-500/10', foreground: 'text-violet-500' },
  all: { background: 'bg-default-100', foreground: 'text-default-500' },
  archived: { background: 'bg-default-100', foreground: 'text-default-500' },
  trash: { background: 'bg-default-100', foreground: 'text-default-500' },
};

const CONTENT_TYPE_TITLE = {
  '0': 'blinko',
  '1': 'notes',
  '2': 'todo',
} as const;

const CONTENT_TYPE_VISUAL = {
  '0': 'bg-amber-500/10 text-amber-600',
  '1': 'bg-primary/10 text-primary',
  '2': 'bg-emerald-500/10 text-emerald-600',
} as const;

/** 顶部栏左侧：只承担当前内容类型、标题与数量的定位语义。 */
export const HomeHeaderLeft = observer(() => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const base = RootStore.Get(BaseStore);
  const blinko = RootStore.Get(BlinkoStore);

  const scope = getPageViewScope(searchParams);
  const currentListState = blinko.getListByPath(searchParams.get('path'));
  const loadedCount = currentListState.value?.length ?? 0;
  const tagList = blinko.tagList.value;
  const tagId = searchParams.get('tagId');
  const numericTagId = tagId ? Number(tagId) : undefined;
  const tag = tagList?.falttenTags?.find(item => String(item.id) === tagId);
  const contentType = searchParams.get('contentType');
  const contentTypeTitle = contentType && contentType in CONTENT_TYPE_TITLE
    ? CONTENT_TYPE_TITLE[contentType as keyof typeof CONTENT_TYPE_TITLE]
    : 'all';
  const hasContentType = contentTypeTitle !== 'all';

  const getAggregateCount = () => {
    if (numericTagId !== undefined && Number.isFinite(numericTagId)) {
      const counts = contentType === '0'
        ? tagList?.tagBlinkoCounts
        : contentType === '1'
          ? tagList?.tagNoteCounts
          : contentType === '2'
            ? tagList?.tagTodoCounts
            : tagList?.tagCounts;
      return tagList ? (counts?.[numericTagId] ?? 0) : undefined;
    }

    const viewCounts = tagList?.viewCounts;
    if (scope === 'blinko') return viewCounts?.blinko;
    if (scope === 'notes') return viewCounts?.note;
    if (scope === 'todo') return viewCounts?.todo;
    if (scope === 'all') {
      if (contentType === '0') return viewCounts?.blinko;
      if (contentType === '1') return viewCounts?.note;
      if (contentType === '2') return viewCounts?.todo;
      if (viewCounts) return viewCounts.blinko + viewCounts.note + viewCounts.todo;
    }
    return undefined;
  };

  const noteCount = getAggregateCount() ?? loadedCount;
  const modeTitle = tag ? `#${tag.name}` : t(scope);
  const visual = MODE_VISUAL[tag ? 'tag' : scope] ?? MODE_VISUAL.all;
  const routeIcon = base.routerList.find(item => item.title === scope)?.icon;
  const modeIcon = tag
    ? 'mingcute:hashtag-line'
    : routeIcon ?? 'hugeicons:note';

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div
        aria-hidden="true"
        className={`grid size-7 shrink-0 place-items-center rounded-lg ${visual.background} ${visual.foreground}`}
      >
        <Icon icon={modeIcon} width="16" height="16" />
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-[15px] font-semibold leading-none" title={modeTitle}>
          {modeTitle}
        </h1>
        {tag && hasContentType && contentType && (
          <span
            className={`inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium leading-none ${CONTENT_TYPE_VISUAL[contentType as keyof typeof CONTENT_TYPE_VISUAL]}`}
          >
            {t(contentTypeTitle)}
          </span>
        )}
        <span className="hidden shrink-0 text-[12px] leading-none text-default-500 tabular-nums md:inline">
          {noteCount} {t('items-suffix')}
        </span>
      </div>

    </div>
  );
});
