import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';

interface InlineTagProps {
  name: string;
  /** 分享页没有标签检索能力，只上色不可点 */
  isStatic?: boolean;
}

/**
 * 正文里的行内标签（flomo 式）：显示 `#层级路径`，点击进入该标签的检索结果。
 * 标签名里保留 `/`，所以 `#新人指南/更多资料` 会完整显示、可点。
 */
export const InlineTag = observer(({ name, isStatic }: InlineTagProps) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (isStatic) return;
    // 保持当前所在视图（闪念/笔记/待办），仅做标签搜索，不跳离当前页面
    const currentPath = new URLSearchParams(window.location.search).get('path');
    const searchText = encodeURIComponent('#' + name);
    navigate(currentPath ? `/?path=${currentPath}&searchText=${searchText}` : `/?searchText=${searchText}`);
    RootStore.Get(BlinkoStore).forceQuery++;
  };

  return (
    <a
      className={`blinko-hashtag${isStatic ? ' is-static' : ''}`}
      onClick={handleClick}
      role={isStatic ? undefined : 'link'}
      tabIndex={isStatic ? undefined : 0}
    >
      #{name}
    </a>
  );
});
