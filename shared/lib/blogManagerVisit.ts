/** This preference only changes this browser's analytics participation, never authentication. */
export function managerBlogVisitUrl(href: string) {
  const absolute = /^https?:\/\//i.test(href);
  const url = new URL(href, "https://blog.invalid");
  url.searchParams.set("statistics", "off");
  return absolute ? url.href : url.pathname + url.search + url.hash;
}
export function withoutStatisticsPreference(href: string): string | null {
  const url = new URL(href);
  if (url.searchParams.get("statistics") !== "off") return null;
  url.searchParams.delete("statistics");
  return url.pathname + url.search + url.hash;
}
