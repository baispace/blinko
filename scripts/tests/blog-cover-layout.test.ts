import { describe, test, expect } from "bun:test";
import sharp from "sharp";
import {
  COVER_SAFE,
  COVER_SOURCE,
  clampCoverFocus,
  coverFocusFromDrag,
  coverFocusRange,
  coverPlacements,
  coverSafeRect,
  coverWindow,
  defaultCoverFocus,
  normalizeCoverFocus,
  readCoverFocus,
} from "../../shared/lib/blogCover";
import { composeCoverImage } from "../../server/lib/blogCoverComposition";
import { computeCoverTextLayout } from "../../shared/lib/blogCoverText";

describe("封面安全区域", () => {
  test("源图 1600×900，核心内容区是居中的 1280×450", () => {
    expect([COVER_SOURCE.width, COVER_SOURCE.height]).toEqual([1600, 900]);
    expect([COVER_SAFE.width, COVER_SAFE.height]).toEqual([1280, 450]);
    expect(coverSafeRect.left).toBe(160);
    expect(coverSafeRect.top).toBe(225);
    // 左右上下留白一样宽
    expect(coverSafeRect.left).toBe(
      COVER_SOURCE.width - coverSafeRect.left - coverSafeRect.width,
    );
    expect(coverSafeRect.top).toBe(
      COVER_SOURCE.height - coverSafeRect.top - coverSafeRect.height,
    );
  });

  test("三个展示位的比例就是公开站实际在用的比例", () => {
    expect(coverPlacements.double.ratio).toBe(2.8);
    expect(coverPlacements.single.ratio).toBe(16 / 9);
    expect(coverPlacements.banner.ratio).toBe(2.9);
  });

  test("裁切范围保证核心内容区完整可见", () => {
    for (const placement of Object.values(coverPlacements)) {
      const win = coverWindow(placement.ratio);
      const range = coverFocusRange(placement.ratio);
      for (const percent of [range.x.min, range.x.max, range.y.min, range.y.max]) {
        expect(percent).toBeGreaterThanOrEqual(0);
        expect(percent).toBeLessThanOrEqual(100);
      }
      // 取范围两端都验一遍：可见窗口必须把安全区整个包住。
      for (const y of [range.y.min, range.y.max]) {
        for (const x of [range.x.min, range.x.max]) {
          const left = win.slackX > 0 ? (win.slackX * x) / 100 : 0;
          const top = win.slackY > 0 ? (win.slackY * y) / 100 : 0;
          expect(left).toBeLessThanOrEqual(coverSafeRect.left + 0.001);
          expect(top).toBeLessThanOrEqual(coverSafeRect.top + 0.001);
          expect(left + win.width).toBeGreaterThanOrEqual(coverSafeRect.right - 0.001);
          expect(top + win.height).toBeGreaterThanOrEqual(coverSafeRect.bottom - 0.001);
        }
      }
    }
  });

  test("16:9 的展示位与源图同比例，裁切位置锁死在居中", () => {
    const range = coverFocusRange(coverPlacements.single.ratio);
    expect(range.x.min).toBe(50);
    expect(range.x.max).toBe(50);
    expect(range.y.min).toBe(50);
    expect(range.y.max).toBe(50);
  });

  test("拖到范围外的位置会被夹回安全范围", () => {
    const clamped = clampCoverFocus(coverPlacements.double.ratio, {
      x: 999,
      y: -50,
    });
    const range = coverFocusRange(coverPlacements.double.ratio);
    expect(clamped.x).toBe(range.x.max);
    expect(clamped.y).toBe(range.y.min);
    expect(clampCoverFocus(coverPlacements.single.ratio, undefined)).toEqual(
      defaultCoverFocus,
    );
  });

  test("脏数据一律回落到居中", () => {
    expect(normalizeCoverFocus(null)).toBe(null);
    expect(normalizeCoverFocus("nope")).toBe(null);
    const dirty = normalizeCoverFocus({
      sourceId: "x",
      placements: { double: { x: "a", y: 1 }, single: { x: 50, y: 50 } },
    });
    expect(dirty?.sourceId).toBe(null);
    expect(dirty?.placements.double).toBe(undefined);
    expect(dirty?.placements.single).toEqual({ x: 50, y: 50 });
  });

  test("没调过的展示位读出来就是居中", () => {
    expect(readCoverFocus(null, "double")).toEqual(defaultCoverFocus);
    // Banner 比源图宽，横向没有可调空间，只有纵向能挪。
    expect(
      readCoverFocus(
        { sourceId: 1, placements: { banner: { x: 40, y: 60 } } },
        "banner",
      ),
    ).toEqual({ x: 50, y: 60 });
    expect(readCoverFocus({ sourceId: 1, placements: {} }, "double")).toEqual(
      defaultCoverFocus,
    );
  });

  test("拖动换算：把图往上拖，露出更多下方背景", () => {
    // 2.8:1 的框宽 462、高 165，可见窗口是源图里的 1600×571。
    const win = coverWindow(2.8);
    expect(win.width).toBe(1600);
    expect(Math.round(win.height)).toBe(571);
    // 往上拖 20px（dy 为负）→ 百分比变大（窗口往下移）
    const up = coverFocusFromDrag(2.8, { x: 50, y: 50 }, 0, -20, 462, 165);
    expect(up.y).toBeGreaterThan(50);
    // 往下拖 20px → 百分比变小
    const down = coverFocusFromDrag(2.8, { x: 50, y: 50 }, 0, 20, 462, 165);
    expect(down.y).toBeLessThan(50);
    // 拖到头也不会越过安全范围
    const far = coverFocusFromDrag(2.8, { x: 50, y: 50 }, 0, 9999, 462, 165);
    const range = coverFocusRange(2.8);
    expect(far.y).toBe(range.y.min);
    // 16:9 的框没有余量，拖了也不动
    const locked = coverFocusFromDrag(16 / 9, { x: 50, y: 50 }, 30, 30, 462, 260);
    expect(locked).toEqual({ x: 50, y: 50 });
  });
});

