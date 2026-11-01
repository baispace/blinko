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

type Options = Pick<Awaited<ReturnType<typeof api.blog.coverGenerationOptions.query>>, 'suggestedTitle'|'artPlan'|'modelTitle'|'modelKey'|'models'|'revision'|'prompt'> & {sourceVersion?:string};
type Copy = Awaited<ReturnType<typeof api.blog.generateCopyGroup.mutate>>;
type Base = { id: number | null; path: string; palette?: string; artwork?: "icon" | "tile" | "image" };

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败，请重试。';

export type CoverGeneratorInitial = {
  base?: Base | null;
  coverTitle?: string;
  coverSubtitle?: string;
  coverMode?: 'full' | 'overlay';
  /** 文章标题：卡片预览里那一行「文章标题」要显示真的那份。 */
  articleTitle?: string;
  text?: {
    align?: 'left' | 'center' | 'right';
    palette?: string;
    sizeScale?: number;
    templateVersion?: string;
    artwork?: "icon" | "tile" | "image";
  };
};

export type CoverGeneratorResult = {
  id: number | null;
  path: string;
  coverTitle: string;
  coverSubtitle: string;
  coverMode: 'full' | 'overlay';
  coverPalette?: string;
  coverArtwork?: "icon" | "tile" | "image";
};

