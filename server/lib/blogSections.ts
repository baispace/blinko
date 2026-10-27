import { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

/**
 * 专题 → 章节 → 文章 三层编排。
 *
 * 关键区分：blogTopic.parentId 是「子专题」树（站点层面有哪些专题），
 * blogTopicSection 才是「章节」（一个专题内部怎么分章）。两者不是一回事，
 * 章节不参与专题树的父子关系，也不会继承父专题的文章。
 *
 * 章节只属于一个专题。删章节不删文章 —— 成员文章回落到「未分章节」。
 * 同一文章可以属于多个专题，在每个专题里各自有章节与顺序。
 */

export type SectionDraft = {
  /** 已有章节的 id；新建章节留空。 */
  id?: number | null;
  name: string;
  desc?: string;
  showTitle?: boolean;
  /** 章内文章，按顺序。 */
  noteIds: number[];
};

export type TopicArrangement = {
  topicId: number;
  sections: SectionDraft[];
  /** 未分章节的文章，顺序即展示顺序。 */
  unassignedNoteIds: number[];
};

function assertName(name: string) {
  const value = name.replace(/\s+/g, " ").trim();
  if (!value) throw new TRPCError({ code: "BAD_REQUEST", message: "章节名称不能为空" });
  if ([...value].length > 60)
    throw new TRPCError({ code: "BAD_REQUEST", message: "章节名称最多 60 字" });
  return value;
}

function assertDesc(desc: string | undefined) {
  return (desc ?? "").trim().slice(0, 500);
}

/** 专题下的章节 + 每章文章（按编排顺序）。 */
export async function listTopicSections(
  db: PrismaClient,
  accountId: number,
  topicId: number,
) {
  const topic = await db.blogTopic.findFirst({
    where: { id: topicId, accountId },
    select: { id: true },
  });
  if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "专题不存在" });
  const [sections, members] = await Promise.all([
    db.blogTopicSection.findMany({
      where: { topicId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        desc: true,
        showTitle: true,
        sortOrder: true,
      },
    }),
    db.blogTopicNote.findMany({
      where: { topicId },
      orderBy: [{ sortOrder: "asc" }, { noteId: "asc" }],
      select: { noteId: true, sectionId: true, sortOrder: true },
    }),
  ]);
  return {
    topicId,
    sections: sections.map((section) => ({
      ...section,
      noteIds: members
        .filter((m) => m.sectionId === section.id)
        .map((m) => m.noteId),
    })),
    unassignedNoteIds: members
      .filter((m) => m.sectionId === null)
      .map((m) => m.noteId),
  };
}

/**
 * 「保存编排」：一次性事务提交章节与文章归属。
 *
 * 拖拽过程中不写库 —— 攒够一次再整体落，中途取消不影响线上目录。
 * 章节删除时成员文章显式回落到未分章节（不靠外键的 SET NULL 隐式兜底）。
 */
