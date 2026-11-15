#!/usr/bin/env node
/**
 * prepare-tailwind-sources.mjs — 把 HeroUI 主题的类名源准备好，让 Tailwind 能扫到。
 *
 * 背景：HeroUI 的组件样式不是写在组件里的，而是由 @heroui/theme 里的
 * tailwind-variants 类名生成 —— 例如输入框 label 浮起来的
 * `group-data-[filled-within=true]:-translate-y-[calc(...)]`。
 * Tailwind 只认识它扫到的类名，所以 globals.css 里必须 @source 指向主题的 dist，
 * 扫不到就没有这些规则。
 *
 * 为什么不能写死一个路径：
 *   依赖布局随包管理器版本而变。
 *     本地 Bun 1.4（isolated 布局）→ app/node_modules/@heroui/theme 是软链
 *     CI 镜像 Bun 1.2.8（hoisted 布局）→ 依赖在仓库根 node_modules/@heroui/theme
 *   globals.css 里写死 app/node_modules 时，CI 扫不到任何 HeroUI 类名，
 *   产出的 CSS 会从 311KB 缩到 22KB，group-data-[...] 状态样式静默失效 ——
 *   线上表现是输入框的 label 压在输入值上面，看起来像「文字重叠了」。
 *   这种坏法不报错、不构建失败，只是少了几千行 CSS，很难一眼看出。
 *
 * 做法：把主题 dist 复制到仓库内的固定位置，@source 只认这一个路径。
 *   复制而不是软链 —— 软链在打包、跨平台、权限受限的环境里容易断。
 *   3MB 的复制成本远低于「样式静默丢失」的代价。
 *
 * 用法：node scripts/prepare-tailwind-sources.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const appDir = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(appDir, '..');
/** globals.css 里 @source 指向的就是这个目录（相对 app/src/styles/globals.css） */
const outDir = path.join(appDir, '.tailwind-src', 'heroui');

/**
 * 定位主题的 dist。
 *
 * 先让 Node 按自己的解析规则找（最准，能穿过 bun 的 .bun store 软链），
 * 再兜底常见布局 —— Node 解析失败时也不至于直接放弃。
 */
function resolveThemeDist() {
  const candidates = [];
  try {
    const require = createRequire(path.join(appDir, 'package.json'));
    const pkg = require.resolve('@heroui/theme/package.json');
    candidates.push(path.join(path.dirname(pkg), 'dist'));
  } catch {
    /* 主题没装或 exports 不暴露 package.json，走下面的兜底 */
  }
  candidates.push(path.join(appDir, 'node_modules', '@heroui', 'theme', 'dist'));
  candidates.push(path.join(repoRoot, 'node_modules', '@heroui', 'theme', 'dist'));

  for (const dir of candidates) {
    // 用 components/input.js 认准是「主题本体」而不是同名空目录
    if (fs.existsSync(path.join(dir, 'components', 'input.js'))) return dir;
  }
  return null;
}

const src = resolveThemeDist();
if (!src) {
  console.error(
    '[tailwind-sources] 找不到 @heroui/theme —— HeroUI 的组件样式会整片缺失。\n' +
    '  扫不到主题时 Tailwind 不会报错，只会少生成几千行规则（比如输入框 label 不浮起来）。\n' +
    '  请先在 app/ 下装好依赖再构建。',
  );
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.dirname(outDir), { recursive: true });
fs.cpSync(src, outDir, { recursive: true });

const files = fs.readdirSync(outDir, { recursive: true }).filter((f) => typeof f === 'string');
console.log(`[tailwind-sources] HeroUI 主题类名源已就绪：${path.relative(repoRoot, src)} → ${path.relative(repoRoot, outDir)}（${files.length} 个文件）`);
