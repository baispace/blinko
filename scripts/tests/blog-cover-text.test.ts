import { describe, test, expect } from "bun:test";
import {
  COVER_TEMPLATE_VERSION,
  COVER_TEXT_SAFE_RATIO,
  COVER_TITLE_SCALE_X,
  computeCoverTextLayout,
  coverHasTextLayer,
  coverPaletteColor,
  coverScrimCss,
  coverSceneRules,
  coverTextEmWidth,
  coverTextLines,
  defaultCoverTextConfig,
  normalizeCoverTextConfig,
} from "../../shared/lib/blogCoverText";

/**
 * 封面文字层的排版规则。
 *
 * 这些是纯计算：同样的输入必须给出同样的结果，
 * 页面上的文字层与服务端合成的分享图都读它。
 */

describe("封面文字排版：按容器实际尺寸", () => {
  test("同一个标题在不同容器里字号不同 —— 不是缩放同一张合成图", () => {
    const big = computeCoverTextLayout({
      containerWidth: 640,
      containerHeight: 229,
      placement: "double",
      title: "召回三段式改造",
    });
    const small = computeCoverTextLayout({
      containerWidth: 150,
      containerHeight: 94,
      placement: "single",
      title: "召回三段式改造",
    });
    expect(big.fontSize).toBeGreaterThan(small.fontSize);
    // 小图上的标题不该大到把画面塞满。
    expect(small.fontSize).toBeLessThanOrEqual(94 * 0.4);
  });

  test("列表行缩略图上标题会缩到还能读，且不越出画面", () => {
    const layout = computeCoverTextLayout({
      containerWidth: 150,
      containerHeight: 94,
      placement: "single",
      title: "召回三段式改造",
    });
    expect(layout.fontSize).toBeGreaterThanOrEqual(11);
    expect(layout.top).toBeGreaterThanOrEqual(0);
    expect(layout.top + layout.blockHeight).toBeLessThanOrEqual(94);
    // 标题是压窄后渲染的，宽度要按压窄后的算（与 fitLines 同一套口径）。
    for (const line of layout.titleLines)
      expect(
        coverTextEmWidth(line, COVER_TITLE_SCALE_X) * layout.fontSize,
      ).toBeLessThanOrEqual(layout.maxWidth + 1);
  });

  test("长标题断在词边界，不会把词劈开", () => {
    const layout = computeCoverTextLayout({
      containerWidth: 420,
      containerHeight: 236,
      placement: "single",
      title: "召回模块协同调优",
    });
    expect(layout.titleLines.length).toBeGreaterThanOrEqual(1);
    for (const line of layout.titleLines) expect(line.trim()).not.toBe("");
    // 两行时，拼起来仍然是原标题（没有丢字）。
    expect(layout.titleLines.join("").replace(/\s/g, "")).toBe(
      "召回模块协同调优",
    );
  });

  test("副标题在单栏不出现，在双栏空间够时出现", () => {
    const single = computeCoverTextLayout({
      containerWidth: 420,
      containerHeight: 236,
      placement: "single",
      title: "召回三段式改造",
      subtitle: "先校准分数再融合",
    });
    expect(single.subtitleLines).toEqual([]);
    expect(single.subtitleHidden).toBe(true);

    const double = computeCoverTextLayout({
      containerWidth: 640,
      containerHeight: 229,
      placement: "double",
      title: "召回三段式改造",
      subtitle: "先校准分数再融合",
    });
    expect(double.subtitleLines.length).toBeGreaterThan(0);
  });

  test("副标题放不下就自动隐藏，标题永远不隐藏", () => {
    const layout = computeCoverTextLayout({
      containerWidth: 150,
      containerHeight: 94,
      placement: "banner",
      title: "召回",
      subtitle: "这一句特别特别长，长到怎么缩都放不进这一小块画面里去的副标题",
      controls: true,
    });
    expect(layout.subtitleLines).toEqual([]);
    expect(layout.titleLines.length).toBeGreaterThan(0);
  });

  test("大字与小字都要在时，标题让一档把位置让给小字", () => {
    const withSubtitle = computeCoverTextLayout({
      containerWidth: 1600,
      containerHeight: 571,
      placement: "double",
      title: "复盘笔记",
      subtitle: "一次上线，三段召回",
    });
    const withoutSubtitle = computeCoverTextLayout({
      containerWidth: 1600,
      containerHeight: 571,
      placement: "double",
      title: "复盘笔记",
    });
    // 有小字时小字要真的出现，作者写的东西不能被悄悄丢掉。
    expect(withSubtitle.subtitleLines.length).toBeGreaterThan(0);
    expect(withSubtitle.subtitleHidden).toBe(false);
    // 代价是大字让一档 —— 但仍然是醒目的大字，不是缩成小注解。
    expect(withSubtitle.fontSize).toBeLessThan(withoutSubtitle.fontSize);
    expect(withSubtitle.fontSize).toBeGreaterThan(withoutSubtitle.fontSize * 0.7);
    // 两块加起来不能超出画布。
    expect(
      withSubtitle.top + withSubtitle.blockHeight,
    ).toBeLessThanOrEqual(571);
  });

  test("小字放得下一行时就排一行，不为了均分硬断成两行", () => {
    const layout = computeCoverTextLayout({
      containerWidth: 1200,
      containerHeight: 630,
      placement: "share",
      title: "复盘笔记",
      subtitle: "一次上线",
    });
    expect(layout.subtitleLines).toEqual(["一次上线"]);
  });

  test("标题长到可读下限也放不下时给出提示，而不是悄悄截断", () => {
    const layout = computeCoverTextLayout({
      containerWidth: 150,
      containerHeight: 94,
      placement: "single",
      title: "一个特别特别长的短标题长到连可读下限都放不下",
    });
    expect(layout.overflow).toBe(true);
    // 标题仍然完整 —— 不做无提示的截断。
    expect(layout.titleLines.join("")).toContain("短标题");
  });

  test("有置顶角标时，文字块让开左上角", () => {
    const withBadge = computeCoverTextLayout({
      containerWidth: 640,
      containerHeight: 229,
      placement: "double",
      title: "召回三段式改造",
      badge: true,
    });
    const without = computeCoverTextLayout({
      containerWidth: 640,
      containerHeight: 229,
      placement: "double",
      title: "召回三段式改造",
    });
    expect(withBadge.top).toBeGreaterThan(without.top);
  });

  test("Banner 的标题贴左下角，并给底部状态行让出位置", () => {
    // 参照稿的版式：标题贴左下角，下面一行是状态角标（★ 全站推荐 + 圆点），
    // 轮播箭头在右下角 —— 标题与状态行各占一条，谁也不压谁。
    const rules = coverSceneRules.banner;
    const reserve = Math.max(
      Math.round(248 * rules.footerReserveRatio),
      rules.footerReserveMinPx,
    );
    const layout = computeCoverTextLayout({
      containerWidth: 720,
      containerHeight: 248,
      placement: "banner",
      title: "召回三段式改造",
      subtitle: "先校准分数再融合",
    });
    // 文字块的下沿 = 状态行预留带的上沿
    expect(layout.top + layout.blockHeight).toBe(248 - reserve);
    // 标题不落在状态行那条带子里
    expect(layout.top + layout.blockHeight).toBeLessThanOrEqual(248 - 34);
    // 长短标题共用同一条下沿 —— 换一篇 banner，版式不跳
    const short = computeCoverTextLayout({
      containerWidth: 720,
      containerHeight: 248,
      placement: "banner",
      title: "来了看看",
    });
    expect(short.top + short.blockHeight).toBe(layout.top + layout.blockHeight);
  });

  test("宽扁容器 + 置顶角标：标题不能顶出画布被裁掉", () => {
    /*
     * 回归：字号原来只按宽度选，双栏 2.8:1 的容器里排成两行
     * 就会比画布还高（再加角标让出 26% 高度，更容易溢出）——
     * 预览里下半行被裁掉，看起来像「排版坏了」。
     */
    for (const [width, height] of [
      [366, 131],
      [256, 92],
      [640, 229],
    ]) {
      const layout = computeCoverTextLayout({
        containerWidth: width,
        containerHeight: height,
        placement: "double",
        title: "召回调优",
        badge: true,
      });
      expect(layout.top + layout.blockHeight).toBeLessThanOrEqual(height);
      expect(layout.top).toBeGreaterThanOrEqual(0);
    }
  });

  test("各展示位的文字块都不越出画布", () => {
    const scenes = [
      { placement: "double" as const, width: 640, height: 229, badge: true },
      { placement: "single" as const, width: 420, height: 236, badge: false },
      { placement: "single" as const, width: 150, height: 94, badge: false },
      { placement: "banner" as const, width: 720, height: 248, badge: false },
      { placement: "share" as const, width: 1200, height: 630, badge: false },
    ];
    for (const scene of scenes) {
      const layout = computeCoverTextLayout({
        containerWidth: scene.width,
        containerHeight: scene.height,
        placement: scene.placement,
        title: "召回调优",
        subtitle: "先校准分数再融合",
        badge: scene.badge,
      });
      expect(layout.top + layout.blockHeight).toBeLessThanOrEqual(scene.height);
      expect(layout.top).toBeGreaterThanOrEqual(0);
    }
  });

  test("文字位置可左中右，字号可微调", () => {
    const left = computeCoverTextLayout({
      containerWidth: 640,
      containerHeight: 229,
      placement: "double",
      title: "召回",
      align: "left",
    });
    const center = computeCoverTextLayout({
      containerWidth: 640,
      containerHeight: 229,
      placement: "double",
      title: "召回",
      align: "center",
    });
    const right = computeCoverTextLayout({
      containerWidth: 640,
      containerHeight: 229,
      placement: "double",
      title: "召回",
      align: "right",
    });
    expect(left.left).toBeLessThan(center.left);
    expect(center.left).toBeLessThan(right.left);

    const normal = computeCoverTextLayout({
      containerWidth: 640,
      containerHeight: 229,
      placement: "double",
      title: "召回",
    });
    const bigger = computeCoverTextLayout({
      containerWidth: 640,
      containerHeight: 229,
      placement: "double",
      title: "召回",
      sizeScale: 1.2,
    });
    expect(bigger.fontSize).toBeGreaterThan(normal.fontSize);
  });
});

