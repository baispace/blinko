import { useEffect, useRef, useState } from 'react';
import { Button, Card, CardBody, Chip } from '@heroui/react';
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
import { BlogCheckbox, BlogInput, BlogSelect, BlogTextarea } from './BlogUI';
import { confirmBlogAction } from './confirmBlogAction';
import { CONTENT_STATUS_META, resolveContentStatus } from './contentStatus';
import {
  shortCoverTitleLength,
  validShortCoverTitle,
} from '@shared/lib/blogPublishSettings';

type Settings = Awaited<ReturnType<typeof api.blog.publishSettings.query>>;
type Copy = Awaited<ReturnType<typeof api.blog.generateCopyGroup.mutate>>;
type Base = { id: number | null; path: string } | null;
type Form = {
  title: string;
  summary: string;
  coverTitle: string;
  coverSubtitle: string;
  coverMode: 'full' | 'overlay';
  coverPalette: string;
  displayMode: 'default' | 'pinned' | 'featured';
  displayOrder: number;
  topics: { topicId: number; sectionId: number | null }[];
};

const copyFields = [
  ['title', '公开标题'],
  ['summary', '文章概要'],
  ['coverTitle', '封面短标题'],
] as const;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败，请重试。';

export function ContentQuickPanel({
  noteId,
  onChanged,
  onClose,
  focus,
}: {
  noteId: number | null;
  onChanged?: () => void | Promise<void>;
  onClose?: () => void;
  focus?: boolean;
}) {
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
        coverPalette: state.config.palette,
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
      <Card className="rounded-xl border border-default-200 shadow-none">
        <CardBody className="py-8 text-center text-sm text-default-500">
          选中左侧的一篇文章，这里会显示它的快捷操作。
        </CardBody>
      </Card>
    );

  if (!form || !data)
    return (
      <Card className="rounded-xl border border-default-200 shadow-none">
        <CardBody className="py-8 text-center text-sm">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : (
            <span className="text-default-500">正在读取…</span>
          )}
        </CardBody>
      </Card>
    );

  const invalidShort =
    !!form.coverTitle && !validShortCoverTitle(form.coverTitle);
  const missingShort = !!base && form.coverMode === 'overlay' && !form.coverTitle.trim();
  const canSave = !busy && !invalidShort && !missingShort;
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
    palette: form.coverPalette,
  };

  return (
    <aside
      className={`space-y-4 rounded-xl border border-default-200 bg-surface ${
        focus ? 'ring-2 ring-primary/30' : ''
      }`}
      aria-label="快捷操作"
    >
      {/* 头部 */}
      <div className="flex items-center justify-between gap-3 border-b border-default-200 px-4 py-3">
        <div className="min-w-0">
          <strong className="block truncate text-sm font-semibold">
            {data.title || '未命名文章'}
          </strong>
          <span className="text-xs text-default-500">
            <Chip size="sm" variant="flat" color={state === 'published' ? 'success' : 'default'}>
              {CONTENT_STATUS_META[state].label}
            </Chip>
            {data.revision ? ` · v${data.revision}` : ''}
          </span>
        </div>
        {onClose && (
          <Button
            size="sm"
            isIconOnly
            variant="light"
            aria-label="收起快捷操作"
            onPress={onClose}
          >
            <Icon icon="tabler:x" width={16} />
          </Button>
        )}
      </div>

      {!!notice && (
        <p className="mx-4 rounded-lg bg-success-50 px-3 py-2 text-xs text-success" role="status">
          {notice}
        </p>
      )}
      {!!error && (
        <p className="mx-4 rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="max-h-[calc(100dvh-260px)] space-y-4 overflow-y-auto px-4 pb-4">
        {/* ---------- ① 管理内容 ---------- */}
        <section className="space-y-3 pt-1">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Icon icon="tabler:edit" width={15} />
            管理内容
          </h3>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-default-500">公开标题</span>
            <BlogInput
              className="w-full"
              maxLength={200}
              value={form.title}
              disabled={!!busy}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="留空时沿用正文标题"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-default-500">文章概要</span>
            <BlogTextarea
              className="w-full"
              rows={3}
              maxLength={2000}
              value={form.summary}
              disabled={!!busy}
              onChange={(event) => patch({ summary: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-xs font-medium text-default-500">
              封面短标题
              <small className="text-default-400">4–6 字</small>
              <small className={invalidShort ? 'text-danger' : 'text-default-400'}>
                {shortCoverTitleLength(form.coverTitle)}/6
              </small>
            </span>
            <BlogInput
              className="w-full"
              maxLength={24}
              aria-invalid={invalidShort || missingShort}
              value={form.coverTitle}
              disabled={!!busy}
              onChange={(event) => patch({ coverTitle: event.target.value })}
              placeholder="例如：三段式改造"
            />
            {(invalidShort || missingShort) && (
              <small className="text-xs text-danger">
                {missingShort
                  ? '在图片上显示标题时，封面短标题不能为空。'
                  : '封面短标题要 4–6 字，太长会被裁断。'}
              </small>
            )}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-xs font-medium text-default-500">
              封面小字
              <small className="text-default-400">可留空</small>
            </span>
            <BlogInput
              className="w-full"
              maxLength={40}
              value={form.coverSubtitle}
              disabled={!!busy}
              onChange={(event) => patch({ coverSubtitle: event.target.value })}
              placeholder="例如：一次上线，三段召回"
            />
          </label>
          <Button
            size="sm"
            variant="flat"
            isDisabled={!!busy}
            startContent={<Icon icon="tabler:sparkles" width={15} />}
            onPress={() => void suggest()}
          >
            {busy === 'copy' ? '正在想…' : 'AI 优化文案'}
          </Button>
          {copy && (
            <div className="space-y-2 rounded-lg border border-default-200 bg-default-50 p-3">
              <p className="text-xs text-default-500">选择要采用的建议，未选字段保留当前内容。</p>
              {copyFields.map(([key, label]) => (
                <label key={key} className="flex items-start gap-2 text-sm">
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
                  <span className="min-w-0">
                    <b className="block text-xs">{label}</b>
                    <span className="block truncate text-xs text-default-500">
                      {copy[key] || '未生成'}
                    </span>
                  </span>
                </label>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="light"
                  isDisabled={!!busy}
                  onPress={() => setCopy(null)}
                >
                  暂不采用
                </Button>
                <Button
                  size="sm"
                  color="primary"
                  isDisabled={!!busy || !copyPicked.length}
                  onPress={() => {
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
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* ---------- ② 封面生成 ---------- */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Icon icon="tabler:photo" width={15} />
            封面生成
          </h3>
          <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg border border-default-200 bg-default-50">
            {base ? (
              <CoverCanvas
                key={base.path}
                src={blogImageUrl(base.path)}
                config={coverConfig}
                placement="double"
                loading="eager"
              />
            ) : (
              <p className="text-sm text-default-400">尚未设置封面</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              color="primary"
              isDisabled={!!busy}
              startContent={<Icon icon="tabler:sparkles" width={15} />}
              onPress={() => setCoverAssistant('generate')}
            >
              生成封面
            </Button>
            <Button
              size="sm"
              variant="flat"
              isDisabled={!!busy || !base}
              startContent={<Icon icon="tabler:eye" width={15} />}
              onPress={() => setCoverAssistant('preview')}
            >
              预览封面
            </Button>
            <Button
              size="sm"
              variant="flat"
              isDisabled={!!busy}
              onPress={() => file.current?.click()}
            >
              {busy === 'upload' ? '正在上传…' : '上传替换'}
            </Button>
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
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-default-500">已有图片</span>
              <BlogSelect
                className="w-full"
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
          <label className="flex items-center gap-2 text-sm">
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
            <button
              type="button"
              className="text-xs text-primary hover:underline disabled:text-default-400"
              disabled={!!busy}
              onClick={() => setBase(null)}
            >
              移除草稿封面
            </button>
          )}
        </section>

        {/* ---------- ③ 运营管理 ---------- */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Icon icon="tabler:adjustments" width={15} />
            运营管理
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.isPublished ? (
              <Button
                size="sm"
                variant="flat"
                isDisabled={!!busy}
                onPress={() => void withdraw()}
              >
                撤回发布
              </Button>
            ) : null}
            {data.publishId ? (
              <Button
                size="sm"
                variant="flat"
                as="a"
                href={`/blog/${data.publishId}`}
                target="_blank"
                rel="noopener noreferrer"
                endContent={<Icon icon="tabler:external-link" width={14} />}
              >
                查看公开页
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="flat"
              as="a"
              href={`/detail?id=${noteId}`}
              target="_blank"
              rel="noopener noreferrer"
              endContent={<Icon icon="tabler:external-link" width={14} />}
            >
              编辑原笔记
            </Button>
          </div>

          {/* 首页展示 */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-default-500">首页展示</span>
            <div className="grid grid-cols-1 gap-2" role="group" aria-label="首页展示">
              {(
                [
                  ['featured', '首页精选', '默认 · 加入 Banner，同时置顶'],
                  ['pinned', '列表置顶', '优先出现在推荐列表'],
                  ['default', '默认展示', '按列表规则排序'],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-lg border p-2.5 text-left text-sm transition-colors ${
                    form.displayMode === value
                      ? 'border-primary bg-primary/5'
                      : 'border-default-200 hover:border-default-300'
                  }`}
                  aria-pressed={form.displayMode === value}
                  disabled={!!busy}
                  onClick={() => patch({ displayMode: value })}
                >
                  <strong className="block text-sm font-semibold">{label}</strong>
                  <small className="text-xs text-default-500">{hint}</small>
                </button>
              ))}
            </div>
          </div>

          {form.displayMode !== 'default' && (
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-xs font-medium text-default-500">
                展示顺序
                <small className="text-default-400">数值越小越靠前</small>
              </span>
              <BlogInput
                type="number"
                className="w-full"
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

          {/* 专题与章节 */}
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium transition-colors hover:bg-default-100"
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
              className={`text-default-400 transition-transform ${expanded === 'topics' ? 'rotate-180' : ''}`}
            />
            专题与章节
            <small className="ml-auto text-xs font-normal text-default-500">
              {form.topics.length ? `${form.topics.length} 个专题` : '未归属'}
            </small>
          </button>
          {expanded === 'topics' && (
            <div className="space-y-2 pl-6">
              {data.availableTopics.map((topic) => {
                const member = form.topics.find(
                  (item) => item.topicId === topic.id,
                );
                return (
                  <div key={topic.id} className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
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
                        className="w-full"
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
                <p className="text-xs text-default-500">暂无专题，可发布后再编排。</p>
              )}
            </div>
          )}

          {/* 查看改动 */}
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-medium transition-colors hover:bg-default-100"
            aria-expanded={expanded === 'diff'}
            onClick={() =>
              setExpanded((previous) => (previous === 'diff' ? '' : 'diff'))
            }
          >
            <Icon
              icon="tabler:chevron-down"
              width={14}
              className={`text-default-400 transition-transform ${expanded === 'diff' ? 'rotate-180' : ''}`}
            />
            查看改动
            <small className="ml-auto text-xs font-normal text-default-500">
              {data.hasChanges ? '有未发布修改' : '与公开版一致'}
            </small>
          </button>
          {expanded === 'diff' && (
            <div className="space-y-3 pl-6">
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
                  <h4 className="text-xs font-semibold text-default-500">{label}</h4>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded bg-default-50 p-2 text-default-600">
                      <p>{before || '（无）'}</p>
                    </div>
                    <div className="rounded bg-primary/5 p-2 text-default-700">
                      <p>{after || '（无）'}</p>
                    </div>
                  </div>
                </section>
              ))}
              <section>
                <h4 className="text-xs font-semibold text-default-500">正文</h4>
                <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-default-50 p-2 text-default-600">
                    <p>
                      {data.check.changes.content.before ||
                        data.check.draft.body ||
                        '（无）'}
                    </p>
                  </div>
                  <div className="rounded bg-primary/5 p-2 text-default-700">
                    <p>{data.check.draft.body || '（无）'}</p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {bodyConflict && (
            <div className="space-y-2 rounded-lg border border-warning-200 bg-warning-50 p-3" role="group" aria-label="正文冲突处理">
              <p className="text-xs text-warning">原笔记与发布草稿都有修改，选择本次要发布的正文。</p>
              <label className="flex items-center gap-2 text-sm">
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
              <label className="flex items-center gap-2 text-sm">
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

      {/* 底部操作 */}
      <div className="border-t border-default-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="flat"
            className="flex-1"
            isDisabled={!canSave}
            onPress={() => void save('draft')}
          >
            {busy === 'save' ? '处理中…' : '保存草稿'}
          </Button>
          <Button
            size="sm"
            color="primary"
            className="flex-1"
            isDisabled={
              !canSave ||
              (bodyConflict && !sourceChoice)
            }
            onPress={() => void save('publish')}
          >
            {publishLabel}
          </Button>
        </div>
        <p className="mt-2 text-center text-xs text-default-500">
          改动先存在草稿里，点「{publishLabel}」才会对外生效。
        </p>
      </div>

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
              palette: form.coverPalette,
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
              coverPalette: result.coverPalette ?? form.coverPalette,
            });
            setNotice('封面已更新，保存后写入草稿。');
          }}
          onClose={() => setCoverAssistant(null)}
        />
      )}
    </aside>
  );
}