describe("封面文字层合成", () => {
  const base = sharp({
    create: {
      width: 1600,
      height: 900,
      channels: 3,
      background: "#4930e8",
    },
  })
    .png()
    .toBuffer();

  /** 找出画面里的近白像素（就是排上去的标题与副标题）。 */
  async function whiteBounds(buffer: Buffer) {
    const { data, info } = await sharp(buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    let minX = info.width;
    let maxX = -1;
    let minY = info.height;
    let maxY = -1;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * info.channels;
        if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { minX, maxX, minY, maxY, info };
  }

  test("文字落在画布内的文字列里，不越界", async () => {
    const layout = computeCoverTextLayout({
      containerWidth: 1600,
      containerHeight: 900,
      placement: "double",
      title: "召回三段式改造",
      subtitle: "先校准分数再融合",
    });
    const out = await composeCoverImage({
      base: await base,
      layout,
      canvasWidth: 1600,
      canvasHeight: 900,
      palette: "violet",
      align: "left",
    });
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([1600, 900]);
    const bounds = await whiteBounds(out);
    expect(bounds.maxX).toBeGreaterThan(0);
    expect(bounds.minX).toBeGreaterThanOrEqual(0);
    expect(bounds.maxX).toBeLessThanOrEqual(1600);
    expect(bounds.maxY).toBeLessThanOrEqual(900);
    // 文字列宽度上限：标题不会跑到右侧插画那边去。
    expect(bounds.maxX).toBeLessThanOrEqual(layout.maxWidth);
  });

  test("有置顶角标时，标题让开左上角那块", async () => {
    const layout = computeCoverTextLayout({
      containerWidth: 1600,
      containerHeight: 900,
      placement: "double",
      title: "短标题",
      badge: true,
    });
    const out = await composeCoverImage({
      base: await base,
      layout,
      canvasWidth: 1600,
      canvasHeight: 900,
      palette: "slate",
      align: "left",
    });
    const { data, info } = await sharp(out)
      .raw()
      .toBuffer({ resolveWithObject: true });
    // 角标区（左上 300×150）里不能有白字
    for (let y = 0; y < 150; y++) {
      for (let x = 0; x < 300; x++) {
        const i = (y * info.width + x) * info.channels;
        expect(data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235).toBe(
          false,
        );
      }
    }
  });

  test("分享图按 1200×630 输出", async () => {
    const layout = computeCoverTextLayout({
      containerWidth: 1200,
      containerHeight: 630,
      placement: "share",
      title: "召回三段式改造",
      subtitle: "先校准分数再融合",
    });
    const out = await composeCoverImage({
      base: await base,
      layout,
      canvasWidth: 1200,
      canvasHeight: 630,
      palette: "violet",
      align: "left",
    });
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 630]);
  });

  test("文字块居中算出来是小数时也不炸（sharp 只收整数偏移）", async () => {
    for (const placement of ["double", "single", "banner", "share"] as const) {
      const width = placement === "share" ? 1200 : 1600;
      const height = placement === "share" ? 630 : 900;
      const layout = computeCoverTextLayout({
        containerWidth: width,
        containerHeight: height,
        placement,
        title: "召回模块协同调优",
        subtitle: "兼顾目标命中、排序质量与长尾曝光",
      });
      const out = await composeCoverImage({
        base: await base,
        layout,
        canvasWidth: width,
        canvasHeight: height,
        palette: "violet",
        align: "left",
      });
      const meta = await sharp(out).metadata();
      expect([meta.width, meta.height]).toEqual([width, height]);
    }
  });
});
