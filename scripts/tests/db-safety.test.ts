import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 真库测试的安全红线。
 *
 * 友链表里放着站点主人真实提交的申请。
 * 曾经有一份测试在 beforeAll 里直接 deleteMany({}) 清空整张表 ——
 * 跑一次测试，主人提交的友链就没了，而且不留任何痕迹。
 *
 * 这条红线用一条自动检查钉死：测试代码里不允许出现「空条件整表删除」。
 */
const DESTRUCTIVE_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "deleteMany({})", pattern: /\.deleteMany\(\s*\{\s*\}\s*\)/ },
  { name: "deleteMany({ where: {} })", pattern: /\.deleteMany\(\s*\{\s*where:\s*\{\s*\}\s*\}\s*\)/ },
  { name: "deleteMany({ where: {} }) 简写", pattern: /\.deleteMany\(\s*\{\s*where:\s*\{\s*\}\s*,/ },
  { name: "TRUNCATE", pattern: /\bTRUNCATE\b/i },
];

describe("真库测试不得整表清空", () => {
  test("测试文件里没有无条件的整表删除", () => {
    const dir = join(import.meta.dir);
    const files = readdirSync(dir).filter((f) => f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      // 这个文件自己就写着这些模式，扫自己等于自己告自己。
      if (file === "db-safety.test.ts") continue;
      const text = readFileSync(join(dir, file), "utf8");
      for (const { name, pattern } of DESTRUCTIVE_PATTERNS) {
        if (pattern.test(text)) offenders.push(`${file} → ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
