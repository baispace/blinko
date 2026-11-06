import { BlogInput, BlogToggle, BlogDisclosure, BlogTabs, BlogTextarea, BlogSelect } from "./BlogUI";
import { Button, Card, CardBody } from "@heroui/react";
import { confirmBlogAction } from "./confirmBlogAction";
import { useEffect, useState } from "react";
import { api } from "@/lib/trpc";
import {
  blogSiteSettingsSchema,
  type BlogSiteSettings,
} from "@shared/lib/blogSiteSettings";
import { blogFontStack } from "@shared/lib/blogFont";
import { BlogTrackingSettings } from "./BlogTrackingSettings";
import { BlogSubscribeSettings } from "./BlogSubscribeSettings";
import { BlogFooterSettingsPanel } from "./BlogFooterSettings";
import { BlogDeploymentSettings } from "./BlogDeploymentSettings";
import { resolveSeoFields, toPublicPath } from "@shared/lib/blogSeo";
import type { BlogDeployment } from "@shared/lib/blogDeployment";
import { BlogSiteCheckPanel } from "./BlogSiteCheckPanel";

type BlogFontOption = {
  name: string;
  displayName: string;
  url: string | null;
  category: string;
};

const defaults = blogSiteSettingsSchema.parse({});
const tabs = [
  ["basic", "基础与展示"],
  ["subscribe", "订阅渠道"],
  ["seo", "搜索与统计"],
  ["deployment", "域名与发布"],
] as const;

