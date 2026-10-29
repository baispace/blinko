import { BlogInput, BlogCheckbox, BlogTabs, BlogTextarea } from "./BlogUI";
import { Button, Card, CardBody } from "@heroui/react";
import { confirmBlogAction } from "./confirmBlogAction";
import { useEffect, useState } from "react";
import { api } from "@/lib/trpc";
import {
  blogSiteSettingsSchema,
  type BlogSiteSettings,
} from "@shared/lib/blogSiteSettings";
import { BlogTrackingSettings } from "./BlogTrackingSettings";
import { BlogSubscribeSettings } from "./BlogSubscribeSettings";
import { BlogFooterSettingsPanel } from "./BlogFooterSettings";
import { resolveSeoFields, BLOG_FIXED_PAGES } from "@shared/lib/blogSeo";
import { BlogSiteCheckPanel } from "./BlogSiteCheckPanel";

const defaults = blogSiteSettingsSchema.parse({});
const tabs = [
  ["basic", "站点信息"],
  ["seo", "SEO"],
  ["subscribe", "订阅设置"],
  ["footer", "页脚与备案"],
  ["tracking", "统计接入"],
  ["checks", "站点检查"],
] as const;

const TAB_HINT: Record<string, string> = {
  basic: "公开博客与私有工作区分别设置：名称、标语与站点图标只对外展示。",
  seo: "公开页面的默认标题模板、描述、分享图与搜索引擎收录开关。文章自动继承，也可在底层单独覆盖。",
  subscribe: "订阅页要用的渠道与文案：微信公众号、RSS、站点介绍与订阅说明。",
  footer: "页脚要挂的备案号、版权署名，以及带生效区间的推广位。",
  tracking: "接入统计代码，用来了解访客从哪来、看了多久。",
  checks: "上线前自查：域名解析、页面可达与缓存是否正常。",
};

export function BlogSiteSettingsPanel({
  onDirty,
}: {
  onDirty?: (dirty: boolean) => void;
}) {
  const [data, setData] = useState<BlogSiteSettings>(defaults),
    [saved, setSaved] = useState<BlogSiteSettings>(defaults),
    [revision, setRevision] = useState(""),
    [deployed, setDeployed] = useState(""),
    [tab, setTab] = useState("basic"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");

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
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <BlogInput
        className="w-full"
        value={String(data[key])}
        onChange={(e) => patch({ [key]: e.target.value })}
      />
      {hint && <small className="text-xs text-default-500">{hint}</small>}
    </label>
  );

  const toggle = (key: keyof BlogSiteSettings, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <BlogCheckbox
        type="checkbox"
        checked={!!data[key]}
        onChange={(e) => patch({ [key]: e.target.checked })}
      />
      {label}
    </label>
  );

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
    <section className="space-y-5">
      <BlogTabs
        label="站点设置分区"
        value={tab}
        onChange={key => setTab(key as typeof tab)}
        items={tabs.map(([id, label]) => ({ key: id, label }))}
      />

      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-default-500">{TAB_HINT[tab]}</p>
        <Button
          size="sm"
          variant="flat"
          isDisabled={busy}
          onPress={() => void load()}
        >
          重新载入
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </div>
      )}
      {message && (
        <p className="rounded-xl bg-success-50 px-4 py-3 text-sm text-success" role="status">
          {message}
        </p>
      )}

      {tab === "seo" ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card className="rounded-xl border border-default-200 shadow-none">
            <CardBody className="space-y-4">
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
              <p className="text-xs text-default-500">
                私有笔记与撤回文章不会因启用收录而公开；关闭收录也不是访问控制，
                私有内容仍由公开查询的边界隔离。
              </p>
            </CardBody>
          </Card>
          <Card className="rounded-xl border border-default-200 shadow-none">
            <CardBody className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">搜索预览</h3>
                <small className="text-xs text-default-500">示例标题 · 站点默认规则</small>
              </div>
              <h3 className="text-lg font-semibold leading-snug">{sitePreview.title}</h3>
              <p className="text-sm text-default-600">{sitePreview.description || data.tagline}</p>
              <div>
                <h3 className="text-sm font-semibold">固定页面</h3>
                <p className="text-xs text-default-500">
                  首页、专题索引与关于页等固定页面使用站点默认规则，无需单独设置。
                </p>
                <ul className="mt-2 space-y-1 text-sm text-default-600">
                  {BLOG_FIXED_PAGES.map((p) => (
                    <li key={p.key}>
                      {p.label} · <span className="text-default-400">{p.path}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold">站点地图与 RSS</h3>
                <a
                  className="text-sm text-primary hover:underline"
                  href="/sitemap.xml"
                  target="_blank"
                  rel="noreferrer"
                >
                  查看站点地图 ↗
                </a>
                <br />
                <a
                  className="text-sm text-primary hover:underline"
                  href="/blog/feed.xml"
                  target="_blank"
                  rel="noreferrer"
                >
                  订阅公开文章 ↗
                </a>
              </div>
              <small className="text-xs text-default-400">预览不代表搜索排名或已被收录。</small>
            </CardBody>
          </Card>
        </div>
      ) : tab === "basic" ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card className="rounded-xl border border-default-200 shadow-none">
            <CardBody className="space-y-4">
              {field("siteName", "公开站点名称")}
              {field("tagline", "站点标语")}
              {field(
                "iconUrl",
                "站点图标地址",
                "仅用于对外博客，不修改工作区标识。",
              )}
              <div className="flex flex-col gap-1.5">
                {toggle("showPublicStats", "在关于页公开展示站点数据")}
                <small className="text-xs text-default-500">
                  展示累计阅读、读者回应、公开文章数与持续分享天数。关闭后关于页不再出现这块内容，
                  数据本身不会被删除。统计口径只包含当前公开可访问的文章。
                </small>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">友情链接申请说明</span>
                <BlogTextarea
                  className="w-full"
                  minRows={4}
                  value={data.friendApplyNote}
                  placeholder="留空则公开页使用默认说明。"
                  onChange={(e) => patch({ friendApplyNote: e.target.value })}
                />
                <small className="text-xs text-default-500">
                  公开友链页的「查看申请说明」展示这段文字，由你在后台维护。
                </small>
              </label>
            </CardBody>
          </Card>
          <Card className="rounded-xl border border-default-200 shadow-none">
            <CardBody className="space-y-3">
              <h3 className="text-sm font-semibold">访客看到的站点标识</h3>
              {data.iconUrl && (
                <img
                  src={data.iconUrl}
                  className="h-12 w-12 rounded-lg"
                  alt="站点图标"
                />
              )}
              <h2 className="text-lg font-bold">{data.siteName || "Ink"}</h2>
              <p className="text-sm text-default-600">{data.tagline}</p>
              <small className="text-xs text-default-500">
                作者头像、简介与其他站点地址请在「公开作者」中设置。
              </small>
            </CardBody>
          </Card>
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
      ) : (
        <BlogSiteCheckPanel target={data.targetOrigin} effective={deployed} />
      )}

      <div className="flex items-center justify-between rounded-xl border border-default-200 bg-surface px-5 py-3">
        <span className="text-sm text-default-500">
          {dirty ? "有未保存修改" : "设置已同步"}
        </span>
        <Button
          size="sm"
          color="primary"
          isDisabled={!revision || !dirty || busy}
          onPress={() => void save()}
        >
          {busy ? "保存中…" : "保存站点设置"}
        </Button>
      </div>
    </section>
  );
}
