import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { blogRoute } from "@/lib/blogPublicBase";
import { Icon } from "@/components/Common/Iconify/icons";

export type DocPost = { id: number; publishId: string; title: string };
export type DocSection = {
  id: number;
  name: string;
  desc: string;
  showTitle: boolean;
  posts: DocPost[];
};
export type DocDirectory = {
  topic: {
    id: number;
    name: string;
    slug: string;
    desc: string;
    color: string;
    displayMode: string;
    coverUrl: string | null;
  };
  sections: DocSection[];
  unassigned: { posts: DocPost[] };
  total: number;
  sectionCount: number;
  firstPublishId: string | null;
  /**
   * 默认打开的文章（已解析好的最终结果）：
   * 后台指定的那一篇，或编排中的第一篇公开文章。
   */
  defaultPublishId: string | null;
  /** 作者到底有没有指定默认文章：false 表示走的是「自动选第一篇」的兜底。 */
  defaultConfigured: boolean;
};

/**
 * 左侧专题目录。
 *
 * 它回答两个问题：「这个专题在讲什么」和「我现在读到哪、下一篇是什么」。
 * 章节折叠与文章跳转是两件独立的事 —— 折叠只是收起一列条目，不影响任何链接。
 *
 * 编号由编排顺序生成，不写进章节名里 —— 作者自己起的「第一章」不会被
 * 前面再顶一个「1.」，两处序号重复比缺一个序号更让人困惑。
 */
