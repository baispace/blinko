import { RootStore } from "@/store/root"
import { AiStore } from "@/store/aiStore"
import { observer } from "mobx-react-lite"
import { useEffect } from "react"
import { LoadingAndEmpty } from "../Common/LoadingAndEmpty"
import { DialogStore } from "@/store/module/Dialog"

export const AiConversactionList = observer(() => {
  const aiStore = RootStore.Get(AiStore)
  useEffect(() => {
    aiStore.conversactionList.resetAndCall({ page: 1, size: 20 })
  }, [])

  return <div className="p-2">
    <LoadingAndEmpty
      isLoading={aiStore.conversactionList.loading.value}
      isEmpty={aiStore.conversactionList.value?.length === 0}
    >
    </LoadingAndEmpty>
    <div className="flex flex-col gap-2 cursor-pointer">
      {aiStore.conversactionList.value?.map(item => (
        <div key={item.id} onClick={() => {
          aiStore.currentConversationId = item.id
          aiStore.currentConversation.call()
          aiStore.isChatting = true
          RootStore.Get(DialogStore).close()
        }}>{item.createdAt.toLocaleString()}</div>
      ))}
    </div>
  </div>
})