describe("封面配置读写", () => {
  test("完整图片封面不叠字", () => {
    expect(
      coverHasTextLayer({ ...defaultCoverTextConfig, title: "旧封面标题" }),
    ).toBe(true);
    expect(
      coverHasTextLayer({
        ...defaultCoverTextConfig,
        mode: "full",
        title: "旧封面标题",
      }),
    ).toBe(false);
    expect(coverHasTextLayer(null)).toBe(false);
  });

  test("脏数据一律回落到默认值", () => {
    const value = normalizeCoverTextConfig({
      mode: "乱写",
      align: "斜的",
      sizeScale: 99,
      title: "  标题  ",
      subtitle: "副标题".repeat(30),
    });
    expect(value.mode).toBe("overlay");
    expect(value.align).toBe("left");
    expect(value.sizeScale).toBe(1.25);
    expect(value.title).toBe("标题");
    expect(value.subtitle.length).toBeLessThanOrEqual(40);
    expect(value.templateVersion).toBe(COVER_TEMPLATE_VERSION);
  });

  test("主题色支持预设名与自定义 hex", () => {
    expect(coverPaletteColor("violet")).toBe("#4930e8");
    expect(coverPaletteColor("#AABBCC")).toBe("#aabbcc");
    expect(coverPaletteColor("不存在的颜色")).toBe("#4930e8");
  });

  test("遮罩渐变随文字对齐方向变化", () => {
    const left = coverScrimCss("violet", "left");
    const right = coverScrimCss("violet", "right");
    expect(left).not.toBe(right);
    expect(left).toContain("rgba(73,48,232");
  });

  test("中文断行工具：没有合适断点时按字符均分，不丢字", () => {
    expect(coverTextLines("召回三段式改造", 2).join("")).toBe("召回三段式改造");
    expect(coverTextLines("", 2)).toEqual([]);
  });
});


