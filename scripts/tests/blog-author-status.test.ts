import { describe, test, expect } from "bun:test";
import {
  AUTHOR_STATUS_INTERVAL,
  AUTHOR_STATUS_QUOTES,
  authorStatusForHour,
  authorStatusPool,
} from "../../app/src/components/BlinkoBlog/public/authorStatus";

describe("作者卡动态胶囊文案", () => {
  test("固定文案池非空且不重复", () => {
    expect(AUTHOR_STATUS_QUOTES.length).toBeGreaterThan(0);
    expect(new Set(AUTHOR_STATUS_QUOTES).size).toBe(
      AUTHOR_STATUS_QUOTES.length,
    );
    for (const text of AUTHOR_STATUS_QUOTES) {
      expect(text.trim()).toBe(text);
      expect(text.length).toBeGreaterThan(0);
    }
  });

  test("时段提示只落在该落的小时上", () => {
    // 深夜：提示休息
    expect(authorStatusForHour(0)).toContain("睡");
    expect(authorStatusForHour(4)).toContain("睡");
    // 清晨：刚起来
    expect(authorStatusForHour(5)).toBe("早，先读一篇再开始");
    expect(authorStatusForHour(8)).toBe("早，先读一篇再开始");
    // 午间
    expect(authorStatusForHour(12)).toContain("中午");
    expect(authorStatusForHour(13)).toContain("中午");
    // 深夜前：提示休息
    expect(authorStatusForHour(22)).toContain("休息");
    expect(authorStatusForHour(23)).toContain("休息");
  });

  test("白天与傍晚没有时段提示", () => {
    expect(authorStatusForHour(9)).toBeNull();
    expect(authorStatusForHour(11)).toBeNull();
    expect(authorStatusForHour(14)).toBeNull();
    expect(authorStatusForHour(18)).toBeNull();
    expect(authorStatusForHour(21)).toBeNull();
  });

  test("轮播池始终包含全部固定文案", () => {
    for (const hour of [0, 6, 10, 13, 17, 23]) {
      const pool = authorStatusPool(new Date(2026, 0, 1, hour));
      for (const quote of AUTHOR_STATUS_QUOTES) {
        expect(pool).toContain(quote);
      }
      // 时段提示排在最前面
      const timed = authorStatusForHour(hour);
      if (timed) expect(pool[0]).toBe(timed);
      else expect(pool[0]).toBe(AUTHOR_STATUS_QUOTES[0]);
      // 不重复
      expect(new Set(pool).size).toBe(pool.length);
    }
  });

  test("轮播间隔是一个说得过去的节奏", () => {
    expect(AUTHOR_STATUS_INTERVAL).toBeGreaterThanOrEqual(3000);
    expect(AUTHOR_STATUS_INTERVAL).toBeLessThanOrEqual(15000);
  });
});
