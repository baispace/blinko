import { observer } from "mobx-react-lite";
import { BlinkoStore } from '@/store/blinkoStore';
import { Card } from '@heroui/react';
import { RootStore } from '@/store';
import { ContextMenuTrigger } from '@/components/Common/ContextMenu';
import { Note, NoteType } from '@shared/lib/types';
import { ShowEditBlinkoModel } from "../BlinkoRightClickMenu";
import { useMediaQuery } from "usehooks-ts";
import { _ } from '@/lib/lodash';
import { useState } from "react";
import { CardBlogBox } from "./cardBlogBox";
import { NoteContent } from "./noteContent";
import { helper } from "@/lib/helper";
import { CardHeader } from "./cardHeader";
import { CardFooter, BlogCardTopRow, BlogCardBottomRow } from "./cardFooter";
import { FocusEditorFixMobile } from "../Common/Editor/editorUtils";
import { AvatarAccount, SimpleCommentList } from "./commentButton";
import { PluginApiStore } from "@/store/plugin/pluginApiStore";
import { PluginRender } from "@/store/plugin/pluginRender";
import { useLocation } from "react-router-dom";
import { SwipeableCard } from "./SwipeableCard";
import { api } from "@/lib/trpc";
import { FullscreenEditor } from "./FullscreenEditor";
import { NoteCoverDisplay, NoteTitleDisplay } from "../Common/Editor/NoteCover";
import { BlinkoImageGallery } from "./imageGallery";


export type BlinkoItem = Note & {
  isBlog?: boolean;
  title?: string;
  originURL?: string;
  isExpand?: boolean;
}

interface BlinkoCardProps {
  blinkoItem: BlinkoItem;
  className?: string;
  account?: AvatarAccount;
  isShareMode?: boolean;
  forceBlog?: boolean;
  defaultExpanded?: boolean;
  glassEffect?: boolean;
  withoutHoverAnimation?: boolean;
  withoutBoxShadow?: boolean;
}

