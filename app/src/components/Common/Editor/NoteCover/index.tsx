import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import type { EditorStore } from '../editorStore';
import { IconPicker } from './IconPicker';
import { CoverPicker } from './CoverPicker';
import { CoverAdjust } from './CoverAdjust';
import { normalizeOffset, toObjectPosition } from './coverOffset';
import { toAuthenticatedCoverUrl } from './coverUrl';
import { getDocumentVisibleTags } from './visibleTags';

export const DocumentVisibleTags = observer(({ store, content = '', className = '' }: {
  store: EditorStore;
  content?: string;
  className?: string;
}) => {
  const blinko = RootStore.Get(BlinkoStore);
  const tags = getDocumentVisibleTags(content, blinko.curSelectedNote, store.noteId);
  if (!tags.length) return null;
  return (
    <div data-testid="document-visible-tags" className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {tags.map(tag => (
        <span key={tag} className="inline-flex h-6 items-center rounded-md bg-primary/8 px-2 text-[11.5px] font-medium text-primary">
          #{tag}
        </span>
      ))}
    </div>
  );
});

interface NoteCoverHeaderProps {
  store: EditorStore
  compact?: boolean
  /** 阅读态：封面/图标/标题只展示，不给任何编辑入口 */
  readOnly?: boolean
  /** Fullscreen document view: let the cover break out of the text canvas. */
  fullBleed?: boolean
  /** Keep title aligned with the body when an inline outline rail is present. */
  contentInsetLeft?: number
  content?: string
}

/**
 * Sits above the editor body: exposes the note's emoji icon and cover image,
 * both persisted through `metadata` and shipped with the note on send.
 */
export const NoteCoverHeader = observer(({ store, compact = false, readOnly = false, fullBleed = false, contentInsetLeft = 0, content = '' }: NoteCoverHeaderProps) => {
  const { t } = useTranslation();
  const [iconOpen, setIconOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);

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
    const blinko = RootStore.Get(BlinkoStore);
    void blinko.silentUpsertNote({
      id: store.noteId,
      metadata: patch,
    }).then(() => { blinko.updateTicker++; });
  };

  const finishAdjust = () => {
    setAdjusting(false);
    persistMetadata({ coverOffset: store.coverOffset });
  };

  // Esc leaves the framing tool; whatever the last pan produced stays applied.
  useEffect(() => {
    const textarea = titleRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [store.title, fullBleed]);

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
        <div
          data-testid="document-cover"
          className={`relative mb-5 overflow-hidden ${
            fullBleed
              ? 'left-1/2 w-screen -translate-x-1/2 rounded-none h-[clamp(220px,30vw,380px)]'
              : 'w-full rounded-xl aspect-[2.35/1] max-h-[260px]'
          } ${adjusting ? 'ring-2 ring-inset ring-primary/60' : 'group/cover'}`}
        >
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
                className="h-full w-full object-cover"
              />
              {!readOnly && (
                <div className="absolute bottom-3 right-3 flex items-center gap-1.5 opacity-90 transition-opacity group-hover/cover:opacity-100">
                  <button
                    type="button"
                    title={t('adjust-cover-position')}
                    onClick={(event) => { event.stopPropagation(); setAdjusting(true); }}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-black/55 px-3 text-xs text-white backdrop-blur-md transition-colors hover:bg-black/75"
                  >
                    <Icon icon="mingcute:move-line" width={14} height={14} />
                    {t('adjust-cover-position')}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); setCoverOpen(true); }}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-black/55 px-3 text-xs text-white backdrop-blur-md transition-colors hover:bg-black/75"
                  >
                    <Icon icon="lucide:pencil" width={13} height={13} />
                    {t('edit-cover')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className={`${compact ? "mb-2" : "mb-5"} px-0.5 transition-[padding] duration-200`} style={{ paddingLeft: contentInsetLeft }}>
        {!readOnly && (!icon || !coverUrl) && (
          <div data-testid="document-title-actions" className="mb-2 flex min-h-7 items-center gap-1 text-default-400">
            {!icon && (
              <button
                type="button"
                onClick={() => setIconOpen(true)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors hover:bg-default-100 hover:text-default-700"
              >
                <Icon icon="mingcute:emoji-2-line" width={16} height={16} />
                {t('add-icon')}
              </button>
            )}
            {!coverUrl && (
              <button
                type="button"
                onClick={() => setCoverOpen(true)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors hover:bg-default-100 hover:text-default-700"
              >
                <Icon icon="hugeicons:image-01" width={16} height={16} />
                {t('add-cover')}
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          {icon && (
            <button
              type="button"
              title={t('select-icon')}
              onClick={() => !readOnly && setIconOpen(true)}
              className={`grid size-11 shrink-0 place-items-center rounded-xl text-3xl leading-none transition-colors ${
                readOnly ? 'cursor-default' : 'hover:bg-default-100'
              }`}
            >
              {icon}
            </button>
          )}
          <textarea
            ref={titleRef}
            rows={1}
            data-testid="document-title-input"
            value={store.title ?? ''}
            onChange={(event) => !readOnly && store.setTitle(event.target.value)}
            onBlur={() => { if (!readOnly) persistMetadata({ title: store.title ?? null }); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                persistMetadata({ title: store.title ?? null });
                store.vditor?.focus?.();
              }
            }}
            readOnly={readOnly}
            placeholder={readOnly ? undefined : t('note-title-placeholder')}
            className={`min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-foreground outline-none placeholder:font-normal placeholder:text-default-400 ${compact ? "text-base md:text-lg font-medium leading-normal tracking-normal" : "text-[30px] md:text-[40px] font-bold leading-tight tracking-[-0.02em]"} ${
              readOnly ? 'cursor-default' : ''
            }`}
          />
        </div>
        <DocumentVisibleTags store={store} content={content} className="mt-2" />
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
