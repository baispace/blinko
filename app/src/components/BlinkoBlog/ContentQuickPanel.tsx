import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/trpc';
import axios from '@/lib/axios';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';
import { blogImageUrl } from '@/lib/blogImage';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { Icon } from '@/components/Common/Iconify/icons';
import { CoverCanvas } from './CoverCanvas';
import { BlogCoverGeneratorDialog } from './BlogCoverGeneratorDialog';
import { BlogButton, BlogCheckbox, BlogInput, BlogSelect, BlogTextarea } from './BlogUI';
import { confirmBlogAction } from './confirmBlogAction';
import { CONTENT_STATUS_META, resolveContentStatus } from './contentStatus';
import {
  shortCoverTitleLength,
  validShortCoverTitle,
} from '@shared/lib/blogPublishSettings';
import './quick-panel.css';

type Settings = Awaited<ReturnType<typeof api.blog.publishSettings.query>>;
type Copy = Awaited<ReturnType<typeof api.blog.generateCopyGroup.mutate>>;
type Base = { id: number | null; path: string } | null;
type Form = {
  title: string;
  summary: string;
  coverTitle: string;
  coverSubtitle: string;
  coverMode: 'full' | 'overlay';
  displayMode: 'default' | 'pinned' | 'featured';
  displayOrder: number;
  topics: { topicId: number; sectionId: number | null }[];
};

/** AI 能改的三个字段：公开标题、文章概要、封面短标题。 */
const copyFields = [
  ['title', '公开标题'],
  ['summary', '文章概要'],
  ['coverTitle', '封面短标题'],
] as const;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败，请重试。';

/**
 * 右侧快捷操作面板：这一篇文章的全部操作都在这里。
 *
 * 分三块，按「写什么 → 长什么样 → 怎么运营」排：
 *   1. 管理内容 —— 标题、概要、封面文案，AI 顺手优化；
 *   2. 封面生成 —— 生成、预览、上传、换已有图；
 *   3. 运营管理 —— 发布、撤回、首页展示、专题归属。
 *
 * 面板只改草稿：公开快照要等点「更新发布」才变。
 */
