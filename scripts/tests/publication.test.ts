import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  assertPublishableBody,
  publicationStatus,
  publishSnapshot,
  readPublicPublication,
  publicPublicationWhere,
  publicPublicationDTO,
} from "../../server/lib/publication";

test("rejects private resource paths and empty bodies before publishing", () => {
  for (const value of [
    "",
    "<p> </p>",
    "![private](/api/file/secret.png)",
    '<img src="https://ink.example/api/s3file/private.png">',
    "[file](%2Fapi%2Ffile%2Fx)",
    "[file](https://x.test?token=secret)",
  ])
    expect(() => assertPublishableBody(value)).toThrow();
  expect(() => assertPublishableBody("# 已保存标题\n公开正文")).not.toThrow();
});

// Only run against the explicitly selected local development database.
const suite =
  process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;
suite("publication database lifecycle", () => {
  const db = new PrismaClient();
  let owner: number, other: number, id: number;
  beforeAll(async () => {
    const name = "publication-test-" + crypto.randomUUID();
    owner = (await db.accounts.create({ data: { name } })).id;
    other = (await db.accounts.create({ data: { name: name + "-other" } })).id;
    id = (
      await db.notes.create({
        data: {
          accountId: owner,
          content: "# 实验 A\n第一版正文",
          type: 1,
          sharePassword: "PRIVATE_PASSWORD",
          metadata: { privateContext: "PRIVATE_METADATA" },
        },
      })
    ).id;
  });
  afterAll(async () => {
    if (owner) {
      await db.notes.deleteMany({ where: { accountId: owner } });
      await db.accounts.delete({ where: { id: owner } });
    }
    if (other) await db.accounts.delete({ where: { id: other } });
    await db.$disconnect();
  });
  test("publish, private edits, update, withdrawal and republish keep snapshot boundaries", async () => {
    const draft = await publicationStatus(db, owner, id);
    const published = await publishSnapshot(db, owner, {
      id,
      expectedUpdatedAt: draft.draftUpdatedAt,
    });
    const key = published.publishId!;
    expect(key).toBeTruthy();
    const initial = await readPublicPublication(db, key);
    expect(initial?.content).toContain("第一版正文");
    expect(initial?.sharePassword).toBe("");
    expect(initial?.accountId).toBeNull();
    expect(initial?.references).toEqual([]);
    expect(initial?.tags).toEqual([]);
    expect(JSON.stringify(initial)).not.toContain("PRIVATE_");
    await db.notes.update({
      where: { id },
      data: { content: "# 实验 B\n第二版草稿独有词" },
    });
    expect((await readPublicPublication(db, key))?.content).toBe(
      initial?.content,
    );
    expect((await publicationStatus(db, owner, id)).hasChanges).toBe(true);
    const search = await db.notes.findMany({
      where: {
        ...publicPublicationWhere,
        publication: { is: { content: { contains: "草稿独有词" } } },
      },
      include: { publication: true },
    });
    expect(search.map(publicPublicationDTO).some((n) => n?.id === id)).toBe(
      false,
    );
    await expect(
      publishSnapshot(db, owner, {
        id,
        expectedUpdatedAt: draft.draftUpdatedAt,
      }),
    ).rejects.toThrow("笔记已更新");
    await expect(publishSnapshot(db, other, { id })).rejects.toThrow("无权");
    await expect(
      publishSnapshot(db, other, { id, isCancel: true }),
    ).rejects.toThrow("无权");
    await publishSnapshot(db, owner, { id });
    expect((await readPublicPublication(db, key))?.content).toContain(
      "第二版草稿",
    );
    expect((await publicationStatus(db, owner, id)).revision).toBe(2);
    await publishSnapshot(db, owner, { id });
    expect((await publicationStatus(db, owner, id)).revision).toBe(2);
    await publishSnapshot(db, owner, { id, isCancel: true });
    expect(await readPublicPublication(db, key)).toBeNull();
    expect(
      (await db.notes.findMany({ where: { ...publicPublicationWhere, id } }))
        .length,
    ).toBe(0);
    const again = await publishSnapshot(db, owner, { id });
    expect(again.publishId).toBe(key);
    expect((await publicationStatus(db, owner, id)).revision).toBe(2);
    await db.notes.update({ where: { id }, data: { isRecycle: true } });
    expect(await readPublicPublication(db, key)).toBeNull();
    await expect(publishSnapshot(db, owner, { id })).rejects.toThrow("回收站");
    await publishSnapshot(db, owner, { id, isCancel: true });
    await db.notes.update({
      where: { id },
      data: { isRecycle: false, content: "![private](/api/file/private.png)" },
    });
    await expect(publishSnapshot(db, owner, { id })).rejects.toThrow(
      "站内图片",
    );
    expect(await readPublicPublication(db, key)).toBeNull();
  });
  test("the document title is also an explicit public snapshot", async () => {
    const titled = await db.notes.create({
      data: {
        accountId: owner,
        content: "# 正文小节",
        metadata: { title: "公开标题A", secret: "PRIVATE_VALUE" },
      },
    });
    const first = await publishSnapshot(db, owner, { id: titled.id });
    await db.notes.update({
      where: { id: titled.id },
      data: { metadata: { title: "草稿标题B", secret: "PRIVATE_VALUE" } },
    });
    expect(
      (await readPublicPublication(db, first.publishId!))?.metadata.title,
    ).toBe("公开标题A");
    expect((await publicationStatus(db, owner, titled.id)).hasChanges).toBe(
      true,
    );
    await publishSnapshot(db, owner, { id: titled.id });
    const publicNote = await readPublicPublication(db, first.publishId!);
    expect(publicNote?.metadata.title).toBe("草稿标题B");
    expect(JSON.stringify(publicNote)).not.toContain("PRIVATE_VALUE");
  });
  test("old publication without a snapshot fails closed until explicitly republished", async () => {
    const legacy = await db.notes.create({
      data: {
        accountId: owner,
        content: "旧草稿",
        publishId: "legacy-" + crypto.randomUUID(),
        isPublished: true,
      },
    });
    expect(await readPublicPublication(db, legacy.publishId!)).toBeNull();
    expect(
      (await publicationStatus(db, owner, legacy.id)).legacyPublished,
    ).toBe(true);
    await publishSnapshot(db, owner, { id: legacy.id });
    expect((await readPublicPublication(db, legacy.publishId!))?.content).toBe(
      "旧草稿",
    );
  });
});
