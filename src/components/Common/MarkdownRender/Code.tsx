import { useTheme } from 'next-themes';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { Copy } from '../Copy';

interface CodeProps {
  className?: string;
  children: any;
  [key: string]: any;
}

export const Code = ({ className, children, ...props }: CodeProps) => {
  const { theme } = useTheme()
  const match = /language-(\w+)/.exec(className || '');
  
  const shouldHighlight = !className || className?.includes('language-') || className?.includes('hljs');
  
  return shouldHighlight ? (
    <div className="relative group">
      <Copy content={String(children).replace(/\n$/, '')} size={16} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity" />
      <SyntaxHighlighter
        {...props}
        PreTag="div"
        children={String(children).replace(/\n$/, '')}
        language={match ? match[1] : 'text'}
        customStyle={{
          borderRadius: '16px',
        }}
        style={theme == 'light' ? oneLight : vscDarkPlus}
      />
    </div>
  ) : (
    <code className={className} {...props}>
      {children}
    </code>
  );
}; 