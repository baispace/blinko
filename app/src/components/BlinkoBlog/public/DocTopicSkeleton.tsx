/**
 * 文档模式专题页的加载态。
 *
 * 解析「默认打开哪一篇」需要一次目录请求。这段时间里不能闪一下专题概述
 * 再跳正文 —— 读者会以为点错了。所以这里摆一份和文档版式同尺寸的骨架：
 * 左边是目录栏，右边是正文栏，位置和真页面一一对应，跳过去时不会错位。
 */
export function DocTopicSkeleton() {
  return (
    <main className="ink-doc-layout" aria-busy="true" role="status">
      <span className="ink-doc-sr-only">正在打开专题…</span>
      <aside className="ink-doc-side">
        <div className="ink-doc-sidebar">
          <div className="ink-doc-sidebar-head">
            <div className="ink-doc-skeleton-line is-title" />
            <div className="ink-doc-skeleton-line is-desc" />
          </div>
          <div className="ink-doc-sidebar-bar">
            <div className="ink-doc-skeleton-line is-bar" />
          </div>
          <div className="ink-doc-sidebar-list">
            {[64, 88, 52, 78, 60].map((width, index) => (
              <div
                className="ink-doc-skeleton-line is-item"
                key={index}
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        </div>
      </aside>
      <div className="ink-doc-main">
        <div className="ink-doc-skeleton-main">
          <div className="ink-doc-skeleton-line is-crumb" />
          <div className="ink-doc-skeleton-line is-h1" />
          <div className="ink-doc-skeleton-line is-text" />
          <div className="ink-doc-skeleton-line is-text is-short" />
          <div className="ink-doc-skeleton-line is-meta" />
          <div className="ink-doc-skeleton-line is-body" />
          <div className="ink-doc-skeleton-line is-body" />
        </div>
      </div>
    </main>
  );
}
