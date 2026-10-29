import { useEffect, useRef, useState } from 'react';
import { Button, Modal, ModalContent } from '@heroui/react';
import { api } from '@/lib/trpc';
import { blogImageUrl } from '@/lib/blogImage';
import { Icon } from '@/components/Common/Iconify/icons';
import {
  COVER_PREVIEW_SCENES,
  CoverScenePreview,
  CoverSceneSwitch,
  type CoverPreviewSceneKey,
} from './BlogCoverPreview';
import { BlogInput, BlogTextarea, BlogCheckbox } from './BlogUI';
import {
  shortCoverTitleLength,
  validShortCoverTitle,
} from '@shared/lib/blogPublishSettings';
import { COVER_TEMPLATE_VERSION } from '@shared/lib/blogCoverText';

type Options = Awaited<ReturnType<typeof api.blog.coverGenerationOptions.query>>;
type Copy = Awaited<ReturnType<typeof api.blog.generateCopyGroup.mutate>>;
type Base = { id: number | null; path: string; palette?: string };

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败，请重试。';

export type CoverGeneratorInitial = {
  base?: Base | null;
  coverTitle?: string;
  coverSubtitle?: string;
  coverMode?: 'full' | 'overlay';
  text?: {
    align?: 'left' | 'center' | 'right';
    palette?: string;
    sizeScale?: number;
    templateVersion?: string;
  };
};

export type CoverGeneratorResult = {
  id: number | null;
  path: string;
  coverTitle: string;
  coverSubtitle: string;
  coverMode: 'full' | 'overlay';
  coverPalette?: string;
};

