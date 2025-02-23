import { helper } from '@/lib/helper';
import { useTheme } from 'next-themes';
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { BlinkoStore } from '@/store/blinkoStore';
import { RootStore } from '@/store';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { Code } from './Code';
import { LinkPreview } from './LinkPreview';
import { ImageWrapper } from './ImageWrapper';
import { ListItem } from './ListItem';
import dynamic from 'next/dynamic';
import { Skeleton } from '@heroui/react';
import { TableWrapper } from './TableWrapper';
import router, { useRouter } from 'next/router';
import remarkTaskList from 'remark-task-list';

const MermaidWrapper = dynamic(() => import('./MermaidWrapper').then(mod => mod.MermaidWrapper), {
  loading: () => <Skeleton className='w-full h-[40px]' />,
  ssr: false
});

const MarkmapWrapper = dynamic(() => import('./MarkmapWrapper').then(m => m.MarkmapWrapper), {
  loading: () => <Skeleton className='w-full h-[40px]' />,
  ssr: false
});

const EchartsWrapper = dynamic(() => import('./EchartsWrapper'), {
  loading: () => <Skeleton className='w-full h-[40px]' />,
  ssr: false
});

const HighlightTags = observer(({ text, }: { text: any }) => {
  const { pathname } = useRouter()
  if (!text) return text
  try {
    const decodedText = text.replace(/&nbsp;/g, ' ');
    const lines = decodedText?.split("\n");
    return lines.map((line, lineIndex) => {
      const parts = line.split(/\s+/);
      const processedParts = parts.map((part, index) => {
        if (part.startsWith('#') && part.length > 1 && part.match(helper.regex.isContainHashTag)) {
          const isShareMode = pathname.includes('share')
          if (isShareMode) return <span key={`${lineIndex}-${index}`} className={`w-fit select-none blinko-tag px-1 font-bold cursor-pointer hover:opacity-80 transition-all`}>{part + " "}</span>
          return (
            <span key={`${lineIndex}-${index}`}
              className={`select-none blinko-tag px-1 font-bold cursor-pointer hover:opacity-80 transition-all ${isShareMode ? 'pointer-events-none' : ''}`}
              onClick={async () => {
                if (isShareMode) return;
                await router.replace(`/?path=all&searchText=${encodeURIComponent(part)}`)
                RootStore.Get(BlinkoStore).forceQuery++
              }}>
              {part + " "}
            </span>
          );
        } else {
          return part + " ";
        }
      });
      return [...processedParts, <br key={`br-${lineIndex}`} />];
    });
  } catch (e) {
    return text
  }
});

const Table = ({ children }: { children: React.ReactNode }) => {
  return <div className="table-container">{children}</div>;
};

export const MarkdownRender = observer(({
  content = '',
  onChange,
  isShareMode,
  highlightLastChar = false
}: {
  content?: string,
  onChange?: (newContent: string) => void,
  isShareMode?: boolean,
  highlightLastChar?: boolean
}) => {
  const { theme } = useTheme();
  const contentRef = useRef(null);

  const renderHighlightedText = (text: string) => {
    if (!highlightLastChar || text.length === 0) return text;

    if (content.endsWith(text)) {
      const lastChar = text.slice(-1);
      const secondLastChar = text.slice(-2, -1);
      const thirdLastChar = text.slice(-3, -2);
      const fourthLastChar = text.slice(-4, -3);
      const fifthLastChar = text.slice(-5, -4);
      const restText = text.slice(0, -5);

      const chars = [
        fifthLastChar,
        fourthLastChar,
        thirdLastChar,
        secondLastChar,
        lastChar
      ];

      return (
        <>
          {restText}
          {chars.map((char, index) => (
            <span
              key={index}
              style={{
                opacity: 0,
                animation: `fadeIn 0.3s ${index * 0.1}s ease-in-out forwards`
              }}
            >
              {char}
            </span>
          ))}
        </>
      );
    }

    return text;
  };

  return (
    <div className={`markdown-body`}>
      <div ref={contentRef} data-markdown-theme={theme} className={`markdown-body content`}>
        <ReactMarkdown
          remarkPlugins={[
            [remarkGfm, { table: false }],
            remarkTaskList,
            [remarkMath, {
              singleDollarTextMath: true,
              inlineMath: [['$', '$']],
              blockMath: [['$$', '$$']]
            }]
          ]}
          rehypePlugins={[
            rehypeRaw,
            [rehypeKatex, {
              throwOnError: false,
              output: 'html',
              trust: true,
              strict: false
            }]
          ]}
          components={{
            p: ({ node, children }) => {
              const text = String(children);
              return (
                <p>
                  {highlightLastChar ? (
                    <span>
                      {renderHighlightedText(text)}
                    </span>
                  ) : (
                    <HighlightTags text={children} />
                  )}
                </p>
              );
            },
            code: ({ node, className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || '');
              const language = match ? match[1] : '';

              if (language === 'mermaid') {
                return <MermaidWrapper content={String(children)} />;
              }

              if (language === 'mindmap') {
                return <MarkmapWrapper content={String(children)} />;
              }

              if (language === 'echarts') {
                return <EchartsWrapper options={String(children).trim()} />;
              }

              return <Code node={node} className={className} {...props}>{children}</Code>;
            },
            a: ({ node, children }) => {
              return <LinkPreview href={node?.properties?.href} text={children} />
            },
            li: ({ node, children, className }) => {
              const isTaskListItem = className?.includes('task-list-item');
              if (isTaskListItem && onChange && !isShareMode) {
                return (
                  <ListItem
                    content={content}
                    onChange={onChange}
                    className={className}
                  >
                    {children}
                  </ListItem>
                );
              }
              return <li className={className}>{children}</li>;
            },
            img: ImageWrapper,
            table: TableWrapper
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
});

export const StreamingCodeBlock = observer(({ markdown }: { markdown: string }) => {
  return (
    <ReactMarkdown components={{ code: Code }}>
      {markdown}
    </ReactMarkdown>
  );
}); 