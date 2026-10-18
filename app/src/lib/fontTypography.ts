/** WenKai has two bundled weights; keep normal text distinct from semantic bold. */
export function resolveBodyFontWeight(fontName: unknown, requested: unknown): number {
  if (fontName === 'LXGW WenKai') return 400;
  const weight = Number(requested);
  return Number.isFinite(weight) && weight >= 300 && weight <= 700 ? weight : 400;
}
