import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  publicationStatus,
  publishSnapshot,
  readPublicPublication,
} from "../../server/lib/publication";
import {
  setPublicationCover,
  listPublishedForManage,
} from "../../server/lib/blog";
const suite =
  process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;
suite("publish review and first-cover lifecycle", () => {
  const db = new PrismaClient();
  let owner = 0,
    other = 0;
  /** 本测试造出来的附件 id：清理时按 id 精确删除。 */
  const attachmentIds = new Set<number>();
  beforeAll(async () => {
    owner = (
      await db.accounts.create({
        data: { name: "review-" + crypto.randomUUID() },
      })
    ).id;
    other = (
      await db.accounts.create({
        data: { name: "review-other-" + crypto.randomUUID() },
      })
    ).id;
  });
  afterAll(async () => {
    // 先删附件再删笔记：笔记一删，附件的 noteId 会被置空，
    // 那些行就变成没人认领的孤儿，一直留在库里 —— 所以要单独带走。
    if (attachmentIds.size) {
      await db.attachments.deleteMany({
        where: { id: { in: [...attachmentIds] } },
      });
    }
    for (const accountId of [owner, other])
      if (accountId) {
        await db.notes.deleteMany({ where: { accountId } });
        await db.accounts.delete({ where: { id: accountId } });
      }
    await db.$disconnect();
  });
  const draft = () =>
    db.notes.create({
      data: {
        accountId: owner,
        content: "Public saved body",
        metadata: {
          title: "Public title",
          summary: "Public summary",
          privateKey: "PRIVATE_SECRET",
        },
      },
    });
  const image = async (noteId: number) => {
    const row = await db.attachments.create({
      data: {
        noteId,
        name: "cover.png",
        path: "/api/file/review-" + crypto.randomUUID() + ".png",
        type: "image/png",
        size: 120,
      },
    });
    attachmentIds.add(row.id);
    return row;
  };
  test("first review is read-only and first publish can atomically include an owned cover", async () => {
    const note = await draft(),
      cover = await image(note.id);
    const review = await publicationStatus(db, owner, note.id);
    expect(review.canPublish).toBe(true);
    expect(review.draft.title).toBe("Public title");
    expect(review.current).toBeNull();
    expect(review.coverOptions.map((c) => c.id)).toContain(cover.id);
    expect(JSON.stringify(review)).not.toContain("PRIVATE_SECRET");
    expect(
      await db.notePublication.findUnique({ where: { noteId: note.id } }),
    ).toBeNull();
    const published = await publishSnapshot(db, owner, {
      id: note.id,
      expectedPublicationToken: review.reviewToken,
      coverAttachmentId: cover.id,
    });
    expect(
      (await readPublicPublication(db, published.publishId!))?.metadata
        .coverUrl,
    ).toBe(cover.path);
    expect((await publicationStatus(db, owner, note.id)).hasChanges).toBe(
      false,
    );
    expect(
      (await listPublishedForManage(db, owner)).find((p) => p.id === note.id)
        ?.hasDraftChanges,
    ).toBe(false);
  });
  test("stale cover preview conflicts even when the original note timestamp is unchanged", async () => {
    const note = await draft();
    await publishSnapshot(db, owner, { id: note.id });
    const review = await publicationStatus(db, owner, note.id),
      cover = await image(note.id);
    await setPublicationCover(db, owner, note.id, cover.id);
    expect(
      (await publicationStatus(db, owner, note.id)).draftUpdatedAt.getTime(),
    ).toBe(review.draftUpdatedAt.getTime());
    await expect(
      publishSnapshot(db, owner, {
        id: note.id,
        expectedPublicationToken: review.reviewToken,
      }),
    ).rejects.toThrow("状态已变化");
    const fresh = await publicationStatus(db, owner, note.id);
    expect(fresh.changes).toContain("cover");
    await publishSnapshot(db, owner, {
      id: note.id,
      expectedPublicationToken: fresh.reviewToken,
    });
    expect((await publicationStatus(db, owner, note.id)).revision).toBe(2);
  });
  test("foreign covers cannot publish; body blockers are visible before submission", async () => {
    const note = await draft(),
      foreign = await db.notes.create({
        data: { accountId: other, content: "Foreign" },
      }),
      cover = await image(foreign.id);
    await expect(
      publishSnapshot(db, owner, { id: note.id, coverAttachmentId: cover.id }),
    ).rejects.toThrow("属于这篇笔记");
    expect((await publicationStatus(db, owner, note.id)).revision).toBe(0);
    await db.notes.update({
      where: { id: note.id },
      data: { content: "![private](https://x.test/a.png?token=secret)" },
    });
    const review = await publicationStatus(db, owner, note.id);
    expect(review.canPublish).toBe(false);
    expect(review.blockers.join(" ")).toContain("凭据");
  });
  test("withdrawal and republication require fresh preview tokens and keep the original URL", async () => {
    const note = await draft(),
      published = await publishSnapshot(db, owner, { id: note.id });
    const review = await publicationStatus(db, owner, note.id);
    await publishSnapshot(db, owner, {
      id: note.id,
      isCancel: true,
      expectedPublicationToken: review.reviewToken,
    });
    expect(await readPublicPublication(db, published.publishId!)).toBeNull();
    await expect(
      publishSnapshot(db, owner, {
        id: note.id,
        expectedPublicationToken: review.reviewToken,
      }),
    ).rejects.toThrow("状态已变化");
    const fresh = await publicationStatus(db, owner, note.id);
    const again = await publishSnapshot(db, owner, {
      id: note.id,
      expectedPublicationToken: fresh.reviewToken,
    });
    expect(again.publishId).toBe(published.publishId);
    expect((await publicationStatus(db, owner, note.id)).revision).toBe(1);
  });
  test("explicitly choosing the current cover discards an unneeded pending cover without a new revision", async () => {
    const note = await draft(),
      cover = await image(note.id),
      otherCover = await image(note.id);
    await publishSnapshot(db, owner, {
      id: note.id,
      coverAttachmentId: cover.id,
    });
    await setPublicationCover(db, owner, note.id, otherCover.id);
    const review = await publicationStatus(db, owner, note.id);
    await publishSnapshot(db, owner, {
      id: note.id,
      expectedPublicationToken: review.reviewToken,
      coverAttachmentId: cover.id,
    });
    const after = await publicationStatus(db, owner, note.id);
    expect(after.revision).toBe(1);
    expect(after.hasChanges).toBe(false);
  });
});
