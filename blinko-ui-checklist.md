# Blinko UI 优化 · 落地清单

> 范围：**仅现有功能的 UI 与交互优化**，不新增任何功能模块。
> 原型：`blinko-ui-prototype.html`（9 视图，4 弹层已实测）
> 分支：`main_baispace`　基线：`ed7de72e`

## 批次总览

| 批次 | 项数 | 风险 | 依赖 |
|---|---|---|---|
| A 设计令牌 | 3 | 中（全站观感变化） | 无 |
| B 修 bug | 3 | 低 | 无 |
| C 侧栏分组 | 2 | 低 | A |
| D 详情页 | 2 | 中 | A |
| E 设置弹窗 | 1 | 低 | A |
| F 列表页 | 2 | 低 | A |

建议顺序：**A → B → C → D → E → F**。每批独立可回滚。

---

## 批次 A · 设计令牌

### A1　主色：纯黑 → 品牌蓝

**文件** `app/src/styles/globals.css`

| 位置 | 现值 | 改为 |
|---|---|---|
| `:root` L233 | `--primary: black` | `--primary: #2f6feb` |
| `.dark` L286 | `--primary: #f9f9f9` | `--primary: #4d8bff` |

**不动**：`--tag: #c35af7`（紫）与 `--tag-foreground` 保持原样，与主色区分。

**验收**：侧栏激活项、设置开关、链接、详情页「编辑」主按钮全部变蓝；`#标签` 仍为紫色。

**风险**：`bg-primary` 在全站被大量用作「强调块」，改色后这些位置会一起变蓝。若觉得过跳，换 `#3b6ea5` 等低饱和蓝即可。

---

### A2　阴影 / 圆角统一

**文件** `app/src/styles/globals.css` L249 / L255 / L302

```
--shadow: 1px 1px 7px 3px #b1b1b142;
```
改为
```
--shadow: 0 1px 2px rgba(0,0,0,.05), 0 4px 16px rgba(0,0,0,.06);
```

`.dark` 内另给一套（`--shadow` 需在 `.dark` 中重定义，当前 `.dark` 未定义，需新增）：
```
--shadow: 0 1px 2px rgba(0,0,0,.4), 0 4px 16px rgba(0,0,0,.5);
```

`--radius: 0.5rem`（8px）**保持不变**。卡片圆角从 `rounded-xl`（12px）收到 `rounded-[10px]`，侧栏项 `rounded-xl` → `rounded-lg`。

**验收**：卡片悬停时阴影不再四边发灰。

---

### A3　侧栏黄光斑移除 + 激活态改浅蓝底

**文件** `app/src/components/Layout/Sidebar.tsx`

1. **删除 L116-118** 整个 `halation` div（250px 黄色模糊光斑）
2. **L105** 激活类名 `!bg-primary !text-primary-foreground` → `!bg-primary/10 !text-primary`
3. `app/src/components/Layout/index.tsx:29` `SideBarItem` 的 `rounded-xl` → `rounded-lg`

**验收**：侧栏不再有黄色光晕，激活项为浅蓝底 + 蓝字。

---

## 批次 B · 修 bug（可独立提交）

### B1　图片九宫格留空位

**文件** `app/src/components/BlinkoCard/imageGallery.tsx:29`

现：
```js
const cols = !single && handledFiles.length === 4 ? 2 : 3;
```
改为：
```js
const cols = !single && [2, 4, 7, 8].includes(handledFiles.length) ? 2 : 3;
```

**推导依据**（末行填满情况）：

| 张数 | 现状列数 | 末行空位 | 改为 | 末行空位 |
|---|---|---|---|---|
| 2 | 3 | **1** | 2 | 0 ✅ |
| 3 | 3 | 0 | 3 | 0 |
| 4 | 2 | 0 | 2 | 0 |
| 5 | 3 | 1 | 3 | 1（不可避免） |
| 6 | 3 | 0 | 3 | 0 |
| 7 | 3 | **2** | 2 | 1 ✅ |
| 8 | 3 | **1** | 2 | 0 ✅ |
| 9 | 3 | 0 | 3 | 0 |

