import { notePreviewText } from "@/lib/notePreviewText";
import { BlinkoListRow } from "@/components/BlinkoCard/BlinkoListRow";
import dayjs from "@shared/lib/dayjs";
import { useEffect, useMemo, useState } from "react";
import { Button, Input, Switch } from "@heroui/react";
import { Link, useSearchParams } from "react-router-dom";
import Masonry from "react-masonry-css";
import { api } from "@/lib/trpc";
import { BlinkoCard } from "@/components/BlinkoCard";
import {
  type AggregationRule,
} from "@shared/lib/noteAggregation";
import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { Icon } from '@/components/Common/Iconify/icons';
import { aggregationRulesSchema } from '@shared/lib/noteAggregation';
import "./style.css";

type Page = Awaited<ReturnType<typeof api.notes.aggregationPage.query>>;
import { periods } from './constants';
import { AggregationRuleEditor } from './RuleEditor';

function previewTitle(note: { content: string; metadata: unknown }) {
  const metadata = note.metadata;
  const title = metadata && typeof metadata === 'object' && 'title' in metadata && typeof metadata.title === 'string' ? metadata.title.trim() : '';
  return title || notePreviewText(note.content).split('\n').find((line) => line.trim())?.replace(/^#+\s*/, '') || '未命名笔记';
}

export const AggregationList = observer(function AggregationList({
  type,
  style = "continuous",
  sort = "updatedAt",
  columns = 2,
  spacing = 16,
  onActive,
  refreshKey = 0,
}: {
  type: number;
  style?: string;
  sort?: string;
  columns?: number;
  spacing?: number;
  refreshKey?: number;
  onActive?: (active: boolean) => void;
}) {
  const [params] = useSearchParams();
  const group = params.get("group") || undefined;
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [resultSort, setResultSort] = useState(sort);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const updateTicker = RootStore.Get(BlinkoStore).updateTicker;
  const snapshot = params.get("at");
  const at = useMemo(() => snapshot || new Date().toISOString(), [snapshot, type, style, refreshKey, updateTicker]);
  useEffect(() => { setPage(1); setSearch(""); setData(null); }, [type, style, group]);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    api.notes.aggregationPage
      .query({
        type,
        page,
        sort:
          (group ? resultSort : sort) === "createdAt"
            ? "createdAt"
            : "updatedAt",
        style: style === "byDay" || style === "byWeek" ? style : "continuous",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        at: at || undefined,
        group,
        search,
      })
      .then((value) => {
        if (active) {
          setData(value);
          onActive?.(value.active);
          if (page !== value.page) setPage(value.page);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          if (!data) onActive?.(false);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [
    type,
    page,
    sort,
    style,
    group,
    search,
    at,
    retry,
    refreshKey,
    resultSort,
    updateTicker,
  ]);
  if (!group && !data?.active && !error) return null;
  const render = (item: Page["items"][number]) =>
    item.kind === "note" ? (
      style !== "continuous" || group ? (
        <BlinkoListRow key={`n${item.note.id}`} blinkoItem={item.note as any} />
      ) : (
        <BlinkoCard key={`n${item.note.id}`} blinkoItem={item.note as any} />
      )
    ) : (
      <Link
        key={item.key}
        className="aggregation-card"
        onClick={(event) => {
          const root = event.currentTarget.closest(".scroll-area");
          if (root)
            sessionStorage.setItem(
              "restore-scroll-position",
              String(root.scrollTop),
            );
        }}
        to={`/aggregation?type=${type}&group=${encodeURIComponent(item.key)}&at=${encodeURIComponent(data!.at)}&style=${style}&sort=${sort}`}
      >
        <div className="aggregation-card-title">
          <span className="inline-flex items-center gap-2"><Icon icon="tabler:stack-2" width={18} />{item.rule.name}</span>
          <span className="aggregation-count">{item.count} 篇</span>
        </div>
        <small>{periods[item.rule.period]} {Array.from(new Set(item.key.slice(item.rule.id.length + 1).split(':').filter((part) => part && part !== 'all'))).join(' / ')} · {item.rule.dateField === 'createdAt' ? '创建时间' : '更新时间'}</small>
        <ul className="aggregation-previews">
          {item.notes.map((note) => <li key={note.id}>{previewTitle(note)}</li>)}
        </ul>
        <strong className="flex items-center justify-between">查看全部 {item.count} 篇<Icon icon="tabler:arrow-right" width={16} /></strong>
      </Link>
    );
  const timelineLabel = (item: Page["items"][number]) => {
    const note = item.kind === "note" ? item.note : item.notes[0];
    return (
      style === "byWeek"
        ? dayjs(note.createdAt)
            .startOf("day")
            .subtract((dayjs(note.createdAt).day() + 6) % 7, "day")
        : dayjs(note.createdAt)
    ).format("YYYY-MM-DD");
  };
  return (
    <section className="aggregation-list">
      <div className="aggregation-toolbar">
        <span>
          {group
            ? `${data?.groupName || "聚合结果"} · ${data?.noteCount || 0} 篇`
            : `已开启聚合 · ${data?.noteCount ?? 0} 篇笔记，展示 ${data?.total ?? 0} 项`}
        </span>
        <Link to={`/aggregation?type=${type}`}>管理聚合规则</Link>
      </div>
      {group && (
        <>
          <p className="text-xs text-default-500">
            {data?.groupDescription} · 查看时间固定于{" "}
            {at && new Date(at).toLocaleString("zh-CN")}
          </p>
          <label className="aggregation-toolbar">
            排序方式
            <select
              aria-label="结果排序"
              value={resultSort}
              onChange={(event) => {
                setResultSort(event.target.value);
                setPage(1);
              }}
            >
              <option value="updatedAt">最近更新</option>
              <option value="createdAt">最近创建</option>
            </select>
          </label>
          <Input
            aria-label="组内搜索"
            placeholder="在当前聚合结果中搜索"
            value={search}
            onValueChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
        </>
      )}
      {error && (
        <p role="alert">
          {error}
          <Button onPress={() => setRetry((v) => v + 1)}>重试</Button>
        </p>
      )}
      {busy && <p role="status">正在加载…</p>}
      {data?.items.length === 0 && !busy && <p>当前没有符合条件的笔记。</p>}
      {style === "continuous" && !group ? (
        <Masonry
          breakpointCols={{ default: columns, 1100: Math.min(columns, 2), 700: 1 }}
          style={{ "--aggregation-gap": `${spacing}px` } as React.CSSProperties}
          className="aggregation-masonry"
          columnClassName="aggregation-column"
        >
          {data?.items.map(render)}
        </Masonry>
      ) : (
        <div className="space-y-3">
          {data?.items.map((item, index) => (
            <div key={item.kind === "note" ? item.note.id : item.key}>
              {!group && (index === 0 || timelineLabel(data!.items[index - 1]) !== timelineLabel(item)) && (
                <h2 className="mb-2 text-xs text-default-500">
                  {style === "byWeek" ? "所在周 · " : ""}
                  {timelineLabel(item)}
                </h2>
              )}
              {render(item)}
            </div>
          ))}
        </div>
      )}
      <div className="aggregation-toolbar">
        <Button
          size="sm"
          isDisabled={busy || page === 1}
          onPress={() => setPage((v) => v - 1)}
        >
          上一页
        </Button>
        <span>
          {page} / {Math.max(1, Math.ceil((data?.total || 0) / 24))}
        </span>
        <Button
          size="sm"
          isDisabled={busy || page * 24 >= (data?.total || 0)}
          onPress={() => setPage((v) => v + 1)}
        >
          下一页
        </Button>
      </div>
    </section>
  );
});

export function AggregationPage() {
  const [params] = useSearchParams();
  const type = Number(params.get("type")) === 0 ? 0 : 1;
  const group = params.get('group');
  const [rules, setRules] = useState<AggregationRule[]>([]);
  const [tags, setTags] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<AggregationRule | null>(null);
  const [preview, setPreview] = useState<Page | null>(null);
  useEffect(() => {
    if (group) return;
    let active = true;
    setLoading(true);
    setLoaded(false);
    setError('');
    setEditing(null);
    setPreview(null);
    Promise.all([api.notes.aggregationRules.query({ type }), api.tags.list.query()])
      .then(([value, tagData]) => {
        if (!active) return;
        setRules(value);
        setTags(tagData);
        setLoaded(true);
      })
      .catch((error) => { if (active) setError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, group]);
  const persist = async (next: AggregationRule[]) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await api.notes.saveAggregationRules.mutate({ type, rules: aggregationRulesSchema.parse(next) });
      setRules(saved);
      setPreview(null);
      setNotice('规则已保存并应用到列表');
      return saved;
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存失败，请重试');
      throw error;
    } finally {
      setBusy(false);
    }
  };
  const update = (next: AggregationRule[]) => { void persist(next).catch(() => {}); };
  const previewRules = async () => {
    setBusy(true);
    setError('');
    try {
      setPreview(await api.notes.aggregationPage.query({ type, previewRules: rules, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
    } catch (error) { setError(error instanceof Error ? error.message : '预览失败'); }
    finally { setBusy(false); }
  };
  const replaceRule = (rule: AggregationRule) => rules.some((item) => item.id === rule.id)
    ? rules.map((item) => item.id === rule.id ? rule : item) : [...rules, rule];
  const move = (index: number, direction: number) => {
    const next = [...rules];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    update(next);
  };
  return (
    <main className="aggregation-page">
      <Link to={`/?path=${type === 1 ? "notes" : "blinko"}`}>← 返回{type === 1 ? "笔记" : "闪念"}</Link>
      {group ? <AggregationList type={type} style={params.get('style') || 'continuous'} sort={params.get('sort') || 'updatedAt'} /> : <>
        <div className="aggregation-toolbar">
          <div><h1>聚合规则</h1><p className="mt-1 text-sm text-default-500">管理{type === 1 ? '笔记' : '闪念'}列表的展示方式</p></div>
          <div className="flex gap-2">
            {!!rules.length && <Button variant="flat" isDisabled={!loaded || busy} onPress={() => void previewRules()}>预览效果</Button>}
            <Button color="primary" startContent={<Icon icon="tabler:plus" width={16} />} isDisabled={!loaded || busy || !tags.length || rules.length >= 30}
              onPress={() => setEditing({ id: crypto.randomUUID(), name: '', enabled: true, display: 'grouped', tagIds: [], tagMatch: 'any', dateField: 'createdAt', period: 'eachWeek' })}>新建规则</Button>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-default-500">满足标签和日期条件的内容，两篇起聚合。规则从上到下优先匹配，置顶内容单独展示。</p>
        {loading && <p className="mt-6 text-sm text-default-500" role="status">正在读取规则…</p>}
        {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}
        {notice && <p className="mt-4 text-sm text-success" role="status">{notice}</p>}
        {loaded && !rules.length && <div className="aggregation-empty"><Icon icon="tabler:stack-2" width={30} /><h2>把同一主题的内容收在一起</h2><p>{tags.length ? '创建标签与日期规则，匹配的多篇内容会在列表中展示为一张聚合卡片。' : '先为内容添加标签，即可创建聚合规则。'}</p></div>}
        <div className="aggregation-rules">
          {rules.map((rule, index) => <section className="aggregation-rule-summary" key={rule.id}>
            <div className="aggregation-priority">{index + 1}</div>
            <div className="min-w-0 flex-1">
              <button type="button" className="aggregation-rule-name" disabled={busy} onClick={() => setEditing(rule)}>{rule.name}<Icon icon="tabler:chevron-right" width={15} /></button>
              <p>{rule.tagIds.map((id) => `#${tags.find((tag) => tag.id === id)?.name || '已删除标签'}`).join(rule.tagMatch === 'all' ? ' + ' : ' / ')}</p>
              <small>{periods[rule.period]}{rule.period === 'range' ? ` ${rule.rangeStart} — ${rule.rangeEnd}` : ''} · {rule.dateField === 'createdAt' ? '创建时间' : '更新时间'} · {rule.display === 'grouped' ? '聚合展示' : '逐篇展示'}</small>
            </div>
            <div className="aggregation-rule-actions">
              <Switch size="sm" isSelected={rule.enabled} isDisabled={busy} aria-label={`启用${rule.name}`} onValueChange={(enabled) => update(rules.map((item) => item.id === rule.id ? { ...item, enabled } : item))} />
              <Button isIconOnly size="sm" variant="light" aria-label="提高优先级" isDisabled={busy || index === 0} onPress={() => move(index, -1)}><Icon icon="tabler:arrow-up" width={16} /></Button>
              <Button isIconOnly size="sm" variant="light" aria-label="降低优先级" isDisabled={busy || index === rules.length - 1} onPress={() => move(index, 1)}><Icon icon="tabler:arrow-down" width={16} /></Button>
              <Button size="sm" variant="flat" isDisabled={busy} onPress={() => setEditing(rule)}>编辑</Button>
              <Button isIconOnly size="sm" variant="light" color="danger" aria-label={`删除${rule.name}`} isDisabled={busy} onPress={() => { if (window.confirm(`删除“${rule.name}”这条聚合规则？`)) update(rules.filter((item) => item.id !== rule.id)); }}><Icon icon="tabler:trash" width={16} /></Button>
            </div>
          </section>)}
        </div>
        {preview && <section className="aggregation-preview" aria-label="聚合预览"><h2>当前列表效果</h2><p>{preview.noteCount} 篇内容，展示 {preview.total} 项</p>
          {preview.ruleStats.map((item) => <p key={item.ruleId}>{rules.find((rule) => rule.id === item.ruleId)?.name} · {item.groups} 组 · {item.noteCount} 篇</p>)}
          <Link to={`/?path=${type === 1 ? 'notes' : 'blinko'}`}>前往列表查看 →</Link>
        </section>}
        {editing && <AggregationRuleEditor key={editing.id} rule={editing} tags={tags} isNew={!rules.some((rule) => rule.id === editing.id)} type={type}
          rulesForPreview={replaceRule} onClose={() => setEditing(null)} onSave={async (rule) => { await persist(replaceRule(rule)); setEditing(null); }} />}
      </>}
    </main>
  );
}
