import { describe, test, expect } from "bun:test";
import {
  contrastWithWhite,
  darkenForWhiteText,
  relativeLuminance,
} from "../../app/src/lib/coverColor";

type RGB = { r: number; g: number; b: number };

const rgb = (r: number, g: number, b: number): RGB => ({ r, g, b });

describe("封面主色的白字对比度", () => {
  test("相对亮度按 WCAG 定义算，纯白是 1", () => {
    expect(relativeLuminance(rgb(255, 255, 255))).toBeCloseTo(1, 5);
    expect(relativeLuminance(rgb(0, 0, 0))).toBeCloseTo(0, 5);
    // 中灰 128 左右，WCAG 标称 0.2158
    expect(relativeLuminance(rgb(128, 128, 128))).toBeCloseTo(0.2158, 3);
  });

  test("白字压在纯白上对比度是 1，压在黑上是 21", () => {
    expect(contrastWithWhite(rgb(255, 255, 255))).toBeCloseTo(1, 3);
    expect(contrastWithWhite(rgb(0, 0, 0))).toBeCloseTo(21, 3);
  });

  test("已经够深的颜色原样返回，不会被压得没颜色", () => {
    const deep = rgb(54, 24, 191);
    expect(darkenForWhiteText(deep)).toEqual(deep);
    expect(contrastWithWhite(deep)).toBeGreaterThan(4.5);
  });

  test("亮色系主色会被压到白字刚好达标", () => {
    // 黄色：HSL 明度并不高，但相对亮度高，白字读不清
    const yellow = rgb(240, 220, 120);
    expect(contrastWithWhite(yellow)).toBeLessThan(4.5);
    const fixed = darkenForWhiteText(yellow);
    expect(contrastWithWhite(fixed)).toBeGreaterThanOrEqual(4.5);
    // 而且是「尽可能亮」的那一档
    expect(contrastWithWhite(fixed)).toBeLessThan(4.8);
  });

  test("各色系主色压暗后白字都达标", () => {
    const samples = [
      rgb(240, 220, 120), // 黄
      rgb(120, 220, 240), // 青
      rgb(240, 130, 160), // 粉
      rgb(150, 240, 140), // 绿
      rgb(250, 250, 250), // 近白
      rgb(89, 55, 246), // 紫
    ];
    for (const color of samples) {
      const fixed = darkenForWhiteText(color);
      expect(contrastWithWhite(fixed)).toBeGreaterThanOrEqual(4.5);
      // 压暗只会变暗，不会变亮
      expect(relativeLuminance(fixed)).toBeLessThanOrEqual(
        relativeLuminance(color) + 1e-9,
      );
    }
  });

  test("自定义更严的对比度要求也会被满足", () => {
    const fixed = darkenForWhiteText(rgb(240, 220, 120), 7);
    expect(contrastWithWhite(fixed)).toBeGreaterThanOrEqual(7);
  });
});
