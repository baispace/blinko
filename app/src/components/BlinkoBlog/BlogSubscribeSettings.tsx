import { useRef, useState } from "react";
import axios from "@/lib/axios";
import { getBlinkoEndpoint } from "@/lib/blinkoEndpoint";
import { Icon } from "@/components/Common/Iconify/icons";
import { Button, Card, CardBody, Chip } from "@heroui/react";
import { BlogCheckbox, BlogInput, BlogTextarea } from "./BlogUI";
import type { BlogSubscribeSettings } from "@shared/lib/blogSiteSettings";

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
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="border border-default-200 bg-surface">
        <CardBody className="gap-4 p-5">
          <h3 className="text-base font-semibold text-foreground">微信公众号</h3>
          <label className="flex items-center gap-2 text-sm">
            <BlogCheckbox
              type="checkbox"
              checked={data.wechatEnabled}
              onChange={(e) => patch({ wechatEnabled: e.target.checked })}
            />
            <span>开放微信公众号订阅</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm">公众号名称</span>
            <BlogInput
              className="w-full"
              maxLength={80}
              placeholder="留空表示暂未开放"
              value={data.wechatName}
              onChange={(e) => patch({ wechatName: e.target.value })}
            />
            <small className="text-xs text-default-400">读者扫二维码关注后，看到的就是这个名字。</small>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm">公众号二维码</span>
            {data.wechatQrUrl ? (
              <div className="flex items-center gap-3">
                <img
                  src={data.wechatQrUrl}
                  alt="公众号二维码预览"
                  className="h-[88px] w-[88px] rounded-[10px] border border-default-200 bg-white object-contain p-1.5"
                />
                <div className="flex flex-col gap-2">
                  <Button size="sm" isDisabled={busy} onPress={() => file.current?.click()}>
                    {busy ? "上传中…" : "更换二维码"}
                  </Button>
                  <Button size="sm" variant="light" isDisabled={busy} onPress={() => patch({ wechatQrUrl: "" })}>
                    移除
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" isDisabled={busy} onPress={() => file.current?.click()}>
                {busy ? "上传中…" : "上传二维码"}
              </Button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              className="hidden"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            <small className="text-xs text-default-400">
              开关、名称与二维码三者齐了，公开页才会显示这个渠道；否则显示「暂未开放」，不给出点了没反应的按钮。
            </small>
          </div>
          {error && (
            <div className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="border border-default-200 bg-surface">
        <CardBody className="gap-4 p-5">
          <h3 className="text-base font-semibold text-foreground">RSS 订阅</h3>
          <label className="flex items-center gap-2 text-sm">
            <BlogCheckbox
              type="checkbox"
              checked={data.rssEnabled}
              onChange={(e) => patch({ rssEnabled: e.target.checked })}
            />
            <span>在订阅页展示 RSS 渠道</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm">自定义订阅源（可选）</span>
            <BlogInput
              className="w-full"
              maxLength={1000}
              placeholder="留空 = 按公开站点地址自动生成"
              value={data.rssUrl}
              onChange={(e) => patch({ rssUrl: e.target.value })}
            />
            <small className="text-xs text-default-400">
              留空时，订阅地址由公开站点地址与真实订阅路由自动生成，换域名不用回来改。只有想指向站外的源时才填 http(s) 地址。
            </small>
          </label>

          <h3 className="text-base font-semibold text-foreground">关于这里</h3>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm">主标题</span>
            <BlogInput
              className="w-full"
              maxLength={80}
              placeholder="留空则不显示主标题"
              value={data.introTitle}
              onChange={(e) => patch({ introTitle: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm">站点介绍</span>
            <BlogTextarea
              className="w-full"
              minRows={3}
              maxLength={600}
              placeholder="留空则回落到「公开作者」里的站点说明"
              value={data.intro}
              onChange={(e) => patch({ intro: e.target.value })}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm">内容方向</span>
            <div className="flex flex-wrap gap-2">
              {data.directions.map((d, i) => (
                <Chip
                  key={d + i}
                  size="sm"
                  variant="flat"
                  onClose={() => setDirections(data.directions.filter((_, k) => k !== i))}
                >
                  {d}
                </Chip>
              ))}
            </div>
            <DirectionInput
              disabled={data.directions.length >= MAX_DIRECTIONS}
              onAdd={(value) => setDirections([...data.directions, value])}
            />
            <small className="text-xs text-default-400">
              与已发布专题同名时，公开页会自动变成可跳转的入口；对不上就当普通标签展示。
            </small>
          </div>
        </CardBody>
      </Card>

      <Card className="border border-default-200 bg-surface lg:col-span-2">
        <CardBody className="gap-4 p-5">
          <h3 className="text-base font-semibold text-foreground">订阅说明</h3>
          <p className="text-sm text-default-500">
            订阅前你可能想知道的三件事。写实际状况，不要承诺定时更新、全量同步或即时推送 ——
            这些站点都没实现。删空则整块不显示。
          </p>
          {data.notes.map((n, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <BlogInput
                  className="w-[140px] shrink-0"
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
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  aria-label="删除这条说明"
                  onPress={() => setNotes(data.notes.filter((_, k) => k !== i))}
                >
                  <Icon icon="tabler:x" width={14} />
                </Button>
              </div>
              <BlogTextarea
                className="w-full"
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
          <Button
            size="sm"
            variant="flat"
            isDisabled={data.notes.length >= 6}
            onPress={() => setNotes([...data.notes, { label: "", text: "" }])}
          >
            ＋ 添加一条说明
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

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
    <div className="mt-2 flex gap-2">
      <BlogInput
        className="flex-1"
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
      <Button size="sm" isDisabled={disabled || !value.trim()} onPress={submit}>
        添加
      </Button>
    </div>
  );
}