export function BlogCoverGeneratorDialog({
  noteId,
  mode = 'generate',
  initial,
  onApply,
  onClose,
}: {
  noteId: number;
  mode?: 'generate' | 'preview';
  initial?: CoverGeneratorInitial;
  onApply?: (result: CoverGeneratorResult) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'input' | 'result' | 'preview'>(
    mode === 'preview' && initial?.base ? 'preview' : 'input',
  );
  const [busy, setBusy] = useState<null | 'load' | 'copy' | 'image'>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const style = 'ink' as const;
  const [title, setTitle] = useState(initial?.coverTitle ?? '');
  const [subtitle, setSubtitle] = useState(initial?.coverSubtitle ?? '');
  const [direction, setDirection] = useState('');
  const [options, setOptions] = useState<Options | null>(null);
  const [picks, setPicks] = useState<Base[]>([]);
  const [picked, setPicked] = useState<Base | null>(initial?.base ?? null);
  const [previewTitle, setPreviewTitle] = useState(initial?.coverTitle ?? '');
  const [previewSubtitle, setPreviewSubtitle] = useState(initial?.coverSubtitle ?? '');
  const [overlay, setOverlay] = useState(initial?.coverMode !== 'full');
  const [scene, setScene] = useState<CoverPreviewSceneKey>('double');
  const alive = useRef(true);
  const loadRequest = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = async (nextStyle: 'ink') => {
    const request = ++loadRequest.current;
    setOptions(null);
    setBusy('load');
    setError('');
    try {
      const config = await api.blog.coverGenerationOptions.query({ noteId, style: nextStyle });
      if (!alive.current || request !== loadRequest.current) return;
      setOptions(config);
    } catch (error) {
      if (alive.current && request === loadRequest.current) setError(errorText(error));
    } finally {
      if (alive.current && request === loadRequest.current) setBusy(null);
    }
  };

  useEffect(() => {
    void load(style);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, noteId]);

  const suggest = async () => {
    setBusy('copy');
    setError('');
    setNotice('');
    try {
      const copy: Copy = await api.blog.generateCopyGroup.mutate({ noteId });
      if (!alive.current) return;
      if (copy.coverTitle?.trim() && validShortCoverTitle(copy.coverTitle))
        setTitle(copy.coverTitle.trim());
      if (copy.summary?.trim()) setSubtitle(copy.summary.trim().slice(0, 20));
      setNotice(
        copy.coverTitle?.trim() && !validShortCoverTitle(copy.coverTitle)
          ? 'AI 给的短标题不是 4–6 字，已保留你原来的写法。'
          : '已填入 AI 建议的封面文案，可以直接改。',
      );
    } catch (error) {
      if (alive.current) setError(errorText(error));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const generate = async () => {
    if (!validShortCoverTitle(title)) {
      setError('封面大字要 4–6 字，它会排在画面左侧，系统会为文字和插画分别留出空间。');
      return;
    }
    setBusy('image');
    setError('');
    setNotice('');
    try {
      const config = options ?? (await api.blog.coverGenerationOptions.query({ noteId, style }));
      if (!alive.current) return;
      setOptions(config);
      const model = config.models.find((item) => item.available);
      if (!model) throw new Error('尚未配置可用生图模型，可上传图片，或到 AI 设置中配置。');
      const result = await api.blog.generateCover.mutate({
        noteId,
        modelId: model.id,
        style,
        direction: direction.trim() || undefined,
        revision: config.revision,
      });
      if (!alive.current) return;
      const list = (result.candidates ?? []).map((item) => ({ id: item.id, path: item.path, palette: result.coverPalette }));
      if (!list.length) throw new Error('模型没有返回图片，请重试。');
      setPicks(list);
      setPicked({ id: result.id, path: result.path, palette: result.coverPalette });
      setPreviewTitle(title);
      setPreviewSubtitle(subtitle);
      setOverlay(true);
      setStep('result');
      setNotice(
        list.length > 1
          ? `出了 ${list.length} 张，选一张用；也可以先看看各场景的效果。`
          : '封面已生成，可以先看看各场景的效果。',
      );
    } catch (error) {
      if (alive.current) setError(errorText(error));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const apply = () => {
    if (!picked) return;
    onApply?.({
      id: picked.id,
      path: picked.path,
      coverTitle: previewTitle,
      coverSubtitle: previewSubtitle,
      coverMode: overlay ? 'overlay' : 'full',
      coverPalette: picked.palette ?? initial?.text?.palette,
    });
    onClose();
  };

  const invalidTitle = !!title.trim() && !validShortCoverTitle(title);
  const textConfig = previewTitle.trim()
    ? {
        mode: (overlay ? 'overlay' : 'full') as 'overlay' | 'full',
        templateVersion: initial?.text?.templateVersion || COVER_TEMPLATE_VERSION,
        title: previewTitle,
        subtitle: previewSubtitle,
        align: initial?.text?.align || ('left' as const),
        sizeScale: initial?.text?.sizeScale || 1,
        palette: picked?.palette || initial?.text?.palette || 'violet',
      }
    : null;

  return (
    <Modal
      isOpen
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      hideCloseButton
      disableAnimation
      isDismissable={!busy}
      isKeyboardDismissDisabled={!!busy}
      scrollBehavior="inside"
      placement="center"
      size="xl"
    >
      <ModalContent aria-label="封面助手" className="bg-background">
        <header className="flex items-center justify-between border-b border-default-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">封面助手</h2>
            <small className="text-sm text-default-500">
              {step === 'input'
                ? '先说清楚想要什么，再出图'
                : step === 'result'
                  ? '选一张，然后看它在各个位置上的样子'
                  : '这是封面在公开站上的真实效果'}
            </small>
          </div>
          <Button
            isIconOnly
            variant="light"
            onPress={onClose}
            isDisabled={!!busy}
            aria-label="关闭封面助手"
          >
            <Icon icon="tabler:x" width={18} />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4" aria-busy={!!busy}>
          {busy === 'load' && <p className="text-sm text-default-500" role="status">正在读取生图设置…</p>}
          {busy === 'copy' && <p className="text-sm text-default-500" role="status">正在想文案…</p>}
          {busy === 'image' && (
            <p className="text-sm text-default-500" role="status">正在生成封面配图，稍等片刻…</p>
          )}
          {!!notice && (
            <div className="mb-3 rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary" role="status">
              {notice}
            </div>
          )}
          {!!error && (
            <div className="mb-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </div>
          )}

          {step === 'input' && (
            <div className="flex flex-col gap-5">
              <section className="flex flex-col gap-1">
                <h3 className="text-sm font-medium text-foreground">文章封面</h3>
                <p className="text-xs leading-6 text-default-500">统一使用大幅白色界面卡片与浅立体叠层，物件和配色随文章主题变化。</p>
              </section>

              {options?.artPlan && (
                <div className="rounded-xl bg-default-50 px-3 py-2.5 text-xs leading-6 text-default-600">
                  <p>画面方案：{options.artPlan.label} · 单张插画，系统按场景安排图文位置</p>
                  <p>模型：{options.modelKey || options.modelTitle} · 每次生成一张</p>
                  {options.modelKey && options.modelKey.trim().toLowerCase() !== 'image-01' && (
                    <p>未找到可用的 image-01，暂用已配置模型；可到 AI 设置中添加。</p>
                  )}
                  <p>复用固定视觉规范，不上传参考图，不额外调用 AI 分析。</p>
                </div>
              )}

              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-medium text-foreground">封面文字</h3>
                <label className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-2 text-sm">
                    封面大字
                    <small className="text-xs text-default-400">4–6 字</small>
                    <small className={`text-xs ${invalidTitle ? 'text-danger' : 'text-default-400'}`}>
                      {shortCoverTitleLength(title)}/6
                    </small>
                  </span>
                  <BlogInput
                    className="w-full"
                    maxLength={24}
                    value={title}
                    disabled={!!busy}
                    aria-invalid={invalidTitle}
                    placeholder="例如：三段式改造"
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  {invalidTitle && (
                    <small className="text-xs text-danger">
                      封面大字要 4–6 字：它会排在画面左侧，太长会被裁断。
                    </small>
                  )}
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-2 text-sm">
                    封面小字
                    <small className="text-xs text-default-400">可留空</small>
                  </span>
                  <BlogInput
                    className="w-full"
                    maxLength={40}
                    value={subtitle}
                    disabled={!!busy}
                    placeholder="例如：一次上线，三段召回"
                    onChange={(event) => setSubtitle(event.target.value)}
                  />
                </label>
                <Button
                  size="sm"
                  variant="flat"
                  isDisabled={!!busy}
                  onPress={() => void suggest()}
                  startContent={<Icon icon="tabler:sparkles" width={15} />}
                  className="self-start"
                >
                  {busy === 'copy' ? '正在想…' : '让 AI 想文案'}
                </Button>
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-medium text-foreground">想画什么</h3>
                <label className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-2 text-sm">
                    画面描述
                    <small className="text-xs text-default-400">可留空，留空则按文章内容自动判断</small>
                  </span>
                  <BlogTextarea
                    className="w-full"
                    rows={3}
                    maxLength={200}
                    value={direction}
                    disabled={!!busy}
                    placeholder="例如：三段流程的立体图解，中间是漏斗，两侧是数据卡片"
                    onChange={(event) => setDirection(event.target.value)}
                  />
                </label>
                {!!options?.prompt && (
                  <details className="group rounded-lg border border-default-200 p-3">
                    <summary className="flex cursor-pointer items-center gap-2 text-sm text-default-600">
                      <Icon
                        icon="tabler:chevron-right"
                        width={14}
                        className="transition-transform group-open:rotate-90"
                      />
                      查看基础提示词
                    </summary>
                    <pre className="mt-2 overflow-x-auto rounded bg-default-50 p-3 text-xs text-default-600">
                      {options.prompt}
                    </pre>
                    {direction.trim() && (
                      <p className="mt-2 text-xs text-default-500">
                        你的画面要求会一起发给模型：{direction.trim()}
                      </p>
                    )}
                  </details>
                )}
              </section>
            </div>
          )}

          {step === 'result' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CoverSceneSwitch value={scene} onChange={setScene} disabled={!!busy} />
                <small className="text-xs text-default-400">
                  {COVER_PREVIEW_SCENES.find((item) => item.key === scene)?.note}
                </small>
              </div>
              {picked ? (
                <CoverScenePreview
                  scene={scene}
                  src={blogImageUrl(picked.path)}
                  title={options?.suggestedTitle}
                  config={textConfig}
                />
              ) : (
                <p className="py-8 text-center text-sm text-default-500">尚未生成</p>
              )}
              {picks.length > 1 && (
                <div className="flex flex-col gap-2" role="group" aria-label="候选底图">
                  <p className="text-sm text-default-500">出了 {picks.length} 张，选一张用：</p>
                  <div className="flex gap-2 overflow-x-auto">
                    {picks.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                          picked?.id === item.id ? 'border-primary' : 'border-default-200 hover:border-default-300'
                        }`}
                        aria-pressed={picked?.id === item.id}
                        disabled={!!busy}
                        onClick={() => setPicked(item)}
                      >
                        <img
                          src={blogImageUrl(item.path)}
                          alt="候选底图"
                          loading="lazy"
                          className="h-16 w-28 object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="flex flex-col gap-5" role="region" aria-label="封面预览">
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-2 text-sm">
                    封面大字
                    <small className="text-xs text-default-400">4–6 字</small>
                  </span>
                  <BlogInput
                    className="w-full"
                    maxLength={24}
                    value={previewTitle}
                    disabled={!!busy}
                    placeholder="例如：三段式改造"
                    onChange={(event) => setPreviewTitle(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-2 text-sm">
                    封面小字
                    <small className="text-xs text-default-400">可留空</small>
                  </span>
                  <BlogInput
                    className="w-full"
                    maxLength={40}
                    value={previewSubtitle}
                    disabled={!!busy}
                    placeholder="例如：一次上线，三段召回"
                    onChange={(event) => setPreviewSubtitle(event.target.value)}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <BlogCheckbox
                    type="checkbox"
                    checked={overlay}
                    disabled={!!busy}
                    onChange={(event) => setOverlay(event.target.checked)}
                  />
                  在图片上显示标题
                </label>
                <p className="text-xs text-default-500">
                  文字与插画分区展示，不互相遮挡。Banner 留出底部控件位置；卡片突出短标题；列表小图自动隐藏副标题。
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CoverSceneSwitch value={scene} onChange={setScene} disabled={!!busy} />
                  <small className="text-xs text-default-400">
                    {COVER_PREVIEW_SCENES.find((item) => item.key === scene)?.note}
                  </small>
                </div>
                {picked ? (
                  <CoverScenePreview
                    scene={scene}
                    src={blogImageUrl(picked.path)}
                    title={options?.suggestedTitle}
                    config={textConfig}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-default-500">还没有底图</p>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-default-200 px-5 py-4">
          <p className="text-xs text-default-500">
            {step === 'input'
              ? '生成的只是草稿底图，保存后才会进入发布设置。'
              : step === 'result'
                ? '先看看效果，满意再应用。'
                : '预览的是待发布效果；应用后仍需在发布设置里保存。'}
          </p>
          <div className="flex gap-2">
            {step === 'input' && (
              <>
                <Button variant="flat" isDisabled={!!busy} onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="primary"
                  isDisabled={!!busy || !validShortCoverTitle(title)}
                  onPress={() => void generate()}
                  startContent={<Icon icon="tabler:sparkles" width={15} />}
                >
                  {busy === 'image' ? '正在生成…' : '生成封面'}
                </Button>
              </>
            )}
            {step === 'result' && (
              <>
                <Button variant="flat" isDisabled={!!busy} onPress={() => setStep('input')} startContent={<Icon icon="tabler:arrow-left" width={15} />}>
                  改一下条件
                </Button>
                <Button variant="flat" isDisabled={!!busy} onPress={() => void generate()} startContent={<Icon icon="tabler:refresh" width={15} />}>
                  重新生成
                </Button>
                <Button color="primary" isDisabled={!!busy} onPress={() => setStep('preview')} startContent={<Icon icon="tabler:eye" width={15} />}>
                  预览各场景
                </Button>
              </>
            )}
            {step === 'preview' && (
              <>
                <Button
                  variant="flat"
                  isDisabled={!!busy}
                  onPress={() => setStep(picks.length || mode === 'generate' ? 'result' : 'input')}
                  startContent={<Icon icon="tabler:arrow-left" width={15} />}
                >
                  返回
                </Button>
                <Button color="primary" isDisabled={!!busy || !picked} onPress={apply}>
                  应用到封面
                </Button>
              </>
            )}
          </div>
        </footer>
      </ModalContent>
    </Modal>
  );
}
