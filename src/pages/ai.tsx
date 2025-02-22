import { Button, Card } from '@nextui-org/react';
import { useRef, useState, useEffect } from 'react';
import { AiInput } from '@/components/BlinkoAi/aiInput';
import { Icon } from '@iconify/react';
import { useMediaQuery } from 'usehooks-ts';
import { motion } from 'framer-motion';
import { AiStore } from '@/store/aiStore';
import { RootStore } from '@/store';
import { cn } from '@/lib/utils';
import { observer } from 'mobx-react-lite';
import { BlinkoChatBox } from '@/components/BlinkoAi/aiChatBox';
import { Watermark } from '@hirohe/react-watermark';
import { useTheme } from 'next-themes';
const AIPage = observer(() => {
  const [prompt, setPrompt] = useState('');
  const isPc = useMediaQuery('(min-width: 768px)');
  const aiStore = RootStore.Get(AiStore)
  const InputBoxRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const [inputHeight, setInputHeight] = useState(0);

  useEffect(() => {
    if (!InputBoxRef.current) return;

    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        setInputHeight(entry.contentRect.height);
      }
    });

    observer.observe(InputBoxRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleSubmit = async () => {
    console.log('提交prompt:', prompt);
  };

  const buttons = [
    {
      label: '写作',
      icon: 'hugeicons:quill-write-02',
      color: '#0057FF',
    },
    {
      label: '学习',
      icon: 'hugeicons:book-02',
      color: '#FF9500'
    },
    {
      label: '创意',
      icon: 'hugeicons:falling-star',
      color: '#FF3B30'
    },
    {
      label: '翻译',
      icon: 'hugeicons:message-translate',
      color: '#2FBC52'
    }
  ];

  return (
    <Watermark
      text="内容由人工智能生成"
      multiline
      rotate={-30}
      fontFamily="sans-serif"
      gutter={10}
      textSize={24}
      textColor={theme.theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}
    >
  
      <div className={`flex flex-col items-center ${aiStore.isChatting ? 'pt-0' : 'pt-[20%]'} w-full gap-4 relative h-[calc(100vh_-_140px)] md:h-[calc(100vh_-_80px)]`}>
        {!aiStore.isChatting ? (
          <div className="flex justify-center w-full">
            <motion.div
              initial={{ width: 0, scaleX: 0 }}
              animate={{ width: "auto", scaleX: 1 }}
              transition={{
                duration: 1.2,
                ease: [0.16, 0.77, 0.47, 0.97],
                scaleX: {
                  type: "spring",
                  stiffness: 150,
                  damping: 15,
                  mass: 0.5
                }
              }}
              className="text-3xl font-bold overflow-hidden whitespace-nowrap origin-left"
            >
              欢迎你，Blinko!
            </motion.div>
          </div>
        ) : (
          <div className="w-full " style={{ height: `calc(100% - ${inputHeight}px)` }}>
            <BlinkoChatBox />
          </div>
        )}

        <motion.div
          ref={InputBoxRef}
          layout
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className={cn(
            "flex flex-col items-center",
            isPc ? "w-[90%]" : "w-[95%]",
            aiStore.isChatting ? "absolute bottom-2" : "mt-4"
          )}
        >
          <div className={`w-full md:w-[85%] flex items-center  gap-2 mt-4 overflow-x-scroll scrollbar-hide my-3`}>
            <motion.div
              className="flex gap-2 px-4 w-full"
              animate={{
                x: aiStore.isChatting ? 0 : 'calc(50% - 20vw + 2rem)'
              }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              {buttons.map((button, index) => (
                <Button
                  key={index}
                  variant='flat'
                  startContent={<Icon icon={button.icon} className={`text-[${button.color}]`} width="20" height="20" />}
                >
                  {button.label}
                </Button>
              ))}
              <Button variant='light' startContent={<Icon icon="hugeicons:book-edit" width="20" height="20" />}>
                更多
              </Button>
            </motion.div>
          </div>


          <AiInput mode={aiStore.isChatting ? 'inline' : 'card'} className={aiStore.isChatting ? 'mt-0' : 'mt-2'} onSubmit={() => {
            console.log('提交prompt:', prompt);
            aiStore.isChatting = !aiStore.isChatting
          }} />

        </motion.div>
      </div>
    </Watermark>
  );
});

export default AIPage;