export function TopicDocSidebar({
  directory,
  currentPublishId,
  overviewActive = false,
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
}: {
  directory: DocDirectory;
  currentPublishId?: string;
  /** 当前停在专题概述上：左栏的「专题概述」要显示为当前项。 */
  overviewActive?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** 移动端抽屉里点文章后要顺手关掉抽屉。 */
  onNavigate?: () => void;
}) {
  const { topic, sections, unassigned } = directory;
  const [query, setQuery] = useState('');
  const matches = (post: DocPost) => post.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const shownSections = sections.map(section => ({ ...section, posts: section.posts.filter(matches) })).filter(section => section.posts.length);
  const shownUnassigned = unassigned.posts.filter(matches);
  const searchRef = useRef<HTMLInputElement>(null);
  /**
   * 折叠状态只记「被折起来的那些」。
   *
   * 默认全部展开 —— 读者第一次进来就该看见整张地图，而不是一列标题。
   * 切换文章时这个集合不动：其它章节保持作者上次折叠/展开的样子。
   */
  const [folded, setFolded] = useState<Set<number>>(new Set());
  const activeRef = useRef<HTMLAnchorElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isOpen = (id: number) => !folded.has(id);

  /** 当前文章落在哪个章节（未分章节时为 null）。 */
  const currentSectionId = useMemo(() => {
    if (!currentPublishId) return null;
    for (const section of sections) {
      if (section.posts.some((post) => post.publishId === currentPublishId))
        return section.id;
    }
    return null;
  }, [sections, currentPublishId]);

  // 当前文章所在章节始终展开 —— 读者得看得见自己在哪一篇。
  useEffect(() => {
    if (currentSectionId === null) return;
    setFolded((previous) => {
      if (!previous.has(currentSectionId)) return previous;
      const next = new Set(previous);
      next.delete(currentSectionId);
      return next;
    });
  }, [currentSectionId]);

  // 当前条目保持可见，但只在「换文章」时滚一次 —— 不反复抢滚动位置。
  useEffect(() => {
    if (!currentPublishId) return;
    const node = activeRef.current;
    if (!node) return;
    node.scrollIntoView({
      block: "nearest",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [currentPublishId]);

  const toggleSection = (id: number) =>
    setFolded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const postEntry = (post: DocPost) => {
    const active = post.publishId === currentPublishId;
    return (
      <li key={post.id} className="ink-doc-nav-item">
        <Link
          ref={active ? activeRef : undefined}
          to={blogRoute(
            "/blog/" + post.publishId + "?topic=" + encodeURIComponent(topic.slug),
          )}
          className="ink-doc-nav-link"
          data-active={active || undefined}
          aria-current={active ? "page" : undefined}
          onClick={onNavigate}
        >
          {/* 保持文字起点固定；选中标记由容器绘制，不参与布局。 */}
          <span className="ink-doc-nav-marker" aria-hidden="true" />
          <span className="ink-doc-nav-text">{post.title}</span>
        </Link>
      </li>
    );
  };



  return (
    <div className="ink-doc-sidebar" data-collapsed={collapsed || undefined}>
      <Link to={blogRoute("/blog/topics")} className="ink-doc-back-top" onClick={onNavigate}><Icon icon="tabler:arrow-left" width={15} />返回全部专题</Link>
      <div className="ink-doc-sidebar-head">
        <h2 className="ink-doc-sidebar-title">{topic.name}</h2>
        {topic.desc && <p className="ink-doc-sidebar-desc">{topic.desc}</p>}
      </div>

      <label className="ink-doc-search"><Icon icon="tabler:search" width={17} /><input ref={searchRef} type="search" aria-label="查找专题内容" placeholder="查找专题内容" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="清空专题搜索" onClick={() => { setQuery(''); searchRef.current?.focus(); }}><Icon icon="tabler:x" width={14} /></button>}</label>
      {!collapsed && (
        <div className="ink-doc-sidebar-list" ref={listRef}>
          <ul className="ink-doc-nav">
            <li className="ink-doc-nav-item">
              <Link
                to={blogRoute("/blog/t/" + topic.slug + "?view=overview")}
                className="ink-doc-nav-link is-overview"
                data-active={overviewActive || undefined}
                aria-current={overviewActive ? "page" : undefined}
                onClick={onNavigate}
              >
                <span className="ink-doc-nav-marker" aria-hidden="true"><Icon icon="tabler:file-text" width={18} /></span>
                <span className="ink-doc-nav-text">专题概述</span>
              </Link>
            </li>
          </ul>

          {shownSections.map((section) => {
            const showTitle = section.showTitle;

            const open = !!query.trim() || isOpen(section.id);
            return (
              <div className="ink-doc-nav-group" key={section.id}>
                {showTitle && (
                  <button
                    type="button"
                    className="ink-doc-nav-section"
                    data-open={open || undefined}
                    /* 当前文章所在的那一章适度强调一下 —— 只强调章节名，
                       整组文章不跟着变高亮。 */
                    data-current={
                      section.id === currentSectionId ? true : undefined
                    }
                    aria-expanded={open}
                    onClick={() => toggleSection(section.id)}
                  >
                    <span className="ink-doc-nav-section-name">{section.name}</span>
                    <Icon icon="tabler:chevron-down" width={15} className="ink-doc-nav-caret" />
                  </button>
                )}
                {/* 没有章节标题的分组（作者关掉了标题展示）直接平铺文章，
                    文章一篇都不能少。 */}
                {open || !showTitle ? (
                  <ul className="ink-doc-nav">{section.posts.map(postEntry)}</ul>
                ) : null}
              </div>
            );
          })}

          {shownUnassigned.length > 0 && (
            <div className="ink-doc-nav-group">
              <div className="ink-doc-nav-section is-static">
                <span className="ink-doc-nav-section-num">·</span>
                <span className="ink-doc-nav-section-name">其他文章</span>
                <span className="ink-doc-nav-section-count">
                  {unassigned.posts.length}
                </span>
              </div>
              <ul className="ink-doc-nav">{shownUnassigned.map(postEntry)}</ul>
            </div>
          )}

          {query.trim() && !shownSections.length && !shownUnassigned.length && <p className="ink-doc-sidebar-empty" role="status">没有找到相关文章，试试其他关键词。</p>}
          {directory.total === 0 && (
            <p className="ink-doc-sidebar-empty">
              这个专题还没有公开文章。
            </p>
          )}
        </div>
      )}

      {!collapsed && <div className="ink-doc-sidebar-foot">{directory.sectionCount}章 · {directory.total}篇文章</div>}
    </div>
  );
}