describe("标题安全区与整幅铺底", () => {
  test("底图整幅铺满封面，标题列落在左侧安全区里", () => {
    for (const [placement, width, height] of [
      ["double", 640, 229], ["double", 350, 125],
      ["single", 160, 90], ["single", 420, 236],
      ["banner", 720, 248], ["banner", 350, 121], ["share", 1200, 630],
    ] as const) {
      for (const align of ["left", "right", "center"] as const) {
        const layout = computeCoverTextLayout({ containerWidth: width, containerHeight: height,
          placement, title: "推荐策略调优", subtitle: "持续验证真实业务收益", align, sizeScale: 1.2 });
        // 插画不再切独立槽位：底图整幅铺满，标题压在底图左侧的留白上。
        expect(layout.artwork).toEqual({ left: 0, top: 0, width, height });
        // 文字块不出画布。
        expect(layout.top).toBeGreaterThanOrEqual(0);
        expect(layout.top + layout.blockHeight).toBeLessThanOrEqual(height);
        expect(layout.left).toBeGreaterThanOrEqual(0);
        expect(layout.left + layout.maxWidth).toBeLessThanOrEqual(width);
        // 左对齐时标题列不能越过安全区 —— 越过就压到插画上了。
        if (align === "left")
          expect((layout.left + layout.maxWidth) / width).toBeLessThanOrEqual(COVER_TEXT_SAFE_RATIO);
      }
    }
  });

  test("各场景的标题列宽度都收在安全区内", () => {
    for (const key of ["double", "single", "banner", "share"] as const) {
      const rule = coverSceneRules[key];
      expect(rule.padXRatio + rule.columnRatio).toBeLessThanOrEqual(COVER_TEXT_SAFE_RATIO);
    }
  });
});
