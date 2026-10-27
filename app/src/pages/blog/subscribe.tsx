import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Modal, ModalContent } from "@heroui/react";
import { blogRoute, publicAsset, publicSiteOrigin } from "@/lib/blogPublicBase";
import { api } from "@/lib/publicBlogClient";
import { Icon } from "@/components/Common/Iconify/icons";
import { readBlogTheme } from "@/lib/blogTheme";
import { BlogButton } from "@/components/BlinkoBlog/BlogUI";
import { useBlogTitle } from "@/components/BlinkoBlog/public/BlogShell";
import "@/components/BlinkoBlog/public/subscribe.css";

/**
 * 公开博客的「订阅更新」页。
 *
 * 访客在这里挑一种适合自己的订阅方式：微信公众号扫一扫，或者把 RSS
 * 地址丢进阅读器。页面结构固定：
 *   标题区 → 两张订阅卡片 → 关于这里 → 订阅说明 → 联系入口
 *
 * 几条硬规矩：
 *   1. 内容全部来自后台配置 —— 没配公众号就没有公众号，没配说明就不显示说明；
 *   2. RSS 地址由公开站点地址与真实订阅路由生成，作者不必手抄；
 *   3. 复制失败就说失败，不假装成功；
 *   4. 二维码始终保持可扫：白底、不裁剪、预留尺寸。
 */

type Subscribe = Awaited<ReturnType<typeof api.blog.publicSubscribe.query>>;

/** 复制到剪贴板。失败就返回 false —— 不用「假装成功」糊弄读者。 */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

/** 复制按钮的即时反馈：成功 / 失败都是一句话，不弹系统提示框。 */
function useCopyFeedback() {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2600);
    return () => clearTimeout(timer);
  }, [state]);
  const run = async (text: string) => {
    const ok = await copyText(text);
    setState(ok ? "ok" : "fail");
  };
  return { state, run };
}

