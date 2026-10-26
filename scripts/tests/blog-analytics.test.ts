import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  attribute,
  normalizeHost,
  normalizeEntry,
  SOURCE_LABELS,
} from "../../server/lib/blogAttribution";
import {
  resolveAnalyticsRange,
  analyticsOverview,
  analyticsArticles,
  analyticsArticleDetail,
  AnalyticsRangeError,
} from "../../server/lib/blogAnalytics";
import { publishSnapshot } from "../../server/lib/publication";
import {
  extractTrackingId,
  isValidTrackingId,
} from "../../shared/lib/blogTracking";

describe("来源归因规则", () => {
  test("主机名归一化：去协议、去 www、去端口、转小写", () => {
    expect(normalizeHost("https://WWW.Example.com/path?q=1")).toBe("example.com");
    expect(normalizeHost("http://example.com:3000/x")).toBe("example.com");
    expect(normalizeHost("  Example.com ")).toBe("example.com");
    expect(normalizeHost("")).toBe("");
  });

  test("站内入口只认白名单值", () => {
    expect(normalizeEntry("home")).toBe("home");
    expect(normalizeEntry("topic")).toBe("topic");
    expect(normalizeEntry("evil")).toBe("unknown");
    expect(normalizeEntry(undefined)).toBe("unknown");
  });

  test("客户端标记的站内跳转直接归站内", () => {
    const result = attribute({
      referrer: "https://www.google.com/",
      entry: "home",
      internalNav: true,
      siteHost: "blog.example.com",
    });
    expect(result.source).toBe("internal");
    expect(result.entry).toBe("home");
  });

  test("同站 referrer 不误判为新的外部来源", () => {
    const result = attribute({
      referrer: "https://blog.example.com/blog",
      siteHost: "blog.example.com",
    });
    expect(result.source).toBe("internal");
    expect(result.referrerHost).toBe("blog.example.com");
  });

  test("搜索引擎与外部链接分开归类", () => {
    expect(
      attribute({ referrer: "https://www.google.com/search?q=x", siteHost: "a.com" })
        .source,
    ).toBe("search");
    expect(
      attribute({ referrer: "https://news.ycombinator.com/", siteHost: "a.com" })
        .source,
    ).toBe("referral");
  });

  test("没有 referrer 时，全新导航算直接访问，刷新等算未知", () => {
    expect(
      attribute({ navigationType: "navigate", siteHost: "a.com" }).source,
    ).toBe("direct");
    expect(
      attribute({ navigationType: "reload", siteHost: "a.com" }).source,
    ).toBe("unknown");
    expect(
      attribute({ navigationType: "back_forward", siteHost: "a.com" }).source,
    ).toBe("unknown");
  });

  test("来源标签齐全", () => {
    for (const key of ["direct", "search", "referral", "internal", "unknown"])
      expect(SOURCE_LABELS[key as keyof typeof SOURCE_LABELS]).toBeTruthy();
  });
});

