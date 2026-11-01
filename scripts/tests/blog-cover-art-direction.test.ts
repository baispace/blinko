import { describe, expect, test } from "bun:test";
import { coverArtPlan, preferCoverModels, COVER_ART_VERSION } from "../../shared/lib/blogCoverArt";
import { coverPrompt, imageRequest } from "../../server/lib/blogCoverGeneration";

describe("cover art direction", () => {
  test.each([
    ["推荐系统召回改造", "retrieval", "magnifying glass"],
    ["把工作复盘写成可复用的方法", "review", "clipboard"],
    ["阅读笔记", "reading", "book"],
    ["我的 AI 工作流", "ai", "sparkle"],
    ["埋点指标与实验分析", "data", "bar chart"],
    ["产品需求拆解", "product", "document"],
  ])("%s chooses a meaningful icon", (title, theme, object) => {
    const plan = coverArtPlan(title, "");
    expect(plan.theme).toBe(theme);
    expect(plan.subject).toContain(object);
    expect(plan.version).toBe(COVER_ART_VERSION);
  });
  test("title intent beats incidental repeated body keywords; results are reproducible", () => {
    const first = coverArtPlan("阅读笔记", "推荐数据模型".repeat(500));
    expect(first.theme).toBe("reading");
    expect(coverArtPlan("阅读笔记", "推荐数据模型".repeat(500))).toEqual(first);
  });
  test("overlay follows the new base palette instead of always violet", () => {
    expect(coverArtPlan("工作复盘", "").overlayPalette).toBe("slate");
    expect(coverArtPlan("阅读笔记", "").overlayPalette).toBe("orange");
    expect(coverArtPlan("AI 工作流", "").overlayPalette).toBe("violet");
  });
  test("plan metadata and prompt context use identical whitespace and title limits", () => {
    const title = "阅读\n笔记" + "文字".repeat(100) + "推荐召回".repeat(20);
    expect(coverArtPlan(title, "some\ncontent")).toEqual(coverArtPlan(title.replace(/\s+/g, " ").slice(0,80), "some content"));
  });
  test("unknown subjects use a purposeful document rather than random shapes", () => {
    expect(coverArtPlan("一些想法", "").theme).toBe("product");
  });
  test("one visual treatment preserves theme variation", () => {
    const plans = ["阅读笔记", "工作复盘", "AI 工具", "高效工作流"].map(t => coverArtPlan(t, ""));
    expect(new Set(plans.map(p => p.treatment)).size).toBe(1);
    expect(new Set(plans.map(p => p.palette)).size).toBe(4);
    expect(plans[3].theme).toBe("workflow");
    expect(plans[3].overlayPalette).toBe("teal");
    expect(plans[1].overlayPalette).toBe("slate");
  });
  test("参考封面里的五类内容各自命中主题", () => {
    // 站内参考封面：AI 工作流 / 产品方法 / 复盘笔记 / AI 工具箱 / 高效工作流。
    expect(coverArtPlan("AI 工作流", "").theme).toBe("ai");
    expect(coverArtPlan("产品方法", "").theme).toBe("product");
    expect(coverArtPlan("复盘笔记", "").theme).toBe("review");
    expect(coverArtPlan("AI 工具箱", "").theme).toBe("ai");
    expect(coverArtPlan("高效工作流", "").theme).toBe("workflow");
  });
  test("风格契约与构图契约对所有主题一致，并写进方案", () => {
    const plans = ["阅读笔记", "工作复盘", "AI 工具", "高效工作流"].map(t => coverArtPlan(t, ""));
    for (const plan of plans) {
      /*
       * 第二版契约：模型只画一枚单色 2D 线稿图标。
       * 背景、大字、方块、位置全部由程序排 —— 模型画的越多，波动越大。
       */
      expect(plan.treatment).toContain("Digital app-icon graphic");
      expect(plan.composition).toContain("isolated app-icon symbol");
      expect(plan.composition).toContain("#FF00FF");
      expect(plan.subject).toContain("one ");
    }
  });
  test("构图规则写在提示词最前面，并在收尾再重申一次", () => {
    /*
     * 生图模型对提示词位置极其敏感：同一条构图规则放在契约中段时，
     * 构图合格率只有 1/3，提到最前面变成 2/3，前面一次收尾再重申一次是 3/3。
     * 这条测试盯住的就是这个位置契约。
     */
    const prompt = coverPrompt("阅读笔记", "读书笔记正文");
    const first = prompt.indexOf("Layout rule:");
    const last = prompt.lastIndexOf("Layout rule again:");
    expect(first).toBeGreaterThan(0);
    // 至少出现两次：最前面一次，收尾一次。
    expect(last).toBeGreaterThan(first);
    // 排在配色与主体之前 —— 风格描述会稀释它。
    expect(first).toBeLessThan(prompt.indexOf("Accent color:"));
    // 服务商上限 1500 字符，超了是静默截断，硬约束尾巴会被砍掉。
    expect(prompt.length).toBeLessThan(1500);
    expect(prompt.trimEnd().endsWith("禁止：低饱和粉紫摄影棚。")).toBe(true);
  });
  test("提示词只要求一枚图标，不许模型画场景与配角", () => {
    const prompt = coverPrompt("阅读笔记", "读书笔记正文");
    expect(prompt).toContain("saturated solid color");
    expect(prompt).toContain("exactly one glyph");
    expect(prompt).toContain("no supporting pieces");
    expect(prompt).toContain("Digital app-icon graphic");
  });

  test("standard model is preferred without mutating config or reordering other models", () => {
    const models = [{modelKey:"image-01-live"}, {modelKey:"custom"}, {modelKey:"image-01"}];
    expect(preferCoverModels(models).map(m => m.modelKey)).toEqual(["image-01", "image-01-live", "custom"]);
    expect(models[0].modelKey).toBe("image-01-live");
  });
});

test("icon generation uses a square canvas instead of wasting pixels on a wide cover", () => {
 const provider={provider:"minimax",apiKey:"fixture",baseURL:"https://example.com/v1"};
 expect(imageRequest({modelKey:"image-01",capabilities:{imageGeneration:true},provider} as any,"icon").body.aspect_ratio).toBe("1:1");
});
