import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { Icon } from '@/components/Common/Iconify/icons';
import {
  getPageViewScope,
  getPageViewSetting,
  updatePageViewSetting,
} from '@/lib/pageViewConfig';
import { api } from '@/lib/trpc';
import { PromiseCall } from '@/store/standard/PromiseState';

/**
 * 顶部栏 LEFT 区内容：模式标题 + 计数 + 视图切换（列表/卡片）。
 * 严格按 prototype blinko-home-redesign.html 的顶栏左侧：
 *   ✅ 待办 5 条    [≡ 列表] [▦ 卡片]
 *
 * - 设置按钮 (BlinkoHomeSettingsPop) 已从 LEFT 移到顶部栏右侧的最后，
 *   让左侧只承担「我现在看的是什么」这一组语义，避免视觉拥挤。
 */
const MODE_TITLE_EMOJI: Record<string, string> = {
  blinko: '⚡',
  notes: '📝',
  todo: '✅',
  all: '📚',
  archived: '🗄️',
  trash: '🗑️',
};

export const HomeHeaderLeft = observer(() => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const blinko = RootStore.Get(BlinkoStore);

  const scope = getPageViewScope(searchParams);
  const currentListState = blinko.getListByPath(searchParams.get('path'));
  const noteCount = currentListState.value?.length ?? 0;

  const noteListStyle = ((getPageViewSetting(blinko, scope, 'noteListStyle') as string | undefined) ?? 'continuous');
  const isListView = noteListStyle === 'byDay' || noteListStyle === 'byWeek';

  const writeNoteListStyle = (next: 'byDay' | 'continuous') => {
    updatePageViewSetting(blinko, scope, 'noteListStyle', next, async (k, v) => {
      await PromiseCall(api.config.update.mutate({ key: k, value: v }), { autoAlert: false });
      blinko.config.call();
    });
  };

  // 模式标题里的 emoji 跟 BLINKO/笔记/待办概念保持一致：
  //   ⚡ 闪念 / 📝 笔记 / ✅ 待办 / 📚 全部 / 🗄️ 归档 / 🗑️ 回收站
  const modeTitle = `${MODE_TITLE_EMOJI[scope] ?? ''} ${t(scope)}`.trim();

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {/* 模式标题 + 计数 —— 视觉锚点：emoji + 中字（15px semibold）+ 小灰数 (12px muted) */}
      <div className="flex items-center gap-2.5 min-w-0">
        <h1 className="text-[15px] font-semibold truncate leading-none">{modeTitle}</h1>
        <span className="text-[12px] text-default-500 tabular-nums shrink-0 leading-none">
          {noteCount} {t('items-suffix')}
        </span>
      </div>
      {/* 视图切换 —— segmented control: [列表 active/inactive] [卡片 active/inactive],
          跟 prototype 那种"凸起卡片在圆角底条"完全一致。
          mobile (<md) 只显示图标 + active 凸起卡片，desktop (md+) 显示图标 + 文字。 */}
      <div
        role="group"
        aria-label={t('view')}
        className="inline-flex items-center rounded-md bg-default-100 p-[2px] shrink-0"
      >
        <button
          type="button"
          onClick={() => writeNoteListStyle('byDay')}
          title={t('list')}
          aria-pressed={isListView}
          className={`flex items-center gap-1 rounded-[5px] px-2 md:px-2.5 py-[3px] text-[11.5px] leading-none !transition-all ${
            isListView
              ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
              : 'bg-transparent text-default-500 hover:text-foreground'
          }`}
        >
          <Icon icon="tabler:list-check" width="13" height="13" />
          <span className="hidden md:inline">{t('list')}</span>
        </button>
        <button
          type="button"
          onClick={() => writeNoteListStyle('continuous')}
          title={t('card')}
          aria-pressed={!isListView}
          className={`flex items-center gap-1 rounded-[5px] px-2 md:px-2.5 py-[3px] text-[11.5px] leading-none !transition-all ${
            !isListView
              ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
              : 'bg-transparent text-default-500 hover:text-foreground'
          }`}
        >
          <Icon icon="tabler:cards" width="13" height="13" />
          <span className="hidden md:inline">{t('card')}</span>
        </button>
      </div>
    </div>
  );
});