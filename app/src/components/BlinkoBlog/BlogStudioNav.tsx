import { BlogButton } from "./BlogUI";
import { Icon } from "@/components/Common/Iconify/icons";
import { STUDIO_NAV, type StudioSection } from "./studioNav";

type Props = {
  section: StudioSection;
  onSelect: (key: StudioSection) => void;
  /** 折叠态只留图标轨，文字靠 title / aria-label 兜底。 */
  collapsed: boolean;
  siteName: string;
  avatarSrc: string;
  postCount: number;
  topicCount: number;
  onBack: () => void;
};

/**
 * 博客后台的左侧导航。
 *
 * 结构照着 YouTube Studio 来：上面是站点身份块，中间是分组导航，
 * 底下是退出类的操作。分组只在 studioNav.ts 里定义一次，
 * 主内容区的标题也从同一份模型取，两边不会各写一套。
 * 明暗切换放在顶栏，这里不重复放。
 */
export function BlogStudioNav({
  section,
  onSelect,
  collapsed,
  siteName,
  avatarSrc,
  postCount,
  topicCount,
  onBack,
}: Props) {
  return (
    <aside className="ink-studio-side" aria-label="博客管理导航">
      <div className="ink-studio-identity">
        <span className="ink-studio-avatar">
          {avatarSrc ? (
            <img src={avatarSrc} alt="" />
          ) : (
            <Icon icon="tabler:user-circle" width={22} />
          )}
        </span>
        <span className="ink-studio-identity-text">
          <strong>{siteName}</strong>
          <small>我的博客</small>
        </span>
      </div>

      <nav className="ink-studio-nav">
        {STUDIO_NAV.map((group) => (
          <div className="ink-studio-nav-group" key={group.title}>
            <p className="ink-studio-nav-title">{group.title}</p>
            {group.items.map((item) => (
              <BlogButton
                key={item.key}
                type="button"
                className="ink-studio-nav-item"
                aria-current={section === item.key ? "page" : undefined}
                title={collapsed ? item.label : item.hint}
                onClick={() => onSelect(item.key)}
              >
                <Icon icon={item.icon} width={18} />
                <span className="ink-studio-nav-label">{item.label}</span>
                {item.key === "posts" && (
                  <span className="ink-studio-nav-count">{postCount}</span>
                )}
                {item.key === "topics" && (
                  <span className="ink-studio-nav-count">{topicCount}</span>
                )}
              </BlogButton>
            ))}
          </div>
        ))}
      </nav>

      <div className="ink-studio-side-foot">
        <BlogButton
          type="button"
          className="ink-studio-nav-item"
          onClick={onBack}
          title="返回笔记"
        >
          <Icon icon="tabler:arrow-left" width={18} />
          <span className="ink-studio-nav-label">返回笔记</span>
        </BlogButton>
      </div>
    </aside>
  );
}
