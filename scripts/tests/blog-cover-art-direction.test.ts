import { describe, expect, test } from "bun:test";
import { coverArtPlan, preferCoverModels, COVER_ART_VERSION } from "../../shared/lib/blogCoverArt";

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
      expect(plan.composition).toContain("anchored to the RIGHT");
      expect(plan.composition).toContain("LEFT 38%");
    }
  });
  test("standard model is preferred without mutating config or reordering other models", () => {
    const models = [{modelKey:"image-01-live"}, {modelKey:"custom"}, {modelKey:"image-01"}];
    expect(preferCoverModels(models).map(m => m.modelKey)).toEqual(["image-01", "image-01-live", "custom"]);
    expect(models[0].modelKey).toBe("image-01-live");
  });
});
