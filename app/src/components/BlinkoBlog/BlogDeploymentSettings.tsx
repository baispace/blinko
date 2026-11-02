import { BlogCheckbox, BlogInput, BlogSelect } from "./BlogUI";
import { Button, Card, CardBody } from "@heroui/react";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Common/Iconify/icons";
import type { BlogSiteSettings } from "@shared/lib/blogSiteSettings";
import type { BlogDeployment } from "@shared/lib/blogDeployment";
import { normalizeBasePath } from "@shared/lib/blogSeo";

/**
 * 域名与部署。
 *
 * 三件事必须分清楚：
 *   1. 目标配置 —— 你希望使用的域名、路径、API。
 *   2. 当前生效 —— 服务端现在实际在用的地址（BLOG_PUBLIC_URL 等环境变量）。
 *   3. 检测结果 —— 某次检查在某个环境里跑出来的结论。
 * 保存目标配置不会创建 DNS、不会改服务器，也不代表域名已经上线。
 */

/**
 * 反向代理模板。
 *
 * 两个坑写在这里，不要靠记忆：
 * - 根路径必须精确匹配且不带尾斜杠，否则应用 301 到内部 /blog，
 *   公开域名下 /blog 又被映射成内部 /blog/blog，浏览器陷入重定向循环。
 * - 公开 API 不能只写 blog.public 前缀：trackView / recommendationEvent /
 *   reportTrackingState 不以 public 开头，漏掉它们会让阅读统计和读者回应静默失败。
 */
const NGINX_TEMPLATE = `# 公开站点：https://blog.example.com
# 只映射公开页面与公开资源；工作区、登录页、管理接口一律不放行。
server {
  listen 443 ssl http2;
  server_name blog.example.com;

  ssl_certificate     /etc/letsencrypt/live/blog.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/blog.example.com/privkey.pem;

  # 根路径：精确匹配到内部 /blog，不带尾斜杠。
  location = / {
    proxy_pass http://127.0.0.1:1111/blog;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # 其余公开页面：根路径映射到应用的 /blog
  location / {
    proxy_pass http://127.0.0.1:1111/blog/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # 站点地图索引与 robots：内部固定在根路径，不在 /blog 下
  location = /sitemap.xml { proxy_pass http://127.0.0.1:1111/sitemap.xml; proxy_set_header Host $host; }
  location = /robots.txt  { proxy_pass http://127.0.0.1:1111/robots.txt;  proxy_set_header Host $host; }

  # 公开 API：只放行真正公开的路由。
  # trackView / recommendationEvent / reportTrackingState 不以 public 开头，
  # 只写 blog.public 前缀会漏掉它们 —— 阅读统计和读者回应会静默失败。
  location ~ ^/api/trpc/blog\\.(public[A-Za-z]+|trackView|recommendationEvent|reportTrackingState)$ {
    proxy_pass http://127.0.0.1:1111;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # 公开资源
  location /assets/      { proxy_pass http://127.0.0.1:1111; proxy_set_header Host $host; }
  location /font-assets/ { proxy_pass http://127.0.0.1:1111; proxy_set_header Host $host; }
  location /icons/       { proxy_pass http://127.0.0.1:1111; proxy_set_header Host $host; }
  location /locales/     { proxy_pass http://127.0.0.1:1111; proxy_set_header Host $host; }
}`;

