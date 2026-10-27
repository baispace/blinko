import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Accordion, AccordionItem, Modal, ModalContent } from "@heroui/react";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlogButton, BlogInput } from "@/components/BlinkoBlog/BlogUI";
import { useBlogSite } from "@/components/BlinkoBlog/public/BlogShell";
import { FriendApplyModal } from "@/components/BlinkoBlog/public/FriendApplyModal";
import { FriendFeedbackModal } from "@/components/BlinkoBlog/public/FriendFeedbackModal";
import { readBlogTheme } from "@/lib/blogTheme";
import { api } from "@/lib/publicBlogClient";
import { publicBasePath, publicSiteOrigin } from "@/lib/blogPublicBase";
import type { FriendApplyOutcome } from "@shared/lib/blogFriends";
import "@/components/BlinkoBlog/public/friends.css";

type FriendLink = Awaited<ReturnType<typeof api.blog.publicFriendLinks.query>>[number];

/** 免责声明的三段说明。后台可以维护「申请说明」，但这段固定文案属于本站声明。 */
const DISCLAIMER = [
  "友情链接指向的站点由各自运营者独立维护，收录不代表本站认可其全部内容或服务。",
  "外部站点的内容与可用性可能发生变化。涉及下载、交易或提供个人信息时，请先核实相关信息。",
  "如发现链接失效、内容异常或其他问题，可通过「异常链接反馈」告知我们，我们会核实并视情况调整或移除链接。",
];

const DEFAULT_APPLY_NOTE =
  "申请前请确认：站点可以公开访问、内容为原创或已获授权、站点名称与介绍真实准确。审核通过后站点会出现在本页友链列表中。";

