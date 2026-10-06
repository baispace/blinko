import { observer } from "mobx-react-lite";
import { BlinkoStore } from '@/store/blinkoStore';
import { Card } from '@heroui/react';
import { RootStore } from '@/store';
import { ContextMenuTrigger } from '@/components/Common/ContextMenu';
import { Note, NoteType } from '@shared/lib/types';
import { ShowEditBlinkoModel } from "../BlinkoRightClickMenu";
import { useMediaQuery } from "usehooks-ts";
import { _ } from '@/lib/lodash';
import { useState, useEffect } from "react";
import { CardBlogBox } from "./cardBlogBox";
import { NoteContent } from "./noteContent";
import { helper } from "@/lib/helper";
import { CardHeader } from "./cardHeader";
import { CardFooter, BlogCardTopRow, BlogCardBottomRow } from "./cardFooter";
import { FocusEditorFixMobile } from "../Common/Editor/editorUtils";
import { AvatarAccount, SimpleCommentList } from "./commentButton";
import { PluginApiStore } from "@/store/plugin/pluginApiStore";
import { PluginRender } from "@/store/plugin/pluginRender";
import { useLocation, useNavigate } from "react-router-dom";
import { SwipeableCard } from "./SwipeableCard";
import { api } from "@/lib/trpc";
import { FullscreenEditor } from "./FullscreenEditor";
import { NoteCoverDisplay, NoteTitleDisplay } from "../Common/Editor/NoteCover";
import { BlinkoImageGallery } from "./imageGallery";


export type BlinkoItem = Note & {
  isBlog?: boolean;
  title?: string;
  /** 标记 title 是 metadata.title 还是 content 第一行提取出来的；用于正文去重 */
  titleFromMetadata?: boolean;
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
  /** Detail route: always uses the full labelled action menu, even for a
      compact blinko (otherwise opening a blinko full-screen still shows the
      Weibo-style compact bar). */
  isDetailPage?: boolean;
}

