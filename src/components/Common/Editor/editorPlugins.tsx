import { codeMirrorPlugin, diffSourcePlugin, headingsPlugin, imagePlugin, linkPlugin, realmPlugin, ViewMode, sandpackPlugin, viewMode$, linkDialogPlugin } from '@mdxeditor/editor';
import { simpleSandpackConfig } from './type';
import { eventBus } from '@/lib/event';
const { codeBlockPlugin, tablePlugin, listsPlugin, quotePlugin, markdownShortcutPlugin } = await import('@mdxeditor/editor')
export const codeBlockLanguages = {
  plain: "plain",
  typescript: "TypeScript",
  go: "Go",
  html: "HTML",
  python: "Python",
  yaml: "YAML",
  mermaid: "Mermaid",
  mindmap: "MindMap",
  echarts:"Echarts",
  java: "Java",
  js: "JavaScript",
  javascript: "JavaScript",
  c: "C",
  csharp: "C#",
  php: "PHP",
  sql: "SQL",
  lua: "Lua",
  bash: "Shell (Bash)",
  shell: "Shell Script",
  json: "JSON",
  xml: "XML",

  ini: "INI",
}

export const ProcessCodeBlocks = (content: string): string => {
  if (!content) return '';
  const codeBlockRegex = /```(?:(\w*)\n)?([\s\S]*?)```/g;

  let lastIndex = 0;
  let result = '';
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const beforeCode = content.slice(lastIndex, match.index);
    result += beforeCode.replace(/(<[^>]+>)/gi, '\\$1').replace(/^[-*_]{3,}$/gm, '\\$&').replace(/<>/gm, '\\<>');

    const [_, language, code] = match;
    if (!language || !(language in codeBlockLanguages)) {
      result += '```plain\n' + code.trim() + '\n```';
    } else {
      result += '```' + language + '\n' + code.trim() + '\n```';
    }

    lastIndex = codeBlockRegex.lastIndex;
  }

  const afterLastCode = content.slice(lastIndex);
  result += afterLastCode.replace(/(<[^>]+>)/gi, '\\$1').replace(/^[-*_]{3,}$/gm, '\\$&').replace(/<>/gm, '\\<>');

  return result;
};

export const viewModePlugin = realmPlugin({
  init: (realm) => {
    eventBus.on('editor:setViewMode', (mode) => {
      realm.pub(viewMode$, mode)
    })
  }
})

export const MyPlugins = [
  codeBlockPlugin({ defaultCodeBlockLanguage: 'plain' }),
  sandpackPlugin({ sandpackConfig: simpleSandpackConfig }),
  codeMirrorPlugin({
    codeBlockLanguages
  }),
  imagePlugin(),
  listsPlugin(),
  linkPlugin(),
  quotePlugin(),
  tablePlugin(),
  headingsPlugin(),
  markdownShortcutPlugin(),
  diffSourcePlugin({ viewMode: 'rich-text' }),
  viewModePlugin(),
  // linkDialogPlugin()
]