export function ContentQuickPanel({
  noteId,
  onChanged,
  onClose,
  focus,
}: {
  noteId: number | null;
  onChanged?: () => void | Promise<void>;
  onClose?: () => void;
  /** 从别处跳过来时高亮一下，告诉用户操作在这一侧。 */
  focus?: boolean;
}) {
  const navigate = useNavigate();
  const [data, setData] = useState<Settings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [base, setBase] = useState<Base>(null);
  const [busy, setBusy] = useState<null | 'load' | 'copy' | 'upload' | 'save'>(
    'load',
  );
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copy, setCopy] = useState<Copy | null>(null);
  const [copyPicked, setCopyPicked] = useState<string[]>([]);
  const [aiVersion, setAiVersion] = useState<string>();
  const [sourceChoice, setSourceChoice] = useState<'keep' | 'adopt'>();
  const [coverAssistant, setCoverAssistant] = useState<
    'generate' | 'preview' | null
  >(null);
  const [expanded, setExpanded] = useState<'' | 'copy' | 'topics' | 'diff'>('');
  const file = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  const load = async () => {
    if (!noteId) {
      setData(null);
      setForm(null);
      return;
    }
    setBusy('load');
    setError('');
    try {
      const state = await api.blog.publishSettings.query({ noteId });
      if (!alive.current) return;
      const value: Form = {
        title: state.title,
        summary: state.summary,
        coverTitle: state.config.title,
        coverSubtitle: state.config.subtitle,
        coverMode: state.config.mode,
        displayMode: state.displayMode,
        displayOrder: state.displayOrder,
        topics: state.topics,
      };
      const image = state.cover
        ? { id: state.cover.id, path: state.cover.path }
        : null;
      setData(state);
      setForm(value);
      setBase(image);
      setCopy(null);
      setCopyPicked([]);
      setSourceChoice(undefined);
    } catch (error) {
      if (alive.current) setError(errorText(error));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const patch = (value: Partial<Form>) =>
    setForm((previous) => (previous ? { ...previous, ...value } : previous));

  const notify = (error: unknown, fallback: string) => {
    const text = errorText(error);
    setError(text);
    RootStore.Get(ToastPlugin).error(text === '操作失败，请重试。' ? fallback : text);
  };

  /** AI 顺手把标题、概要、封面短标题各给一版建议。 */
  const suggest = async () => {
    if (!noteId) return;
    setBusy('copy');
    setError('');
    setNotice('');
    try {
      const result = await api.blog.generateCopyGroup.mutate({ noteId });
      if (!alive.current) return;
      setCopy(result);
      setCopyPicked(
        copyFields
          .filter(
            ([key]) =>
              !!result[key]?.trim() &&
              (key !== 'coverTitle' || validShortCoverTitle(result[key])),
          )
          .map(([key]) => key),
      );
      setExpanded('copy');
      if (result.issues.length) setNotice(result.issues.join(' '));
    } catch (error) {
      if (alive.current) notify(error, 'AI 建议生成失败，请重试。');
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const upload = async (image: File) => {
    if (
      !/^image\/(png|jpeg|webp|gif|avif)$/.test(image.type) ||
      image.size > 10 * 1024 * 1024
    ) {
      setError('请选择 10MB 以内的 PNG、JPEG、WebP、GIF 或 AVIF 图片。');
      return;
    }
    setBusy('upload');
    setError('');
    try {
      const body = new FormData();
      body.append('file', image);
      const response = await axios.post(getBlinkoEndpoint('/api/file/upload'), body);
      const path = response.data?.path || response.data?.filePath;
      if (!path) throw new Error('上传未返回图片地址，请重试。');
      if (!alive.current) return;
      setBase({ id: null, path });
      patch({ coverMode: 'full' });
      setNotice('图片已选好。默认不另加标题，图片自带的文字会保留。');
    } catch (error) {
      if (alive.current) notify(error, '图片上传失败，请重试。');
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const save = async (action: 'display' | 'draft' | 'publish') => {
    if (!form || !data || !noteId || busy) return;
    setBusy('save');
    setError('');
    try {
      await api.blog.savePublishSettings.mutate({
        ...form,
        action,
        sourceChoice,
        noteId,
        token: data.token,
        expectedContentVersion: aiVersion,
        coverAttachmentId: base?.id ?? null,
        ...(base && !base.id ? { coverPath: base.path } : {}),
      });
      RootStore.Get(ToastPlugin).success(
        action === 'publish'
          ? '文章已发布，公开页面已更新。'
          : '草稿已保存，展示设置已生效。',
      );
      RootStore.Get(BlinkoStore).updateTicker++;
      await load();
      await onChanged?.();
    } catch (error) {
      if (alive.current) notify(error, '保存失败，请重试。');
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const withdraw = async () => {
    if (!data || !noteId || busy) return;
    const ok = await confirmBlogAction(
      '撤回后公开链接、首页、搜索与专题将停止展示，原笔记和草稿会保留。确定撤回这篇文章？',
    );
    if (!ok) return;
    setBusy('save');
    setError('');
    try {
      await api.notes.publishNote.mutate({
        id: noteId,
        isCancel: true,
        expectedPublicationToken: data.reviewToken,
      });
      RootStore.Get(ToastPlugin).success('已撤回发布');
      RootStore.Get(BlinkoStore).updateTicker++;
      await load();
      await onChanged?.();
    } catch (error) {
      if (alive.current) notify(error, '撤回失败，请重试。');
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  if (!noteId)
    return (
      <aside className="ink-qp ink-qp-empty">
        <p>选中左侧的一篇文章，这里会显示它的快捷操作。</p>
      </aside>
    );

  if (!form || !data)
    return (
      <aside className="ink-qp ink-qp-empty">
        {error ? <p className="ink-qp-error">{error}</p> : <p>正在读取…</p>}
      </aside>
    );

  const invalidShort =
    !!form.coverTitle && !validShortCoverTitle(form.coverTitle);
  const missingShort = !!base && form.coverMode === 'overlay' && !form.coverTitle.trim();
  const canSave = !busy && !invalidShort && !missingShort;
  // 发布按钮的文案走全站统一的状态模型；「查看公开页」在运营管理里单独给。
  const state = resolveContentStatus({
    isPublished: data.isPublished,
    hasDraftChanges: data.hasChanges,
    revision: data.revision,
  });
  const publishLabel =
    state === 'published' ? '更新发布' : CONTENT_STATUS_META[state].action;
  const bodyConflict = data.check.conflicts.some(
    (conflict) => conflict.field === 'body',
  );
  const coverConfig = {
    ...data.config,
    title: form.coverTitle,
    subtitle: form.coverSubtitle,
    mode: form.coverMode,
  };

  return (
    <aside className="ink-qp" aria-label="快捷操作" data-focus={focus ? "1" : undefined}>
      <header className="ink-qp-head">
        <div className="ink-qp-head-main">
          <strong>{data.title || '未命名文章'}</strong>
          <span>
            {CONTENT_STATUS_META[state].label}
            {data.revision ? ` · v${data.revision}` : ''}
          </span>
        </div>
        <div className="ink-qp-head-actions">
          <BlogButton
            type="button"
            className="ink-mg-link"
            onClick={() => navigate(`/blog-manage/content/${noteId}`)}
          >
            工作台
            <Icon icon="tabler:chevron-right" width={13} />
          </BlogButton>
          {onClose && (
            <BlogButton
              type="button"
              className="ink-qp-close"
              aria-label="收起快捷操作"
              onClick={onClose}
            >
              <Icon icon="tabler:x" width={16} />
            </BlogButton>
          )}
        </div>
      </header>

      {!!notice && (
        <p className="ink-qp-feedback" role="status">
          {notice}
        </p>
      )}
      {!!error && (
        <p className="ink-qp-error" role="alert">
          {error}
        </p>
      )}

      <div className="ink-qp-scroll">
        {/* ---------- ① 管理内容 ---------- */}
        <section className="ink-qp-block">
          <h3>
            <Icon icon="tabler:edit" width={15} />
            管理内容
          </h3>
          <label className="ink-qp-field">
            <span>公开标题</span>
            <BlogInput
              className="ink-mg-field"
              maxLength={200}
              value={form.title}
              disabled={!!busy}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="留空时沿用正文标题"
            />
          </label>
          <label className="ink-qp-field">
            <span>文章概要</span>
            <BlogTextarea
              className="ink-mg-field"
              rows={3}
              maxLength={2000}
              value={form.summary}
              disabled={!!busy}
              onChange={(event) => patch({ summary: event.target.value })}
            />
          </label>
          <label className="ink-qp-field">
            <span>
              封面短标题
              <small>4–6 字</small>
              <small className={invalidShort ? 'ink-qp-error' : ''}>
                {shortCoverTitleLength(form.coverTitle)}/6
              </small>
            </span>
            <BlogInput
              className="ink-mg-field"
              maxLength={24}
              aria-invalid={invalidShort || missingShort}
              value={form.coverTitle}
              disabled={!!busy}
              onChange={(event) => patch({ coverTitle: event.target.value })}
              placeholder="例如：三段式改造"
            />
            {(invalidShort || missingShort) && (
              <small className="ink-qp-error">
                {missingShort
                  ? '在图片上显示标题时，封面短标题不能为空。'
                  : '封面短标题要 4–6 字，太长会被裁断。'}
              </small>
            )}
          </label>
          <label className="ink-qp-field">
            <span>
              封面小字
              <small>可留空</small>
            </span>
            <BlogInput
              className="ink-mg-field"
              maxLength={40}
              value={form.coverSubtitle}
              disabled={!!busy}
              onChange={(event) => patch({ coverSubtitle: event.target.value })}
              placeholder="例如：一次上线，三段召回"
            />
          </label>
          <BlogButton
            type="button"
            className="ink-mg-button"
            disabled={!!busy}
            onClick={() => void suggest()}
          >
            <Icon icon="tabler:sparkles" width={15} />
            {busy === 'copy' ? '正在想…' : 'AI 优化文案'}
          </BlogButton>
          {copy && (
            <div className="ink-qp-copy">
              <p>选择要采用的建议，未选字段保留当前内容。</p>
              {copyFields.map(([key, label]) => (
                <label key={key}>
                  <BlogCheckbox
                    type="checkbox"
                    disabled={
                      !!busy ||
                      !copy[key]?.trim() ||
                      (key === 'coverTitle' && !validShortCoverTitle(copy[key]))
                    }
                    checked={copyPicked.includes(key)}
                    onChange={(event) =>
                      setCopyPicked((previous) =>
                        event.target.checked
                          ? [...previous, key]
                          : previous.filter((field) => field !== key),
                      )
                    }
                  />
                  <span>
                    <b>{label}</b>
                    <span>{copy[key] || '未生成'}</span>
                  </span>
                </label>
              ))}
              <div className="ink-qp-inline-actions">
                <BlogButton
                  type="button"
                  className="ink-mg-button"
                  disabled={!!busy}
                  onClick={() => setCopy(null)}
                >
                  暂不采用
                </BlogButton>
                <BlogButton
                  type="button"
                  className="ink-mg-button ink-mg-button-primary"
                  disabled={!!busy || !copyPicked.length}
                  onClick={() => {
                    patch(
                      Object.fromEntries(
                        copyPicked.map((key) => [
                          key,
                          copy[key as keyof typeof copy],
                        ]),
                      ),
                    );
                    setAiVersion(copy.contentVersion);
                    setCopy(null);
                    setNotice('建议已填入，保存后写入草稿。');
                  }}
                >
                  采用选中建议
                </BlogButton>
              </div>
            </div>
          )}
        </section>

        {/* ---------- ② 封面生成 ---------- */}
        <section className="ink-qp-block">
          <h3>
            <Icon icon="tabler:photo" width={15} />
            封面生成
          </h3>
          <div className="ink-qp-cover">
            {base ? (
              <CoverCanvas
                key={base.path}
                src={blogImageUrl(base.path)}
                config={coverConfig}
                placement="double"
                loading="eager"
              />
            ) : (
              <p>尚未设置封面</p>
            )}
          </div>
          <div className="ink-qp-actions">
            <BlogButton
              type="button"
              className="ink-mg-button ink-mg-button-primary"
              disabled={!!busy}
              onClick={() => setCoverAssistant('generate')}
            >
              <Icon icon="tabler:sparkles" width={15} />
              生成封面
            </BlogButton>
            <BlogButton
              type="button"
              className="ink-mg-button"
              disabled={!!busy || !base}
              onClick={() => setCoverAssistant('preview')}
            >
              <Icon icon="tabler:eye" width={15} />
              预览封面
            </BlogButton>
            <BlogButton
              type="button"
              className="ink-mg-button"
              disabled={!!busy}
              onClick={() => file.current?.click()}
            >
              {busy === 'upload' ? '正在上传…' : '上传替换'}
            </BlogButton>
          </div>
          <input
            type="file"
            ref={file}
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            onChange={(event) => {
              const image = event.target.files?.[0];
              event.target.value = '';
              if (image && !busy) void upload(image);
            }}
          />
          {!!data.images.length && (
            <label className="ink-qp-field">
              <span>已有图片</span>
              <BlogSelect
                className="ink-mg-field"
                disabled={!!busy}
                value={base?.id || ''}
                onChange={(event) => {
                  const image = data.images.find(
                    (item) => item.id === Number(event.target.value),
                  );
                  if (image) {
                    setBase({ id: image.id, path: image.path });
                    patch({ coverMode: 'full' });
                  }
                }}
              >
                <option value="">选择已有图片</option>
                {data.images.map((image) => (
                  <option key={image.id} value={image.id}>
                    {image.name || `图片 ${image.id}`}
                  </option>
                ))}
              </BlogSelect>
            </label>
          )}
          <label className="ink-qp-toggle">
            <BlogCheckbox
              type="checkbox"
              checked={form.coverMode === 'overlay'}
              disabled={!!busy}
              onChange={(event) =>
                patch({ coverMode: event.target.checked ? 'overlay' : 'full' })
              }
            />
            在图片上显示标题
          </label>
          {base && (
            <BlogButton
              type="button"
              className="ink-mg-link"
              disabled={!!busy}
              onClick={() => setBase(null)}
            >
              移除草稿封面
            </BlogButton>
          )}
        </section>

        {/* ---------- ③ 运营管理 ---------- */}
        <section className="ink-qp-block">
          <h3>
            <Icon icon="tabler:adjustments" width={15} />
            运营管理
          </h3>
          <div className="ink-qp-actions">
            {data.isPublished ? (
              <BlogButton
                type="button"
                className="ink-mg-button"
                disabled={!!busy}
                onClick={() => void withdraw()}
              >
                撤回发布
              </BlogButton>
            ) : null}
            {data.publishId ? (
              <BlogButton
                as="a"
                className="ink-mg-button"
                href={`/blog/${data.publishId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                查看公开页
                <Icon icon="tabler:external-link" width={14} />
              </BlogButton>
            ) : null}
            <BlogButton
              as="a"
              className="ink-mg-button"
              href={`/detail?id=${noteId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              编辑原笔记
              <Icon icon="tabler:external-link" width={14} />
            </BlogButton>
          </div>
          <div className="ink-qp-field">
            <span>首页展示</span>
            <div className="ink-qp-display" role="group" aria-label="首页展示">
              {(
                [
                  // 精选排在第一位：它是默认展示方式（置顶 + banner），
                  // 「默认展示」是作者明确要退出精选时才选的退路。
                  ['featured', '首页精选', '默认 · 加入 Banner，同时置顶'],
                  ['pinned', '列表置顶', '优先出现在推荐列表'],
                  ['default', '默认展示', '按列表规则排序'],
                ] as const
              ).map(([value, label, hint]) => (
                <BlogButton
                  key={value}
                  type="button"
                  aria-pressed={form.displayMode === value}
                  disabled={!!busy}
                  onClick={() => patch({ displayMode: value })}
                >
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </BlogButton>
              ))}
            </div>
          </div>
          {form.displayMode !== 'default' && (
            <label className="ink-qp-field">
              <span>
                展示顺序
                <small>数值越小越靠前</small>
              </span>
              <BlogInput
                type="number"
                className="ink-mg-field"
                min={1}
                max={1000}
                value={form.displayOrder + 1}
                disabled={!!busy}
                onChange={(event) =>
                  patch({
                    displayOrder: Math.max(
                      0,
                      Math.min(999, Number(event.target.value) - 1),
                    ),
                  })
                }
              />
            </label>
          )}
          <button
            type="button"
            className="ink-qp-toggle-row"
            aria-expanded={expanded === 'topics'}
            onClick={() =>
              setExpanded((previous) =>
                previous === 'topics' ? '' : 'topics',
              )
            }
          >
            <Icon
              icon="tabler:chevron-down"
              width={14}
              className={expanded === 'topics' ? 'ink-qp-open' : ''}
            />
            专题与章节
            <small>
              {form.topics.length ? `${form.topics.length} 个专题` : '未归属'}
            </small>
          </button>
          {expanded === 'topics' && (
            <div className="ink-qp-topics">
              {data.availableTopics.map((topic) => {
                const member = form.topics.find(
                  (item) => item.topicId === topic.id,
                );
                return (
                  <div className="ink-qp-topic-row" key={topic.id}>
                    <label>
                      <BlogCheckbox
                        type="checkbox"
                        checked={!!member}
                        disabled={!!busy}
                        onChange={(event) =>
                          patch({
                            topics: event.target.checked
                              ? [
                                  ...form.topics,
                                  { topicId: topic.id, sectionId: null },
                                ]
                              : form.topics.filter(
                                  (item) => item.topicId !== topic.id,
                                ),
                          })
                        }
                      />
                      {topic.name}
                    </label>
                    {member && !!topic.sections.length && (
                      <BlogSelect
                        aria-label={`${topic.name}章节`}
                        className="ink-mg-field"
                        disabled={!!busy}
                        value={member.sectionId ?? ''}
                        onChange={(event) =>
                          patch({
                            topics: form.topics.map((item) =>
                              item.topicId === topic.id
                                ? {
                                    ...item,
                                    sectionId: Number(event.target.value) || null,
                                  }
                                : item,
                            ),
                          })
                        }
                      >
                        <option value="">未分章节</option>
                        {topic.sections.map((section) => (
                          <option key={section.id} value={section.id}>
                            {section.name}
                          </option>
                        ))}
                      </BlogSelect>
                    )}
                  </div>
                );
              })}
              {!data.availableTopics.length && (
                <p className="ink-qp-hint">暂无专题，可发布后再编排。</p>
              )}
            </div>
          )}
          <button
            type="button"
            className="ink-qp-toggle-row"
            aria-expanded={expanded === 'diff'}
            onClick={() =>
              setExpanded((previous) => (previous === 'diff' ? '' : 'diff'))
            }
          >
            <Icon
              icon="tabler:chevron-down"
              width={14}
              className={expanded === 'diff' ? 'ink-qp-open' : ''}
            />
            查看改动
            <small>
              {data.hasChanges ? '有未发布修改' : '与公开版一致'}
            </small>
          </button>
          {expanded === 'diff' && (
            <div className="ink-qp-diff">
              {[
                [
                  '标题',
                  data.check.changes.title.before,
                  form.title || data.check.draft.title,
                ],
                [
                  '概要',
                  data.check.changes.summary.before,
                  form.summary,
                ],
              ].map(([label, before, after]) => (
                <section key={label}>
                  <h4>{label}</h4>
                  <div>
                    <p>{before || '（无）'}</p>
                    <p>{after || '（无）'}</p>
                  </div>
                </section>
              ))}
              <section>
                <h4>正文</h4>
                <div>
                  <p>
                    {data.check.changes.content.before ||
                      data.check.draft.body ||
                      '（无）'}
                  </p>
                  <p>{data.check.draft.body || '（无）'}</p>
                </div>
              </section>
            </div>
          )}
          {bodyConflict && (
            <div className="ink-qp-conflict" role="group" aria-label="正文冲突处理">
              <p>原笔记与发布草稿都有修改，选择本次要发布的正文。</p>
              <label>
                <input
                  type="radio"
                  name={`body-${noteId}`}
                  value="keep"
                  checked={sourceChoice === 'keep'}
                  onChange={() => setSourceChoice('keep')}
                  disabled={!!busy}
                />
                保留发布草稿
              </label>
              <label>
                <input
                  type="radio"
                  name={`body-${noteId}`}
                  value="adopt"
                  checked={sourceChoice === 'adopt'}
                  onChange={() => setSourceChoice('adopt')}
                  disabled={!!busy}
                />
                采用原笔记最新正文
              </label>
            </div>
          )}
        </section>
      </div>

      <footer className="ink-qp-foot">
        <div>
          <BlogButton
            type="button"
            className="ink-mg-button"
            disabled={!canSave}
            onClick={() => void save('draft')}
          >
            {busy === 'save' ? '处理中…' : '保存草稿'}
          </BlogButton>
          <BlogButton
            type="button"
            className="ink-mg-button ink-mg-button-primary"
            disabled={
              !canSave ||
              (bodyConflict && !sourceChoice)
            }
            onClick={() => void save('publish')}
          >
            {publishLabel}
          </BlogButton>
        </div>
        <p>改动先存在草稿里，点「{publishLabel}」才会对外生效。</p>
      </footer>

      {coverAssistant && (
        <BlogCoverGeneratorDialog
          noteId={noteId}
          mode={coverAssistant}
          initial={{
            base,
            coverTitle: form.coverTitle,
            coverSubtitle: form.coverSubtitle,
            coverMode: form.coverMode,
            text: {
              align: data.config.align,
              palette: data.config.palette,
              sizeScale: data.config.sizeScale,
              templateVersion: data.config.templateVersion,
            },
          }}
          onApply={(result) => {
            setBase({ id: result.id, path: result.path });
            patch({
              coverTitle: result.coverTitle,
              coverSubtitle: result.coverSubtitle,
              coverMode: result.coverMode,
            });
            setNotice('封面已更新，保存后写入草稿。');
          }}
          onClose={() => setCoverAssistant(null)}
        />
      )}
    </aside>
  );
}
