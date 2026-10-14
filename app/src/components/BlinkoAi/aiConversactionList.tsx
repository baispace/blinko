import { RootStore } from "@/store/root"
import { AiStore } from "@/store/aiStore"
import { observer } from "mobx-react-lite"
import { useEffect, useState } from "react"
import { LoadingAndEmpty } from "../Common/LoadingAndEmpty"
import { DialogStore } from "@/store/module/Dialog"
import { IconButton } from "../Common/Editor/Toolbar/IconButton"
import { ScrollArea } from "../Common/ScrollArea"
import { api } from "@/lib/trpc"
import { PromiseCall } from "@/store/standard/PromiseState"
import { useTranslation } from "react-i18next"
import { useMediaQuery } from "usehooks-ts"

export const AiConversactionList = observer(({ inline = false, onSelect }: { inline?: boolean; onSelect?: () => void }) => {
  const aiStore = RootStore.Get(AiStore)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 768px)')
  
  useEffect(() => {
    aiStore.conversactionList.resetAndCall({})
  }, [])

  const handleUpdate = async (item) => {
    if (!newTitle.trim()) { setEditingId(null); return; }
    try {
    await api.conversation.update.mutate({
      id: item.id,
      title: newTitle.trim()
    });
    if (aiStore.currentConversationId === item.id) await aiStore.currentConversation.call();
    aiStore.conversactionList.resetAndCall({})
    setEditingId(null)
    } catch (error) { console.error("Conversation rename failed", error); }
  };
  
  const handleDelete = async (item) => {
    if (aiStore.isAnswering) return;
    await PromiseCall(api.conversation.delete.mutate({
      id: item.id
    }))
    if (aiStore.currentConversationId === item.id) {
      aiStore.newChat()
    }
    aiStore.conversactionList.resetAndCall({})
  }
  return <div className={inline ? "pb-4" : "px-2 pb-6"}>
    {!aiStore.conversactionList.loading.value && !aiStore.conversactionList.value?.length && inline && <p className="px-2 py-4 text-sm text-default-400">暂无对话，点击下方开始新对话</p>}
    <LoadingAndEmpty
      isLoading={aiStore.conversactionList.loading.value}
      isEmpty={aiStore.conversactionList.value?.length === 0}
    />
    <ScrollArea
      onBottom={() => {
        aiStore.conversactionList.callNextPage({})
      }}
      className={`flex flex-col gap-1 ${inline ? "" : "-mt-2 max-h-[400px]"}`}>
      {aiStore.conversactionList.value?.map(item => (
        <div
          className={`group flex items-center justify-between p-2 rounded-md hover:bg-hover relative ${item.id === aiStore.currentConversationId ? "bg-default-100" : ""}`}
          key={item.id}
        >
          {editingId === item.id ? (
            <input
              autoFocus
              className="flex-1 bg-transparent outline-none"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUpdate(item);
                if (e.key === 'Escape') setEditingId(null);
              }}
              onBlur={() => setEditingId(null)}
            />
          ) : (
            <button
              type="button"
              disabled={aiStore.isAnswering || aiStore.currentConversation.loading.value}
              aria-current={item.id === aiStore.currentConversationId ? "true" : undefined}
              className="flex-1 text-left truncate pr-14 cursor-pointer disabled:opacity-50"
              onClick={() => {
                if (editingId !== null) return;
                aiStore.input = "";
                aiStore.clearCurrentMessageResult();
                aiStore.currentConversation.setValue(null);
                aiStore.currentConversationId = item.id;
                aiStore.currentConversation.call();
                aiStore.isChatting = true;
                if (!inline) RootStore.Get(DialogStore).close();
                onSelect?.();
              }}
            >
              {item.title || t('no-title')}
            </button>
          )}

          <div className={`${isMobile ? 'flex' : 'hidden group-hover:flex'} items-center gap-1 absolute right-2 top-1/2 -translate-y-1/2 px-2 rounded`}>
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                setEditingId(item.id);
                setNewTitle(item.title || '');
              }}
              tooltip={t('rename')}
              icon="hugeicons:edit-02"
              size={20}
              containerSize={30}
            />
            <IconButton
              classNames={{
                icon: 'text-danger/60 hover:text-danger'
              }}
              onClick={(e) => {
                e.stopPropagation()
                handleDelete(item)
              }}
              tooltip={t('delete')}
              icon="hugeicons:delete-02"
            />
          </div>
        </div>
      ))}
    </ScrollArea>
    {inline && !aiStore.conversactionList.isLoadAll && !!aiStore.conversactionList.value?.length && <button type="button" disabled={aiStore.conversactionList.loading.value} onClick={() => aiStore.conversactionList.callNextPage({})} className="w-full py-2 text-xs text-default-500 hover:bg-hover rounded-md">{aiStore.conversactionList.loading.value ? "加载中…" : "加载更多"}</button>}
  </div>
})