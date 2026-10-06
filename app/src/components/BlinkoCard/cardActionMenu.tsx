import { observer } from "mobx-react-lite";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { _ } from '@/lib/lodash';
import { Icon } from '@/components/Common/Iconify/icons';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { PluginApiStore } from '@/store/plugin/pluginApiStore';
import { PageWidthStore, PAGE_WIDTH_ORDER, type PageWidthMode } from '@/store/pageWidthStore';
import { Note } from '@shared/lib/types';
import {
  handleEdit,
  handleMultiSelect,
  handleSelectAll,
  handleTop,
  handlePublic,
  handlePublish,
  handleArchived,
  handleAITag,
  handleTrash,
  handleCopyContent,
  handleShowHistory,
  handleRelatedNotes,
  ConvertItemFunction,
  ShowEditTimeModel,
  EditItem,
  MutiSelectItem,
  SelectAllItem,
  CopyItem,
  EditTimeItem,
  HistoryItem,
  TopItem,
  ArchivedItem,
  ConvertItem,
  PublicItem,
  PublishItem,
  AITagItem,
  RelatedNotesItem,
  TrashItem,
  DeleteItem,
} from '../BlinkoRightClickMenu';

/**
 * Divider between groups.
 *
 * Must be inlined as a real `DropdownItem` instead of wrapped in a helper
 * component: react-stately builds the menu collection by calling
 * `child.type.getCollectionNode(...)` on every child, so a plain function
 * component (`type.getCollectionNode === undefined`) throws
 * "type.getCollectionNode is not a function" and takes the page down.
 */
const sepClassNames = {
  base: '!h-px !min-h-px !p-0 my-1 !bg-divider',
  wrapper: '!p-0 pointer-events-none',
};

/**
 * Feishu-style action menu for a note.
 *
 * The expanded card header used to render 7 bare icons, most of them only
 * visible on hover (opacity-0 group-hover:opacity-100), and the row shifted
 * sideways when the note was pinned (ml-auto vs ml-[10px]). Every action here
 * reuses the handler the right-click menu already uses — this component only
 * rearranges them into labelled, separated groups and sinks the destructive
 * action to the bottom.
 *
 * 触发器统一为裸「⋯」图标。FullscreenEditor 顶栏 + 移动底栏、detail 页面 header、
 * 博客卡片头都共用同一份菜单；标签 / chevron 文字样式会因为工具栏旁的"预览"
 * 切换按钮产生歧义，所以全部去掉。
 *
 * `showPageWidth` / `editorMode` 只由 FullscreenEditor 传；detail 页面和列表
 * 卡片不传，保持原有基础操作菜单。
 *
 * Requires `blinko.curSelectedNote` to be set; the trigger does that.
 */
