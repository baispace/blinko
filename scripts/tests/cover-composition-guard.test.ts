import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import {
  measureCoverComposition,
  describeCoverComposition,
} from "../../server/lib/coverComposition";
import {
  generateGuardedCoverBase,
  pickBestCoverComposition,
  scoreCoverComposition,
  COVER_COMPOSITION_MAX_ATTEMPTS,
} from "../../server/lib/coverCompositionGuard";
import type { CoverComposition } from "../../server/lib/coverComposition";

/*
 * sharp 只装在 server 下（isolated 布局），脚本目录解析不到 ——
 * 从 server 的位置去 require，测试才跑得起来。
 */
const require = createRequire(import.meta.dir + "/../../server/index.js");
const sharp = require("sharp");

/**
 * 构图护栏：底图的插画必须待在右半区，左边才有干净的底色给标题。
 *
 * 这里不用真的去生图 —— 构图测量用合成图验证，
 * 护栏的重试/挑选逻辑用注入的假测量验证。
 */

function composition(over: Partial<CoverComposition> = {}): CoverComposition {
  return {
    leftEdgePct: 10,
    rightEdgePct: 60,
    centerPct: 35,
    touchesRight: false,
    rightAnchored: false,
    ...over,
  };
}

/** 合成一张底图：主体占 [subjectLeftPct, subjectRightPct]，其余是空底色。 */
async function baseImage(subjectLeftPct: number, subjectRightPct = 100) {
  const width = 1600;
  const height = 900;
  const left = Math.round((width * subjectLeftPct) / 100);
  const right = Math.round((width * subjectRightPct) / 100);
  const background = Buffer.from(
    `<svg width="${width}" height="${height}">
       <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
         <stop offset="0%" stop-color="#2b2a6b"/><stop offset="100%" stop-color="#1d1c4e"/>
       </linearGradient></defs>
       <rect width="${width}" height="${height}" fill="url(#bg)"/>
       <rect x="${left}" y="180" width="${right - left}" height="540" fill="#f2f4ff"/>
     </svg>`,
  );
  // 边缘做一点柔化 —— 真人看的插画边界也是渐变的，测量按这个来。
  return sharp(background).blur(1.5).png().toBuffer();
}

describe("构图测量", () => {
  test("主体压在右边时，量出的左缘落在右半区", async () => {
    const measured = await measureCoverComposition(await baseImage(55));
    expect(measured.rightAnchored).toBe(true);
    expect(measured.leftEdgePct).toBeGreaterThanOrEqual(45);
    expect(measured.rightEdgePct).toBeGreaterThan(90);
  });

  test("主体压在中间时，判定为不合格", async () => {
    const measured = await measureCoverComposition(await baseImage(25, 75));
    expect(measured.rightAnchored).toBe(false);
    expect(measured.centerPct).toBeLessThan(60);
  });

  test("描述里能看出是哪一种构图", async () => {
    const good = describeCoverComposition(await measureCoverComposition(await baseImage(55)));
    const bad = describeCoverComposition(await measureCoverComposition(await baseImage(25)));
    expect(good.verdict).toContain("✅");
    expect(bad.verdict).toContain("❌");
  });
});

describe("构图护栏", () => {
  test("第一张偏中间就换一张，直到抽到右锚构图", async () => {
    const buffers = [Buffer.from("a"), Buffer.from("b"), Buffer.from("c")];
    const measured = [
      composition({ centerPct: 50 }),
      composition({ leftEdgePct: 55, rightEdgePct: 95, centerPct: 75, rightAnchored: true }),
      composition({ leftEdgePct: 60, rightEdgePct: 98, centerPct: 79, rightAnchored: true, touchesRight: true }),
    ];
    let calls = 0;
    const result = await generateGuardedCoverBase({
      attempt: async () => {
        const index = calls++;
        return [buffers[index]];
      },
      measure: async (buffer) => measured[buffers.indexOf(buffer)],
    });
    expect(result?.buffer).toEqual(Buffer.from("c"));
    expect(result?.attempts).toBe(3);
    expect(result?.ideal).toBe(true);
    expect(calls).toBe(3);
  });

  test("抽到理想构图就立刻收工，不再多生", async () => {
    let calls = 0;
    const result = await generateGuardedCoverBase({
      attempt: async () => {
        calls++;
        return [Buffer.from("x")];
      },
      measure: async () =>
        composition({ leftEdgePct: 60, rightEdgePct: 99, centerPct: 80, rightAnchored: true, touchesRight: true }),
    });
    expect(calls).toBe(1);
    expect(result?.ideal).toBe(true);
    expect(result?.attempts).toBe(1);
  });

  test("试满上限仍然不合格时，返回最好的一张而不是报错", async () => {
    let calls = 0;
    const result = await generateGuardedCoverBase({
      attempt: async () => {
        calls++;
        return [Buffer.from(`try-${calls}`)];
      },
      measure: async (buffer) =>
        composition({ centerPct: buffer.toString().endsWith("3") ? 58 : 40 }),
      maxAttempts: 3,
    });
    expect(calls).toBe(3);
    expect(result?.buffer.toString()).toBe("try-3");
    expect(result?.exhausted).toBe(true);
    expect(result?.ideal).toBe(false);
  });

  test("模型一次都没出图时返回 null", async () => {
    const result = await generateGuardedCoverBase({
      attempt: async () => [],
      measure: async () => composition(),
    });
    expect(result).toBeNull();
  });

  test("每一轮都报错时，把最后一个错误抛出去", async () => {
    const result = await generateGuardedCoverBase({
      attempt: async (index) => {
        throw new Error(`第 ${index + 1} 次失败`);
      },
      measure: async () => composition(),
      maxAttempts: 2,
    }).catch((error) => error as Error);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("第 2 次失败");
  });

  test("默认最多试三张", () => {
    expect(COVER_COMPOSITION_MAX_ATTEMPTS).toBe(3);
  });
});

describe("候选挑选", () => {
  test("右锚优先于顶到右边缘，中心更靠右再优先", () => {
    const anchored = composition({ leftEdgePct: 50, rightEdgePct: 90, centerPct: 70, rightAnchored: true });
    const touching = composition({ leftEdgePct: 30, rightEdgePct: 100, centerPct: 65, touchesRight: true });
    expect(scoreCoverComposition(anchored)).toBeGreaterThan(scoreCoverComposition(touching));
    const left = composition({ leftEdgePct: 50, rightEdgePct: 90, centerPct: 70, rightAnchored: true });
    const right = composition({ leftEdgePct: 60, rightEdgePct: 99, centerPct: 80, rightAnchored: true });
    expect(scoreCoverComposition(right)).toBeGreaterThan(scoreCoverComposition(left));
  });

  test("从候选里挑最好的那一张", () => {
    const buffer = Buffer.from("best");
    const best = pickBestCoverComposition([
      { buffer: Buffer.from("mid"), composition: composition({ centerPct: 50 }) },
      { buffer, composition: composition({ leftEdgePct: 58, rightEdgePct: 92, centerPct: 75, rightAnchored: true }) },
    ]);
    expect(best?.buffer).toEqual(buffer);
  });
});
