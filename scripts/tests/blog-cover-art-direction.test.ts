import { describe, expect, test } from "bun:test";
import { coverArtPlan, preferCoverModels, COVER_ART_VERSION } from "../../shared/lib/blogCoverArt";
import { coverPrompt } from "../../server/lib/blogCoverGeneration";

describe("cover art direction", () => {
  test.each([
    ["推荐系统召回改造", "retrieval", "results panel"],
    ["把工作复盘写成可复用的方法", "review", "checklist"],
    ["阅读笔记", "reading", "book"],
    ["我的 AI 工作流", "ai", "workflow"],
    ["埋点指标与实验分析", "data", "analytics"],
    ["产品需求拆解", "product", "document"],
  ])("%s chooses a meaningful main object", (title, theme, object) => {
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
    expect(coverArtPlan("阅读笔记", "").overlayPalette).toBe("blue");
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
      // 哑光质感 + 主体压右、左侧留白给站点叠标题，这两条是参考封面的共同点。
      expect(plan.treatment).toContain("Clean 3D app-icon illustration");
      expect(plan.subject).toContain("white");
      expect(plan.composition).toContain("RIGHT EDGE");
      expect(plan.composition).toContain("LEFT HALF");
    }
  });
  test("构图规则写在提示词最前面，并在收尾再重申一次", () => {
    /*
     * 生图模型对提示词位置极其敏感：同一条构图规则放在契约中段时，
     * 构图合格率只有 1/3，提到最前面变成 2/3，前面一次收尾再重申一次是 3/3。
     * 这条测试盯住的就是这个位置契约。
     */
    const prompt = coverPrompt("阅读笔记", "读书笔记正文");
    const first = prompt.indexOf("pushed to the RIGHT EDGE");
    const last = prompt.lastIndexOf("pushed to the RIGHT EDGE");
    expect(first).toBeGreaterThan(0);
    // 至少出现两次：最前面一次，收尾一次。
    expect(last).toBeGreaterThan(first);
    // 排在配色与主体之前 —— 风格描述会稀释它。
    expect(first).toBeLessThan(prompt.indexOf("Palette:"));
    // 服务商上限 1500 字符，超了是静默截断，硬约束尾巴会被砍掉。
    expect(prompt.length).toBeLessThan(1500);
    expect(prompt.trimEnd().endsWith("禁止：低饱和粉紫摄影棚。")).toBe(true);
  });

  test("standard model is preferred without mutating config or reordering other models", () => {
    const models = [{modelKey:"image-01-live"}, {modelKey:"custom"}, {modelKey:"image-01"}];
    expect(preferCoverModels(models).map(m => m.modelKey)).toEqual(["image-01", "image-01-live", "custom"]);
    expect(models[0].modelKey).toBe("image-01-live");
  });
});
