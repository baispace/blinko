import { observer } from 'mobx-react-lite';
import { useNavigate, useLocation } from 'react-router-dom';
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
    // 走 /detail?id= —— 和 BlinkoCard 的 handleClick 一致。detail 页自己会
    // 按 id 拉 noteDetail 并打开 FullscreenEditor。
    //
    // 原先是 navigate(`/?id=${id}`) + `RootStore.Get(BlinkoStore).curSelectedNoteId = id`：
    //   - BlinkoStore 压根没 import，点一下直接 ReferenceError；
    //   - BlinkoStore 上也没有 curSelectedNoteId 这个字段，写了没人读；
    //   - pages/index.tsx 从不读 ?id=，所以点了只是回到闪念列表，等于没跳。
    navigate(`/detail?id=${id}`);
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-default-100 border border-default-200 cursor-pointer hover:bg-default-200 transition-colors ${
        isShareMode ? 'pointer-events-none opacity-75' : ''
      }`}
      onClick={handleClick}
    >
      <Icon icon="solar:file-bold" width={14} height={14} className="text-primary" />
      <span className="text-sm text-default-700 line-clamp-1">{title}</span>
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
