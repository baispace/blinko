import { BlogMomentsPanel } from "./BlogMomentsPanel";
import { BlogRecommendationReport } from "./BlogRecommendationReport";
import { managerBlogVisitUrl } from "@shared/lib/blogManagerVisit";
import { BlogToggle, BlogDisclosure, BlogInput, BlogTextarea, BlogButton, BlogChip, BlogTabs } from "./BlogUI";
import "./blog-management.css";
import { Drawer, DrawerContent, Slider, Button, Chip, Card, CardBody, CardHeader, Divider } from "@heroui/react";
import { confirmBlogAction } from "./confirmBlogAction";
import { markBlogManager } from "@/lib/blogDevice";
import { BlogSiteSettingsPanel } from "./BlogSiteSettingsPanel";
import { BlogContentList } from "./BlogContentList";
import { RowMenu } from "./RowMenu";
import {
  STUDIO_SECTION_KEYS,
  STUDIO_SECTION_META,
  type StudioSection,
} from "./studioNav";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/trpc";
import { AuthorCardView } from "./public/AuthorCard";

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
import { BlogStudioNav } from "./BlogStudioNav";

type Post = Awaited<ReturnType<typeof api.blog.published.query>>[number];
type Topic = Awaited<ReturnType<typeof api.blog.topics.query>>[number];
type Profile = Awaited<ReturnType<typeof api.blog.profile.query>>;
type Distribution = Awaited<ReturnType<typeof api.blog.distribution.query>>;
type Section = StudioSection;

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

function topicChildren(topics: Topic[], parentId: number | null) {
  return topics.filter((t) => (t.parentId ?? null) === parentId);
}

const DISTRIBUTION_LABELS: Record<
  Distribution["mode"],
  { title: string; desc: string }
