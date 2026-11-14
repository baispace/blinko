/**
 * 首屏头条之外的列表。
 *
 * 头条那篇**绝不能**在下面再出现一次 —— 同一张封面在首屏出现两遍，
 * 是最明显的「没对齐」。同理，头条轮播里的其他几篇也不进列表：
 * 用户切到哪一张，那一张就不该同时出现在下面。
 *
 * 但列表也不能空着：文章本来就少时，把头条里的其他几篇放回列表，
 * 只把当前这条排除掉。
 */
export function articlesBelowBanner<T extends {id:number}>(posts:T[], banner:T[], leadId?:number):T[] {
  const ids = new Set(banner.map(post => post.id));
  const unique = posts.filter(post => !ids.has(post.id));
  if (unique.length >= 4) return unique;
  // 不知道当前是哪一条头条时，保持旧行为：列表不空着。
  if (leadId === undefined) return posts;
  if (unique.length >= 2) return unique;
  return posts.filter(post => post.id !== leadId);
}
