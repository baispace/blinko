import { BlogInput, BlogCheckbox, BlogButton, BlogTabs, BlogTextarea } from "./BlogUI";
import { confirmBlogAction } from "./confirmBlogAction";
import { useEffect, useState } from "react";
import { api } from "@/lib/trpc";
import {
  blogSiteSettingsSchema,
  type BlogSiteSettings,
} from "@shared/lib/blogSiteSettings";
import { BlogTrackingSettings } from "./BlogTrackingSettings";
import { BlogDeploymentSettings } from "./BlogDeploymentSettings";
import { BlogSubscribeSettings } from "./BlogSubscribeSettings";
import { BlogFooterSettingsPanel } from "./BlogFooterSettings";
import { resolveSeoFields, BLOG_FIXED_PAGES } from "@shared/lib/blogSeo";
import { BlogSiteCheckPanel } from "./BlogSiteCheckPanel";
const defaults = blogSiteSettingsSchema.parse({});
const tabs = [
  ["basic", "站点信息"],
  ["subscribe", "订阅设置"],
  ["footer", "页脚与备案"],
  ["tracking", "统计接入"],
  ["deployment", "域名与部署"],
  ["checks", "站点检查"],
] as const;
/** 页签已经写了名字，这里补一句「这个分区管什么」，不再重复标题。 */
const TAB_HINT: Record<string, string> = {
  basic: "公开博客与私有工作区分别设置：名称、标语与站点图标只对外展示。",
  subscribe: "订阅页要用的渠道与文案：微信公众号、RSS、站点介绍与订阅说明。",
  footer: "页脚要挂的备案号、版权署名，以及带生效区间的推广位。",
  tracking: "接入统计代码，用来了解访客从哪来、看了多久。",
  deployment: "公开站对外的域名、构建产物与部署状态。",
  checks: "上线前自查：域名解析、页面可达与缓存是否正常。",
};
export function BlogSiteSettingsPanel({
  seo = false,
  onDirty,
}: {
  seo?: boolean;
  onDirty?: (dirty: boolean) => void;
}) {
  const [data, setData] = useState<BlogSiteSettings>(defaults),
    [saved, setSaved] = useState<BlogSiteSettings>(defaults),
    [revision, setRevision] = useState(""),
    [deployed, setDeployed] = useState(""),
    [tab, setTab] = useState("basic"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [backend, setBackend] = useState("");
  const load = async () => {
    if (
      JSON.stringify(data) !== JSON.stringify(saved) &&
      !await confirmBlogAction("有未保存修改，确定重新载入？")
    )
      return;
    try {
      const r = await api.blog.siteSettings.query();
      setData(r.data);
      setSaved(r.data);
      setRevision(r.revision);
      setDeployed(r.deployedOrigin);
      setBackend(r.backendOrigin);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const dirty = JSON.stringify(data) !== JSON.stringify(saved);
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);
  const patch = (p: Partial<BlogSiteSettings>) => {
    setData((d) => ({ ...d, ...p }));
    setMessage("");
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.blog.saveSiteSettings.mutate({ data, revision });
      setData(r.data);
      setSaved(r.data);
      setRevision(r.revision);
      setMessage("设置已保存。域名与接口配置仍需部署后验证。");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const field = (key: keyof BlogSiteSettings, label: string, hint = "") => (
    <label className="ink-admin-field">
      <span>{label}</span>
      <BlogInput
        className="ink-mg-field"
        value={String(data[key])}
        onChange={(e) => patch({ [key]: e.target.value })}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
  const toggle = (key: keyof BlogSiteSettings, label: string) => (
    <label className="ink-admin-toggle">
      <BlogCheckbox
        type="checkbox"
        checked={!!data[key]}
        onChange={(e) => patch({ [key]: e.target.checked })}
      />
      {label}
    </label>
  );  // 站点默认预览走共享解析器，和公开页、管理端预览用的是同一套规则。
  const sitePreview = resolveSeoFields({
    override: null,
    content: { title: "思考与实践", summary: null, coverUrl: null },
    site: {
      siteName: data.siteName || "",
      titleTemplate: data.titleTemplate,
      description: data.description,
      shareImage: data.shareImage,
    },
    fallbackTitle: "思考与实践",
    fallbackDescription: data.tagline,
  });
  return (
    <section className="ink-mg-section">
      {!seo && (
        <BlogTabs
          label="站点设置分区"
          value={tab}
          onChange={key => setTab(key as typeof tab)}
          items={tabs.map(([id, label]) => ({ key: id, label }))}
        />
      )}
      <div className="ink-mg-section-head">
        <p className="ink-mg-sub">
          {seo
            ? "为公开页面提供默认标题、描述与分享图片。文章可单独覆盖。"
            : TAB_HINT[tab]}
        </p>
        <BlogButton
          className="ink-mg-button"
          onClick={() => void load()}
          disabled={busy}
        >
          重新载入
        </BlogButton>
      </div>
      {error && (
        <p className="ink-mg-alert" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="ink-mg-note" role="status">
          {message}
        </p>
      )}
      {seo ? (
        <div className="ink-admin-columns">
          <div className="ink-mg-panel ink-mg-section">
            {field(
              "titleTemplate",
              "标题模板",
              "保留 {标题}；可用 {站点名称} 代表站点名，例如：{标题} · {站点名称}",
            )}
            {field("description", "站点默认描述")}
            {field(
              "shareImage",
              "默认分享图地址",
              "支持复用资源上传后得到的 HTTPS 地址",
            )}
            {toggle("allowIndex", "允许搜索引擎收录公开内容")}
            <p className="ink-mg-sub">
              私有笔记与撤回文章不会因启用收录而公开；关闭收录也不是访问控制，
              私有内容仍由公开查询的边界隔离。
            </p>
            <p className="ink-mg-sub">
              这里的规则只作用于「继承默认」的页面。已经单独设置过的文章、专题保持自己的覆盖值。
            </p>
          </div>
          <div className="ink-mg-panel">
            <h3>搜索预览</h3>
            <small>示例标题 · 站点默认规则</small>
            <h3 className="ink-admin-preview-title">{sitePreview.title}</h3>
            <p>{sitePreview.description || data.tagline}</p>
            <h3>固定页面</h3>
            <p className="ink-mg-sub">
              首页、专题索引与关于页在「内容 SEO → 固定页面」里单独设置。
            </p>
            <ul className="ink-seo-steps">
              {BLOG_FIXED_PAGES.map((p) => (
                <li key={p.key}>
                  {p.label} · {p.path}
                </li>
              ))}
            </ul>
            <h3>站点地图与 RSS</h3>
            <a href="/sitemap.xml" target="_blank" rel="noreferrer">
              查看站点地图 ↗
            </a>
            <p>
              <a href="/blog/feed.xml" target="_blank" rel="noreferrer">
                订阅公开文章 ↗
              </a>
            </p>
            <small>预览不代表搜索排名或已被收录。</small>
          </div>
        </div>
      ) : tab === "basic" ? (
        <div className="ink-admin-columns">
          <div className="ink-mg-panel ink-mg-section">
            {field("siteName", "公开站点名称")}
            {field("tagline", "站点标语")}
            {field(
              "iconUrl",
              "站点图标地址",
              "仅用于对外博客，不修改工作区标识。",
            )}
            <div className="ink-admin-field">
              {toggle("showPublicStats", "在关于页公开展示站点数据")}
              <small>
                展示累计阅读、读者回应、公开文章数与持续分享天数。关闭后关于页不再出现这块内容，
                数据本身不会被删除。统计口径只包含当前公开可访问的文章。
              </small>
            </div>
            <label className="ink-admin-field">
              <span>友情链接申请说明</span>
              <BlogTextarea
                className="ink-mg-field"
                minRows={4}
                value={data.friendApplyNote}
                placeholder="留空则公开页使用默认说明。"
                onChange={(e) => patch({ friendApplyNote: e.target.value })}
              />
              <small>
                公开友链页的「查看申请说明」展示这段文字，由你在后台维护。
              </small>
            </label>
          </div>
          <div className="ink-mg-panel">
            <h3>访客看到的站点标识</h3>
            {data.iconUrl && (
              <img
                src={data.iconUrl}
                className="ink-admin-icon-preview"
                alt="站点图标"
              />
            )}
            <h2>{data.siteName || "Ink"}</h2>
            <p>{data.tagline}</p>
            <small>作者头像、简介与其他站点地址请在「公开作者」中设置。</small>
          </div>
        </div>
      ) : tab === "subscribe" ? (
        <BlogSubscribeSettings
          subscribe={data.subscribe}
          patch={(p) => patch({ subscribe: { ...data.subscribe, ...p } })}
        />
      ) : tab === "footer" ? (
        <BlogFooterSettingsPanel
          footer={data.footer ?? defaults.footer}
          patch={(p) =>
            patch({ footer: { ...defaults.footer, ...data.footer, ...p } })
          }
        />
      ) : tab === "tracking" ? (
        <BlogTrackingSettings data={data} patch={patch} />
      ) : tab === "deployment" ? (
        <BlogDeploymentSettings
          data={data}
          patch={patch}
          deployedOrigin={deployed}
          backendOrigin={backend}
          onOpenCheck={() => setTab("checks")}
        />
      ) : (
        <BlogSiteCheckPanel target={data.targetOrigin} effective={deployed} />
      )}
      <div className="ink-admin-footer">
        <span>{dirty ? "有未保存修改" : "设置已同步"}</span>
        <BlogButton
          className="ink-mg-button ink-mg-button-primary"
          disabled={!revision || !dirty || busy}
          onClick={() => void save()}
        >
          {busy ? "保存中…" : seo ? "保存默认 SEO" : "保存站点设置"}
        </BlogButton>
      </div>
    </section>
  );
}