export async function saveTopicArrangement(
  db: PrismaClient,
  accountId: number,
  input: TopicArrangement,
) {
  return db.$transaction(async (tx) => {
    const topic = await tx.blogTopic.findFirst({
      where: { id: input.topicId, accountId },
      select: { id: true },
    });
    if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "专题不存在" });

    const existingSections = await tx.blogTopicSection.findMany({
      where: { topicId: input.topicId },
      select: { id: true },
    });
    const existingIds = new Set(existingSections.map((s) => s.id));
    const existingMembers = await tx.blogTopicNote.findMany({
      where: { topicId: input.topicId },
      select: { noteId: true },
    });
    const existingNoteIds = existingMembers.map((m) => m.noteId);

    // 章节内去重，并保证一篇文章在一个专题里只出现一次。
    const seenNotes = new Set<number>();
    const sections: {
      id: number;
      name: string;
      desc: string;
      showTitle: boolean;
      sortOrder: number;
      noteIds: number[];
    }[] = [];
    for (const [index, draft] of input.sections.entries()) {
      const name = assertName(draft.name);
      let id = draft.id ?? null;
      if (id !== null) {
        if (!existingIds.has(id))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "章节不属于当前专题，刷新后重试",
          });
        await tx.blogTopicSection.update({
          where: { id },
          data: {
            name,
            desc: assertDesc(draft.desc),
            showTitle: draft.showTitle !== false,
            sortOrder: index,
          },
        });
      } else {
        const created = await tx.blogTopicSection.create({
          data: {
            topicId: input.topicId,
            name,
            desc: assertDesc(draft.desc),
            showTitle: draft.showTitle !== false,
            sortOrder: index,
          },
          select: { id: true },
        });
        id = created.id;
      }
      const noteIds: number[] = [];
      for (const noteId of draft.noteIds) {
        if (!Number.isInteger(noteId) || noteId <= 0) continue;
        if (seenNotes.has(noteId)) continue;
        seenNotes.add(noteId);
        noteIds.push(noteId);
      }
      sections.push({
        id: id!,
        name,
        desc: assertDesc(draft.desc),
        showTitle: draft.showTitle !== false,
        sortOrder: index,
        noteIds,
      });
    }

    // 校验文章归属：只允许本人已发布的文章；已撤回的老成员可以保留。
    const wanted = [
      ...sections.flatMap((s) => s.noteIds),
      ...input.unassignedNoteIds.filter((n) => !seenNotes.has(n)),
    ];
    const uniqueWanted = [...new Set(wanted)];
    if (uniqueWanted.length) {
      const allowed = await tx.notes.count({
        where: {
          id: { in: uniqueWanted },
          accountId,
          isRecycle: false,
          publication: { isNot: null },
          OR: [
            { isPublished: true },
            { id: { in: existingNoteIds } },
          ],
        },
      });
      if (allowed !== uniqueWanted.length)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "只能编排本人已发布的文章；请先发布或从专题中移除",
        });
    }

    // 移除被删掉的章节（成员文章会回落到未分章节）。
    const keepIds = new Set(sections.map((s) => s.id));
    const dropped = existingSections.filter((s) => !keepIds.has(s.id));
    if (dropped.length)
      await tx.blogTopicSection.deleteMany({
        where: { id: { in: dropped.map((s) => s.id) } },
      });

    // 重建成员关系：全局顺序 = 章节顺序 → 章内顺序 → 未分章节。
    const rows: {
      topicId: number;
      noteId: number;
      sectionId: number | null;
      sortOrder: number;
    }[] = [];
    let order = 0;
    for (const section of sections)
      for (const noteId of section.noteIds)
        rows.push({
          topicId: input.topicId,
          noteId,
          sectionId: section.id,
          sortOrder: order++,
        });
    for (const noteId of input.unassignedNoteIds) {
      if (!Number.isInteger(noteId) || noteId <= 0) continue;
      if (seenNotes.has(noteId)) continue;
      seenNotes.add(noteId);
      rows.push({
        topicId: input.topicId,
        noteId,
        sectionId: null,
        sortOrder: order++,
      });
    }

    await tx.blogTopicNote.deleteMany({ where: { topicId: input.topicId } });
    if (rows.length)
      await tx.blogTopicNote.createMany({
        data: rows,
        skipDuplicates: true,
      });
    return listTopicSections(tx as unknown as PrismaClient, accountId, input.topicId);
  });
}