export function BlogDeploymentSettings({
  data,
  patch,
  deployedOrigin,
  backendOrigin,
  deployment,
  onOpenCheck,
}: {
  data: BlogSiteSettings;
  patch: (p: Partial<BlogSiteSettings>) => void;
  deployedOrigin: string;
  backendOrigin: string;
  /** 服务端算好的生效部署参数，以及「哪个字段由环境变量接管」 */
  deployment?: BlogDeployment | null;
  onOpenCheck: () => void;
}) {
  const [showDoc, setShowDoc] = useState(false);
  const owned = deployment?.envOwned;
  // 环境变量接管的字段显示生效值并置为只读 ——
  // 「改了没反应」比「不能改」更难查。
  const effectiveBasePath = owned?.publicBasePath
    ? deployment!.publicBasePath
    : normalizeBasePath(data.publicBasePath) || "/blog";
  const effectiveLegacyBase = owned?.legacyBasePath
    ? deployment!.legacyBasePath
    : normalizeBasePath(data.legacyBasePath) || "";
  const effectiveLegacyEnabled = owned?.legacyRedirectEnabled
    ? deployment!.legacyRedirectEnabled
    : !!data.legacyRedirectEnabled;
  const basePath = effectiveBasePath;
  const legacyBase = effectiveLegacyBase;

  const targetAligned = useMemo(() => {
    const target = deployment?.targetOrigin || data.targetOrigin;
    if (!target || !deployedOrigin) return false;
    try {
      return new URL(target).origin === new URL(deployedOrigin).origin;
    } catch {
      return false;
    }
  }, [deployment?.targetOrigin, data.targetOrigin, deployedOrigin]);

  const samples = useMemo(() => {
    // 旧地址用当前实际生效的地址，新地址用目标地址。
    const target = deployment?.targetOrigin || data.targetOrigin;
    const fromOrigin =
      deployedOrigin || target || "https://blog.example.com";
    const toOrigin = target || deployedOrigin || "https://blog.example.com";
    const rest = (p: string) => {
      const clean =
        legacyBase && p.startsWith(legacyBase)
          ? p.slice(legacyBase.length) || "/"
          : p;
      return basePath === "/" ? clean : basePath.replace(/\/+$/, "") + clean;
    };
    return [
      { label: "旧首页", from: "/blog", to: rest("/blog") },
      { label: "旧文章", from: "/blog/{id}", to: rest("/blog/{id}") },
      { label: "旧专题", from: "/blog/t/{slug}", to: rest("/blog/t/{slug}") },
    ].map((s) => ({
      ...s,
      fromUrl: fromOrigin + s.from,
      toUrl: toOrigin + s.to,
    }));
  }, [deployment?.targetOrigin, data.targetOrigin, deployedOrigin, basePath, legacyBase]);

  const field = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    hint: string,
    placeholder = "",
    readOnly = false,
    envVar?: string,
  ) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <BlogInput
        className="w-full"
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
      <small className="text-xs text-default-500">
        {envVar ? (
          <>
            由环境变量 <code className="rounded bg-default-100 px-1 py-0.5">{envVar}</code>{" "}
            接管，改它要改容器的 environment 段并重建。{hint}
          </>
        ) : (
          hint
        )}
      </small>
    </label>
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="rounded-xl border border-default-200 shadow-none">
        <CardBody className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl bg-primary-50 p-3 text-sm text-default-700">
            <Icon icon="tabler:info-circle" width={16} className="mt-0.5 shrink-0 text-primary" />
            <span>
              这里保存的是<strong>待部署目标</strong>：不会创建 DNS、不会改服务器配置，
              也不会让服务端立刻改用新域名。真正生效以后，以「当前实际生效地址」为准。
              {owned && (
                <>
                  <br />
                  标着「由环境变量接管」的字段由容器的 environment 段决定，
                  在这里改不会生效 —— 那是有意为之，避免「改了没反应」。
                </>
              )}
            </span>
          </div>

          {field(
            "目标公开站点地址",
            data.targetOrigin,
            (v) => patch({ targetOrigin: v.trim() }),
            owned?.targetOrigin
              ? "留空则使用环境变量 BLOG_PUBLIC_URL 的值；填了就以这里为准。"
              : "这是你希望使用的公开站点地址；保存不会自动创建 DNS 或部署服务。",
            "https://blog.example.com",
          )}

          {field(
            "公开前端基础路径",
            effectiveBasePath,
            (v) => patch({ publicBasePath: v.trim() }),
            `公开域名下博客挂载的路径，例如 / 或 /blog。当前生效：${basePath}`,
            "/blog",
            owned?.publicBasePath,
            owned?.publicBasePath ? "BLOG_PUBLIC_BASE_PATH" : undefined,
          )}

          {field(
            "公开 API 基础地址",
            data.apiOrigin,
            (v) => patch({ apiOrigin: v.trim() }),
            "前后端分开部署时公开前端访问的 API 根地址，接口路径由程序拼接为 /api/trpc。公开前端是纯静态产物时，这个地址需要写进构建变量并重新构建，不会因为在这里保存就自动生效。",
            "https://api.example.com",
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">部署方式</span>
            <BlogSelect
              className="w-full"
              value={data.deploymentMode}
              onChange={(e) =>
                patch({ deploymentMode: e.target.value as "proxy" | "separate" })
              }
            >
              <option value="proxy">同服务路径映射</option>
              <option value="separate">前后端分开部署</option>
            </BlogSelect>
            <small className="text-xs text-default-500">
              {data.deploymentMode === "proxy"
                ? "公开域名由网关映射到现有 /blog，服务端继续提供首屏元信息，SEO 完整。"
                : "公开前端单独构建部署时首屏没有服务端元信息，需要预渲染或由后端下发首屏标签；公开 API 需要单独配置跨域白名单。"}
            </small>
          </label>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm">
              <BlogCheckbox
                type="checkbox"
                checked={effectiveLegacyEnabled}
                disabled={owned?.legacyRedirectEnabled}
                onChange={(e) => patch({ legacyRedirectEnabled: e.target.checked })}
              />
              旧地址永久跳转到对应新地址（301）
            </label>
            <small className="text-xs text-default-500">
              {owned?.legacyRedirectEnabled ? (
                <>
                  由环境变量{" "}
                  <code className="rounded bg-default-100 px-1 py-0.5">BLOG_LEGACY_REDIRECT</code>{" "}
                  接管，改它要改容器的 environment 段并重建。
                </>
              ) : (
                <>
                  只在目标站点部署并验证后再开启。只迁移公开路径，工作区路径不迁移；
                  与目标同域时服务端不会跳转（避免死循环），这种情况请在网关上配 301。
                </>
              )}
            </small>
          </div>

          {field(
            "旧公开路径前缀",
            effectiveLegacyBase,
            (v) => patch({ legacyBasePath: v.trim() }),
            "旧地址的前缀，例如 /blog；留空表示不做路径迁移。",
            "/blog",
            owned?.legacyBasePath,
            owned?.legacyBasePath ? "BLOG_LEGACY_BASE_PATH" : undefined,
          )}

          {targetAligned && (
            <p className="text-xs text-default-500">
              目标地址与服务端当前生效地址一致，保存后不会改变任何线上输出。
            </p>
          )}
        </CardBody>
      </Card>

      <div className="flex flex-col gap-5">
        <Card className="rounded-xl border border-default-200 shadow-none">
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold">地址映射示例</h3>
            <div className="space-y-2">
              {samples.map((s) => (
                <div key={s.label} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-default-500">{s.label}</span>
                  <code className="rounded bg-default-100 px-1.5 py-0.5">{s.fromUrl}</code>
                  <Icon icon="tabler:arrow-right" width={14} />
                  <code className="rounded bg-default-100 px-1.5 py-0.5">{s.toUrl}</code>
                </div>
              ))}
            </div>
            <p className="text-xs text-default-500">
              上面是按你填写的目标域名与基础路径算出来的示意，实际生效要在目标站点部署完成后用「站点检查」核对。
            </p>
          </CardBody>
        </Card>

        <Card className="rounded-xl border border-default-200 shadow-none">
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold">当前实际生效地址（只读）</h3>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">公开站点</span>
              <BlogInput
                className="w-full"
                readOnly
                value={deployedOrigin || "未配置 BLOG_PUBLIC_URL（按请求地址兜底）"}
              />
              <small className="text-xs text-default-500">
                由服务端环境变量 BLOG_PUBLIC_URL 决定。canonical、站点地图、RSS
                都以它为准；改了上面的目标地址不会改变这里的输出。
              </small>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">私有工作区</span>
              <BlogInput
                className="w-full"
                readOnly
                value={backendOrigin || "未配置 NEXTAUTH_URL"}
              />
              <small className="text-xs text-default-500">
                仅用于登录后的工作区，不会与公开站点共享登录态或 Cookie。
              </small>
            </label>
          </CardBody>
        </Card>

        <Card className="rounded-xl border border-default-200 shadow-none">
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold">部署说明</h3>
            <p className="text-xs text-default-500">
              以下配置需要你在服务器上手工完成，研发阶段只提供可审查的模板，不动线上代理与 DNS。
            </p>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-default-600">
              <li>在 DNS 服务商添加目标域名的 A / CNAME 记录，指向服务器。</li>
              <li>配置 HTTPS 证书（Let's Encrypt 或已有证书），确认 443 可访问。</li>
              <li>按下面模板配置反向代理，只映射公开页面与公开资源。</li>
              <li>
                在服务端环境变量里把 <code>BLOG_PUBLIC_URL</code> 设为目标地址并重启服务。
              </li>
              <li>回到「站点检查」逐项核对，确认后再打开旧地址永久跳转。</li>
            </ol>
            <Button
              size="sm"
              variant="flat"
              onPress={() => setShowDoc((v) => !v)}
              aria-expanded={showDoc}
            >
              {showDoc ? "收起反向代理模板" : "查看反向代理模板"}
            </Button>
            {showDoc && (
              <pre className="max-h-96 overflow-auto rounded-xl bg-default-100 p-3 text-xs leading-relaxed">
                {NGINX_TEMPLATE}
              </pre>
            )}
            <h4 className="text-sm font-semibold">回滚</h4>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-default-600">
              <li>
                把 <code>BLOG_PUBLIC_URL</code> 改回原值并重启服务，公开输出立刻回到旧地址。
              </li>
              <li>关闭「旧地址永久跳转到对应新地址」，旧链接立即停止跳转。</li>
              <li>删除或停用新增的 DNS 记录与反向代理站点，公开域名回落到原状态。</li>
            </ol>
            <Button
              size="sm"
              color="primary"
              onPress={onOpenCheck}
              startContent={<Icon icon="tabler:play" width={15} />}
            >
              去站点检查
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
