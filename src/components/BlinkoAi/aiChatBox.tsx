import { Icon } from "@iconify/react"
import { observer } from "mobx-react-lite"
import { Image, Textarea } from "@nextui-org/react";
import { ScrollArea, ScrollAreaHandles } from "../Common/ScrollArea";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

import { MarkdownRender } from "../Common/MarkdownRender";

// 用户消息组件
const UserMessage = ({ content, time }: { content: string; time: string }) => (
  <motion.div
    className="flex flex-col w-full gap-2"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    <div className="text-center text-desc mt-2">{time}</div>
    <div className="ml-auto max-w-[80%] mb-2 bg-primary text-primary-foreground p-2 rounded-xl">
      {content}
    </div>
  </motion.div>
);

const AiMessage = ({ content }: { content: string }) => (
  <motion.div
    className="flex flex-col gap-1 relative group"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    <div className="max-w-[80%] bg-sencondbackground px-2 py-1 rounded-xl">
      <MarkdownRender content={content} />
    </div>
    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 mb-4">
      <div className="flex gap-1 bg-background/50 backdrop-blur-sm rounded-full p-1">
        <button className="p-1 rounded-full hover:bg-hover">
          <Icon icon="mdi:content-copy" width="16" height="16" />
        </button>
        <button className="p-1 rounded-full hover:bg-hover">
          <Icon icon="mdi:thumb-up" width="16" height="16" />
        </button>
        <button className="p-1 rounded-full hover:bg-hover">
          <Icon icon="mdi:thumb-down" width="16" height="16" />
        </button>
      </div>
    </div>
  </motion.div>
);

export const BlinkoChatBox = observer(() => {
  return (
    <ScrollArea
      onBottom={() => { }}
      className="h-full"
    >
      <div className="flex flex-col p-0 md:p-2 relative h-full w-[95%] md:w-[78%] mx-auto">
        <AnimatePresence>
          <UserMessage content="你好，这是一个测试消息" time="刚刚" />
          
          {new Array(50).fill(0).map((item, index) => (
            <AiMessage key={index} content="你好！我是AI助手，有什么可以帮你的吗？" />
          ))}
        </AnimatePresence>
      </div>
    </ScrollArea>
  )
})