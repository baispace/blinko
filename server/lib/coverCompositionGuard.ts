import {
  measureCoverComposition,
  type CoverComposition,
} from "./coverComposition";

/**
 * 构图护栏：底图的主体位置不能靠模型自觉。
 *
 * 提示词已经反复强调「主体推到右边缘、左半边留空」，但生图模型并不总是听话 ——
 * 同一条提示词，有时出右侧构图，有时出中间构图。实测同一提示词的合格率只有
 * 四成上下，剩下那几成整幅铺满之后插画就压到标题底下，看起来「图偏中间」。
 *
 * 所以这里把「构图对不对」变成一个**可以量的判断**：
 *   1. 生一张；
 *   2. 量出主体（插画）的水平范围；
 *   3. 主体没落在右半区 —— 说明左边没留出干净的标题区，换一张重来；
 *   4. 试满上限，取最好的一张。
 *
 * 护栏只做「挑」，不做「改」：主体真的画到了中间，程序也没法把插画搬过去，
 * 只能多试几次看能不能抽到一张右锚构图。全部不合格时仍然返回最好的一张，
 * 由作者决定要不要用 —— 硬失败比给一张偏中间的图更让人火大。
 */

/** 最多试几张底图。生图有成本，作者也在等，不能无限试。 */
export const COVER_COMPOSITION_MAX_ATTEMPTS = 3;

export type GuardedCoverBase = {
  /** 选中的底图。 */
  buffer: Buffer;
  /** 选中这张的构图测量结果。 */
  composition: CoverComposition;
  /** 实际生成了几轮（每轮可能是多张候选）。 */
  attempts: number;
  /** 试满上限仍然没拿到「主体在右半区」的构图。 */
  exhausted: boolean;
  /** 主体在右半区、而且被右边缘裁断 —— 最理想的构图。 */
  ideal: boolean;
};

/**
 * 给构图打分，越大越好。
 *
 * 排序理由：
 *   1. 主体在不在右半区（决定标题有没有干净底色可压）—— 权重最高；
 *   2. 有没有被右边缘裁断（决定「插画从画外进来」的感觉）；
 *   3. 主体中心离右边多远（都不理想时，选更靠右的那张）。
 */
export function scoreCoverComposition(composition: CoverComposition): number {
  return (
    (composition.rightAnchored ? 1000 : 0) +
    (composition.touchesRight ? 100 : 0) +
    composition.centerPct
  );
}

/** 从一批已测量的候选里挑最好的那张。 */
export function pickBestCoverComposition(
  candidates: { buffer: Buffer; composition: CoverComposition }[],
): { buffer: Buffer; composition: CoverComposition } | null {
  let best: { buffer: Buffer; composition: CoverComposition } | null = null;
  for (const candidate of candidates) {
    if (
      !best ||
      scoreCoverComposition(candidate.composition) >
        scoreCoverComposition(best.composition)
    ) {
      best = candidate;
    }
  }
  return best;
}

export type GuardedCoverBaseOptions = {
  /**
   * 生成一轮候选底图。index 从 0 开始，每轮换一次随机种子重试。
   * 抛错视为这一轮失败 —— 会继续试下一轮，全轮都失败才把错误抛出去。
   */
  attempt: (index: number) => Promise<Buffer[]>;
  /** 最多试几轮。 */
  maxAttempts?: number;
  /** 量主体位置 —— 测试可注入假实现，避免真的去生图。 */
  measure?: (buffer: Buffer) => Promise<CoverComposition>;
  /** 每量完一张就回调一次，用来打日志或向前端报进度。 */
  onAttempt?: (info: { index: number; composition: CoverComposition }) => void;
};

/**
 * 生成并挑一张构图合格的底图。
 *
 * 拿不到任何候选时返回 null（模型没出图）；全轮都抛错时抛出最后一个错误。
 */
export async function generateGuardedCoverBase(
  options: GuardedCoverBaseOptions,
): Promise<GuardedCoverBase | null> {
  const maxAttempts = Math.max(
    1,
    options.maxAttempts ?? COVER_COMPOSITION_MAX_ATTEMPTS,
  );
  const measure = options.measure ?? measureCoverComposition;
  const pool: { buffer: Buffer; composition: CoverComposition }[] = [];
  let lastError: unknown = null;

  for (let index = 0; index < maxAttempts; index++) {
    let buffers: Buffer[] = [];
    try {
      buffers = await options.attempt(index);
    } catch (error) {
      lastError = error;
      continue;
    }
    for (const buffer of buffers) {
      const composition = await measure(buffer);
      pool.push({ buffer, composition });
      options.onAttempt?.({ index, composition });
      /*
       * 主体压在右半区、又被右边缘裁断 —— 这就是想要的那张，
       * 再试下去只是白花钱，直接收工。
       */
      if (composition.rightAnchored && composition.touchesRight) {
        return {
          buffer,
          composition,
          attempts: index + 1,
          exhausted: false,
          ideal: true,
        };
      }
    }
  }

  if (!pool.length) {
    if (lastError) throw lastError;
    return null;
  }
  const best = pickBestCoverComposition(pool)!;
  return {
    buffer: best.buffer,
    composition: best.composition,
    attempts: maxAttempts,
    exhausted: !best.composition.rightAnchored,
    ideal: best.composition.rightAnchored && best.composition.touchesRight,
  };
}
