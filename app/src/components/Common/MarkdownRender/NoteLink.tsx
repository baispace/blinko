import { observer } from 'mobx-react-lite';
import { useNavigate, useLocation } from 'react-router-dom';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { Icon } from '@/components/Common/Iconify/icons';
import { preprocessNoteLinks as preprocessNoteLinksShared } from '@shared/lib/noteLink';

/**
 * Renders note link in the form [[id|title]] as a clickable card.
 */
export const NoteLink = observer(({ id, title }: { id: number; title: string }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isShareMode = location.pathname.includes('share');

  const handleClick = () => {
    if (isShareMode) return;
    // 走 /detail?id= —— 和列表卡片点击同一条路径。详情页直接挂全屏编辑器；
    // 同时写上打开信号，避免路由切换时其它入口读到空值。
    RootStore.Get(BlinkoStore).fullscreenEditorNoteId = id;
    navigate(`/detail?id=${id}`);
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 max-w-[16rem] px-2 py-0.5 rounded-md bg-default-100 border border-default-200 cursor-pointer hover:bg-default-200 transition-colors align-middle ${
        isShareMode ? 'pointer-events-none opacity-75' : ''
      }`}
      onMouseDown={(event) => {
        if (!isShareMode) event.preventDefault()
      }}
      onClick={handleClick}
    >
      <Icon icon="solar:file-bold" width={14} height={14} className="text-primary shrink-0" />
      <span className="text-sm text-default-700 truncate">{title}</span>
    </span>
  );
});

/**
 * Preprocess markdown to convert [[id|title]] to link format that can be rendered.
 * This runs before ReactMarkdown processes the content.
 *
 * 格式定义在 @shared/lib/noteLink —— 服务端 upsert 用同一份正则解析双链建立引用关系，
 * 两边必须一致，否则会出现「渲染成链接但没有反向链接」的情况。
 */
export const preprocessNoteLinks = (content: string): string => preprocessNoteLinksShared(content);
