import { useState } from "react";
import { Button, Card, CardBody, Chip } from "@heroui/react";
import { api } from "@/lib/trpc";
import { Icon } from "@/components/Common/Iconify/icons";

type Report = Awaited<ReturnType<typeof api.blog.siteCheck.mutate>>;

const STATE_META: Record<
  string,
  { label: string; color: "success" | "warning" | "danger" | "default"; icon: string }
> = {
  pass: { label: "通过", color: "success", icon: "tabler:circle-check" },
  warn: { label: "警告", color: "warning", icon: "tabler:alert-triangle" },
  fail: { label: "失败", color: "danger", icon: "tabler:circle-x" },
  manual: { label: "需手动验证", color: "default", icon: "tabler:help-circle" },
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
    <Card className="border border-default-200 bg-surface">
      <CardBody className="gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">上线检查</h3>
            <p className="mt-1 text-sm text-default-500">
              {report
                ? `目标 ${report.target} · ${new Date(report.checkedAt).toLocaleString("zh-CN")}`
                : "还没有运行过检查。检查会真的请求目标地址，失败的项目会给出原因和建议。"}
            </p>
          </div>
          <Button
            color="primary"
            size="sm"
            isDisabled={busy}
            onPress={() => void run()}
            startContent={<Icon icon="tabler:play" width={15} />}
          >
            {busy ? "检查中…" : report ? "重新运行检查" : "运行检查"}
          </Button>
        </div>

        {report && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-default-500">
            <span>检查目标：{report.target}；当前实际生效地址：{report.effective}</span>
            {Object.entries(counts).map(([state, count]) => {
              const meta = STATE_META[state] ?? STATE_META.manual;
              return (
                <Chip key={state} size="sm" color={meta.color as any} variant="flat">
                  {meta.label} {count}
                </Chip>
              );
            })}
          </p>
        )}

        {error && (
          <div className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        )}

        {!report ? (
          <p className="text-sm text-default-500">
            DNS、证书与跨域需要在目标环境验证；服务端只检查自己够得着的部分。
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {report.items.map((item) => {
              const meta = STATE_META[item.state] ?? STATE_META.manual;
              return (
                <div key={item.id} className="rounded-lg border border-default-200 p-3">
                  <div className="flex items-center gap-2">
                    <Icon icon={meta.icon} width={16} className={
                      meta.color === "success" ? "text-success" :
                      meta.color === "warning" ? "text-warning" :
                      meta.color === "danger" ? "text-danger" : "text-default-400"
                    } />
                    <strong className="text-sm">{item.name}</strong>
                    <Chip size="sm" color={meta.color as any} variant="flat">
                      {meta.label}
                    </Chip>
                  </div>
                  <p className="mt-1.5 text-sm text-default-500">{item.evidence}</p>
                  {item.suggestion && (
                    <p className="mt-1 text-sm text-default-600">建议：{item.suggestion}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-sm text-default-500">
          服务端请求成功不代表浏览器跨域配置正确；第三方统计是否真的收到数据，需要到服务商的实时报告人工确认。
        </p>
      </CardBody>
    </Card>
  );
}
