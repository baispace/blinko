import { describe, test, expect } from "bun:test";
import {
  coverArtifactFor,
  coverPrompt,
  coverIllustrationPrompt,
} from "../../server/lib/blogCoverGeneration";

/**
 * 站内所有生图入口共用同一份契约。
 *
 * 入口只负责说清自己要什么产物（coverArtifactFor），
 * 形态决定提示词与后处理；两条路都不许模型在图里写字。
 */
describe("封面生成入口的契约", () => {
  test("文章封面要图标砖，独立配图要插画", () => {
    expect(coverArtifactFor("article")).toBe("icon-tile");
    expect(coverArtifactFor("asset")).toBe("illustration");
  });

  test("两种形态都不让模型写字", () => {
    const icon = coverPrompt("阅读笔记", "正文");
    const illustration = coverIllustrationPrompt("阅读笔记", "正文");
    expect(icon).toContain("No text");
    expect(icon).toContain("exactly one glyph");
    expect(illustration).toContain("NO text");
    expect(illustration).toContain("NO TEXT");
  });

  test("图标砖走正方形画幅与单色符号，插画走单一主体与留白", () => {
    const icon = coverPrompt("阅读笔记", "正文");
    expect(icon).toContain("ONE rounded-square app icon tile");
    expect(icon).toContain("solid magenta (#FF00FF)");
    const illustration = coverIllustrationPrompt("阅读笔记", "正文");
    expect(illustration).toContain("ONE hero subject only");
    expect(illustration).toContain("left third calm");
  });

  test("两条提示词都在服务商上限之内", () => {
    expect(coverPrompt("标".repeat(80), "内容".repeat(1000)).length).toBeLessThanOrEqual(1500);
    expect(coverIllustrationPrompt("标".repeat(80), "内容".repeat(1000)).length).toBeLessThanOrEqual(1500);
  });
});