/** 删章节：文章移入未分章节，不删文章。 */
export async function deleteTopicSection(
  db: PrismaClient,
  accountId: number,
  sectionId: number,
) {
  const section = await db.blogTopicSection.findFirst({
    where: { id: sectionId, topic: { accountId } },
    select: { id: true, topicId: true },
  });
  if (!section)
    throw new TRPCError({ code: "NOT_FOUND", message: "章节不存在" });
  await db.$transaction(async (tx) => {
    const members = await tx.blogTopicNote.findMany({
      where: { topicId: section.topicId, sectionId },
      orderBy: [{ sortOrder: "asc" }],
      select: { noteId: true, sortOrder: true },
    });
    // 章节内的文章回落到未分章节，并排到未分章节末尾。
    const tail = await tx.blogTopicNote.aggregate({
      where: { topicId: section.topicId, sectionId: null },
      _max: { sortOrder: true },
    });
    let order = (tail._max.sortOrder ?? -1) + 1;
    for (const member of members)
      await tx.blogTopicNote.update({
        where: {
          topicId_noteId: { topicId: section.topicId, noteId: member.noteId },
        },
        data: { sectionId: null, sortOrder: order++ },
      });
    await tx.blogTopicSection.delete({ where: { id: sectionId } });
  });
  return listTopicSections(db, accountId, section.topicId);
}

/** 章节排序。 */
export async function reorderTopicSections(
  db: PrismaClient,
  accountId: number,
  topicId: number,
  orderedIds: number[],
) {
  const owned = await db.blogTopicSection.findMany({
    where: { topicId, topic: { accountId } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((s) => s.id));
  const ids = orderedIds.filter((id) => ownedIds.has(id));
  if (ids.length !== ownedIds.size)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "章节列表已变化，刷新后重试",
    });
  await db.$transaction(
    ids.map((id, index) =>
      db.blogTopicSection.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
  return listTopicSections(db, accountId, topicId);
}

/**
 * 文章在某个专题里的章节归属。
 * 同一文章可以在多个专题里各自落在不同章节。
 */
export async function setArticleTopicSection(
  db: PrismaClient,
  accountId: number,
  input: { noteId: number; topicId: number; sectionId?: number | null },
) {
  const [topic, note] = await Promise.all([
    db.blogTopic.findFirst({
      where: { id: input.topicId, accountId },
      select: { id: true },
    }),
    db.notes.findFirst({
      where: { id: input.noteId, accountId },
      select: { id: true, isPublished: true, isRecycle: true },
    }),
  ]);
  if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "专题不存在" });
  if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "文章不存在" });
  if (note.isRecycle)
    throw new TRPCError({ code: "BAD_REQUEST", message: "文章在回收站中" });
  let sectionId: number | null = null;
  if (input.sectionId) {
    const section = await db.blogTopicSection.findFirst({
      where: { id: input.sectionId, topicId: input.topicId },
      select: { id: true },
    });
    if (!section)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "章节不属于当前专题，刷新后重试",
      });
    sectionId = section.id;
  }
  const existing = await db.blogTopicNote.findFirst({
    where: { topicId: input.topicId, noteId: input.noteId },
    select: { sortOrder: true },
  });
  if (!existing) {
    if (!note.isPublished)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "只能把已发布的文章放进专题",
      });
    const tail = await db.blogTopicNote.aggregate({
      where: { topicId: input.topicId },
      _max: { sortOrder: true },
    });
    await db.blogTopicNote.create({
      data: {
        topicId: input.topicId,
        noteId: input.noteId,
        sectionId,
        sortOrder: (tail._max.sortOrder ?? -1) + 1,
      },
    });
  } else {
    await db.blogTopicNote.update({
      where: {
        topicId_noteId: { topicId: input.topicId, noteId: input.noteId },
      },
      data: { sectionId },
    });
  }
  return listTopicSections(db, accountId, input.topicId);
}

/** 把文章从专题里移出（文章本身保留）。 */
export async function removeArticleTopic(
  db: PrismaClient,
  accountId: number,
  input: { noteId: number; topicId: number },
) {
  const topic = await db.blogTopic.findFirst({
    where: { id: input.topicId, accountId },
    select: { id: true },
  });
  if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "专题不存在" });
  await db.blogTopicNote.deleteMany({
    where: { topicId: input.topicId, noteId: input.noteId },
  });
  return listTopicSections(db, accountId, input.topicId);
}
