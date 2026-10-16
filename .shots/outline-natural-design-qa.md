# 大纲 UI 与交互视觉检查

## 比较对象与范围

- source visual truth path: `.shots/outline-effie-reference.png`，用户提供的 Effie 截图，未改动原图。
- implementation screenshot path: `.shots/outline-natural-desktop.jpg`。
- full-view and focused comparison evidence: `.shots/outline-natural-comparison.jpg`，参考图与实现同时展示，底部为收起圆点和文字间距的局部对照。
- viewport: 桌面 1020 × 804 CSS px；窄屏 390 × 844 CSS px。
- density normalization: 源图 2040 × 1608 px，源图实际 DPR 未提供；为比较按 2:1 显示为 1020 × 804。实现桌面截图 1020 × 804 px，1:1 CSS 尺寸。对照页两列再等比例缩小。截图沿用浏览器返回的 JPEG 编码，未做图像重绘。
- state: 浅色，第一条大纲展开，第 3、5、6 条收起；悬停时显示切换导图图标。阅读、深色和窄屏另有截图。
- implementation: 使用实际 OutlineList、OutlineItem、OutlineReader 组件和完整 tiptap.css / outline.css 的隔离页面。页面顶部的编辑/阅读/主题入口仅用于验证。未创建、修改真实笔记。

## Findings

当前没有未解决的 P0/P1/P2 问题。

- 大纲外框、常驻标题、工具栏分隔线已移除，使用现有正文的字体和行高。
- 切换导图入口为 16px 标准 Material Design Icons 图标。悬停、编辑焦点和键盘焦点下可发现，位置避开首行文字；触屏规则保留入口。
- 圆点为 6px，点击区域为真正的 24 × 24 正方形。展开时只显示圆点，收起时增加淡圆环；悬停、按下有轻微反馈。
- 子列表的缩进推进 34px，细引导线与父圆点对齐。完整样式下没有第二颗装饰圆点或文字重叠。
- 折叠采用 190ms 高度、透明度及留白过渡，内容一直保留在文档中；快速反转会取消前一次动画并从当前位置继续。
- 关闭分支在动画期间设为 inert，防止光标进入正在隐藏的子项；动画结束清理临时样式。
- 思维导图改为轻文字、细分支和下划线式节点，延续正文视觉。大型导图在内部横向滚动。

## Required Fidelity Surfaces

- Fonts and typography: 保留 Blinko 正文 16px、1.625 行高及系统中文字体。大纲不建立单独字体系统。参考图的语法着色、Markdown 标记和行号属于 Effie 全编辑器功能，未引入本次组件；这是保持博客正文一致性的有意差异。
- Spacing and layout: 根条目文字缩进 28px，层级推进 34px，条目间距 7px；去除旧卡片内边距。长句按当前正文宽度自然换行。外部页边距、预览标题区域不作为大纲组件差异。
- Colors and tokens: 圆点和线条从 currentColor 派生，焦点颜色使用现有 primary。深色截图确认没有固定浅色卡片底或过亮边框。
- Image quality and assets: 参考组件不包含需生成的位图资产。导图入口使用安装包内 graph-outline 的原始图标数据，列表入口使用现有本地图标集合。没有占位图片、字符假图标或自绘插画。
- Copy and content: 用户笔记正文未自动改写。新增固定文案仅为清晰的切换/折叠辅助标签与提示，演示内容只用于隔离验证。

## Comparison History

1. 初版捕获 `.shots/outline-natural-initial.jpg`：无框结构、圆点和缩进已形成，发现导图入口使用的 connection 图标像插头，核心操作语义不够明确（P2）。
2. 修复：替换为本地标准 graph-outline 图标，并将入口移入首行上方留白；移除预览的额外正文间距覆盖，使最终证据展示真实编辑样式。
3. 修复后证据 `.shots/outline-natural-desktop.jpg` 与 `.shots/outline-natural-comparison.jpg`：入口语义明确，无外框和固定标题；圆点、折叠环及文字间距对照通过。不存在遗留 P0/P1/P2。

## Interaction Verification

在 Codex 内置浏览器实际操作：

- 点击根圆点折叠、展开，子项恢复完整。
- 对根圆点连续双击 3 轮，文档 DOM 文本保持一致；结束时 0 个动画临时标记，无额外列表 marker，按钮宽高相等，外框为 0px。
- 在子项目2末尾 Enter 新增条目并输入文字，Tab 缩进、Shift+Tab 提升，页面树形层级正确变化。
- 列表切换为导图再切回，已收起的分支状态保留。
- 阅读页展开与折叠正常；这些展示操作保持本地状态，不修改源笔记。
- 浅/深色和窄屏查看。390px 视口页面 scrollWidth=clientWidth=390，没有页面级横向溢出；圆点仍为 24 × 24。
- 浏览器 error/warn 日志为空。
- 完整前端构建成功；全量 TypeScript 检查仍有项目既有错误，本次 outline/outlinePresentation/OutlineReader 文件无错误。

## Follow-up Polish / Test Limits

- prefers-reduced-motion 已在动画函数和 CSS 实现；本轮没有切换系统级偏好。
- 本轮验证覆盖真实组件与样式的隔离页面，未覆盖登录与业务自动保存的全流程；原有 Markdown 持久化结构未改变。

## Implementation Checklist

- [x] 内嵌正文、无外框及固定标题。
- [x] 圆形圆点、悬停/按下/收起反馈。
- [x] 可取消、可反转的折叠动画。
- [x] 编辑与阅读视觉一致。
- [x] 导图、深色、窄屏验证。
- [x] 同输入中的完整与局部参考图比较。
- [x] 构建验证及证据保存。

final result: passed
