import { SiteBrand } from '../Common/SiteBrand';
import { observer } from 'mobx-react-lite';
import { Button, Input, Textarea } from '@heroui/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { UserStore } from '@/store/user';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { Icon } from '@/components/Common/Iconify/icons';
import { UpdateProgressDialog } from '@/components/Common/UpdateProgressDialog';
import { isDesktop, isInTauri } from '@/lib/tauriHelper';
import { api } from '@/lib/trpc';
import { siteInfoSchema, type SiteInfo, type SiteRelease } from '@shared/lib/siteInfo';

export const AboutSetting = observer(({ updatesOnly = false }: { updatesOnly?: boolean }) => {
  const { t, i18n } = useTranslation();
  const text = (zh: string, en: string) => i18n.language.startsWith('zh') ? zh : en;
  const blinko = RootStore.Get(BlinkoStore), user = RootStore.Get(UserStore), toast = RootStore.Get(ToastPlugin);
  const [snapshot, setSnapshot] = useState<{ data: SiteInfo; revision: string } | null>(null);
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [saving, setSaving] = useState(false);
  const [serverVersion, setServerVersion] = useState('');
  const [editingDescription, setEditingDescription] = useState(false), [description, setDescription] = useState('');
  const [draft, setDraft] = useState<SiteRelease | null>(null);
  const [clearing, setClearing] = useState(false);
  const [updating, setUpdating] = useState(false);
  // 更新通道只存在于桌面壳里；浏览器端没有 Tauri 运行时，按钮不出现
  const canUpdate = isInTauri() && isDesktop();
  const load = async () => {
    setLoading(true); setFailed(false);
    try { setSnapshot(await api.config.siteInfo.query()); }
    catch { setFailed(true); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); void api.public.serverVersion.query().then(value => setServerVersion(String(value || ''))).catch(() => {}); }, []);
  const save = async (data: SiteInfo) => {
    if (!snapshot || saving) return false;
    const parsed = siteInfoSchema.safeParse(data);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message || t('operation-failed')); return false; }
    setSaving(true);
    try {
      setSnapshot(await api.config.saveSiteInfo.mutate({ data: parsed.data, revision: snapshot.revision }));
      toast.success(t('operation-success')); return true;
    } catch (error) { toast.error(error instanceof Error ? error.message : t('operation-failed')); return false; }
    finally { setSaving(false); }
  };
  const clearCache = async () => {
    setClearing(true);
    try {
      if ('caches' in window) await Promise.all((await caches.keys()).map(key => caches.delete(key)));
      if ('serviceWorker' in navigator) await Promise.all((await navigator.serviceWorker.getRegistrations()).map(worker => worker.unregister()));
      window.location.reload();
    } catch { toast.error(t('failed-to-clear-cache')); setClearing(false); }
  };
  const releases = [...(snapshot?.data.releases || [])].sort((a,b) => b.date.localeCompare(a.date));
  const title = blinko.config.value?.customTitle?.trim() || text('我的工作空间', 'My workspace');
  return <div className="space-y-7">
    {!updatesOnly && <section className="rounded-xl border border-default-200/70 p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><SiteBrand compact size={30} /></div>
        <div className="min-w-0 flex-1"><h3 className="text-lg font-semibold break-words">{title}</h3><p className="mt-1 text-xs text-default-400">{text('闪念 · 笔记 · 待办 · AI 工作流', 'Ideas · Notes · Tasks · AI workflows')}</p></div>
        {user.isSuperAdmin && snapshot && !editingDescription && <Button size="sm" variant="light" onPress={() => { setDescription(snapshot.data.description); setEditingDescription(true); }}>{text('编辑介绍', 'Edit intro')}</Button>}
      </div>
      {editingDescription ? <div className="mt-4 space-y-3">
        <Textarea label={text('站点介绍', 'Workspace introduction')} maxLength={500} value={description} onValueChange={setDescription} isDisabled={saving} />
        <div className="flex justify-end gap-2"><Button size="sm" variant="light" isDisabled={saving} onPress={() => setEditingDescription(false)}>{t('cancel')}</Button><Button size="sm" color="primary" isLoading={saving} onPress={async () => { if (snapshot && await save({ ...snapshot.data, description })) setEditingDescription(false); }}>{t('save')}</Button></div>
      </div> : <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-default-600">{snapshot?.data.description || text('整理工作与生活中的信息，把想法沉淀为笔记，把计划推进为行动。', 'Collect ideas, build knowledge and turn plans into action.')}</p>}
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-default-100 pt-4 text-xs text-default-500"><span>{text('当前账户', 'Account')} · {user.name}</span><span>{text('已记录更新', 'Recorded updates')} · {releases.length}</span>{releases[0]?.version && <span>{text('最近版本', 'Latest recorded version')} · {releases[0].version}</span>}</div>
    </section>}

    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">{text('版本与改进记录', 'Versions & improvements')}</h3><p className="mt-1 text-xs leading-relaxed text-default-400">{text('留下每次变化的内容、结论，以及仍需跟进的问题。', 'Record what changed, the outcome and any remaining follow-up.')}</p></div>
        <div className="flex items-center gap-1"><Button size="sm" variant="light" isDisabled={saving || loading} onPress={load}>{text('重新载入', 'Reload')}</Button>{user.isSuperAdmin && <Button size="sm" variant="flat" isDisabled={!snapshot || !!draft || releases.length >= 100} startContent={<Icon icon="tabler:plus" width="16" />} onPress={() => setDraft({ id: crypto.randomUUID(), version: '', date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date()), title: '', changes: '', conclusion: '' })}>{text('记录更新', 'Record update')}</Button>}</div>
      </div>
      {draft && <form className="mb-5 space-y-4 rounded-xl border border-primary/25 bg-primary/[.025] p-4" onSubmit={async event => {
        event.preventDefault(); if (!snapshot) return;
        const releases = snapshot.data.releases.some(item => item.id === draft.id) ? snapshot.data.releases.map(item => item.id === draft.id ? draft : item) : [draft, ...snapshot.data.releases];
        if (await save({ ...snapshot.data, releases })) setDraft(null);
      }}>
        <div className="grid gap-3 sm:grid-cols-2"><Input label={text('版本号（可选）', 'Version (optional)')} value={draft.version} maxLength={50} onValueChange={version => setDraft({ ...draft, version })} isDisabled={saving} /><Input type="date" label={text('更新日期', 'Update date')} isRequired value={draft.date} onValueChange={date => setDraft({ ...draft, date })} isDisabled={saving} /></div>
        <Input label={text('这次主要改了什么', 'Update title')} isRequired maxLength={100} value={draft.title} onValueChange={title => setDraft({ ...draft, title })} isDisabled={saving} />
        <Textarea label={text('变化内容（可选）', 'Changes (optional)')} minRows={2} maxLength={4000} value={draft.changes} onValueChange={changes => setDraft({ ...draft, changes })} isDisabled={saving} />
        <Textarea label={text('结论与后续', 'Outcome & follow-up')} placeholder={text('解决了什么、实际体验如何，还有什么需要继续跟进？', 'What improved? How did it work? What needs further attention?')} isRequired minRows={3} maxLength={2000} value={draft.conclusion} onValueChange={conclusion => setDraft({ ...draft, conclusion })} isDisabled={saving} />
        <div className="flex justify-end gap-2"><Button type="button" variant="light" size="sm" isDisabled={saving} onPress={() => setDraft(null)}>{t('cancel')}</Button><Button type="submit" color="primary" size="sm" isLoading={saving}>{text('保存记录', 'Save record')}</Button></div>
      </form>}
      {loading ? <p role="status" className="py-8 text-center text-sm text-default-400">{t('loading')}</p> : failed ? <div role="alert" className="rounded-xl border border-danger/20 p-5 text-sm"><p>{text('记录加载失败，尚未读取到站点数据。', 'Could not load workspace records.')}</p><Button variant="light" size="sm" onPress={load}>{t('retry')}</Button></div> : !releases.length ? <div className="rounded-xl border border-dashed border-default-200 p-7 text-center"><Icon icon="tabler:history" width="26" className="mx-auto mb-3 text-default-400" /><p className="text-sm text-default-600">{text('还没有版本记录', 'No version records yet')}</p><p className="mt-2 text-xs text-default-400">{text('从你确认的一次改进开始，记录变化和使用结论。', 'Start with an improvement you have reviewed and record its outcome.')}</p></div> : <div className="ml-2 border-l border-default-200 pl-5">{releases.map(release => <article key={release.id} className="relative pb-7 last:pb-0 before:absolute before:-left-[26px] before:top-1.5 before:h-2.5 before:w-2.5 before:rounded-full before:border-2 before:border-background before:bg-primary"><div className="rounded-xl border border-default-200/70 p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-default-400"><time dateTime={release.date}>{release.date}</time>{release.version && <span className="rounded bg-default-100 px-2 py-0.5 text-default-600">{release.version}</span>}</div><h4 className="text-sm font-semibold break-words">{release.title}</h4></div>{user.isSuperAdmin && <Button variant="light" size="sm" isDisabled={!!draft || saving} onPress={() => setDraft({ ...release })}>{t('edit')}</Button>}</div>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-default-600">{release.conclusion}</p>
        {release.changes && <details className="mt-3 border-t border-default-100 pt-3"><summary className="cursor-pointer text-xs text-default-500">{text('查看变化内容', 'View changes')}</summary><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-default-500">{release.changes}</p></details>}
      </div></article>)}</div>}
    </section>

    {!updatesOnly && <details className="border-t border-default-200/60 pt-4"><summary className="cursor-pointer text-xs text-default-400">{text('运行信息与维护', 'Runtime & maintenance')}</summary><div className="mt-4 space-y-4 text-xs text-default-500"><p>{text('当前地址', 'Address')} · {window.location.origin}</p><p>{text('基于开源项目', 'Built on')} <a href="https://github.com/blinko-space/blinko" target="_blank" rel="noreferrer" className="text-primary">Blinko</a>{serverVersion ? ` · ${serverVersion}` : ''}</p><div className="flex flex-wrap items-center justify-between gap-3"><span>{text('页面显示异常时，可清除页面缓存后重新加载。', 'If the page looks incorrect, clear its cache and reload.')}</span><Button size="sm" variant="flat" isLoading={clearing} onPress={clearCache}>{t('clear-browser-cache')}</Button></div>{canUpdate && <div className="flex flex-wrap items-center justify-between gap-3"><span>{text('桌面端可在此检查并安装新版本。', 'Check and install a new version from the desktop app.')}</span><Button size="sm" variant="flat" startContent={<Icon icon="tabler:refresh" width="16" />} onPress={() => setUpdating(true)}>{t('check-for-updates')}</Button></div>}</div></details>}
    <UpdateProgressDialog isOpen={updating} onClose={() => setUpdating(false)} />
  </div>;
});
