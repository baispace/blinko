import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Common/Iconify/icons";
import { api } from "@/lib/trpc";
import { Button, Card, CardBody, Chip } from "@heroui/react";
import { BlogCheckbox, BlogInput } from "./BlogUI";
import type { BlogMailSettingsView } from "@shared/lib/blogMailSettings";

type MailSource = "settings" | "env" | "none";

const SOURCE_LABEL: Record<MailSource, string> = {
  settings: "后台配置",
  env: "服务端环境变量",
  none: "未配置",
};

type Draft = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  pass: string;
  clearPass: boolean;
};

const emptyDraft: Draft = {
  host: "",
  port: 465,
  secure: true,
  user: "",
  from: "",
  pass: "",
  clearPass: false,
};

function toDraft(view: BlogMailSettingsView): Draft {
  return {
    host: view.host,
    port: view.port,
    secure: view.secure,
    user: view.user,
    from: view.from,
    pass: "",
    clearPass: false,
  };
}

export function BlogMailSettingsPanel({ onDirty }: { onDirty?: (dirty: boolean) => void }) {
  const [view, setView] = useState<BlogMailSettingsView | null>(null);
  const [source, setSource] = useState<MailSource>("none");
  const [revision, setRevision] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saved, setSaved] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState<{ status: string; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await api.blog.mailSettings.query();
      const next = toDraft(r.data);
      setView(r.data);
      setSource(r.source);
      setRevision(r.revision);
      setDraft(next);
      setSaved(next);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);

  const patch = (p: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...p }));
    setMessage("");
  };

  const save = async () => {
    if (!draft.host.trim() || !draft.from.trim()) {
      setError("请填写 SMTP 服务器地址与发件人地址。");
      return;
    }
    if (!Number.isInteger(draft.port) || draft.port < 1 || draft.port > 65535) {
      setError("端口请填 1 到 65535 之间的整数。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await api.blog.saveMailSettings.mutate({
        data: {
          host: draft.host,
          port: draft.port,
          secure: draft.secure,
          user: draft.user,
          from: draft.from,
          pass: draft.pass ? draft.pass : undefined,
          clearPass: draft.clearPass || undefined,
        },
        revision,
      });
      const next = toDraft(r.data);
      setView(r.data);
      setRevision(r.revision);
      setDraft(next);
      setSaved(next);
      setMessage("邮件服务设置已保存。");
      const status = await api.blog.mailSettings.query();
      setSource(status.source);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    const to = testTo.trim();
    if (!to) {
      setTestResult({ status: "failed", message: "请填写测试邮件的收件地址。" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.blog.testMail.mutate({ to });
      setTestResult({ status: r.status, message: r.message });
    } catch (e: any) {
      setTestResult({ status: "failed", message: e.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="border border-default-200 bg-surface">
        <CardBody className="gap-4 p-5">
          <div>
            <h3 className="text-base font-semibold text-foreground">SMTP 配置</h3>
            <p className="mt-1 text-sm text-default-500">
              友链申请通知与读者回复通知都走这里。没配置时这两件事都做不了，公开页会如实写「尚未配置邮件服务」。
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary" role="status">
              {message}
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-sm">SMTP 服务器</span>
            <BlogInput
              className="w-full"
              value={draft.host}
              placeholder="例如 smtp.exmail.qq.com"
              onChange={(e) => patch({ host: e.target.value })}
            />
            <small className="text-xs text-default-400">邮箱服务商的 SMTP 主机名。</small>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm">端口</span>
              <BlogInput
                className="w-full"
                type="number"
                min={1}
                max={65535}
                value={String(draft.port)}
                onChange={(e) => patch({ port: Number(e.target.value) })}
              />
              <small className="text-xs text-default-400">465 走直接 TLS，587 走 STARTTLS。</small>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm">加密方式</span>
              <span className="flex items-center gap-2 text-sm">
                <BlogCheckbox
                  type="checkbox"
                  checked={draft.secure}
                  onChange={(e) => patch({ secure: e.target.checked })}
                />
                直接 TLS（{draft.secure ? "已开启" : "已关闭"}）
              </span>
              <small className="text-xs text-default-400">
                关闭后先明文连接，服务器支持时自动升级 STARTTLS —— 账号密码不会裸奔。
              </small>
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm">发件人地址</span>
            <BlogInput
              className="w-full"
              value={draft.from}
              placeholder="blog@example.com"
              onChange={(e) => patch({ from: e.target.value })}
            />
            <small className="text-xs text-default-400">通知邮件的落款地址，读者能看到。</small>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm">登录账号</span>
            <BlogInput
              className="w-full"
              value={draft.user}
              placeholder="多数邮箱服务商要求填完整邮箱地址"
              onChange={(e) => patch({ user: e.target.value })}
            />
            <small className="text-xs text-default-400">不需要认证的服务器可以留空。</small>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm">密码 / 授权码</span>
            <BlogInput
              className="w-full"
              type="password"
              value={draft.pass}
              placeholder={view?.hasPass ? "已设置 · 留空表示不修改" : "尚未设置"}
              onChange={(e) => patch({ pass: e.target.value })}
            />
            <small className="text-xs text-default-400">
              密码只保存不显示。邮箱服务商要的通常是「授权码」而不是登录密码。
            </small>
          </label>

          {view?.hasPass && !draft.clearPass ? (
            <div>
              <Button size="sm" variant="light" onPress={() => patch({ clearPass: true, pass: "" })}>
                清除已保存的密码
              </Button>
            </div>
          ) : null}
          {draft.clearPass ? (
            <p className="flex items-center gap-2 text-sm text-default-500">
              保存后会清空已保存的密码。
              <Button size="sm" variant="light" onPress={() => patch({ clearPass: false })}>
                撤销
              </Button>
            </p>
          ) : null}

          <div className="flex items-center justify-between border-t border-default-200 pt-4">
            <span className="text-sm text-default-500">{dirty ? "有未保存修改" : "设置已同步"}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="flat" isDisabled={busy} onPress={() => void load()}>
                重新载入
              </Button>
              <Button
                size="sm"
                color="primary"
                isDisabled={!revision || !dirty || busy}
                onPress={() => void save()}
              >
                {busy ? "保存中…" : "保存邮件服务设置"}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="h-fit border border-default-200 bg-surface">
        <CardBody className="gap-4 p-5">
          <div>
            <h3 className="text-base font-semibold text-foreground">当前状态</h3>
            <p className="mt-1 text-sm text-default-500">
              生效来源：<strong>{source === "none" ? "未配置" : SOURCE_LABEL[source]}</strong>
            </p>
          </div>
          {source === "none" ? (
            <div className="flex items-start gap-2 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger" role="note">
              <Icon icon="tabler:alert-circle" width={16} className="mt-0.5 shrink-0" />
              <span>
                邮件服务还没配置。友链审核通知与读者回复通知都发不出去，公开页会如实告诉读者「暂时无法开通回复通知」。
              </span>
            </div>
          ) : (
            <p className="text-sm text-default-500">
              {source === "env"
                ? "当前用的是服务端环境变量里的 BLOG_SMTP_* 配置。在下面填完整后以后台配置为准。"
                : "当前用的是这里保存的后台配置。"}
            </p>
          )}

          <div>
            <h3 className="text-base font-semibold text-foreground">发送测试邮件</h3>
            <p className="mt-1 text-sm text-default-500">
              发一封真实的信到指定地址，确认握手、认证、投递都通。
            </p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm">收件地址</span>
            <BlogInput
              className="w-full"
              type="email"
              value={testTo}
              placeholder="you@example.com"
              onChange={(e) => setTestTo(e.target.value)}
            />
          </label>
          <Button size="sm" isDisabled={testing} onPress={() => void sendTest()}>
            {testing ? "发送中…" : "发送测试邮件"}
          </Button>
          {testResult ? (
            <div
              className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                testResult.status === "sent"
                  ? "bg-primary-50 text-primary"
                  : "bg-danger-50 text-danger"
              }`}
              role="status"
            >
              {testResult.status === "sent" ? "已发送：" : "未发送成功："}{" "}
              {testResult.message}
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
