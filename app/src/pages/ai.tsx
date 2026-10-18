import { Button } from '@heroui/react';
import { useRef, useState, useEffect } from 'react';
import { AiSkills } from '@/components/BlinkoAi/AiSkills';
import { AiTaskPanel } from '@/components/BlinkoAi/AiTaskPanel';
import { BlinkoStore } from '@/store/blinkoStore';
import { AiInput } from '@/components/BlinkoAi/aiInput';
import { Icon } from '@/components/Common/Iconify/icons';
import { useMediaQuery } from 'usehooks-ts';
import { motion, AnimatePresence } from 'framer-motion';
import { AiStore } from '@/store/aiStore';
import { RootStore } from '@/store';
import { cn } from '@/lib/utils';
import { observer } from 'mobx-react-lite';
import { BlinkoChatBox } from '@/components/BlinkoAi/aiChatBox';
import { Watermark } from '@hirohe/react-watermark';
import { useTheme } from 'next-themes';
import { UserStore } from '@/store/user';
import { useTranslation } from 'react-i18next';
import { BaseStore } from '@/store/baseStore';
import i18n from '@/lib/i18n';
import { useSwiper } from '@/lib/hooks';
const AIPage = observer(() => {
  const [prompt, setPrompt] = useState('');
  const [tasksOpen, setTasksOpen] = useState(false);
  const blinko = RootStore.Get(BlinkoStore);
  const isPc = useMediaQuery('(min-width: 768px)');
  const userStore = RootStore.Get(UserStore)
  const { t } = useTranslation()
  const aiStore = RootStore.Get(AiStore)
  const baseStore = RootStore.Get(BaseStore)
  const InputBoxRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const [inputHeight, setInputHeight] = useState(0);
  const isVisible = useSwiper();
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

  const buttons = [
    {
      label: t('writing'),
      icon: 'hugeicons:quill-write-02',
      color: '#0057FF',
      prompt: t('ai-prompt-writing')
    },
    {
      label: t('coding'),
      icon: 'solar:code-bold',
      color: '#FF9500',
      prompt: t('ai-prompt-coding')
    },
    {
      label: t('translation'),
      icon: 'hugeicons:message-translate',
      color: '#2FBC52',
      prompt: t('ai-prompt-translation', { lang: i18n.language })
    }
  ];

  const suggestionActions = [
    {
      prompt: t('ai-prompt-writing-content')
    },
    {
      prompt: t('ai-prompt-translation-content')
    },
    {
      prompt: t('ai-prompt-delete-content')
    },
    {
      prompt: t('ai-prompt-coding-content')
    }
  ]

  return (
    <div
      style={{
        height: isPc ? '100%' : `calc(100% - ${!isVisible ? '0px' : '60px'})`
      }}
      className={cn(
        'flex flex-col items-center w-full gap-4 relative',
        // 移动端顶栏是 fixed（h-14 / 56px），必须自己让出这段高度，否则欢迎语和聊天区
        // 会被顶栏盖住并被 backdrop-blur 糊掉；桌面顶栏在文档流内，只需要 6vh 呼吸感。
        aiStore.isChatting ? 'pt-14 md:pt-0' : 'pt-14 md:pt-[6vh]',
        'md:h-[calc(100vh_-_80px)]'
      )}>
      <div className="absolute right-3 top-2 z-10 md:right-6"><Button size="sm" variant="light" onPress={() => setTasksOpen(true)} startContent={<Icon icon="lucide:clock" width={16} />}>定时任务</Button></div>
      <AiTaskPanel open={tasksOpen} onClose={() => setTasksOpen(false)} modelReady={!!blinko.config.value?.mainModelId} />
      {!aiStore.isChatting ? (
        <div className="flex justify-center w-full px-4">
          <motion.div
            initial={{ width: 0, scaleX: 0 }}
            animate={{ width: "auto", scaleX: 1 }}
            transition={{
              duration: 0.2,
              ease: [0.16, 0.77, 0.47, 0.97],
              scaleX: {
                type: "spring",
                stiffness: 150,
                damping: 15,
                mass: 0.5
              }
            }}
            className="text-2xl md:text-3xl font-bold overflow-hidden text-center whitespace-normal md:whitespace-nowrap origin-left px-2"
          >
            {t('welcome-to-blinko', { name: userStore.userInfo?.value?.nickName.toUpperCase() ?? userStore.userInfo?.value?.name.toUpperCase() })}!
          </motion.div>
        </div>
      ) : (
        <div className="w-full " style={{ height: `max(100px, calc(100% - ${inputHeight}px))` }}>
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
          // 窄屏非聊天态：输入框贴到容器底部（上方 60px 是 MobileNavBar），
          // 中间留给技能卡；桌面沿用紧跟内容的流式排布。
          aiStore.isChatting ? "absolute bottom-2" : (isPc ? "mt-4" : "mt-auto pt-4")
        )}
      >


        <AiInput className={aiStore.isChatting ? 'mt-0' : 'mt-2'} />



      </motion.div>
    </div>
  );
});

export default AIPage;
