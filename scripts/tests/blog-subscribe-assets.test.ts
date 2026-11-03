import { expect, test } from "bun:test";
import { publicSubscribeQrPaths } from "../../server/lib/blogSiteSettings";

const db = (url: string) => ({ config: { findMany: async () => [{ config: { subscribe: { wechatQrUrl: url } } }] } }) as any;

test("saved QR images are readable for local and S3 storage", async () => {
  for (const path of ["/api/file/qr.png", "/api/s3file/blinko/qr.png"]) {
    expect(await publicSubscribeQrPaths(db(path), [1])).toEqual([path]);
  }
});
test("external URLs and malformed settings never grant attachment access", async () => {
  expect(await publicSubscribeQrPaths(db("https://example.com/qr.png"), [1])).toEqual([]);
  expect(await publicSubscribeQrPaths(db("/api/fileevil/qr.png"), [1])).toEqual([]);
  expect(await publicSubscribeQrPaths({ config: { findMany: async () => [{ config: { subscribe: { wechatQrUrl: 42 } } }] } } as any, [1])).toEqual([]);
});
test("no owner never queries or grants public QR access", async () => {
  expect(await publicSubscribeQrPaths({} as any, [])).toEqual([]);
});
