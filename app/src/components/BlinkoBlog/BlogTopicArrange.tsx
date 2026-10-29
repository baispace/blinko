import { BlogSelect, BlogInput, BlogCheckbox, BlogTextarea } from "./BlogUI";
import { confirmBlogAction } from "./confirmBlogAction";
import { Button, Card, CardBody, CardHeader, Chip } from "@heroui/react";
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

const NAME_LIMIT = 60;
const DESC_LIMIT = 200;

function notifyError(error: unknown) {
  RootStore.Get(ToastPlugin).error(
    error instanceof Error ? error.message : "操作失败，请重试",
  );
}

type DraftSection = {
  key: string;
  id?: number;
  name: string;
  desc: string;
  showTitle: boolean;
  noteIds: number[];
};

type Draft = {
  sections: DraftSection[];
  unassigned: number[];
};

type DragPayload =
  | { kind: "section"; key: string }
  | { kind: "note"; noteId: number };

function serialize(draft: Draft) {
  return JSON.stringify([
    draft.sections.map((s) => [s.id ?? 0, s.name, s.desc, s.showTitle, s.noteIds]),
    draft.unassigned,
  ]);
}

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

function locate(draft: Draft, noteId: number) {
  for (const section of draft.sections) {
    const index = section.noteIds.indexOf(noteId);
    if (index >= 0) return { sectionKey: section.key, index };
  }
  const index = draft.unassigned.indexOf(noteId);
  if (index >= 0) return { sectionKey: null, index };
  return null;
}

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
  const index = targetIndex === null ? target.length : Math.max(0, Math.min(targetIndex, target.length));
  target.splice(index, 0, moved);
  return withList(working, targetSectionKey, target);
}

function appendNote(draft: Draft, noteId: number, sectionKey: string | null) {
  if (locate(draft, noteId)) return draft;
  if (sectionKey === null) return { ...draft, unassigned: [...draft.unassigned, noteId] };
  return {
    ...draft,
    sections: draft.sections.map((s) =>
      s.key === sectionKey ? { ...s, noteIds: [...s.noteIds, noteId] } : s,
    ),
  };
}

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
  const attachment = coverId ? post.attachments.find((a) => a.id === coverId) : undefined;
  if (!attachment) return "";
  return blogImageUrl(attachment.path);
}

