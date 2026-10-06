import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import type { HashtagState } from './hashtagState';
import { Icon } from '@/components/Common/Iconify/icons';

interface HashtagListProps {
  state: HashtagState;
}

/**
 * 输入 # 弹出的标签建议列表。
 * 列表项是标签的**全路径**（`新人指南/更多资料`），和正文里写出来的形态一致。
 */
export const HashtagList = observer(({ state }: HashtagListProps) => {
  const { t } = useTranslation();

  if (!state.isOpen || !state.rect) return null;

  const { top, left } = state.rect;
  const style: React.CSSProperties = {
    position: 'fixed',
    left,
    top: top + 24,
    zIndex: 100,
    transform: 'translateX(-50%)',
  };

  return (
    <div className="tiptap-hashtag-list" style={style}>
      <div className="bg-content1 shadow-lg border border-divider rounded-lg overflow-hidden min-w-[220px] max-w-[320px]">
        <div className="px-3 py-2 border-b border-divider text-xs text-default-500 flex items-center gap-2">
          <Icon icon="solar:tag-bold" width={14} height={14} />
          <span>{t('tag')}</span>
        </div>

        <div className="max-h-[240px] overflow-y-auto py-1">
          {state.items.length === 0 ? (
            <div className="px-3 py-4 text-center text-default-400 text-sm">{t('no-results')}</div>
          ) : (
            state.items.map((item, index) => (
              <button
                key={`${item.id}-${item.path}`}
                className={`w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-default-100 transition-colors ${
                  index === state.selectedIndex ? 'bg-default-100' : ''
                }`}
                onClick={() => state.selectCurrent()}
              >
                <Icon icon="solar:tag-bold" width={14} height={14} className="text-[color:var(--tag)] shrink-0" />
                <span className="text-sm text-default-700 truncate flex-1 min-w-0">
                  {item.path}
                </span>
                {item.isNew ? (
                  <span className="text-[10px] text-primary shrink-0">{t('create-tag')}</span>
                ) : item.count > 0 ? (
                  <span className="text-[10px] text-default-400 shrink-0">{item.count}</span>
                ) : null}
              </button>
            ))
          )}
        </div>

        <div className="px-3 py-1.5 border-t border-divider text-[10px] text-default-400 flex justify-between">
          <span>↑↓ {t('navigate')}</span>
          <span>↵ {t('select')}</span>
          <span>Esc {t('close')}</span>
        </div>
      </div>
    </div>
  );
});
