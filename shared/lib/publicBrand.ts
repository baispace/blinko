/** Public identity; legacy defaults must not leak into Jomio pages. */
export const PUBLIC_BRAND = "Jomio · 拾成";
export function publicBrandName(value?: string | null) {
  const name = value?.trim();
  return !name || /^(ink|blinko|baihe|brian bai|jomio|白贺)$/i.test(name) ? PUBLIC_BRAND : name;
}
