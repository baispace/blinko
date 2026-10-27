import { BlogInput, BlogCheckbox, BlogTextarea } from "./BlogUI";
import {
  blogSiteSettingsSchema,
  type BlogFooterSettings,
} from "@shared/lib/blogSiteSettings";

/**
 * 站点设置里的「页脚与备案」。
 *
 * 页脚是访客唯一能看到的「站点身份证明」：备案号挂在上面是硬性要求，
 * 版权署名与推广位也是站长自己维护的东西。
 *
 * 全部做成配置而不是写死在代码里 —— 每个部署的备案号、主体名、推广位
 * 都不一样，写死等于逼着每个站点改一次源码。
 *
 * 推广位带生效区间：到期自动隐藏，不靠人工记得撤。
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 兜底结构：服务端还是旧版本、配置里没有页脚字段时，页面照样能用。 */
const EMPTY: BlogFooterSettings = blogSiteSettingsSchema.parse({}).footer;

/** 校验一个日期字段：空串合法（表示不限制），其余必须是 YYYY-MM-DD。 */
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
  // 服务端可能还没带上页脚字段（部署不同步），别让整页崩掉。
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

  // 预览里的年份：结束年份留空时按当前年算，与公开页同一套规则。
  const now = new Date().getFullYear();
  const start = data.copyrightStart;
  const end = data.copyrightEnd || now;
  const years =
    start && end && start !== end ? `${start} – ${end}` : String(end || now);

  return (
    <div className="ink-admin-columns">
      <div className="ink-mg-panel ink-mg-section">
        <h3>备案信息</h3>
        <p className="ink-mg-sub">
          国内站点需要在页脚挂备案号。留空的字段不会出现在公开页，
          不用删代码，也不用改版本。
        </p>
        <label className="ink-admin-field">
          <span>ICP 备案号</span>
          <BlogInput
            className="ink-mg-field"
            maxLength={80}
            placeholder="例如：京ICP备19051325号-2"
            value={data.icp}
            onChange={(e) => patch({ icp: e.target.value })}
          />
          <small>展示时会链接到工信部的备案查询。</small>
        </label>
        <label className="ink-admin-field">
          <span>公安备案号</span>
          <BlogInput
            className="ink-mg-field"
            maxLength={80}
            placeholder="例如：京公网安备 11011402054421号"
            value={data.police}
            onChange={(e) => patch({ police: e.target.value })}
          />
          <small>展示时会链接到公安备案查询。</small>
        </label>
      </div>

      <div className="ink-mg-panel ink-mg-section">
        <h3>版权署名</h3>
        <label className="ink-admin-field">
          <span>署名主体</span>
          <BlogInput
            className="ink-mg-field"
            maxLength={80}
            placeholder="例如：张洪Heo"
            value={data.owner}
            onChange={(e) => patch({ owner: e.target.value })}
          />
          <small>留空则只显示年份与站点名称。</small>
        </label>
        <label className="ink-admin-field">
          <span>起始年份</span>
          <BlogInput
            className="ink-mg-field"
            type="number"
            min={0}
            max={2100}
            placeholder={String(now)}
            value={data.copyrightStart || ""}
            onChange={(e) =>
              patch({ copyrightStart: Number(e.target.value) || 0 })
            }
          />
          <small>0 表示不显示起始年。</small>
        </label>
        <label className="ink-admin-field">
          <span>结束年份</span>
          <BlogInput
            className="ink-mg-field"
            type="number"
            min={0}
            max={2100}
            placeholder={String(now)}
            value={data.copyrightEnd || ""}
            onChange={(e) => patch({ copyrightEnd: Number(e.target.value) || 0 })}
          />
          <small>0 表示延续到当前年份。</small>
        </label>
      </div>

      <div className="ink-mg-panel ink-mg-section">
        <h3>推广位</h3>
        <label className="ink-admin-toggle">
          <BlogCheckbox
            type="checkbox"
            checked={promoData.enabled}
            onChange={(e) => setPromo({ enabled: e.target.checked })}
          />
          在页脚展示推广信息
        </label>
        <label className="ink-admin-field">
          <span>名称</span>
          <BlogInput
            className="ink-mg-field"
            maxLength={60}
            placeholder="例如：PowBay"
            value={promoData.title}
            onChange={(e) => setPromo({ title: e.target.value })}
          />
        </label>
        <label className="ink-admin-field">
          <span>文案</span>
          <BlogTextarea
            className="ink-mg-field"
            minRows={2}
            maxLength={200}
            placeholder="例如：新用户首月 5 折"
            value={promoData.text}
            onChange={(e) => setPromo({ text: e.target.value })}
          />
        </label>
        <label className="ink-admin-field">
          <span>落地页地址</span>
          <BlogInput
            className="ink-mg-field"
            maxLength={500}
            placeholder="https://"
            value={promoData.url}
            onChange={(e) => setPromo({ url: e.target.value })}
          />
          <small>留空则只展示文字，不做成链接。</small>
        </label>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label className="ink-admin-field" style={{ flex: 1, minWidth: 180 }}>
            <span>开始日期</span>
            <BlogInput
              className="ink-mg-field"
              maxLength={20}
              placeholder="YYYY-MM-DD"
              value={promoData.startAt}
              onChange={(e) => setPromo({ startAt: e.target.value })}
            />
            <small>留空表示立即生效。</small>
          </label>
          <label className="ink-admin-field" style={{ flex: 1, minWidth: 180 }}>
            <span>结束日期</span>
            <BlogInput
              className="ink-mg-field"
              maxLength={20}
              placeholder="YYYY-MM-DD"
              value={promoData.endAt}
              onChange={(e) => setPromo({ endAt: e.target.value })}
            />
            <small>留空表示长期有效。</small>
          </label>
        </div>
        {(startProblem || endProblem || rangeProblem) && (
          <p className="ink-mg-alert" role="alert">
            {startProblem || endProblem || rangeProblem}
          </p>
        )}
        <p className="ink-mg-sub">
          起止日期按站点时区判定。日期没填对时推广位只是不显示，不会影响其它站点设置。
        </p>
      </div>

      <div className="ink-mg-panel">
        <h3>访客看到的页脚</h3>
        <div className="ink-footer-preview">
          <div className="ink-footer-preview-legal">
            {data.icp ? <span>{data.icp}</span> : null}
            {data.police ? <span>{data.police}</span> : null}
            {!data.icp && !data.police && (
              <small>还没有填备案号，页脚不显示这一行。</small>
            )}
          </div>
          <div className="ink-footer-preview-copy">
            © {years}
            {data.owner ? ` ${data.owner}` : ""}
          </div>
          {promoData.enabled && (
            <div className="ink-footer-preview-promo">
              {promoData.title ? <b>{promoData.title}</b> : null}
              {promoData.text ? <span>{promoData.text}</span> : null}
              {promoData.startAt || promoData.endAt ? (
                <small>
                  {promoData.startAt || "立即"} — {promoData.endAt || "长期"}
                </small>
              ) : null}
            </div>
          )}
        </div>
        <small>预览不代表已经生效 —— 保存后公开页才会按这份配置渲染。</small>
      </div>
    </div>
  );
}
