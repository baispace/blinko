import { notePreviewText } from "@/lib/notePreviewText";
import { BlinkoListRow } from "@/components/BlinkoCard/BlinkoListRow";
import dayjs from "@shared/lib/dayjs";
import { useEffect, useState } from "react";
import { Button, Input, Select, SelectItem, Switch } from "@heroui/react";
import { Link, useSearchParams } from "react-router-dom";
import Masonry from "react-masonry-css";
import { api } from "@/lib/trpc";
import { BlinkoCard } from "@/components/BlinkoCard";
import {
  aggregationRuleSchema,
  type AggregationRule,
} from "@shared/lib/noteAggregation";
import "./style.css";

type Page = Awaited<ReturnType<typeof api.notes.aggregationPage.query>>;
const periods = {
  all: "不限日期",
  "24hours": "最近24小时",
  "7days": "最近7天",
  today: "今天",
  thisWeek: "本自然周",
  thisMonth: "本自然月",
  eachWeek: "每自然周分别成组",
  eachMonth: "每自然月分别成组",
  range: "指定日期范围",
};
export function AggregationList({
  type,
  style = "continuous",
  sort = "updatedAt",
  columns = 2,
  onActive,
  refreshKey = 0,
}: {
  type: number;
  style?: string;
  sort?: string;
  columns?: number;
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
  const [at, setAt] = useState(params.get("at") || "");
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
          if (!at) setAt(value.at);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          onActive?.(false);
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
          ▱ {item.rule.name}
          <span>{item.notes.length} 篇</span>
        </div>
        <small>
          {periods[item.rule.period]} ·{" "}
          {new Date(item.notes[0][item.rule.dateField]).toLocaleDateString(
            "zh-CN",
          )}
        </small>
        <p>
          {notePreviewText(item.notes[0].content)
            .replace(/[#*`]/g, "")
            .slice(0, 140)}
        </p>
        <strong>查看这 {item.notes.length} 篇 →</strong>
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
        <Link to={`/aggregation?type=${type}`}>管理规则</Link>
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
          breakpointCols={{ default: columns, 1100: 2, 700: 1 }}
          className="aggregation-masonry"
          columnClassName="aggregation-column"
        >
          {data?.items.map(render)}
        </Masonry>
      ) : (
        <div className="space-y-3">
          {data?.items.map((item) => (
            <div key={item.kind === "note" ? item.note.id : item.key}>
              {!group && (
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
}

export function AggregationPage() {
  const [params] = useSearchParams();
  const type = Number(params.get("type")) === 0 ? 0 : 1;
  const [rules, setRules] = useState<AggregationRule[]>([]);
  const [tags, setTags] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      api.notes.aggregationRules.query({ type }),
      api.tags.list.query(),
    ])
      .then(([value, tagData]) => {
        if (active) {
          setLoaded(true);
          setRules(value);
          const flatten = (nodes: any[]): any[] =>
            nodes.flatMap((node) => [node, ...flatten(node.children || [])]);
          setTags(
            Array.isArray(tagData)
              ? tagData
              : flatten((tagData as any).listTags || []),
          );
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [type]);
  const patch = (index: number, value: Partial<AggregationRule>) =>
    setRules((old) =>
      old.map((rule, i) => (i === index ? { ...rule, ...value } : rule)),
    );
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const value = await api.notes.saveAggregationRules.mutate({
        type,
        rules,
      });
      setRules(value);
      setError("已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="aggregation-page">
      <Link to={`/?path=${type === 1 ? "notes" : "blinko"}`}>
        ← 返回{type === 1 ? "笔记" : "闪念"}
      </Link>
      {params.get("group") ? (
        <AggregationList
          type={type}
          style={params.get("style") || "continuous"}
          sort={params.get("sort") || "updatedAt"}
        />
      ) : (
        <>
          <div className="aggregation-toolbar">
            <h1>聚合规则</h1>
            <Button
              color="primary"
              isDisabled={!loaded || busy || !tags.length}
              onPress={() =>
                setRules((old) => [
                  ...old,
                  aggregationRuleSchema.parse({
                    id: crypto.randomUUID(),
                    name: "新聚合规则",
                    tagIds: [tags[0]?.id || 1],
                    period: "eachWeek",
                  }),
                ])
              }
            >
              新建规则
            </Button>
          </div>
          <p>
            标签和日期条件同时满足时归组。两篇起聚合，规则按上方顺序优先匹配。
          </p>
          {loading && <p role="status">正在加载…</p>}
          {error && <p role="status">{error}</p>}
          {rules.map((rule, index) => (
            <section key={rule.id} className="aggregation-rule">
              <div className="aggregation-toolbar">
                <Input
                  aria-label="规则名称"
                  value={rule.name}
                  onValueChange={(name) => patch(index, { name })}
                />
                <Switch
                  aria-label="启用规则"
                  isSelected={rule.enabled}
                  onValueChange={(enabled) => patch(index, { enabled })}
                />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm">匹配标签</legend>
                <div className="flex max-h-40 flex-wrap gap-2 overflow-auto">
                  {tags.map((tag) => (
                    <Button
                      key={tag.id}
                      size="sm"
                      aria-pressed={rule.tagIds.includes(tag.id)}
                      color={
                        rule.tagIds.includes(tag.id) ? "primary" : "default"
                      }
                      variant="flat"
                      onPress={() =>
                        patch(index, {
                          tagIds: rule.tagIds.includes(tag.id)
                            ? rule.tagIds.filter((id) => id !== tag.id)
                            : [...rule.tagIds, tag.id],
                        })
                      }
                    >
                      {tag.name}
                    </Button>
                  ))}
                </div>
              </fieldset>
              <Select
                label="标签关系"
                selectedKeys={[rule.tagMatch]}
                onChange={(e) =>
                  patch(index, { tagMatch: e.target.value as any })
                }
              >
                <SelectItem key="any">满足任一标签</SelectItem>
                <SelectItem key="all">同时满足全部标签</SelectItem>
              </Select>
              <Select
                label="日期依据"
                selectedKeys={[rule.dateField]}
                onChange={(e) =>
                  patch(index, { dateField: e.target.value as any })
                }
              >
                <SelectItem key="createdAt">创建时间</SelectItem>
                <SelectItem key="updatedAt">更新时间</SelectItem>
              </Select>
              <Select
                label="日期范围与分组"
                selectedKeys={[rule.period]}
                onChange={(e) =>
                  patch(index, { period: e.target.value as any })
                }
              >
                {Object.entries(periods).map(([key, label]) => (
                  <SelectItem key={key}>{label}</SelectItem>
                ))}
              </Select>
              {rule.period === "range" && (
                <div className="aggregation-toolbar">
                  <Input
                    type="date"
                    label="开始日期"
                    value={rule.rangeStart || ""}
                    onValueChange={(rangeStart) => patch(index, { rangeStart })}
                  />
                  <Input
                    type="date"
                    label="结束日期"
                    value={rule.rangeEnd || ""}
                    onValueChange={(rangeEnd) => patch(index, { rangeEnd })}
                  />
                </div>
              )}
              <Select
                label="主列表展示"
                selectedKeys={[rule.display]}
                onChange={(e) =>
                  patch(index, { display: e.target.value as any })
                }
              >
                <SelectItem key="grouped">聚合展示</SelectItem>
                <SelectItem key="individual">逐篇展示</SelectItem>
              </Select>
              <div className="aggregation-toolbar">
                <Button
                  size="sm"
                  isDisabled={index === 0}
                  onPress={() =>
                    setRules((old) => {
                      const next = [...old];
                      [next[index - 1], next[index]] = [
                        next[index],
                        next[index - 1],
                      ];
                      return next;
                    })
                  }
                >
                  提高优先级
                </Button>
                <Button
                  size="sm"
                  color="danger"
                  variant="light"
                  onPress={() =>
                    setRules((old) => old.filter((item) => item.id !== rule.id))
                  }
                >
                  移除规则
                </Button>
              </div>
            </section>
          ))}
          <Button
            color="primary"
            isLoading={busy}
            isDisabled={!loaded}
            onPress={() => void save()}
          >
            保存设置
          </Button>
        </>
      )}
    </main>
  );
}
