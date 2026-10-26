import { BlogCheckbox, BlogInput, BlogTextarea, BlogButton, BlogChip, BlogTabs } from "./BlogUI";
import { Slider } from "@heroui/react";
import { confirmBlogAction } from "./confirmBlogAction";
import { markBlogManager } from "@/lib/blogDevice";
import { BlogSiteSettingsPanel } from "./BlogSiteSettingsPanel";
import { ContentSeoPanel } from "./ContentSeoPanel";
import "./blog.css";
import "./manage.css";
import "./studio.css";
import { BlogStudioNav } from "./BlogStudioNav";
import { BlogContentList } from "./BlogContentList";
import { RowMenu } from "./RowMenu";
import {
  STUDIO_SECTION_KEYS,
  STUDIO_SECTION_META,
  type StudioSection,
} from "./studioNav";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/trpc";
import axios from "@/lib/axios";
import { getBlinkoEndpoint } from "@/lib/blinkoEndpoint";
import { getAvatarUrl } from "@/lib/profileIdentity";
import { UserStore } from "@/store/user";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { DialogStore } from "@/store/module/Dialog";
import NoteHistoryModal from "../BlinkoNoteHistory/NoteHistoryModal";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlogStatsPanel } from "./BlogStatsPanel";
import { BlogFriendsPanel } from "./BlogFriendsPanel";
import { BlogMailSettingsPanel } from "./BlogMailSettingsPanel";
import { BlogAboutConfig } from "./BlogAboutConfig";
import { BlogFeedbackPanel } from "./BlogFeedbackPanel";

type Post = Awaited<ReturnType<typeof api.blog.published.query>>[number];
type Topic = Awaited<ReturnType<typeof api.blog.topics.query>>[number];
type Profile = Awaited<ReturnType<typeof api.blog.profile.query>>;
type Distribution = Awaited<ReturnType<typeof api.blog.distribution.query>>;
type Section = StudioSection;

/** 公开站的主题也存这个键，管理页跟公开站保持同一套明暗。 */
const THEME_KEY = "ink-blog-theme";
function readTheme(): "light" | "dark" {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function notify(error: unknown) {
  RootStore.Get(ToastPlugin).error(
    error instanceof Error ? error.message : "操作失败，请重试",
  );
}
function imageUrl(path: string) {
  const endpoint = getBlinkoEndpoint("/"),
    token = RootStore.Get(UserStore).token || "";
  const result = getAvatarUrl(path, token, endpoint);
  try {
    const url = new URL(result),
      base = new URL(endpoint);
    if (
      url.origin === base.origin &&
      url.pathname.startsWith("/api/s3file/") &&
      token
    )
      url.searchParams.set("token", token);
    return url.toString();
  } catch {
    return "";
  }
}
function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    if (dirty) addEventListener("beforeunload", guard);
    return () => removeEventListener("beforeunload", guard);
  }, [dirty]);
}

/** 专题树：按 parentId 分组，父在前、子按原顺序。 */
function topicChildren(topics: Topic[], parentId: number | null) {
  return topics.filter((t) => (t.parentId ?? null) === parentId);
}

const DISTRIBUTION_LABELS: Record<
  Distribution["mode"],
  { title: string; desc: string }
> = {  recency: {
    title: "按发布时间",
    desc: "越新越靠前，适合刚起步、还没有阅读数据的站点。",
  },
  clicks: {
    title: "按点击数",
    desc: "被点得多的排前面，冷启动阶段容易被少数几篇锁死。",
  },
  ctr: {
    title: "按曝光点击率",
    desc: "曝光多但点得少的不占位，更能筛出真正合口味的内容。",
  },
  blended: {
    title: "综合排序",
    desc: "新品分、热度分、质量分、主题亲和与搜索命中的加权和。",
  },
};

