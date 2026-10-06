import { ScrollArea } from "@/components/Common/ScrollArea";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from 'react-router-dom';
import { BlinkoCard } from "@/components/BlinkoCard";
import { LoadingAndEmpty } from "@/components/Common/LoadingAndEmpty";
import { PageWidthButton } from "@/components/Common/PageWidthButton";
import { PageWidthStore, PAGE_WIDTH_PAD_CLASS } from "@/store/pageWidthStore";
import { TableOfContents } from "@/components/Common/TableOfContents";
import { Icon } from "@/components/Common/Iconify/icons";
import { useTranslation } from "react-i18next";

const Detail = observer(() => {
  const location = useLocation();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const blinko = RootStore.Get(BlinkoStore);
  const pageWidth = RootStore.Get(PageWidthStore);
  const [isTocOpen, setIsTocOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('id')) {
      blinko.noteDetail.call({ id: Number(searchParams.get('id')) });
    }
  }, [location.pathname, searchParams.get('id'), blinko.updateTicker, blinko.forceQuery]);

  // Close the outline flyout whenever we navigate to another note.
  useEffect(() => {
    setIsTocOpen(false);
  }, [searchParams.get('id')]);

  const note = blinko.noteDetail.value;

  return (
    <ScrollArea fixMobileTopBar>
      <div className={`mx-auto py-4 relative ${PAGE_WIDTH_PAD_CLASS[pageWidth.mode]}`} style={{ maxWidth: pageWidth.maxWidth }}>
        {note && (
          <div className="flex justify-end mb-1">
            <PageWidthButton />
          </div>
        )}
        <LoadingAndEmpty
          isLoading={blinko.noteDetail.loading.value}
          isEmpty={!note}
        />

        {note && (
          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              <BlinkoCard
                blinkoItem={note}
                defaultExpanded={false}
                glassEffect={false}
                isDetailPage
              />
            </div>
          </div>
        )}

        {/* Outline trigger sits at the top-left of the body and opens a
            flyout on demand — the note keeps the full page width instead of
            permanently losing 192px to a right-hand rail. */}
        {note?.content && (
          <button
            onClick={() => setIsTocOpen((v) => !v)}
            className={`absolute top-3 -left-1 z-20 flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              isTocOpen ? 'bg-primary/10 text-primary' : 'text-desc hover:bg-default-100 hover:text-default-600'
            }`}
            title={t('table-of-contents')}
            aria-label={t('table-of-contents')}
          >
            <Icon icon="mdi:format-list-bulleted" width={16} height={16} />
          </button>
        )}

        {note?.content && isTocOpen && (
          <TableOfContents
            content={note.content}
            floating
            onClose={() => setIsTocOpen(false)}
            className="top-10 left-0"
          />
        )}
      </div>
    </ScrollArea>
  );
});

export default Detail;