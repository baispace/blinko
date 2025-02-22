import { observer } from "mobx-react-lite";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button, Textarea } from "@nextui-org/react";
import { Icon } from "@iconify/react";
import { IconButton } from "../Common/Editor/Toolbar/IconButton";
import { motion } from "framer-motion";
import { useMediaQuery } from "usehooks-ts";
import { api } from "@/lib/trpc";
import { AiStore } from "@/store/aiStore";
import { RootStore } from "@/store/root";
import { DialogStore } from "@/store/module/Dialog";
import { AiConversactionList } from "./aiConversactionList";

interface AiInputProps {
  mode?: 'card' | 'inline';
  onSubmit?: (value: string) => void;
  className?: string;
}

const cardIcons = [
  {
    tooltip: '新对话',
    icon: 'hugeicons:bubble-chat-add',
    size: 20,
    containerSize: 30
  },
  {
    tooltip: '新对话',
    icon: 'hugeicons:at',
    size: 20,
    containerSize: 30
  },
  {
    tooltip: '搜索',
    icon: 'hugeicons:search-list-01',
    size: 20,
    containerSize: 30
  },
  {
    tooltip: '搜索',
    icon: 'hugeicons:delete-01',
    size: 20,
    containerSize: 30
  }
];

export const AiInput = observer(({ onSubmit, className }: AiInputProps) => {
  const isPc = useMediaQuery('(min-width: 768px)');
  const aiStore = RootStore.Get(AiStore);
  let mode = aiStore.isChatting ? 'inline' : 'card'
  return (
    <motion.div
      className={`w-full p-2 rounded-3xl bg-background ${className}`}
      animate={{
        width: mode === 'inline' ? (isPc ? '85%' : '100%') : '60%'
      }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      <div className="relative flex items-end gap-2">
        <Textarea
          className={`mt-4 mb-10`}
          data-focus-visible="false"
          value={aiStore.input}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              aiStore.onInputSubmit()
            }
          }}
          onChange={(e) => aiStore.input = e.target.value}
          classNames={{
            input: `!bg-transparent border-none  ${mode == 'inline' ? 'min-h-[20px]' : 'min-h-[120px]'}`,
            label: "!bg-transparent border-none",
            inputWrapper: "!bg-transparent border-none",
          }}
          rows={mode == 'inline' ? 1 : 20}
          maxRows={40}
          placeholder="搜索Blinko内容或者帮你创作..."
        />
        <div className="absolute bottom-3 right-0 w-full px-2 gap-1 flex justify-center items-center transition-all">
          <>
            {cardIcons.map((icon, index) => (
              <IconButton
                tooltip={icon.tooltip}
                icon={icon.icon}
                size={icon.size}
                containerSize={icon.containerSize}
              />
            ))}
          </>

          <div className="ml-auto"></div>

          <IconButton
            onClick={async () => {
              RootStore.Get(DialogStore).setData({
                isOpen: true,
                title: '对话历史',
                content: <AiConversactionList />
              })
            }}
            tooltip={'对话历史'}
            icon="hugeicons:book-edit"
            size={20}
            containerSize={30}
          />

          <div className="text-ignore opacity-50 w-[2px] h-[20px] bg-desc rounded-full"></div>

          <div className={`ml-2 bg-primary rounded-full p-1 group  ${aiStore.input.trim() == '' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`} onClick={() => {
            if (aiStore.isAnswering) {
              return aiStore.abortAiChat()
            }
            if (aiStore.input.trim() == '') {
              return
            } else {
              aiStore.onInputSubmit()
            }
          }}>
            {
              aiStore.isAnswering ?
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.5,
                    ease: "linear"
                  }}
                >
                  <Icon
                    icon="uil:spinner-alt"
                    width="24"
                    height="24"
                    className="text-primary-foreground group-hover:translate-y-[-1px] transition-all"
                  />
                </motion.div>
                :
                <Icon icon="uil:arrow-up" width="24" height="24" className="text-primary-foreground group-hover:translate-y-[-1px] transition-all" />
            }
          </div>
        </div>
      </div>
    </motion.div>
  );
});