5 张时 2 列与 3 列末行都留 1 格，故保持 3 列。

**验收**：发一条带 2 张图的闪念，两图并排占满宽度。

---

### B2　⌘K 焦点移走即失效

**文件** `app/src/components/Layout/BarSearchInput.tsx:29-34`

`useEffect` 里的 `keydown` 监听挂在 input 元素上，input 失焦后快捷键失效。改为 `document.addEventListener('keydown', ...)`，`cleanup` 中 `removeEventListener`。

**验收**：点页面任意位置（非输入框）按 `⌘K`，搜索面板仍能打开。

---

### B3　目录高亮跟随失效

**文件** `app/src/components/Common/TableOfContents.tsx:73-91`

`window.addEventListener('scroll')` 监听的是 window，但详情页滚动发生在 `ScrollArea` 容器内（`pages/detail/index.tsx:29`），**scroll spy 很可能从未生效**。

改法：接收滚动容器 ref（或用 `document.querySelector` 取 ScrollArea 的滚动元素）监听其 `scroll`，`useEffect` 依赖需同步。

**建议**：与 D2（目录改浮层）合并做，因为要动同一个组件。

---

## 批次 C · 侧栏

### C1　按语义分三组

**文件**
- `app/src/store/baseStore.ts` L14-74 `routerList` 每项加 `group?: 'record' | 'tidy' | 'tool'`
- `app/src/components/Layout/Sidebar.tsx` L95-110 改为分组渲染

**分组归属**

| 组 | 项 | 当前状态 |
|---|---|---|
| 记录 | blinko / notes / todo | 已在侧栏 |
| 整理 | archived / trash | archived 已在，**trash 需从 `hiddenSidebar` 放出** |
| 工具 | analytics / resources / plugin | 前两项已在，**plugin 需从 `hiddenSidebar` 放出** |

**改法**：`routerList` 加 `group` 字段；`trash` 与 `plugin` 的 `hiddenSidebar` 改为 `false`。`Sidebar.tsx` 用 `[...new Set(list.map(i=>i.group))]` 分段，组间插小标题（11px、`--desc` 色）。

**注意**：`Sidebar.tsx:111` 的 `TagListPanel` 在导航之后渲染，勿被分组逻辑包裹进去。

**依赖** A1（激活态改色后分组标题才协调）。

---

## 批次 D · 详情页（重点）

### D1　顶栏 → 飞书式「编辑 ▾」

**文件** `app/src/components/BlinkoCard/cardHeader.tsx` L178-247（展开态分支）

**现状**：复制 / 评论 / 分享 / 历史 / 删除 / 置顶标记 / `LeftCickMenu`，共 7 个图标，其中多数 `opacity-0 group-hover:opacity-100`；L233 与 L242 的 `ml-auto` / `ml-[10px]` 会因置顶状态跳位。

**改为**：

```
☰ 大纲  |  [标题]                    页宽  分享  [编辑 ▾]
```

**实现要点**
1. `BlinkoRightClickMenu/index.tsx` 已导出 **15 个菜单项组件**（`EditItem` `TopItem` `TrashItem` `ArchivedItem` `CopyItem` `HistoryItem` `AITagItem` `RelatedNotesItem` `PublishItem` `PublicItem` `ConvertItem` `EditTimeItem` `CommentItem`），**直接复用，无需重写文案图标**
2. 用 HeroUI `DropdownMenu`，`DropdownMenuItem` 之间插分割线分组
3. 分组顺序：

```
复制内容 / 编辑时间 / 历史版本（有 _count.histories 才显示）
─────────────
📌 添加到置顶 / 归档 / 转换为 ›
─────────────
分享 / 发布
─────────────
AI 打标签 / 相关笔记（需 mainModelId）
─────────────
🗑 移到回收站     ← 红色，沉底
```

