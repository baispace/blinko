import type { PrismaClient } from "@prisma/client";
import { publicBlogOwner } from "./blog";
import { readBlogSiteSettings } from "./blogSiteSettings";
import { resolveBlogDeployment } from "../../shared/lib/blogDeployment";

/**
 * 生效的公开站点地址。
 *
 * 后台「域名与部署」里填的优先，其次环境变量 BLOG_PUBLIC_URL 兜底，
 * 都没有就返回空串 —— 由调用方决定退回相对地址还是工作区地址。
 *
 * 需要在后台配置生效地址的地方（反馈邮件里的公开链接等）都走这里，
 * 不要各自去读环境变量：那样后台改了地址，邮件里的链接还指向旧域名。
 */
export async function effectivePublicOrigin(
  db: PrismaClient,
): Promise<string> {
  try {
    const owner = await publicBlogOwner(db, undefined);
    const stored = owner ? await readBlogSiteSettings(db, owner) : null;
    const deployment = resolveBlogDeployment(
      stored?.configured ? stored.data : null,
    );
    if (deployment.targetOrigin) return deployment.targetOrigin;
  } catch {
    // 读库失败就退回环境变量兜底 —— 不因为一条邮件链接把整次回复卡住。
  }
  return resolveBlogDeployment(null).targetOrigin;
}
