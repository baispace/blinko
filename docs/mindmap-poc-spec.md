# mindmap-poc · 生产页面方案

> 在原型 `blinko-mubu-prototype.html` 基础上，把幕布风格的拖拽思维导图搬进 Blinko 真实路由。
> 本文档即决策稿，动手前不再二次评审；改动 PR 描述引用此文档即可。

---

## 1. 目标与边界

### 1.1 目标
把原型里验证过的"幕布 / XMind 心智模型"做成 Blinko 里的一个真实页面**`/mindmap-poc`**，给真实笔记做一次可视化编辑入口。

### 1.2 这一版**不**做
- **不接 NTP 后端**：先用一份本地 fixture（3-5 个真实风格的笔记）走通；
  后续接入走单独 PR，不在 PoC 里堆。
- **不做多选拖拽**（原型本轮就没做，留给下一版）。
- **不做跨面板 / 触屏 / 边缘自动平移 / 智能重排**。
- **不做笔记存盘冲突合并**。PoC 阶段的存盘只是把当前树写到 localStorage，
  当成"未保存草稿"。
- **不嵌入主编辑器**。这一页是独立入口，跟 `/detail/:id` 平行。

### 1.3 这一版做
- 路由 `/mindmap-poc`，独立懒加载页（参考 `pages/all.tsx` / `pages/hub.tsx` 的写法）。
- 大纲（左侧，Tiptap 列表）⇄ 导图（右侧，markmap）双向同步：
  - Tiptap 文本编辑 → markmap 节点文字同步
  - markmap 拖拽改父 / 改顺序 → Tiptap 大纲列表重排
  - markmap 折叠 → 大纲里对应项加 `payload.fold`
- 7 项拖拽交互**全部照搬**原型（见 §4）。
- 主题：5 套（ink / macaron / dark / mono / bright）。
- 撤销 / 重做栈 + ⌘Z / ⌘⇧Z。
- 持久化：当前树 + 折叠状态 + 主题 + 缩放写到 `localStorage:mm-mindmap-poc`。

---

## 2. 路由与文件结构

```
app/src/
├── pages/
│   └── mindmap-poc.tsx              ← 懒加载页面，路由在 App.tsx 加 /mindmap-poc
└── components/
    └── MindmapPoc/
        ├── index.tsx                ← 页面组装：顶栏 + 左大纲 + 右导图 + 拖拽层
        ├── Outline.tsx              ← Tiptap 列表大纲（继承 li + ul）
        ├── Mindmap.tsx               ← markmap 容器 + 拖拽手柄 + 抓手 + 预览线
        ├── markmapEngine.ts         ← markmap 生命周期 + 节点身份管理 + join-key 重发
        ├── outlineModel.ts          ← Tiptap doc ↔ 树 双向转换 + 折叠状态读写
        ├── dragController.ts        ← 7 项拖拽交互（抓手 / 预览线 / 兄弟 / 折叠 / toast / alt 复制 / 撤销）
        ├── theme.ts                 ← 5 套主题色板 + CSS 变量切换
        ├── history.ts               ← 撤销 / 重做栈（结构性操作 only）
        ├── store.ts                 ← MobX store：tree / selectedIds / theme / zoom / history
        └── types.ts                 ← MindmapNode / OutlineDoc 等类型
```

新增路由（`app/src/App.tsx`）：

```tsx
const MindmapPocPage = lazy(() => import('./pages/mindmap-poc'));
// ...
<Route path="/mindmap-poc" element={<ProtectedRoute><MindmapPocPage /></ProtectedRoute>} />
```

入口放哪儿先不动：从 Hub 页或 Home 顶栏加一个跳转入口（PoC 阶段手动输 URL 也行）。

---

## 3. 数据流

```
┌──────────────┐      onUpdate (debounced 250ms)       ┌──────────────┐
│ Tiptap 大纲  │ ─────────────────────────────────────→ │ Markmap 实例 │
│   (左)       │ ←─── 拖拽改父 / 改顺序（直写大纲）────  │   (右)       │
└──────────────┘                                        └──────────────┘
        │                                                       │
        └──────── 撤销 / 重做 栈记录 ───────────────────────────────┘
```

- **树形状**：
  ```ts
  type MindmapNode = {
    id: string         // 'n_' + 短随机，幂等生成
    content: string   // 单行 markdown 文本
    children: MindmapNode[]
    fold?: 1 | 0
  }
  ```
- **大纲 HTML 形状**（跟原型一致）：`<ul><li data-id="n_xxx"><p>文本</p><ul>...</ul></li></ul>`。
- **Tiptap ⇄ 树**：
  - 树 → Tiptap：把树序列化成 `<ul><li data-id="...">...</li></ul>`，
    通过 `editor.commands.setContent(html, false)` 灌入（Tiptap 自带 list 扩展可解析）。
  - Tiptap → 树：监听 `editor.on('update')`，从 DOM 里以先序遍历读回树。
    文本改动**只写 content**，不改结构、不进撤销栈。
- **markmap 节点身份**：跟原型一致 —— 用 `payload.__id + i(state.id) + hash(content)` 做 join key，
  折叠状态走 `payload.fold: 1`。见原型 `mmMkStampIds` / `mmMkApplyView`。

---

