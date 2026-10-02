import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import type { EditorStore } from '../editorStore';
import { IconPicker } from './IconPicker';
import { CoverPicker } from './CoverPicker';
import { CoverAdjust } from './CoverAdjust';
import { randomCoverValue } from './defaultCovers';
import { normalizeOffset, toObjectPosition } from './coverOffset';
import { toAuthenticatedCoverUrl } from './coverUrl';

interface NoteCoverHeaderProps {
  store: EditorStore
  /** 阅读态：封面/图标/标题只展示，不给任何编辑入口 */
  readOnly?: boolean
}

/**
 * Sits above the editor body: exposes the note's emoji icon and cover image,
 * both persisted through `metadata` and shipped with the note on send.
 */
export const NoteCoverHeader = observer(({ store, readOnly = false }: NoteCoverHeaderProps) => {
  const { t } = useTranslation();
  const [iconOpen, setIconOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const icon = store.icon
  const coverUrl = toAuthenticatedCoverUrl(store.cover)
  const offset = store.coverOffset

  /**
   * Feishu-style instant save: while editing an existing note, metadata tweaks
   * land on the server immediately so the card list reflects them without
   * forcing the user to hit "update". Create mode has no noteId yet, so there
   * the metadata still ships with the regular send.
   */
  const persistMetadata = (patch: Record<string, unknown>) => {
    if (!store.noteId) return;
    RootStore.Get(BlinkoStore).upsertNote.call({
      id: store.noteId,
      metadata: patch,
      refresh: true,
      showToast: false,
    });
  };

  const finishAdjust = () => {
    setAdjusting(false);
    persistMetadata({ coverOffset: store.coverOffset });
  };

  /** Feishu behaviour: adding a cover drops a random gallery image straight in. */
  const addCover = () => {
    const coverValue = randomCoverValue(store.cover)
    store.setCover(coverValue)
    setCoverOpen(false)
    persistMetadata({ cover: coverValue })
  }

  // Esc leaves the framing tool; whatever the last pan produced stays applied.
  useEffect(() => {
    if (!adjusting) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finishAdjust();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [adjusting]);

  return (
    <>
      {coverUrl && (
        <div className={`relative w-full mb-2 overflow-hidden rounded-lg aspect-[2.35/1] max-h-[240px] ${
          adjusting ? 'ring-2 ring-primary/60' : 'group/cover'
        }`}>
          {adjusting ? (
            <CoverAdjust
              src={coverUrl}
              offset={offset}
              onChange={(next) => store.setCoverOffset(next)}
              onDone={finishAdjust}
            />
          ) : (
            <>
              <img
                src={coverUrl}
                alt=""
                style={{ objectPosition: toObjectPosition(offset) }}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setCoverOpen(true)}
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
                {!readOnly && (
                  <>
                    <button
                      type="button"
                      title={t('adjust-cover-position')}
                      onClick={(e) => { e.stopPropagation(); setAdjusting(true); }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/55 text-white text-xs backdrop-blur-sm hover:bg-black/70 !transition-colors"
                    >
                      <Icon icon="mingcute:move-line" width={13} height={13} />
                      {t('adjust-cover-position')}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setCoverOpen(true); }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/55 text-white text-xs backdrop-blur-sm hover:bg-black/70 !transition-colors"
                    >
                      <Icon icon="lucide:pencil" width={12} height={12} />
                      {t('edit-cover')}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Icon-only CTAs, kept visually quiet: ghost style that lights up on hover. */}
      <div className="flex items-center gap-0.5 mb-2 -ml-1">
        {icon && (
          <button
            type="button"
            title={t('select-icon')}
            onClick={() => !readOnly && setIconOpen(true)}
            className="flex items-center justify-center w-7 h-7 rounded-full text-base bg-default-100 hover:bg-default-200 !transition-colors"
          >
            {icon}
          </button>
        )}

        {!icon && !readOnly && (
          <button
            type="button"
            title={t('add-icon')}
            onClick={() => setIconOpen(true)}
            className="flex items-center justify-center w-7 h-7 rounded-md text-default-400 hover:text-primary hover:bg-default-100 !transition-colors"
          >
            <Icon icon="mingcute:emoji-2-line" width={17} height={17} />
          </button>
        )}

        {!coverUrl && !readOnly && (
          <button
            type="button"
            title={t('add-cover')}
            onClick={addCover}
            className="flex items-center justify-center w-7 h-7 rounded-md text-default-400 hover:text-primary hover:bg-default-100 !transition-colors"
          >
            <Icon icon="hugeicons:image-01" width={17} height={17} />
          </button>
        )}

        {/* Title: stored in metadata like icon/cover, saved on blur / Enter. */}
        <input
          value={store.title ?? ''}
          onChange={(e) => !readOnly && store.setTitle(e.target.value)}
          onBlur={() => { if (!readOnly) persistMetadata({ title: store.title ?? null }); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              persistMetadata({ title: store.title ?? null });
              store.vditor?.focus?.();
            }
          }}
          readOnly={readOnly}
          placeholder={readOnly ? undefined : t('note-title-placeholder')}
          className={`flex-1 min-w-0 ml-1 bg-transparent text-lg md:text-xl font-semibold text-foreground outline-none placeholder:text-default-300 placeholder:font-normal ${readOnly ? 'cursor-default' : ''}`}
        />
      </div>

      <IconPicker
        isOpen={iconOpen}
        onClose={() => setIconOpen(false)}
        onSelect={(emoji) => { store.setIcon(emoji); persistMetadata({ icon: emoji }); }}
      />
      <CoverPicker
        isOpen={coverOpen}
        onClose={() => setCoverOpen(false)}
        cover={store.cover}
        onPick={(next) => { store.setCover(next); persistMetadata({ cover: next }); }}
        onRemove={() => { store.setCover(undefined); persistMetadata({ cover: null }); }}
        onUpload={async (file) => await store.uploadCoverFile(file)}
      />
    </>
  );
});

interface NoteCoverDisplayProps {
  cover?: string | null
  coverOffset?: unknown
  /** Optional wrapper className; useful for limiting height on large viewports. */
  className?: string
  /**
   * Upper bound for the banner height (px). The 2.35:1 aspect box otherwise
   * scales its height linearly with card width, so a full-width single-column
   * card inflates the cover to ~640px and pushes the body off screen.
   */
  maxHeight?: number
}

/** Read-only cover banner used by the card list and the note detail page. */
export const NoteCoverDisplay = ({ cover, coverOffset, className, maxHeight = 300 }: NoteCoverDisplayProps) => {
  const coverUrl = toAuthenticatedCoverUrl(cover);
  if (!coverUrl) return null;

  return (
    <div
      style={{ maxHeight }}
      className={`w-full mb-2 overflow-hidden rounded-lg aspect-[2.35/1] ${className ?? ''}`}
    >
      <img
        src={coverUrl}
        alt=""
        style={{ objectPosition: toObjectPosition(normalizeOffset(coverOffset)) }}
        className="w-full h-full object-cover"
      />
    </div>
  );
};

interface NoteTitleDisplayProps {
  icon?: string | null
  title?: string | null
  className?: string
}

/** Read-only icon + title row used by the card list and the note detail page. */
export const NoteTitleDisplay = ({ icon, title, className }: NoteTitleDisplayProps) => {
  if (!icon && !title) return null;

  return (
    <div className={`flex items-center gap-2 mb-2 ${className ?? ''}`}>
      {icon && <span className="text-xl leading-none">{icon}</span>}
      {title && <div className="text-lg md:text-xl font-semibold line-clamp-2">{title}</div>}
    </div>
  );
};
