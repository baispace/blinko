import { BlogDisclosure, BlogInput, BlogToggle } from "./BlogUI";
import { Button, Card, CardBody } from "@heroui/react";
import type { BlogSiteSettings } from "@shared/lib/blogSiteSettings";
import type { BlogDeployment } from "@shared/lib/blogDeployment";

export function BlogDeploymentSettings({data,patch,deployedOrigin,backendOrigin,onOpenCheck}: {
 data: BlogSiteSettings; patch:(p:Partial<BlogSiteSettings>)=>void;
 deployedOrigin:string; backendOrigin:string; deployment?:BlogDeployment|null; onOpenCheck:()=>void;
}) {
 const origin = data.targetOrigin.trim();
 const sameHost = (()=>{try{return new URL(origin).host === new URL(backendOrigin || window.location.origin).host;}catch{return false;}})();
 const template = `server {
  listen 443 ssl;
  server_name ${(()=>{try{return new URL(origin).hostname;}catch{return "blog.example.com";}})()};
  ssl_certificate /实际证书路径/fullchain.pem;
  ssl_certificate_key /实际证书路径/privkey.pem;
  location / {
    proxy_pass http://127.0.0.1:1111;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
  }
}`;
 return <div className="space-y-5">
  <Card className="rounded-xl border border-default-200 shadow-none"><CardBody className="gap-3 p-4">
   <h3 className="text-sm font-semibold">博客域名</h3>
   <p className="text-sm text-default-500">公开博客从这个域名的首页打开。创作后台和博客管理继续使用原域名。</p>
   <label className="flex flex-col gap-2"><span className="text-sm">公开博客地址</span>
    <BlogInput aria-label="公开博客地址" placeholder="https://blog.baispace.cn" value={data.targetOrigin} onChange={e=>patch({targetOrigin:e.target.value.trim(),domainRouting:!!e.target.value.trim(),publicBasePath:e.target.value.trim()?"/":"/blog",apiOrigin:"",deploymentMode:"proxy"})}/>
   </label>
   {sameHost && <p role="alert" className="text-sm text-danger">博客域名必须与当前后台域名不同，避免覆盖后台入口。</p>}
   <p className="text-xs text-default-500">留空时继续通过原域名的 /blog 访问。保存会更新公开链接；域名解析和 HTTPS 需要在服务器或部署平台配置。</p>
   <div className="rounded-lg bg-default-50 p-3 text-sm">已保存的公开地址：{deployedOrigin || "尚未设置独立域名"}</div>
   {!data.domainRouting && origin && <Button size="sm" variant="flat" onPress={()=>patch({domainRouting:true,publicBasePath:"/",apiOrigin:"",deploymentMode:"proxy"})}>使用此域名作为博客首页</Button>}
  </CardBody></Card>
  <Card className="rounded-xl border border-default-200 shadow-none"><CardBody className="gap-3 p-4">
   <h3 className="text-sm font-semibold">部署只需三步</h3>
   <ol className="list-decimal space-y-2 pl-5 text-sm text-default-600"><li>将博客域名解析到服务器并绑定 HTTPS 证书。</li><li>整站反向代理到现有应用，保留 Host；不添加 /blog，不配置路径重写。</li><li>保存博客域名后，运行站点检查确认页面、图片、RSS 和 SEO 地址正常。</li></ol>
   <BlogDisclosure title="查看 Nginx 配置示例" titleClass="text-primary"><pre className="overflow-x-auto rounded-lg bg-default-50 p-4 text-xs">{template}</pre><p className="mt-2 text-xs text-default-500">替换证书路径和上游地址。后端设置 TRUST_PROXY=1；原有后台域名配置保持原样。</p></BlogDisclosure>
   <Button className="self-start" size="sm" color="primary" onPress={onOpenCheck}>运行站点检查</Button>
   <p className="text-xs text-default-500">检查使用已保存的配置。保存域名不等于域名已经部署成功。</p>
  </CardBody></Card>
  <Card className="rounded-xl border border-default-200 shadow-none"><CardBody className="p-4">
   <BlogDisclosure title="旧公开链接迁移">
    <BlogToggle
     label="将原域名的 /blog 链接永久跳转到新博客"
     hint="新域名验证通过后再开启。仅迁移公开博客链接，后台入口保持不变。"
     checked={data.legacyRedirectEnabled}
     onChange={v=>patch({legacyRedirectEnabled:v,legacyBasePath:"/blog"})}
    />
   </BlogDisclosure>
  </CardBody></Card>
 </div>;
}
