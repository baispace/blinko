import sharp from "sharp";

/**
 * 底图构图的客观体检：量出「主体」（插画）在画面里的水平范围。
 *
 * 为什么需要这个：底图是 AI 画的，「主体压在右侧、左边留白给标题」这条
 * 构图契约模型并不总能遵守 —— 同一条提示词有时出右侧构图，有时出中间构图。
 * 肉眼在缩略图上很难判断偏差有多大，这里给一个可复现的数字：
 * 左缘应该在 45% 之后（右半区），右缘应该顶到 100%（被画框裁断）。
 *
 * 怎么量的：背景是横向渐变，纵向没有结构；主体（卡片、面板）有大量横向
 * 边缘。所以逐列算「纵向差分能量」，背景接近 0，主体明显偏高。
 */

export type CoverComposition = {
  /** 主体左缘（占画宽百分比）。标题安全区在它左边。 */
  leftEdgePct: number;
  /** 主体右缘（占画宽百分比）。 */
  rightEdgePct: number;
  /** 主体水平中心（占画宽百分比）。 */
  centerPct: number;
  /** 主体是否被右边缘裁断（顶到 100%）。 */
  touchesRight: boolean;
  /** 构图是否合格：主体在右半区。 */
  rightAnchored: boolean;
};

/** 主体左缘要在这个位置之后才算「压在右侧」。 */
export const COVER_RIGHT_ANCHOR_PCT = 45;

const SAMPLE_WIDTH = 320;

export async function measureCoverComposition(
  input: Buffer | string,
): Promise<CoverComposition> {
  const { data, info } = await sharp(input)
    .greyscale()
    .resize({ width: SAMPLE_WIDTH })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  // 逐列的纵向差分能量。
  const energy = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 1; y < height; y++) {
      const a = data[(y * width + x) * channels];
      const b = data[((y - 1) * width + x) * channels];
      sum += Math.abs(a - b);
    }
    energy[x] = sum / Math.max(1, height - 1);
  }

  const peak = Math.max(...energy);
  const threshold = peak * 0.15;
  // 连续两列都算高能量才算主体 —— 滤掉渐变里的孤立噪点。
  const active = new Array<boolean>(width).fill(false);
  for (let x = 1; x < width - 1; x++) {
    active[x] = energy[x] > threshold && (energy[x - 1] > threshold || energy[x + 1] > threshold);
  }

  let first = -1;
  let last = -1;
  for (let x = 0; x < width; x++) {
    if (!active[x]) continue;
    if (first < 0) first = x;
    last = x;
  }

  const pct = (value: number) => Math.round((value / Math.max(1, width - 1)) * 100);
  const leftEdgePct = first < 0 ? 0 : pct(first);
  const rightEdgePct = first < 0 ? 0 : pct(last);
  const centerPct = first < 0 ? 0 : pct(Math.round((first + last) / 2));

  return {
    leftEdgePct,
    rightEdgePct,
    centerPct,
    touchesRight: last >= width - 2,
    rightAnchored: leftEdgePct >= COVER_RIGHT_ANCHOR_PCT,
  };
}

export function describeCoverComposition(composition: CoverComposition) {
  const verdict = composition.rightAnchored
    ? composition.touchesRight
      ? "✅ 主体压在右半区并被右边缘裁断 —— 符合构图契约"
      : "⚠️ 主体在右半区，但没顶到右边缘（可以再生成一张）"
    : "❌ 主体偏中间 —— 左边没有留出干净的标题区，标题会压在插画上";
  return {
    ...composition,
    verdict,
    text: `主体 ${composition.leftEdgePct}%..${composition.rightEdgePct}%，中心 ${composition.centerPct}%`,
  };
}
