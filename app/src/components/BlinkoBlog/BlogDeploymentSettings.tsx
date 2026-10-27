import { BlogInput, BlogCheckbox, BlogButton } from "./BlogUI";
import { useMemo, useState } from "react";
import type { BlogSiteSettings } from "@shared/lib/blogSiteSettings";
import { normalizeBasePath } from "@shared/lib/blogSeo";
import { Icon } from "@/components/Common/Iconify/icons";

/**
 * 域名与部署。
 *
 * 三件事必须分清楚：
 *   1. 目标配置 —— 你希望使用的域名、路径、API。
 *   2. 当前生效 —— 服务端现在实际在用的地址（BLOG_PUBLIC_URL 等环境变量）。
 *   3. 检测结果 —— 某次检查在某个环境里跑出来的结论。
 * 保存目标配置不会创建 DNS、不会改服务器，也不代表域名已经上线。
 */

const NGINX_TEMPLATE = `# 公开站点：https://blog.example.com
# 只映射公开页面与公开资源；工作区、登录页、管理接口一律不放行。
server {
  listen 443 ssl http2;
  server_name blog.example.com;

  # 公开页面：根路径映射到应用的 /blog（应用内部路由不变）
  location / {
    proxy_pass http://127.0.0.1:1111/blog/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # 站点地图与 robots 固定在根路径
  location = /sitemap.xml { proxy_pass http://127.0.0.1:1111/sitemap.xml; }
  location = /robots.txt  { proxy_pass http://127.0.0.1:1111/robots.txt; }

  # 公开 API 与公开资源
  location /api/trpc/blog.public { proxy_pass http://127.0.0.1:1111; }
  location /assets/   { proxy_pass http://127.0.0.1:1111; }
  location /font-assets/ { proxy_pass http://127.0.0.1:1111; }
  location /icons/    { proxy_pass http://127.0.0.1:1111; }
  location /locales/  { proxy_pass http://127.0.0.1:1111; }
}`;