describe("统计时间范围", () => {
  // 2026-03-10 12:00 UTC = 2026-03-10 20:00 Asia/Shanghai
  const now = new Date("2026-03-10T12:00:00Z");

  test("今天 = 上海时区的当天", () => {
    const range = resolveAnalyticsRange({ preset: "today" }, now);
    expect(range.from).toBe("2026-03-10");
    expect(range.to).toBe("2026-03-10");
    expect(range.days).toBe(1);
    // 上海 00:00 = 前一天 16:00 UTC
    expect(range.start.toISOString()).toBe("2026-03-09T16:00:00.000Z");
  });

  test("近 7 天含今天共 7 天", () => {
    const range = resolveAnalyticsRange({ preset: "7d" }, now);
    expect(range.from).toBe("2026-03-04");
    expect(range.to).toBe("2026-03-10");
    expect(range.days).toBe(7);
  });

  test("自定义结束日期包含当天：区间右开", () => {
    const range = resolveAnalyticsRange(
      { from: "2026-03-01", to: "2026-03-02" },
      now,
    );
    expect(range.days).toBe(2);
    expect(range.start.toISOString()).toBe("2026-02-28T16:00:00.000Z");
    // 结束日次日 00:00（上海）= 结束日 16:00 UTC
    expect(range.endExclusive.toISOString()).toBe("2026-03-02T16:00:00.000Z");
  });

  test("结束早于开始、格式错误、超长范围都要报错", () => {
    expect(() =>
      resolveAnalyticsRange({ from: "2026-03-05", to: "2026-03-01" }, now),
    ).toThrow(AnalyticsRangeError);
    expect(() =>
      resolveAnalyticsRange({ from: "2026/03/01", to: "2026-03-02" }, now),
    ).toThrow(AnalyticsRangeError);
    expect(() =>
      resolveAnalyticsRange({ from: "2020-01-01", to: "2026-03-01" }, now),
    ).toThrow(AnalyticsRangeError);
  });

  test("粒度随跨度变化：短区间按天，长区间按周或月", () => {
    expect(
      resolveAnalyticsRange({ from: "2026-03-01", to: "2026-03-10" }, now)
        .granularity,
    ).toBe("day");
    expect(
      resolveAnalyticsRange({ from: "2026-01-01", to: "2026-03-10" }, now)
        .granularity,
    ).toBe("week");
  });
});

const suite =
  process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;

