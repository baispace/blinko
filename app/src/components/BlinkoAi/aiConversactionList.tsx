import { cleanConversationTitle } from '@shared/lib/conversationTitle';
import { RootStore } from "@/store/root"
import { AiStore } from "@/store/aiStore"
import { observer } from "mobx-react-lite"
import { Fragment, useEffect, useState } from "react"
import { LoadingAndEmpty } from "../Common/LoadingAndEmpty"
import { DialogStore } from "@/store/module/Dialog"
import { IconButton } from "../Common/Editor/Toolbar/IconButton"
import { ScrollArea } from "../Common/ScrollArea"
import { api } from "@/lib/trpc"
import { ToastPlugin } from "@/store/module/Toast/Toast"
import { Icon } from "@/components/Common/Iconify/icons"
import { useTranslation } from "react-i18next"
import { useMediaQuery } from "usehooks-ts"

export const AiConversactionList = observer(({ inline = false, onSelect }: { inline?: boolean; onSelect?: () => void }) => {
  const aiStore = RootStore.Get(AiStore)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const { t } = useTranslation()
  const isMobile = useMediaQuery('(max-width: 768px)')
  
  useEffect(() => {
    aiStore.conversactionList.resetAndCall({})
  }, [])

  const handleUpdate = async (item) => {
    if (!newTitle.trim()) { setEditingId(null); return; }
    if (busyId !== null) return;
    setBusyId(item.id);
    try {
    await api.conversation.update.mutate({
      id: item.id,
      title: newTitle.trim()
    });
    if (aiStore.currentConversationId === item.id) await aiStore.currentConversation.call();
    aiStore.conversactionList.resetAndCall({})
    setEditingId(null)
    } catch { RootStore.Get(ToastPlugin).error("重命名失败，请重试"); }
    finally { setBusyId(null); }
  };
  
  const handleDelete = async (item) => {
    if (aiStore.isAnswering || aiStore.isPreparing || busyId !== null) return;
    setBusyId(item.id);
    try {
      await api.conversation.delete.mutate({ id: item.id });
      if (aiStore.currentConversationId === item.id) aiStore.newChat();
      await aiStore.conversactionList.resetAndCall({});
    } catch { RootStore.Get(ToastPlugin).error('删除失败，请重试'); }
    finally { setBusyId(null); }
  }
  const group = (date: Date | string) => {
    const day = new Date(date); const today = new Date();
    const stamp = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const elapsed = (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - stamp) / 86400000;
    return elapsed < 1 ? '今天' : elapsed < 2 ? '昨天' : elapsed < 7 ? '最近 7 天' : '更早';
  };

  return <div className={inline ? "pb-4" : "px-2 pb-6"}>
    {!aiStore.conversactionList.loading.value && !aiStore.conversactionList.value?.length && inline && <p className="px-2 py-4 text-sm text-default-400">暂无对话，点击下方开始新对话</p>}
    {!inline && <LoadingAndEmpty
      isLoading={aiStore.conversactionList.loading.value}
      isEmpty={aiStore.conversactionList.value?.length === 0}
    />}
    <ScrollArea
      onBottom={() => {
        aiStore.conversactionList.callNextPage({})
      }}
      className={`flex flex-col gap-1 ${inline ? "" : "-mt-2 max-h-[400px]"}`}>
      {aiStore.conversactionList.value?.map((item, index) => (
        <Fragment key={item.id}>
        {(index === 0 || group(item.createdAt) !== group(aiStore.conversactionList.value![index - 1]!.createdAt)) && <div className="px-2 pt-4 pb-1.5 text-[11px] font-medium text-default-400">{group(item.createdAt)}</div>}
        <div
          className={`group flex items-center justify-between p-2 rounded-md hover:bg-hover relative ${item.id === aiStore.currentConversationId ? "bg-default-100" : ""}`}
          key={item.id}
        >
          {editingId === item.id ? (
            <input
              autoFocus
              className="flex-1 min-w-0 rounded-md border border-primary/30 bg-background px-2 py-1 text-sm outline-none"
              aria-label="对话名称" disabled={busyId === item.id}
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
              disabled={busyId !== null || aiStore.isAnswering || aiStore.isPreparing || aiStore.currentConversation.loading.value}
              aria-current={item.id === aiStore.currentConversationId ? "true" : undefined}
              className="min-w-0 flex flex-1 items-center gap-2 text-left pr-14 text-[13px] cursor-pointer disabled:opacity-50"
              onClick={() => {
                if (editingId !== null) return;
                aiStore.chatStatus = "idle";
                aiStore.chatError = "";
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
              <Icon icon="tabler:message" width={16} className="shrink-0 text-default-400" /><span className="truncate">{cleanConversationTitle(item.title, t('no-title'))}</span>
            </button>
          )}

          <div className={`${isMobile ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'} items-center gap-1 absolute right-2 top-1/2 -translate-y-1/2 px-2 rounded`}>
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                if (busyId !== null || aiStore.isAnswering || aiStore.isPreparing) return;
                setEditingId(item.id);
                setNewTitle(cleanConversationTitle(item.title));
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
        </Fragment>
      ))}
    </ScrollArea>
    {inline && !aiStore.conversactionList.isLoadAll && !!aiStore.conversactionList.value?.length && <button type="button" disabled={aiStore.conversactionList.loading.value} onClick={() => aiStore.conversactionList.callNextPage({})} className="w-full py-2 text-xs text-default-500 hover:bg-hover rounded-md">{aiStore.conversactionList.loading.value ? "加载中…" : "加载更多"}</button>}
  </div>
})