export const CardActionMenu = observer(({
  blinkoItem,
  showPageWidth = false,
  editorMode,
  onToggleEditorMode,
  presentationMode = false,
  onTogglePresentation,
  isDetailPage = false,
}: {
  blinkoItem: Note;
  showPageWidth?: boolean;
  editorMode?: 'preview' | 'edit';
  onToggleEditorMode?: () => void;
  /** 飞书式演示模式：隐藏 chrome、只读正文、浮动退出演示按钮 */
  presentationMode?: boolean;
  onTogglePresentation?: () => void;
  isDetailPage?: boolean;
}) => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const pluginApi = RootStore.Get(PluginApiStore);
  const pageWidth = RootStore.Get(PageWidthStore);
  const isRecycle = !!blinkoItem.isRecycle;
  const hasAi = !!blinko.config.value?.mainModelId;
  /** 全屏编辑器才会额外挂「视图」组；列表卡片保持原样，避免和分组里的分享重复 */
  const showViewItems = showPageWidth || !!onToggleEditorMode;

  /** Every handler reads `blinko.curSelectedNote`, so refresh it right before. */
  const withNote = (fn: () => void) => () => {
    blinko.curSelectedNote = _.cloneDeep(blinkoItem);
    fn();
  };

  return (
    <Dropdown
      placement="bottom-end"
      onOpenChange={() => { blinko.curSelectedNote = _.cloneDeep(blinkoItem); }}
    >
      <DropdownTrigger>
        <div className="flex items-center cursor-pointer !transition-colors text-desc hover:text-primary hover:scale-110">
          <Icon icon="fluent:more-vertical-16-regular" width="18" height="18" />
        </div>
      </DropdownTrigger>

      <DropdownMenu
        aria-label={t('edit')}
        classNames={{
          // The fullscreen editor is a portal at z-[9999]; without this the
          // menu would render underneath it.
          base: 'z-[10050]',
          item: "rounded-lg text-[13.5px] gap-2",
        }}
      >
        {/* ── 视图：页宽 / 分享 / 编辑↔预览（仅全屏编辑器传入） ──
            每个 DropdownItem 都必须带 `textValue`，否则 react-aria 拿不到 plain
            text，type-to-select 失败 → collection 重初始化时 onPress 不再注册，
            现象是菜单可见但点了没反应（修复了之前 console 一片 Verbose warning）。 */}
        {showPageWidth && (
          <>
            <DropdownItem
              key="pw-label"
              textValue={t('page-width')}
              isReadOnly
              classNames={{
                base: '!min-h-px !py-1 !px-2.5 pointer-events-none',
                wrapper: '!p-0',
              }}
            >
              <span className="text-[11px] text-default-400">{t('page-width')}</span>
            </DropdownItem>
            {PAGE_WIDTH_ORDER.map((m) => (
              <DropdownItem
                key={`pw-${m}`}
                textValue={t('page-width-' + m)}
                onClick={() => pageWidth.setMode(m as PageWidthMode)}
                classNames={{ base: 'pl-8' }}
              >
                {pageWidth.mode === m && (
                  <Icon icon="mdi:check" width="15" height="15" className="text-primary" />
                )}
                {t('page-width-' + m)}
              </DropdownItem>
            ))}
            <DropdownItem key="sep-view" textValue=" " isReadOnly classNames={sepClassNames} />
          </>
        )}

        {showViewItems && (
          <DropdownItem key="share" textValue={t('share')} onClick={withNote(handlePublic)}>
            <div className="flex items-center gap-2">
              <Icon icon="tabler:share-2" width="20" height="20" />
              <div>{t('share')}</div>
            </div>
          </DropdownItem>
        )}

        {onToggleEditorMode && (
          <DropdownItem
            key="toggle-mode"
            textValue={editorMode === 'preview' ? t('edit') : t('preview')}
            onClick={() => { blinko.curSelectedNote = _.cloneDeep(blinkoItem); onToggleEditorMode(); }}
          >
            <div className="flex items-center gap-2">
              <Icon icon={editorMode === 'preview' ? 'tabler:edit' : 'tabler:eye'} width="20" height="20" />
              <div>{editorMode === 'preview' ? t('edit') : t('preview')}</div>
            </div>
          </DropdownItem>
        )}

        {/* 演示模式 = 飞书"演示"：隐藏 chrome、纯阅读、和编辑态正交。FullscreenEditor
            顶栏 ⋯ 菜单独有，list / detail 页面不暴露这个项。 */}
        {onTogglePresentation && (
          <DropdownItem
            key="presentation"
            textValue={presentationMode ? t('exit-presentation') : t('enter-presentation')}
            onClick={() => onTogglePresentation()}
          >
            <div className="flex items-center gap-2">
              <Icon
                icon={presentationMode ? 'mdi:close' : 'mdi:play'}
                width="20"
                height="20"
              />
              <div>{presentationMode ? t('exit-presentation') : t('enter-presentation')}</div>
            </div>
          </DropdownItem>
        )}

        {showViewItems && (
          <DropdownItem key="sep-basic" textValue=" " isReadOnly classNames={sepClassNames} />
        )}

        {/* 基本操作 —— 详情页只剩「编辑时间」「历史记录」。
            「编辑」「多选」「全部选择」「复制内容」均加 !isDetailPage 守卫，避免
            和详情页 header 的固定按钮 / 详情页的多选工具栏重复。 */}
        {!isDetailPage && (
          <DropdownItem
            key="edit"
            textValue={t('edit')}
            onClick={() => { blinko.curSelectedNote = _.cloneDeep(blinkoItem); handleEdit(isDetailPage); }}
          >
            <EditItem />
          </DropdownItem>
        )}
        {!isDetailPage && (
          <DropdownItem key="multi" textValue={t('multiple-select')} onClick={withNote(handleMultiSelect)}>
            <MutiSelectItem />
          </DropdownItem>
        )}
        {!isDetailPage && (
          <DropdownItem key="select-all" textValue={t('select-all')} onClick={withNote(handleSelectAll)}>
            <SelectAllItem />
          </DropdownItem>
        )}
        {!isDetailPage && (
          <DropdownItem key="copy" textValue={t('copy-content')} onClick={withNote(handleCopyContent)}>
            <CopyItem />
          </DropdownItem>
        )}
        <DropdownItem
          key="edittime"
          textValue={t('edit-time')}
          onClick={withNote(() => ShowEditTimeModel())}
        >
          <EditTimeItem />
        </DropdownItem>
        {!!blinkoItem._count?.histories && (
          <DropdownItem
            key="history"
            textValue={t('Note History')}
            onClick={withNote(handleShowHistory)}
          >
            <HistoryItem />
          </DropdownItem>
        )}

        <DropdownItem key="sep-org" textValue=" " isReadOnly classNames={sepClassNames} />

        {/* 组织 */}
        <DropdownItem
          key="top"
          textValue={blinko.curSelectedNote?.isTop ? t('cancel-top') : t('top')}
          onClick={withNote(handleTop)}
        >
          <TopItem />
        </DropdownItem>
        <DropdownItem
          key="archived"
          textValue={blinko.curSelectedNote?.isArchived || blinko.curSelectedNote?.isRecycle ? t('recovery') : t('archive')}
          onClick={withNote(handleArchived)}
        >
          <ArchivedItem />
        </DropdownItem>
        <DropdownItem
          key="convert"
          textValue={`${t('convert-to')} ${blinko.curSelectedNote?.type == 1 ? t('blinko') : t('note')}`}
          onClick={withNote(ConvertItemFunction)}
        >
          <ConvertItem />
        </DropdownItem>

        {!isRecycle && (
          <DropdownItem key="sep-share" textValue=" " isReadOnly classNames={sepClassNames} />
        )}

        {/* 分发 */}
        {/* 分享已上移到「视图」组，这里只在列表卡片里出现，避免同一菜单里出现两个分享 */}
        {!isRecycle && !showViewItems && (
          <DropdownItem key="public" textValue={t('share')} onClick={withNote(handlePublic)}>
            <PublicItem />
          </DropdownItem>
        )}
        {!isRecycle && (
          <DropdownItem
            key="publish"
            textValue={blinko.curSelectedNote?.isPublished ? t('cancel-publish') : t('publish-to-home')}
            onClick={withNote(handlePublish)}
          >
            <PublishItem />
          </DropdownItem>
        )}

        {hasAi && <DropdownItem key="sep-ai" textValue=" " isReadOnly classNames={sepClassNames} />}

        {/* 智能 */}
        {hasAi && (
          <DropdownItem key="aitag" textValue={t('ai-tag')} onClick={withNote(handleAITag)}>
            <AITagItem />
          </DropdownItem>
        )}
        {hasAi && (
          <DropdownItem
            key="related"
            textValue={t('related-notes')}
            onClick={withNote(handleRelatedNotes)}
          >
            <RelatedNotesItem />
          </DropdownItem>
        )}

        {pluginApi.customRightClickMenus.map((menu) => (
          <DropdownItem
            key={menu.name}
            textValue={menu.label}
            isDisabled={menu.disabled}
            onClick={withNote(() => menu.onClick(blinko.curSelectedNote!))}
          >
            <div className="flex items-start gap-2">
              {menu.icon && <Icon icon={menu.icon} width="20" height="20" />}
              <div>{menu.label}</div>
            </div>
          </DropdownItem>
        ))}

        <DropdownItem key="sep-danger" textValue=" " isReadOnly classNames={sepClassNames} />

        {/* 破坏性操作，永远沉底 */}
        <DropdownItem
          key="trash"
          textValue={isRecycle ? t('delete') : t('trash')}
          onClick={withNote(handleTrash)}
          className="text-danger data-[hover=true]:bg-danger/10 data-[hover=true]:text-danger"
        >
          {isRecycle ? <DeleteItem /> : <TrashItem />}
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
});