/** 二维码是否与页面同源：同源才能让浏览器直接下载。 */
function isSameOrigin(url: string) {
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

export default function BlogSubscribe() {
  useBlogTitle("订阅更新");
  const [data, setData] = useState<Subscribe | null>(null);
  const [failed, setFailed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // 订阅配置单独取：取不到只影响这一页的渠道信息，
  // 站点介绍与导航照常。
  useEffect(() => {
    let alive = true;
    void api.blog.publicSubscribe
      .query()
      .then((res) => {
        if (!alive) return;
        setData(res);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const wechat = data?.wechat;
  const rss = data?.rss;
  const about = data?.about;
  const notes = data?.notes ?? [];

  // RSS 地址：作者自定义了就用自定义的，否则按公开站点地址自动生成。
  // 绝对地址才可直接粘进阅读器 —— 相对路径在阅读器里是打不开的。
  const rssUrl = useMemo(() => {
    const custom = rss?.customUrl?.trim();
    if (custom) return custom;
    const origin = publicSiteOrigin();
    if (!origin) return "";
    return origin.replace(/\/+$/, "") + publicAsset(rss?.feedPath || "/blog/feed.xml");
  }, [rss?.customUrl, rss?.feedPath]);

  const momentsUrl = useMemo(() => {
    const origin = publicSiteOrigin();
    if (!origin) return "";
    return (
      origin.replace(/\/+$/, "") +
      publicAsset(rss?.momentsFeedPath || "/blog/moments/feed.xml")
    );
  }, [rss?.momentsFeedPath]);

  const wechatReady = !!wechat?.available;
  const rssReady = !!rss?.available && !!rssUrl;
  const channels = (wechatReady ? 1 : 0) + (rssReady ? 1 : 0);

  return (
    <main className="ink-sub">
      <div className="ink-sub-inner">
        {/* 标题区 */}
        <header className="ink-sub-head">
          <span className="ink-sub-eyebrow">订阅更新</span>
          <h1 className="ink-sub-title">用你习惯的方式，保持关注。</h1>
          <p className="ink-sub-lead">
            微信公众号与 RSS，让新内容自然来到你身边。
          </p>
        </header>

        {failed && (
          <p className="ink-sub-notice" role="status">
            订阅信息暂时加载失败，请稍后再试。你也可以直接
            <Link to={blogRoute("/blog")}> 先去读几篇文章 </Link>
            或查看
            <Link to={blogRoute("/blog/about")}> 关于作者</Link>。
          </p>
        )}

        {!failed && channels === 0 && (
          <p className="ink-sub-notice" role="status">
            订阅渠道暂时没有开放。你可以先
            <Link to={blogRoute("/blog")}> 阅读公开文章 </Link>
            或查看
            <Link to={blogRoute("/blog/about")}> 关于作者</Link>。
          </p>
        )}

        {/* 两张订阅卡片 */}
        {channels > 0 && (
          <section
            className={
              // 两个渠道都在时并排等高；有一个未开放时不再拉伸 ——
              // 「暂未开放」那张卡保持紧凑，不留大片空白。
              "ink-sub-cards" + (channels === 1 ? " has-closed" : "")
            }
          >
            {wechat && (
              <WechatCard
                name={wechat.name}
                qrUrl={wechat.qrUrl}
                closed={!wechatReady}
              />
            )}
            {rss && (
              <RssCard
                url={rssUrl}
                momentsUrl={momentsUrl}
                closed={!rssReady}
                onOpenHelp={() => setHelpOpen(true)}
              />
            )}
          </section>
        )}

        {/* 关于这里 */}
        {about && (
          <section className="ink-sub-about">
            <span className="ink-sub-eyebrow">关于这里</span>
            {about.title && <h2 className="ink-sub-about-title">{about.title}</h2>}
            {about.text && <p className="ink-sub-about-text">{about.text}</p>}
            {about.directions.length > 0 && (
              <div className="ink-sub-tags">
                {about.directions.map((d) =>
                  d.slug ? (
                    <Link
                      key={d.name}
                      className="ink-sub-tag"
                      to={blogRoute("/blog/t/" + d.slug)}
                      style={
                        d.color
                          ? {
                              color: d.color,
                              background: d.color + "18",
                            }
                          : undefined
                      }
                    >
                      {d.name}
                    </Link>
                  ) : (
                    // 对不上已发布专题的方向就当普通标签 ——
                    // 做成按钮却点不动，比没有更糟。
                    <span key={d.name} className="ink-sub-tag is-plain">
                      {d.name}
                    </span>
                  ),
                )}
              </div>
            )}
            <Link className="ink-sub-about-link" to={blogRoute("/blog/about")}>
              了解作者
              <Icon icon="tabler:arrow-up-right" width={14} />
            </Link>
          </section>
        )}

        {/* 订阅说明 */}
        {notes.length > 0 && (
          <section className="ink-sub-notes">
            <h2 className="ink-sub-notes-title">订阅前，你可能想知道</h2>
            <dl className="ink-sub-notes-list">
              {notes.map((n, i) => (
                <div className="ink-sub-note" key={n.label + i}>
                  <dt>{n.label}</dt>
                  <dd>{n.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* 联系入口：只给已经公开的联系方式 */}
        {about?.contact && (
          <p className="ink-sub-contact">
            订阅遇到问题？
            <a
              href={about.contact.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {about.contact.label}
              <Icon icon="tabler:arrow-up-right" width={13} />
            </a>
          </p>
        )}
      </div>

      <RssHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </main>
  );
}

/** 微信二维码那一格。 */
function WechatCard({
  name,
  qrUrl,
  closed,
}: {
  name: string;
  qrUrl: string;
  closed: boolean;
}) {
  const copy = useCopyFeedback();
  const [broken, setBroken] = useState(false);
  const [retry, setRetry] = useState(0);
  const sameOrigin = isSameOrigin(qrUrl);

  return (
    <article className={"ink-sub-card" + (closed ? " is-closed" : "")}>
      <header className="ink-sub-card-head">
        <span className="ink-sub-card-icon is-wechat" aria-hidden="true">
          <Icon icon="tabler:brand-wechat" width={22} />
        </span>
        <div className="ink-sub-card-heading">
          <h2 className="ink-sub-card-title">微信公众号</h2>
          <p className="ink-sub-card-desc">
            {closed ? "暂未开放。" : "在微信里，随时读到新的分享。"}
          </p>
        </div>
      </header>

      {closed ? null : (
        <>
          <div className="ink-sub-qr">
            {broken ? (
              <div className="ink-sub-qr-fallback">
                <Icon icon="tabler:photo" width={20} />
                <p>二维码暂时读不出来。</p>
                <BlogButton
                  className="ink-sub-btn is-ghost"
                  onClick={() => {
                    setBroken(false);
                    setRetry((n) => n + 1);
                  }}
                >
                  重新加载
                </BlogButton>
                <small>也可以直接复制公众号名称，在微信里搜索关注。</small>
              </div>
            ) : (
              <img
                key={retry}
                src={qrUrl}
                alt={`${name} 的公众号二维码`}
                width={176}
                height={176}
                loading="lazy"
                decoding="async"
                onError={() => setBroken(true)}
              />
            )}
            <span className="ink-sub-qr-name">{name}</span>
          </div>

          <div className="ink-sub-actions">
            {sameOrigin ? (
              <a
                className="ink-sub-btn is-primary"
                href={qrUrl}
                download="wechat-qrcode.png"
              >
                <Icon icon="tabler:download" width={16} />
                保存二维码
              </a>
            ) : (
              <a
                className="ink-sub-btn is-primary"
                href={qrUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon icon="tabler:external-link" width={16} />
                打开二维码
              </a>
            )}
            <BlogButton
              className="ink-sub-btn is-ghost"
              onClick={() => void copy.run(name)}
            >
              <Icon icon="tabler:copy" width={16} />
              复制公众号名称
            </BlogButton>
          </div>

          {!sameOrigin && (
            <p className="ink-sub-hint is-dim">
              浏览器不支持直接保存时，可打开图片后长按或右键另存为。
            </p>
          )}

          <p className="ink-sub-hint">
            <span className="is-desktop">微信扫一扫，关注后查看更新。</span>
            <span className="is-mobile">
              保存到相册后，可在微信里长按识别并关注。
            </span>
          </p>

          {copy.state !== "idle" && (
            <p
              className={
                "ink-sub-feedback " +
                (copy.state === "ok" ? "is-ok" : "is-fail")
              }
              role="status"
            >
              {copy.state === "ok"
                ? "公众号名称已复制。"
                : "复制失败，请手动长按选中名称复制。"}
            </p>
          )}
        </>
      )}
    </article>
  );
}

/** RSS 那一格。 */
function RssCard({
  url,
  momentsUrl,
  closed,
  onOpenHelp,
}: {
  url: string;
  momentsUrl: string;
  closed: boolean;
  onOpenHelp: () => void;
}) {
  const copy = useCopyFeedback();

  return (
    <article className={"ink-sub-card" + (closed ? " is-closed" : "")}>
      <header className="ink-sub-card-head">
        <span className="ink-sub-card-icon is-rss" aria-hidden="true">
          <Icon icon="tabler:rss" width={22} />
        </span>
        <div className="ink-sub-card-heading">
          <h2 className="ink-sub-card-title">RSS 订阅</h2>
          <p className="ink-sub-card-desc">
            {closed ? "暂未开放。" : "把文章更新，放进自己的阅读器。"}
          </p>
        </div>
      </header>

      {closed ? null : (
        <>
          <div className="ink-sub-feed">
            <span className="ink-sub-feed-label">订阅地址</span>
            <div className="ink-sub-feed-box">
              <code title={url}>{url}</code>
            </div>
            <p className="ink-sub-hint is-dim">
              这个地址包含全部公开文章，不含草稿、私有笔记与私密反馈。
            </p>
            {momentsUrl && (
              <p className="ink-sub-hint is-dim">
                动态另有独立的订阅地址：
                <a href={momentsUrl} target="_blank" rel="noopener noreferrer">
                  {momentsUrl}
                </a>
              </p>
            )}
          </div>

          <div className="ink-sub-actions">
            <BlogButton
              className="ink-sub-btn is-primary"
              onClick={() => void copy.run(url)}
            >
              <Icon icon="tabler:copy" width={16} />
              复制订阅地址
            </BlogButton>
            <a
              className="ink-sub-btn is-ghost"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              查看订阅源
              <Icon icon="tabler:arrow-up-right" width={15} />
            </a>
          </div>

          <button type="button" className="ink-sub-help-link" onClick={onOpenHelp}>
            如何使用 RSS？
          </button>

          {copy.state !== "idle" && (
            <p
              className={
                "ink-sub-feedback " +
                (copy.state === "ok" ? "is-ok" : "is-fail")
              }
              role="status"
            >
              {copy.state === "ok"
                ? "订阅地址已复制。"
                : "复制失败，请手动选中地址复制。"}
            </p>
          )}
        </>
      )}
    </article>
  );
}

/** 「如何使用 RSS？」的轻量弹窗。 */
function RssHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = readBlogTheme();
  return (
    <Modal
      isOpen={open}
      onOpenChange={(next) => onClose()}
      placement="center"
      size="md"
      scrollBehavior="inside"
      backdrop="blur"
      isDismissable
      hideCloseButton
      classNames={{
        base: `ink-sub-modal ink-sub-modal-surface ${
          theme === "dark" ? "ink-sub-modal-dark" : ""
        }`,
      }}
    >
      <ModalContent aria-label="如何使用 RSS">
        <header className="ink-sub-modal-head">
          <h2 className="ink-sub-modal-title">如何使用 RSS？</h2>
          <BlogButton
            type="button"
            className="ink-sub-modal-close"
            onClick={onClose}
            aria-label="关闭"
          >
            <Icon icon="tabler:x" width={18} />
          </BlogButton>
        </header>
        <ol className="ink-sub-modal-steps">
          <li>
            <b>复制本站订阅地址</b>
            <span>把上面的地址复制下来。</span>
          </li>
          <li>
            <b>在阅读器里添加订阅</b>
            <span>打开任意支持 RSS 的阅读器，选择「添加订阅」。</span>
          </li>
          <li>
            <b>粘贴地址并保存</b>
            <span>把地址粘进去，保存后新文章会自动出现在阅读器里。</span>
          </li>
        </ol>
        <p className="ink-sub-modal-note">
          阅读器会按自身设置检查更新，可能存在延迟 —— 刚发布的内容不一定立刻出现。
        </p>
        <footer className="ink-sub-modal-foot">
          <BlogButton
            type="button"
            className="ink-sub-modal-done"
            onClick={onClose}
          >
            知道了
          </BlogButton>
        </footer>
      </ModalContent>
    </Modal>
  );
}
