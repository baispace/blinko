import { BlogCheckbox, BlogButton, BlogInput, BlogTabs, BlogTextarea } from "./BlogUI";
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

/**
 * 从服务商安装代码里提取编号。
 *
 * 实现在 shared/lib/blogTracking.ts —— 前端提取、后端校验共用同一份规则，
 * 不会出现「前端提取得出、后端说格式不对」。
 */
export { extractTrackingId };

function StatusDot({ ok, warn }: { ok?: boolean; warn?: boolean }) {
  return (
    <span
      className="ink-track-dot"
      data-state={ok ? "ok" : warn ? "warn" : "idle"}
      aria-hidden="true"
    />
  );
}

/**
 * 第三方统计接入。
 *
 * 四件事分开显示，不混成一个「已接入」：
 *   1. 配置是否有效（启用 + 编号格式）
 *   2. 官方脚本是否真的加载了（公开页上报）
 *   3. 页面事件是否已尝试发送（公开页上报）
 *   4. 服务商报表是否收到数据 —— 没有报表 API 授权就证不了，只能提示去
 *      服务商实时报告人工确认。
 */
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
      // 提取失败保留用户输入，并说明原因。
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
    <div className="ink-mg-panel ink-mg-section ink-track-card">
      <div className="ink-mg-section-head">
        <div>
          <h3 className="ink-mg-section-title">{meta.name}</h3>
          <p className="ink-mg-sub">{meta.desc}</p>
        </div>
        <label className="ink-mg-toggle">
          <BlogCheckbox toggle
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
          <span className="ink-mg-toggle-track" />
          <span style={{ fontSize: 13 }}>启用</span>
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
        <label className="ink-admin-field">
          <span>{meta.idLabel}</span>
          <BlogInput
            className="ink-mg-field"
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
          <small>
            {vendor === "ga"
              ? "填写 G- 开头的衡量 ID，系统自动加载官方统计脚本。"
              : "填写 32 位小写十六进制的站点 ID，系统自动加载官方统计脚本。"}
          </small>
        </label>
      ) : (
        <label className="ink-admin-field">
          <span>服务商安装代码</span>
          <BlogTextarea
            className="ink-mg-field"
            rows={5}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={meta.codePlaceholder}
          />
          <small>保存时提取官方站点编号，不执行任意第三方脚本。</small>
        </label>
      )}

      {tab === "code" && (
        <div className="ink-mg-row-actions" style={{ marginLeft: 0 }}>
          <BlogButton className="ink-mg-button" onClick={extract}>
            提取编号
          </BlogButton>
        </div>
      )}

      {error && (
        <p className="ink-mg-alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="ink-mg-note" role="status">
          {notice}
        </p>
      )}

      <div className="ink-mg-row-actions" style={{ marginLeft: 0 }}>
        <BlogButton
          className="ink-mg-button"
          onClick={() => void detect()}
          disabled={checking}
        >
          <Icon icon="tabler:refresh" width={15} />
          {checking ? "检测中…" : "检测接入"}
        </BlogButton>
        {checked && state && (
          <span className="ink-mg-sub">
            {state.enabled
              ? state.idValid
                ? "配置有效"
                : "编号格式不正确"
              : "未启用"}
          </span>
        )}
      </div>

      {checked && state && (
        <div className="ink-track-status">
          <div className="ink-admin-check">
            <strong>
              <StatusDot ok={state.enabled && state.idValid} /> 配置
            </strong>
            <span>
              {state.enabled
                ? state.idValid
                  ? "已启用且编号格式正确"
                  : "已启用，但编号格式不正确"
                : "未启用"}
            </span>
          </div>
          <div className="ink-admin-check">
            <strong>
              <StatusDot ok={state.scriptLoaded} warn={!state.scriptLoaded && state.enabled} />
              官方脚本
            </strong>
            <span>
              {state.scriptLoaded
                ? "公开页已加载官方脚本" + (state.scriptLoadedAt ? `（${new Date(state.scriptLoadedAt).toLocaleString("zh-CN")}）` : "")
                : state.enabled
                  ? "还没有公开页加载过脚本，请先打开公开博客页"
                  : "未启用，不加载脚本"}
            </span>
          </div>
          <div className="ink-admin-check">
            <strong>
              <StatusDot ok={state.eventSent} warn={!state.eventSent && state.scriptLoaded} />
              页面事件
            </strong>
            <span>
              {state.eventSent
                ? "已发送页面浏览事件" + (state.lastPath ? `（最近 ${state.lastPath}）` : "")
                : state.enabled
                  ? "还没有发送过页面浏览事件"
                  : "未启用，不发送事件"}
            </span>
          </div>
          <div className="ink-admin-check">
            <strong>
              <StatusDot warn={state.enabled} /> 服务商报表
            </strong>
            <span>
              没有报表 API 授权，无法在此确认是否已收数。请前往服务商实时报告核对。
            </span>
          </div>
        </div>
      )}

      <a
        className="ink-mg-button ink-mg-button-ghost"
        style={{ alignSelf: "flex-start" }}
        href={meta.report}
        target="_blank"
        rel="noreferrer"
      >
        打开服务商报表 <Icon icon="tabler:external-link" width={14} />
      </a>
    </div>
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
      <div className="ink-admin-columns">
        {VENDORS.map((v) => (
          <TrackingCard key={v.id} vendor={v.id} data={data} patch={patch} />
        ))}
      </div>

      <div className="ink-mg-panel">
        <h3 className="ink-mg-section-title">采集范围</h3>
        <label className="ink-mg-toggle">
          <BlogCheckbox toggle type="checkbox" checked readOnly disabled />
          <span className="ink-mg-toggle-track" />
          <span style={{ fontSize: 13 }}>仅在公开博客加载</span>
        </label>
        <p className="ink-mg-sub">
          仅统计对外公开的博客内容，管理后台、私有笔记不计入。这是固定约束，不提供关闭选项。
        </p>
        <label className="ink-mg-toggle">
          <BlogCheckbox toggle
            type="checkbox"
            checked={data.excludeOwner}
            onChange={(e) => patch({ excludeOwner: e.target.checked })}
          />
          <span className="ink-mg-toggle-track" />
          <span style={{ fontSize: 13 }}>排除管理者访问</span>
        </label>
        <p className="ink-mg-sub">
          站内统计与第三方统计共用此规则。同一浏览器访问过博客管理页后，会使用本机标记跨标签页排除；本地预览地址默认不上报。
          独立博客域名不共享后台的浏览器存储，不能自动识别管理员；需要时在博客域将 <code>ink-blog-statistics</code> 设为 <code>off</code>。
        </p>
        <p className="ink-mg-sub">
          切换文章时仅上报一次页面浏览；刷新页面恢复上一次页面访存，上报前会先丢弃过期访存。
          首次访问或从站外链接直接进入时视为一次新访问。
        </p>
        <p className="ink-mg-sub">
          GA4 请在数据流中关闭「基于浏览器历史记录的自动网页浏览」，否则脚本会自动上报一次、
          与手动路由上报重复；本系统已用 <code>send_page_view: false</code> 关掉脚本自带的自动上报，
          但服务商后台的其它自动采集仍需自行确认。百度统计已用{" "}
          <code>_setAutoPageview false</code> 关掉自动上报。
        </p>
        <p className="ink-mg-sub">
          脚本异步加载，不阻塞正文。停用后会移除脚本标签并停止后续路由事件；
          已经发往服务商的数据无法撤回，如需彻底停用请刷新公开博客页。
        </p>
      </div>
    </>
  );
}