function ProfileEditor({
  profile,
  posts,
  topics,
  reload,
  onDirty,
}: {
  profile: Profile;
  posts: Post[];
  topics: Topic[];
  reload: () => Promise<void>;
  onDirty: (dirty: boolean) => void;
}) {
  const base = useMemo(
    () => ({
      displayName: profile.displayName,
      tagline: profile.tagline,
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      homepage: profile.homepage,
      links: profile.links ?? [],
      isPublished: profile.isPublished,
      // 关于页的三项配置：站点说明、签名、精选与展示专题。
      spaceIntro: profile.spaceIntro ?? "",
      signature: profile.signature ?? "",
      featuredPosts: (profile.featuredPosts ?? []).map((f) => ({
        noteId: f.noteId,
        reason: f.reason ?? "",
      })),
      aboutTopicIds: profile.aboutTopicIds ?? [],
    }),
    [profile],
  );
  const [draft, setDraft] = useState(base);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bio, setBio] = useState(false);
  const [hovered, setHovered] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  useLeaveGuard(dirty);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => setDraft(base), [base]);
  const patch = (p: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...p }));
  const upload = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (
      !/^image\/(png|jpeg|webp|gif|avif)$/.test(f.type) ||
      f.size > 10 * 1024 * 1024
    ) {
      setError("头像请选择 10MB 以内的常见图片格式");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await axios.post(getBlinkoEndpoint("/api/file/upload"), form);
      if (!res.data.filePath) throw new Error("上传失败");
      patch({ avatarUrl: res.data.filePath });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api.blog.saveProfile.mutate({
        ...draft,
        // 没挑完的槽位不下发 —— 空槽留着只会让公开页多出一行空白。
        featuredPosts: draft.featuredPosts
          .filter((f) => Number.isInteger(f.noteId) && f.noteId > 0)
          .map((f) => ({ noteId: f.noteId as number, reason: f.reason })),
      });
      await reload();
      RootStore.Get(ToastPlugin).success("公开资料已保存");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ink-mg-grid-2" style={{ alignItems: "start" }}>
      <div className="ink-mg-section">
        {error && <div className="ink-mg-alert">{error}</div>}
        <div className="ink-mg-panel">
          <div className="ink-mg-section-head">
            <h2 className="ink-mg-section-title">作者与公开资料</h2>
            {dirty && <BlogChip color="warning" variant="flat">有未保存修改</BlogChip>}
          </div>
          <p className="ink-mg-sub" style={{ marginTop: 8 }}>
            与登录账号资料独立。只有明确开启公开并保存的内容才对外展示。
          </p>
          <label className="ink-mg-switch" style={{ marginTop: 12 }}>
            <BlogCheckbox aria-label="公开作者资料（保存后生效）"
              type="checkbox"
              checked={draft.isPublished}
              onChange={(e) => patch({ isPublished: e.target.checked })}
            />
            公开作者资料（保存后生效）
          </label>
        </div>
        <div className="ink-mg-panel ink-mg-section" style={{ gap: 14 }}>
          <div className="ink-mg-grid-2">
            <label className="ink-mg-section" style={{ gap: 6 }}>
              <span className="ink-mg-sub">公开名称</span>
              <BlogInput
                className="ink-mg-field"
                maxLength={80}
                placeholder="你的公开名称"
                value={draft.displayName}
                onChange={(e) => patch({ displayName: e.target.value })}
              />
            </label>
            <label className="ink-mg-section" style={{ gap: 6 }}>
              <span className="ink-mg-sub">一句话介绍</span>
              <BlogInput
                className="ink-mg-field"
                maxLength={160}
                value={draft.tagline}
                onChange={(e) => patch({ tagline: e.target.value })}
              />
            </label>
          </div>
          <label className="ink-mg-section" style={{ gap: 6 }}>
            <span className="ink-mg-sub">个人介绍</span>
            <BlogTextarea
              className="ink-mg-field"
              rows={6}
              maxLength={5000}
              value={draft.bio}
              onChange={(e) => patch({ bio: e.target.value })}
            />
          </label>
          <label className="ink-mg-section" style={{ gap: 6 }}>
            <span className="ink-mg-sub">头像地址</span>
            <BlogInput
              className="ink-mg-field"
              value={draft.avatarUrl}
              onChange={(e) => patch({ avatarUrl: e.target.value })}
              placeholder="公开图片网址，或上传图片"
            />
          </label>
          <input
            ref={file}
            type="file"
            className="hidden"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            aria-label="上传公开头像"
            onChange={(e) => void upload(e.target.files)}
          />
          <BlogButton
            className="ink-mg-button"
            disabled={busy}
            onClick={() => file.current?.click()}
            style={{ alignSelf: "flex-start" }}
          >
            上传头像
          </BlogButton>
          <label className="ink-mg-section" style={{ gap: 6 }}>
            <span className="ink-mg-sub">个人主页</span>
            <BlogInput
              className="ink-mg-field"
              value={draft.homepage}
              onChange={(e) => patch({ homepage: e.target.value })}
              placeholder="https://example.com"
            />
          </label>
        </div>
        <div className="ink-mg-panel">
          <div className="ink-mg-section-head">
            <h3 className="ink-mg-section-title">其他站点与相关链接</h3>
            <BlogButton
              className="ink-mg-button"
              disabled={draft.links.length >= 12}
              onClick={() =>
                patch({ links: [...draft.links, { label: "", url: "" }] })
              }
            >
              ＋ 添加
            </BlogButton>
          </div>
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {draft.links.map((link, i) => (
              <div key={i} style={{ display: "flex", gap: 8 }}>
                <BlogInput
                  className="ink-mg-field"
                  style={{ width: 120, flex: "none" }}
                  aria-label={`链接${i + 1}名称`}
                  placeholder="名称"
                  value={link.label}
                  onChange={(e) =>
                    patch({
                      links: draft.links.map((l, j) =>
                        j === i ? { ...l, label: e.target.value } : l,
                      ),
                    })
                  }
                />
                <BlogInput
                  className="ink-mg-field"
                  style={{ minWidth: 0 }}
                  aria-label={`链接${i + 1}地址`}
                  placeholder="https://"
                  value={link.url}
                  onChange={(e) =>
                    patch({
                      links: draft.links.map((l, j) =>
                        j === i ? { ...l, url: e.target.value } : l,
                      ),
                    })
                  }
                />
                <BlogButton
                  className="ink-mg-mini"
                  aria-label={`移除链接${i + 1}`}
                  onClick={() =>
                    patch({ links: draft.links.filter((_, j) => j !== i) })
                  }
                >
                  ×
                </BlogButton>
              </div>
            ))}
          </div>
        </div>
        {/* 关于页的可配置项：紧跟在公开资料后面，不另开管理分区。 */}
        <BlogAboutConfig
          draft={draft}
          patch={patch}
          posts={posts}
          topics={topics}
        />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <BlogButton
            className="ink-mg-button-primary ink-mg-button"
            disabled={busy || !dirty}
            onClick={() => void save()}
          >
            {busy ? "保存中…" : "保存公开资料"}
          </BlogButton>
        </div>
      </div>
      <aside>
        <p className="ink-mg-sub" style={{ marginBottom: 8 }}>
          待保存效果预览 · 悬浮或点击查看介绍
        </p>
        <div
          className="flex min-h-80 flex-col rounded-2xl p-6 text-white"
          style={{ background: "var(--ink-accent)" }}
          onMouseEnter={() => {
            if (matchMedia("(hover: hover)").matches) setHovered(true);
          }}
          onMouseLeave={() => setHovered(false)}
        >
          <span className="self-center rounded-full bg-white/15 px-3 py-1 text-xs">
            保持好奇，持续记录
          </span>
          <BlogButton
            className="my-6 flex min-h-36 flex-1 items-center justify-center text-left"
            aria-label="切换作者介绍预览"
            onClick={() => setBio((v) => !v)}
          >
            {bio || hovered ? (
              <p className="max-h-44 overflow-auto whitespace-pre-wrap text-sm leading-6">
                {draft.bio || "填写个人介绍后，将在这里展示。"}
              </p>
            ) : draft.avatarUrl ? (
              <img
                src={imageUrl(draft.avatarUrl)}
                alt="待保存头像"
                className="size-28 rounded-full border-4 border-white object-cover"
              />
            ) : (
              <Icon icon="tabler:user-circle" width={112} />
            )}
          </BlogButton>
          <strong className="text-xl">{draft.displayName || "作者名称"}</strong>
          <p className="mt-1 text-xs text-white/70">
            {draft.tagline || "一句话介绍"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {draft.links.map((l, i) => (
              <span
                key={i}
                className="rounded-full bg-white/15 px-2 py-1 text-xs"
              >
                {l.label || "站点链接"}
              </span>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function DistributionEditor({
  value,
  reload,
}: {
  value: Distribution;
  reload: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setDraft(value), [value]);
  const patch = (p: Partial<Distribution>) => setDraft((d) => ({ ...d, ...p }));
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api.blog.saveDistribution.mutate({
        mode: draft.mode,
        freshWeight: draft.freshWeight,
        hotWeight: draft.hotWeight,
        qualityWeight: draft.qualityWeight,
        affinityWeight: draft.affinityWeight,
        searchWeight: draft.searchWeight,
        freshHalfLife: draft.freshHalfLife,
        hotHalfLife: draft.hotHalfLife,
        featuredFirst: draft.featuredFirst,
      });
      await reload();
      RootStore.Get(ToastPlugin).success("分发策略已保存");
    } catch (e: any) {
      setError(e.message || "保存失败，请重试");
    } finally {
      setBusy(false);
    }
  };
  const weights: [keyof Distribution, string, string][] = [
    ["freshWeight", "新品分", "越新的文章分越高"],
    ["hotWeight", "热度分", "近期点击与阅读的累积热度"],
    ["qualityWeight", "质量分", "封面、标题、摘要、正文长度与专题归属"],
    ["affinityWeight", "主题亲和", "与读者刚看过的主题的相关度"],
    ["searchWeight", "搜索命中", "与站内搜索词的相关度"],
  ];
  return (
    <div className="ink-mg-section">
      <div className="ink-mg-section-head">
        <div>
          <h2 className="ink-mg-section-title">流量分发口径</h2>
          <p className="ink-mg-sub" style={{ marginTop: 6 }}>
            决定公开站「推荐」列表怎么排。「最新」始终按发布时间，不受这里影响。
          </p>
        </div>
      </div>
      {error && <div className="ink-mg-alert">{error}</div>}
      <div className="ink-mg-modes" role="group" aria-label="分发口径">
        {(Object.keys(DISTRIBUTION_LABELS) as Distribution["mode"][]).map(
          (mode) => (
            <BlogButton
              key={mode}
              type="button"
              className="ink-mg-mode"
              aria-pressed={draft.mode === mode}
              onClick={() => patch({ mode })}
            >
              <b>{DISTRIBUTION_LABELS[mode].title}</b>
              <small>{DISTRIBUTION_LABELS[mode].desc}</small>
            </BlogButton>
          ),
        )}
      </div>

      {draft.mode === "blended" ? (
        <div className="ink-mg-panel">
          <h3 className="ink-mg-section-title">综合排序权重</h3>
          <div className="ink-mg-weights">
            {weights.map(([key, label, desc]) => (
              <div key={key} className="ink-mg-weight">
                <span>
                  {label}
                  <small
                    style={{
                      display: "block",
                      fontSize: 11,
                      color: "var(--ink-muted)",
                    }}
                  >
                    {desc}
                  </small>
                </span>
                <Slider
                  aria-label={`${label}权重`}
                  size="sm"
                  minValue={0}
                  maxValue={20}
                  step={1}
                  value={draft[key] as number}
                  onChange={(value) =>
                    patch({
                      [key]: Number(Array.isArray(value) ? value[0] : value),
                    } as Partial<Distribution>)
                  }
                  className="ink-mg-slider"
                />
                <output>{draft[key] as number}</output>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="ink-mg-note">
          当前口径是单一因子，权重不参与计算。切到「综合排序」可以逐项调权重。
        </p>
      )}

      <div className="ink-mg-panel ink-mg-section" style={{ gap: 12 }}>
        <h3 className="ink-mg-section-title">时间衰减</h3>
        <div className="ink-mg-grid-2">
          <label className="ink-mg-section" style={{ gap: 6 }}>
            <span className="ink-mg-sub">新品分半衰期（天）</span>
            <BlogInput
              className="ink-mg-field"
              type="number"
              min={0.5}
              max={365}
              step={0.5}
              value={draft.freshHalfLife}
              onChange={(e) =>
                patch({ freshHalfLife: Number(e.target.value) })
              }
            />
          </label>
          <label className="ink-mg-section" style={{ gap: 6 }}>
            <span className="ink-mg-sub">热度分半衰期（天）</span>
            <BlogInput
              className="ink-mg-field"
              type="number"
              min={0.5}
              max={365}
              step={0.5}
              value={draft.hotHalfLife}
              onChange={(e) =>
                patch({ hotHalfLife: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <p className="ink-mg-sub">
          半衰期越短，旧文章掉得越快。默认新品 14 天、热度 60 天。
        </p>
        <label className="ink-mg-switch">
          <BlogCheckbox aria-label="手动精选的文章强制排在推荐列表最前"
            type="checkbox"
            checked={draft.featuredFirst}
            onChange={(e) => patch({ featuredFirst: e.target.checked })}
          />
          手动精选的文章强制排在推荐列表最前
        </label>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <BlogButton
          className="ink-mg-button-primary ink-mg-button"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "保存中…" : "保存分发策略"}
        </BlogButton>
      </div>
    </div>
  );
}

export function BlogManagePage() {
  useEffect(() => { markBlogManager(); }, []);
  const [seoTab,setSeoTab]=useState("content");
  const [section, setSection] = useState<Section>("posts");
  const [posts, setPosts] = useState<Post[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [distribution, setDistribution] = useState<Distribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /** 封面资源分区自己的搜索：跟内容列表的筛选各走各的，不互相干扰。 */
  const [coverKeyword, setCoverKeyword] = useState("");
  const [dirty, setDirty] = useState(false);
  const [theme, setTheme] = useState(readTheme);
  /**
   * 侧边栏折叠状态记在本地：桌面端折叠过一次，
   * 下次进后台应该还是同一条图标轨，而不是每次重新折叠。
   */
  const [sideCollapsed, setSideCollapsed] = useState(() => {
    try {
      return localStorage.getItem("ink-blog-studio-collapsed") === "1";
    } catch {
      return false;
    }
  });
  /** 窄屏下侧边栏变抽屉，这个状态控制抽屉开合。 */
  const [sideOpen, setSideOpen] = useState(false);
  /** 960px 以下算窄屏：同一套骨架在窄屏走抽屉，宽屏走折叠。 */
  const [narrow, setNarrow] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 960px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 960px)");
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const requestId = useRef(0);
  const pageRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // 深链：/blog-manage?section=topics 直接落到专题分区。
  const deepSection = params.get("section");
  useEffect(() => {
    if (!deepSection) return;
    if (!STUDIO_SECTION_KEYS.includes(deepSection as Section)) return;
    setSection(deepSection as Section);
  }, [deepSection]);
  const load = useCallback(async () => {
    const seq = ++requestId.current;
    try {
      const [p, t, pr, d] = await Promise.all([
        api.blog.published.query(),
        api.blog.topics.query(),
        api.blog.profile.query(),
        api.blog.distribution.query(),
      ]);
      if (seq !== requestId.current) return;
      setPosts(p);
      setTopics(t);
      setProfile(pr);
      setDistribution(d);
      setError("");
    } catch (e: any) {
      if (seq === requestId.current) setError(e.message || "加载失败");
      throw e;
    } finally {
      if (seq === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load().catch(() => {});
    return () => {
      requestId.current++;
    };
  }, [load]);
  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* 隐私模式下写不进去也不影响使用 */
    }
  }, [theme]);
  const reload = async () => {
    try {
      await load();
    } catch {
      throw new Error("操作可能已保存，但刷新失败，请重试刷新。");
    }
  };
  /**
   * 封面资源分区里点某张封面：跳到那篇文章的工作台，
   * 快捷操作面板在右侧，换封面、预览都在那里。
   */
  const openArticle = (post: Post) => navigate(`/blog-manage/content/${post.id}`);

  /**
   * 封面资源分区要显示的是"公开封面" ——
   * 草稿箱里的笔记还没有公开版本，没有封面可看，这里直接跳过。
   */
  const coverRows = useMemo(() => {
    const keyword = coverKeyword.trim().toLowerCase();
    return posts.filter(
      (post) =>
        post.publication &&
        (!keyword || post.title.toLowerCase().includes(keyword)),
    );
  }, [posts, coverKeyword]);
  const change = async (key: Section) => {
    if (dirty && !await confirmBlogAction("公开资料有未保存修改，确定切换？")) return;
    setDirty(false);
    setSection(key);
  };
  /** 汉堡按钮：宽屏折叠侧边栏，窄屏拉出抽屉。 */
  const toggleSide = () => {
    if (narrow) {
      setSideOpen((v) => !v);
      return;
    }
    setSideCollapsed((v) => {
      try {
        localStorage.setItem("ink-blog-studio-collapsed", v ? "0" : "1");
      } catch {
        /* 隐私模式下写不进去也不影响使用 */
      }
      return !v;
    });
  };
  /** 侧边栏选分区：抽屉模式下选完顺手关掉抽屉。 */
  const selectSection = (key: Section) => {
    change(key);
    if (narrow) setSideOpen(false);
  };
  const backToNotes = async () => {
    if (!dirty || await confirmBlogAction("有未保存修改，确定返回？"))
      navigate("/?path=notes");
  };
  /** 同一父级下的相邻专题互换顺序。 */
  const moveTopic = async (id: number, delta: number) => {
    const current = topics.find((t) => t.id === id);
    if (!current) return;
    const siblings = topics.filter(
      (t) => (t.parentId ?? null) === (current.parentId ?? null),
    );
    const pos = siblings.findIndex((t) => t.id === id);
    const target = siblings[pos + delta];
    if (!target) return;
    const next = [...topics];
    const a = next.findIndex((t) => t.id === id);
    const b = next.findIndex((t) => t.id === target.id);
    [next[a], next[b]] = [next[b], next[a]];
    try {
      await api.blog.reorderTopics.mutate({
        orderedIds: next.map((t) => t.id),
      });
      await reload();
    } catch (e) {
      notify(e);
    }
  };
  /** 专题树里的一行：拖拽手柄、封面、名称简介、文章数、公开状态、操作。 */
  const renderTopicNode = (topic: Topic, depth: number): JSX.Element => {
    const children = topicChildren(topics, topic.id);
    const siblings = topics.filter(
      (t) => (t.parentId ?? null) === (topic.parentId ?? null),
    );
    const pos = siblings.findIndex((t) => t.id === topic.id);
    const cover = topic.cover;
    return (
      <div key={topic.id}>

        <div
          className="ink-mg-topic-row"
          style={{ paddingLeft: 16 + depth * 20 }}
          draggable
          onDragStart={(e) =>
            e.dataTransfer.setData("text/plain", String(topic.id))
          }
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const fromId = Number(e.dataTransfer.getData("text/plain"));
            if (!Number.isInteger(fromId) || fromId === topic.id) return;
            const next = [...topics];
            const from = next.findIndex((t) => t.id === fromId);
            const to = next.findIndex((t) => t.id === topic.id);
            if (from < 0 || to < 0) return;
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            void api.blog.reorderTopics
              .mutate({ orderedIds: next.map((t) => t.id) })
              .then(() => reload())
              .catch(notify);
          }}
          onClick={() => navigate(`/blog-manage/topic/${topic.id}`)}
        >
          <Icon
            icon="tabler:grip-vertical"
            width={15}
            style={{ color: "var(--ink-muted)", flex: "none" }}
          />
          <span
            className="ink-mg-topic-thumb"
            style={cover ? undefined : { background: topic.color || "#7051ff" }}
          >
            {cover ? (
              <img src={imageUrl(cover.path)} alt="" />
            ) : (
              topic.name.slice(0, 1)
            )}
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span className="ink-mg-topic-name" style={{ display: "block" }}>
              <BlogButton
                type="button"
                className="ink-mg-topic-link"
                title={`编辑「${topic.name}」的设置`}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/blog-manage/topic/${topic.id}`);
                }}
              >
                {topic.name}
              </BlogButton>
            </span>
            <span className="ink-mg-topic-desc">
              {topic.desc || "暂无简介"}
            </span>
          </span>
          <span className="ink-mg-topic-count">{topic.noteIds.length} 篇</span>
          <BlogChip color={topic.isPublished ? "success" : "default"} variant="flat">
            {topic.isPublished ? "公开" : "未公开"}
          </BlogChip>
          <span onClick={(e) => e.stopPropagation()}>
            <RowMenu label={`${topic.name} 更多操作`}>
              <BlogButton
                className="ink-mg-menu-item"
                onClick={() => navigate(`/blog-manage/topic/${topic.id}`)}
              >
                <Icon icon="tabler:edit" width={15} />
                编辑专题
              </BlogButton>
              <BlogButton
                className="ink-mg-menu-item"
                onClick={() =>
                  navigate(`/blog-manage/topic/${topic.id}#chapters`)
                }
              >
                <Icon icon="tabler:layout-list" width={15} />
                编排章节
              </BlogButton>
              <BlogButton
                className="ink-mg-menu-item"
                disabled={pos === 0}
                onClick={() => void moveTopic(topic.id, -1)}
              >
                <Icon icon="tabler:arrow-up" width={15} />
                上移
              </BlogButton>
              <BlogButton
                className="ink-mg-menu-item"
                disabled={pos === siblings.length - 1}
                onClick={() => void moveTopic(topic.id, 1)}
              >
                <Icon icon="tabler:arrow-down" width={15} />
                下移
              </BlogButton>
              <BlogButton
                className="ink-mg-menu-item"
                data-danger="true"
                onClick={async () => {
                  if (
                    !await confirmBlogAction("删除专题只解除关联，不会删除文章。确定删除？")
                  )
                    return;
                  try {
                    await api.blog.deleteTopic.mutate({ id: topic.id });
                    await reload();
                  } catch (e) {
                    notify(e);
                  }
                }}
              >
                <Icon icon="tabler:trash" width={15} />
                删除专题
              </BlogButton>
            </RowMenu>
          </span>
        </div>
        {children.map((child) => renderTopicNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="ink-blog ink-manage" data-theme={theme} ref={pageRef}>
      <div
        className="ink-studio"
        data-collapsed={sideCollapsed ? "1" : undefined}
        data-drawer={sideOpen ? "open" : "closed"}
      >
        <header className="ink-studio-top">
          <BlogButton
            className="ink-studio-icon-btn"
            onClick={toggleSide}
            aria-label={narrow ? "打开导航菜单" : sideCollapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-expanded={narrow ? sideOpen : !sideCollapsed}
          >
            <Icon icon="tabler:menu-2" width={18} />
          </BlogButton>
          <span className="ink-mg-brand">
            Ink
            <small>博客管理</small>
          </span>
          {/*
            这里刻意不放搜索框。
            内容管理页里已经有搜索框，和状态、专题、排序排在一起。
            顶栏再来一个就变成两处搜索：用户在顶栏打字，列表上的筛选却
            纹丝不动，反而更迷糊。搜索就放在内容列表里。
          */}
          <span style={{ flex: 1 }} />
          <a
            className="ink-studio-icon-btn"
            href="/blog"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="查看公开站"
            title="查看公开站"
          >
            <Icon icon="tabler:external-link" width={18} />
          </a>
          <BlogButton
            className="ink-studio-icon-btn"
            onClick={() =>
              setTheme((v) => (v === "light" ? "dark" : "light"))
            }
            aria-label="切换明暗主题"
            title="切换明暗主题"
          >
            <Icon icon={theme === "light" ? "tabler:moon" : "tabler:sun"} width={18} />
          </BlogButton>
        </header>

        <BlogStudioNav
          section={section}
          onSelect={selectSection}
          collapsed={sideCollapsed}
          siteName={profile?.displayName || "Ink 博客"}
          avatarSrc={profile?.avatarUrl ? imageUrl(profile.avatarUrl) : ""}
          postCount={posts.length}
          topicCount={topics.length}
          onBack={backToNotes}
        />

        {sideOpen && (
          <div className="ink-studio-scrim" onClick={() => setSideOpen(false)} />
        )}

        <main className="ink-studio-main">
          <div className="ink-studio-page">
            <header className="ink-studio-head">
              <h1 className="ink-studio-title">
                {STUDIO_SECTION_META[section].title}
              </h1>
              <p className="ink-studio-desc">
                {STUDIO_SECTION_META[section].desc}
              </p>
            </header>
          {error && (
            <div className="ink-mg-alert" style={{ marginBottom: 16 }}>
              <span>{error}</span>
              <BlogButton
                className="ink-mg-button"
                onClick={() => void load().catch(() => {})}
              >
                重试加载
              </BlogButton>
            </div>
          )}
          {loading ? (
            <p className="ink-mg-empty" role="status">
              正在加载博客管理…
            </p>
          ) : (
            <>
              {section === "posts" && (
                <BlogContentList
                  posts={posts}
                  topics={topics}
                  onReload={reload}
                />
              )}

              {section === "covers" && (
                <div className="ink-mg-section">
                  <div className="ink-mg-toolbar">
                    <BlogInput
                      className="ink-mg-field"
                      aria-label="搜索封面所属文章"
                      placeholder="搜索封面所属文章…"
                      value={coverKeyword}
                      onChange={(e) => setCoverKeyword(e.target.value)}
                    
              startContent={<Icon icon="tabler:search" width={15} />}
            />
                    <span className="ink-mg-sub">
                      共 {coverRows.length} 张公开封面
                    </span>
                  </div>
                  {coverRows.length ? (
                    <div className="ink-mg-scene-grid">
                      {coverRows.map((p) => {
                        const image = p.attachments.find(
                          (a) => a.id === p.publication?.coverAttachmentId,
                        );
                        return (
                          <BlogButton
                            key={p.id}
                            type="button"
                            className="ink-mg-scene"
                            onClick={() => openArticle(p)}
                          >
                            <span className="ink-mg-scene-shot" data-ratio="banner">
                              {image ? (
                                <img
                                  src={imageUrl(image.path)}
                                  alt="公开封面"
                                />
                              ) : (
                                <Icon icon="tabler:photo" width={26} />
                              )}
                            </span>
                            <span className="ink-mg-scene-name">{p.title}</span>
                            <span className="ink-mg-scene-size">
                              {image ? "已有公开封面" : "尚未设置封面"}
                            </span>
                          </BlogButton>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="ink-mg-empty">
                      <Icon icon="tabler:photo" width={28} />
                      <h2>没有匹配的封面</h2>
                      <p>换个关键词，或先在内容管理里给文章设置封面。</p>
                    </div>
                  )}
                </div>
              )}

              {section === "topics" && (
                <div className="ink-mg-section">
                  <div className="ink-mg-section-head">
                      <div>
                        <h2 className="ink-mg-section-title">全部专题</h2>
                        <p className="ink-mg-sub">
                          {topics.length} 个专题 · 共{" "}
                          {topics.reduce((sum, t) => sum + t.noteIds.length, 0)} 篇文章
                        </p>
                      </div>
                      <div className="ink-mg-row-actions" style={{ marginLeft: 0 }}>
                        <BlogButton
                          className="ink-mg-button-primary ink-mg-button"
                          onClick={() => navigate("/blog-manage/topic/new")}
                        >
                          ＋ 新建专题
                        </BlogButton>
                      </div>
                    </div>
                  {topics.length ? (
                    <div className="ink-mg-topic-list">
                      {topicChildren(topics, null).map((t) =>
                        renderTopicNode(t, 0),
                      )}
                    </div>
                  ) : (
                    <div className="ink-mg-empty">
                      <h2>还没有专题</h2>
                      <p>先创建一个并添加已发布文章。</p>
                    </div>
                  )}
                </div>
              )}

              {section === "distribution" && distribution && (
                <DistributionEditor value={distribution} reload={reload} />
              )}

              {section === "friends" && <BlogFriendsPanel />}
              {section === "feedback" && <BlogFeedbackPanel />}
              {section === "mail" && <BlogMailSettingsPanel onDirty={setDirty} />}

              {section === "settings" && <BlogSiteSettingsPanel onDirty={setDirty} />}
              {section === "seo" && (
                <>
                  <BlogTabs
                    label="SEO 分区"
                    value={seoTab}
                    onChange={async (id) => {
                      if (
                        !dirty ||
                        (await confirmBlogAction("有未保存修改，确定切换？"))
                      ) {
                        setDirty(false);
                        setSeoTab(id);
                      }
                    }}
                    items={[
                      { key: "content", label: "内容 SEO" },
                      { key: "defaults", label: "站点默认规则" },
                    ]}
                  />
                  {seoTab === "defaults" ? (
                    <BlogSiteSettingsPanel seo onDirty={setDirty} />
                  ) : (
                    <ContentSeoPanel
                      onDirty={setDirty}
                      onReview={async (id) =>
                        navigate(`/blog-manage/content/${id}`)
                      }
                    />
                  )}
                </>
              )}
              {section === "profile" && profile && (
                <ProfileEditor
                  profile={profile}
                  posts={posts}
                  topics={topics}
                  reload={reload}
                  onDirty={setDirty}
                />
              )}

              {section === "stats" && <BlogStatsPanel />}
            </>
          )}
          </div>
        </main>
      </div>
    </div>
  );
}
