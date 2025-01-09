import { BlinkoCard } from "@/components/BlinkoCard";
import { ScrollArea } from "@/components/Common/ScrollArea";
import { api } from "@/lib/trpc";
import { RootStore } from "@/store";
import { PromisePageState } from "@/store/standard/PromiseState";
import { StorageState } from "@/store/standard/StorageState";
import { Icon } from "@iconify/react";
import { Button, ButtonGroup, Tabs, Tab } from "@nextui-org/react";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import Masonry from "react-masonry-css";

const Hub = observer(() => {
  const { t } = useTranslation()
  const store = RootStore.Local(() => ({
    forceBlog: new StorageState({ key: 'forceBlog', default: true, value: true }),
    shareNoteList: new PromisePageState({
      function: async ({ page, size }) => {
        const notes = await api.notes.publicList.mutate({ page, size })
        return notes
      }
    })
  }))

  useEffect(() => {
    store.shareNoteList.resetAndCall({})
  }, [])

  return <div className='flex flex-col max-w-[1200px] mx-auto h-full w-full'>
    <div className='flex items-center justify-between gap-2 my-4 mx-2 bg-background rounded-2xl p-4'>
      <Tabs aria-label="Options" color="primary">
        <Tab key="site" title={t("home-site")}></Tab>
      </Tabs>

      <Button variant="faded" color="primary" isIconOnly onPress={() => {
        store.forceBlog.save(!store.forceBlog.value)
      }} className="ml-auto">
        <Icon icon="fluent:arrow-expand-all-16-filled" width="20" height="20" className={`transition-transform duration-300 ${store.forceBlog.value ? "rotate-180" : ""}`} />
      </Button>

    </div>
    <ScrollArea className='p-4 bg-sencondbackground h-full w-full -pt-[20px]' onBottom={() => store.shareNoteList.callNextPage({})}>
      <Masonry
        breakpointCols={{
          default: 3,
          500: 1
        }}
        className="card-masonry-grid"
        columnClassName="card-masonry-grid_column">
        {
          store.shareNoteList?.value?.map(i => {
            return <BlinkoCard key={i.id} blinkoItem={i} isShareMode account={i.account ?? undefined} forceBlog={store.forceBlog.value} />
          })
        }
      </Masonry>
    </ScrollArea>
  </div>
});

export default Hub