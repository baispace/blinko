import { RootStore } from "@/store";
import { UserStore } from "@/store/user";
import { getBlinkoEndpoint } from "./blinkoEndpoint";
import { getAvatarUrl } from "./profileIdentity";

/**
 * 附件图片的可访问地址。
 *
 * 博客管理后台与发布向导都要看封面/缩略图，这些图走登录态鉴权：
 * 本地存储是 /api/file，私人对象存储是 /api/s3file —— 后者必须把 token
 * 拼进查询串，否则浏览器拿到 403，img 会渲染成空白。
 */
export function blogImageUrl(path: string) {
  const endpoint = getBlinkoEndpoint("/");
  const token = RootStore.Get(UserStore).token || "";
  const result = getAvatarUrl(path, token, endpoint);
  try {
    const url = new URL(result);
    const base = new URL(endpoint);
    if (
      url.origin === base.origin &&
      url.pathname.startsWith("/api/s3file/") &&
      token
    )
      url.searchParams.set("token", token);
    return url.toString();
  } catch {
    return "";
  }
}
