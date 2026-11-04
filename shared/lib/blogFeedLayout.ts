/** Avoid a vacant reading list when the banner contains most available articles. */
export function articlesBelowBanner<T extends {id:number}>(posts:T[], banner:T[]):T[] {
  const ids = new Set(banner.map(post => post.id));
  const unique = posts.filter(post => !ids.has(post.id));
  return unique.length >= 4 ? unique : posts;
}
