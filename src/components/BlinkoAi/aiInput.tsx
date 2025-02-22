import { observer } from "mobx-react-lite";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button, Textarea } from "@nextui-org/react";
import { Icon } from "@iconify/react";
import { IconButton } from "../Common/Editor/Toolbar/IconButton";
import { motion } from "framer-motion";
import { useMediaQuery } from "usehooks-ts";

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

export const AiInput = observer(({ mode = 'inline', onSubmit, className }: AiInputProps) => {
  const [value, setValue] = useState('');
  const isPc = useMediaQuery('(min-width: 768px)');
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    onSubmit?.(value);
    setValue('');
  };

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
            tooltip={'对话历史(1)'}
            icon="hugeicons:book-edit"
            size={20}
            containerSize={30}
          />

          <div className="text-ignore opacity-50 w-[2px] h-[20px] bg-desc rounded-full"></div>

          <div className="ml-2 bg-primary rounded-full p-1 group cursor-pointer" onClick={handleSubmit}>
            <Icon icon="uil:arrow-up" width="24" height="24" className="text-primary-foreground group-hover:translate-y-[-1px] transition-all" />
          </div>
        </div>
      </div>
    </motion.div>
  );
});