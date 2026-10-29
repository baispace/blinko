/**
 * 博客后台（Studio）的导航模型。
 *
 * 为什么单独抽一份：侧边栏负责"能去哪儿"，主内容区负责"这一页叫什么"，
 * 两者说的是同一批分区，抽成一份模型后不会出现"侧边栏改了、标题忘了改"。
 */

/** 后台的全部分区。深链 ?section=xxx 用的是同一批键。 */
export type StudioSection =
  | "settings"
  | "posts"
  | "topics"
  | "covers"
  | "distribution"
  | "profile"
  | "friends"
  | "feedback"
  | "mail"
  | "stats";

/** 深链用的分区键：/blog-manage?section=topics 可以直接落到对应分区。 */
export const STUDIO_SECTION_KEYS: StudioSection[] = [
  "posts",
  "topics",
  "covers",
  "friends",
  "feedback",
  "stats",
  "distribution",
  "settings",
  "mail",
  "profile",
];

export type StudioNavItem = {
  key: StudioSection;
  label: string;
  /** 图标名必须是本地图标库里有的名字，未命中会渲染成空白。 */
  icon: string;
  /** 一句话说明：折叠态靠它当 tooltip。 */
  hint: string;
};

export type StudioNavGroup = {
  title: string;
  items: StudioNavItem[];
};

/**
 * 侧边栏的分组顺序：内容 → 读者 → 数据 → 设置。
 * 低频设置收进设置页的二级导航，一级菜单只保留高频入口。
 */
export const STUDIO_NAV: StudioNavGroup[] = [
  {
    title: "内容",
    items: [
      {
        key: "posts",
        label: "文章",
        icon: "tabler:files",
        hint: "已发布文章、发布状态与公开版本",
      },
      {
        key: "topics",
        label: "专题",
        icon: "tabler:layout-grid",
        hint: "组织文章的阅读脉络",
      },
      {
        key: "covers",
        label: "封面资源",
        icon: "tabler:photo",
        hint: "公开封面与 AI 生成",
      },
    ],
  },
  {
    title: "读者",
    items: [
      {
        key: "feedback",
        label: "读者反馈",
        icon: "tabler:message",
        hint: "读者对文章与动态的私密反馈与回复",
      },
      {
        key: "friends",
        label: "友链管理",
        icon: "tabler:world",
        hint: "友链申请、审核与公开展示",
      },
    ],
  },
  {
    title: "数据",
    items: [
      {
        key: "stats",
        label: "数据分析",
        icon: "tabler:analyze",
        hint: "站点表现、访客与内容分析",
      },
      {
        key: "distribution",
        label: "推荐分发",
        icon: "tabler:share-2",
        hint: "公开站里文章的排序规则",
      },
    ],
  },
  {
    title: "设置",
    items: [
      {
        key: "settings",
        label: "站点设置",
        icon: "tabler:settings",
        hint: "基础信息、域名与部署、统计接入",
      },
      {
        key: "profile",
        label: "公开作者",
        icon: "tabler:user-circle",
        hint: "对外展示的作者资料与链接",
      },
      {
        key: "mail",
        label: "邮件服务",
        icon: "tabler:at",
        hint: "SMTP 配置，友链通知与读者回复",
      },
    ],
  },
];

/** 每个分区在主内容区顶部的标题与说明。 */
export const STUDIO_SECTION_META: Record<
  StudioSection,
  { title: string; desc: string }
> = {
  posts: { title: "文章", desc: "管理已发布的文章与公开版本" },
  topics: { title: "专题", desc: "组织文章的阅读脉络" },
  covers: { title: "封面资源", desc: "维护公开封面与生成结果" },
  friends: { title: "友链管理", desc: "审核友链申请并管理公开展示" },
  feedback: { title: "读者反馈", desc: "处理读者对文章与动态的私密反馈" },
  stats: { title: "数据分析", desc: "查看站点表现、访客与内容分析" },
  distribution: { title: "推荐分发", desc: "决定公开站里文章的排序规则" },
  settings: { title: "站点设置", desc: "基础信息、域名与部署、统计接入" },
  mail: { title: "邮件服务", desc: "SMTP 配置：友链通知与读者回复通知" },
  profile: { title: "公开作者", desc: "对外展示的作者资料与链接" },
};
