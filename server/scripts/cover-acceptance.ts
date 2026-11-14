/**
 * 封面真实出图验收。
 *
 * 单元测试只能证明「程序逻辑对」，证明不了「模型真的照做」——
 * 模型画出来的底色可能是暖粉、蜜桃色，可能在砖里嵌底板，可能画出照片。
 * 这些都要用真的模型跑一遍才知道。
 *
 * 用法（要在 server 目录下跑，sharp 与 prisma 才解析得到）：
 *   cd server && bun --env-file ../.env scripts/cover-acceptance.ts [张数]
 *
 * 每张图都走真实链路：提示词 → 生图 → 抠图与完整性检查 → 合成整张封面。
 * 最后报一行命中率 —— 命中率掉了，说明模型或检查规则该改了。
 *
 * 产物写到 cover-style-preview/acceptance/：raw-*.png 是模型原图，
 * tile-*.png 是抠出来的图标砖，cover-*.png 是最终封面。
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { coverPrompt, generateImageBytes } from "../lib/blogCoverGeneration";
import { prepareCoverIllustration, prepareGeneratedCover } from "../lib/coverIllustration";
import { composeCoverImage } from "../lib/blogCoverComposition";
import { computeCoverTextLayout } from "../../shared/lib/blogCoverText";
import { coverArtPlan } from "../../shared/lib/blogCoverArt";
import { fetchWithProxy } from "../lib/proxy";

const count = Math.max(1, Math.min(8, Number(process.argv[2]) || 4));
const OUT = path.join(process.cwd(), "..", "cover-style-preview", "acceptance");
await mkdir(OUT, { recursive: true });

const db = new PrismaClient();
const models = await db.aiModels.findMany({
  include: { provider: true },
  orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
});
const usable = models.filter(
  (m) => (m.capabilities as any)?.imageGeneration && m.provider.apiKey?.trim(),
);
const model: any = usable.find((m) => /^image-01$/i.test(m.modelKey)) ?? usable[0];
if (!model) {
  console.error("没有配置可用的生图模型，先到 AI 设置里配一个。");
  await db.$disconnect();
  process.exit(1);
}
console.log(`模型：${model.title}（${model.modelKey}），跑 ${count} 张`);

const cases = [
  { title: "推荐系统召回改造", subtitle: "一次上线，三段召回" },
  { title: "把工作复盘写成方法", subtitle: "从经验到可复用" },
  { title: "阅读笔记整理法", subtitle: "读完之后才算读过" },
  { title: "AI 工具箱", subtitle: "每天省下的两小时" },
  { title: "高效工作流", subtitle: "一个能照着做的流程" },
  { title: "产品需求拆解", subtitle: "从一句话到方案" },
  { title: "数据指标复盘", subtitle: "看得见的增长" },
  { title: "搜索推荐实践", subtitle: "召回与排序" },
];

const fetcher = await fetchWithProxy();
let ai = 0, standard = 0;
for (const item of cases.slice(0, count)) {
  const prompt = coverPrompt(item.title, item.subtitle, "ink");
  const raw = await generateImageBytes(model, prompt, fetcher);
  await sharp(raw).png().toFile(path.join(OUT, `raw-${item.title}.png`));
  const plan = coverArtPlan(item.title, item.subtitle);
  const { image, generationMode } = await prepareGeneratedCover(raw, {
    theme: plan.theme,
    overlayPalette: plan.overlayPalette,
  });
  if (generationMode !== "ai") {
    try {
      await prepareCoverIllustration(raw, { kind: "tile", background: "chroma" });
    } catch (error) {
      console.log(`     ↳ 没过的原因：${(error as Error).message}`);
    }
  }
  if (generationMode === "ai") ai++;
  else standard++;
  await sharp(image).png().toFile(path.join(OUT, `tile-${item.title}.png`));
  const layout = computeCoverTextLayout({
    containerWidth: 1600,
    containerHeight: 571,
    placement: "double",
    title: item.title,
  });
  const cover = await composeCoverImage({
    base: image,
    layout,
    title: item.title,
    subtitle: item.subtitle,
    artwork: "tile",
    canvasWidth: 1600,
    canvasHeight: 571,
    palette: plan.overlayPalette,
    align: "left",
  });
  await sharp(cover).png().toFile(path.join(OUT, `cover-${item.title}.png`));
  console.log(`  ${item.title} → ${generationMode === "ai" ? "AI 图标砖" : "标准图标砖（模型这张没过检查）"}`);
}
console.log(`\n命中率：AI 图标砖 ${ai}/${count}，回落标准砖 ${standard}/${count}`);
console.log(`产物：${OUT}`);
await db.$disconnect();
