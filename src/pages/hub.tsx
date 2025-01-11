import { BlinkoCard } from "@/components/BlinkoCard";
import { ScrollArea } from "@/components/Common/ScrollArea";
import { api } from "@/lib/trpc";
import { RootStore } from "@/store";
import { PromisePageState, PromiseState } from "@/store/standard/PromiseState";
import { StorageState } from "@/store/standard/StorageState";
import { Icon } from "@iconify/react";
import { Button, ButtonGroup, Tabs, Tab, cn, Input } from "@nextui-org/react";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import Masonry from "react-masonry-css";
import Avatar from "boring-avatars";
import { GradientBackground } from "@/components/Common/GradientBackground";
import { UserStore } from "@/store/user";
import { UserAvatar } from "@/components/BlinkoCard/commentButton";
import { useRouter } from "next/router";
import { useMediaQuery } from "usehooks-ts";
import { BlinkoStore } from "@/store/blinkoStore";
import { DialogStore } from "@/store/module/Dialog";
import { BlinkoFollowDialog, BlinkoFollowingDialog } from "@/components/BlinkoFollowDialog";
import axios from "axios";

const Hub = observer(({ className }: { className?: string }) => {
  const { t } = useTranslation()
  const blinko = RootStore.Get(BlinkoStore)
  const user = RootStore.Get(UserStore)
  const { query } = useRouter()
  const isPc = useMediaQuery('(min-width: 768px)')
  const store = RootStore.Local(() => ({
    currentSiteURL: '',
    forceBlog: new StorageState({ key: 'forceBlog', default: true, value: true }),
    shareNoteList: new PromisePageState({
      function: async ({ page, size }) => {
        if (store.currentSiteURL) {
          const res = await axios.post(store.currentSiteURL + '/api/v1/note/public-list', { page, size })
          return res.data.map(i=>{
            i.account.image = store.currentSiteURL + i.account.image
            i.attachments = i.attachments.map(j=>{
              j.path = store.currentSiteURL + j.path
              return j
            })
            return {
              ...i
            }
          })
        }
        const notes = await api.notes.publicList.mutate({ page, size })
        return notes
      }
    }),
    siteInfo: new PromiseState({
      function: async () => {
        const siteInfo = await api.public.siteInfo.query({ id: query?.id ? Number(query.id) : null })
        return siteInfo
      }
    }),
    followList: new PromisePageState({
      function: async ({ page, size }) => {
        const followList = await api.follows.followerList.query({ userId: null })
        return followList
      }
    }),
    followingList: new PromisePageState({
      function: async ({ page, size }) => {
        const followingList = await api.follows.followList.query({ userId: null })
        return followingList
      }
    }),
    loadAllData() {
      store.siteInfo.call()
      store.shareNoteList.resetAndCall({})
      store.followList.resetAndCall({})
      store.followingList.resetAndCall({})
    }
  }))

  useEffect(() => {
    store.loadAllData()
  }, [])

  useEffect(() => {
    store.loadAllData()
  }, [blinko.updateTicker])

  return <ScrollArea className={'h-full bg-background'} onBottom={() => store.shareNoteList.callNextPage({})}>
    <GradientBackground className="flex flex-col gap-2 bg-background md:h-[300px] h-[120px]">
      <div className="flex flex-col gap-2 h-full">
        <div className=" border-2 border-hover w-full h-full md:h-fit md:max-w-screen-xl glass-effect mx-auto md:mt-[70px] md:rounded-2xl p-4 md:p-6">
          <div className="flex items-start gap-2 md:gap-6">
            <UserAvatar
              account={{
                image: store.siteInfo.value?.image,
              }}
              guestName={store.siteInfo.value?.name}
              size={isPc ? 100 : 80} />

            <div className="flex flex-col gap-2 md:gap-4 flex-1">
              <div className="flex items-center justify-between">
                <div className="flex gap-1 items-center w-full">
                  <div className="md:text-2xl text-md font-bold">{store.siteInfo.value?.name}</div>
                  {
                    store.siteInfo.value?.role == 'superadmin' && <div className="flex items-center gap-1 bg-primary text-primary-foreground rounded-full px-2 py-1 text-xs">
                      <div>{t('admin')}</div>
                      <Icon icon="ri:vip-crown-2-fill" width="15" height="15" className="text-yellow-500" />
                    </div>
                  }
                </div>

                <div className="flex items-center gap-4">
                  {user.isLogin && user.userInfo.value?.id == store.siteInfo.value?.id &&
                    (
                      <Button
                        onPress={() => {
                          RootStore.Get(DialogStore).setData({
                            isOpen: true,
                            title: t('follow'),
                            content: <BlinkoFollowDialog onConfirm={() => {
                              store.loadAllData()
                            }} />,
                          })
                        }}
                        size={isPc ? 'md' : 'md'} color="primary" radius="full" startContent={<Icon icon="fluent:people-add-32-regular" className="w-4 h-4" />}
                        className="px-4 py-2 rounded-full ">
                        {t('follow')}
                      </Button>
                    )
                  }
                </div>
              </div>

              <div className="flex items-center gap-8 text-sm text-desc">
                <div className="flex items-center gap-1">
                  <span className="font-medium">{store.followList.value?.length ?? 0}</span>
                  <span>{t('follower')}</span>
                </div>
                <div className="flex items-center gap-1 cursor-pointer" onClick={() => {
                  RootStore.Get(DialogStore).setData({
                    isOpen: true,
                    title: t('following'),
                    content: <BlinkoFollowingDialog data={store.followingList.value ?? []} onConfirm={() => {
                      store.loadAllData()
                    }} />,
                  })
                }}>
                  <span className="font-medium">{store.followingList.value?.length ?? 0}</span>
                  <span>{t('following')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </GradientBackground>

    <div className="max-w-screen-xl mx-auto p-4 md:p-0">
      <div className='flex items-center justify-between gap-2 my-6 rounded-2xl '>
        <Tabs aria-label="Options" color="primary" onSelectionChange={(e) => {
          if (e == 'site') {
            store.currentSiteURL = ''
            store.shareNoteList.resetAndCall({})
          } else {
            store.currentSiteURL = store.followingList.value?.find(item => item.siteUrl == e)?.siteUrl ?? ''
            store.shareNoteList.resetAndCall({})
          }
        }}>
          <Tab key="site" title={t("home-site")}></Tab>
          {
            store.followingList.value?.map(item => {
              return <Tab key={item.siteUrl} title={item.siteName}></Tab>
            })
          }
        </Tabs>

        <Button variant="faded" color="primary" isIconOnly onPress={() => {
          store.forceBlog.save(!store.forceBlog.value)
        }} className="ml-auto">
          <Icon icon="fluent:arrow-expand-all-16-filled" width="20" height="20" className={`transition-transform duration-300 ${store.forceBlog.value ? "rotate-180" : ""}`} />
        </Button>
      </div>

      <Masonry
        breakpointCols={{
          default: 3,
          500: 1
        }}
        className="blog-masonry-grid"
        columnClassName="blog-masonry-grid_column">
        {
          store.shareNoteList?.value?.map(i => {
            return <BlinkoCard
              className='border-1 border-hover rounded-2xl'
              key={i.id}
              blinkoItem={i}
              isShareMode={
                RootStore.Get(UserStore).userInfo.value?.id != i.accountId || store.currentSiteURL != ''
              }
              account={i.account ?? undefined} forceBlog={store.forceBlog.value} />
          })
        }
      </Masonry>
    </div>
  </ScrollArea>
});

export default Hub