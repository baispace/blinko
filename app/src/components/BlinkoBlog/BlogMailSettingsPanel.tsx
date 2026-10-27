import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Common/Iconify/icons";
import { api } from "@/lib/trpc";
import { BlogButton, BlogCheckbox, BlogInput } from "./BlogUI";
import type { BlogMailSettingsView } from "@shared/lib/blogMailSettings";

/**
 * 博客后台的「邮件服务」分区。
 *
 * 邮件服务只做两件事：给友链申请的结果发通知、给订阅了回复通知的读者发回复。
 * 没有它，这两件事都做不了 —— 所以这里必须让作者看得见「现在能不能发信」。
 *
 * 三条硬规矩：
 *   1. 密码只写不读 —— 读回来只有「是否已设置」；
 *   2. 当前生效来源如实显示（后台配置 / 环境变量 / 未配置），不替用户猜；
 *   3. 测试邮件发出去是什么样就显示什么样，失败就把服务器给的原话摆出来。
 */

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
  /** 只在本次编辑里出现：留空 = 沿用已保存的密码。 */
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
      // 保存后来源可能变了（后台配置从「没填全」变成「已生效」）—— 重新读一次状态。
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
    <div className="ink-admin-columns">
      <div className="ink-mg-panel ink-mg-section">
        <div className="ink-mg-section-head">
          <div>
            <h3 className="ink-mg-section-title">SMTP 配置</h3>
            <p className="ink-mg-sub">
              友链申请通知与读者回复通知都走这里。没配置时这两件事都做不了，
              公开页会如实写「尚未配置邮件服务」。
            </p>
          </div>
        </div>

        {error && (
          <p className="ink-mg-alert" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="ink-mg-note" role="status">
            {message}
          </p>
        )}

        <label className="ink-admin-field">
          <span>SMTP 服务器</span>
          <BlogInput
            className="ink-mg-field"
            value={draft.host}
            placeholder="例如 smtp.exmail.qq.com"
            onChange={(e) => patch({ host: e.target.value })}
          />
          <small>邮箱服务商的 SMTP 主机名。</small>
        </label>

        <div className="ink-mg-grid-2">
          <label className="ink-admin-field">
            <span>端口</span>
            <BlogInput
              className="ink-mg-field"
              type="number"
              min={1}
              max={65535}
              value={String(draft.port)}
              onChange={(e) => patch({ port: Number(e.target.value) })}
            />
            <small>465 走直接 TLS，587 走 STARTTLS。</small>
          </label>
          <label className="ink-admin-field">
            <span>加密方式</span>
            <span className="ink-admin-toggle">
              <BlogCheckbox
                type="checkbox"
                checked={draft.secure}
                onChange={(e) => patch({ secure: e.target.checked })}
              />
              直接 TLS（{draft.secure ? "已开启" : "已关闭"}）
            </span>
            <small>
              关闭后先明文连接，服务器支持时自动升级 STARTTLS —— 账号密码不会裸奔。
            </small>
          </label>
        </div>

        <label className="ink-admin-field">
          <span>发件人地址</span>
          <BlogInput
            className="ink-mg-field"
            value={draft.from}
            placeholder="blog@example.com"
            onChange={(e) => patch({ from: e.target.value })}
          />
          <small>通知邮件的落款地址，读者能看到。</small>
        </label>

        <label className="ink-admin-field">
          <span>登录账号</span>
          <BlogInput
            className="ink-mg-field"
            value={draft.user}
            placeholder="多数邮箱服务商要求填完整邮箱地址"
            onChange={(e) => patch({ user: e.target.value })}
          />
          <small>不需要认证的服务器可以留空。</small>
        </label>

        <label className="ink-admin-field">
          <span>密码 / 授权码</span>
          <BlogInput
            className="ink-mg-field"
            type="password"
            value={draft.pass}
            placeholder={view?.hasPass ? "已设置 · 留空表示不修改" : "尚未设置"}
            onChange={(e) => patch({ pass: e.target.value })}
          />
          <small>
            密码只保存不显示。邮箱服务商要的通常是「授权码」而不是登录密码。
          </small>
        </label>

        {view?.hasPass && !draft.clearPass ? (
          <div>
            <BlogButton
              className="ink-mg-button ink-mg-button-ghost"
              onClick={() => patch({ clearPass: true, pass: "" })}
            >
              清除已保存的密码
            </BlogButton>
          </div>
        ) : null}
        {draft.clearPass ? (
          <p className="ink-mg-note">
            保存后会清空已保存的密码。
            <button
              type="button"
              className="ink-mg-button-ghost"
              onClick={() => patch({ clearPass: false })}
            >
              撤销
            </button>
          </p>
        ) : null}

        <div className="ink-admin-footer">
          <span>{dirty ? "有未保存修改" : "设置已同步"}</span>
          <div className="ink-mg-row-actions">
            <BlogButton className="ink-mg-button" disabled={busy} onClick={() => void load()}>
              重新载入
            </BlogButton>
            <BlogButton
              className="ink-mg-button ink-mg-button-primary"
              disabled={!revision || !dirty || busy}
              onClick={() => void save()}
            >
              {busy ? "保存中…" : "保存邮件服务设置"}
            </BlogButton>
          </div>
        </div>
      </div>

      <div className="ink-mg-panel">
        <h3 className="ink-mg-section-title">当前状态</h3>
        <p className="ink-mg-sub">
          生效来源：
          <strong>{source === "none" ? "未配置" : SOURCE_LABEL[source]}</strong>
        </p>
        {source === "none" ? (
          <div className="ink-mg-alert" role="note">
            <Icon icon="tabler:alert-circle" width={16} />
            <span>
              邮件服务还没配置。友链审核通知与读者回复通知都发不出去，
              公开页会如实告诉读者「暂时无法开通回复通知」。
            </span>
          </div>
        ) : (
          <p className="ink-mg-sub">
            {source === "env"
              ? "当前用的是服务端环境变量里的 BLOG_SMTP_* 配置。在下面填完整后以后台配置为准。"
              : "当前用的是这里保存的后台配置。"}
          </p>
        )}

        <h3 className="ink-mg-section-title">发送测试邮件</h3>
        <p className="ink-mg-sub">
          发一封真实的信到指定地址，确认握手、认证、投递都通。
        </p>
        <label className="ink-admin-field">
          <span>收件地址</span>
          <BlogInput
            className="ink-mg-field"
            type="email"
            value={testTo}
            placeholder="you@example.com"
            onChange={(e) => setTestTo(e.target.value)}
          />
        </label>
        <BlogButton
          className="ink-mg-button"
          disabled={testing}
          onClick={() => void sendTest()}
        >
          {testing ? "发送中…" : "发送测试邮件"}
        </BlogButton>
        {testResult ? (
          <p
            className={testResult.status === "sent" ? "ink-mg-note" : "ink-mg-alert"}
            role="status"
            style={{ marginTop: 12 }}
          >
            {testResult.status === "sent" ? "已发送：" : "未发送成功："}{" "}
            {testResult.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
