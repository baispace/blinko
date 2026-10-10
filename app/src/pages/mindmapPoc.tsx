import React, { useState, useMemo, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { EditorContent, useEditor, BubbleMenu, FloatingMenu } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleListItem } from '@/components/Common/Editor/Tiptap/collapsibleListItem';
import { DragHandle } from '@/components/Common/Editor/Tiptap/DragHandle';
import { SlashCommand } from '@/components/Common/Editor/Tiptap/extensions';
import { SlashMenuState } from '@/components/Common/Editor/Tiptap/slashMenuState';
import { SlashMenuView } from '@/components/Common/Editor/Tiptap/ToolbarButtons';
import '@/components/Common/Editor/Tiptap/tiptap.css';
import './mindmapPoc.css';

/**
 * Effie 大纲 ↔ 思维导图 POC
 *
 * 现场验证：
 *  1. Tiptap 编辑器 + CollapsibleListItem 折叠手柄（Effie 风格核心交互）
 *  2. shadcn-aligned bullet 样式 + 嵌套引导线 + hover 加粗
 *  3. markmap.js 思维导图渲染（基于同一份 markdown 数据）
 *  4. Notion-like 块级操作：drag handle / + 插入 / bubble menu / slash / floating menu
 *
 * 三栏布局：左侧 Tiptap 编辑器 / 中间 MarkdownRender 阅读态 / 右侧 markmap
 * 三者共享同一份 markdown：编辑器 → onUpdate → state → markmap + markdown
 *
 * 访问：/mindmap-poc
 */

type Preset = {
  key: string;
  label: string;
  desc: string;
  content: string;
};

const INITIAL_CONTENT = `# 产品策略讨论

- 用户增长
  - 拉新
    - SEO 内容
    - 投放
    - 渠道合作
  - 留存
    - 通知召回
    - 周报推送
- 商业化
  - 订阅
  - 增值服务
- 体验
  - 性能优化
  - 交互打磨
  - 文档与社区`;

const PRESETS: Preset[] = [
  {
    key: 'effie-bullet',
    label: 'Effie 大纲风格',
    desc: 'Markdown bullet list，模拟 Effie 列表',
    content: INITIAL_CONTENT,
  },
  {
    key: 'markmap-fence',
    label: '```mindmap 代码块',
    desc: '这是 Blinko 已经支持的格式（MarkdownRender 已接入）',
    content: `\`\`\`mindmap
# Blinko 架构
## 前端
### React
### Tiptap
### HeroUI
## 后端
### tRPC
### Prisma
### Postgres
## AI
### 多 Provider
### 流式输出
\`\`\``,
  },
  {
    key: 'meeting',
    label: '会议纪要样本',
    desc: '贴近真实工作场景',
    content: `# 周一站会 - 2026/10/10

- 上周回顾
  - 上线了 review 页大改
  - 完成了 Effie 字体调研
- 本周计划
  - 验证 markmap POC
  - 推进待办模块
- 风险与阻塞
  - iconify 本地包 solar 图标不全
  - 需评估 mcp_browser 截图稳定性`,
  },
];