const TAB_HINT: Record<string, string> = {
  basic: "管理公开站点的品牌、字体、页脚与备案信息。作者署名与简介在「公开作者」中维护。",
  seo: "公开内容自动生成搜索与分享信息；统计服务仅在公开站点加载。",
  subscribe: "设置微信公众号、RSS 与订阅说明。读者回复通知的发信配置在「邮件服务」中维护。",
  deployment: "设置公开博客域名，并检查上线后的访问与资源状态。",
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
    [backend, setBackend] = useState(""),
    [deployment, setDeployment] = useState<BlogDeployment | null>(null),
    [tab, setTab] = useState("basic"),
    [busy, setBusy] = useState(false),
    [checkOpen, setCheckOpen] = useState(false),
    [formVersion, setFormVersion] = useState(0),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [fonts, setFonts] = useState<BlogFontOption[]>([]);

  /*
   * 字体候选来自字体注册表。只有带样式表地址的才进列表 ——
   * 只存本地二进制的那种公开页拿不到本体，列出来选了就等于没选。
   */
  useEffect(() => {
    void api.fonts.list
      .query()
      .then((list) =>
        setFonts(
          (list as BlogFontOption[]).filter(
            (font) => !!font.url && font.name !== "default",
          ),
        ),
      )
      .catch(() => setFonts([]));
  }, []);

  /* 预览要用真字体：把选中字体的 @font-face 样式表挂到后台页面上。 */
  const previewFont = fonts.find((font) => font.name === data.fontFamily);
  useEffect(() => {
    if (!previewFont?.url) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = previewFont.url;
    link.dataset.inkBlogFontPreview = previewFont.name;
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, [previewFont?.url, previewFont?.name]);

  const load = async () => {
    if (
      JSON.stringify(data) !== JSON.stringify(saved) &&
      !await confirmBlogAction("有未保存修改，确定重新载入？")
    )
      return;
    setBusy(true);
    try {
      const r = await api.blog.siteSettings.query();
      setFormVersion(version => version + 1);
      setData(r.data);
      setSaved(r.data);
      setRevision(r.revision);
      setDeployed(r.deployedOrigin);
      setBackend(r.backendOrigin ?? "");
      setDeployment(r.deployment ?? null);
      setError("");
      setMessage("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const dirty = JSON.stringify(data) !== JSON.stringify(saved);
  useEffect(() => {
    onDirty?.(dirty || busy || uploading);
    return () => onDirty?.(false);
  }, [dirty, busy, uploading, onDirty]);

  const patch = (p: Partial<BlogSiteSettings>) => {
    if (busy) return;
    setData((d) => ({ ...d, ...p }));
    setMessage("");
  };

  /**
   * 预览链接要指向读者真正访问的地址。
   *
   * 生效中的公开域名来自 BLOG_PUBLIC_URL，公开基础路径存在数据库里。
   * 博客挂到独立域名的根路径后，内部路径 /blog/feed.xml 对外的地址是 /feed.xml ——
   * 预览链接如果还写死内部路径，看到的就是旧地址，不是读者看到的那份。
   */
  const publicPreviewUrl = (internalPath: string) => {
    const origin = (deployed || window.location.origin).replace(/\/+$/, "");
    const basePath = deployment?.publicBasePath ?? saved.publicBasePath ?? "/blog";
    return origin + toPublicPath(internalPath, basePath);
  };

  const save = async () => {
    if (data.domainRouting && data.targetOrigin) {
      try {
        const host = new URL(data.targetOrigin).host;
        if (host === window.location.host || (backend && host === new URL(backend).host)) {
          setError("博客域名必须与当前后台域名不同，避免覆盖后台入口。");
          return;
        }
      } catch { setError("请输入完整的博客地址，例如 https://blog.baispace.cn"); return; }
    }
    setBusy(true);
    setError("");
    try {
      const r = await api.blog.saveSiteSettings.mutate({ data, revision });
      setData(r.data);
      setSaved(r.data);
      setRevision(r.revision);
      const domainChanged = ["targetOrigin", "domainRouting", "publicBasePath", "apiOrigin", "deploymentMode"].some(key => data[key as keyof BlogSiteSettings] !== saved[key as keyof BlogSiteSettings]);
      setMessage(domainChanged ? "博客域名设置已保存，请完成部署并运行站点检查。" : "设置已保存。");
      // Refresh resolved links without replacing the successfully saved draft.
      void api.blog.siteSettings.query().then(next => {
        setDeployed(next.deployedOrigin); setDeployment(next.deployment ?? null); setBackend(next.backendOrigin ?? "");
      }).catch(() => {});
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
    <BlogToggle
      label={label}
      checked={!!data[key]}
      onChange={(v) => patch({ [key]: v })}
    />
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
    <section className="blog-site-settings flex min-w-0 flex-col gap-4">
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
          isDisabled={busy || uploading}
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

      <fieldset disabled={busy || !revision} className="m-0 min-w-0 border-0 p-0">
      {tab === "seo" ? (
        <div className="flex flex-col gap-5"><div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <Card className="rounded-xl border border-default-200 shadow-none">
            <CardBody className="flex flex-col gap-3 p-4">
              <p className="text-sm text-default-500">默认使用文章标题、摘要和封面生成搜索与分享信息。</p>
              <BlogDisclosure title="自定义站点默认规则"><div className="flex flex-col gap-4">
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
              </div></BlogDisclosure>
              {toggle("allowIndex", "允许搜索引擎收录公开内容")}
              <p className="text-xs text-default-500">
                私有笔记与撤回文章不会因启用收录而公开；关闭收录也不是访问控制，
                私有内容仍由公开查询的边界隔离。
              </p>
            </CardBody>
          </Card>
          <Card className="rounded-xl border border-default-200 shadow-none">
            <CardBody className="flex flex-col gap-3 p-4">
              <div>
                <h3 className="text-sm font-semibold">搜索预览</h3>
                <small className="text-xs text-default-500">示例标题 · 站点默认规则</small>
              </div>
              <h3 className="text-lg font-semibold leading-snug">{sitePreview.title}</h3>
              <p className="text-sm text-default-600">{sitePreview.description || data.tagline}</p>
              <div>
                <h3 className="text-sm font-semibold">站点地图与 RSS</h3>
                <a
                  className="text-sm text-primary hover:underline"
                  href={publicPreviewUrl("/sitemap.xml")}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看站点地图 ↗
                </a>
                <br />
                <a
                  className="text-sm text-primary hover:underline"
                  href={publicPreviewUrl("/blog/feed.xml")}
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
        <div className="border-t border-default-200 pt-5">
          <h3 className="mb-4 text-base font-semibold">统计接入</h3>
          <BlogTrackingSettings data={data} patch={patch} />
        </div></div>
      ) : tab === "basic" ? (
        <div className="flex flex-col gap-4">
          <Card className="rounded-xl border border-default-200 shadow-none">
            <CardBody className="grid grid-cols-1 gap-x-5 gap-y-4 p-4 md:grid-cols-2">
              {field(
                "siteName",
                "站点品牌名",
                "用于导航、页脚与搜索分享；留空沿用工作区名称。",
              )}
              {field(
                "tagline",
                "站点标语",
                "全站共用的一句话介绍，展示于页脚、关于页等位置。",
              )}
              {field(
                "iconUrl",
                "站点图标地址",
                "仅用于对外博客，不修改工作区标识。",
              )}
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">前台字体</span>
                <BlogSelect
                  className="w-full"
                  value={data.fontFamily}
                  onChange={(e) => patch({ fontFamily: e.target.value })}
                >
                  <option value="">系统默认（PingFang / 微软雅黑）</option>
                  {fonts.map((font) => (
                    <option key={font.name} value={font.name}>
                      {font.displayName}
                    </option>
                  ))}
                </BlogSelect>
                <small className="text-xs text-default-500">
                  来自应用字体库；留空使用系统字体。
                </small>
                <p
                  className="mt-1 text-base text-default-700"
                  style={{
                    fontFamily: blogFontStack(data.fontFamily),
                  }}
                >
                  {data.tagline || "记录思考与实践，让经验成为有脉络的内容。"}
                </p>

              </label>
              <div className="flex flex-col gap-1.5 md:col-span-2">
                {toggle("showPublicStats", "在关于页公开展示站点数据")}
                <small className="text-xs text-default-500">
                  展示公开内容的阅读、回应与积累数据；关闭后保留统计记录。
                </small>
              </div>
              <label className="flex flex-col gap-1.5 md:col-span-2">
                <span className="text-sm font-medium">友情链接申请说明</span>
                <BlogTextarea
                  className="w-full"
                  minRows={3}
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
        <Card className="rounded-xl border border-default-200 bg-content1 shadow-none">
          <CardBody className="p-4">
            <BlogDisclosure title="页脚与备案" titleClass="font-semibold text-foreground">
              <BlogFooterSettingsPanel
                footer={data.footer ?? defaults.footer}
                patch={(p) => patch({ footer: { ...defaults.footer, ...data.footer, ...p } })}
              />
            </BlogDisclosure>
          </CardBody>
        </Card></div>
      ) : tab === "subscribe" ? (
        <BlogSubscribeSettings
          key={formVersion}
          subscribe={data.subscribe}
          onUploading={setUploading}
          patch={(p) => patch({ subscribe: { ...data.subscribe, ...p } })}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <BlogDeploymentSettings
            data={data}
            patch={patch}
            deployedOrigin={deployed}
            backendOrigin={backend}
            deployment={deployment}
            onOpenCheck={() => setCheckOpen(true)}
          />
          <Card className="rounded-xl border border-default-200 bg-content1 shadow-none">
            <CardBody className="p-4">
              <BlogDisclosure title="上线检查" titleClass="font-semibold text-foreground" open={checkOpen} onOpenChange={setCheckOpen}>
                {dirty && <p className="mb-4 text-sm text-warning">有未保存的设置。请先保存，再检查实际生效的站点。</p>}
                <BlogSiteCheckPanel target={saved.targetOrigin} effective={deployed} />
              </BlogDisclosure>
            </CardBody>
          </Card>
        </div>
      )}

      </fieldset>
      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-xl border border-default-200 bg-content1 px-5 py-3">
        <span className="text-sm text-default-500">
          {dirty ? "有未保存修改" : "设置已同步"}
        </span>
        <Button
          size="sm"
          color="primary"
          isDisabled={!revision || !dirty || busy || uploading}
          onPress={() => void save()}
        >
          {busy ? "保存中…" : "保存站点设置"}
        </Button>
      </div>
    </section>
  );
}
