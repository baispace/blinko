import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/publicBlogClient";

/**
 * 关于页的「最近动态」摘要。
 *
 * 只是动态的一个切片，不是完整的动态页：
 *   - 最多 3 条，按首次公开发布时间倒序；
 *   - 复用动态页同一套公开接口，不另建数据源；
 *   - 不重复作者头像与昵称，不给点赞、分享、反馈这些互动入口；
 *   - 没有公开动态就整块不出现。
 *
 * 这一块单独请求、单独失败：接口挂了只少这一段，
 * 个人介绍、站点数据和其它区块照常呈现。
 */

type Moment = Awaited<
  ReturnType<typeof api.blog.publicMoments.query>
>["moments"][number];

/** 正文最多显示几行。 */
const CLAMP_LINES = 3;

/** 按站点时区取「月.日」与「年」。 */
function dateParts(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: "", year: "" };
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return {
    day: `${map.month}.${map.day}`,
    // 年份始终带出来：跨年的动态不会因为只写「10.25」而被误读。
    year: map.year,
  };
}

export function AboutMoments() {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [moments, setMoments] = useState<Moment[]>([]);
  const [timeZone, setTimeZone] = useState("Asia/Shanghai");

  useEffect(() => {
    let alive = true;
    void api.blog.publicMoments
      .query({ limit: 3 })
      .then((res) => {
        if (!alive) return;
        setMoments(res.moments);
        setTimeZone(res.timezone);
        setState("ready");
      })
      .catch(() => {
        if (alive) setState("failed");
      });
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(
    () =>
      moments.map((moment) => ({
        ...moment,
        date: dateParts(moment.publishedAt, timeZone),
      })),
    [moments, timeZone],
  );

  // 加载中先占位，避免整页跳动；占位与真实内容同构（行数、图位一致），
  // 替换时不会把下方的订阅引导和页脚顶下去。
  if (state === "loading")
    return (
      <section className="ink-about-section" aria-busy="true">
        <h2 className="ink-about-title">最近动态</h2>
        <div className="ink-about-moments">
          {[0, 1, 2].map((i) => (
            <div className="ink-about-moment" key={i}>
              <span className="ink-about-moment-date">
                <b>·</b>
              </span>
              <div className="ink-about-moment-body">
                <span className="ink-about-skeleton-line" />
              </div>
            </div>
          ))}
        </div>
        <p className="sr-only" role="status">
          正在加载最近动态…
        </p>
      </section>
    );

  if (state === "failed" || !rows.length) return null;

  return (
    <section className="ink-about-section">
      <h2 className="ink-about-title">最近动态</h2>
      <div className="ink-about-moments">
        {rows.map((moment) => (
          <AboutMomentRow key={moment.id} moment={moment} date={moment.date} />
        ))}
      </div>
    </section>
  );
}

function AboutMomentRow({
  moment,
  date,
}: {
  moment: Moment;
  date: { day: string; year: string };
}) {
  const [expanded, setExpanded] = useState(false);
  // 是否真的超出三行：按渲染后的高度判断，不用字符数猜，
  // 否则短文本也会出现一个点了没反应的「展开」。
  const [overflowing, setOverflowing] = useState(false);
  const [measured, setMeasured] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  // 动态就是闪念：这里显示的是它正文的纯文本摘要（服务端剥好 markdown）。
  const text = moment.summary;

  // 首帧先按三行裁剪，量出真实高度后再决定要不要给「展开」。
  const clamped = measured ? overflowing && !expanded : true;

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const measure = () => {
      // 展开状态下高度已被放开，比出来的结果没有意义。
      if (expanded) return;
      setOverflowing(el.scrollHeight > el.clientHeight + 2);
      setMeasured(true);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, text]);

  return (
    <article className="ink-about-moment">
      <div className="ink-about-moment-date">
        <b>{date.day}</b>
        <span>{date.year}</span>
      </div>
      <div className="ink-about-moment-body">
        <p
          ref={textRef}
          className={
            "ink-about-moment-text" + (clamped ? " is-clamped" : "")
          }
        >
          {text}
        </p>
        {(overflowing || expanded) && (
          <div className="ink-about-moment-foot">
            <button
              type="button"
              className="ink-about-moment-toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "收起" : "展开"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
