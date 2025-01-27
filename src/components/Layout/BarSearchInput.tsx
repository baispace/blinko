import React, { useRef, useState } from "react";
import { Button, Input, Tooltip } from "@nextui-org/react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { _ } from "@/lib/lodash";
import { useRouter } from "next/router";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { observer } from "mobx-react-lite";

interface BarSearchInputProps {
  isPc: boolean;
}

export const BarSearchInput = observer(({ isPc }: BarSearchInputProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const blinkoStore = RootStore.Get(BlinkoStore);
  const [showSearchInput, setShowSearchInput] = useState(false);

  const throttleSearchRef = useRef(_.throttle(() => {
    if (router.pathname == '/resources') {
      return blinkoStore.resourceList.resetAndCall({ searchText: searchInputRef.current?.value })
    }
    blinkoStore.noteList.resetAndCall({})
  }, 1000, { trailing: true, leading: false }));

  const handleClose = () => {
    setShowSearchInput(false);
    blinkoStore.searchText = '';
    throttleSearchRef.current();
  }

  return (
    <>
      {!isPc && !showSearchInput ? (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2 }}
        >
          <Button
            isIconOnly
            className="ml-auto"
            size="sm"
            variant="light"
            onPress={() => setShowSearchInput(true)}
          >
            <Icon
              className="text-default-600"
              icon="lets-icons:search"
              width="24"
              height="24"
            />
          </Button>
        </motion.div>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="w-full ml-4"
          >
            <Input
              ref={searchInputRef}
              size={isPc ? 'md' : 'sm'}
              variant="flat"
              autoFocus
              aria-label="search"
              className={`${blinkoStore.noteListFilterConfig.isUseAiQuery ? 'input-highlight' : ''} `}
              classNames={{
                base: "w-full",
                inputWrapper: `bg-default-400/20 data-[hover=true]:bg-default-500/30 group-data-[focus=true]:bg-default-500/20 ${blinkoStore.noteListFilterConfig.isUseAiQuery ? 'border-2 border-primary' : ''
                  }`,
                input: "placeholder:text-default-600 group-data-[has-value=true]:text-foreground",
              }}
              labelPlacement="outside"
              placeholder={router.pathname == '/settings' ? t('search-settings') : t('search')}
              value={blinkoStore.searchText}
              onChange={e => {
                blinkoStore.searchText = e.target.value;
                throttleSearchRef.current()
              }}
              startContent={
                <>
                  {
                    router.pathname != '/settings' && (
                      <Icon
                        className={`text-default-600 [&>g]:stroke-[2px] ${!isPc ? 'cursor-pointer' : ''}`}
                        icon={!isPc && showSearchInput ? "material-symbols:close" : "lets-icons:search"}
                        width="24"
                        height="24"
                        onClick={() => !isPc && handleClose()}
                      />
                    )
                  }
                </>
              }
              endContent={router.pathname != '/resources' && router.pathname != '/settings' && (
                <Tooltip content={t('ai-enhanced-search')}>
                  <Icon
                    className="text-default-600 [&>g]:stroke-[2px] cursor-pointer hover:text-primary transition-colors"
                    icon="mingcute:ai-line"
                    width="24"
                    height="24"
                    onClick={() => {
                      searchInputRef.current?.focus()
                      blinkoStore.noteListFilterConfig.isUseAiQuery = !blinkoStore.noteListFilterConfig.isUseAiQuery
                      if (blinkoStore.searchText != '') {
                        throttleSearchRef.current()
                      }
                    }}
                  />
                </Tooltip>
              )}
            />
          </motion.div>
        </AnimatePresence>
      )}
    </>
  );
});