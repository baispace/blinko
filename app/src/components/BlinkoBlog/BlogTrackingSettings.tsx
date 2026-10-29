import { BlogCheckbox, BlogInput, BlogTabs, BlogTextarea } from "./BlogUI";
import { Button, Card, CardBody } from "@heroui/react";
import { useEffect, useState } from "react";
import { api } from "@/lib/trpc";
import { Icon } from "@/components/Common/Iconify/icons";
import type { BlogSiteSettings } from "@shared/lib/blogSiteSettings";
import {
  extractTrackingId,
  type TrackingVendor,
} from "@shared/lib/blogTracking";

type Vendor = TrackingVendor;
type TrackingState = Awaited<ReturnType<typeof api.blog.trackingState.query>>[Vendor];

const VENDORS: {
  id: Vendor;
  name: string;
  desc: string;
  idLabel: string;
  idPlaceholder: string;
  codePlaceholder: string;
  report: string;
}[] = [
  {
    id: "ga",
    name: "Google Analytics 4",
    desc: "基于 Google 提供的网站分析服务。",
    idLabel: "衡量 ID（G- 开头）",
    idPlaceholder: "G-XXXXXXXXXX",
    codePlaceholder: "粘贴 Google 提供的 gtag 安装代码",
    report: "https://analytics.google.com/",
  },
  {
    id: "baidu",
    name: "百度统计",
    desc: "百度提供的网站流量分析服务。",
    idLabel: "站点编号（32 位）",
    idPlaceholder: "32 位小写十六进制",
    codePlaceholder: "粘贴百度统计提供的安装代码",
    report: "https://tongji.baidu.com/",
  },
];

export { extractTrackingId };

