import { Image } from '@nextui-org/react';
import { Note } from '@/server/types';
import { helper } from '@/lib/helper';
import { RootStore } from '@/store/root';
import router from 'next/router';
import { BlinkoStore } from '@/store/blinkoStore';
import { useEffect, useRef, useState, useMemo } from 'react';

interface BlogContentProps {
  blinkoItem: Note & {
    isBlog?: boolean;
    blogCover?: string;
    title?: string;
  };
  isExpanded?: boolean;
}

const gradientPairs: [string, string][] = [
  ['#FF6B6B', '#4ECDC4'],
  ['#764BA2', '#667EEA'],
  ['#2E3192', '#1BFFFF'],
  ['#6B73FF', '#000DFF'],
  ['#FC466B', '#3F5EFB'],
  ['#11998E', '#38EF7D'],
  ['#536976', '#292E49'],
  ['#4776E6', '#8E54E9'],
  ['#1A2980', '#26D0CE'],
  ['#4B134F', '#C94B4B'],
];

export const CardBlogBox = ({ blinkoItem, isExpanded }: BlogContentProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(112);

  const gradientStyle = useMemo(() => {
    const hash = blinkoItem.title?.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0) ?? 0;
    const index = Math.abs(hash) % gradientPairs.length;
    const angle = Math.abs((hash * 137) % 360);
    const [color1, color2] = gradientPairs[index] ?? ['#000', '#000'];
    return {
      background: `linear-gradient(${angle}deg, ${color1} 0%, ${color2} 100%)`,
      opacity: 0.8
    };
  }, [blinkoItem.title]);

  useEffect(() => {
    const updateHeight = () => {
      if (contentRef.current) {
        const height = contentRef.current.offsetHeight;
        setContentHeight(Math.max(100, height));
      }
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [blinkoItem.content, blinkoItem.title, blinkoItem.tags]);

  return (
    <div className={`flex items-start gap-2 mt-4 w-full mb-4`}>
      {blinkoItem.blogCover ? (
        <Image
          src={blinkoItem.blogCover}
          alt='blog cover'
          isZoomed
          style={{
            width: `${contentHeight}px`,
            height: `${contentHeight}px`,
          }}
          className="object-cover rounded-lg shrink-0"
        />
      ) : blinkoItem.title && (
        <div
          className="shrink-0 flex items-center justify-center rounded-xl p-2 overflow-hidden"
          style={{
            width: `${contentHeight}px`,
            height: `${contentHeight}px`,
            ...gradientStyle
          }}
        >
          <div className="text-md font-bold line-clamp-3 text-center text-white">
            {blinkoItem.title.replace(/#/g, '').replace(/\*/g, '')}
          </div>
        </div>
      )}
      <div
        ref={contentRef}
        className='blog-content flex flex-col pr-2'
        style={{
          width: 'calc(100% - 112px - 0.5rem)'
        }}
      >
        {blinkoItem.blogCover && (
          <div className={`font-bold mb-1 line-clamp-2 ${isExpanded ? 'text-md' : 'text-md'}`}>
            {blinkoItem.title?.replace(/#/g, '').replace(/\*/g, '')}
          </div>
        )}
        <div className={`text-desc flex-1 ${isExpanded ? 'text-sm' : 'text-sm'} ${blinkoItem.blogCover ?
          `${(!!blinkoItem?.tags?.length && blinkoItem?.tags?.length > 0) ? 'line-clamp-2' : 'line-clamp-3'}` :
          'line-clamp-4'}`}
        >
          {blinkoItem.content?.replace(blinkoItem.title ?? '', '').replace(/#/g, '').replace(/\*/g, '')}
        </div>
        {
          !!blinkoItem?.tags?.length && blinkoItem?.tags?.length > 0 && (
            <div className='flex flex-nowrap gap-1 overflow-x-scroll mt-1 hide-scrollbar'>
              {(() => {
                const tagTree = helper.buildHashTagTreeFromDb(blinkoItem.tags.map(t => t.tag));
                const tagPaths = tagTree.flatMap(node => helper.generateTagPaths(node));
                const uniquePaths = tagPaths.filter(path => {
                  return !tagPaths.some(otherPath =>
                    otherPath !== path && otherPath.startsWith(path + '/')
                  );
                });
                return uniquePaths.map((path) => (
                  <div key={path} className='text-desc text-xs blinko-tag whitespace-nowrap font-bold hover:opacity-80 transition-all cursor-pointer' onClick={(e) => {
                    e.stopPropagation()
                    router.replace(`/?path=all&searchText=${encodeURIComponent("#" + path)}`)
                    RootStore.Get(BlinkoStore).forceQuery++
                  }}>
                    #{path}
                  </div>
                ));
              })()}
            </div>
          )}
      </div>
    </div>
  );
};