import { describe, test, expect } from "bun:test";
import {
  copyrightYears,
  promoVisible,
  todayInTimeZone,
  type BlogFooterPromo,
} from "../../shared/lib/blogFooter";
import { blogSiteSettingsSchema } from "../../shared/lib/blogSiteSettings";

const promo = (p: Partial<BlogFooterPromo> = {}): BlogFooterPromo => ({
  enabled: true,
  title: "PowBay",
  text: "新用户首月 5 折",
  url: "https://example.com",
  startAt: "",
  endAt: "",
  ...p,
});

describe("页脚推广位", () => {
  test("开关关掉就不显示", () => {
    expect(promoVisible(promo({ enabled: false }), "Asia/Shanghai")).toBe(false);
  });

  test("标题与文案都为空时不显示", () => {
    expect(
      promoVisible(promo({ title: "", text: "" }), "Asia/Shanghai"),
    ).toBe(false);
  });

  test("开始日期未到不显示，到了才显示", () => {
    const now = new Date("2026-03-15T00:00:00Z");
    expect(
      promoVisible(promo({ startAt: "2026-04-01" }), "Asia/Shanghai", now),
    ).toBe(false);
    expect(
      promoVisible(promo({ startAt: "2026-03-01" }), "Asia/Shanghai", now),
    ).toBe(true);
  });

  test("结束日期过了自动隐藏", () => {
    const now = new Date("2026-03-15T00:00:00Z");
    expect(
      promoVisible(promo({ endAt: "2026-03-14" }), "Asia/Shanghai", now),
    ).toBe(false);
    expect(
      promoVisible(promo({ endAt: "2026-03-15" }), "Asia/Shanghai", now),
    ).toBe(true);
    expect(
      promoVisible(promo({ endAt: "2026-12-31" }), "Asia/Shanghai", now),
    ).toBe(true);
  });

  test("起止都在区间内时显示", () => {
    const now = new Date("2026-03-15T00:00:00Z");
    expect(
      promoVisible(
        promo({ startAt: "2026-03-01", endAt: "2026-03-31" }),
        "Asia/Shanghai",
        now,
      ),
    ).toBe(true);
  });

  test("日期格式填错时按不显示处理，而不是永远显示", () => {
    const now = new Date("2026-03-15T00:00:00Z");
    expect(
      promoVisible(promo({ startAt: "2026/03/01" }), "Asia/Shanghai", now),
    ).toBe(false);
    expect(
      promoVisible(promo({ endAt: "3月1日" }), "Asia/Shanghai", now),
    ).toBe(false);
  });

  test("起止日期按站点时区判定，不按服务器时区", () => {
    // UTC 还是 1 月 1 日，上海已经是 1 月 2 日了。
    const now = new Date("2026-01-01T16:30:00Z");
    expect(todayInTimeZone("UTC", now)).toBe("2026-01-01");
    expect(todayInTimeZone("Asia/Shanghai", now)).toBe("2026-01-02");
    // 上海这边已经进入生效区间，UTC 那边还没到。
    expect(
      promoVisible(promo({ startAt: "2026-01-02" }), "Asia/Shanghai", now),
    ).toBe(true);
    expect(
      promoVisible(promo({ startAt: "2026-01-02" }), "UTC", now),
    ).toBe(false);
  });

  test("非法时区不抛错，退回本地日期", () => {
    expect(todayInTimeZone("Not/AZone", new Date("2026-05-05T12:00:00Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe("页脚版权年份", () => {
  const now = new Date("2026-10-26T00:00:00Z");

  test("起始与结束都填且不同 → 显示区间", () => {
    expect(
      copyrightYears({ copyrightStart: 2019, copyrightEnd: 2026 }, now),
    ).toBe("2019 – 2026");
  });

  test("结束年份留空 → 用当前年份", () => {
    expect(
      copyrightYears({ copyrightStart: 2019, copyrightEnd: 0 }, now),
    ).toBe("2019 – 2026");
  });

  test("起始年份留空 → 只显示一个年份", () => {
    expect(
      copyrightYears({ copyrightStart: 0, copyrightEnd: 0 }, now),
    ).toBe("2026");
  });

  test("起止同一年 → 只显示一个年份", () => {
    expect(
      copyrightYears({ copyrightStart: 2026, copyrightEnd: 2026 }, now),
    ).toBe("2026");
  });

  test("没有配置时也不会返回空串", () => {
    expect(copyrightYears(undefined, now)).toBe("2026");
  });
});

describe("站点设置里的页脚配置", () => {
  test("空配置能解析出默认的页脚结构", () => {
    const parsed = blogSiteSettingsSchema.parse({});
    expect(parsed.footer.owner).toBe("");
    expect(parsed.footer.icp).toBe("");
    expect(parsed.footer.police).toBe("");
    expect(parsed.footer.copyrightStart).toBe(0);
    expect(parsed.footer.copyrightEnd).toBe(0);
    expect(parsed.footer.promo.enabled).toBe(false);
  });

  test("旧配置（没有页脚字段）照常解析，不影响其它设置", () => {
    const parsed = blogSiteSettingsSchema.parse({
      siteName: "Ink",
      tagline: "记录思考与实践",
    });
    expect(parsed.siteName).toBe("Ink");
    expect(parsed.footer.icp).toBe("");
  });

  test("备案号与推广位可以正常保存与读回", () => {
    const parsed = blogSiteSettingsSchema.parse({
      footer: {
        owner: "张洪Heo",
        copyrightStart: 2019,
        copyrightEnd: 2026,
        icp: "京ICP备19051325号-2",
        police: "京公网安备 11011402054421号",
        promo: {
          enabled: true,
          title: "PowBay",
          text: "新用户首月 5 折",
          url: "https://example.com",
          startAt: "2026-10-01",
          endAt: "2026-12-31",
        },
      },
    });
    expect(parsed.footer.owner).toBe("张洪Heo");
    expect(parsed.footer.icp).toBe("京ICP备19051325号-2");
    expect(parsed.footer.promo.startAt).toBe("2026-10-01");
  });
});
