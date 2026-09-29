#!/usr/bin/env node
/**
 * fix-cdn-config.mjs — 安全切换 Blinko 静态资源 CDN 开关 (staticCdnEnabled)
 *
 * 用途：打破「站点因 CDN 缺文件白屏 → 设置页打不开 → 无法上传静态资源 → 继续白屏」的死循环。
 *       把 staticCdnEnabled 设为 off，站点改回回源本地 server/public 静态资源，页面即可恢复；
 *       恢复后再到设置页上传静态资源到 CDN，开关会被代码自动开回。
 *
 * 用法（连接参数全部走环境变量，带本地默认值便于本地测试）：
 *   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=baihe PGPASSWORD=xxx PGDATABASE=blinko \
 *     node scripts/fix-cdn-config.mjs off            # 关闭 CDN（默认动作）
 *     node scripts/fix-cdn-config.mjs on             # 开启 CDN
 *     node scripts/fix-cdn-config.mjs off --dry-run  # 只查询、不修改
 *
 * 说明：
 *   - 只读/只改 `config` 表中 key='staticCdnEnabled' 这一行，绝不动其他行。
 *   - config 列是 JSON，存储格式为 {type:'boolean', value:true/false}，与代码写入格式一致。
 *   - 执行后需在服务器重启 Blinko 应用容器让配置生效：docker restart <blinko_app>
 */
import pg from 'pg';

const ACTION = process.argv[2] || 'off';
const DRY = process.argv.includes('--dry-run');

if (!['on', 'off'].includes(ACTION)) {
  console.error('用法: node scripts/fix-cdn-config.mjs [on|off] [--dry-run]');
  process.exit(2);
}

const TARGET = ACTION === 'on'
  ? { type: 'boolean', value: true }
  : { type: 'boolean', value: false };

const cfg = {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || process.env.PGHORT || 5432),
  user: process.env.PGUSER || 'baihe',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'blinko',
};

const client = new pg.Client(cfg);

try {
  await client.connect();
  console.log(`==> 已连接: ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);

  const before = await client.query(
    `SELECT key, config FROM "config" WHERE key = 'staticCdnEnabled'`
  );
  const beforeVal = before.rows[0]?.config ?? null;
  console.log('==> 当前 staticCdnEnabled:', JSON.stringify(beforeVal));

  if (DRY) {
    console.log(`==> [dry-run] 将设为: ${JSON.stringify(TARGET)}（未实际修改）`);
    process.exit(0);
  }

  if (!before.rows.length) {
    // 该行不存在：off 时无操作意义；on 时创建一个，保证开关可用。
    if (ACTION === 'on') {
      await client.query(
        `INSERT INTO "config" (key, config) VALUES ('staticCdnEnabled', $1::json)`,
        [JSON.stringify(TARGET)]
      );
      console.log('==> 原无该行，已创建并设为 on');
    } else {
      console.log('==> 原无该行，CDN 本就未启用，无需处理');
    }
  } else {
    const res = await client.query(
      `UPDATE "config" SET config = $1::json WHERE key = 'staticCdnEnabled'`,
      [JSON.stringify(TARGET)]
    );
    console.log(`==> 已更新行数: ${res.rowCount}`);
  }

  const after = await client.query(
    `SELECT key, config FROM "config" WHERE key = 'staticCdnEnabled'`
  );
  console.log('==> 更新后 staticCdnEnabled:', JSON.stringify(after.rows[0]?.config ?? null));
  console.log('✅ 完成。请在服务器重启 Blinko 应用容器使配置生效: docker restart <blinko_app>');
} catch (err) {
  console.error('❌ 执行失败:', err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