const MindmapPocPage = observer(() => {
  const [content, setContent] = useState(INITIAL_CONTENT);
  const [activePreset, setActivePreset] = useState(PRESETS[0].key);
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const [nodeCount, setNodeCount] = useState<number | null>(null);

  // Notion-ish slash menu state —— SlashCommand 用这个 store 推 open / rect / items
  const slashMenuRef = useRef<SlashMenuState | null>(null);
  if (slashMenuRef.current === null) {
    slashMenuRef.current = new SlashMenuState();
  }
  const slashMenuState = slashMenuRef.current;

  /**
   * Tiptap 编辑器实例 —— Notion-ish demo 配置
   *
   * 包含：bullet / heading / collapsible list / markdown / slash /
   *       drag handle 后续手动 mount、FloatingMenu & BubbleMenu 也手动挂载。
   *
   * 故意不接（demo 不需要）：
   * - TaskList / TaskItem（避免和 bullet 视觉混淆）
   * - NoteMention / HashtagSuggestion（笔记专属）
   * - Callout / Table（演示不需要）
   * - 图片上传 / 附件
   */
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        // 禁用默认 listItem 用自定义 CollapsibleListItem（添加折叠/展开子树）
        listItem: false,
      }),
      CollapsibleListItem,
      Placeholder.configure({
        placeholder: '输入 / 唤起命令 · 输入 - 然后空格进列表 · Tab 缩进……',
        showOnlyWhenEditable: true,
      }),
      Markdown.configure({
        html: true,
        linkify: true,
        breaks: true,
        transformPastedText: false,
        transformCopiedText: false,
      }),
      // 斜杠菜单：独立 SlashMenuState（不依赖 EditorStore）
      SlashCommand.configure({ slashMenu: slashMenuState }),
    ],
    // 注意：content 必须是 ProseMirror JSON，markdown 需要在 onCreate 后用
    // editor.commands.setContent(md) 设置（tiptap-markdown 在 insertContent 时才解析）
    content: '',
    onUpdate: ({ editor }) => {
      const md = editor.storage.markdown.getMarkdown()
      setContent(md)
    },
    editorProps: {
      attributes: {
        class: 'tiptap tiptap-poc-editor',
        spellcheck: 'false',
      },
    },
  })

  // 编辑器创建后用 markdown 作为初始内容
  useEffect(() => {
    if (!editor) return
    editor.commands.setContent(INITIAL_CONTENT, true)
  }, [editor])

  // 节流：内容变化 200ms 后才计算统计，避免每键击都跑 markdown 解析
  useEffect(() => {
    const handle = setTimeout(() => {
      const t0 = performance.now();
      import('markmap-lib').then(({ Transformer }) => {
        const { root } = new Transformer().transform(content);
        let count = 0;
        const walk = (n: any) => {
          count++;
          (n?.children ?? []).forEach(walk);
        };
        walk(root);
        setNodeCount(count);
        setRenderMs(Math.round(performance.now() - t0));
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [content]);

  const switchPreset = (preset: Preset) => {
    setActivePreset(preset.key);
    setContent(preset.content);
    // 同步到编辑器：剥掉 ```mindmap 围栏，让 Tiptap 直接接收 bullet 即可
    const stripped = preset.content.replace(/```mindmap\s*([\s\S]*?)```/g, '$1').trim();
    editor?.commands.setContent(stripped, false);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-default-50">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-default-200 bg-white">
        <div className="flex items-center gap-3">
          <Icon icon="hugeicons:tree-06" className="text-2xl text-primary" />
          <div>
            <div className="text-sm font-semibold text-default-800">
              Effie 大纲 ↔ 思维导图 POC
            </div>
            <div className="text-[11px] text-default-400 mt-0.5">
              Notion-ish demo：拖拽手柄 / + 块插入 / 浮层条 / 斜杠菜单 · 临时页面 ·{' '}
              <code className="px-1 py-0.5 rounded bg-default-100">/mindmap-poc</code>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-default-500">
          {nodeCount !== null && (
            <span className="px-2 py-1 rounded-full bg-default-100">
              {nodeCount} 个节点
            </span>
          )}
          {renderMs !== null && (
            <span className="px-2 py-1 rounded-full bg-default-100">
              解析 {renderMs} ms
            </span>
          )}
        </div>
      </header>

      {/* Preset Bar */}
      <div className="flex items-center gap-2 px-6 py-2.5 border-b border-default-200 bg-white">
        <span className="text-[11px] text-default-400 uppercase tracking-wider">
          样本
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => switchPreset(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activePreset === p.key
                ? 'bg-primary text-white shadow-sm'
                : 'bg-default-100 text-default-600 hover:bg-default-200'
            }`}
            title={p.desc}
          >
            {p.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-default-400 flex items-center gap-1">
          💡 悬停块显示 <kbd className="px-1 py-0.5 rounded bg-default-100 border border-default-200">⠿</kbd> 拖拽 / <kbd className="px-1 py-0.5 rounded bg-default-100 border border-default-200">+</kbd> 插入 / 选中文本出浮层 / <kbd className="px-1 py-0.5 rounded bg-default-100 border border-default-200">/</kbd> 命令
        </span>
      </div>

      {/* Split: Tiptap editor + Markdown render + Markmap */}
      <main className="flex-1 grid grid-cols-3 gap-0 min-h-0">
        {/* Left: Tiptap editor — 折叠手柄 + bullet 样式 + hover 引导线 */}
        <section className="flex flex-col border-r border-default-200 bg-white">
          <div className="flex items-center justify-between px-4 py-2 border-b border-default-200">
            <span className="text-[11px] text-default-400 uppercase tracking-wider font-medium">
              Tiptap 编辑器（折叠手柄）
            </span>
            <span className="text-[10px] text-default-300">
              {editor?.storage.characterCount?.characters() ?? 0} 字符
            </span>
          </div>
          <div className="flex-1 px-8 py-5 overflow-y-auto">
            <EditorContent editor={editor} className="tiptap-wrap" />
            {editor && (
              <>
                <DragHandle editor={editor} />
                <BubbleMenu
                  editor={editor}
                  shouldShow={({ editor }) => {
                    if (!editor) return false;
                    const { selection } = editor.state;
                    if (selection.empty) return false;
                    const node = (selection as any)?.node;
                    return !(node?.type?.name === 'image');
                  }}
                  tippyOptions={{ duration: 120, maxWidth: 'none' }}
                >
                  <div className="tiptap-bubble">
                    <button title="粗体"
                      className={editor.isActive('bold') ? 'is-active' : ''}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => editor.chain().focus().toggleBold().run()}
                    >
                      <Icon icon="mdi:format-bold" width={14} height={14} />
                    </button>
                    <button title="斜体"
                      className={editor.isActive('italic') ? 'is-active' : ''}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => editor.chain().focus().toggleItalic().run()}
                    >
                      <Icon icon="mdi:format-italic" width={14} height={14} />
                    </button>
                    <button title="下划线"
                      className={editor.isActive('underline') ? 'is-active' : ''}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => editor.chain().focus().toggleUnderline().run()}
                    >
                      <Icon icon="mdi:format-underline" width={14} height={14} />
                    </button>
                    <div className="bubble-divider" />
                    <button title="行内代码"
                      className={editor.isActive('code') ? 'is-active' : ''}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => editor.chain().focus().toggleCode().run()}
                    >
                      <Icon icon="mdi:code-tags" width={14} height={14} />
                    </button>
                    <button title="高亮"
                      className={editor.isActive('highlight') ? 'is-active' : ''}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => editor.chain().focus().toggleHighlight().run()}
                    >
                      <Icon icon="mdi:format-color-highlight" width={14} height={14} />
                    </button>
                  </div>
                </BubbleMenu>
                <FloatingMenu
                  editor={editor}
                  shouldShow={({ editor }) => {
                    if (!editor) return false;
                    const { state } = editor;
                    const { selection } = state;
                    const { $from } = selection;
                    const node = $from.node();
                    // 仅在当前块是 paragraph 且完全为空时出现，避免与 slash 重复
                    if (node?.type?.name !== 'paragraph') return false;
                    if (node.textContent.length > 0) return false;
                    return true;
                  }}
                  tippyOptions={{ duration: 120, placement: 'left' }}
                >
                  <button
                    className="tiptap-addblock"
                    title="点击调出块菜单"
                    onClick={() => {
                      editor.commands.focus();
                      editor.commands.insertContent('/');
                    }}
                  >
                    <Icon icon="mdi:plus" width={16} height={16} />
                  </button>
                </FloatingMenu>
              </>
            )}
            <SlashMenuView state={slashMenuState} />
          </div>
        </section>

        {/* Middle: native markdown render */}
        <section className="flex flex-col border-r border-default-200 bg-white">
          <div className="flex items-center justify-between px-4 py-2 border-b border-default-200">
            <span className="text-[11px] text-default-400 uppercase tracking-wider font-medium">
              原生 Markdown 渲染
            </span>
            <span className="text-[10px] text-default-300">read 视图</span>
          </div>
          <div className="flex-1 p-5 overflow-y-auto markdown-body">
            <NativeMarkdownPreview content={content} />
          </div>
        </section>

        {/* Right: markmap */}
        <section className="flex flex-col bg-default-50">
          <div className="flex items-center justify-between px-4 py-2 border-b border-default-200 bg-white">
            <span className="text-[11px] text-default-400 uppercase tracking-wider font-medium">
              Markmap 实时预览
            </span>
            <span className="text-[10px] text-default-300">
              markmap-lib {`0.18.x`}
            </span>
          </div>
          <div className="flex-1 p-4 overflow-hidden">
            <MindmapPreview content={content} />
          </div>
        </section>
      </main>

      {/* Footer note */}
      <footer className="px-6 py-2 border-t border-default-200 bg-white text-[11px] text-default-400 flex items-center justify-between">
        <span>
          💡 三视图共享同一份 markdown：Tiptap 编辑器 / Markdown 阅读态 / markmap 思维导图
        </span>
        <a
          href="/"
          className="text-primary hover:underline flex items-center gap-1"
        >
          <Icon icon="mdi:home-outline" className="text-sm" />
          返回主页
        </a>
      </footer>
    </div>
  );
});

// Native markdown render via existing MarkdownRender — 用于直观对比 bullet / 树状线样式
const NativeMarkdownPreview = observer(({ content }: { content: string }) => {
  const [MarkdownRender, setCmp] = useState<any>(null);
  useEffect(() => {
    let cancelled = false;
    import('@/components/Common/MarkdownRender').then((mod) => {
      if (!cancelled) setCmp(() => mod.MarkdownRender);
    });
    return () => { cancelled = true; };
  }, []);
  if (!MarkdownRender) {
    return <div className="text-default-300 text-xs">加载中…</div>;
  }
  return <MarkdownRender content={content} />;
});

// Lazy-loaded preview wrapper — 保持与 MarkdownRender 一致的挂载行为
const MindmapPreview = observer(({ content }: { content: string }) => {
  const [MarkmapWrapper, setWrapper] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    import('@/components/Common/MarkdownRender/MarkmapWrapper').then((mod) => {
      if (!cancelled) setWrapper(() => mod.MarkmapWrapper);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 对 ```mindmap 代码块做一层剥壳：markmap-lib 直接吃 markdown 文本，不识别代码块围栏
  const stripped = useMemo(() => {
    const m = content.match(/```mindmap\s*([\s\S]*?)```/);
    if (m) return m[1].trim();
    return content;
  }, [content]);

  if (!MarkmapWrapper) {
    return (
      <div className="w-full h-full flex items-center justify-center text-default-300 text-xs">
        加载 markmap…
      </div>
    );
  }

  return <MarkmapWrapper content={stripped} />;
});

export default MindmapPocPage;
