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
import { TableOfContents } from "@/components/Common/TableOfContents";
import { useMediaQuery } from "usehooks-ts";

const Detail = observer(() => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const blinko = RootStore.Get(BlinkoStore);
  const pageWidth = RootStore.Get(PageWidthStore);
  const isPc = useMediaQuery('(min-width: 1024px)');

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
          <div className="flex gap-4">
            <div className="flex-1">
              <BlinkoCard
                blinkoItem={blinko.noteDetail.value}
                defaultExpanded={false}
                glassEffect={false}
              />
            </div>
            {isPc && blinko.noteDetail.value.content && (
              <div className="w-48 flex-shrink-0 hidden lg:block">
                <TableOfContents content={blinko.noteDetail.value.content} />
              </div>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
});

export default Detail;