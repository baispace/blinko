import { BlogInput, BlogCheckbox, BlogTextarea } from "./BlogUI";
import { Card, CardBody, CardHeader } from "@heroui/react";
import {
  blogSiteSettingsSchema,
  type BlogFooterSettings,
} from "@shared/lib/blogSiteSettings";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY: BlogFooterSettings = blogSiteSettingsSchema.parse({}).footer;

function dateProblem(value: string) {
  const v = value.trim();
  if (!v) return "";
  if (!DATE_PATTERN.test(v)) return "日期格式应为 YYYY-MM-DD";
  const time = Date.parse(`${v}T00:00:00Z`);
  if (Number.isNaN(time)) return "日期无效";
  return "";
}

export function BlogFooterSettingsPanel({
  footer,
  patch,
}: {
  footer: BlogFooterSettings;
  patch: (p: Partial<BlogFooterSettings>) => void;
}) {
  const data = { ...EMPTY, ...footer };
  const promoData = { ...EMPTY.promo, ...data.promo };
  const setPromo = (p: Partial<BlogFooterSettings["promo"]>) =>
    patch({ promo: { ...promoData, ...p } });

  const startProblem = dateProblem(promoData.startAt);
  const endProblem = dateProblem(promoData.endAt);
  const rangeProblem =
    !startProblem && !endProblem && promoData.startAt && promoData.endAt
      ? promoData.startAt > promoData.endAt
        ? "结束日期不能早于开始日期"
        : ""
      : "";

  const now = new Date().getFullYear();
  const start = data.copyrightStart;
  const end = data.copyrightEnd || now;
  const years =
    start && end && start !== end ? `${start} – ${end}` : String(end || now);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* 备案信息 */}
      <Card className="rounded-xl border border-default-200 shadow-none">
        <CardHeader className="pb-1">
          <h3 className="text-base font-semibold">备案信息</h3>
        </CardHeader>
        <CardBody className="space-y-4 pt-0">
          <p className="text-xs text-default-500">
            国内站点需要在页脚挂备案号。留空的字段不会出现在公开页，
            不用删代码，也不用改版本。
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">ICP 备案号</span>
            <BlogInput
              className="w-full"
              maxLength={80}
              placeholder="例如：京ICP备19051325号-2"
              value={data.icp}
              onChange={(e) => patch({ icp: e.target.value })}
            />
            <small className="text-xs text-default-500">展示时会链接到工信部的备案查询。</small>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">公安备案号</span>
            <BlogInput
              className="w-full"
              maxLength={80}
              placeholder="例如：京公网安备 11011402054421号"
              value={data.police}
              onChange={(e) => patch({ police: e.target.value })}
            />
            <small className="text-xs text-default-500">展示时会链接到公安备案查询。</small>
          </label>
        </CardBody>
      </Card>

      {/* 版权署名 */}
      <Card className="rounded-xl border border-default-200 shadow-none">
        <CardHeader className="pb-1">
          <h3 className="text-base font-semibold">版权署名</h3>
        </CardHeader>
        <CardBody className="space-y-4 pt-0">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">署名主体</span>
            <BlogInput
              className="w-full"
              maxLength={80}
              placeholder="例如：张洪Heo"
              value={data.owner}
              onChange={(e) => patch({ owner: e.target.value })}
            />
            <small className="text-xs text-default-500">留空则只显示年份与站点名称。</small>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">起始年份</span>
            <BlogInput
              className="w-full"
              type="number"
              min={0}
              max={2100}
              placeholder={String(now)}
              value={data.copyrightStart || ""}
              onChange={(e) =>
                patch({ copyrightStart: Number(e.target.value) || 0 })
              }
            />
            <small className="text-xs text-default-500">0 表示不显示起始年。</small>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">结束年份</span>
            <BlogInput
              className="w-full"
              type="number"
              min={0}
              max={2100}
              placeholder={String(now)}
              value={data.copyrightEnd || ""}
              onChange={(e) => patch({ copyrightEnd: Number(e.target.value) || 0 })}
            />
            <small className="text-xs text-default-500">0 表示延续到当前年份。</small>
          </label>
        </CardBody>
      </Card>

      {/* 推广位 */}
      <Card className="rounded-xl border border-default-200 shadow-none lg:col-span-2">
        <CardHeader className="pb-1">
          <h3 className="text-base font-semibold">推广位</h3>
        </CardHeader>
        <CardBody className="space-y-4 pt-0">
          <label className="flex items-center gap-2 text-sm">
            <BlogCheckbox
              type="checkbox"
              checked={promoData.enabled}
              onChange={(e) => setPromo({ enabled: e.target.checked })}
            />
            在页脚展示推广信息
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">名称</span>
            <BlogInput
              className="w-full"
              maxLength={60}
              placeholder="例如：PowBay"
              value={promoData.title}
              onChange={(e) => setPromo({ title: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">文案</span>
            <BlogTextarea
              className="w-full"
              minRows={2}
              maxLength={200}
              placeholder="例如：新用户首月 5 折"
              value={promoData.text}
              onChange={(e) => setPromo({ text: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">落地页地址</span>
            <BlogInput
              className="w-full"
              maxLength={500}
              placeholder="https://"
              value={promoData.url}
              onChange={(e) => setPromo({ url: e.target.value })}
            />
            <small className="text-xs text-default-500">留空则只展示文字，不做成链接。</small>
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">开始日期</span>
              <BlogInput
                className="w-full"
                maxLength={20}
                placeholder="YYYY-MM-DD"
                value={promoData.startAt}
                onChange={(e) => setPromo({ startAt: e.target.value })}
              />
              <small className="text-xs text-default-500">留空表示立即生效。</small>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">结束日期</span>
              <BlogInput
                className="w-full"
                maxLength={20}
                placeholder="YYYY-MM-DD"
                value={promoData.endAt}
                onChange={(e) => setPromo({ endAt: e.target.value })}
              />
              <small className="text-xs text-default-500">留空表示长期有效。</small>
            </label>
          </div>
          {(startProblem || endProblem || rangeProblem) && (
            <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger" role="alert">
              {startProblem || endProblem || rangeProblem}
            </p>
          )}
          <p className="text-xs text-default-500">
            起止日期按站点时区判定。日期没填对时推广位只是不显示，不会影响其它站点设置。
          </p>
        </CardBody>
      </Card>

      {/* 预览 */}
      <Card className="rounded-xl border border-default-200 shadow-none lg:col-span-2">
        <CardHeader className="pb-1">
          <h3 className="text-base font-semibold">访客看到的页脚</h3>
        </CardHeader>
        <CardBody className="space-y-3 pt-0">
          <div className="rounded-lg border border-default-200 bg-default-50 p-4 text-sm">
            <div className="flex flex-wrap gap-3 text-xs text-default-500">
              {data.icp ? <span>{data.icp}</span> : null}
              {data.police ? <span>{data.police}</span> : null}
              {!data.icp && !data.police && (
                <small>还没有填备案号，页脚不显示这一行。</small>
              )}
            </div>
            <div className="mt-2 text-xs text-default-600">
              © {years}
              {data.owner ? ` ${data.owner}` : ""}
            </div>
            {promoData.enabled && (
              <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                {promoData.title ? <b className="text-sm">{promoData.title}</b> : null}
                {promoData.text ? <span className="ml-2 text-sm text-default-600">{promoData.text}</span> : null}
                {promoData.startAt || promoData.endAt ? (
                  <small className="mt-1 block text-xs text-default-500">
                    {promoData.startAt || "立即"} — {promoData.endAt || "长期"}
                  </small>
                ) : null}
              </div>
            )}
          </div>
          <small className="text-xs text-default-500">预览不代表已经生效 —— 保存后公开页才会按这份配置渲染。</small>
        </CardBody>
      </Card>
    </div>
  );
}
