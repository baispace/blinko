import { ScrollArea } from "@/components/Common/ScrollArea";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { _ } from "@/lib/lodash";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useLocation, useSearchParams } from 'react-router-dom';
import { BlinkoCard } from "@/components/BlinkoCard";
import { LoadingAndEmpty } from "@/components/Common/LoadingAndEmpty";
import { PageWidthButton } from "@/components/Common/PageWidthButton";
import { PageWidthStore, PAGE_WIDTH_PAD_CLASS } from "@/store/pageWidthStore";

const Detail = observer(() => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const blinko = RootStore.Get(BlinkoStore);
  const pageWidth = RootStore.Get(PageWidthStore);

  useEffect(() => {
    if (searchParams.get('id')) {
      blinko.noteDetail.call({ id: Number(searchParams.get('id')) });
    }
  }, [location.pathname, searchParams.get('id'), blinko.updateTicker, blinko.forceQuery]);

  return (
    <ScrollArea fixMobileTopBar>
      <div className={`mx-auto py-4 ${PAGE_WIDTH_PAD_CLASS[pageWidth.mode]}`} style={{ maxWidth: pageWidth.maxWidth }}>
        {blinko.noteDetail.value && (
          <div className="flex justify-end mb-1">
            <PageWidthButton />
          </div>
        )}
        <LoadingAndEmpty
          isLoading={blinko.noteDetail.loading.value}
          isEmpty={!blinko.noteDetail.value}
        />

        {blinko.noteDetail.value && (
          <BlinkoCard
            blinkoItem={blinko.noteDetail.value}
            defaultExpanded={false}
            glassEffect={false}
          />
        )}
      </div>
    </ScrollArea>
  );
});

export default Detail;