export const BlinkoCard = observer(({ blinkoItem, account, isShareMode = false, glassEffect = false, forceBlog = false, withoutBoxShadow = false, withoutHoverAnimation = false, className, defaultExpanded = false }: BlinkoCardProps) => {
  const isPc = useMediaQuery('(min-width: 768px)');
  const blinko = RootStore.Get(BlinkoStore);
  const pluginApi = RootStore.Get(PluginApiStore);
  const { pathname } = useLocation();
  const [isFullscreenEditorOpen, setIsFullscreenEditorOpen] = useState(false);

  // Set isExpand flag to prevent drag when fullscreen editor is open for this note
  blinkoItem.isExpand = blinko.fullscreenEditorNoteId === blinkoItem.id;

  // Three-tier card model (per user threshold config):
  //   normal card  < cardFoldLength (300)
  //   folded card  cardFoldLength ~ textFoldLength (300-999, Weibo-style
  //                truncation with expand toggle, media still visible)
  //   article card ≥ textFoldLength (1000, cover card + fullscreen editor)
  const contentLength = blinkoItem.content?.length ?? 0;
  if (forceBlog) {
    blinkoItem.isBlog = true
  } else {
    blinkoItem.isBlog = contentLength >= (blinko.config.value?.textFoldLength ?? 1000) && !pathname.includes('/share/')
  }
  blinkoItem.title = blinkoItem.content?.split('\n').find(line => {
    if (!line.trim()) return false;
    if (helper.regex.isContainHashTag.test(line)) return false;
    return true;
  }) || '';


  const handleClick = () => {
    if (blinko.isMultiSelectMode) {
      blinko.onMultiSelectNote(blinkoItem.id!);
    } else if (blinkoItem.isBlog && !isShareMode) {
      setIsFullscreenEditorOpen(true);
      blinko.fullscreenEditorNoteId = blinkoItem.id!;
    }
  };

  const handleContextMenu = () => {
    if (isShareMode) return;
    blinko.curSelectedNote = _.cloneDeep(blinkoItem);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isShareMode) return;
    blinko.curSelectedNote = _.cloneDeep(blinkoItem);
    ShowEditBlinkoModel();
    FocusEditorFixMobile()
  };

  const handleSwipePin = () => {
    blinko.upsertNote.call({
      id: blinkoItem.id,
      isTop: !blinkoItem.isTop
    });
  };

  const handleSwipeDelete = () => {
    api.notes.trashMany.mutate({ ids: [blinkoItem.id!] }).then(() => {
      blinko.updateTicker++;
    });
  };

  return (
    <>
      {/* Fullscreen Editor Overlay */}
      <FullscreenEditor
        blinkoItem={blinkoItem}
        isOpen={isFullscreenEditorOpen}
        onClose={() => setIsFullscreenEditorOpen(false)}
      />

      {(() => {
        // Weibo-style blinko cards: header → text → image gallery (below
        // content, natural ratio for single image) → footer. Non-image
        // attachments stay in the content flow. Only applies to compact cards.
        const isCompactBlinko = blinkoItem.type === NoteType.BLINKO && !blinkoItem.isBlog;
        const allAttachments = blinkoItem.attachments ?? [];
        const imageAttachments = allAttachments.filter(a => helper.getFileType(a.type, a.name) === 'image');
        const otherAttachments = allAttachments.filter(a => helper.getFileType(a.type, a.name) !== 'image');

        const cardContent = (
          <div
            {...(!isShareMode && {
              onContextMenu: handleContextMenu,
              onDoubleClick: handleDoubleClick
            })}
            onClick={handleClick}
          >
            <Card
              onContextMenu={e => !isPc && e.stopPropagation()}
              shadow='none'
              className={`
                flex flex-col p-4 ${glassEffect ? 'bg-transparent' : 'bg-background'} !transition-all group/card
                ${isPc && !blinkoItem.isShare && !withoutHoverAnimation ? 'hover:translate-y-1' : ''}
                ${blinkoItem.isBlog ? 'cursor-pointer' : ''}
                ${blinko.curMultiSelectIds?.includes(blinkoItem.id!) ? 'border-2 border-primary' : ''}
                ${className}
              `}
            >
              <div className="w-full">
                <NoteCoverDisplay
                  cover={blinkoItem.metadata?.cover}
                  coverOffset={blinkoItem.metadata?.coverOffset}
                />

                {/* Icon + title belong to notes; blog cards already derive their heading. */}
                {!blinkoItem.isBlog && blinkoItem.type === NoteType.NOTE && (
                  <NoteTitleDisplay
                    icon={blinkoItem.metadata?.icon}
                    title={blinkoItem.metadata?.title}
                  />
                )}

                {/* Blog cards skip the header row entirely: timestamp, tags
                    and the action bar all live in the footer (Weibo-style),
                    otherwise time/icons sit above the title and the type chip
                    drifts to the footer corner — too scattered. */}
                {!blinkoItem.isBlog && (
                  <CardHeader
                    blinkoItem={blinkoItem}
                    blinko={blinko}
                    isShareMode={isShareMode}
                    isExpanded={defaultExpanded}
                    account={account}
                    hideTime={isCompactBlinko}
                    compactActions={isCompactBlinko}
                  />
                )}

                {/* Blog card layout (article-style):
                      [type | actions]  ← above the title
                      title
                      [tags | time]     ← below the title */}
                {blinkoItem.isBlog && (
                  <>
                    <BlogCardTopRow blinkoItem={blinkoItem} blinko={blinko} isShareMode={isShareMode} />
                    <CardBlogBox blinkoItem={blinkoItem} isExpanded={defaultExpanded} />
                    <BlogCardBottomRow blinkoItem={blinkoItem} blinko={blinko} isShareMode={isShareMode} />
                  </>
                )}

                {!blinkoItem.isBlog && (
                  <NoteContent
                    blinkoItem={blinkoItem}
                    blinko={blinko}
                    isExpanded={defaultExpanded}
                    isShareMode={isShareMode}
                    attachments={isCompactBlinko ? otherAttachments : undefined}
                    foldable={isCompactBlinko}
                    foldLength={blinko.config.value?.cardFoldLength ?? 300}
                    inlineTags={isCompactBlinko}
                  />
                )}

                {isCompactBlinko && imageAttachments.length > 0 && (
                  <div className="mt-2">
                    <BlinkoImageGallery files={imageAttachments} />
                  </div>
                )}

                {/* Custom Footer Slots */}
                {pluginApi.customCardFooterSlots
                  .filter(slot => {
                    if (slot.isHidden) return false;
                    if (slot.showCondition && !slot.showCondition(blinkoItem)) return false;
                    if (slot.hideCondition && slot.hideCondition(blinkoItem)) return false;
                    return true;
                  })
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map((slot) => (
                    <div
                      key={slot.name}
                      className={`mt-4 ${slot.className || ''}`}
                      style={slot.style}
                      onClick={slot.onClick}
                      onMouseEnter={slot.onHover}
                      onMouseLeave={slot.onLeave}
                    >
                      <div style={{ maxWidth: slot.maxWidth }}>
                        <PluginRender content={slot.content} data={blinkoItem} />
                      </div>
                    </div>
                  ))}

                {/* Blog cards use BlogCardTopRow/BlogCardBottomRow around the
                    title instead; compact blinko cards show time here. */}
                {!blinkoItem.isBlog && (
                  <CardFooter
                    blinkoItem={blinkoItem}
                    blinko={blinko}
                    isShareMode={isShareMode}
                    showTime={isCompactBlinko}
                    hideTags={isCompactBlinko}
                  />
                )}
                {!blinko.config.value?.isHideCommentInCard && blinkoItem.comments && blinkoItem.comments.length > 0 && (
                  <SimpleCommentList blinkoItem={blinkoItem} />
                )}
              </div>
            </Card>
          </div>
        );

        const wrappedContent = isShareMode ? cardContent : (
          <ContextMenuTrigger id="blink-item-context-menu">
            {cardContent}
          </ContextMenuTrigger>
        );

        // On mobile, wrap with SwipeableCard for swipe actions
        if (!isPc && !isShareMode) {
          return (
            <SwipeableCard
              onPin={handleSwipePin}
              onDelete={handleSwipeDelete}
              isPinned={blinkoItem.isTop}
            >
              {wrappedContent}
            </SwipeableCard>
          );
        }

        return wrappedContent;
      })()}
    </>
  );
});