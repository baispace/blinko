import React, { useEffect, useRef, useState } from 'react';
import { Swiper, SwiperSlide, } from "swiper/react";
import "swiper/css";
import "swiper/css/effect-cards";
import { EffectCards, Virtual } from 'swiper/modules';
import 'swiper/css/virtual';
import '../styles/swiper-cards.css'
import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { MarkdownRender } from '@/components/Common/MarkdownRender';
import dayjs from '@/lib/dayjs';
import { Note, NoteType } from '@/server/types';
import { Icon } from '@iconify/react';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@nextui-org/react';
import { LightningIcon, NotesIcon } from '@/components/Common/Icons';
import { PromiseCall } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';
import { showTipsDialog } from '@/components/Common/TipsDialog';
import { DialogStore } from '@/store/module/Dialog';
import confetti from 'canvas-confetti'
import { useMediaQuery } from 'usehooks-ts';
import { FilesAttachmentRender } from '@/components/Common/AttachmentRender';
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';
const App = observer(() => {
  const blinko = RootStore.Get(BlinkoStore)
  const swiperRef = useRef(null);
  const { t } = useTranslation()
  const isPc = useMediaQuery('(min-width: 768px)')
  const store = RootStore.Local(() => ({
    currentIndex: 0,
    currentNote: null as Note | null,
    handleSlideChange: async (_swiper) => {
      store.currentIndex = _swiper.activeIndex
    },
    get isBlinko() {
      return store.currentNote?.type == NoteType.BLINKO
    }
  }))

  useEffect(() => {
    store.currentNote = blinko.dailyReviewNoteList.value?.[store.currentIndex] ?? null
    if (blinko.dailyReviewNoteList.value?.length == 0) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6, x: isPc ? 0.6 : 0.5 }
      });
    }
  }, [blinko.dailyReviewNoteList.value])

  return (
    <div className="App h-full overflow-hidden">

      {
        blinko.dailyReviewNoteList.value?.length != 0 && <>
          <Swiper
            onSwiper={(swiper) => {
              //@ts-ignore
              swiperRef.current = swiper;
            }}
            onSlideChange={(swiper) => store.handleSlideChange(swiper)}
            effect={"cards"}
            grabCursor={true}
            modules={[EffectCards, Virtual]}
            className="mt-10 md:mt-4 w-[300px] h-[380px] md:w-[350px] md:h-[520px]"
            allowSlideNext={true}
            allowSlidePrev={true}
            touchRatio={1}
            resistance={true}
            resistanceRatio={0.5}
            centeredSlides={true}
            virtual={{
              enabled: true,
              slides: blinko.dailyReviewNoteList.value ?? [],
              cache: true,
              addSlidesBefore: 1,
              addSlidesAfter: 1,
            }}
          >
            {
              blinko.dailyReviewNoteList.value?.map((i, index) => (
                <SwiperSlide key={i.id} virtualIndex={index} data-id={i.id} className='bg-background shadow-lg p-4 w-full overflow-hidden h-full'>
                  <div className='bg-background p-0 w-full overflow-y-scroll h-full'>
                    <div className='flex items-center gap-2 mb-2'>
                      <div className='text-xs text-desc'>{dayjs(i.createdAt).fromNow()}</div>
                      {
                        store.isBlinko ?
                          <div className='flex items-center justify-start ml-auto'>
                            <Icon className='text-yellow-500' icon="basil:lightning-solid" width="12" height="12" />
                            <div className='text-desc text-xs font-bold ml-1'>{t('blinko')}</div>
                          </div> :
                          <div className='flex items-center justify-start  ml-auto'>
                            <Icon className='text-blue-500' icon="solar:notes-minimalistic-bold-duotone" width="12" height="12" />
                            <div className='text-desc text-xs font-bold ml-1'>{t('note')}</div>
                          </div>
                      }
                    </div>
                    <MarkdownRender content={i.content} onChange={(newContent) => {
                      i.content = newContent
                      blinko.upsertNote.call({ id: i.id, content: newContent, refresh: false })
                    }} />
                    <div className={i.attachments?.length != 0 ? 'my-2' : ''}>
                      <FilesAttachmentRender columns={2} files={i.attachments ?? []} preview />
                    </div>
                  </div>
                </SwiperSlide>
              ))
            }
          </Swiper>

          <div className="mt-8 flex items-center justify-center px-6 gap-4">
            <Tooltip content={t('reviewed')}>
              <Button onPress={async e => {
                if (!store.currentNote) return
                PromiseCall(api.notes.reviewNote.mutate({ id: store.currentNote!.id! }))
              }} isIconOnly color='primary' startContent={<Icon icon="ci:check-all" width="24" height="24" />} />
            </Tooltip>

            <Tooltip content={store.isBlinko ? t('convert-to-note') : t('convert-to-blinko')}>
              <Button isIconOnly onPress={async e => {
                if (!store.currentNote) return
                await blinko.upsertNote.call({ id: store.currentNote.id, type: store.isBlinko ? NoteType.NOTE : NoteType.BLINKO })
                await api.notes.reviewNote.mutate({ id: store.currentNote!.id! })
                await blinko.dailyReviewNoteList.call()
              }}
                color='primary'
                startContent={store.isBlinko ? <NotesIcon /> : <LightningIcon />}>
              </Button>
            </Tooltip>

            <Tooltip content={t('archive')} >
              <Button onPress={async e => {
                if (!store.currentNote) return
                await blinko.upsertNote.call({ id: store.currentNote.id, isArchived: true })
                await blinko.dailyReviewNoteList.call()
              }} isIconOnly color='primary' startContent={<Icon icon="eva:archive-outline" width="20" height="20" />}></Button>
            </Tooltip>

            <Button
              onPress={async e => {
                if (!store.currentNote) return
                showTipsDialog({
                  title: t('confirm-to-delete'),
                  content: t('this-operation-removes-the-associated-label-and-cannot-be-restored-please-confirm'),
                  onConfirm: async () => {
                    await api.notes.deleteMany.mutate({ ids: [store.currentNote!.id!] })
                    await blinko.dailyReviewNoteList.call()
                    RootStore.Get(DialogStandaloneStore).close()
                  }
                })
              }} isIconOnly color='danger' startContent={<Icon icon="mingcute:delete-2-line" width="20" height="20" />}></Button>
          </div>
        </>
      }

      {blinko.dailyReviewNoteList.value?.length == 0 && <div className='select-none text-ignore flex items-center justify-center gap-2 w-full mt-2 md:mt-10'>
        <Icon icon="line-md:coffee-half-empty-twotone-loop" width="24" height="24" />
        <div className='text-md text-ignore font-bold'>{t('congratulations-youve-reviewed-everything-today')}</div>
      </div>}
    </div >

  );
})

export default App;