export function BlogCoverGeneratorDialog({
  noteId = 0,
  target,
  mode = 'generate',
  initial,
  onApply,
  onClose,
}: {
  noteId?: number;
  target?: {type: 'note' | 'topic'; id:number; title?:string; description?:string};
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
  const [overlay, setOverlay] = useState(target?.type !== 'note' && initial?.coverMode !== 'full');
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
      const config = target ? await api.blog.assetCoverOptions.query({target:{type:target.type,id:target.id}}) : await api.blog.coverGenerationOptions.query({ noteId, style: nextStyle });
      if (!alive.current || request !== loadRequest.current) return;
      setOptions(config);
    } catch (error) {
      if (alive.current && request === loadRequest.current) setError(errorText(error));
    } finally {
      if (alive.current && request === loadRequest.current) setBusy(null);
    }
  };

  useEffect(() => {
    // Existing-cover previews are local: no model or publication is required.
    if (step === 'input') void load(style);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, noteId, target?.type, target?.id, step]);

  // Re-read configuration after returning from the settings tab; never generate on focus.
  useEffect(() => {
    const refresh = () => { if (step === 'input' && !busy) void load(style); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [step, busy, style, noteId, target?.type, target?.id]);

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
          ? 'AI 给的短标题不是 2–8 字（推荐 4–6 字），已保留你原来的写法。'
          : '已填入 AI 建议的封面文案，可以直接改。',
      );
    } catch (error) {
      if (alive.current) setError(errorText(error));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const generate = async () => {
    if (target?.type !== 'note' && !validShortCoverTitle(title)) {
      setError('封面大字要 2–8 字（推荐 4–6 字），它会作为淡化大字横贯画面，图标居中覆盖。');
      return;
    }
    setBusy('image');
    setError('');
    setNotice('');
    try {
      const config = options ?? (target ? await api.blog.assetCoverOptions.query({target:{type:target.type,id:target.id}}) : await api.blog.coverGenerationOptions.query({ noteId, style }));
      if (!alive.current) return;
      setOptions(config);
      const model = config.models.find((item) => item.available);
      if (!model) throw new Error('尚未配置可用生图模型，可上传图片，或到 AI 设置中配置。');
      const result = target ? await api.blog.generateAssetCover.mutate({target,sourceVersion:('sourceVersion' in config ? config.sourceVersion : '') || '',modelId:model.id,direction:direction.trim() || undefined}) : await api.blog.generateCover.mutate({
        noteId,
        modelId: model.id,
        style,
        direction: direction.trim() || undefined,
        revision: config.revision,
      });
      if (!alive.current) return;
      const list: Base[] = (result.candidates ?? []).map((item) => ({ id: item.id, path: item.path, palette: result.coverPalette, artwork: "artwork" in result ? result.artwork as "icon" | "tile" : "image" }));
      if (!list.length) throw new Error('模型没有返回图片，请重试。');
      setPicks(list);
      setPicked({ id: result.id, path: result.path, palette: result.coverPalette, artwork: "artwork" in result ? result.artwork as "icon" | "tile" : "image" });
      setPreviewTitle(title);
      setPreviewSubtitle(subtitle);
      setOverlay(target?.type !== 'note');
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
      coverMode: target?.type !== 'note' && overlay ? 'overlay' : 'full',
      coverArtwork: picked.artwork ?? initial?.text?.artwork,
      coverPalette: picked.palette ?? initial?.text?.palette,
    });
    onClose();
  };

  const invalidTitle = !!title.trim() && !validShortCoverTitle(title);
  const textConfig = target?.type !== 'note' && previewTitle.trim()
    ? {
        mode: (overlay ? 'overlay' : 'full') as 'overlay' | 'full',
        templateVersion: initial?.text?.templateVersion || COVER_TEMPLATE_VERSION,
        artwork: picked?.artwork ?? initial?.text?.artwork,
        title: previewTitle,
        subtitle: target ? '' : previewSubtitle,
        align: 'left' as const,
        sizeScale: initial?.text?.sizeScale || 1,
        palette: picked?.palette || initial?.text?.palette || 'violet',
      }
    : null;

  return (
    <Modal
      isOpen
      classNames={{wrapper:'z-[10001]',backdrop:'z-[10000]'}}
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      hideCloseButton
      disableAnimation
      isDismissable={!busy}
      isKeyboardDismissDisabled={!!busy}
      scrollBehavior="inside"
      placement="center"
      size="xl"
    >
      <ModalContent aria-label="封面助手" className="bg-background" style={{width:'min(640px, calc(100vw - 32px))',maxHeight:'calc(100dvh - 48px)',borderRadius:16,fontFamily:'-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif'}}>
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
              {target?.type === 'note' && <p className="text-sm text-default-500">根据笔记内容生成配图，应用到笔记顶部；标题由文档本身展示。生成后仍可调整裁切位置，不会发布到博客。</p>}
              <section className="flex flex-col gap-1">
                <h3 className="text-sm font-medium text-foreground">{target?.type === 'note' ? '笔记封面' : target?.type === 'topic' ? '专题封面' : '文章封面'}</h3>
                <p className="text-xs leading-6 text-default-500">主题色背景和文字由系统绘制，AI 只生成一枚无字的浅立体图标砖，避免中文错字和排版漂移。</p>
                <details className="mt-2 text-xs text-default-500">
                  <summary className="cursor-pointer">查看视觉基准</summary>
                  <img src="/cover-reference/approved-layout.png" alt="视觉基准：主题色背景、大字与中央图形组成的封面" className="mt-2 w-full rounded-lg" />
                  <p className="mt-2">此图用于对照最终版式；生图模型只负责中央图形，其余由系统稳定组合。</p>
                </details>
              </section>

              {options?.artPlan && (
                <div className="rounded-xl bg-default-50 px-3 py-2.5 text-xs leading-6 text-default-600">
                  <p>画面方案：{options.artPlan.label} · 独立图案，系统组合背景与文字</p>
                  <p>模型：{options.modelKey || options.modelTitle || '未配置生图模型'} · 每次生成一张</p>
                  {options.modelKey && options.modelKey.trim().toLowerCase() !== 'image-01' && (
                    <p>未找到可用的 image-01，暂用已配置模型；可到 AI 设置中添加。</p>
                  )}
                  <p>每次生成一张图案，自动处理透明底或纯白底。复杂背景会提示重试，不自动重复生图。</p>{!options.models.some(model => model.available) && <p className="text-warning-600">当前没有可用的生图模型。点击下方「配置生图模型」，配置完成后返回此窗口即可刷新。</p>}
                </div>
              )}

              <section className="flex flex-col gap-3" style={target?.type === 'note' ? {display:'none'} : undefined}>
                <h3 className="text-sm font-medium text-foreground">封面文字</h3>
                <label className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-2 text-sm">
                    封面大字
                    <small className="text-xs text-default-400">2–8 字（推荐 4–6 字）</small>
                    <small className={`text-xs ${invalidTitle ? 'text-danger' : 'text-default-400'}`}>
                      {shortCoverTitleLength(title)}/8
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
                      封面大字要 2–8 字（推荐 4–6 字）：它会排在画面左侧，超过 8 字请精简。
                    </small>
                  )}
                </label>
                <label className="flex flex-col gap-1.5" style={target || mode !== 'preview' || picked?.artwork === 'icon' || picked?.artwork === 'tile' || initial?.text?.artwork === 'icon' || initial?.text?.artwork === 'tile' ? {display:'none'} : undefined}>
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
                  style={target || mode !== 'preview' || picked?.artwork === 'icon' || picked?.artwork === 'tile' || initial?.text?.artwork === 'icon' || initial?.text?.artwork === 'tile' ? {display:'none'} : undefined}
                  isDisabled={!!busy || !!target}
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
                    <small className="text-xs text-default-400">可留空，留空则按当前内容自动判断</small>
                  </span>
                  <BlogTextarea
                    className="w-full"
                    rows={3}
                    maxLength={200}
                    value={direction}
                    disabled={!!busy}
                    placeholder="例如：用漏斗和三道横线组成一枚简洁图形"
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
                {target?.type === 'note' ? <span className="text-sm text-default-500">笔记顶部 · 2.35:1 · 应用后可调整裁切</span> : <CoverSceneSwitch value={scene} onChange={setScene} disabled={!!busy} />}
                <small className="text-xs text-default-400">
                  {target?.type === 'note' ? '应用配图，不叠加封面文字' : COVER_PREVIEW_SCENES.find((item) => item.key === scene)?.note}
                </small>
              </div>
              {picked ? (
                target?.type === 'note' ? <img src={blogImageUrl(picked.path)} alt="笔记封面预览" className="w-full aspect-[2.35/1] object-cover rounded-lg" /> : <CoverScenePreview
                  scene={scene}
                  src={blogImageUrl(picked.path)}
                  title={options?.suggestedTitle ?? initial?.articleTitle}
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
              <div className="flex flex-col gap-3" style={target?.type === 'note' ? {display:'none'} : undefined}>
                <label className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-2 text-sm">
                    封面大字
                    <small className="text-xs text-default-400">2–8 字（推荐 4–6 字）</small>
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
                <label className="flex flex-col gap-1.5" style={target || mode !== 'preview' || picked?.artwork === 'icon' || picked?.artwork === 'tile' || initial?.text?.artwork === 'icon' || initial?.text?.artwork === 'tile' ? {display:'none'} : undefined}>
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
                    disabled={!!busy || target?.type === 'note'}
                    onChange={(event) => setOverlay(event.target.checked)}
                  />
                  在图片上显示标题
                </label>
                <p className="text-xs text-default-500">
                  短标题横贯画面，淡化后置于居中图标后方；图案保持完整，极小缩略图隐藏文字。
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {target?.type === 'note' ? <span className="text-sm text-default-500">笔记顶部 · 2.35:1 · 应用后可调整裁切</span> : <CoverSceneSwitch value={scene} onChange={setScene} disabled={!!busy} />}
                  <small className="text-xs text-default-400">
                    {target?.type === 'note' ? '应用配图，不叠加封面文字' : COVER_PREVIEW_SCENES.find((item) => item.key === scene)?.note}
                  </small>
                </div>
                {picked ? (
                  target?.type === 'note' ? <img src={blogImageUrl(picked.path)} alt="笔记封面预览" className="w-full aspect-[2.35/1] object-cover rounded-lg" /> : <CoverScenePreview
                    scene={scene}
                    src={blogImageUrl(picked.path)}
                    title={options?.suggestedTitle ?? initial?.articleTitle}
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
              ? target?.type === 'note' ? '先生成候选配图，点击应用后才会修改笔记封面。' : target?.type === 'topic' ? '先生成候选封面，保存专题资料后生效。' : '生成的只是草稿底图，保存后才会进入发布设置。'
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
                {options && !options.models.some(model => model.available) ? (
                  <a href="/settings?section=ai" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground"
                    aria-label="配置生图模型（在新标签页打开）">
                    <Icon icon="tabler:settings" width={16} />配置生图模型
                  </a>
                ) : (
                  <button type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!!busy || (!!options && target?.type !== 'note' && !validShortCoverTitle(title))}
                    onClick={() => { if (!options) void load(style); else void generate(); }}>
                    <Icon icon="tabler:sparkles" width={15} />
                    {busy === 'image' ? '正在生成…' : busy === 'load' ? '读取配置中…' : !options ? '重试读取配置' : '生成封面'}
                  </button>
                )}
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
                {/*
                  直接从「已有封面」进来的预览：这一步没有刚生成的候选，
                  「返回」没有上一站可回 —— 换成「重新生成封面」，一条路走到底。
                */}
                {mode === 'preview' && !picks.length ? (
                  <Button
                    variant="flat"
                    isDisabled={!!busy}
                    onPress={() => setStep('input')}
                    startContent={<Icon icon="tabler:refresh" width={15} />}
                  >
                    重新生成封面
                  </Button>
                ) : (
                  <Button
                    variant="flat"
                    isDisabled={!!busy}
                    onPress={() => setStep(picks.length || mode === 'generate' ? 'result' : 'input')}
                    startContent={<Icon icon="tabler:arrow-left" width={15} />}
                  >
                    返回
                  </Button>
                )}
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
