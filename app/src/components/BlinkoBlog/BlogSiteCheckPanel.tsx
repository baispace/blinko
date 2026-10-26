import { BlogButton } from "./BlogUI";
import { useState } from "react";
import { api } from "@/lib/trpc";
import { Icon } from "@/components/Common/Iconify/icons";

/**
 * 站点检查。
 *
 * 检查结果全部来自服务端真实请求与数据库查询，四种状态：
 * 通过 / 警告 / 失败 / 当前环境无法验证。
 * 不做「延时后全绿」这种假检测，也不在拿不到证据时报成功。
 */

type Report = Awaited<ReturnType<typeof api.blog.siteCheck.mutate>>;

const STATE_META: Record<
  string,
  { label: string; className: string; icon: string }
> = {
  pass: { label: "通过", className: "ink-check-pass", icon: "tabler:circle-check" },
  warn: { label: "警告", className: "ink-check-warn", icon: "tabler:alert-triangle" },
  fail: { label: "失败", className: "ink-check-fail", icon: "tabler:circle-x" },
  manual: { label: "需手动验证", className: "ink-check-manual", icon: "tabler:help-circle" },
};

export function BlogSiteCheckPanel({
  target,
  effective,
}: {
  target: string;
  effective: string;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.blog.siteCheck.mutate({
        target: target || undefined,
        // 没配目标域名时，先检查当前这个站点。
        effective:
          effective ||
          (typeof location !== "undefined" ? location.origin : undefined),
      });
      setReport(r);
    } catch (e: any) {
      setError(e.message);
      setReport(null);
    } finally {
      setBusy(false);
    }
  };

  const counts = report
    ? report.items.reduce<Record<string, number>>((acc, item) => {
        acc[item.state] = (acc[item.state] || 0) + 1;
        return acc;
      }, {})
    : {};

  return (
    <div className="ink-mg-panel ink-mg-section">
      <div className="ink-mg-section-head">
        <div>
          <h3>上线检查</h3>
          <p className="ink-mg-sub">
            {report
              ? `目标 ${report.target} · ${new Date(report.checkedAt).toLocaleString("zh-CN")}`
              : "还没有运行过检查。检查会真的请求目标地址，失败的项目会给出原因和建议。"}
          </p>
        </div>
        <BlogButton
          className="ink-mg-button ink-mg-button-primary"
          disabled={busy}
          onClick={() => void run()}
        >
          <Icon icon="tabler:play" width={15} />
          {busy ? "检查中…" : report ? "重新运行检查" : "运行检查"}
        </BlogButton>
      </div>
      {report && (
        <p className="ink-mg-sub">
          检查目标：{report.target}；当前实际生效地址：{report.effective}
          {Object.entries(counts).map(([state, count]) => (
            <span key={state} className={`ink-check-chip ${STATE_META[state]?.className ?? ""}`}>
              {STATE_META[state]?.label ?? state} {count}
            </span>
          ))}
        </p>
      )}
      {error && (
        <p className="ink-mg-alert" role="alert">
          {error}
        </p>
      )}
      {!report ? (
        <p className="ink-mg-sub">
          DNS、证书与跨域需要在目标环境验证；服务端只检查自己够得着的部分。
        </p>
      ) : (
        <div className="ink-check-list">
          {report.items.map((item) => {
            const meta = STATE_META[item.state] ?? STATE_META.manual;
            return (
              <div key={item.id} className="ink-check-item">
                <div className="ink-check-item-head">
                  <Icon icon={meta.icon} width={16} />
                  <strong>{item.name}</strong>
                  <span className={`ink-check-badge ${meta.className}`}>
                    {meta.label}
                  </span>
                </div>
                <p className="ink-check-evidence">{item.evidence}</p>
                {item.suggestion && (
                  <p className="ink-check-suggestion">建议：{item.suggestion}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="ink-mg-sub">
        服务端请求成功不代表浏览器跨域配置正确；第三方统计是否真的收到数据，需要到服务商的实时报告人工确认。
      </p>
    </div>
  );
}
