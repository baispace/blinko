import { BlogButton, BlogSelect, BlogInput, BlogCheckbox, BlogTextarea } from "./BlogUI";
import { confirmBlogAction } from "./confirmBlogAction";
/*
 * 专题编排台：专题 → 章节 → 文章 三层结构的编辑页。
 *
 * 交互模型：
 * 1. 所有编辑先落在本地草稿（draft），只有点「保存编排」才一次性提交
 *    saveTopicArrangement —— 拖拽中途不写库，中途离开也不影响线上目录。
 * 2. 拖拽只改本地 state：章节之间可排序，文章可跨章移动。
 * 3. 拖拽之外另有「…」菜单（上移 / 下移 / 移入章节），
 *    方便不方便用鼠标拖拽的场景。
 * 4. 有未保存改动时给 beforeunload 保护。
 */
import "./blog.css";
import "./manage.css";
import "./arrange.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/trpc";
import { blogImageUrl } from "@/lib/blogImage";
import { RootStore } from "@/store";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { Icon } from "@/components/Common/Iconify/icons";

type Post = Awaited<ReturnType<typeof api.blog.published.query>>[number];
type Topic = Awaited<ReturnType<typeof api.blog.topics.query>>[number];
type Arrangement = Awaited<ReturnType<typeof api.blog.topicSections.query>>;

/** 公开站与管理页共用同一个主题键。 */
const THEME_KEY = "ink-blog-theme";
const NAME_LIMIT = 60;
const DESC_LIMIT = 200;

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function notifyError(error: unknown) {
  RootStore.Get(ToastPlugin).error(
    error instanceof Error ? error.message : "操作失败，请重试",
  );
}

/* ---------- 本地草稿的数据结构 ---------- */

type DraftSection = {
  /** 本地稳定 key：已存在的章节用 id，新建的用自增序号。 */
  key: string;
  /** 服务端章节 id；新建的章节没有。 */
  id?: number;
  name: string;
  desc: string;
  showTitle: boolean;
  /** 章内文章 id，按编排顺序。 */
  noteIds: number[];
};

type Draft = {
  sections: DraftSection[];
  /** 未分章节的文章 id。 */
  unassigned: number[];
};

type DragPayload =
  | { kind: "section"; key: string }
  | { kind: "note"; noteId: number };

/** 只比较会影响落库的部分，用于判断「有未保存修改」。 */
function serialize(draft: Draft) {
  return JSON.stringify([
    draft.sections.map((s) => [
      s.id ?? 0,
      s.name,
      s.desc,
      s.showTitle,
      s.noteIds,
    ]),
    draft.unassigned,
  ]);
}

/** 服务端编排 → 本地草稿。找不到的文章（已删除）会被剔除，否则保存会被后端拒。 */
function toDraft(
  arrangement: Arrangement,
  validNoteIds: Set<number>,
): { draft: Draft; dropped: number } {
  let dropped = 0;
  const keep = (ids: number[]) => {
    const result = ids.filter((id) => validNoteIds.has(id));
    dropped += ids.length - result.length;
    return result;
  };
  // 先把草稿算完，再返回被剔除的数量 —— keep() 会累加计数。
  const draft: Draft = {
    sections: arrangement.sections.map((s) => ({
      key: `s${s.id}`,
      id: s.id,
      name: s.name,
      desc: s.desc ?? "",
      showTitle: s.showTitle !== false,
      noteIds: keep(s.noteIds),
    })),
    unassigned: keep(arrangement.unassignedNoteIds),
  };
  return { draft, dropped };
}

function listOf(draft: Draft | null, sectionKey: string | null) {
  if (!draft) return [];
  if (sectionKey === null) return draft.unassigned;
  return draft.sections.find((s) => s.key === sectionKey)?.noteIds ?? [];
}

function withList(draft: Draft, sectionKey: string | null, next: number[]) {
  if (sectionKey === null) return { ...draft, unassigned: next };
  return {
    ...draft,
    sections: draft.sections.map((s) =>
      s.key === sectionKey ? { ...s, noteIds: next } : s,
    ),
  };
}

