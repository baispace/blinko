/**
 * 生成 Jomio 桌面端应用图标源文件。
 *
 *   bun scripts/build-jomio-app-icon.mjs
 *
 * 为什么要有这个脚本：桌面端图标曾经长期是「蓝青渐变 + 文本光标」那套，
 * 而站点早已重做成紫色的 J 标记 —— 两边各画各的，图标就悄悄漂了。
 * 路径数据直接取自 app/src/components/Common/Brand/brandGeometry.ts（品牌唯一来源），
 * 标记改了重跑一次即可，不会再漂。
 *
 * 落位说明：方块与圆角沿用原桌面端图标的比例（1024 画布里留 64 边距、
 * 圆角 208），J 在方块里的相对尺寸与站点 app-icon.svg 完全一致
 * （方块宽的 46.4%、高的 72.5%），只是整体放大到 macOS 图标的留白里。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  BRAND_PATH_BODY,
  BRAND_PATH_FRAGMENT,
} from "../app/src/components/Common/Brand/brandGeometry";

/** 品牌紫：站点 favicon / app-icon / manifest theme_color 用的是同一个值。 */
const BRAND_PURPLE = "#5F40FD";

const CANVAS = 1024;
const MARGIN = 64;
const SQUARE = CANVAS - MARGIN * 2;
const CORNER = 208;

/** 站点 app-icon.svg 的几何：171 视窗、方块满窗、J 用 translate(45.8 24) scale(1.24)。 */
const SITE_VIEWBOX = 171;
const SITE_SCALE = 1.24;
const SITE_OFFSET_X = 45.8;
const SITE_OFFSET_Y = 24;

const ratio = SQUARE / SITE_VIEWBOX;
const markScale = SITE_SCALE * ratio;
const markX = MARGIN + SITE_OFFSET_X * ratio;
const markY = MARGIN + SITE_OFFSET_Y * ratio;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <!-- Jomio 桌面端图标：站点品牌（紫底 + J 标记）落进 macOS 图标的留白里。
       由 scripts/build-jomio-app-icon.mjs 生成 —— 路径数据取自
       app/src/components/Common/Brand/brandGeometry.ts，不要手工改。 -->
  <rect x="${MARGIN}" y="${MARGIN}" width="${SQUARE}" height="${SQUARE}" rx="${CORNER}" fill="${BRAND_PURPLE}"/>
  <g transform="translate(${markX.toFixed(2)} ${markY.toFixed(2)}) scale(${markScale.toFixed(5)})" fill="#FFFFFF">
    <path d="${BRAND_PATH_FRAGMENT}"/>
    <path d="${BRAND_PATH_BODY}"/>
  </g>
</svg>
`;

const outDir = join(import.meta.dir, "../app/src-tauri/icons/jomio");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "source.svg");
writeFileSync(outFile, svg);
console.log(`已生成 ${outFile}`);
console.log(`  J 标记 scale=${markScale.toFixed(5)} translate=(${markX.toFixed(2)} ${markY.toFixed(2)})`);
console.log(`  J 在方块内占 ${((64 * markScale) / SQUARE * 100).toFixed(1)}% 宽、${((100 * markScale) / SQUARE * 100).toFixed(1)}% 高`);
