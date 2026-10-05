import { observer } from "mobx-react-lite"
import Editor from "../Common/Editor"
import { RootStore } from "@/store"
import { BlinkoStore } from "@/store/blinkoStore"
import dayjs from "@/lib/dayjs"
import { useEffect, useRef, useCallback } from "react"
import { NoteType } from "@shared/lib/types"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"

/** 停止输入多久后自动落库（毫秒） */
const AUTOSAVE_DELAY = 800
/** 附件 / 引用 / 类型这类离散操作的合并窗口，够吸收一次批量 reaction 即可 */
const SIDE_PATCH_DELAY = 300

type IProps = {
  mode: 'create' | 'edit',
  onSended?: () => void,
  onHeightChange?: (height: number) => void,
  height?: number,
  isInDialog?: boolean,
  withoutOutline?: boolean,
  initialData?: { file?: File, text?: string },
  showTopToolbar?: boolean,
  /**
   * 阅读态 / 编辑态。共用同一棵 Tiptap 树，只切 setEditable：
   * 全屏阅读场景用它做到「点一下正文就能接着写」，不重新 mount。
   */
  editable?: boolean,
  /** Tiptap 实例就绪回调，外层靠它把光标定位到用户点击的位置 */
  onEditorReady?: (editor: any) => void,
  /** 页面级滚动：封面随内容滚走、滚动条贴视口右缘（全屏阅读/编辑页用） */
  pageScroll?: boolean,
  /** 初始化时不自动聚焦（全屏文章页打开即编辑，避免视图被拽到文末） */
  focusOnMount?: boolean
}