function StatusDot({ ok, warn }: { ok?: boolean; warn?: boolean }) {
  const color = ok ? "bg-success" : warn ? "bg-warning" : "bg-default-300";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color}`}
      aria-hidden="true"
    />
  );
}

function TrackingCard({
  vendor,
  data,
  patch,
}: {
  vendor: Vendor;
  data: BlogSiteSettings;
  patch: (p: Partial<BlogSiteSettings>) => void;
}) {
  const meta = VENDORS.find((v) => v.id === vendor)!;
  const [tab, setTab] = useState<"id" | "code">("id");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [state, setState] = useState<TrackingState | null>(null);
  const [checked, setChecked] = useState(false);

  const enabled = vendor === "ga" ? data.gaEnabled : data.baiduEnabled;
  const id = vendor === "ga" ? data.gaId : data.baiduId;

  const detect = async () => {
    setChecking(true);
    setError("");
    try {
      const result = await api.blog.trackingState.query();
      setState(result[vendor]);
      setChecked(true);
    } catch (e: any) {
      setError(e?.message || "检测失败，请重试");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    setNotice("");
    setError("");
  }, [vendor]);

  const extract = () => {
    const result = extractTrackingId(vendor, code);
    if (!result.id) {
      setError(result.reason || "没有识别到编号");
      setNotice("");
      return;
    }
    patch(vendor === "ga" ? { gaId: result.id } : { baiduId: result.id });
    setError("");
    setNotice(
      "已提取编号；保存后只加载官方脚本，粘贴的代码不会被执行，也不会被保存。",
    );
  };

  return (
    <Card className="border border-default-200 bg-surface">
      <CardBody className="gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold text-foreground">{meta.name}</h3>
            <p className="text-sm text-default-500">{meta.desc}</p>
          </div>
          <label className="flex items-center gap-2">
            <BlogCheckbox
              toggle
              type="checkbox"
              checked={!!enabled}
              onChange={(e) =>
                patch(
                  vendor === "ga"
                    ? { gaEnabled: e.target.checked }
                    : { baiduEnabled: e.target.checked },
                )
              }
            />
            <span className="text-sm">启用</span>
          </label>
        </div>

        <BlogTabs
          label="配置方式"
          value={tab}
          onChange={key => setTab(key as typeof tab)}
          items={[
            { key: "id", label: "编号配置（推荐）" },
            { key: "code", label: "粘贴代码" },
          ]}
        />

        {tab === "id" ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm">{meta.idLabel}</span>
            <BlogInput
              className="w-full"
              value={id}
              placeholder={meta.idPlaceholder}
              onChange={(e) =>
                patch(
                  vendor === "ga"
                    ? { gaId: e.target.value.trim() }
                    : { baiduId: e.target.value.trim() },
                )
              }
            />
            <small className="text-xs text-default-400">
              {vendor === "ga"
                ? "填写 G- 开头的衡量 ID，系统自动加载官方统计脚本。"
                : "填写 32 位小写十六进制的站点 ID，系统自动加载官方统计脚本。"}
            </small>
          </label>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm">服务商安装代码</span>
            <BlogTextarea
              className="w-full"
              rows={5}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={meta.codePlaceholder}
            />
            <small className="text-xs text-default-400">保存时提取官方站点编号，不执行任意第三方代码。</small>
          </label>
        )}

        {tab === "code" && (
          <div className="flex gap-2">
            <Button size="sm" onPress={extract}>
              提取编号
            </Button>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary" role="status">
            {notice}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="flat"
            onPress={() => void detect()}
            isDisabled={checking}
            startContent={<Icon icon="tabler:refresh" width={15} />}
          >
            {checking ? "检测中…" : "检测接入"}
          </Button>
          {checked && state && (
            <span className="text-sm text-default-500">
              {state.enabled
                ? state.idValid
                  ? "配置有效"
                  : "编号格式不正确"
                : "未启用"}
            </span>
          )}
        </div>

        {checked && state && (
          <div className="flex flex-col gap-3 rounded-lg border border-default-200 bg-default-50 p-4">
            <div className="flex items-start gap-2">
              <strong className="flex items-center gap-1.5 text-sm">
                <StatusDot ok={state.enabled && state.idValid} /> 配置
              </strong>
              <span className="text-sm text-default-500">
                {state.enabled
                  ? state.idValid
                    ? "已启用且编号格式正确"
                    : "已启用，但编号格式不正确"
                  : "未启用"}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <strong className="flex items-center gap-1.5 text-sm">
                <StatusDot ok={state.scriptLoaded} warn={!state.scriptLoaded && state.enabled} />
                官方脚本
              </strong>
              <span className="text-sm text-default-500">
                {state.scriptLoaded
                  ? "公开页已加载官方脚本" + (state.scriptLoadedAt ? `（${new Date(state.scriptLoadedAt).toLocaleString("zh-CN")}）` : "")
                  : state.enabled
                    ? "还没有公开页加载过脚本，请先打开公开博客页"
                    : "未启用，不加载脚本"}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <strong className="flex items-center gap-1.5 text-sm">
                <StatusDot ok={state.eventSent} warn={!state.eventSent && state.scriptLoaded} />
                页面事件
              </strong>
              <span className="text-sm text-default-500">
                {state.eventSent
                  ? "已发送页面浏览事件" + (state.lastPath ? `（最近 ${state.lastPath}）` : "")
                  : state.enabled
                    ? "还没有发送过页面浏览事件"
                    : "未启用，不发送事件"}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <strong className="flex items-center gap-1.5 text-sm">
                <StatusDot warn={state.enabled} /> 服务商报表
              </strong>
              <span className="text-sm text-default-500">
                没有报表 API 授权，无法在此确认是否已收数。请前往服务商实时报告核对。
              </span>
            </div>
          </div>
        )}

        <Button
          as="a"
          href={meta.report}
          target="_blank"
          rel="noreferrer"
          variant="light"
          size="sm"
          className="self-start"
          endContent={<Icon icon="tabler:external-link" width={14} />}
        >
          打开服务商报表
        </Button>
      </CardBody>
    </Card>
  );
}

export function BlogTrackingSettings({
  data,
  patch,
}: {
  data: BlogSiteSettings;
  patch: (p: Partial<BlogSiteSettings>) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {VENDORS.map((v) => (
          <TrackingCard key={v.id} vendor={v.id} data={data} patch={patch} />
        ))}
      </div>

      <Card className="border border-default-200 bg-surface">
        <CardBody className="gap-4 p-5">
          <h3 className="text-base font-semibold text-foreground">采集范围</h3>
          <label className="flex items-center gap-2 text-sm">
            <BlogCheckbox toggle type="checkbox" checked readOnly disabled />
            <span>仅在公开博客加载</span>
          </label>
          <p className="text-sm text-default-500">
            仅统计对外公开的博客内容，管理后台、私有笔记不计入。这是固定约束，不提供关闭选项。
          </p>
          <label className="flex items-center gap-2 text-sm">
            <BlogCheckbox
              toggle
              type="checkbox"
              checked={data.excludeOwner}
              onChange={(e) => patch({ excludeOwner: e.target.checked })}
            />
            <span>排除管理者访问</span>
          </label>
          <p className="text-sm text-default-500">
            站内统计与第三方统计共用此规则。同一浏览器访问过博客管理页后，会使用本机标记跨标签页排除；本地预览地址默认不上报。
            独立博客域名不共享后台的浏览器存储，不能自动识别管理员；需要时在博客域将 <code className="rounded bg-default-100 px-1 py-0.5 text-xs">ink-blog-statistics</code> 设为 <code className="rounded bg-default-100 px-1 py-0.5 text-xs">off</code>。
          </p>
          <p className="text-sm text-default-500">
            切换文章时仅上报一次页面浏览；刷新页面恢复上一次页面访存，上报前会先丢弃过期访存。
            首次访问或从站外链接直接进入时视为一次新访问。
          </p>
          <p className="text-sm text-default-500">
            GA4 请在数据流中关闭「基于浏览器历史记录的自动网页浏览」，否则脚本会自动上报一次、
            与手动路由上报重复；本系统已用 <code className="rounded bg-default-100 px-1 py-0.5 text-xs">send_page_view: false</code> 关掉脚本自带的自动上报，
            但服务商后台的其它自动采集仍需自行确认。百度统计已用{" "}
            <code className="rounded bg-default-100 px-1 py-0.5 text-xs">_setAutoPageview false</code> 关掉自动上报。
          </p>
          <p className="text-sm text-default-500">
            脚本异步加载，不阻塞正文。停用后会移除脚本标签并停止后续路由事件；
            已经发往服务商的数据无法撤回，如需彻底停用请刷新公开博客页。
          </p>
        </CardBody>
      </Card>
    </>
  );
}
