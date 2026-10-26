import { useRef, useState } from "react";
import axios from "@/lib/axios";
import { getBlinkoEndpoint } from "@/lib/blinkoEndpoint";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlogButton, BlogCheckbox, BlogInput, BlogTextarea } from "./BlogUI";
import type { BlogSubscribeSettings } from "@shared/lib/blogSiteSettings";

/**
 * 站点设置里的「订阅设置」。
 *
 * 管的是订阅页要用的东西：
 *   1) 微信公众号：开关 + 名称 + 二维码；
 *   2) RSS：开关 +（可选的）自定义订阅源；
 *   3) 「关于这里」的标题、介绍与内容方向；
 *   4) 订阅说明的三行文案。
 *
 * 不另开一个管理模块 —— 就在站点设置里加一个页签。
 *
 * RSS 地址默认由公开站点地址与真实订阅路由自动生成，作者不用手抄；
 * 只有想指向站外的源时才填自定义地址（下面会明确区分这两种模式）。
 */

const MAX_DIRECTIONS = 8;

export function BlogSubscribeSettings({
  subscribe,
  patch,
}: {
  subscribe: BlogSubscribeSettings;
  patch: (p: Partial<BlogSubscribeSettings>) => void;
}) {
  const data = subscribe;
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(f.type) || f.size > 5 * 1024 * 1024) {
      setError("二维码请选择 5MB 以内的常见图片格式");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await axios.post(getBlinkoEndpoint("/api/file/upload"), form);
      if (!res.data.filePath) throw new Error("上传失败");
      patch({ wechatQrUrl: res.data.filePath });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };

  const setNotes = (notes: BlogSubscribeSettings["notes"]) =>
    patch({ notes });

  const setDirections = (directions: string[]) =>
    patch({ directions });

  return (
    <div className="ink-admin-columns">
      <div className="ink-mg-panel ink-mg-section">
        <h3>微信公众号</h3>
        <label className="ink-admin-toggle">
          <BlogCheckbox
            type="checkbox"
            checked={data.wechatEnabled}
            onChange={(e) => patch({ wechatEnabled: e.target.checked })}
          />
          开放微信公众号订阅
        </label>
        <label className="ink-admin-field">
          <span>公众号名称</span>
          <BlogInput
            className="ink-mg-field"
            maxLength={80}
            placeholder="留空表示暂未开放"
            value={data.wechatName}
            onChange={(e) => patch({ wechatName: e.target.value })}
          />
          <small>读者扫二维码关注后，看到的就是这个名字。</small>
        </label>
        <div className="ink-admin-field">
          <span>公众号二维码</span>
          {data.wechatQrUrl ? (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <img
                src={data.wechatQrUrl}
                alt="公众号二维码预览"
                style={{
                  width: 88,
                  height: 88,
                  objectFit: "contain",
                  padding: 6,
                  borderRadius: 10,
                  background: "#fff",
                  border: "1px solid var(--ink-line)",
                }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <BlogButton
                  className="ink-mg-button"
                  disabled={busy}
                  onClick={() => file.current?.click()}
                >
                  {busy ? "上传中…" : "更换二维码"}
                </BlogButton>
                <BlogButton
                  className="ink-mg-button ink-mg-button-ghost"
                  disabled={busy}
                  onClick={() => patch({ wechatQrUrl: "" })}
                >
                  移除
                </BlogButton>
              </div>
            </div>
          ) : (
            <BlogButton
              className="ink-mg-button"
              disabled={busy}
              onClick={() => file.current?.click()}
            >
              {busy ? "上传中…" : "上传二维码"}
            </BlogButton>
          )}
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            style={{ display: "none" }}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
          <small>
            开关、名称与二维码三者齐了，公开页才会显示这个渠道；
            否则显示「暂未开放」，不给出点了没反应的按钮。
          </small>
        </div>
        {error && (
          <p className="ink-mg-alert" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="ink-mg-panel ink-mg-section">
        <h3>RSS 订阅</h3>
        <label className="ink-admin-toggle">
          <BlogCheckbox
            type="checkbox"
            checked={data.rssEnabled}
            onChange={(e) => patch({ rssEnabled: e.target.checked })}
          />
          在订阅页展示 RSS 渠道
        </label>
        <label className="ink-admin-field">
          <span>自定义订阅源（可选）</span>
          <BlogInput
            className="ink-mg-field"
            maxLength={1000}
            placeholder="留空 = 按公开站点地址自动生成"
            value={data.rssUrl}
            onChange={(e) => patch({ rssUrl: e.target.value })}
          />
          <small>
            留空时，订阅地址由公开站点地址与真实订阅路由自动生成，
            换域名不用回来改。只有想指向站外的源时才填 http(s) 地址。
          </small>
        </label>

        <h3>关于这里</h3>
        <label className="ink-admin-field">
          <span>主标题</span>
          <BlogInput
            className="ink-mg-field"
            maxLength={80}
            placeholder="留空则不显示主标题"
            value={data.introTitle}
            onChange={(e) => patch({ introTitle: e.target.value })}
          />
        </label>
        <label className="ink-admin-field">
          <span>站点介绍</span>
          <BlogTextarea
            className="ink-mg-field"
            minRows={3}
            maxLength={600}
            placeholder="留空则回落到「公开作者」里的站点说明"
            value={data.intro}
            onChange={(e) => patch({ intro: e.target.value })}
          />
        </label>
        <div className="ink-admin-field">
          <span>内容方向</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {data.directions.map((d, i) => (
              <span
                key={d + i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  height: 28,
                  padding: "0 6px 0 12px",
                  borderRadius: 999,
                  background: "var(--ink-tint)",
                  fontSize: 13,
                }}
              >
                {d}
                <button
                  type="button"
                  aria-label={`移除内容方向 ${d}`}
                  onClick={() =>
                    setDirections(data.directions.filter((_, k) => k !== i))
                  }
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    lineHeight: 1,
                    padding: 2,
                  }}
                >
                  <Icon icon="tabler:x" width={13} />
                </button>
              </span>
            ))}
          </div>
          <DirectionInput
            disabled={data.directions.length >= MAX_DIRECTIONS}
            onAdd={(value) => setDirections([...data.directions, value])}
          />
          <small>
            与已发布专题同名时，公开页会自动变成可跳转的入口；
            对不上就当普通标签展示。
          </small>
        </div>
      </div>

      <div className="ink-mg-panel ink-mg-section">
        <h3>订阅说明</h3>
        <p className="ink-mg-sub">
          订阅前你可能想知道的三件事。写实际状况，不要承诺定时更新、全量同步或即时推送 ——
          这些站点都没实现。删空则整块不显示。
        </p>
        {data.notes.map((n, i) => (
          <div
            key={i}
            className="ink-mg-section"
            style={{ gap: 8 }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <BlogInput
                className="ink-mg-field"
                style={{ width: 140, flex: "none" }}
                maxLength={20}
                placeholder="短标签"
                value={n.label}
                onChange={(e) =>
                  setNotes(
                    data.notes.map((row, k) =>
                      k === i ? { ...row, label: e.target.value } : row,
                    ),
                  )
                }
              />
              <BlogButton
                className="ink-mg-mini"
                aria-label="删除这条说明"
                onClick={() =>
                  setNotes(data.notes.filter((_, k) => k !== i))
                }
              >
                <Icon icon="tabler:x" width={14} />
              </BlogButton>
            </div>
            <BlogTextarea
              className="ink-mg-field"
              minRows={2}
              maxLength={200}
              placeholder="说明文字"
              value={n.text}
              onChange={(e) =>
                setNotes(
                  data.notes.map((row, k) =>
                    k === i ? { ...row, text: e.target.value } : row,
                  ),
                )
              }
            />
          </div>
        ))}
        <BlogButton
          className="ink-mg-button"
          disabled={data.notes.length >= 6}
          onClick={() =>
            setNotes([...data.notes, { label: "", text: "" }])
          }
        >
          ＋ 添加一条说明
        </BlogButton>
      </div>
    </div>
  );
}

/** 内容方向输入框：回车或点按钮就添加一项。 */
function DirectionInput({
  onAdd,
  disabled,
}: {
  onAdd: (value: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onAdd(v);
    setValue("");
  };
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <BlogInput
        className="ink-mg-field"
        maxLength={40}
        placeholder="例如：产品思考"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <BlogButton
        className="ink-mg-button"
        disabled={disabled || !value.trim()}
        onClick={submit}
      >
        添加
      </BlogButton>
    </div>
  );
}
