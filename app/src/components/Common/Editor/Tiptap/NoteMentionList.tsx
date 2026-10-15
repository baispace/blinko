import { createPortal } from 'react-dom';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { NoteMentionState } from './noteMentionState';
import { Icon } from '@/components/Common/Iconify/icons';

interface NoteMentionListProps {
  state: NoteMentionState;
}

/**
 * Note mention popup list - shows when typing @ in editor.
 */
export const NoteMentionList = observer(({ state }: NoteMentionListProps) => {
  const { t } = useTranslation();

  if (!state.isOpen || !state.rect) return null;

  const { top, left } = state.rect;
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, Math.min(left, window.innerWidth - 328)),
    top: Math.max(8, Math.min(top + 24, window.innerHeight - 330)),
    zIndex: 10030,
    maxWidth: 'calc(100vw - 16px)',
  };

  return createPortal(
    <div
      className="tiptap-note-mention-list"
      style={style}
    >
      <div className="bg-content1 shadow-lg border border-divider rounded-lg overflow-hidden min-w-[240px] max-w-[320px]">
        {/* Header */}
        <div className="px-3 py-2 border-b border-divider text-xs text-default-500 flex items-center gap-2">
          <Icon icon="solar:link-circle-angle-bold" width={14} height={14} />
          <span>{t('link-note')}</span>
        </div>

        {/* Search results */}
        <div className="max-h-[240px] overflow-y-auto py-1">
          {state.loading ? (
            <div className="px-3 py-4 text-center text-default-400 text-sm">
              <span className="animate-pulse">{t('searching')}...</span>
            </div>
          ) : state.error ? (
            <div role="alert" className="px-3 py-4 text-sm text-danger">{state.error}<button type="button" className="ml-2 text-primary" onMouseDown={event => event.preventDefault()} onClick={() => state.searchNotes(state.query)}>重试</button></div>
          ) : state.items.length === 0 ? (
            <div className="px-3 py-4 text-center text-default-400 text-sm">
              {state.query ? t('no-results') : '暂无可引用的内容'}
            </div>
          ) : (
            state.items.map((item, index) => (
              <button
                key={item.id}
                className={`w-full px-3 py-2 text-left flex flex-col gap-0.5 hover:bg-default-100 transition-colors ${
                  index === state.selectedIndex ? 'bg-default-100' : ''
                }`}
                type="button"
                onMouseDown={event => event.preventDefault()}
                onMouseEnter={() => { state.selectedIndex = index; }}
                onClick={() => {
                  state.selectedIndex = index;
                  state.selectCurrent();
                }}
              >
                <span className="text-sm text-default-700 font-medium truncate">
                  {item.title}
                </span>
                <span className="text-xs text-default-400 truncate">
                  {item.content.slice(0, 60).replace(/\n/g, ' ')}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-1.5 border-t border-divider text-[10px] text-default-400 flex justify-between">
          <span>↑↓ {t('navigate')}</span>
          <span>↵ {t('select')}</span>
          <span>Esc {t('close')}</span>
        </div>
      </div>
    </div>, document.body
  );
});