type MenuItem = {
  key: string;
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  submenu?: ReactNode;
};

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
      if (menu.current?.contains(target) || trigger.current?.contains(target)) return;
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
      <Button
        ref={trigger}
        isIconOnly
        size="sm"
        variant="light"
        aria-label={label}
        aria-expanded={open}
        onPress={toggle}
      >
        <Icon icon="tabler:dots" width={16} />
      </Button>
      {open && (
        <div
          ref={menu}
          className="fixed z-50 min-w-[200px] overflow-hidden rounded-xl border border-default-200 bg-surface shadow-lg"
          data-flip={pos.flip}
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("[data-keep-open]")) return;
            setOpen(false);
          }}
        >
          {items.map((item) => (
            <div key={item.key}>
              <button
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  item.danger
                    ? "text-danger hover:bg-danger-50"
                    : "text-foreground hover:bg-default-100"
                } ${item.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
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
                    icon={expanded === item.key ? "tabler:chevron-down" : "tabler:chevron-right"}
                    width={14}
                    className="ml-auto"
                  />
                )}
              </button>
              {item.submenu && expanded === item.key && (
                <div className="border-t border-default-100 bg-default-50">
                  {item.submenu}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

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
      setSelectedKey((prev) => (prev && next.sections.some((s) => s.key === prev) ? prev : null));
      setError("");
      if (dropped > 0) RootStore.Get(ToastPlugin).error(`${dropped} 篇文章已不可用，已从编排中移除`);
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
      (p) => p.isPublished && !topicNoteIds.has(p.id) && (!keyword || postTitle(p).toLowerCase().includes(keyword)),
    );
  }, [posts, topicNoteIds, pickerQuery]);

  const addSection = () => {
    const key = `new${++seq.current}`;
    patchDraft((d) => ({
      ...d,
      sections: [...d.sections, { key, name: "新章节", desc: "", showTitle: true, noteIds: [] }],
    }));
    setSelectedKey(key);
    setCollapsed((c) => ({ ...c, [key]: false }));
    setTimeout(() => {
      nameInput.current?.focus();
      nameInput.current?.select();
    }, 0);
  };

  const removeSection = async (section: DraftSection) => {
    if (!await confirmBlogAction(`删除章节「${section.name || "未命名章节"}」后，章内 ${section.noteIds.length} 篇文章会移至未分章节，不删除文章。确定删除？`))
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

  const shiftNote = (sectionKey: string | null, index: number, delta: number) => {
    patchDraft((d) => {
      const list = [...listOf(d, sectionKey)];
      const target = index + delta;
      if (target < 0 || target >= list.length) return d;
      [list[index], list[target]] = [list[target], list[index]];
      return withList(d, sectionKey, list);
    });
  };

  const moveNoteToSection = (noteId: number, sectionKey: string | null, index: number | null = null) => {
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

  const onDragStart = (e: ReactDragEvent, payload: DragPayload) => {
    dragRef.current = payload;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", payload.kind === "section" ? payload.key : String(payload.noteId));
  };

  const onDropSection = (e: ReactDragEvent, targetKey: string | null) => {
    e.preventDefault();
    const payload = dragRef.current;
    dragRef.current = null;
    if (!payload) return;
    if (payload.kind === "section") {
      if (!targetKey || payload.key === targetKey) return;
      patchDraft((d) => moveSection(d, payload.key, targetKey));
      return;
    }
    patchDraft((d) => moveNote(d, payload.noteId, targetKey, null));
  };

  const onDropNote = (e: ReactDragEvent, sectionKey: string | null, index: number) => {
    const payload = dragRef.current;
    if (!payload || payload.kind !== "note") return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = null;
    patchDraft((d) => moveNote(d, payload.noteId, sectionKey, index));
  };

  const renderArticle = (noteId: number, sectionKey: string | null, index: number) => {
    const post = postMap.get(noteId);
    const published = !!post?.isPublished;
    const date = post?.publication?.createdAt ? formatDate(post.publication.createdAt) : "";
    const cover = post ? postCover(post) : "";
    const canMoveUp = index > 0;
    const canMoveDown = index < listOf(draft, sectionKey).length - 1;
    const moveTargets: { key: string; label: string }[] = (draft?.sections ?? [])
      .filter((s) => s.key !== sectionKey)
      .map((s) => ({ key: s.key, label: s.name || "未命名章节" }));

    return (
      <div
        key={noteId}
        className="group flex items-center gap-2 rounded-lg border border-default-200 bg-surface px-3 py-2 transition-colors hover:bg-default-50"
        draggable
        onDragStart={(e) => onDragStart(e, { kind: "note", noteId })}
        onDragEnd={() => { dragRef.current = null; }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={(e) => onDropNote(e, sectionKey, index)}
      >
        <span className="cursor-grab text-default-400 active:cursor-grabbing" aria-hidden="true">
          <Icon icon="tabler:grip-vertical" width={15} />
        </span>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-default-100">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon icon="tabler:photo" width={15} className="text-default-400" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {post ? postTitle(post) : `文章 #${noteId}`}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-default-500">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${published ? "bg-success" : "bg-default-300"}`} aria-hidden="true" />
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
                    <button
                      key={target.key}
                      type="button"
                      className="flex w-full items-center px-3 py-2 text-left text-sm text-foreground hover:bg-default-100"
                      onClick={() => moveNoteToSection(noteId, target.key)}
                    >
                      {target.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="flex w-full items-center px-3 py-2 text-left text-sm text-foreground hover:bg-default-100"
                    onClick={() => moveNoteToSection(noteId, null)}
                  >
                    未分章节
                  </button>
                  {!moveTargets.length && (
                    <span className="block px-3 py-2 text-xs text-default-400">还没有其它章节</span>
                  )}
                </>
              ),
            },
            { key: "remove", label: "从专题移除", icon: "tabler:trash", danger: true, onClick: () => removeNoteFromTopic(noteId) },
            { key: "up", label: "上移", icon: "tabler:arrow-up", disabled: !canMoveUp, onClick: () => shiftNote(sectionKey, index, -1) },
            { key: "down", label: "下移", icon: "tabler:arrow-down", disabled: !canMoveDown, onClick: () => shiftNote(sectionKey, index, 1) },
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
        className={`rounded-xl border p-4 transition-colors ${
          isSelected ? "border-primary bg-primary/5" : "border-default-200 bg-surface"
        }`}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={(e) => onDropSection(e, section.key)}
      >
        <div className="mb-3 flex items-center gap-2">
          <span
            className="cursor-grab text-default-400 active:cursor-grabbing"
            draggable
            aria-hidden="true"
            onDragStart={(e) => onDragStart(e, { kind: "section", key: section.key })}
            onDragEnd={() => { dragRef.current = null; }}
          >
            <Icon icon="tabler:grip-vertical" width={15} />
          </span>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label={isCollapsed ? "展开章节" : "折叠章节"}
            aria-expanded={!isCollapsed}
            onPress={() => setCollapsed((c) => ({ ...c, [section.key]: !c[section.key] }))}
          >
            <Icon icon={isCollapsed ? "tabler:chevron-right" : "tabler:chevron-down"} width={15} />
          </Button>
          <button
            type="button"
            className="flex-1 text-left text-sm font-medium text-foreground hover:text-primary"
            onClick={() => setSelectedKey(section.key)}
          >
            {section.name || "未命名章节"}
          </button>
          <span className="text-xs text-default-500">{section.noteIds.length} 篇文章</span>
          <ArrangeMenu
            label={`章节操作：${section.name || "未命名章节"}`}
            items={[
              {
                key: "rename",
                label: "重命名",
                icon: "tabler:edit",
                onClick: () => {
                  setSelectedKey(section.key);
                  setTimeout(() => { nameInput.current?.focus(); nameInput.current?.select(); }, 0);
                },
              },
              { key: "delete", label: "删除章节", icon: "tabler:trash", danger: true, onClick: () => removeSection(section) },
              { key: "up", label: "上移", icon: "tabler:arrow-up", disabled: index === 0, onClick: () => shiftSection(section, -1) },
              { key: "down", label: "下移", icon: "tabler:arrow-down", disabled: index === (draft?.sections.length ?? 0) - 1, onClick: () => shiftSection(section, 1) },
            ]}
          />
        </div>
        {!isCollapsed && (
          <div className="flex flex-col gap-2">
            {section.noteIds.length ? (
              section.noteIds.map((noteId, noteIndex) => renderArticle(noteId, section.key, noteIndex))
            ) : (
              <p className="py-4 text-center text-sm text-default-400">这一章还没有文章，从「添加文章」放进来。</p>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading && !draft) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-default-500" role="status">正在加载专题编排…</p>
      </div>
    );
  }

  return (
    <div className={embedded ? "" : "min-h-screen bg-background"}>
      <div className="mx-auto max-w-7xl px-4 py-6">
        {!embedded && (
          <header className="mb-6">
            <nav className="mb-3 flex items-center gap-2 text-sm" aria-label="面包屑">
              <button type="button" className="text-primary hover:underline" onClick={() => navigate("/blog-manage")}>
                博客管理
              </button>
              <span className="text-default-400">/</span>
              <button type="button" className="text-primary hover:underline" onClick={() => navigate(`/blog-manage/topic/${topicId}`)}>
                专题
              </button>
              <span className="text-default-400">/</span>
              <span className="text-foreground">{topic?.name ?? "专题"}</span>
            </nav>

            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold text-foreground">章节编排</h1>
                  <Chip size="sm" variant="flat">
                    {articleCount} 篇文章 · {draft?.sections.length ?? 0} 个章节
                  </Chip>
                  {dirty && (
                    <Chip size="sm" color="warning" variant="flat">
                      有未保存修改
                    </Chip>
                  )}
                </div>
                <p className="mt-1 text-sm text-default-500">
                  给「{topic?.name ?? "当前专题"}」分章节、排文章顺序；保存后立即更新公开专题页目录。
                </p>
              </div>
              <div className="flex items-center gap-2">
                {topics.length > 1 && topics.some((t) => t.id === topicId) && (
                  <BlogSelect
                    className="min-w-[140px]"
                    value={topicId}
                    aria-label="切换要编排的专题"
                    onChange={async (e) => {
                      const next = Number(e.target.value);
                      if (!Number.isInteger(next) || next === topicId) return;
                      if (dirty && !await confirmBlogAction("当前专题有未保存的编排改动，切换专题会丢失。确定切换？")) {
                        e.currentTarget.value = String(topicId);
                        return;
                      }
                      navigate(`/blog-manage/topic/${next}/arrange`);
                    }}
                  >
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </BlogSelect>
                )}
                {topic?.slug && (
                  <a
                    className="inline-flex items-center gap-1.5 rounded-lg border border-default-200 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-default-50"
                    href={`/blog/t/${topic.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    查看专题页 <Icon icon="tabler:external-link" width={15} />
                  </a>
                )}
                <Button color="primary" isDisabled={!dirty || busy} onPress={() => void save()}>
                  {busy ? "保存中…" : "保存编排"}
                </Button>
              </div>
            </div>
          </header>
        )}

        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-danger-50 px-4 py-3">
            <span className="text-sm text-danger">{error}</span>
            <Button size="sm" variant="flat" onPress={() => void load()}>重试加载</Button>
          </div>
        )}

        <div className="flex flex-col gap-6 lg:flex-row">
          <section className="min-w-0 flex-1">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{topic?.name ?? "未找到专题"}</h2>
                <p className="text-sm text-default-500">{topic?.desc?.trim() || "（这个专题还没有简介）"}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="flat" onPress={addSection} startContent={<Icon icon="tabler:plus" width={15} />}>
                  新建章节
                </Button>
                <Button size="sm" variant="flat" onPress={() => setPickerOpen((v) => !v)} startContent={<Icon icon="tabler:list" width={15} />}>
                  添加文章
                </Button>
              </div>
            </div>

            {pickerOpen && (
              <div className="mb-4 rounded-xl border border-default-200 bg-surface p-4">
                <div className="mb-3 flex items-center gap-3">
                  <BlogInput
                    className="flex-1"
                    placeholder="搜索已发布文章…"
                    aria-label="搜索已发布文章"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                  />
                  <span className="text-sm text-default-500">
                    加入到：{selected ? selected.name || "未命名章节" : "未分章节"}
                  </span>
                </div>
                <div className="mb-3 max-h-[300px] space-y-1 overflow-y-auto">
                  {pickerCandidates.length ? (
                    pickerCandidates.map((p) => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-default-50">
                        <BlogCheckbox
                          type="checkbox"
                          checked={pickerPicked.includes(p.id)}
                          onChange={(e) =>
                            setPickerPicked((list) =>
                              e.target.checked ? [...list, p.id] : list.filter((id) => id !== p.id),
                            )
                          }
                        />
                        <span className="text-sm text-foreground">{postTitle(p)}</span>
                      </label>
                    ))
                  ) : (
                    <p className="py-4 text-center text-sm text-default-400">没有可添加的已发布文章。</p>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-default-200 pt-3">
                  <span className="text-sm text-default-500">已选 {pickerPicked.length} 篇</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="light" onPress={() => { setPickerOpen(false); setPickerPicked([]); }}>
                      取消
                    </Button>
                    <Button size="sm" color="primary" isDisabled={!pickerPicked.length} onPress={addPicked}>
                      添加所选文章
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {(draft?.sections ?? []).map((section, index) => renderSectionBlock(section, index))}
            </div>

            <div
              className="mt-4 rounded-xl border border-dashed border-default-300 bg-default-50 p-4"
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
              onDrop={(e) => onDropSection(e, null)}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">未分章节</span>
                <span className="text-xs text-default-500">{draft?.unassigned.length ?? 0} 篇文章</span>
              </div>
              <div className="flex flex-col gap-2">
                {draft?.unassigned.length ? (
                  draft.unassigned.map((noteId, index) => renderArticle(noteId, null, index))
                ) : (
                  <p className="py-4 text-center text-sm text-default-400">
                    没有待分配的文章，章节之外的文章会落在这里。
                  </p>
                )}
              </div>
            </div>

            <p className="mt-4 text-xs text-default-500">
              拖动章节调整阅读顺序；拖动文章可跨章移动。同一篇文章在不同专题中独立编排。
            </p>
          </section>

          <aside className="w-full shrink-0 lg:w-80">
            <Card className="border border-default-200 bg-surface">
              <CardHeader className="flex flex-col items-start gap-1 px-4 pb-0 pt-3">
                <h3 className="text-sm font-semibold text-foreground">章节设置</h3>
                <span className="text-xs text-default-500">
                  当前章节：{selected ? selected.name || "未命名章节" : "未选中"}
                </span>
              </CardHeader>
              <CardBody className="gap-4 p-4">
                {!selected && (
                  <p className="text-sm text-default-500">
                    先在左侧点一个章节，这里才会显示它的名称、简介与可见性。
                  </p>
                )}
                {selected && (
                  <>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-default-500">章节名称</span>
                      <div className="relative">
                        <BlogInput
                          ref={nameInput}
                          className="w-full"
                          maxLength={NAME_LIMIT}
                          value={selected.name}
                          onChange={(e) =>
                            patchDraft((d) => ({
                              ...d,
                              sections: d.sections.map((s) =>
                                s.key === selected.key ? { ...s, name: e.target.value } : s,
                              ),
                            }))
                          }
                          placeholder="给这一章起个名字"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-default-400">
                          {selected.name.length}/{NAME_LIMIT}
                        </span>
                      </div>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-default-500">章节简介</span>
                      <div className="relative">
                        <BlogTextarea
                          className="w-full"
                          maxLength={DESC_LIMIT}
                          value={selected.desc}
                          onChange={(e) =>
                            patchDraft((d) => ({
                              ...d,
                              sections: d.sections.map((s) =>
                                s.key === selected.key ? { ...s, desc: e.target.value } : s,
                              ),
                            }))
                          }
                          placeholder="一句话说明这一章讲什么"
                        />
                        <span className="absolute bottom-2 right-2 text-xs text-default-400">
                          {selected.desc.length}/{DESC_LIMIT}
                        </span>
                      </div>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <BlogCheckbox
                        toggle
                        type="checkbox"
                        checked={selected.showTitle}
                        onChange={(e) =>
                          patchDraft((d) => ({
                            ...d,
                            sections: d.sections.map((s) =>
                              s.key === selected.key ? { ...s, showTitle: e.target.checked } : s,
                            ),
                          }))
                        }
                      />
                      <span>
                        <b className="block text-sm">展示章节标题</b>
                        <small className="text-xs text-default-500">
                          在专题页目录中显示本章名称与其下的文章列表。
                        </small>
                      </span>
                    </label>
                    <div className="rounded-lg border border-danger-200 bg-danger-50 p-3">
                      <Button
                        size="sm"
                        color="danger"
                        variant="flat"
                        onPress={() => removeSection(selected)}
                      >
                        移除章节
                      </Button>
                      <p className="mt-2 text-xs text-danger">文章移至未分章节，不删除文章。</p>
                    </div>
                  </>
                )}
              </CardBody>
            </Card>
          </aside>
        </div>

        <footer className="mt-6 flex items-center justify-between rounded-xl border border-default-200 bg-surface px-5 py-3">
          <span className="flex items-center gap-2 text-sm text-default-500">
            <Icon icon="tabler:check" width={15} className="text-success" />
            保存后立即更新专题目录，不修改文章公开版本。
          </span>
          <div className="flex gap-2">
            <Button variant="flat" isDisabled={!dirty || busy} onPress={() => void cancel()}>
              取消更改
            </Button>
            <Button color="primary" isDisabled={!dirty || busy} onPress={() => void save()}>
              {busy ? "保存中…" : "保存编排"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default BlogTopicArrange;
