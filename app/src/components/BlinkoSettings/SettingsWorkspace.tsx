import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Input } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';
import { SettingsCardContext } from '@/components/Common/CollapsibleCard';
import { RootStore } from '@/store';
import { UserStore } from '@/store/user';
import { isDesktop } from '@/lib/tauriHelper';
import { allSettings, settingGroups } from './settingsRegistry';
import './settings.css';

/** The route and overlay share navigation, permission checks and section state. */
export const SettingsWorkspace = observer(({ initialSection = 'basic', onSectionChange }: { initialSection?: string; onSectionChange?: (key: string) => void }) => {
  const { t } = useTranslation();
  const user = RootStore.Get(UserStore);
  const [selected, setSelected] = useState(initialSection);
  const [keyword, setKeyword] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [visited, setVisited] = useState<string[]>([]);
  const search = useRef<HTMLInputElement>(null);
  const allowed = allSettings.filter(item => (!item.requireAdmin || user.isSuperAdmin) && (item.key !== 'hotkey' || isDesktop()));
  const current = allowed.find(item => item.key === selected) || allowed[0];
  const activeKey = current?.key;
  useEffect(() => { if (current && !['common', 'ai', 'about'].includes(current.group)) setMoreOpen(true); }, [activeKey]);
  useEffect(() => { setSelected(initialSection); }, [initialSection]);
  useEffect(() => { if (activeKey) setVisited(keys => keys.includes(activeKey) ? keys : [...keys, activeKey]); }, [activeKey]);
  const query = keyword.trim().toLocaleLowerCase();
  const results = useMemo(() => allowed.filter(item => !query || [t(item.title), t(item.description), t(`settings-group-${item.group}`), ...(item.keywords || [])].some(text => text.toLocaleLowerCase().includes(query))), [query, user.isSuperAdmin, t]);
  const choose = (key: string) => {
    setSelected(key); setKeyword(''); onSectionChange?.(key);
  };
  const navigation = (keys: typeof allSettings, searching = false) => settingGroups.map(group => {
    const items = keys.filter(item => item.group === group);
    if (!items.length) return null;
    return <div key={group} className="settings-nav-group">
      <div className="settings-group-label">{t(`settings-group-${group}`)}</div>
      {items.map(item => <button key={item.key} type="button" aria-current={!searching && item.key === activeKey ? 'page' : undefined} className="settings-nav-item" onClick={() => choose(item.key)}>
        <Icon icon={item.icon} width="18" className="shrink-0" /><span>{t(item.title)}</span>
      </button>)}
    </div>;
  });
  return <SettingsCardContext.Provider value={true}>
    <div className="settings-workspace">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-heading">{t('settings')}</div>
        <Input className="settings-search-field" ref={search} type="search" size="sm" variant="bordered" radius="sm" isClearable
          startContent={<Icon icon="tabler:search" width="17" className="shrink-0 text-default-400" />}
          aria-label={t('settings-search')} placeholder={t('settings-search')} value={keyword} onValueChange={setKeyword} onClear={()=>{setKeyword('');search.current?.focus();}} onKeyDown={event => {
            if (event.key === 'Escape' && keyword) { event.preventDefault(); event.stopPropagation(); setKeyword(''); }
            if (event.key === 'Enter' && query && results[0]) choose(results[0].key);
          }} />
        <nav className="settings-navigation" aria-label={t('settings')}>
          {navigation(allowed.filter(item => ['common','ai'].includes(item.group)))}
          {allowed.some(item => !['common','ai','about'].includes(item.group)) && <div className="settings-more">
            <button type="button" className="settings-nav-item" aria-expanded={moreOpen} aria-controls="settings-more-navigation" onClick={() => setMoreOpen(value => !value)}><Icon icon="tabler:dots" width="18" /><span className="flex-1">{t('settings-more')}</span><Icon icon={moreOpen ? 'tabler:chevron-up' : 'tabler:chevron-down'} width="14" /></button>
            <div id="settings-more-navigation" hidden={!moreOpen}>{navigation(allowed.filter(item => !['common','ai','about'].includes(item.group)))}</div>
          </div>}
        </nav>
        <div className="settings-sidebar-footer">{allowed.filter(item => item.group === 'about').map(item => <button key={item.key} type="button" className="settings-nav-item" aria-current={activeKey === item.key ? 'page' : undefined} onClick={() => choose(item.key)}><Icon icon={item.icon} width="18" /><span>{t(item.title)}</span></button>)}</div>
        <label className="settings-mobile-select"><span className="sr-only">{t('settings-select-section')}</span><select value={activeKey} onChange={event => choose(event.target.value)}>
          {settingGroups.map(group => <optgroup key={group} label={t(`settings-group-${group}`)}>{allowed.filter(item => item.group === group).map(item => <option key={item.key} value={item.key}>{t(item.title)}</option>)}</optgroup>)}
        </select></label>
      </aside>
      <main className="settings-main">
        {query ? <div className="settings-search-results">
          <header className="settings-page-heading"><h2>{t('settings-search-results')}</h2><p>{t('settings-search-count', { count: results.length })}</p></header>
          {results.length ? <div className="settings-result-list">{results.map(item => <button key={item.key} type="button" onClick={() => choose(item.key)}>
            <span className="settings-result-icon"><Icon icon={item.icon} width="21" /></span>
            <span className="min-w-0 flex-1"><span className="block text-xs text-default-400">{t(`settings-group-${item.group}`)}</span><span className="block font-medium">{t(item.title)}</span><span className="mt-1 block text-xs leading-relaxed text-default-500">{t(item.description)}</span></span>
            <Icon icon="tabler:chevron-right" width="17" className="shrink-0 text-default-400" />
          </button>)}</div> : <div className="settings-empty"><Icon icon="tabler:search" width="32" /><p>{t('settings-no-results')}</p><button onClick={() => { setKeyword(''); search.current?.focus(); }}>{t('settings-clear-search')}</button></div>}
        </div> : null}
        {allowed.filter(item => item.key === activeKey || visited.includes(item.key)).map(item => <section key={item.key} hidden={!!query || item.key !== activeKey} className="settings-section" aria-label={t(item.title)}>
          <header className="settings-page-heading"><div className="settings-breadcrumb">{t(`settings-group-${item.group}`)}</div><h2>{t(item.title)}</h2><p>{t(item.description)}</p></header>
          <div className="settings-content"><Suspense fallback={<div role="status" className="settings-loading"><Icon icon="tabler:loader-2" width="20" className="animate-spin" /><span>{t('loading')}</span></div>}>{item.component}</Suspense></div>
        </section>)}
      </main>
    </div>
  </SettingsCardContext.Provider>;
});