/** 文章当前在哪个列表、列表里的第几位。 */
function locate(draft: Draft, noteId: number) {
  for (const section of draft.sections) {
    const index = section.noteIds.indexOf(noteId);
    if (index >= 0) return { sectionKey: section.key, index };
  }
  const index = draft.unassigned.indexOf(noteId);
  if (index >= 0) return { sectionKey: null, index };
  return null;
}

/**
 * 移动文章：先从原位置摘掉，再插到目标位置 —— 保证一篇文章只出现一次。
 *
 * 落点语义与拖拽手柄一致：被拖的文章占据目标文章原来的位置，
 * 目标之后的文章整体后移。所以插入下标就是目标在原列表里的下标。
 */
function moveNote(
  draft: Draft,
  noteId: number,
  targetSectionKey: string | null,
  targetIndex: number | null,
) {
  const from = locate(draft, noteId);
  if (!from) return draft;
  const source = [...listOf(draft, from.sectionKey)];
  const [moved] = source.splice(from.index, 1);
  if (moved === undefined) return draft;
  const working = withList(draft, from.sectionKey, source);
  const target = [...listOf(working, targetSectionKey)];
  const index =
    targetIndex === null
      ? target.length
      : Math.max(0, Math.min(targetIndex, target.length));
  target.splice(index, 0, moved);
  return withList(working, targetSectionKey, target);
}

/** 把新文章放进某个章节（末尾）。已在专题里的文章不再重复添加。 */
function appendNote(draft: Draft, noteId: number, sectionKey: string | null) {
  if (locate(draft, noteId)) return draft;
  if (sectionKey === null)
    return { ...draft, unassigned: [...draft.unassigned, noteId] };
  return {
    ...draft,
    sections: draft.sections.map((s) =>
      s.key === sectionKey ? { ...s, noteIds: [...s.noteIds, noteId] } : s,
    ),
  };
}

/**
 * 章节排序：被拖动的章节占据目标章节原来的位置，目标之后的章节整体后移。
 */
function moveSection(draft: Draft, fromKey: string, toKey: string) {
  const from = draft.sections.findIndex((s) => s.key === fromKey);
  const to = draft.sections.findIndex((s) => s.key === toKey);
  if (from < 0 || to < 0 || from === to) return draft;
  const next = [...draft.sections];
  const [item] = next.splice(from, 1);
  if (!item) return draft;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return { ...draft, sections: next };
}

/* ---------- 展示辅助 ---------- */