export const BlinkoEditor = observer(({ mode, onSended, onHeightChange, isInDialog, withoutOutline, initialData, showTopToolbar = false, editable = true, onEditorReady, pageScroll = false, focusOnMount = true }: IProps) => {
  const isCreateMode = mode == 'create'
  const blinko = RootStore.Get(BlinkoStore)
  const editorRef = useRef<any>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 待落库的编辑，连同 noteId 一起快照，切换笔记后仍能正确补写旧的 */
  const pendingAutosave = useRef<{ id: number, content: string } | null>(null)
  /** 最近一次确认写入服务端的内容，用于跳过无变化的保存 */
  const lastSavedContent = useRef<string>('')

  const clearAutosaveTimer = () => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current)
      autosaveTimer.current = null
    }
  }

  /** 立即把排队中的编辑写回服务端（切换笔记 / 关闭编辑器 / 定时器到点） */
  const flushAutosave = useCallback(() => {
    clearAutosaveTimer()
    const item = pendingAutosave.current
    pendingAutosave.current = null
    if (!item) return null
    return blinko.autosaveNote(item)
  }, [blinko])

  /**
   * 编辑态的「操作即落库」。
   *
   * 自动保存只写 content，附件 / @引用 / 类型切换以前全压在手动「发布」上，
   * 按钮一旦变成「完成」（不再保存）它们就会悄悄丢。这里把它们各自写回。
   *
   * 同一条笔记上的多次补丁会合并成一次请求（打开笔记时 references/type/files
   * 会各触发一次 reaction，合并后只剩一个幂等的空写）。content 在补丁发生时
   * 就快照下来，避免定时器触发时笔记已经切走了。
   */
  const sidePatch = useRef<{ id: number, content: string, patch: any } | null>(null)
  const sidePatchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSidePatch = useCallback((patch: { attachments?: any[], references?: number[], type?: number }) => {
    const noteId = blinko.curSelectedNote?.id
    if (!noteId) return
    const base = sidePatch.current?.id === noteId ? sidePatch.current.patch : {}
    sidePatch.current = {
      id: noteId,
      content: blinko.curSelectedNote?.content ?? '',
      patch: { ...base, ...patch }
    }
    if (sidePatchTimer.current) clearTimeout(sidePatchTimer.current)
    sidePatchTimer.current = setTimeout(() => {
      const item = sidePatch.current
      sidePatch.current = null
      if (!item) return
      // content 必须一起发：后端在 content 为空时会提前 return，跳过附件/引用处理
      blinko.silentUpsertNote({ id: item.id, content: item.content, ...item.patch })
    }, SIDE_PATCH_DELAY)
  }, [blinko])

  /** 编辑态「完成」：正文已自动保存，这里只补写还没落库的、刷新列表、然后关闭 */
  const handleDone = useCallback(async () => {
    await flushAutosave()
    blinko.updateTicker++
    onSended?.()
  }, [flushAutosave, blinko, onSended])

  const store = RootStore.Local(() => ({
    get noteContent() {
      if (isCreateMode) {
        try {
          const local = blinko.createContentStorage.value
          const blinkoContent = blinko.noteContent
          return local?.content != '' ? local?.content : blinkoContent
        } catch (error) {
          return ''
        }
      } else {
        try {
          if (!blinko.curSelectedNote) return '';
          const local = blinko.editContentStorage.list?.find(i => Number(i.id) == Number(blinko.curSelectedNote!.id))
          const blinkoContent = blinko.curSelectedNote?.content ?? ''
          return local?.content != '' ? (local?.content ?? blinkoContent) : blinkoContent
        } catch (error) {
          return ''
        }
      }
    },
    set noteContent(v: string) {
      if (isCreateMode) {
        try {
          blinko.noteContent = v
          blinko.createContentStorage.save({ content: v })
        } catch (error) {
          console.error(error)
        }
      } else {
        try {
          if (!blinko.curSelectedNote) return;
          blinko.curSelectedNote.content = v
          const hasLocal = blinko.editContentStorage.list?.find(i => Number(i.id) == Number(blinko.curSelectedNote!.id))
          if (hasLocal) {
            hasLocal.content = v
            blinko.editContentStorage.save()
          } else {
            blinko.editContentStorage.push({ content: v, id: Number(blinko.curSelectedNote!.id) })
          }
        } catch (error) {
          console.error(error)
        }
      }
    },
    get files(): any {
      if (mode == 'create') {
        const attachments = blinko.createAttachmentsStorage.list
        if (attachments.length) {
          return (attachments)
        } else {
          return []
        }
      } else {
        return blinko.curSelectedNote?.attachments
        // const attachments = blinko.editAttachmentsStorage.list.filter(i => Number(i.id) == Number(blinko.curSelectedNote!.id))
        // if (attachments?.length) {
        //   return attachments
        // } else {
        //   return blinko.curSelectedNote?.attachments
        // }
      }
    }
  }))

  useEffect(() => {
    blinko.isCreateMode = mode == 'create'
    if (mode == 'create') {
      if (isInDialog) {
        document.documentElement.style.setProperty('--min-editor-height', `50vh`)
      }
      const local = blinko.createContentStorage.value
      if (local && local.content != '') {
        blinko.noteContent = local.content
      }
    } else {
      document.documentElement.style.setProperty('--min-editor-height', `unset`)
      try {
        if (!blinko.curSelectedNote) return;
        const local = blinko.editContentStorage.list?.find(i => Number(i.id) == Number(blinko.curSelectedNote!.id))
        if (local && local?.content != '') {
          blinko.curSelectedNote.content = local.content
        }
      } catch (error) {
        console.error(error)
      }
    }
  }, [mode])

  // 切换到另一条笔记（或编辑器卸载）前，把还没落库的编辑补写回去。
  // cleanup 用的是 pendingAutosave 的快照，所以补写的始终是上一条笔记。
  useEffect(() => {
    lastSavedContent.current = blinko.curSelectedNote?.content ?? ''
    return () => { flushAutosave() }
  }, [blinko.curSelectedNote?.id, flushAutosave])

  // Use Tauri hotkey hook


  return <div className={`h-full flex flex-col ${withoutOutline ? '' : ''}`} ref={editorRef} id='global-editor' data-tauri-drag-region onClick={() => {
    blinko.isCreateMode = mode == 'create'
  }}>
    <Editor
      mode={mode}
      originFiles={store.files}
      originReference={!isCreateMode ? blinko.curSelectedNote?.references?.map(i => i.toNoteId) : []}
      autosaveStatus={isCreateMode ? 'idle' : blinko.autosaveStatus}
      onDone={isCreateMode ? undefined : handleDone}
      onSidePatch={isCreateMode ? undefined : handleSidePatch}
      content={store.noteContent}
      onChange={v => {
        store.noteContent = v
        if (isCreateMode) return
        const noteId = blinko.curSelectedNote?.id
        if (!noteId) return
        const content = v ?? ''
        // 空内容不自动保存：宁可留着旧内容，也不要把整篇笔记悄悄清空
        if (!content.trim() || content === lastSavedContent.current) {
          clearAutosaveTimer()
          pendingAutosave.current = null
          return
        }
        pendingAutosave.current = { id: noteId, content }
        clearAutosaveTimer()
        autosaveTimer.current = setTimeout(flushAutosave, AUTOSAVE_DELAY)
      }}
      withoutOutline={withoutOutline}
      editable={editable}
      onEditorReady={onEditorReady}
      pageScroll={pageScroll}
      focusOnMount={focusOnMount}
      initialData={initialData}
      showTopToolbar={showTopToolbar}
      onHeightChange={() => {
        onHeightChange?.(editorRef.current?.clientHeight ?? 75)
        if (editorRef.current) {
          const editorElement = document.getElementById('global-editor');
          if (editorElement && editorElement.children[0]) {
            //@ts-ignore
            editorElement.__storeInstance = editorElement.children[0].__storeInstance;
          }
        }
      }}
      isSendLoading={blinko.upsertNote.loading.value}
      bottomSlot={
        isCreateMode ? <div className='text-xs text-ignore ml-2'>Drop to upload files</div> :
          blinko.curSelectedNote?.createdAt ? <div className='text-xs text-desc'>{dayjs(blinko.curSelectedNote.createdAt).format("YYYY-MM-DD hh:mm:ss")}</div> : null
      }
      onSend={async ({ files, references, noteType, metadata }) => {
        if (isCreateMode) {
          //@ts-ignore
          await blinko.upsertNote.call({ type: noteType, references, refresh: false, content: blinko.noteContent, attachments: files.map(i => { return { name: i.name, path: i.uploadPath, size: i.size, type: i.type } }), metadata })
          blinko.createAttachmentsStorage.clear()
          blinko.createContentStorage.clear()
          if (blinko.noteTypeDefault == NoteType.NOTE && searchParams.get('path') != 'notes') {
            await navigate('/?path=notes')
            blinko.forceQuery++
          }
          if (blinko.noteTypeDefault == NoteType.BLINKO && location.pathname != '/') {
            await navigate('/')
            blinko.forceQuery++
          }
          blinko.updateTicker++
        } else {
          if (!blinko.curSelectedNote) return;
          // 手动保存优先：丢掉排队中的自动保存，避免旧内容反过来覆盖这次结果
          clearAutosaveTimer()
          pendingAutosave.current = null
          blinko.cancelAutosave()
          // upsertNote 成功后会 emit 'editor:clear' 清空编辑器，先取好内容
          const manuallySavedContent = blinko.curSelectedNote.content ?? ''
          await blinko.upsertNote.call({
            id: blinko.curSelectedNote.id,
            type: noteType,
            //@ts-ignore
            content: blinko.curSelectedNote.content,
            //@ts-ignore
            attachments: files.map(i => { return { name: i.name, path: i.uploadPath, size: i.size, type: i.type } }),
            references,
            metadata,
            refresh: true // Ensure list is refreshed after update
          })
          lastSavedContent.current = manuallySavedContent
          try {
            // 两个 list 各自按 id 找下标——它们存放的条件不同，下标并不对应，
            // 复用同一个 index 会删错行（这也是本地草稿残留导致回滚的原因之一）
            const noteId = blinko.curSelectedNote!.id
            blinko.editAttachmentsStorage.removeByFind(i => Number(i.id) === Number(noteId))
            blinko.editContentStorage.removeByFind(i => Number(i.id) === Number(noteId))
          } catch (error) {
            console.error(error)
          }
        }
        onSended?.()
      }} />
  </div>
})


