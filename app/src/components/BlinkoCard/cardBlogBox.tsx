import { Note } from '@shared/lib/types';

interface BlogContentProps {
  blinkoItem: Note & {
    isBlog?: boolean;
    title?: string;
  };
  isExpanded?: boolean;
}

/**
 * 博客卡片的正文区：只渲染标题。
 * 上方 BlogCardTopRow（类型+操作）、下方 BlogCardBottomRow（标签+时间）负责其余信息。
 */
export const CardBlogBox = ({ blinkoItem, isExpanded }: BlogContentProps) => {
  return (
    <div className={`flex items-start gap-2 w-full mb-3`}>
      <div
        className='blog-content flex flex-col pr-2'
        style={{
          width: '100%'
        }}
      >
        <div className={`font-bold mb-1 line-clamp-2 ${isExpanded ? 'text-lg' : 'text-md'}`}>
          {blinkoItem.title?.replace(/#/g, '').replace(/\*/g, '')}
        </div>
      </div>
    </div>
  );
};