function formatDate(value: Date | string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function postTitle(post: Post) {
  const explicit = post.publication?.title?.trim();
  if (explicit) return explicit;
  const fallback = (post.content || "")
    .replace(/<\/(?:p|div|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .split("\n")
    .find((line) => line.trim())
    ?.replace(/^#{1,6}\s*/, "")
    .trim();
  return fallback || "无标题";
}

function postCover(post: Post) {
  const coverId = post.publication?.coverAttachmentId;
  const attachment = coverId
    ? post.attachments.find((a) => a.id === coverId)
    : undefined;
  if (!attachment) return "";
  return blogImageUrl(attachment.path);
}

/* ---------- 行内操作菜单（"…"） ---------- */

type MenuItem = {
  key: string;
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  /** 有子菜单的项：点开后在菜单里就地展开。 */
  submenu?: ReactNode;
};

/**
 * 浮层用 fixed 定位：祖先有 overflow:hidden，absolute 会被裁掉。
 */
function ArrangeMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, flip: false });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menu.current?.contains(target) || trigger.current?.contains(target))
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open && trigger.current) {
      const rect = trigger.current.getBoundingClientRect();
      // 下方放不下就翻到上面去。
      const flip = rect.bottom + 320 > window.innerHeight && rect.top > 320;
      setPos({
        top: flip ? rect.top - 8 : rect.bottom + 8,
        left: Math.max(12, Math.min(rect.right - 210, window.innerWidth - 222)),
        flip,
      });
      setExpanded(null);
    }
    setOpen(!open);
  };

  return (
    <>
      <BlogButton
        ref={trigger}
        type="button"
        className="ink-mg-button ink-mg-menu-trigger"
        aria-label={label}
        aria-expanded={open}
        onClick={toggle}
      >
        <Icon icon="tabler:dots" width={16} />
      </BlogButton>
      {open && (
        <div
          ref={menu}
          className="ink-mg-menu-pop"
          data-flip={pos.flip}
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => {
            // 子菜单的展开按钮不该收起菜单，其余点击一律收起。
            if ((e.target as HTMLElement).closest("[data-keep-open]")) return;
            setOpen(false);
          }}
        >
          {items.map((item) => (
            <div key={item.key}>
              <BlogButton
                type="button"
                className="ink-mg-menu-item"
                data-danger={item.danger ? "true" : undefined}
                data-keep-open={item.submenu ? "true" : undefined}
                disabled={item.disabled}
                aria-expanded={item.submenu ? expanded === item.key : undefined}
                onClick={() => {
                  if (item.submenu) {
                    setExpanded((v) => (v === item.key ? null : item.key));
                    return;
                  }
                  item.onClick?.();
                }}
              >
                {item.icon && <Icon icon={item.icon} width={15} />}
                {item.label}
                {item.submenu && (
                  <Icon
                    icon={
                      expanded === item.key
                        ? "tabler:chevron-down"
                        : "tabler:chevron-right"
                    }
                    width={14}
                    className="ink-ar-menu-caret"
                  />
                )}
              </BlogButton>
              {item.submenu && expanded === item.key && (
                <div className="ink-ar-submenu">{item.submenu}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- 组件 ---------- */

export function BlogTopicArrange({
  topicId,
  embedded = false,
  onSaved,
  onDirtyChange,
}: {
  topicId: number;
  embedded?: boolean;
  onSaved?: () => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const navigate = useNavigate();
  const [theme] = useState(() => readTheme());
  const [topic, setTopic] = useState<Topic | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerPicked, setPickerPicked] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dragRef = useRef<DragPayload | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const postMap = useMemo(() => {
    const map = new Map<number, Post>();
    posts.forEach((p) => map.set(p.id, p));
    return map;
  }, [posts]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [topics, published, arrangement] = await Promise.all([
        api.blog.topics.query(),
        api.blog.published.query(),
        api.blog.topicSections.query({ topicId }),
      ]);
      const current = topics.find((t) => t.id === topicId) ?? null;
      const valid = new Set(published.map((p) => p.id));
      const { draft: next, dropped } = toDraft(arrangement, valid);
      setTopics(topics);
      setTopic(current);
      setPosts(published);
      setDraft(next);
      setBaseline(serialize(next));
      setSelectedKey((prev) =>
        prev && next.sections.some((s) => s.key === prev) ? prev : null,
      );
      setError("");
      if (dropped > 0)
        RootStore.Get(ToastPlugin).error(
          `${dropped} 篇文章已不可用，已从编排中移除`,
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败，请重试");
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = !!draft && serialize(draft) !== baseline;
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  // 离开保护：有未保存改动时拦一下浏览器的关闭/刷新。
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    addEventListener("beforeunload", guard);
    return () => removeEventListener("beforeunload", guard);
  }, [dirty]);

  const patchDraft = useCallback((updater: (d: Draft) => Draft) => {
    setDraft((d) => (d ? updater(d) : d));
  }, []);

  const selected = draft?.sections.find((s) => s.key === selectedKey) ?? null;

  const articleCount =
    (draft?.sections.reduce((sum, s) => sum + s.noteIds.length, 0) ?? 0) +
    (draft?.unassigned.length ?? 0);

  const topicNoteIds = useMemo(() => {
    const set = new Set<number>();
    draft?.sections.forEach((s) => s.noteIds.forEach((id) => set.add(id)));
    draft?.unassigned.forEach((id) => set.add(id));
    return set;
  }, [draft]);

  const pickerCandidates = useMemo(() => {
    const keyword = pickerQuery.trim().toLowerCase();
    return posts.filter(
      (p) =>
        p.isPublished &&
        !topicNoteIds.has(p.id) &&
        (!keyword || postTitle(p).toLowerCase().includes(keyword)),
    );
  }, [posts, topicNoteIds, pickerQuery]);

  /* ---------- 章节操作 ---------- */

  const addSection = () => {
    const key = `new${++seq.current}`;
    patchDraft((d) => ({
      ...d,
      sections: [
        ...d.sections,
        {
          key,
          name: "新章节",
          desc: "",
          showTitle: true,
          noteIds: [],
        },
      ],
    }));
    setSelectedKey(key);
    setCollapsed((c) => ({ ...c, [key]: false }));
    setTimeout(() => {
      nameInput.current?.focus();
      nameInput.current?.select();
    }, 0);
  };

  const removeSection = async (section: DraftSection) => {
    if (
      !await confirmBlogAction(
        `删除章节「${section.name || "未命名章节"}」后，章内 ${section.noteIds.length} 篇文章会移至未分章节，不删除文章。确定删除？`,
      )
    )
      return;
    patchDraft((d) => ({
      ...d,
      sections: d.sections.filter((s) => s.key !== section.key),
      unassigned: [...d.unassigned, ...section.noteIds],
    }));
    setSelectedKey((prev) => (prev === section.key ? null : prev));
  };

  const shiftSection = (section: DraftSection, delta: number) => {
    patchDraft((d) => {
      const index = d.sections.findIndex((s) => s.key === section.key);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= d.sections.length) return d;
      const next = [...d.sections];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, sections: next };
    });
  };

  /* ---------- 文章操作 ---------- */

  const shiftNote = (
    sectionKey: string | null,
    index: number,
    delta: number,
  ) => {
    patchDraft((d) => {
      const list = [...listOf(d, sectionKey)];
      const target = index + delta;
      if (target < 0 || target >= list.length) return d;
      [list[index], list[target]] = [list[target], list[index]];
      return withList(d, sectionKey, list);
    });
  };

  const moveNoteToSection = (
    noteId: number,
    sectionKey: string | null,
    index: number | null = null,
  ) => {
    patchDraft((d) => moveNote(d, noteId, sectionKey, index));
  };

  const removeNoteFromTopic = (noteId: number) => {
    patchDraft((d) => {
      const from = locate(d, noteId);
      if (!from) return d;
      const list = [...listOf(d, from.sectionKey)];
      list.splice(from.index, 1);
      return withList(d, from.sectionKey, list);
    });
  };

  const addPicked = () => {
    if (!pickerPicked.length) return;
    patchDraft((d) => {
      let next = d;
      for (const noteId of pickerPicked) {
        next = appendNote(next, noteId, selectedKey);
      }
      return next;
    });
    setPickerPicked([]);
    setPickerQuery("");
    setPickerOpen(false);
  };

  /* ---------- 保存 / 取消 ---------- */

  const save = async () => {
    if (!draft) return;
    const blank = draft.sections.find((s) => !s.name.trim());
    if (blank) {
      RootStore.Get(ToastPlugin).error("章节名称不能为空");
      setSelectedKey(blank.key);
      setTimeout(() => nameInput.current?.focus(), 0);
      return;
    }
    setBusy(true);
    try {
      await api.blog.saveTopicArrangement.mutate({
        topicId,
        sections: draft.sections.map((s) => ({
          id: s.id,
          name: s.name.trim(),
          desc: s.desc.trim(),
          showTitle: s.showTitle,
          noteIds: s.noteIds,
        })),
        unassignedNoteIds: draft.unassigned,
      });
      await load();
      await onSaved?.();
      RootStore.Get(ToastPlugin).success("编排已保存");
    } catch (e) {
      notifyError(e);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    await load();
  };

  /* ---------- 拖拽 ---------- */

  const onDragStart = (e: ReactDragEvent, payload: DragPayload) => {
    dragRef.current = payload;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(
      "text/plain",
      payload.kind === "section" ? payload.key : String(payload.noteId),
    );
  };

  /**
   * 章节块上的落点：targetKey 为 null 表示「未分章节」区块。
   */
  const onDropSection = (e: ReactDragEvent, targetKey: string | null) => {
    e.preventDefault();
    const payload = dragRef.current;
    dragRef.current = null;
    if (!payload) return;
    if (payload.kind === "section") {
      // 章节不能落进「未分章节」。
      if (!targetKey || payload.key === targetKey) return;
      patchDraft((d) => moveSection(d, payload.key, targetKey));
      return;
    }
    // 拖到章节上：落进这一章的末尾。
    patchDraft((d) => moveNote(d, payload.noteId, targetKey, null));
  };

  const onDropNote = (
    e: ReactDragEvent,
    sectionKey: string | null,
    index: number,
  ) => {
    const payload = dragRef.current;
    if (!payload || payload.kind !== "note") return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = null;
    patchDraft((d) => moveNote(d, payload.noteId, sectionKey, index));
  };

  /* ---------- 渲染 ---------- */

  const renderArticle = (
    noteId: number,
    sectionKey: string | null,
    index: number,
  ) => {
    const post = postMap.get(noteId);
    const published = !!post?.isPublished;
    const date = post?.publication?.createdAt
      ? formatDate(post.publication.createdAt)
      : "";
    const cover = post ? postCover(post) : "";
    const canMoveUp = index > 0;
    const canMoveDown = index < listOf(draft, sectionKey).length - 1;
    const moveTargets: { key: string; label: string }[] = (
      draft?.sections ?? []
    )
      .filter((s) => s.key !== sectionKey)
      .map((s) => ({ key: s.key, label: s.name || "未命名章节" }));
    return (
      <div
        key={noteId}
        className="ink-ar-article"
        draggable
        onDragStart={(e) => onDragStart(e, { kind: "note", noteId })}
        onDragEnd={() => {
          dragRef.current = null;
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => onDropNote(e, sectionKey, index)}
      >
        <span className="ink-ar-grip" aria-hidden="true">
          <Icon icon="tabler:grip-vertical" width={15} />
        </span>
        <span className="ink-ar-thumb">
          {cover ? (
            <img src={cover} alt="" />
          ) : (
            <Icon icon="tabler:photo" width={15} />
          )}
        </span>
        <span className="ink-ar-article-main">
          <span className="ink-ar-article-title">
            {post ? postTitle(post) : `文章 #${noteId}`}
          </span>
          <span className="ink-ar-article-meta">
            <span
              className="ink-ar-dot"
              data-on={published ? "true" : "false"}
              aria-hidden="true"
            />
            {published ? "已发布" : "已撤回"}
            {date ? ` · ${date}` : ""}
          </span>
        </span>
        <ArrangeMenu
          label={`文章操作：${post ? postTitle(post) : noteId}`}
          items={[
            {
              key: "move",
              label: "移入章节",
              icon: "tabler:files",
              submenu: (
                <>
                  {moveTargets.map((target) => (
                    <BlogButton
                      key={target.key}
                      type="button"
                      className="ink-mg-menu-item"
                      onClick={() => moveNoteToSection(noteId, target.key)}
                    >
                      {target.label}
                    </BlogButton>
                  ))}
                  <BlogButton
                    type="button"
                    className="ink-mg-menu-item"
                    onClick={() => moveNoteToSection(noteId, null)}
                  >
                    未分章节
                  </BlogButton>
                  {!moveTargets.length && (
                    <span className="ink-ar-submenu-empty">还没有其它章节</span>
                  )}
                </>
              ),
            },
            {
              key: "remove",
              label: "从专题移除",
              icon: "tabler:trash",
              danger: true,
              onClick: () => removeNoteFromTopic(noteId),
            },
            {
              key: "up",
              label: "上移",
              icon: "tabler:arrow-up",
              disabled: !canMoveUp,
              onClick: () => shiftNote(sectionKey, index, -1),
            },
            {
              key: "down",
              label: "下移",
              icon: "tabler:arrow-down",
              disabled: !canMoveDown,
              onClick: () => shiftNote(sectionKey, index, 1),
            },
          ]}
        />
      </div>
    );
  };

  const renderSectionBlock = (section: DraftSection, index: number) => {
    const isCollapsed = !!collapsed[section.key];
    const isSelected = selectedKey === section.key;
    return (
      <div
        key={section.key}
        className="ink-ar-section"
        data-active={isSelected ? "true" : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => onDropSection(e, section.key)}
      >
        <div className="ink-ar-section-head">
          <span
            className="ink-ar-grip"
            draggable
            aria-hidden="true"
            onDragStart={(e) =>
              onDragStart(e, { kind: "section", key: section.key })
            }
            onDragEnd={() => {
              dragRef.current = null;
            }}
          >
            <Icon icon="tabler:grip-vertical" width={15} />
          </span>
          <BlogButton
            type="button"
            className="ink-ar-collapse"
            aria-label={isCollapsed ? "展开章节" : "折叠章节"}
            aria-expanded={!isCollapsed}
            onClick={() =>
              setCollapsed((c) => ({ ...c, [section.key]: !c[section.key] }))
            }
          >
            <Icon
              icon={
                isCollapsed ? "tabler:chevron-right" : "tabler:chevron-down"
              }
              width={15}
            />
          </BlogButton>
          <BlogButton
            type="button"
            className="ink-ar-section-name"
            onClick={() => setSelectedKey(section.key)}
          >
            {section.name || "未命名章节"}
          </BlogButton>
          <span className="ink-ar-count">{section.noteIds.length} 篇文章</span>
          <ArrangeMenu
            label={`章节操作：${section.name || "未命名章节"}`}
            items={[
              {
                key: "rename",
                label: "重命名",
                icon: "tabler:edit",
                onClick: () => {
                  setSelectedKey(section.key);
                  setTimeout(() => {
                    nameInput.current?.focus();
                    nameInput.current?.select();
                  }, 0);
                },
              },
              {
                key: "delete",
                label: "删除章节",
                icon: "tabler:trash",
                danger: true,
                onClick: () => removeSection(section),
              },
              {
                key: "up",
                label: "上移",
                icon: "tabler:arrow-up",
                disabled: index === 0,
                onClick: () => shiftSection(section, -1),
              },
              {
                key: "down",
                label: "下移",
                icon: "tabler:arrow-down",
                disabled: index === (draft?.sections.length ?? 0) - 1,
                onClick: () => shiftSection(section, 1),
              },
            ]}
          />
        </div>
        {!isCollapsed && (
          <div className="ink-ar-articles">
            {section.noteIds.length ? (
              section.noteIds.map((noteId, noteIndex) =>
                renderArticle(noteId, section.key, noteIndex),
              )
            ) : (
              <p className="ink-ar-empty">
                这一章还没有文章，从「添加文章」放进来。
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading && !draft) {
    return (
      <div
        className={"ink-blog ink-manage" + (embedded ? " ink-ar-embedded" : "")}
        data-theme={theme}
      >
        <div className="ink-ar-page">
          <p className="ink-mg-empty" role="status">
            正在加载专题编排…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={"ink-blog ink-manage" + (embedded ? " ink-ar-embedded" : "")}
      data-theme={theme}
    >
      <div className="ink-ar-page">
        {!embedded && (
          <header className="ink-ar-head">
            <nav className="ink-ar-crumb" aria-label="面包屑">
              <BlogButton
                type="button"
                className="ink-ar-crumb-link"
                onClick={() => navigate("/blog-manage")}
              >
                博客管理
              </BlogButton>
              <span className="ink-ar-crumb-sep">/</span>
              <BlogButton
                type="button"
                className="ink-ar-crumb-link"
                onClick={() => navigate(`/blog-manage/topic/${topicId}`)}
              >
                专题
              </BlogButton>
              <span className="ink-ar-crumb-sep">/</span>
              <span className="ink-ar-crumb-current">
                {topic?.name ?? "专题"}
              </span>
            </nav>

            <div className="ink-ar-title-row">
              <div className="ink-ar-title-group">
                <h1 className="ink-ar-title">章节编排</h1>
                <span className="ink-ar-badge">
                  {articleCount} 篇文章 · {draft?.sections.length ?? 0} 个章节
                </span>
                {dirty && (
                  <span className="ink-ar-badge ink-ar-badge-warn">
                    有未保存修改
                  </span>
                )}
                <p className="ink-ar-title-sub">
                  给「{topic?.name ?? "当前专题"}
                  」分章节、排文章顺序；保存后立即更新公开专题页目录。
                </p>
              </div>
              <div className="ink-ar-actions">
                {topics.length > 1 && topics.some((t) => t.id === topicId) && (
                  <BlogSelect
                    className="ink-mg-field ink-ar-topic-switch"
                    value={topicId}
                    aria-label="切换要编排的专题"
                    onChange={async (e) => {
                      const next = Number(e.target.value);
                      if (!Number.isInteger(next) || next === topicId) return;
                      if (
                        dirty &&
                        !await confirmBlogAction(
                          "当前专题有未保存的编排改动，切换专题会丢失。确定切换？",
                        )
                      ) {
                        e.currentTarget.value = String(topicId);
                        return;
                      }
                      navigate(`/blog-manage/topic/${next}/arrange`);
                    }}
                  >
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </BlogSelect>
                )}
                {topic?.slug && (
                  <a
                    className="ink-mg-button"
                    href={`/blog/t/${topic.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    查看专题页 <Icon icon="tabler:external-link" width={15} />
                  </a>
                )}
                <BlogButton
                  type="button"
                  className="ink-mg-button ink-mg-button-primary"
                  disabled={!dirty || busy}
                  onClick={() => void save()}
                >
                  {busy ? "保存中…" : "保存编排"}
                </BlogButton>
              </div>
            </div>
          </header>
        )}

        {error && (
          <div className="ink-mg-alert ink-ar-alert">
            <span>{error}</span>
            <BlogButton
              type="button"
              className="ink-mg-button"
              onClick={() => void load()}
            >
              重试加载
            </BlogButton>
          </div>
        )}

        <div className="ink-ar-layout">
          <section className="ink-ar-main">
            <div className="ink-ar-topic-head">
              <div className="ink-ar-topic-text">
                <h2 className="ink-ar-topic-name">
                  {topic?.name ?? "未找到专题"}
                </h2>
                <p className="ink-ar-topic-desc">
                  {topic?.desc?.trim() || "（这个专题还没有简介）"}
                </p>
              </div>
              <div className="ink-ar-toolbar">
                <BlogButton
                  type="button"
                  className="ink-mg-button"
                  onClick={addSection}
                >
                  <Icon icon="tabler:plus" width={15} />
                  新建章节
                </BlogButton>
                <BlogButton
                  type="button"
                  className="ink-mg-button"
                  onClick={() => setPickerOpen((v) => !v)}
                >
                  <Icon icon="tabler:list" width={15} />
                  添加文章
                </BlogButton>
              </div>
            </div>

            {pickerOpen && (
              <div className="ink-ar-picker">
                <div className="ink-ar-picker-head">
                  <BlogInput
                    className="ink-mg-field"
                    placeholder="搜索已发布文章…"
                    aria-label="搜索已发布文章"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                  
              startContent={<Icon icon="tabler:search" width={15} />}
            />
                  <span className="ink-mg-sub">
                    加入到：
                    {selected ? selected.name || "未命名章节" : "未分章节"}
                  </span>
                </div>
                <div className="ink-ar-picker-list">
                  {pickerCandidates.length ? (
                    pickerCandidates.map((p) => (
                      <label key={p.id} className="ink-ar-picker-row">
                        <BlogCheckbox
                          type="checkbox"
                          checked={pickerPicked.includes(p.id)}
                          onChange={(e) =>
                            setPickerPicked((list) =>
                              e.target.checked
                                ? [...list, p.id]
                                : list.filter((id) => id !== p.id),
                            )
                          }
                        />
                        <span className="ink-ar-picker-title">
                          {postTitle(p)}
                        </span>
                      </label>
                    ))
                  ) : (
                    <p className="ink-mg-sub">没有可添加的已发布文章。</p>
                  )}
                </div>
                <div className="ink-ar-picker-foot">
                  <span className="ink-mg-sub">
                    已选 {pickerPicked.length} 篇
                  </span>
                  <div className="ink-ar-row-actions">
                    <BlogButton
                      type="button"
                      className="ink-mg-button"
                      onClick={() => {
                        setPickerOpen(false);
                        setPickerPicked([]);
                      }}
                    >
                      取消
                    </BlogButton>
                    <BlogButton
                      type="button"
                      className="ink-mg-button ink-mg-button-primary"
                      disabled={!pickerPicked.length}
                      onClick={addPicked}
                    >
                      添加所选文章
                    </BlogButton>
                  </div>
                </div>
              </div>
            )}

            {(draft?.sections ?? []).map((section, index) =>
              renderSectionBlock(section, index),
            )}

            <div
              className="ink-ar-section ink-ar-unassigned"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => onDropSection(e, null)}
            >
              <div className="ink-ar-section-head">
                <span className="ink-ar-section-name">未分章节</span>
                <span className="ink-ar-count">
                  {draft?.unassigned.length ?? 0} 篇文章
                </span>
              </div>
              <div className="ink-ar-articles">
                {draft?.unassigned.length ? (
                  draft.unassigned.map((noteId, index) =>
                    renderArticle(noteId, null, index),
                  )
                ) : (
                  <p className="ink-ar-empty">
                    没有待分配的文章，章节之外的文章会落在这里。
                  </p>
                )}
              </div>
            </div>

            <p className="ink-ar-hint">
              拖动章节调整阅读顺序；拖动文章可跨章移动。同一篇文章在不同专题中独立编排。
            </p>
          </section>

          <aside className="ink-ar-side">
            <section className="ink-mg-panel ink-ar-card">
              <div className="ink-ar-card-head">
                <h3 className="ink-mg-section-title">章节设置</h3>
                <span className="ink-ar-card-sub">
                  当前章节：
                  {selected ? selected.name || "未命名章节" : "未选中"}
                </span>
              </div>
              {!selected && (
                <p className="ink-mg-note">
                  先在左侧点一个章节，这里才会显示它的名称、简介与可见性。
                </p>
              )}
              {selected && (
                <>
                  <label className="ink-ar-field">
                    <span className="ink-mg-sub">章节名称</span>
                    <span className="ink-ar-input-wrap">
                      <BlogInput
                        ref={nameInput}
                        className="ink-mg-field ink-ar-input"
                        maxLength={NAME_LIMIT}
                        value={selected.name}
                        onChange={(e) =>
                          patchDraft((d) => ({
                            ...d,
                            sections: d.sections.map((s) =>
                              s.key === selected.key
                                ? { ...s, name: e.target.value }
                                : s,
                            ),
                          }))
                        }
                        placeholder="给这一章起个名字"
                      />
                      <span className="ink-ar-counter">
                        {selected.name.length}/{NAME_LIMIT}
                      </span>
                    </span>
                  </label>
                  <label className="ink-ar-field">
                    <span className="ink-mg-sub">章节简介</span>
                    <span className="ink-ar-input-wrap">
                      <BlogTextarea
                        className="ink-mg-field ink-ar-textarea"
                        maxLength={DESC_LIMIT}
                        value={selected.desc}
                        onChange={(e) =>
                          patchDraft((d) => ({
                            ...d,
                            sections: d.sections.map((s) =>
                              s.key === selected.key
                                ? { ...s, desc: e.target.value }
                                : s,
                            ),
                          }))
                        }
                        placeholder="一句话说明这一章讲什么"
                      />
                      <span className="ink-ar-counter">
                        {selected.desc.length}/{DESC_LIMIT}
                      </span>
                    </span>
                  </label>
                  <label className="ink-mg-toggle ink-ar-toggle">
                    <BlogCheckbox toggle
                      type="checkbox"
                      checked={selected.showTitle}
                      onChange={(e) =>
                        patchDraft((d) => ({
                          ...d,
                          sections: d.sections.map((s) =>
                            s.key === selected.key
                              ? { ...s, showTitle: e.target.checked }
                              : s,
                          ),
                        }))
                      }
                    />
                    <span className="ink-mg-toggle-track" />
                    <span className="ink-ar-toggle-text">
                      <b>展示章节标题</b>
                      <small>
                        在专题页目录中显示本章名称与其下的文章列表。
                      </small>
                    </span>
                  </label>
                  <div className="ink-ar-danger-zone">
                    <BlogButton
                      type="button"
                      className="ink-ar-danger"
                      onClick={() => removeSection(selected)}
                    >
                      移除章节
                    </BlogButton>
                    <p className="ink-ar-danger-hint">
                      文章移至未分章节，不删除文章。
                    </p>
                  </div>
                </>
              )}
            </section>
          </aside>
        </div>

        <footer className="ink-ar-footer">
          <div className="ink-ar-footer-inner">
            <span className="ink-ar-footer-note">
              <Icon icon="tabler:check" width={15} className="ink-ar-check" />
              保存后立即更新专题目录，不修改文章公开版本。
            </span>
            <div className="ink-ar-footer-actions">
              <BlogButton
                type="button"
                className="ink-mg-button"
                disabled={!dirty || busy}
                onClick={() => void cancel()}
              >
                取消更改
              </BlogButton>
              <BlogButton
                type="button"
                className="ink-mg-button ink-mg-button-primary"
                disabled={!dirty || busy}
                onClick={() => void save()}
              >
                {busy ? "保存中…" : "保存编排"}
              </BlogButton>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default BlogTopicArrange;
