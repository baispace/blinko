/**
 * 后台顶栏的品牌字样。
 *
 * 「Jomio · 拾成」之前在文章页、专题页、后台首页各写了一遍 ——
 * 改一次品牌要动三个文件，漏掉一个就会在某个页面看到旧名字。
 */
export function BlogStudioBrand({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold ${className}`}>
      Jomio
      <span className="ml-1 text-xs font-normal text-default-500">· 拾成</span>
    </span>
  );
}
