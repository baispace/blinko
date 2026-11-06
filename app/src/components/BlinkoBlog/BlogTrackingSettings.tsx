import { BlogDisclosure, BlogInput, BlogTextarea, BlogToggle } from "./BlogUI";
import { Button, Card, CardBody, Switch } from "@heroui/react";
import { useEffect, useState } from "react";
import { api } from "@/lib/trpc";
import { Icon } from "@/components/Common/Iconify/icons";
import type { BlogSiteSettings } from "@shared/lib/blogSiteSettings";
import {
  extractTrackingId,
  type TrackingVendor,
} from "@shared/lib/blogTracking";

type Vendor = TrackingVendor;
type TrackingStateMap = Awaited<ReturnType<typeof api.blog.trackingState.query>>;
type TrackingState = TrackingStateMap[Vendor];

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
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`}
      aria-hidden="true"
    />
  );
}

function StatusRow({
  label,
  ok,
  warn,
  text,
}: {
  label: string;
  ok?: boolean;
  warn?: boolean;
  text: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-1.5">
        <StatusDot ok={ok} warn={warn} />
      </span>
      <span className="w-16 shrink-0 text-default-600">{label}</span>
      <span className="min-w-0 text-default-500">{text}</span>
    </div>
  );
}

function TrackingCard({
  vendor,
  data,
  patch,
  state,
}: {
  vendor: Vendor;
  data: BlogSiteSettings;
  patch: (p: Partial<BlogSiteSettings>) => void;
  state: TrackingState | null;
}) {
  const meta = VENDORS.find((v) => v.id === vendor)!;
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const enabled = vendor === "ga" ? data.gaEnabled : data.baiduEnabled;
  const id = vendor === "ga" ? data.gaId : data.baiduId;

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
    setNotice("已提取编号；保存后只加载官方脚本，粘贴的代码不会被执行或保存。");
  };

  return (
    <Card className="rounded-xl border border-default-200 bg-content1 shadow-none">
      <CardBody className="gap-3 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{meta.name}</h3>
            <p className="text-xs text-default-500">{meta.desc}</p>
          </div>
          <Switch
            size="sm"
            color="primary"
            isSelected={!!enabled}
            onValueChange={(v) =>
              patch(vendor === "ga" ? { gaEnabled: v } : { baiduEnabled: v })
            }
            aria-label={`启用${meta.name}`}
          >
            <span className="text-sm">启用</span>
          </Switch>
        </div>

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

        <BlogDisclosure title="从安装代码提取编号" titleClass="text-primary">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm">服务商安装代码</span>
            <BlogTextarea
              className="w-full"
              rows={4}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={meta.codePlaceholder}
            />
            <small className="text-xs text-default-400">
              仅提取站点编号，不执行或保存粘贴的代码。
            </small>
          </label>
          <Button size="sm" variant="flat" className="mt-2" onPress={extract}>
            提取编号
          </Button>
        </BlogDisclosure>

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

        <div className="flex flex-col gap-1.5 rounded-lg bg-default-50 px-3 py-2.5">
          {state ? (
            <>
              <StatusRow
                label="配置"
                ok={state.enabled && state.idValid}
                warn={state.enabled && !state.idValid}
                text={
                  state.enabled
                    ? state.idValid
                      ? "已启用且编号格式正确"
                      : "已启用，但编号格式不正确"
                    : "未启用"
                }
              />
              <StatusRow
                label="官方脚本"
                ok={state.scriptLoaded}
                warn={!state.scriptLoaded && state.enabled}
                text={
                  state.scriptLoaded
                    ? "公开页已加载" +
                      (state.scriptLoadedAt
                        ? `（${new Date(state.scriptLoadedAt).toLocaleString("zh-CN")}）`
                        : "")
                    : state.enabled
                      ? "还没有公开页加载过，请先打开公开博客页"
                      : "未启用，不加载脚本"
                }
              />
              <StatusRow
                label="页面事件"
                ok={state.eventSent}
                warn={!state.eventSent && state.scriptLoaded}
                text={
                  state.eventSent
                    ? "已发送页面浏览" + (state.lastPath ? `（最近 ${state.lastPath}）` : "")
                    : state.enabled
                      ? "还没有发送过页面浏览事件"
                      : "未启用，不发送事件"
                }
              />
              <p className="mt-0.5 text-xs text-default-400">
                是否已收数需前往服务商实时报告核对，此处无报表 API 授权。
              </p>
            </>
          ) : (
            <p className="text-sm text-default-400">正在读取已保存的配置状态…</p>
          )}
        </div>

        <Button
          as="a"
          href={meta.report}
          target="_blank"
          rel="noreferrer"
          variant="light"
          size="sm"
          color="primary"
          className="self-start px-1"
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
  const [states, setStates] = useState<TrackingStateMap | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");

  const detect = async () => {
    setChecking(true);
    setCheckError("");
    try {
      setStates(await api.blog.trackingState.query());
    } catch (e: any) {
      setCheckError(e?.message || "检测失败，请重试");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void detect();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {VENDORS.map((v) => (
          <TrackingCard
            key={v.id}
            vendor={v.id}
            data={data}
            patch={patch}
            state={states ? states[v.id] : null}
          />
        ))}
      </div>

      <Card className="rounded-xl border border-default-200 bg-content1 shadow-none">
        <CardBody className="gap-3 p-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold text-foreground">采集范围</h3>
            <Button
              size="sm"
              variant="flat"
              onPress={() => void detect()}
              isDisabled={checking}
              startContent={<Icon icon="tabler:refresh" width={15} />}
            >
              {checking ? "检测中…" : "重新检测"}
            </Button>
          </div>
          <p className="text-sm text-default-500">
            仅统计公开博客，管理后台与私有笔记始终不计入。上方状态为已保存配置的检测结果，修改后需保存才会生效。
          </p>
          {checkError && (
            <div className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger" role="alert">
              {checkError}
            </div>
          )}
          <BlogToggle
            label="排除管理者访问"
            checked={data.excludeOwner}
            onChange={(v) => patch({ excludeOwner: v })}
          />
          <BlogDisclosure title="统计口径与接入说明">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-default-500">
                站内统计与第三方统计共用此规则。同一浏览器访问过博客管理页后，会使用本机标记跨标签页排除；本地预览地址默认不上报。
                独立域名不共享后台标记。请从后台「查看公开站」进入，系统会在该域名保存本机排除偏好；也可以使用公开页页脚的「不统计本机访问」。此偏好仅对当前浏览器生效。
              </p>
              <p className="text-sm text-default-500">
                切换文章时仅上报一次页面浏览；刷新页面恢复上一次页面访存，上报前会先丢弃过期访存。
                首次访问或从站外链接直接进入时视为一次新访问。
              </p>
              <p className="text-sm text-default-500">
                GA4 请在数据流中关闭「基于浏览器历史记录的自动网页浏览」，否则脚本会自动上报一次、
                与手动路由上报重复；本系统已用{" "}
                <code className="rounded bg-default-100 px-1 py-0.5 text-xs">send_page_view: false</code>{" "}
                关掉脚本自带的自动上报，但服务商后台的其它自动采集仍需自行确认。百度统计已用{" "}
                <code className="rounded bg-default-100 px-1 py-0.5 text-xs">_setAutoPageview false</code>{" "}
                关掉自动上报。
              </p>
              <p className="text-sm text-default-500">
                脚本异步加载，不阻塞正文。停用后会移除脚本标签并停止后续路由事件；
                已经发往服务商的数据无法撤回，如需彻底停用请刷新公开博客页。
              </p>
            </div>
          </BlogDisclosure>
        </CardBody>
      </Card>
    </div>
  );
}