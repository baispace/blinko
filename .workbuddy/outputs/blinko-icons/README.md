# app.blinko.space 图标体系清单

> 来源：https://app.blinko.space/ · 提取于 2026-09-24

## 体系概述

站点使用 **Iconly**（Light-Outline 变体）作为统一图标库，而非直接渲染 Iconify。
任意来源的图标名（含 `prefix:name`）都会经「归一化调度层」解析为 Iconly 图标，以保证全局视觉一致。

| 轨道 | 资源 | 数量 | 加载方式 |
|---|---|---|---|
| 静态 | `assets/iconly/flat/*.svg` | 132 | 按需懒加载分片 |
| 静态 | `IconlyFlatIcon` 分片内联 SVG | 22 | 首屏内联 |
| 动效 | `assets/iconly/actions/*.json` | 76 | Lottie 懒加载 |
| 动效 | `assets/iconly/ai/*.json` | 4 | Lottie 懒加载 |
| 动效 | `assets/iconly/waiting/*.json` | 3 | Lottie 懒加载 |

## 三层映射 + 归一化

- **导航层（7）**：`blinko` `notes` `ai` `analytics` `resources` `marketplace` `trash`
- **语义层（96）**：如 `settings→settings`、`delete→trash`、`alert→warning`、`ai→ai-flat`
- **品牌层（25）**：`mdi:github→brand-github`、`logos:notion-icon→brand-notion`、`simple-icons:openai→brand-openai` …
- **归一化函数**：对 `prefix:name` 做关键词降级匹配（chevron→方向、spark/magic/brain→ai、hash→hashtag…），无法识别回落 `info`

## flat 资源清单（132）

`activity`, `add`, `ai-flat`, `analytics`, `archive`, `arrow-down`, `arrow-left`, `arrow-right`, `arrow-up`, `arrow-up-down`, `arrow-up-right`, `at`, `audio`, `billing`, `bookmark`, `brand-apple`, `brand-brave`, `brand-coinbase`, `brand-discord`, `brand-evernote`, `brand-facebook`, `brand-github`, `brand-google`, `brand-googlekeep`, `brand-instagram`, `brand-joplin`, `brand-line`, `brand-markdown`, `brand-microsoftonenote`, `brand-notion`, `brand-obsidian`, `brand-openai`, `brand-roamresearch`, `brand-slack`, `brand-spotify`, `brand-twitch`, `brand-x`, `calendar`, `camera`, `chat`, `chat-add`, `check`, `check-circle`, `chevron-down`, `chevron-left`, `chevron-right`, `chevron-up`, `circle`, `clock`, `close`, `cloud`, `cloud-upload`, `code`, `collapse-diagonal`, `compass`, `copy`, `crown`, `database`, `discount`, `document`, `download`, `edit`, `edit-square`, `editor-bold`, `editor-fill`, `editor-italic`, `editor-list-bullet`, `editor-list-number`, `editor-strike`, `editor-underline`, `expand-diagonal`, `eye`, `eye-off`, `file`, `file-add`, `file-download`, `file-fail`, `file-minus`, `file-upload`, `filter`, `folder`, `game`, `grid`, `hashtag`, `heart`, `history`, `home`, `image`, `info`, `key`, `keyboard`, `language`, `lightning`, `link`, `loading`, `location`, `logout`, `menu`, `message`, `microphone`, `more`, `notification`, `palette`, `paperclip`, `pause`, `phone`, `pin`, `play`, `refresh`, `scan`, `search`, `send`, `settings`, `share`, `shield-check`, `shield-off`, `sidebar`, `status-dot`, `stop`, `tag`, `ticket`, `transfer`, `trash`, `unlock`, `update`, `upload`, `user`, `user-add`, `verified`, `view`, `warning`, `world`

## 动画图标清单（83）

### actions（76）

`add`, `alert`, `apps`, `archive`, `arrow-right`, `billing`, `bookmark`, `calendar`, `camera`, `chat`, `chat-add`, `check`, `clock`, `close`, `cloud`, `companion`, `computer`, `crown`, `dark`, `database`, `document`, `download`, `edit`, `expand`, `export`, `eye`, `filter`, `folder`, `grid`, `heart`, `help`, `home`, `image`, `import`, `info`, `key`, `keyboard`, `language`, `light`, `lightning`, `link`, `list`, `logout`, `marketplace`, `menu`, `microphone`, `music`, `notification`, `palette`, `pause`, `pin`, `play`, `plugin`, `pushpin`, `refresh`, `search`, `send`, `settings`, `share`, `shield`, `sidebar`, `smile`, `star`, `stop`, `tag`, `tools`, `upload`, `user`, `users`, `video`, `view`, `view-grid`, `view-list`, `wallet`, `warning`, `world`

### ai（4）

`read`, `search`, `sparkles`, `write`

### waiting（3）

`food`, `pizza`, `tea`