export default function BlogFriends() {
  const { publicSettings, profile, siteName } = useBlogSite();

  const [links, setLinks] = useState<FriendLink[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [listError, setListError] = useState("");

  const [searchOpen, setSearchOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<FriendLink[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const [applyOpen, setApplyOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackLinkId, setFeedbackLinkId] = useState<number | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [mailEnabled, setMailEnabled] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setListState("loading");
    setListError("");
    try {
      const list = await api.blog.publicFriendLinks.query({});
      setLinks(list);
      setListState("ready");
    } catch {
      setListState("error");
      setListError("友链列表加载失败，请重试。");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api.blog.publicFriendNotice
      .query()
      .then((value) => {
        if (!cancelled) setMailEnabled(!!value.mailEnabled);
      })
      .catch(() => {
        /* 拿不到就按「没有邮件服务」处理：宁可不说，也不承诺做不到的事。 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 输入防抖：每次按键都发请求既慢又吵。
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(keyword), 300);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    const term = debounced.trim();
    if (!term) {
      setResults(null);
      setSearching(false);
      setSearchError("");
      return;
    }
    let cancelled = false;
    setSearching(true);
    api.blog.publicFriendLinks
      .query({ q: term })
      .then((list) => {
        if (cancelled) return;
        setResults(list);
        setSearchError("");
      })
      .catch(() => {
        if (!cancelled) setSearchError("搜索失败，请重试。");
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const visible = results ?? links;
  /** 搜索词已提交且结果回来了 —— 这时才能说「匹配到几个」。 */
  const searchDone = keyword.trim().length > 0 && results !== null;

  const toggleSearch = () => {
    if (searchOpen) {
      // 收起时清空筛选，回到完整列表。
      setSearchOpen(false);
      setKeyword("");
      setDebounced("");
      setResults(null);
      return;
    }
    setSearchOpen(true);
    window.setTimeout(() => searchRef.current?.focus(), 60);
  };

  /**
   * 随机访问。
   *
   * 目标必须在点击的同步流程里算出来并立刻 window.open ——
   * 只要中间 await 一下，浏览器就会把它当成异步弹窗拦掉。
   */
  const lastRandomId = useRef<number | null>(null);
  const openRandom = () => {
    if (!links.length) return;
    let pool = links;
    if (links.length > 1) {
      const others = links.filter((link) => link.id !== lastRandomId.current);
      if (others.length) pool = others;
    }
    const picked = pool[Math.floor(Math.random() * pool.length)];
    lastRandomId.current = picked.id;
    window.open(picked.url, "_blank", "noopener,noreferrer");
  };

  /* ---------- 本站信息（全部来自后台设置，不写死域名） ---------- */

  const displayName = publicSettings?.siteName || siteName || "本站";
  const siteAddress =
    publicSettings?.targetOrigin ||
    profile?.homepage ||
    publicSiteOrigin() + publicBasePath();
  const siteIntro = publicSettings?.tagline || profile?.tagline || "";
  const siteIcon = publicSettings?.iconUrl || "";
  const applyNote = publicSettings?.friendApplyNote || DEFAULT_APPLY_NOTE;

  const siteInfoText = [
    `名称：${displayName}`,
    `地址：${siteAddress}`,
    `简介：${siteIntro}`,
    `图标：${siteIcon}`,
  ].join("\n");

  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const copySiteInfo = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(siteInfoText);
      } else {
        // 没有剪贴板 API 的环境：退回老办法，至少别静默失败。
        const area = document.createElement("textarea");
        area.value = siteInfoText;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopyState("ok");
    } catch {
      setCopyState("fail");
    }
    window.setTimeout(() => setCopyState("idle"), 2400);
  };

  const onSubmitted = (outcome: FriendApplyOutcome) => {
    if (outcome === "approved") {
      setNotice("这个站点已经在友链列表里了。");
    } else if (outcome === "pending") {
      setNotice("这个站点已在审核中，无需重复提交。");
    } else {
      setNotice("申请已收到，审核通过后会出现在友链列表中。");
    }
    window.setTimeout(() => setNotice(""), 6000);
  };

  const feedbackOptions = useMemo(
    () => links.map((link) => ({ id: link.id, name: link.name, url: link.url })),
    [links],
  );

  const theme = readBlogTheme();

  return (
    <main className="ink-wrap ink-friends">
      <section className="ink-friends-hero">
        <span className="ink-friends-eyebrow">友链 / FRIENDS</span>
        <h1 className="ink-friends-title">顺着链接，遇见有趣的人。</h1>
        <p className="ink-friends-lead">
          这里收藏着一些认真记录、持续分享的个人站点。
        </p>
        <p className="ink-friends-lead">随意逛逛，也许会遇见新的同路人。</p>
      </section>

      <div className="ink-friends-actions">
        <BlogButton
          type="button"
          className="ink-friends-action-primary"
          onClick={() => setApplyOpen(true)}
        >
          <Icon icon="tabler:plus" width={18} />
          申请友链
        </BlogButton>
        <BlogButton
          type="button"
          className="ink-friends-action"
          onClick={openRandom}
          disabled={!links.length}
          title={links.length ? undefined : "当前没有可访问的友链"}
        >
          <Icon icon="sidekickicons:dice" width={18} />
          随机访问
        </BlogButton>
        <BlogButton
          type="button"
          className="ink-friends-action"
          onClick={toggleSearch}
          aria-expanded={searchOpen}
        >
          <Icon icon="tabler:search" width={18} />
          搜索友链
        </BlogButton>
        <BlogButton
          type="button"
          className="ink-friends-action"
          onClick={() => {
            setFeedbackLinkId(null);
            setFeedbackOpen(true);
          }}
        >
          <Icon icon="tabler:alert-circle" width={18} />
          异常链接反馈
        </BlogButton>
        {!links.length && listState === "ready" && (
          <p className="ink-friends-hint">
            当前还没有可访问的友链，随机访问暂时不可用。
          </p>
        )}
      </div>

      {searchOpen && (
        <div className="ink-friends-search">
          <BlogInput
            ref={searchRef}
            aria-label="搜索友链"
            placeholder="按站点名称或介绍搜索…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            startContent={<Icon icon="tabler:search" width={15} />}
            endContent={
              keyword ? (
                <BlogButton
                  type="button"
                  className="ink-friends-quiet"
                  onClick={() => setKeyword("")}
                  aria-label="清空搜索"
                >
                  <Icon icon="tabler:x" width={14} />
                </BlogButton>
              ) : undefined
            }
          />
          {searching && <span className="ink-friends-hint">搜索中…</span>}
          {searchError && (
            <span className="ink-friends-error" role="alert">
              <Icon icon="tabler:alert-circle" width={14} />
              {searchError}
            </span>
          )}
        </div>
      )}

      <section className="ink-friends-list-head">
        <h2 className="ink-friends-list-title">朋友们站点</h2>
        <span className="ink-friends-count">
          {searchDone
            ? `${visible.length} 个匹配站点`
            : keyword.trim()
              ? "搜索中…"
              : `${links.length} 个站点`}
        </span>
      </section>

      {notice && (
        <p className="ink-friends-status" role="status">
          {notice}
        </p>
      )}

      {listState === "loading" ? (
        <p className="ink-friends-status" role="status">
          正在加载友链…
        </p>
      ) : listState === "error" ? (
        <div className="ink-friends-status">
          <p role="alert">{listError}</p>
          <BlogButton type="button" onClick={() => void load()}>
            重试
          </BlogButton>
        </div>
      ) : keyword.trim() && results === null ? (
        <p className="ink-friends-status" role="status">
          搜索中…
        </p>
      ) : visible.length === 0 ? (
        <div className="ink-friends-empty">
          <p>
            {keyword.trim()
              ? "没有匹配的友链，换个关键词试试。"
              : "还没有友链。欢迎申请，成为第一个被收录的站点。"}
          </p>
        </div>
      ) : (
        <ul className="ink-friends-grid">
          {visible.map((link) => (
            <li key={link.id} className="ink-friends-cell">
              <a
                className="ink-friends-item"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                title={link.url}
              >
                <span className="ink-friends-item-icon">
                  {link.iconUrl ? (
                    <FriendIcon url={link.iconUrl} name={link.name} />
                  ) : (
                    <Icon icon="tabler:world" width={20} />
                  )}
                </span>
                <span className="ink-friends-item-body">
                  <span className="ink-friends-item-name">
                    {link.name}
                    <Icon
                      icon="tabler:arrow-up-right"
                      width={14}
                      className="ink-friends-item-arrow"
                    />
                  </span>
                  {link.description && (
                    <span className="ink-friends-item-desc">{link.description}</span>
                  )}
                </span>
              </a>
              {/* 从具体友链进入反馈：弹窗会自动选中这一条。 */}
              <button
                type="button"
                className="ink-friends-item-report"
                aria-label={`反馈 ${link.name} 这条友链`}
                title="反馈这条友链"
                onClick={() => {
                  setFeedbackLinkId(link.id);
                  setFeedbackOpen(true);
                }}
              >
                <Icon icon="tabler:alert-circle" width={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 本站信息：和上面的列表明显分开，不让它看起来像列表的下一行。 */}
      <section className="ink-friends-siteinfo">
        <div>
          <h2 className="ink-friends-siteinfo-title">也让我们认识你的站点</h2>
          <p className="ink-friends-siteinfo-lead">
            欢迎申请友链，一起分享各自的记录。
          </p>
          <button
            type="button"
            className="ink-friends-note-link"
            onClick={() => setNoteOpen(true)}
          >
            查看申请说明
            <Icon icon="tabler:arrow-up-right" width={14} />
          </button>
        </div>
        <div className="ink-friends-fields">
          <div className="ink-friends-field">
            <span className="ink-friends-field-label">名称</span>
            <span className="ink-friends-field-value is-plain">{displayName}</span>
          </div>
          <div className="ink-friends-field">
            <span className="ink-friends-field-label">地址</span>
            <span className="ink-friends-field-value">
              <a href={siteAddress} target="_blank" rel="noopener noreferrer">
                {siteAddress}
              </a>
            </span>
          </div>
          <div className="ink-friends-field">
            <span className="ink-friends-field-label">简介</span>
            <span className="ink-friends-field-value is-plain">
              {siteIntro || "还没有填写简介。"}
            </span>
          </div>
          <div className="ink-friends-field">
            <span className="ink-friends-field-label">图标</span>
            <span className="ink-friends-field-value is-plain">
              {siteIcon || "未设置站点图标"}
            </span>
          </div>
          <div>
            <button
              type="button"
              className="ink-friends-copy"
              data-state={copyState}
              onClick={() => void copySiteInfo()}
            >
              <Icon icon="tabler:copy" width={16} />
              {copyState === "ok"
                ? "已复制"
                : copyState === "fail"
                  ? "复制失败，请手动复制"
                  : "复制本站信息"}
            </button>
          </div>
        </div>
      </section>

      <section className="ink-friends-disclaimer">
        <Accordion
          selectionMode="single"
          className="blog-ui-accordion"
          aria-label="友情链接说明与免责声明"
        >
          <AccordionItem
            key="disclaimer"
            aria-label="友情链接说明与免责声明"
            title={
              <span className="blog-ui-accordion-title">
                <Icon icon="tabler:shield" width={18} />
                友情链接说明与免责声明
              </span>
            }
            indicator={(state) => (
              <span className="ink-friends-disclaimer-hint">
                {state.isOpen ? "收起" : "展开查看"}
                <Icon icon="tabler:chevron-down" width={16} />
              </span>
            )}
            classNames={{
              base: "blog-ui-accordion-item",
              heading: "blog-ui-accordion-heading",
              trigger: "blog-ui-accordion-trigger",
              title: "blog-ui-accordion-title-slot",
              content: "blog-ui-accordion-content",
              indicator: "ink-friends-disclaimer-indicator",
            }}
          >
            {DISCLAIMER.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </AccordionItem>
        </Accordion>
      </section>

      <FriendApplyModal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        onSubmitted={onSubmitted}
        mailEnabled={mailEnabled}
        onShowApplyNote={() => setNoteOpen(true)}
      />

      <FriendFeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        links={feedbackOptions}
        initialLinkId={feedbackLinkId}
      />

      <Modal
        isOpen={noteOpen}
        onOpenChange={(open) => {
          if (!open) setNoteOpen(false);
        }}
        placement="center"
        size="md"
        backdrop="blur"
        hideCloseButton
        classNames={{
          base: `ink-friends-modal ink-friends-surface ${theme === "dark" ? "ink-friends-dark" : ""}`,
        }}
      >
        <ModalContent aria-label="申请说明">
          <header className="ink-friends-modal-head">
            <h2 className="ink-friends-modal-title">申请说明</h2>
            <BlogButton
              type="button"
              className="ink-friends-quiet"
              onClick={() => setNoteOpen(false)}
              aria-label="关闭"
            >
              <Icon icon="tabler:x" width={17} />
            </BlogButton>
          </header>
          <div className="ink-friends-modal-body">
            {applyNote.split(/\n{2,}/).map((paragraph) => (
              <p key={paragraph} className="ink-friends-help">
                {paragraph}
              </p>
            ))}
          </div>
        </ModalContent>
      </Modal>
    </main>
  );
}

/** 站点图标：加载失败就退回统一默认图标，不留破图。 */
function FriendIcon({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Icon icon="tabler:world" width={20} />;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      title={name}
    />
  );
}
