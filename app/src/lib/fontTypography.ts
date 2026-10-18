/**
 * 正文实际生效的字重。
 *
 * 霞鹜文楷打包的 bold 分片虽然存在、也会被浏览器加载，但渲染出的字形与
 * regular 完全一致（实测 48px 下 400 与 700 像素级相同，而苹方 700 明显加粗）。
 * 所以对这套字体一律锁 400 —— 既避免界面里的 font-medium/semibold 变成
 * 「写了却没效果」的假象，也避免浏览器对缺失字重做伪造加粗（faux bold），
 * 那比重字更难看。
 *
 * 想让某处更「有分量」，请调颜色或字号，不要指望 font-weight。
 */
export function resolveBodyFontWeight(fontName: unknown, requested: unknown): number {
  if (fontName === 'LXGW WenKai') return 400;
  const weight = Number(requested);
  return Number.isFinite(weight) && weight >= 300 && weight <= 700 ? weight : 400;
}