> = {
  recency: {
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
      bio: profile.bio,
      avatarUrl: profile.avatarUrl,
      homepage: profile.homepage,
      links: profile.links ?? [],
      isPublished: profile.isPublished,
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
  const [savedDraft, setSavedDraft] = useState(base);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  /*
   * 站点标语不在这个面板里 —— 它在「站点设置 → 站点信息 → 站点标语」，
   * 是全站唯一的一句话出处。预览要显示前台真正会显示的那句，所以读已保存的值。
   */
  const [siteTagline, setSiteTagline] = useState("");
  useEffect(() => {
    void api.blog.siteSettings
      .query()
      .then((r) => setSiteTagline(r.data.tagline ?? ""))
      .catch(() => setSiteTagline(""));
  }, []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  useLeaveGuard(dirty || busy);
  useEffect(() => { onDirty(dirty || busy); return () => onDirty(false); }, [dirty, busy, onDirty]);
  useEffect(() => { setDraft(base); setSavedDraft(base); }, [base]);
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
        featuredPosts: draft.featuredPosts
          .filter((f) => Number.isInteger(f.noteId) && f.noteId > 0)
          .map((f) => ({ noteId: f.noteId as number, reason: f.reason })),
      });
      setSavedDraft(draft);
      RootStore.Get(ToastPlugin).success("公开资料已保存");
      try { await reload(); } catch {
        setError("公开资料已保存，但刷新失败。请重新打开此页面获取最新资料，无需重复保存。");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset disabled={busy} className="m-0 grid min-w-0 grid-cols-1 gap-4 border-0 p-0 lg:grid-cols-[1fr_320px] items-start">
      <div className="flex flex-col gap-3 p-4">
        {error && (
          <div className="rounded-lg bg-danger-50 border border-danger-200 px-4 py-3 text-sm text-danger-700">
            {error}
          </div>
        )}
        <Card>
          <CardHeader className="flex items-center justify-between pb-2">
            <h2 className="text-xl font-semibold">作者与公开资料</h2>
            {dirty && <Chip color="warning" variant="flat">有未保存修改</Chip>}
          </CardHeader>
          <CardBody className="pt-0">
            <p className="text-sm text-default-500">
              与登录账号资料独立。只有明确开启公开并保存的内容才对外展示。
            </p>
            <div className="mt-3">
              <BlogToggle
                label="公开作者资料（保存后生效）"
                checked={draft.isPublished}
                onChange={(v) => patch({ isPublished: v })}
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col gap-3 p-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-default-500">作者署名</span>
              <BlogInput
                maxLength={80}
                placeholder="你的公开名称"
                value={draft.displayName}
                onChange={(e) => patch({ displayName: e.target.value })}
              />
              <small className="text-xs text-default-500">
                显示在关于页、文章末尾和动态页。
                站点自己的品牌名与一句话标语在「站点设置 → 站点信息」里填 ——
                标语只有那一个出处，这里不再重复维护。
              </small>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-default-500">个人介绍</span>
              <BlogTextarea
                rows={6}
                maxLength={5000}
                value={draft.bio}
                onChange={(e) => patch({ bio: e.target.value })}
              />
            </label>
            <BlogDisclosure title="使用图片链接作为头像">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm text-default-500">头像地址</span>
                <BlogInput
                  value={draft.avatarUrl}
                  onChange={(e) => patch({ avatarUrl: e.target.value })}
                  placeholder="公开图片网址，或上传图片"
                />
              </label>
            </BlogDisclosure>
            <input
              ref={file}
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              aria-label="上传公开头像"
              onChange={(e) => void upload(e.target.files)}
            />
            <Button
              variant="flat"
              size="sm"
              isDisabled={busy}
              onPress={() => file.current?.click()}
              className="self-start"
            >
              上传头像
            </Button>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-default-500">个人主页</span>
              <BlogInput
                value={draft.homepage}
                onChange={(e) => patch({ homepage: e.target.value })}
                placeholder="https://example.com"
              />
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between pb-2">
            <h3 className="text-lg font-semibold">其他站点与相关链接</h3>
            <Button
              variant="flat"
              size="sm"
              isDisabled={draft.links.length >= 12}
              onPress={() =>
                patch({ links: [...draft.links, { label: "", url: "" }] })
              }
            >
              ＋ 添加
            </Button>
          </CardHeader>
          <CardBody className="pt-0">
            <div className="flex flex-col gap-2">
              {draft.links.map((link, i) => (
                <div key={i} className="flex gap-2">
                  <BlogInput
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
                  <Button
                    variant="light"
                    size="sm"
                    isIconOnly
                    aria-label={`移除链接${i + 1}`}
                    onPress={() =>
                      patch({ links: draft.links.filter((_, j) => j !== i) })
                    }
                  >
                    <Icon icon="tabler:x" width={16} />
                  </Button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <BlogAboutConfig
          draft={draft}
          patch={patch}
          posts={posts}
          topics={topics}
        />

        <div className="flex justify-end">
          <Button
            color="primary"
            isDisabled={busy || !dirty}
            isLoading={busy}
            onPress={() => void save()}
          >
            {busy ? "保存中…" : "保存公开资料"}
          </Button>
        </div>
      </div>

      <aside>
        <p className="text-sm text-default-500 mb-2">
          前台效果预览 · 点头像展开介绍
        </p>
        {/*
          预览用的就是前台那张卡（同一个组件、同一份样式），
          不再另画一个「像那么回事」的版本 —— 否则后台看着对、线上不是那个样子。
          站点标语不在这个面板里，显示的是站点设置里已保存的值；
          署名没填时回退到站点品牌名 —— 前台也是这个回退值（服务端给的）。
        */}
        <AuthorCardView
          profile={{
            displayName: draft.displayName.trim() || profile.siteBrandName,
            bio: draft.bio,
            avatarUrl: draft.avatarUrl,
            homepage: draft.homepage,
            links: draft.links,
          }}
          tagline={siteTagline}
        />
      </aside>
    </fieldset>
  );
}

function DistributionEditor({
  value,
  reload,
  onDirty,
}: {
  value: Distribution;
  reload: () => Promise<void>;
  onDirty: (dirty:boolean) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [saved,setSaved] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {setDraft(value);setSaved(value);}, [value]);
  const dirty=JSON.stringify(draft)!==JSON.stringify(saved);
  useLeaveGuard(dirty||busy);
  useEffect(()=>{onDirty(dirty||busy);return()=>onDirty(false);},[dirty,busy,onDirty]);
  const patch = (p: Partial<Distribution>) => { if (!busy) setDraft((d) => ({ ...d, ...p })); };
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
      setSaved(draft);
      RootStore.Get(ToastPlugin).success("分发策略已保存");
      try {await reload();} catch {setError("分发策略已保存，但刷新失败。请重新载入页面核对。");}
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
    <div className="flex flex-col gap-4">
      <BlogRecommendationReport version={JSON.stringify(saved)} disableNavigation={dirty||busy} />
      <div>
        <h2 className="text-xl font-semibold">流量分发口径</h2>
        {/*
          页头已经说过「推荐分发 / 决定公开站里文章的排序规则」，
          这里只补一句页头没有的信息。
        */}
        <p className="text-sm text-default-500 mt-1.5">
          「最新」始终按发布时间，不受这里影响。
        </p>
      </div>
      {error && (
        <div className="rounded-lg bg-danger-50 border border-danger-200 px-4 py-3 text-sm text-danger-700">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="group" aria-label="分发口径">
        {(Object.keys(DISTRIBUTION_LABELS) as Distribution["mode"][]).map(
          (mode) => (
            <button
              key={mode}
              type="button"
              className={`flex flex-col items-start text-left p-4 rounded-xl border transition-colors
                ${draft.mode === mode
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-default-200 bg-content1 hover:bg-default-50"
                }
              `}
              aria-pressed={draft.mode === mode}
              onClick={() => patch({ mode })}
            >
              <b className="text-sm font-semibold">{DISTRIBUTION_LABELS[mode].title}</b>
              <small className="text-xs text-default-500 mt-1">{DISTRIBUTION_LABELS[mode].desc}</small>
            </button>
          ),
        )}
      </div>

      {draft.mode === "blended" ? (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">综合排序权重</h3>
          </CardHeader>
          <CardBody>
            <div className="flex flex-col gap-4">
              {weights.map(([key, label, desc]) => (
                <div key={key} className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{label}</span>
                    <small className="block text-xs text-default-500">{desc}</small>
                  </div>
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
                    className="w-48"
                  />
                  <output className="text-sm font-medium w-8 text-right">{draft[key] as number}</output>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : (
        <p className="text-sm text-default-500">
          当前口径是单一因子，权重不参与计算。切到「综合排序」可以逐项调权重。
        </p>
      )}

      <Card>
        <CardBody className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold">时间衰减</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-default-500">新品分半衰期（天）</span>
              <BlogInput
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
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-default-500">热度分半衰期（天）</span>
              <BlogInput
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
          <p className="text-sm text-default-500">
            半衰期越短，旧文章掉得越快。默认新品 14 天、热度 60 天。
          </p>
          <BlogToggle
            label="手动精选的文章强制排在推荐列表最前"
            checked={draft.featuredFirst}
            onChange={(v) => patch({ featuredFirst: v })}
          />
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <Button
          color="primary"
          isDisabled={busy || !dirty}
          isLoading={busy}
          onPress={() => void save()}
        >
          {busy ? "保存中…" : "保存分发策略"}
        </Button>
      </div>
    </div>
  );
}

export function BlogManagePage() {
  useEffect(() => { markBlogManager(); }, []);
  const [section, setSection] = useState<Section>(() => {
    try { const last = sessionStorage.getItem("blog-management-section"); return STUDIO_SECTION_KEYS.includes(last as Section) ? last as Section : "posts"; } catch { return "posts"; }
  });
  const [posts, setPosts] = useState<Post[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [distribution, setDistribution] = useState<Distribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [coverKeyword, setCoverKeyword] = useState("");
  const [publicUrl, setPublicUrl] = useState("/blog");
  const [work, setWork] = useState<Awaited<ReturnType<typeof api.blog.workQueue.query>> | null>(null);
  const [workError, setWorkError] = useState(false);
  useEffect(() => {
    let active = true, pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try { const next = await api.blog.workQueue.query(); if (active) {setWork(next);setWorkError(false);} }
      catch { if(active) setWorkError(true); }
      finally {pending=false;}
    };
    void refresh();
    const timer = window.setInterval(refresh,60000);
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",refresh);
    window.addEventListener("jomio:blog-work-updated",refresh);
    return () => {active=false;clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);window.removeEventListener("jomio:blog-work-updated",refresh);};
  }, [section]);

  useEffect(() => {
    let active = true;
    void api.blog.siteSettings.query().then(({deployment}) => {
      if (active && deployment?.targetOrigin) setPublicUrl(deployment.targetOrigin + (deployment.publicBasePath === "/" ? "/" : deployment.publicBasePath));
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const [dirty, setDirty] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
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
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
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
  const reload = async () => {
    try {
      await load();
    } catch {
      throw new Error("操作可能已保存，但刷新失败，请重试刷新。");
    }
  };
  const openArticle = (post: Post) => navigate(`/blog-manage/content/${post.id}`);

  const coverRows = useMemo(() => {
    const keyword = coverKeyword.trim().toLowerCase();
    return posts.filter(
      (post) =>
        post.publication &&
        (!keyword || post.title.toLowerCase().includes(keyword)),
    );
  }, [posts, coverKeyword]);
  const change = async (key: Section, queue?: string) => {
    if (dirty && !await confirmBlogAction("有未保存修改，确定切换？")) return;
    setDirty(false);
    setSection(key);
    setParams(previous => { const next = new URLSearchParams(previous); next.set("section", key); if(queue) next.set("queue",queue); else next.delete("queue"); return next; }, {replace:true});
    try { sessionStorage.setItem("blog-management-section", key); } catch {}
    setSideOpen(false);
  };
  const selectSection = (key: Section) => { void change(key); };
  const backToWorkspace = async () => {
    if (dirty && !await confirmBlogAction("有未保存修改，确定返回？")) return;
    const from = (location.state as {from?: string} | null)?.from;
    let saved = "";
    try { saved = sessionStorage.getItem("blog-management-return") || ""; } catch {}
    const target = from || saved;
    navigate(target.startsWith("/") && !target.startsWith("//") && !target.startsWith("/blog-manage") ? target : "/");
  };
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
          className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-default-50 cursor-pointer group"
          style={{ paddingLeft: 12 + depth * 20 }}
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
            className="text-default-400 shrink-0 cursor-grab"
          />
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs text-white font-medium shrink-0 overflow-hidden"
            style={cover ? undefined : { background: topic.color || "hsl(var(--heroui-primary))" }}
          >
            {cover ? (
              <img src={imageUrl(cover.path)} alt="" className="w-full h-full object-cover" />
            ) : (
              topic.name.slice(0, 1)
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block">
              <button
                type="button"
                className="text-sm font-medium text-foreground hover:text-primary bg-transparent border-0 p-0 cursor-pointer text-left truncate block"
                title={`编辑「${topic.name}」的设置`}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/blog-manage/topic/${topic.id}`);
                }}
              >
                {topic.name}
              </button>
            </span>
            <span className="text-xs text-default-500 truncate block">
              {topic.desc || "暂无简介"}
            </span>
          </span>
          <span className="text-xs text-default-500 shrink-0">{topic.noteIds.length} 篇</span>
          <Chip size="sm" color={topic.isPublished ? "success" : "default"} variant="flat">
            {topic.isPublished ? "公开" : "未公开"}
          </Chip>
          <span onClick={(e) => e.stopPropagation()}>
            <RowMenu label={`${topic.name} 更多操作`}>
              <Button
                variant="light"
                className="justify-start w-full text-sm"
                onPress={() => navigate(`/blog-manage/topic/${topic.id}`)}
              >
                <Icon icon="tabler:edit" width={15} />
                编辑专题
              </Button>
              <Button
                variant="light"
                className="justify-start w-full text-sm"
                onPress={() =>
                  navigate(`/blog-manage/topic/${topic.id}#chapters`)
                }
              >
                <Icon icon="tabler:layout-list" width={15} />
                编排章节
              </Button>
              <Button
                variant="light"
                className="justify-start w-full text-sm"
                isDisabled={pos === 0}
                onPress={() => void moveTopic(topic.id, -1)}
              >
                <Icon icon="tabler:arrow-up" width={15} />
                上移
              </Button>
              <Button
                variant="light"
                className="justify-start w-full text-sm"
                isDisabled={pos === siblings.length - 1}
                onPress={() => void moveTopic(topic.id, 1)}
              >
                <Icon icon="tabler:arrow-down" width={15} />
                下移
              </Button>
              <Button
                variant="light"
                className="justify-start w-full text-sm text-danger"
                onPress={async () => {
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
              </Button>
            </RowMenu>
          </span>
        </div>
        {children.map((child) => renderTopicNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="blog-hero-surface blog-management">
      <header className="blog-management-header">
        <Button variant="light" size="sm" onPress={backToWorkspace} startContent={<Icon icon="tabler:arrow-left" width={17}/>}>返回工作区</Button>
        <span className="blog-management-title">博客管理</span>
        <a href={managerBlogVisitUrl(publicUrl)} target="_blank" rel="noopener noreferrer" className="blog-management-public">查看公开站 <Icon icon="tabler:external-link" width={16}/></a>
      </header>
      <div className="blog-management-body">
      {!narrow && <BlogStudioNav section={section} onSelect={selectSection} postCount={posts.length} topicCount={topics.length} work={work}/>}
      <Drawer isOpen={narrow && sideOpen} onOpenChange={setSideOpen} placement="left" size="xs">
        <DrawerContent aria-label="博客管理导航"><BlogStudioNav section={section} onSelect={selectSection} postCount={posts.length} topicCount={topics.length} work={work}/></DrawerContent>
      </Drawer>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {narrow && <div className="blog-management-mobile"><Button size="sm" variant="flat" onPress={()=>setSideOpen(true)} startContent={<Icon icon="tabler:menu-2" width={16}/>} aria-label="打开博客管理导航">{STUDIO_SECTION_META[section].title}</Button></div>}
        {/* Page content */}
        <main className="blog-management-main">
          <div className="blog-management-content">
            <header className="mb-4">
              <h1 className="text-2xl font-semibold tracking-tight">
                {STUDIO_SECTION_META[section].title}
              </h1>
              <p className="text-sm text-default-500 mt-1">
                {STUDIO_SECTION_META[section].desc}
              </p>
            </header>

            {workError && <p className="mb-4 text-xs text-warning" role="status">待处理数量暂未更新，可进入读者反馈或友链管理查看。</p>}
            {work && (work.feedback + work.friends + work.feedbackMail + work.friendMail > 0) && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-default-200 bg-content1 p-3" aria-label="博客待处理事项">
              <span className="mr-1 text-sm font-medium">待处理</span>
              {work.feedback>0 && <Button size="sm" variant="flat" onPress={()=>selectSection("feedback")}>读者反馈 {work.feedback}</Button>}
              {work.friends>0 && <Button size="sm" variant="flat" onPress={()=>selectSection("friends")}>友链申请与报告 {work.friends}</Button>}
              {work.feedbackMail>0 && <Button size="sm" color="warning" variant="flat" onPress={()=>void change("feedback","failed")}>回复通知异常 {work.feedbackMail}</Button>}
              {work.friendMail>0 && <Button size="sm" color="warning" variant="flat" onPress={()=>void change("friends","failed")}>友链通知异常 {work.friendMail}</Button>}
              {(work.feedbackMail+work.friendMail)>0 && <Button size="sm" variant="light" onPress={()=>selectSection("mail")}>检查邮件服务</Button>}
            </div>}
            {error && (
              <div className="flex items-center gap-3 rounded-lg bg-danger-50 border border-danger-200 px-4 py-3 mb-4">
                <span className="text-sm text-danger-700">{error}</span>
                <Button
                  variant="flat"
                  size="sm"
                  color="danger"
                  onPress={() => void load().catch(() => {})}
                >
                  重试加载
                </Button>
              </div>
            )}

            {loading ? (
              <p className="text-sm text-default-500 py-12 text-center" role="status">
                正在加载博客管理…
              </p>
            ) : (
              <>
                {section === "moments" && <BlogMomentsPanel />}
                {section === "posts" && (
                  <BlogContentList
                    posts={posts}
                    topics={topics}
                    onReload={reload}
                  />
                )}

                {section === "covers" && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <BlogInput
                        aria-label="搜索封面所属文章"
                        placeholder="搜索封面所属文章…"
                        value={coverKeyword}
                        onChange={(e) => setCoverKeyword(e.target.value)}
                        startContent={<Icon icon="tabler:search" width={15} />}
                        className="max-w-xs"
                      />
                      <span className="text-sm text-default-500">
                        共 {coverRows.length} 张公开封面
                      </span>
                    </div>
                    {coverRows.length ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {coverRows.map((p) => {
                          const image = p.attachments.find(
                            (a) => a.id === p.publication?.coverAttachmentId,
                          );
                          return (
                            <button
                              key={p.id}
                              type="button"
                              className="flex flex-col rounded-xl border border-default-200 bg-content1 overflow-hidden hover:border-primary transition-colors text-left"
                              onClick={() => openArticle(p)}
                            >
                              <span className="w-full aspect-[2.8/1] bg-default-100 flex items-center justify-center overflow-hidden">
                                {image ? (
                                  <img
                                    src={imageUrl(image.path)}
                                    alt="公开封面"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Icon icon="tabler:photo" width={26} className="text-default-400" />
                                )}
                              </span>
                              <span className="px-3 pt-2 text-sm font-medium truncate">{p.title}</span>
                              <span className="px-3 pb-3 pt-1 text-xs text-default-500">
                                {image ? "已有公开封面" : "尚未设置封面"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-default-400">
                        <Icon icon="tabler:photo" width={28} />
                        <h2 className="text-base font-medium mt-3 text-default-600">没有匹配的封面</h2>
                        <p className="text-sm mt-1">换个关键词，或先在内容管理里给文章设置封面。</p>
                      </div>
                    )}
                  </div>
                )}

                {section === "topics" && (
                  <div className="flex flex-col gap-4">
                    {/*
                      页头已经写了「专题」，这里不再重复一遍标题 ——
                      只留计数与新建按钮。
                    */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-default-500">
                        {topics.length} 个专题 · 共{" "}
                        {topics.reduce((sum, t) => sum + t.noteIds.length, 0)} 篇文章
                      </span>
                      <Button
                        color="primary"
                        onPress={() => navigate("/blog-manage/topic/new")}
                      >
                        新建专题
                      </Button>
                    </div>
                    {topics.length ? (
                      <div className="flex flex-col">
                        {topicChildren(topics, null).map((t) =>
                          renderTopicNode(t, 0),
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-default-400">
                        <h2 className="text-base font-medium text-default-600">还没有专题</h2>
                        <p className="text-sm mt-1">先创建一个并添加已发布文章。</p>
                      </div>
                    )}
                  </div>
                )}

                {section === "distribution" && distribution && (
                  <DistributionEditor value={distribution} reload={reload} onDirty={setDirty} />
                )}

                {section === "friends" && <BlogFriendsPanel queue={params.get("queue")} />}
                {section === "feedback" && <BlogFeedbackPanel queue={params.get("queue")} onDirty={setDirty} />}
                {section === "mail" && <BlogMailSettingsPanel onDirty={setDirty} />}
                {section === "settings" && <BlogSiteSettingsPanel onDirty={setDirty} />}
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
    </div>
  );
}