export const BlinkoCard = observer(({ blinkoItem, account, isShareMode = false, glassEffect = false, forceBlog = false, withoutBoxShadow = false, withoutHoverAnimation = false, className, defaultExpanded = false, isDetailPage = false }: BlinkoCardProps) => {
  const isPc = useMediaQuery('(min-width: 768px)');
  const blinko = RootStore.Get(BlinkoStore);
  const pluginApi = RootStore.Get(PluginApiStore);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [isFullscreenEditorOpen, setIsFullscreenEditorOpen] = useState(false);

  // Set isExpand flag to prevent drag when fullscreen editor is open for this note
  blinkoItem.isExpand = blinko.fullscreenEditorNoteId === blinkoItem.id;

  /**
   * 长文（isBlog）从列表点进来要走 FullscreenEditor。
   * 但 FullscreenEditor 是挂在本组件里的，handleClick setIsFullscreenEditorOpen(true)
   * 紧跟着 navigate(`/detail?id=...`) 时，list 卡片会被卸载，新 detail 卡片 mounted
   * 后 useState 默认值把 FullscreenEditor 重置成关闭。
   *
   * 修法：list 卡片只把信号写到 store（fullscreenEditorNoteId），
   * navigate 到 detail 后 detail 卡片接管、用 effect 把 FullscreenEditor 开起来。
   * 用户在 detail 里点 × 时 handleClose 已经会把 store 清成 null，避免下次进入
   * 自动重开。
   */
  useEffect(() => {
    if (isDetailPage
        && blinko.fullscreenEditorNoteId === blinkoItem.id
        && !isFullscreenEditorOpen) {
      setIsFullscreenEditorOpen(true);
    }
  }, [isDetailPage, blinko.fullscreenEditorNoteId, blinkoItem.id, isFullscreenEditorOpen]);

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
  // 卡片标题优先级：metadata.title > content 第一行（去掉 markdown 标记和行内 tag）> 空。
  // 没有标题时直接截断展示正文，由 NoteContent 负责；有标题时显示在 NoteTitleDisplay 行。
  const rawFirstLine = blinkoItem.content?.split('\n').find(line => {
    if (!line.trim()) return false;
    if (helper.regex.isContainHashTag.test(line)) return false;
    return true;
  });
  const metadataTitle = blinkoItem.metadata?.title?.trim();
  const titleFromContent = rawFirstLine ? rawFirstLine
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/\s*#[^#\s]+/g, '')
    .trim() : undefined;

  blinkoItem.titleFromMetadata = !!metadataTitle;
  blinkoItem.title = metadataTitle || titleFromContent || '';


  const handleClick = () => {
    if (blinko.isMultiSelectMode) {
      blinko.onMultiSelectNote(blinkoItem.id!);
      return;
    }
    if (isShareMode) return;
    // Long article cards (isBlog) want the fullscreen editor on top of the
    // detail page (so the body stays full-width instead of dropping into the
    // regular card layout). For everything else, navigate to the shareable
    // `/detail` URL so the address bar always carries `?id=`. Detail-page
    // renders already show the note full-bleed, so they no-op here — clicking
    // inside the editor stays inside the editor.
    if (blinkoItem.id == null) return;
    // 列表点击 → 直接进 FullscreenEditor 编辑态，不再分 isBlog。
    // 老逻辑只在 isBlog 时设 fullscreenEditorNoteId，普通 NOTE 卡片点完
    // 会停在 detail 页的不可编辑卡片预览（用户看到的就是"中间页"）。
    // 现在所有 list 点击都设上信号，detail 页面的 BlinkoCard 卡片 useEffect
    // 看到信号匹配就开 FullscreenEditor；详情页路由 mounted 时也有独立
    // effect 自动设上信号（pages/detail/index.tsx）。
    blinko.fullscreenEditorNoteId = blinkoItem.id;
    if (!isDetailPage) {
      navigate(`/detail?id=${blinkoItem.id}`);
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

  /**
   * 全屏编辑器打开时，底下的卡片整块被 z-[9999] 的 portal 盖住，是纯死 UI：
   * 白白多跑一次 MarkdownRender / 附件 / 评论的渲染，还会被 TableOfContents
   * 的 heading 查询抓走（点大纲滚的是一个看不见的节点，看着像点了没反应），
   * 另外从列表切笔记时会先闪一帧上一条笔记的卡片。所以这里只挂编辑器本身。
   */
  if (isFullscreenEditorOpen) {
    return (
      <FullscreenEditor
        blinkoItem={blinkoItem}
        isOpen
        onClose={() => setIsFullscreenEditorOpen(false)}
        isDetailPage={isDetailPage}
      />
    );
  }

  return (
    <>
      {/* Fullscreen Editor Overlay */}
      <FullscreenEditor
        blinkoItem={blinkoItem}
        isOpen={isFullscreenEditorOpen}
        onClose={() => setIsFullscreenEditorOpen(false)}
        isDetailPage={isDetailPage}
      />

      {(() => {
        // Weibo-style blinko cards: header → text → image gallery (below
        // content, natural ratio for single image) → footer. Non-image
        // attachments stay in the content flow. Only applies to compact cards.
        //
        // 展示侧对应 editorStore.uploadFiles 的存储分流：闪念的图片只存附件、
        // 不写进正文 markdown，所以这里能把它们整个抽出来做九宫格；
        // 笔记/待办的图片在正文里，本来就随文流动，不需要（也不能）抽出来。
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
                {!blinkoItem.isBlog &&
                  blinkoItem.type === NoteType.NOTE &&
                  (blinkoItem.title || blinkoItem.metadata?.icon) && (
                    <NoteTitleDisplay
                      icon={blinkoItem.metadata?.icon}
                      title={blinkoItem.title}
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
                    compactActions={isCompactBlinko && !isDetailPage}
                    isDetailPage={isDetailPage}
                  />
                )}

                {/* Blog card layout (article-style):
                      [type | actions]  ← above the title
                      title
                      [tags | time]     ← below the title */}
                {blinkoItem.isBlog && (
                  <>
                    <BlogCardTopRow blinkoItem={blinkoItem} blinko={blinko} isShareMode={isShareMode} isDetailPage={isDetailPage} />
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
                    skipFirstLine={!blinkoItem.titleFromMetadata && !!blinkoItem.title}
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