4. 删除项给 `text-danger`，放最后一条

**保留**：分享仍为顶栏独立按钮（对齐飞书）。复制、评论、历史、删除全部收进菜单。评论入口需保留（`CommentButton` 提到菜单或顶部）。

**依赖** A1。

---

### D2　目录：右栏 → 标题左侧浮层

**文件**
- `app/src/pages/detail/index.tsx` L50-54　**删除**右侧 `w-48` 常驻栏
- `app/src/components/Common/TableOfContents.tsx`　容器改为浮层（`absolute`，左上对齐）

**改法**
1. 删掉 `isPc && ... <div className="w-48 flex-shrink-0 hidden lg:block">` 整块
2. 标题行左侧加 `☰` 按钮（复用 `pages/detail/index.tsx:33` 现有 `PageWidthButton` 同级位置）
3. `TableOfContents` 改为按需展开的浮层，`position:absolute`，点击外部关闭
4. 无标题（`headings.length === 0`）时按钮自动隐藏

**收益**：正文宽度从 `flex-1 + 192px` 变为全宽。

**建议**：与 B3 合并提交（同一组件）。

**依赖** D1（顶栏腾出空间）。

---

## 批次 E · 设置

### E1　独立页 → 宽弹窗

**文件**
- 新建 `app/src/components/BlinkoSettings/SettingsDialog.tsx`（包 `settings.tsx:219-253` 的两栏布局）
- `app/src/components/Layout/Sidebar.tsx:83`　`navigate('/settings')` → 打开弹窗

**现成条件**
- `settings.tsx:37-150` `allSettings` 是纯数据数组，14 个组件各自独立 → **组件本身一行都不用改**
- `DialogStore` 支持 `size: "5xl"`、`noPadding`、`onlyContent`（`app/src/store/module/Dialog/index.tsx:16-17`）
- 现有调用样例：`cardHeader.tsx:270-281`

**弹窗配置**
```js
RootStore.Get(DialogStore).setData({
  isOpen: true, size: '5xl', noPadding: true, content: <SettingsDialog />
})
```

**必须保留 `/settings` 路由** —— `GlobalSearch.tsx:243` 通过 `navigate('/settings?section=xxx')` 跳转设置，深链不能断。

**依赖** A1。

---

## 批次 F · 列表页

### F1　闪念列表排序开关（捡回被删的 UI）

**文件** `app/src/components/Common/PopoverFloat/blinkoHomeSettingsPop.tsx`

时间线分支在 `pages/index.tsx:351-384` **已存在**，仅 UI 开关被删。`updatePageViewSetting` 在同文件 `:66-69` 已现成。

**改法**：在设置浮层加「按天 / 按周 / 瀑布流」开关，写入 `pageViewSettings.noteListStyle`。

⚠️ **前置**：需先查库确认 `noteListStyle` 现值（记忆记录为 `continuous`，2026-09-28），再恢复开关。

**注意**：DnD 拖拽排序仅存在于 masonry 分支（`index.tsx:387-393`），与时间线互斥，**本轮不做**。

---

### F2　待办「重要」分区

**文件** `app/src/pages/index.tsx` L128-166 / L262-348

**现成条件**
- `metadata.priorityImportant` 字段**早已在写入**，无需迁移
- 四象限优先级色条（`TodoCard.tsx:21-37`）与 P0-P3 chip（`:284-293`）已存在

**改法**：在「今天」分区之前插「重要」分区，筛 `priorityImportant` 为真且未完成项；与待办卡片的四象限逻辑对齐。

**风险**：低。纯展示层。

---

## 不在本轮范围

- 笔记列表视图（要新写渲染，且与时间线抢同一 `if/else` 分支）
- 移动端双编辑器（`BlinkoEditor/index.tsx:205,242` 硬编码 `id='global-editor'` + `getElementById`，需先改 ref）
- 拖拽排序（与时间线互斥）
- 任何新功能模块