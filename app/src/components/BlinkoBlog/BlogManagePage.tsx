import { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { Icon } from '@/components/Common/Iconify/icons';
import { getAvatarUrl } from '@/lib/profileIdentity';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';

type Published = Awaited<ReturnType<typeof api.blog.published.query>>[number];
type Topic = Awaited<ReturnType<typeof api.blog.topics.query>>[number];
type Profile = Awaited<ReturnType<typeof api.blog.profile.query>>;
type Section = 'posts' | 'profile' | 'topics';

const SECTIONS: { key: Section; label: string; hint: string }[] = [
  { key: 'posts', label: '已发布文章', hint: '公开版本、封面与所属专题' },
  { key: 'profile', label: '公开资料', hint: '对外展示的作者信息' },
  { key: 'topics', label: '专题', hint: '博客的公开栏目' },
];

const card = 'rounded-xl border border-default-200 bg-background p-4';
const btnBase = 'rounded-lg px-3 py-1.5 text-sm transition-colors disabled:opacity-50 focus-visible:outline-primary';
const btnGhost = `${btnBase} text-default-600 hover:bg-default-100`;
const btnPrimary = `${btnBase} bg-primary text-primary-foreground hover:opacity-90`;
const btnDanger = `${btnBase} text-danger hover:bg-danger/10`;
const field =
  'w-full rounded-lg border border-default-200 bg-content1 px-3 py-2 text-sm outline-none focus-visible:border-primary';
const label = 'mb-1.5 block text-xs font-medium text-default-600';

// 正文是编辑器 HTML，首行常是「## 小标题」这类残留，读起来不是标题。
// 优先用笔记自己的标题字段，实在没有再从正文里扒一行。
const publishedTitle = (item: { content: string; metadata?: unknown }) => {
  const meta = item.metadata as { title?: string } | null | undefined;
  const title = String(meta?.title ?? '').replace(/<[^>]*>/g, '').trim();
  if (title) return title.slice(0, 40);
  const text = item.content.replace(/<[^>]*>/g, '').replace(/^#{1,6}\s*/, '').trim();
  return (text.split('\n').find(l => l.trim()) || '无标题').slice(0, 40);
};

function CoverPicker({ item, onDone }: { item: Published; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const images = item.attachments.filter(a => /^image\//.test(a.type));
  const current = images.find(a => a.id === item.publication?.coverAttachmentId);

  const pick = async (attachmentId: number | null) => {
    setBusy(true);
    try {
      await api.blog.setCover.mutate({ noteId: item.id, attachmentId });
      RootStore.Get(ToastPlugin).success(attachmentId ? '已更新公开封面' : '已移除公开封面');
      onDone();
    } catch (e: any) {
      RootStore.Get(ToastPlugin).error(e.message || '设置封面失败');
    } finally {
      setBusy(false);
    }
  };

  if (!images.length) {
    return <p className="mt-2 text-xs text-default-500">这篇笔记还没有图片附件，先在笔记里添加图片才能设封面。</p>;
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {images.map(a => (
        <button
          key={a.id}
          type="button"
          disabled={busy}
          onClick={() => pick(a.id === current?.id ? null : a.id)}
          title={a.name}
          className={`relative size-14 overflow-hidden rounded-lg border-2 transition-colors disabled:opacity-50 ${
            a.id === current?.id ? 'border-primary' : 'border-default-200 hover:border-default-300'
          }`}
        >
          <img src={a.path} alt={a.name} className="size-full object-cover" loading="lazy" />
          {a.id === current?.id && (
            <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground">
              <Icon icon="lucide:check" width={11} height={11} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function TopicPicker({ item, topics, onDone }: { item: Published; topics: Topic[]; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  // 注意：assignTopics 收的是「这个专题应该包含哪些笔记」，不是「这篇笔记属于哪些专题」。
  // 两个数组的元素含义不同，混用会把专题 id 当笔记 id 发出去。
  const inTopic = (topicId: number) => topics.find(t => t.id === topicId)?.noteIds.includes(item.id) ?? false;

  const toggle = async (topic: Topic) => {
    setBusy(true);
    try {
      const current = topics.find(t => t.id === topic.id)?.noteIds ?? [];
      const next = inTopic(topic.id) ? current.filter(id => id !== item.id) : [...current, item.id];
      await api.blog.assignTopics.mutate({ topicId: topic.id, noteIds: next });
      onDone();
    } catch (e: any) {
      RootStore.Get(ToastPlugin).error(e.message || '专题调整失败');
    } finally {
      setBusy(false);
    }
  };
  if (!topics.length) return <p className="mt-2 text-xs text-default-500">还没有专题，先到「专题」里建一个。</p>;
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {topics.map(t => {
          const on = inTopic(t.id);
          return (
            <button
              key={t.id}
              type="button"
              disabled={busy}
              onClick={() => toggle(t)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                on ? 'border-transparent text-white' : 'border-default-200 text-default-600 hover:bg-default-100'
              }`}
              style={on ? { background: t.color || '#7055f8' } : undefined}
            >
              {t.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const PublishedRow = observer(({ item, topics, onReload }: { item: Published; topics: Topic[]; onReload: () => void }) => {
  const [panel, setPanel] = useState<'none' | 'cover' | 'topics'>('none');
  const [busy, setBusy] = useState(false);
  const live = item.isPublished;
  const cover = item.attachments.find(a => a.id === item.publication?.coverAttachmentId);

  const withdraw = async () => {
    if (!confirm(`撤回《${publishedTitle(item)}》的发布？公开链接会立即失效。`)) return;
    setBusy(true);
    try {
      await api.notes.publishNote.mutate({ id: item.id, isCancel: true });
      RootStore.Get(ToastPlugin).success('已撤回，公开链接已停止访问');
      RootStore.Get(BlinkoStore).updateTicker++;
      onReload();
    } catch (e: any) {
      RootStore.Get(ToastPlugin).error(e.message || '撤回失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={card}>
      <div className="flex gap-3">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-default-100 text-default-400">
          {cover ? <img src={cover.path} alt="封面" className="size-full object-cover" loading="lazy" />
            : <Icon icon="tabler:photo" width={20} height={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-medium">{publishedTitle(item)}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${live ? 'bg-primary/10 text-primary' : 'bg-default-100 text-default-500'}`}>
              {live ? '已发布' : '已撤回'}
            </span>
            {live && item.hasDraftChanges && (
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] text-warning">草稿有更新</span>
            )}
          </div>
          <p className="mt-1 text-xs text-default-500">
            公开版本 {item.publication?.revision ?? 1} · 更新于 {new Date(item.publication?.updatedAt ?? item.updatedAt).toLocaleString()}
          </p>
          {item.topics.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {item.topics.map(t => (
                <span key={t.id} className="rounded-full px-2 py-0.5 text-[11px] text-white" style={{ background: t.color || '#7055f8' }}>{t.name}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-default-100 pt-3">
        {live && item.publishId && (
          <a className={btnGhost} href={`/blog/${item.publishId}`} target="_blank" rel="noopener noreferrer">
            <Icon icon="tabler:external-link" width={14} height={14} /> 打开公开页
          </a>
        )}
        <button type="button" className={btnGhost} onClick={() => setPanel(panel === 'cover' ? 'none' : 'cover')}>封面</button>
        <button type="button" className={btnGhost} onClick={() => setPanel(panel === 'topics' ? 'none' : 'topics')}>所属专题</button>
        {live && <button type="button" className={btnDanger} disabled={busy} onClick={withdraw}>撤回发布</button>}
      </div>

      {panel === 'cover' && <CoverPicker item={item} onDone={onReload} />}
      {panel === 'topics' && <TopicPicker item={item} topics={topics} onDone={onReload} />}
    </article>
  );
});

const TopicsSection = observer(({ topics, onReload }: { topics: Topic[]; onReload: () => void }) => {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState('#7055f8');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.blog.createTopic.mutate({ name: name.trim(), slug: slug.trim() || undefined, desc, color, isPublished: true });
      setName(''); setSlug(''); setDesc('');
      RootStore.Get(ToastPlugin).success('专题已创建');
      onReload();
    } catch (e: any) {
      RootStore.Get(ToastPlugin).error(e.message || '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (t: Topic) => {
    try {
      await api.blog.updateTopic.mutate({ id: t.id, isPublished: !t.isPublished });
      onReload();
    } catch (e: any) {
      RootStore.Get(ToastPlugin).error(e.message || '操作失败');
    }
  };

  const move = async (index: number, delta: number) => {
    const next = [...topics];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await api.blog.reorderTopics.mutate({ orderedIds: next.map(t => t.id) });
      onReload();
    } catch (e: any) {
      RootStore.Get(ToastPlugin).error(e.message || '排序失败');
    }
  };

  const remove = async (t: Topic) => {
    if (!confirm(`删除专题「${t.name}」？已归入的文章不会被删除。`)) return;
    try {
      await api.blog.deleteTopic.mutate({ id: t.id });
      RootStore.Get(ToastPlugin).success('专题已删除');
      onReload();
    } catch (e: any) {
      RootStore.Get(ToastPlugin).error(e.message || '删除失败');
    }
  };

  return (
    <div className="space-y-3">
      <div className={card}>
        <h3 className="text-sm font-medium">新建专题</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className={label}>名称</label><input className={field} value={name} onChange={e => setName(e.target.value)} placeholder="如：产品思考" /></div>
          <div><label className={label}>标识（URL 片段）</label><input className={field} value={slug} onChange={e => setSlug(e.target.value)} placeholder="留空自动生成" /></div>
        </div>
        <div className="mt-3"><label className={label}>简介</label><input className={field} value={desc} onChange={e => setDesc(e.target.value)} placeholder="一句话说明这个专题写什么" /></div>
        <div className="mt-3 flex items-center gap-3">
          <div><label className={label}>颜色</label><input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-9 w-16 cursor-pointer rounded-lg border border-default-200 bg-content1" /></div>
          <button type="button" className={`${btnPrimary} mt-4`} disabled={busy || !name.trim()} onClick={create}>创建并启用</button>
        </div>
      </div>

      {topics.length === 0 && <p className="rounded-xl border border-dashed border-default-200 p-8 text-center text-sm text-default-500">还没有专题</p>}

      {topics.map((t, i) => (
        <div key={t.id} className={`${card} flex flex-wrap items-center gap-3`}>
          <span className="size-3 shrink-0 rounded-full" style={{ background: t.color || '#7055f8' }} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{t.name}</span>
              <code className="rounded bg-default-100 px-1.5 py-0.5 text-[11px] text-default-500">/{t.slug}</code>
              {!t.isPublished && <span className="rounded-full bg-default-100 px-2 py-0.5 text-[11px] text-default-500">未公开</span>}
            </div>
            <p className="mt-0.5 text-xs text-default-500">{t.desc || '暂无简介'} · {t.noteIds.length} 篇</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className={btnGhost} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${t.name} 上移`}>上移</button>
            <button type="button" className={btnGhost} disabled={i === topics.length - 1} onClick={() => move(i, 1)} aria-label={`${t.name} 下移`}>下移</button>
            <button type="button" className={btnGhost} onClick={() => togglePublish(t)}>{t.isPublished ? '停用' : '启用'}</button>
            <button type="button" className={btnDanger} onClick={() => remove(t)}>删除</button>
          </div>
        </div>
      ))}
    </div>
  );
});

const ProfileSection = observer(({ profile, onReload }: { profile: Profile; onReload: () => void }) => {
  const [draft, setDraft] = useState({ displayName: '', tagline: '', bio: '', avatarUrl: '', homepage: '', isPublished: false });
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft({ displayName: profile.displayName, tagline: profile.tagline, bio: profile.bio, avatarUrl: profile.avatarUrl, homepage: profile.homepage, isPublished: profile.isPublished });
    setLinks(profile.links ?? []);
  }, [profile]);

  const save = async () => {
    setBusy(true);
    try {
      await api.blog.saveProfile.mutate({ ...draft, links });
      RootStore.Get(ToastPlugin).success('公开资料已保存');
      onReload();
    } catch (e: any) {
      RootStore.Get(ToastPlugin).error(e.message || '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<typeof draft>) => setDraft(d => ({ ...d, ...patch }));

  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">对外展示的资料</h3>
            <p className="mt-1 text-xs text-default-500">这些字段与账号资料互相独立，只有这里填写的内容才会公开。</p>
          </div>
          <button type="button" role="switch" aria-checked={draft.isPublished} onClick={() => set({ isPublished: !draft.isPublished })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${draft.isPublished ? 'bg-primary' : 'bg-default-200'}`}>
            <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${draft.isPublished ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
        <p className="mt-2 text-xs text-default-500">{draft.isPublished ? '已公开：博客页会展示这份资料。' : '未公开：博客页不展示任何资料。'}</p>
      </div>

      <div className={card}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={label}>展示名称</label><input className={field} value={draft.displayName} onChange={e => set({ displayName: e.target.value })} placeholder="如：Brian" /></div>
          <div><label className={label}>一句话介绍</label><input className={field} value={draft.tagline} onChange={e => set({ tagline: e.target.value })} placeholder="保持好奇，持续记录" /></div>
        </div>
        <div className="mt-3"><label className={label}>简介</label><textarea className={`${field} min-h-24 resize-y`} value={draft.bio} onChange={e => set({ bio: e.target.value })} placeholder="两三句介绍你自己" /></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className={label}>头像地址</label><input className={field} value={draft.avatarUrl} onChange={e => set({ avatarUrl: e.target.value })} placeholder="https:// 或 /api/file/…" /></div>
          <div><label className={label}>个人主页</label><input className={field} value={draft.homepage} onChange={e => set({ homepage: e.target.value })} placeholder="https://example.com" /></div>
        </div>
        {draft.avatarUrl && (
          <img className="mt-3 size-16 rounded-lg object-cover" alt="头像预览"
            src={getAvatarUrl(draft.avatarUrl, '', getBlinkoEndpoint('/'))} />
        )}
      </div>

      <div className={card}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">相关链接</h3>
          <button type="button" className={btnGhost} onClick={() => setLinks(l => [...l, { label: '', url: '' }])}>添加</button>
        </div>
        {links.length === 0 && <p className="mt-2 text-xs text-default-500">还没有链接。</p>}
        <div className="mt-3 space-y-2">
          {links.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input className={field} style={{ maxWidth: 160 }} value={l.label} placeholder="名称"
                onChange={e => setLinks(prev => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input className={field} value={l.url} placeholder="https://" 
                onChange={e => setLinks(prev => prev.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <button type="button" className={btnDanger} aria-label="删除该链接" onClick={() => setLinks(prev => prev.filter((_, j) => j !== i))}>
                <Icon icon="tabler:x" width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" className={btnPrimary} disabled={busy} onClick={save}>{busy ? '保存中…' : '保存公开资料'}</button>
      </div>
    </div>
  );
});

export const BlogManagePage = observer(() => {
  const [section, setSection] = useState<Section>('posts');
  const [published, setPublished] = useState<Published[] | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, t, pr] = await Promise.all([
        api.blog.published.query(),
        api.blog.topics.query(),
        api.blog.profile.query(),
      ]);
      setPublished(p); setTopics(t); setProfile(pr); setError('');
    } catch (e: any) {
      setError(e.message || '加载失败');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    posts: published?.length ?? 0,
    topics: topics.length,
    profile: profile?.isPublished ? 1 : 0,
  }), [published, topics, profile]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">博客管理</h1>
        <p className="mt-1 text-sm text-default-500">发布后的内容是独立快照，草稿改动不会影响线上；需要改内容时点「更新发布」。</p>
      </header>

      <nav aria-label="博客管理分区" className="mb-4 flex flex-wrap gap-1 border-b border-default-200">
        {SECTIONS.map(s => (
          <button key={s.key} type="button" aria-current={section === s.key}
            onClick={() => setSection(s.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              section === s.key ? 'border-primary text-primary' : 'border-transparent text-default-500 hover:text-foreground'
            }`}>
            {s.label}
            {counts[s.key] > 0 && <span className="ml-1.5 text-xs text-default-400">{counts[s.key]}</span>}
          </button>
        ))}
      </nav>

      {error && <p role="alert" className="mb-3 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      {section === 'posts' && (
        <div className="space-y-3">
          {!published && <p className="text-sm text-default-500">正在加载…</p>}
          {published?.length === 0 && (
            <p className="rounded-xl border border-dashed border-default-200 p-8 text-center text-sm text-default-500">
              还没有已发布的笔记。在笔记的「更多信息」里点「发布到博客」。
            </p>
          )}
          {published?.map(item => <PublishedRow key={item.id} item={item} topics={topics} onReload={load} />)}
        </div>
      )}

      {section === 'profile' && (profile ? <ProfileSection profile={profile} onReload={load} /> : <p className="text-sm text-default-500">正在加载…</p>)}
      {section === 'topics' && <TopicsSection topics={topics} onReload={load} />}
    </div>
  );
});
