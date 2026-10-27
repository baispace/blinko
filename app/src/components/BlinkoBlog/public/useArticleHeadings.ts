import { useEffect, useState, type RefObject } from "react";
import { useBlogSite } from "./BlogShell";
import { buildArticleHeadings, type ArticleHeading } from "./articleHeadings";

/**
 * 正文标题清单 + 当前阅读位置。
 *
 * 锚点由 buildArticleHeadings 生成（稳定、唯一、兼容中文与重复标题），
 * 「本文目录」浮层和目录跳转用的是同一份 id，不会点一下跳到别的地方。
 */
export function useArticleHeadings(
  bodyRef: RefObject<HTMLElement | null>,
  /** 正文换一篇时要重算 —— 传文章标识即可。 */
  revision: unknown,
) {
  const site = useBlogSite();
  const [headings, setHeadings] = useState<ArticleHeading[]>([]);
  const [active, setActive] = useState("");

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const list = buildArticleHeadings(root);
    setHeadings(list);
    setActive(list[0]?.id || "");
    if (!list.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      {
        root: site.scrollRoot.current,
        rootMargin: "-20px 0px -65% 0px",
        threshold: 0,
      },
    );
    list.forEach((heading) => {
      const node = root.querySelector("#" + CSS.escape(heading.id));
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [bodyRef, revision, site.scrollRoot]);

  const jump = (id: string) => {
    const root = bodyRef.current;
    const node = root?.querySelector("#" + CSS.escape(id));
    node?.scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    setActive(id);
    // 地址带上锚点：读者可以把「读到哪一节」直接分享出去。
    // 用 replaceState 而不是 pushState —— 不往历史里塞记录，
    // 浏览器「后退」仍然只退文章，不退小节。
    if (window.location.hash !== "#" + id) {
      window.history.replaceState(null, "", "#" + id);
    }
  };

  return { headings, active, jump };
}