suite("范围统计口径", () => {
  const db = new PrismaClient();
  let owner: number;
  let other: number;
  let noteA: number;
  let noteB: number;
  let publishA: string;
  const deviceA = "a".repeat(32);
  const deviceB = "b".repeat(32);

  const range = resolveAnalyticsRange({
    from: "2026-03-01",
    to: "2026-03-07",
  });

  beforeAll(async () => {
    const name = "blog-analytics-test-" + crypto.randomUUID();
    owner = (await db.accounts.create({ data: { name } })).id;
    other = (await db.accounts.create({ data: { name: name + "-other" } })).id;
    const draft = (title: string) => ({
      accountId: owner,
      content: `# ${title}\n这一篇用来验证范围统计口径的正文内容，足够长以便被发布。`,
      type: 1,
      metadata: { title },
    });
    noteA = (await db.notes.create({ data: draft("口径甲") })).id;
    noteB = (await db.notes.create({ data: draft("口径乙") })).id;
    await publishSnapshot(db, owner, { id: noteA });
    await publishSnapshot(db, owner, { id: noteB });
    publishA = (await db.notes.findUniqueOrThrow({ where: { id: noteA } }))
      .publishId!;

    // 甲：设备 A 读两次（不同天），设备 B 读一次 —— 访客数应为 2，阅读 3
    await db.blogPageView.createMany({
      data: [
        {
          accountId: owner,
          noteId: noteA,
          deviceId: deviceA,
          createdAt: new Date("2026-03-02T03:00:00Z"),
          source: "search",
          referrerHost: "google.com",
          entry: "home",
        },
        {
          accountId: owner,
          noteId: noteA,
          deviceId: deviceA,
          createdAt: new Date("2026-03-05T03:00:00Z"),
          source: "search",
          referrerHost: "google.com",
          entry: "home",
        },
        {
          accountId: owner,
          noteId: noteB,
          deviceId: deviceB,
          createdAt: new Date("2026-03-06T03:00:00Z"),
          source: "direct",
          entry: "detail",
        },
      ],
    });
    // 曝光 4 次、点击 1 次 —— 点击率 25%
    await db.blogRecommendationEvent.createMany({
      data: [
        {
          accountId: owner,
          deviceId: deviceA,
          kind: "impression",
          publishId: publishA,
          term: "",
          bucket: new Date("2026-03-02T04:00:00Z"),
          source: "search",
          referrerHost: "google.com",
          entry: "home",
        },
        {
          accountId: owner,
          deviceId: deviceA,
          kind: "impression",
          publishId: publishA,
          term: "",
          bucket: new Date("2026-03-03T04:00:00Z"),
          source: "search",
          referrerHost: "google.com",
          entry: "home",
        },
        {
          accountId: owner,
          deviceId: deviceB,
          kind: "impression",
          publishId: publishA,
          term: "",
          bucket: new Date("2026-03-04T04:00:00Z"),
          source: "direct",
          entry: "home",
        },
        {
          accountId: owner,
          deviceId: deviceB,
          kind: "impression",
          publishId: publishA,
          term: "",
          bucket: new Date("2026-03-05T04:00:00Z"),
          source: "direct",
          entry: "home",
        },
        {
          accountId: owner,
          deviceId: deviceA,
          kind: "click",
          publishId: publishA,
          term: "",
          bucket: new Date("2026-03-02T05:00:00Z"),
          source: "search",
          referrerHost: "google.com",
          entry: "home",
        },
      ],
    });
  });

  afterAll(async () => {
    if (owner) {
      await db.blogRecommendationEvent.deleteMany({ where: { accountId: owner } });
      await db.blogPageView.deleteMany({ where: { accountId: owner } });
      await db.notes.deleteMany({ where: { accountId: owner } });
      await db.accounts.delete({ where: { id: owner } });
    }
    if (other) await db.accounts.delete({ where: { id: other } });
    await db.$disconnect();
  });

  test("阅读次数与跨文章去重的访客数", async () => {
    const overview = await analyticsOverview(db, owner, range);
    expect(overview.metrics.views).toBe(3);
    // 设备 A 读了甲、乙两篇？否：设备 A 只读甲两行，设备 B 读乙一次
    expect(overview.metrics.visitors).toBe(2);
  });

  test("列表曝光、点击与点击率口径一致", async () => {
    const overview = await analyticsOverview(db, owner, range);
    expect(overview.metrics.impressions).toBe(4);
    expect(overview.metrics.clicks).toBe(1);
    expect(overview.metrics.ctr).toBeCloseTo(0.25, 5);
  });

  test("趋势补齐没有事件的日期", async () => {
    const overview = await analyticsOverview(db, owner, range);
    expect(overview.trend.length).toBe(7);
    expect(overview.trend[0].bucket).toBe("2026-03-01");
    // 3-01 没有事件，补 0
    expect(overview.trend[0].views).toBe(0);
    expect(overview.trend[0].visitors).toBe(0);
    const day2 = overview.trend.find((t) => t.bucket === "2026-03-02");
    expect(day2?.views).toBe(1);
  });

  test("来源分布按实际采集数据出，历史未采集的算未知", async () => {
    const overview = await analyticsOverview(db, owner, range);
    const bySource = new Map(overview.sources.map((s) => [s.source, s]));
    expect(bySource.get("search")?.views).toBe(2);
    expect(bySource.get("direct")?.views).toBe(1);
    // 占比之和为 1
    const total = overview.sources.reduce((sum, s) => sum + s.share, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  test("文章表按 noteId 关联，含曝光点击与阅读访客", async () => {
    const table = await analyticsArticles(db, owner, range, { pageSize: 10 });
    const rowA = table.rows.find((r) => r.noteId === noteA);
    const rowB = table.rows.find((r) => r.noteId === noteB);
    expect(rowA?.impressions).toBe(4);
    expect(rowA?.clicks).toBe(1);
    expect(rowA?.ctr).toBeCloseTo(0.25, 5);
    expect(rowA?.views).toBe(2);
    expect(rowA?.visitors).toBe(1);
    expect(rowB?.views).toBe(1);
    expect(rowB?.impressions).toBe(0);
    // 曝光为 0 时点击率是 null，界面显示「—」
    expect(rowB?.ctr).toBeNull();
  });

  test("文章表支持搜索与排序", async () => {
    const searched = await analyticsArticles(db, owner, range, {
      q: "口径甲",
    });
    expect(searched.rows.length).toBe(1);
    expect(searched.rows[0].noteId).toBe(noteA);
    const byViews = await analyticsArticles(db, owner, range, {
      sort: "views",
    });
    expect(byViews.rows[0].views).toBeGreaterThanOrEqual(
      byViews.rows[byViews.rows.length - 1].views,
    );
  });

  test("范围外的事件不计入", async () => {
    const narrow = resolveAnalyticsRange({
      from: "2026-03-02",
      to: "2026-03-02",
    });
    const overview = await analyticsOverview(db, owner, narrow);
    expect(overview.metrics.views).toBe(1);
    expect(overview.metrics.impressions).toBe(1);
    expect(overview.metrics.clicks).toBe(1);
  });

  test("单篇下钻返回该文章的指标与趋势", async () => {
    const detail = await analyticsArticleDetail(db, owner, noteA, range);
    expect(detail?.noteId).toBe(noteA);
    expect(detail?.metrics.views).toBe(2);
    expect(detail?.metrics.impressions).toBe(4);
    expect(detail?.trend.length).toBe(7);
  });

  test("跨账号隔离：别人的统计查不到", async () => {
    const overview = await analyticsOverview(db, other, range);
    expect(overview.metrics.views).toBe(0);
    expect(overview.metrics.impressions).toBe(0);
    const table = await analyticsArticles(db, other, range, {});
    expect(table.total).toBe(0);
    const detail = await analyticsArticleDetail(db, other, noteA, range);
    expect(detail).toBeNull();
  });

  test("撤回文章后历史统计仍按 noteId 保留", async () => {
    const before = await analyticsArticles(db, owner, range, {});
    const found = before.rows.find((r) => r.noteId === noteA);
    expect(found?.views).toBe(2);
    // 撤回后仍能查到（关联键是 noteId，不是标题）
    await db.notes.update({
      where: { id: noteA },
      data: { isPublished: false },
    });
    const after = await analyticsArticles(db, owner, range, {});
    const still = after.rows.find((r) => r.noteId === noteA);
    expect(still?.views).toBe(2);
    expect(still?.hasPublication).toBe(true);
    await db.notes.update({
      where: { id: noteA },
      data: { isPublished: true },
    });
  });
});

describe("第三方统计编号的提取与校验", () => {
  test("GA4 认得两种官方写法", () => {
    const a = extractTrackingId(
      "ga",
      `<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ"></script>`,
    );
    expect(a.id).toBe("G-ABC123XYZ");
    const b = extractTrackingId(
      "ga",
      `gtag('config', 'G-ABC123XYZ');`,
    );
    expect(b.id).toBe("G-ABC123XYZ");
  });

  test("百度认得官方拼接写法（编号在引号里另接）", () => {
    const code = `<script>
var _hmt = _hmt || [];
(function () {
  var hm = document.createElement("script");
  hm.src = "https://hm.baidu.com/hm.js?" + "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
  document.getElementsByTagName("head")[0].appendChild(hm);
})();
</script>`;
    const result = extractTrackingId("baidu", code);
    expect(result.id).toBe("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6");
  });

  test("百度认得 URL 直接带编号的写法", () => {
    const result = extractTrackingId(
      "baidu",
      `hm.src = "https://hm.baidu.com/hm.js?a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";`,
    );
    expect(result.id).toBe("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6");
  });

  test("提取不到就如实失败，不随便抓相似字符串", () => {
    const result = extractTrackingId("ga", "这里没有任何统计代码 G- 不是编号");
    expect(result.id).toBe("");
    expect(result.reason).toBeTruthy();
    expect(extractTrackingId("baidu", "").id).toBe("");
  });

  test("编号格式校验与提取规则一致", () => {
    expect(isValidTrackingId("ga", "G-ABC123XYZ")).toBe(true);
    expect(isValidTrackingId("ga", "ABC123XYZ")).toBe(false);
    expect(isValidTrackingId("baidu", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")).toBe(true);
    expect(isValidTrackingId("baidu", "A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6")).toBe(false);
    expect(isValidTrackingId("baidu", "short")).toBe(false);
  });
});
