import { BlinkoCard } from "@/components/BlinkoCard";
import { ScrollArea } from "@/components/Common/ScrollArea";
import { api } from "@/lib/trpc";
import { RootStore } from "@/store";
import { PromiseState } from "@/store/standard/PromiseState";
import { observer } from "mobx-react-lite";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useMediaQuery } from "usehooks-ts";
import VanillaTilt from 'vanilla-tilt';

const Page = observer(() => {
  const isPc = useMediaQuery('(min-width: 768px)')
  const router = useRouter()
  const store = RootStore.Local(() => ({
    shareNote: new PromiseState({
      function: async (id) => {
        const notes = await api.notes.publicDetail.mutate({ id })
        return notes
      }
    })
  }))

  useEffect(() => {
    if (!router.query.id) return
    store.shareNote.call(Number(router.query.id))
  }, [router.isReady])

  useEffect(() => {
    if (!isPc) return
    const elements = document.querySelectorAll(".tilt-card");
    VanillaTilt.init(elements as any, {
      max: 2,
      speed: 400,
      glare: true,
      "max-glare": 0.5,
    });
  }, [store.shareNote?.value]);

  return <div className='p-4 h-[100vh] w-full flex justify-center items-center bg-gradient-to-br from-rose-400 via-fuchsia-500 to-indigo-500' >
    {
      store.shareNote?.value &&
      <div className="tilt-card bg-background max-h-[90vh] overflow-y-scroll w-[95%] md:min-w-[30%] md:max-w-[50%] rounded-lg shadow-[1px_0_25px_11px_rgba(98,0,114,0.17)]">
        <BlinkoCard blinkoItem={store.shareNote?.value} isShareMode />
      </div>
    }
  </div>
});

export default Page