export function BlogDeploymentSettings({
  data,
  patch,
  deployedOrigin,
  backendOrigin,
  onOpenCheck,
}: {
  data: BlogSiteSettings;
  patch: (p: Partial<BlogSiteSettings>) => void;
  deployedOrigin: string;
  backendOrigin: string;
  onOpenCheck: () => void;
}) {
  const [showDoc, setShowDoc] = useState(false);
  const basePath = normalizeBasePath(data.publicBasePath) || "/blog";
  const legacyBase = normalizeBasePath(data.legacyBasePath) || "";

  const targetAligned = useMemo(() => {
    if (!data.targetOrigin || !deployedOrigin) return false;
    try {
      return (
        new URL(data.targetOrigin).origin === new URL(deployedOrigin).origin
      );
    } catch {
      return false;
    }
  }, [data.targetOrigin, deployedOrigin]);

  const samples = useMemo(() => {
    // 旧地址用当前实际生效的地址，新地址用目标地址。
    const fromOrigin = deployedOrigin || data.targetOrigin || "https://ink.example.com";
    const toOrigin = data.targetOrigin || deployedOrigin || "https://blog.example.com";
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
  }, [data.targetOrigin, deployedOrigin, basePath, legacyBase]);

  return (
    <div className="ink-admin-columns">
      <div className="ink-mg-panel ink-mg-section">
        <p className="ink-mg-alert ink-mg-note-block">
          <Icon icon="tabler:info-circle" width={16} />
          <span>
            这里保存的是<strong>待部署目标</strong>：不会创建 DNS、不会改服务器配置，
            也不会让服务端立刻改用新域名。真正生效以后，以「当前实际生效地址」为准。
          </span>
        </p>

        <label className="ink-admin-field">
          <span>目标公开站点地址</span>
          <BlogInput
            className="ink-mg-field"
            value={data.targetOrigin}
            placeholder="https://blog.example.com"
            onChange={(e) => patch({ targetOrigin: e.target.value })}
          />
          <small>这是你希望使用的公开站点地址；保存不会自动创建 DNS 或部署服务。</small>
        </label>

        <label className="ink-admin-field">
          <span>私有工作区地址（只读）</span>
          <BlogInput
            className="ink-mg-field"
            readOnly
            value={backendOrigin || "未配置 NEXTAUTH_URL"}
          />
          <small>仅用于登录后的工作区，不会与公开站点共享登录态或 Cookie。</small>
        </label>

        <label className="ink-admin-field">
          <span>当前实际生效地址（只读）</span>
          <BlogInput
            className="ink-mg-field"
            readOnly
            value={deployedOrigin || "未配置 BLOG_PUBLIC_URL（按请求地址兜底）"}
          />
          <small>
            由服务端环境变量 BLOG_PUBLIC_URL 决定。canonical、站点地图、RSS
            都以它为准；改了上面的目标地址不会改变这里的输出。
          </small>
        </label>

        <div className="ink-admin-field">
          <span>部署方式</span>
          <div className="ink-seo-radio-row">
            <label className="ink-seo-radio">
              <input
                type="radio"
                name="deploymentMode"
                checked={data.deploymentMode === "proxy"}
                onChange={() => patch({ deploymentMode: "proxy" })}
              />
              同服务路径映射
            </label>
            <label className="ink-seo-radio">
              <input
                type="radio"
                name="deploymentMode"
                checked={data.deploymentMode === "separate"}
                onChange={() => patch({ deploymentMode: "separate" })}
              />
              前后端分开部署
            </label>
          </div>
          <small>
            {data.deploymentMode === "proxy"
              ? "公开域名由网关映射到现有 /blog，服务端继续提供首屏元信息，SEO 完整。"
              : "公开前端单独构建部署时首屏没有服务端元信息，需要预渲染或由后端下发首屏标签；公开 API 需要单独配置跨域白名单。"}
          </small>
        </div>

        <label className="ink-admin-field">
          <span>公开前端基础路径</span>
          <BlogInput
            className="ink-mg-field"
            value={data.publicBasePath}
            placeholder="/blog"
            onChange={(e) => patch({ publicBasePath: e.target.value })}
          />
          <small>
            公开域名下博客挂载的路径，例如 / 或 /blog。当前生效：{basePath}
          </small>
        </label>

        <label className="ink-admin-field">
          <span>公开 API 基础地址</span>
          <BlogInput
            className="ink-mg-field"
            value={data.apiOrigin}
            placeholder="https://api.example.com"
            onChange={(e) => patch({ apiOrigin: e.target.value })}
          />
          <small>
            前后端分开部署时公开前端访问的 API 根地址，接口路径由程序拼接为
            /api/trpc。公开前端是纯静态产物时，这个地址需要写进构建变量并重新构建，
            不会因为在这里保存就自动生效。
          </small>
        </label>

        <h4 className="ink-seo-subhead">地址映射示例</h4>
        <div className="ink-seo-mapping">
          {samples.map((s) => (
            <div key={s.label} className="ink-seo-mapping-row">
              <span className="ink-seo-mapping-label">{s.label}</span>
              <code>{s.fromUrl}</code>
              <Icon icon="tabler:arrow-right" width={14} />
              <code>{s.toUrl}</code>
            </div>
          ))}
        </div>
        <p className="ink-mg-sub">
          上面的地址是按你填写的目标域名与基础路径算出来的示意，实际生效要在目标站点部署完成后用「站点检查」核对。
        </p>

        <label className="ink-admin-toggle">
          <BlogCheckbox aria-label="旧地址永久跳转到对应新地址（301）"
            type="checkbox"
            checked={data.legacyRedirectEnabled}
            onChange={(e) => patch({ legacyRedirectEnabled: e.target.checked })}
          />
          旧地址永久跳转到对应新地址（301）
        </label>
        <label className="ink-admin-field">
          <span>旧公开路径前缀</span>
          <BlogInput
            className="ink-mg-field"
            value={data.legacyBasePath}
            placeholder="/blog"
            onChange={(e) => patch({ legacyBasePath: e.target.value })}
          />
          <small>
            只在目标站点部署并验证后再开启。只迁移公开路径，工作区路径不迁移；
            与目标同域时服务端不会跳转（避免死循环），这种情况请在网关上配 301。
          </small>
        </label>

        {targetAligned && (
          <p className="ink-mg-note">
            目标地址与服务端当前生效地址一致，保存后不会改变任何线上输出。
          </p>
        )}
      </div>

      <div className="ink-mg-panel">
        <h3>部署说明</h3>
        <p className="ink-mg-sub">
          以下配置需要你在服务器上手工完成，研发阶段只提供可审查的模板，不动线上代理与 DNS。
        </p>
        <ol className="ink-seo-steps">
          <li>在 DNS 服务商添加目标域名的 A / CNAME 记录，指向服务器。</li>
          <li>配置 HTTPS 证书（Let's Encrypt 或已有证书），确认 443 可访问。</li>
          <li>按下面模板配置反向代理，只映射公开页面与公开资源。</li>
          <li>
            在服务端环境变量里把 <code>BLOG_PUBLIC_URL</code> 设为目标地址并重启服务。
          </li>
          <li>回到「站点检查」逐项核对，确认后再打开旧地址永久跳转。</li>
        </ol>
        <BlogButton
          className="ink-mg-button"
          onClick={() => setShowDoc((v) => !v)}
          aria-expanded={showDoc}
        >
          {showDoc ? "收起反向代理模板" : "查看反向代理模板"}
        </BlogButton>
        {showDoc && (
          <pre className="ink-seo-code">{NGINX_TEMPLATE}</pre>
        )}
        <h4 className="ink-seo-subhead">回滚</h4>
        <ol className="ink-seo-steps">
          <li>
            把 <code>BLOG_PUBLIC_URL</code> 改回原值并重启服务，公开输出立刻回到旧地址。
          </li>
          <li>关闭「旧地址永久跳转到对应新地址」，旧链接立即停止跳转。</li>
          <li>删除或停用新增的 DNS 记录与反向代理站点，公开域名回落到原状态。</li>
        </ol>
        <BlogButton
          className="ink-mg-button ink-mg-button-primary"
          onClick={onOpenCheck}
        >
          <Icon icon="tabler:play" width={15} />
          去站点检查
        </BlogButton>
      </div>
    </div>
  );
}
