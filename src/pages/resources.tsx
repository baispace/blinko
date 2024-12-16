import { helper } from "@/lib/helper";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { Card, Image } from "@nextui-org/react";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { filesize } from "filesize";
import dayjs from "@/lib/dayjs";
import { PhotoProvider, PhotoView } from "react-photo-view";
import { ScrollArea } from "@/components/Common/ScrollArea";
import { Icon } from "@iconify/react";
import { showTipsDialog } from "@/components/Common/TipsDialog";
import { useTranslation } from "react-i18next";
import { PromiseCall } from "@/store/standard/PromiseState";
import { DialogStore } from "@/store/module/Dialog";
import { FilesAttachmentRender } from "@/components/Common/AttachmentRender";
import { DialogStandaloneStore } from "@/store/module/DialogStandalone";

const Page = observer(() => {
  const blinko = RootStore.Get(BlinkoStore)
  const { t } = useTranslation()
  useEffect(() => {
    blinko.resourceList.resetAndCall({})
  }, [])
  return <ScrollArea onBottom={() => blinko.resourceList.callNextPage({})} className="px-2 md:px-6 h-[calc(100vh_-_100px)]">
    <div className="columns-2 md:columns-3 lg:columns-5 gap-4 mt-4 relative">
      <PhotoProvider>
        {
          blinko.resourceList.value?.map(i => {
            const extension = helper.getFileExtension(i.path)
            return <Card shadow="none" className="group bg-background cursor-pointer px-4 pt-4 mb-4 pb-2 flex flex-col gap-2 items-center">
              <FilesAttachmentRender files={[i]} preview columns={1}/>
              <div className="w-full break-words whitespace-normal text-xs font-bold">{decodeURIComponent(i.name)}</div>
              <div className="w-full break-words whitespace-normal text-xs text-desc flex">
                <div>{dayjs(i.createdAt).fromNow()}</div>
                <div className="ml-auto">{filesize(i.size as any, { standard: "jedec" })}</div>
              </div>
              <div
                onClick={e => {
                  showTipsDialog({
                    title: t('confirm-to-delete'),
                    content: t('this-operation-will-be-delete-resource-are-you-sure'),
                    onConfirm: async () => {
                      await PromiseCall(fetch(`/api/file/delete`, {
                        method: 'POST',
                        body: JSON.stringify({ attachment_path: i.path }),
                      }))
                      RootStore.Get(DialogStandaloneStore).close()
                      blinko.resourceList.resetAndCall({})
                    }
                  })
                }}
                className='hover:bg-red-700 transition-all absolute top-[10px] right-[10px] hidden group-hover:block z-10 bg-primary text-primary-foreground opacity-80 rounded-md'>
                <Icon icon="basil:cross-solid" width="20" height="20" />
              </div>
            </Card>
          })
        }
        {
          blinko.resourceList.isEmpty && <div className='absolute top-[40%] select-none text-ignore flex items-center justify-center gap-2 w-full mt-2 md:mt-10'>
            <div><Icon icon="line-md:coffee-half-empty-twotone-loop" width="24" height="24" /></div>
            <div className='text-md text-ignore font-bold max-w-[200px]'>{t('there-are-no-resources-yet-go-upload-them-now')}</div>
          </div>
        }
      </PhotoProvider>
    </div>
  </ScrollArea >
});

export default Page