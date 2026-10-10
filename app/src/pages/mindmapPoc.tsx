import React, { useState, useMemo, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Icon } from '@/components/Common/Iconify/icons';

/**
 * Effie 大纲 ↔ 思维导图 POC
 *
 * 目的：验证 markmap.js 接入成本 + 视觉风格是否对齐
 *
 * 用法：
 *   - 左侧 textarea 写 markdown（bullet list 或 ```mindmap 代码块均可）
 *   - 右侧实时渲染 markmap
 *   - 顶部 preset 一键切换样本
 *
 * 访问：/mindmap-poc
 */

type Preset = {
  key: string;
  label: string;
  desc: string;
  content: string;
};

const PRESETS: Preset[] = [
  {
    key: 'effie-bullet',
    label: 'Effie 大纲风格',
    desc: 'Markdown bullet list，模拟 Effie 列表',
    content: `# 产品策略讨论

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
  - 文档与社区`,
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
  const [content, setContent] = useState(PRESETS[0].content);
  const [activePreset, setActivePreset] = useState(PRESETS[0].key);
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const [nodeCount, setNodeCount] = useState<number | null>(null);

  // 节流：内容变化 200ms 后才计算统计，避免每键击都跑 markdown 解析
  useEffect(() => {
    const handle = setTimeout(() => {
      const t0 = performance.now();
      // markmap-lib 自带 transformer；这里只跑一次 transform 看耗时
      import('markmap-lib').then(({ Transformer }) => {
        const { root } = new Transformer().transform(content);
        // 递归统计节点数
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
              验证 markmap.js 接入成本 · 临时页面 ·{' '}
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
      </div>

      {/* Split: Editor + Preview (3-column: input / native md render / markmap) */}
      <main className="flex-1 grid grid-cols-3 gap-0 min-h-0">
        {/* Left: textarea */}
        <section className="flex flex-col border-r border-default-200 bg-white">
          <div className="flex items-center justify-between px-4 py-2 border-b border-default-200">
            <span className="text-[11px] text-default-400 uppercase tracking-wider font-medium">
              Markdown 输入
            </span>
            <span className="text-[10px] text-default-300">{content.length} 字符</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setActivePreset(''); // 自定义时清掉 preset 高亮
            }}
            className="flex-1 w-full p-4 resize-none outline-none font-mono text-[13px] leading-6 text-default-700 bg-white placeholder:text-default-300"
            placeholder={`输入 markdown 试试

# 中心主题
## 分支 1
### 子分支
- 要点
- 要点`}
          />
        </section>

        {/* Middle: native markdown render (for visual verification of bullets / tree lines) */}
        <section className="flex flex-col border-r border-default-200 bg-white">
          <div className="flex items-center justify-between px-4 py-2 border-b border-default-200">
            <span className="text-[11px] text-default-400 uppercase tracking-wider font-medium">
              原生 Markdown 渲染
            </span>
            <span className="text-[10px] text-default-300">bullet + tree-line</span>
          </div>
          <div className="flex-1 p-5 overflow-y-auto markdown-body">
            <NativeMarkdownPreview content={content} />
          </div>
        </section>

        {/* Right: markmap preview */}
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
          💡 结论：Blinko 已通过 ```mindmap 代码块集成 markmap，验证通过即可做三视图编辑器。
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
  // 我们在 POC 里做轻量抽取，遇到 ```mindmap ... ``` 就把内部内容拿出来
  const stripped = useMemo(() => {
    const m = content.match(/```mindmap\s*([\s\S]*?)```/);
    if (m) return m[1].trim();
    // 已经是裸 bullet / heading
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