## 4. 7 项拖拽交互（照搬原型）

| # | 交互 | 复用什么 |
|---|---|---|
| ① | 抓手提示（hover 显六点） | `mmMkGripEl` / `mmMkPositionGrip` |
| ② | 实时连接预览线（源→鼠标 cubic 曲线） | `mmUpdateDragLine` / `mmHideDragLine` |
| ③ | 兄弟插入位置放大版（横线 + 三角 + 角标） | `mmMkEnsureBarBadges` |
| ④ | 撤销 / 重做 + ⌘Z / ⌘⇧Z | `mmHistory` 全套 |
| ⑤ | 折叠父的迷你预览 | `_mmBarMini` + `.is-folded` 类 |
| ⑥ | drop 后 toast（带 ↶ 按钮） | `mmToast` / `mmToastClear` |
| ⑦ | Alt 复制 | `mmMkApplyDrop(id, opts)` + `opts.copy` |

实现策略：**不照搬 HTML 字符串字面量**，照搬**逻辑**。原型的核心逻辑（mmMkXxx 一族）
抽到 `dragController.ts` 里，关键参数化点是：

- 节点身份从 `d.__data__` 拿（原型验证过：`data-path` 不可靠）。
- 命中目标判定：`getBoundingClientRect()` 比对落点盒子（盒子内 = 子级，盒子外 + 兄弟带 = 兄弟）。
- markmap 实例入口允许外部传 `Markmap` 工厂（生产页用 `markmap-view` 模块导入，
  原型继续用 `+esm` CDN —— 不污染）。

唯一**例外**：抓手 mousedown 跳过 5px 阈值（保留原型逻辑）。

---

## 5. 主题

5 套色板，定义为 CSS 变量切换：

```ts
// theme.ts
export const themes = {
  ink:     { bg: '#ffffff', fg: '#252525', accent: '#2563eb', line: '#94a3b8', muted: '#f3f4f6' },
  macaron: { bg: '#fff7ed', fg: '#1c1917', accent: '#fb7185', line: '#fda4af', muted: '#fed7aa' },
  dark:    { bg: '#0f172a', fg: '#e2e8f0', accent: '#38bdf8', line: '#475569', muted: '#1e293b' },
  mono:    { bg: '#fafafa', fg: '#171717', accent: '#404040', line: '#a3a3a3', muted: '#e5e5e5' },
  bright:  { bg: '#f0fdf4', fg: '#064e3b', accent: '#16a34a', line: '#86efac', muted: '#dcfce7' },
}
```

切换主题 = 切 `<svg>` 上 dataset + `<body>` 上 dataset，markmap 自带的 `colorFn` 读 CSS 变量。

---

## 6. 持久化（PoC 阶段）

写到 `localStorage`，key 全部 `mm-mindmap-poc:*`：

```
mm-mindmap-poc:tree       ← MindmapNode 树 JSON
mm-mindmap-poc:theme      ← 'ink' | 'macaron' | ...
mm-mindmap-poc:zoom       ← number
mm-mindmap-poc:history    ← JSON 撤销栈（仅结构性操作）
```

刷新页面 = 把 `tree` 灌回大纲 + 灌 render + 恢复 theme/zoom。

撤销栈**不**跨页面持久（用户没明确诉求，PoC 阶段简化）。

---

## 7. 排期

| 编号 | 内容 | 工时 |
|---|---|---|
| A | 路由 + 脚手架（页面 + store + theme + 5 套色板） | 0.5d |
| B | Tiptap 大纲 + outlineModel（树 ⇄ doc） | 1.0d |
| C | markmap 接入 + join-key / 折叠协议 | 0.5d |
| D | dragController 7 项交互 | 1.5d |
| E | history + ⌘Z / ⌘⇧Z | 0.3d |
| F | 持久化 + 入口跳转 | 0.3d |
| G | Playwright 回归 + 视觉截图 | 0.5d |
| **合计** | | **4.6d** |

---

## 8. 验证

沿用原型 `tools/mm-edit.mjs` + `tools/mm-interact.mjs` 的脚本结构，针对生产页写：

- `tools/mm-poc-edit.mjs`：Tiptap → markmap 同步、双向编辑、折叠、主题切换
- `tools/mm-poc-drag.mjs`：7 项拖拽交互（抓手、命中判定、预览线、兄弟、折叠父预览、toast、Alt 复制、撤销）

视觉截图产物：
```
.shots/poc/
  01-初始.png
  02-Tiptap-编辑.png
  03-拖拽变子级.png
  04-拖拽变兄弟级.png
  05-Alt-复制.png
  06-折叠预览.png
  07-撤销.png
  08-主题-dark.png
```

---

## 9. 跟既有 7 项**已确认不傲**的多选拖拽

用户给绿灯时没答 4 个确认问题（持久化、内置引擎复制、多选保持结构 vs 打散），
按"省事"原则：PoC 阶段**只做单选 + Alt 复制**，多选拖拽**不在本 PR 范围**。

后续要补再做：

- 多选 ⌘/Ctrl + 点击
- 多选拖：整组保持原父子关系一起搬
- 多选 + Alt：整组复制

加在 `dragController.ts` 的 `mmMkDragStart` / `mmMkApplyDrop` 上半部即可，回归脚本
留独立钩子。