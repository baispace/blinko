/**
 * Cover framing offset.
 *
 * A 2.35:1 cover crops whatever does not fit, so the viewer needs a way to
 * chose *which* part stays. We keep a single百分比 pair (top-left origin,
 * 0-100) and feed it straight into `object-position`, which means no extra
 * DOM, no transform math and no change to how the image is rendered.
 */

export type CoverOffset = { x: number; y: number }

export const DEFAULT_OFFSET: CoverOffset = { x: 50, y: 50 }

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)))

/** Tolerates missing / legacy / hand-edited metadata values. */
export const normalizeOffset = (value: unknown): CoverOffset => {
  if (!value || typeof value !== 'object') return DEFAULT_OFFSET
  const raw = value as { x?: unknown; y?: unknown }
  const x = typeof raw.x === 'number' ? raw.x : Number(raw.x)
  const y = typeof raw.y === 'number' ? raw.y : Number(raw.y)
  return {
    x: Number.isFinite(x) ? clamp(x) : DEFAULT_OFFSET.x,
    y: Number.isFinite(y) ? clamp(y) : DEFAULT_OFFSET.y,
  }
}

export const toObjectPosition = (offset: CoverOffset): string =>
  `${clamp(offset.x)}% ${clamp(offset.y)}%`
