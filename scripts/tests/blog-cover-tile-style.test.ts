import { describe, test, expect } from "bun:test";
import { createRequire } from "node:module";
const sharp = createRequire(new URL("../../server/package.json", import.meta.url))("sharp") as typeof import("../../server/node_modules/sharp");
import {
  COVER_BACKDROP_ALPHA,
  COVER_TEMPLATE_VERSION,
  computeCoverBackdropLayout,
  computeCoverCaptionLayout,
  computeCoverLayouts,
  computeCoverTileLayout,
  coverTileScrimCss,
} from "../../shared/lib/blogCoverText";
import { composeCoverImage } from "../../server/lib/blogCoverComposition";
import { computeCoverTextLayout } from "../../shared/lib/blogCoverText";

/**
 * 第二版封面：居中图标砖 + 淡化背景大字。
 *
 * 模型只出一枚图标，其余全由程序排 ——
 * 所以这里盯的是「程序说了算」的那部分：方砖多大、字多大、压在哪。
 */

const palette = "blue";

/** 一枚假的隔离图标：透明底 + 蓝色描边圆环。 */
async function isolatedIcon() {
  return sharp({
    create: {
      width: 400,
      height: 400,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><circle cx="200" cy="200" r="120" fill="none" stroke="#0b62d6" stroke-width="30"/></svg>`,
        ),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();
}

describe("新版式排版：图标砖与背景大字", () => {
  test("图标砖是正方形且居中，图标缩在砖内", () => {
    for (const [width, height] of [
      [1200, 630],
      [1600, 571],
      [1160, 400],
      [180, 96],
    ] as const) {
      const tile = computeCoverTileLayout({ containerWidth: width, containerHeight: height });
      expect(tile.size).toBe(tile.size);
      expect(tile.size).toBeLessThanOrEqual(Math.round(height * 0.60));
      expect(tile.size).toBeLessThanOrEqual(Math.round(width * 0.29));
      expect(tile.left).toBe(Math.round((width - tile.size) / 2));
      expect(tile.top).toBe(Math.round((height - tile.size) / 2));
      // 砖里还要放得下图标：内缩不能把空间吃光。
      expect(tile.size - tile.inset * 2).toBeGreaterThan(tile.size * 0.4);
    }
  });

  test("背景大字横贯画面且居中，高度不越过上限", () => {
    const backdrop = computeCoverBackdropLayout({
      containerWidth: 1200,
      containerHeight: 630,
      placement: "share",
      title: "产品方法",
    })!;
    expect(backdrop.text).toBe("产品方法");
    expect(backdrop.centerX).toBe(600);
    // 字占画面宽度的七成上下 —— 参考封面的大字约莫这个比例。
    expect(backdrop.visualWidth / 1200).toBeGreaterThan(0.6);
    expect(backdrop.visualWidth / 1200).toBeLessThan(0.9);
    // 高度封顶：顶太满会压到图标砖。
    expect(backdrop.fontSize).toBeLessThanOrEqual(Math.round(630 * 0.64));
    expect(backdrop.top).toBeGreaterThan(0);
  });

  test("标题越长字越小，但仍居中且不出画布", () => {
    for (const title of ["复盘", "产品方法", "推荐召回策略优化", "OpenAI"]) {
      const backdrop = computeCoverBackdropLayout({
        containerWidth: 1200,
        containerHeight: 630,
        placement: "share",
        title,
      })!;
      expect(backdrop.centerX).toBe(600);
      expect(backdrop.visualWidth).toBeLessThanOrEqual(1200);
      expect(backdrop.fontSize).toBeGreaterThan(0);
    }
  });

  test("极小缩略图不画背景大字，列表行也不放小字", () => {
    expect(
      computeCoverBackdropLayout({
        containerWidth: 88,
        containerHeight: 50,
        placement: "single",
        title: "产品方法",
      }),
    ).toBeNull();
    expect(
      computeCoverCaptionLayout({
        containerWidth: 180,
        containerHeight: 96,
        placement: "single",
        subtitle: "从问题到方案",
      }),
    ).toBeNull();
  });

  test("锐利小字压在底部，并给页脚状态行让出位置", () => {
    const caption = computeCoverCaptionLayout({
      containerWidth: 1200,
      containerHeight: 630,
      placement: "share",
      subtitle: "从问题到方案的一次实践记录",
      align: "left",
    })!;
    expect(caption.lines).toEqual(["从问题到方案的一次实践记录"]);
    expect(caption.top + caption.lineHeight).toBeLessThanOrEqual(630);
    expect(caption.top).toBeGreaterThan(630 * 0.7);
    // 居中对齐时小字落在画面中线附近。
    const centered = computeCoverCaptionLayout({
      containerWidth: 1200,
      containerHeight: 630,
      placement: "share",
      subtitle: "小字",
      align: "center",
    })!;
    expect(centered.left).toBeGreaterThan(0);
    expect(centered.left + centered.maxWidth).toBeLessThan(1200);
  });

  test("Banner 的小字要让开底部的推荐栏", () => {
    const caption = computeCoverCaptionLayout({
      containerWidth: 1160,
      containerHeight: 400,
      placement: "banner",
      subtitle: "全站推荐",
      align: "left",
    })!;
    expect(caption.top + caption.lineHeight).toBeLessThanOrEqual(400 - 34);
  });

  test("一次算出全部排版结果，页面与导出读同一份", () => {
    const layouts = computeCoverLayouts({
      containerWidth: 1200,
      containerHeight: 630,
      placement: "share",
      title: "产品方法",
      subtitle: "小字",
    });
    expect(layouts.backdrop?.centerX).toBe(600);
    expect(layouts.tile.size).toBe(
      computeCoverTileLayout({ containerWidth: 1200, containerHeight: 630, placement: "share" }).size,
    );
    expect(layouts.caption?.lines).toEqual(["小字"]);
    expect(layouts.title.titleLines.join("")).toBe("产品方法");
  });

  test("遮罩只压底部，页面与导出用同一份参数", () => {
    const css = coverTileScrimCss();
    expect(css).toContain("linear-gradient(to top");
    expect(css).toContain("rgba(0,0,0,0.32)");
  });

  test("排版模板版本升级，老文章会按新规则重画", () => {
    expect(COVER_TEMPLATE_VERSION).toBe("v8");
  });
});

describe("新版式合成：导出与页面一致", () => {
  const width = 1200;
  const height = 630;

  async function compose(icon: Buffer) {
    const layout = computeCoverTextLayout({
      containerWidth: width,
      containerHeight: height,
      placement: "share",
      title: "产品方法",
    });
    return composeCoverImage({
      base: icon,
      layout,
      title: "产品方法",
      subtitle: "从问题到方案的一次实践记录",
      sizeScale: 1,
      canvasWidth: width,
      canvasHeight: height,
      palette,
      align: "left",
    });
  }

  test("隔离图标走新版式：中央有白砖、砖后有大字，正文信息留在图片外", async () => {
    const out = await compose(await isolatedIcon());
    const { data, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return { r: data[i], g: data[i + 1], b: data[i + 2] };
    };
    const tile = computeCoverTileLayout({ containerWidth: width, containerHeight: height, placement: "share" });
    // 砖左侧中部是白的（图标在正中，圆角只吃四角）。
    const corner = at(tile.left + 20, tile.top + Math.round(tile.size / 2));
    expect(corner.r).toBeGreaterThan(240);
    expect(corner.g).toBeGreaterThan(240);
    // 砖外是主题渐变，不是白色。
    const outside = at(12, 12);
    expect(outside.b).toBeGreaterThan(outside.r + 30);
    // 背景大字：砖左下角那片被大字提亮过。
    let highlighted=0;
    for(let x=80;x<tile.left-20;x+=3) for(let y=160;y<470;y+=3){
      const word=at(x,y), plain=at(x,30);
      if(word.r+word.g+word.b>plain.r+plain.g+plain.b+30) highlighted++;
    }
    expect(highlighted).toBeGreaterThan(100);
    /* Approved cover keeps article copy outside the decorative image.
    // 底部小字：底部左侧那条带子里有白色像素。
    const caption = computeCoverCaptionLayout({
      containerWidth: width,
      containerHeight: height,
      placement: "share",
      subtitle: "从问题到方案的一次实践记录",
      align: "left",
    })!;
    let brightest = 0;
    for (let y = caption.top; y < caption.top + caption.lineHeight; y++) {
      for (let x = caption.left; x < caption.left + 300; x++) {
        const pixel = at(x, y);
        brightest = Math.max(brightest, pixel.r);
      }
    }
    expect(brightest).toBeGreaterThan(200); */
  });

  test("整图封面仍旧整幅铺满并叠自己的文字层", async () => {
    const base = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    const layout = computeCoverTextLayout({
      containerWidth: width,
      containerHeight: height,
      placement: "share",
      title: "产品方法",
    });
    const out = await composeCoverImage({
      base,
      layout,
      canvasWidth: width,
      canvasHeight: height,
      palette,
      align: "left",
    });
    const { data, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return { r: data[i], g: data[i + 1], b: data[i + 2] };
    };
    // 画面中央没有白砖 —— 那是新版式的底图。
    const middle = at(width / 2, height / 2);
    expect(middle.g).toBeLessThan(60);
    expect(middle.b).toBeLessThan(60);
    // 文字层压在左侧，白字可见。
    expect(at(Math.round(layout.left + 6), Math.round(layout.top + layout.fontSize / 2)).r).toBeGreaterThan(200);
  });

  test("背景大字的透明度与页面共用同一个常量", () => {
    expect(COVER_BACKDROP_ALPHA).toBeGreaterThan(0.1);
    expect(COVER_BACKDROP_ALPHA).toBeLessThan(0.35);
  });
});

test('explicit tile asset stays centered even when its pixels are opaque', async () => {
  const base=await sharp({create:{width:300,height:300,channels:3,background:'#ed4030'}}).png().toBuffer();
  const out=await composeCoverImage({base,artwork:'tile',title:'产品方法',layout:computeCoverTextLayout({containerWidth:600,containerHeight:214,placement:'double',title:'产品方法'}),canvasWidth:600,canvasHeight:214,palette:'blue',align:'left'});
  const {data,info}=await sharp(out).raw().toBuffer({resolveWithObject:true});
  const at=(x:number,y:number)=>{const i=(y*info.width+x)*info.channels;return [...data.subarray(i,i+3)];};
  expect(at(300,107)[0]).toBeGreaterThan(200);
  expect(at(10,10)[2]).toBeGreaterThan(at(10,10)[0]+30);
});

test("narrow mobile thumbnails keep a readable icon instead of inheriting the wide-banner width cap", () => {
 const tile=computeCoverTileLayout({containerWidth:88,containerHeight:66});
 expect(tile.size).toBeGreaterThanOrEqual(36);
 expect(tile.size).toBeLessThanOrEqual(44);
 expect(tile.left).toBe(Math.round((88-tile.size)/2));
});

test("foreground tile obscures at most about one character of a typical four-character cover word", () => {
 for(const [placement,w,h] of [["banner",1160,400],["double",560,200],["share",1200,630]] as const){
  const layouts=computeCoverLayouts({containerWidth:w,containerHeight:h,placement,title:"指标入门"});
  expect(layouts.tile.size / layouts.backdrop!.visualWidth).toBeLessThan(.30);
  expect(layouts.tile.size / h).toBeGreaterThan(.35);
  expect(layouts.tile.left).toBe(Math.round((w-layouts.tile.size)/2));
 }
});
