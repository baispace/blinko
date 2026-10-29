/**
 * 把一张底图按站内各展示位合成对照图，用来肉眼检查封面风格。
 *
 * 用法：
 *   bun scripts/preview-cover-scenes.ts <底图路径> <封面大字> [封面小字] [主题色]
 *
 * 例：
 *   bun scripts/preview-cover-scenes.ts cover-style-preview/base-fupan-v10.jpg 复盘笔记 "一次上线，三段召回" slate
 *
 * 产物写到 cover-style-preview/ 下：
 *   preview-<名字>-card.webp    瀑布流卡片 2.8:1（1600×571）
 *   preview-<名字>-banner.webp  首页 Banner 2.9:1（1600×552）
 *   preview-<名字>-row.webp     列表行缩略图 180×96
 *   preview-<名字>-share.webp   社交分享图 1200×630
 *
 * 合成走的是服务端那条路径（composeCoverImage + computeCoverTextLayout），
 * 所以看到的就是导出分享图时的样子 —— 和页面上的文字层同一套排版规则。
 */
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { composeCoverImage } from "../server/lib/blogCoverComposition";
import { computeCoverTextLayout } from "../shared/lib/blogCoverText";

const scenes = [
  { key: "double", width: 1600, height: 571, file: "card" },
  { key: "banner", width: 1600, height: 552, file: "banner" },
  { key: "single", width: 180, height: 96, file: "row" },
  { key: "share", width: 1200, height: 630, file: "share" },
] as const;

const [basePath, title, subtitle = "", palette = "violet"] = process.argv.slice(2);
if (!basePath || !title) {
  console.error("用法：bun scripts/preview-cover-scenes.ts <底图路径> <封面大字> [封面小字] [主题色]");
  process.exit(1);
}
if (!existsSync(basePath)) {
  console.error(`找不到底图：${basePath}`);
  process.exit(1);
}

const name = path.basename(basePath).replace(/\.[^.]+$/, "");
const outDir = path.join(process.cwd(), "cover-style-preview");
// 底图统一成 1600×900（站内所有展示位共用这一张源图）。
const base = await sharp(basePath)
  .resize(1600, 900, { fit: "cover", position: "centre" })
  .webp({ quality: 92 })
  .toBuffer();

for (const scene of scenes) {
  const layout = computeCoverTextLayout({
    containerWidth: scene.width,
    containerHeight: scene.height,
    placement: scene.key,
    title,
    subtitle,
  });
  const buffer = await composeCoverImage({
    base,
    layout,
    canvasWidth: scene.width,
    canvasHeight: scene.height,
    palette,
    align: "left",
  });
  const file = path.join(outDir, `preview-${name}-${scene.file}.webp`);
  await sharp(buffer).toFile(file);
  console.log(
    `${file}  字号 ${layout.fontSize}  标题 ${layout.titleLines.join("/")}  小字 ${
      layout.subtitleLines.join("/") || "（隐藏）"
    }`,
  );
}
