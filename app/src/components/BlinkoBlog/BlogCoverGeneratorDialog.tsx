import { useEffect, useRef, useState } from 'react';
import { Modal, ModalContent } from '@heroui/react';
import { api } from '@/lib/trpc';
import { blogImageUrl } from '@/lib/blogImage';
import { readBlogTheme } from '@/lib/blogTheme';
import { Icon } from '@/components/Common/Iconify/icons';
import { CoverCanvas } from './CoverCanvas';
import { BlogButton, BlogInput, BlogTextarea, BlogCheckbox } from './BlogUI';
import {
  shortCoverTitleLength,
  validShortCoverTitle,
} from '@shared/lib/blogPublishSettings';
import { COVER_TEMPLATE_VERSION } from '@shared/lib/blogCoverText';
import './cover-generator.css';

type Options = Awaited<ReturnType<typeof api.blog.coverGenerationOptions.query>>;
type Copy = Awaited<ReturnType<typeof api.blog.generateCopyGroup.mutate>>;
type CoverStyle = 'ink' | 'minimal' | 'editorial';
type Base = { id: number | null; path: string };

/**
 * 预览用的真实容器尺寸（取自公开站实际 CSS）。
 * 排版按真实尺寸算，所以缩放只影响看的尺寸，字号与断行跟线上完全一致。
 */
const PREVIEW_SCENES: {
  key: 'double' | 'single' | 'banner';
  label: string;
  width: number;
  height: number;
  note: string;
  scale?: number;
}[] = [
  { key: 'double', label: '双栏卡片', width: 640, height: 229, note: '首页头条大图 2.8:1', scale: 0.68 },
  { key: 'single', label: '单栏列表', width: 420, height: 236, note: '卡片与列表缩略图 16:9', scale: 0.68 },
  { key: 'banner', label: '首页 Banner', width: 720, height: 248, note: '桌面首页横幅 2.9:1', scale: 0.68 },
];

const STYLES: { value: CoverStyle; label: string; hint: string }[] = [
  { value: 'ink', label: '紫蓝渐变', hint: '2.5D 立体界面卡片与图表' },
  { value: 'minimal', label: '极简留白', hint: '少量几何物件，背景更安静' },
  { value: 'editorial', label: '杂志质感', hint: '静物雕塑，自然光' },
];

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败，请重试。';

export type CoverGeneratorInitial = {
  /** 现有底图：预览模式直接看它，生成模式作为「已选中的图」。 */
  base?: Base | null;
  coverTitle?: string;
  coverSubtitle?: string;
  coverMode?: 'full' | 'overlay';
  /** 公开版封面的文字配置，预览要跟线上排版一致。 */
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
};

/**
 * 封面助手：把封面这件事从「管理发布」里拆出来。
 *
 * 流程按「先想清楚 → 再出图 → 再看效果」走：
 *   1. 填信息：画面风格、封面大字、想画什么；
 *   2. 出图：一次出几张候选，选一张；
 *   3. 预览：按公开站的真实尺寸看它在各个位置上的样子；
 *   4. 应用：确认后把底图和文字写回发布设置。
 *
 * 这一步只改草稿：公开快照要等作者点「更新发布」才变。
 */
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
  const [theme] = useState(readBlogTheme);
  const [step, setStep] = useState<'input' | 'result' | 'preview'>(
    mode === 'preview' && initial?.base ? 'preview' : 'input',
  );
  const [busy, setBusy] = useState<null | 'load' | 'copy' | 'image'>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [style, setStyle] = useState<CoverStyle>('ink');
  const [title, setTitle] = useState(initial?.coverTitle ?? '');
  const [subtitle, setSubtitle] = useState(initial?.coverSubtitle ?? '');
  const [direction, setDirection] = useState('');
  const [options, setOptions] = useState<Options | null>(null);
  const [picks, setPicks] = useState<Base[]>([]);
  const [picked, setPicked] = useState<Base | null>(initial?.base ?? null);
  const [previewTitle, setPreviewTitle] = useState(initial?.coverTitle ?? '');
  const [previewSubtitle, setPreviewSubtitle] = useState(initial?.coverSubtitle ?? '');
  const [overlay, setOverlay] = useState(initial?.coverMode !== 'full');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** 读一次可用的生图模型与提示词模板：风格变了要重新读。 */
  const load = async (nextStyle: CoverStyle) => {
    setBusy('load');
    setError('');
    try {
      const config = await api.blog.coverGenerationOptions.query({
        noteId,
        style: nextStyle,
      });
      if (!alive.current) return;
      setOptions(config);
    } catch (error) {
      if (alive.current) setError(errorText(error));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  useEffect(() => {
    void load(style);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  /** AI 建议：一句话给出封面大字与副标题，省得自己想。 */
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
      setError('封面大字要 4–6 字，它会排在画面左侧，模型需要知道留多大位置。');
      return;
    }
    setBusy('image');
    setError('');
    setNotice('');
    try {
      const config =
        options ??
        (await api.blog.coverGenerationOptions.query({ noteId, style }));
      if (!alive.current) return;
      setOptions(config);
      const model = config.models.find((item) => item.available);
      if (!model)
        throw new Error('尚未配置可用生图模型，可上传图片，或到 AI 设置中配置。');
      const result = await api.blog.generateCover.mutate({
        noteId,
        modelId: model.id,
        style,
        direction: direction.trim() || undefined,
        revision: config.revision,
      });
      if (!alive.current) return;
      const list = (result.candidates ?? []).map((item) => ({
        id: item.id,
        path: item.path,
      }));
      if (!list.length) throw new Error('模型没有返回图片，请重试。');
      setPicks(list);
      setPicked({ id: result.id, path: result.path });
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
    });
    onClose();
  };

  const invalidTitle = !!title.trim() && !validShortCoverTitle(title);
  const textConfig = previewTitle.trim()
    ? {
        mode: (overlay ? 'overlay' : 'full') as 'overlay' | 'full',
        templateVersion:
          initial?.text?.templateVersion || COVER_TEMPLATE_VERSION,
        title: previewTitle,
        subtitle: previewSubtitle,
        align: initial?.text?.align || ('left' as const),
        sizeScale: initial?.text?.sizeScale || 1,
        palette: initial?.text?.palette || 'violet',
      }
    : null;

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      hideCloseButton
      disableAnimation
      isDismissable={!busy}
      isKeyboardDismissDisabled={!!busy}
      scrollBehavior="inside"
      placement="center"
      classNames={{ backdrop: 'ink-cg-backdrop', wrapper: 'ink-cg-wrapper' }}
    >
      <ModalContent
        aria-label="封面助手"
        className="ink-promo ink-cg"
        data-blog-theme={theme}
      >
        <header className="ink-cg-head">
          <div>
            <h2>封面助手</h2>
            <small>
              {step === 'input'
                ? '先说清楚想要什么，再出图'
                : step === 'result'
                  ? '选一张，然后看它在各个位置上的样子'
                  : '这是封面在公开站上的真实效果'}
            </small>
          </div>
          <BlogButton
            type="button"
            onClick={onClose}
            disabled={!!busy}
            aria-label="关闭封面助手"
            className="ink-cg-close"
          >
            <Icon icon="tabler:x" width={18} />
          </BlogButton>
        </header>

        <div className="ink-cg-body" aria-busy={!!busy}>
          {busy === 'load' && <p role="status">正在读取生图设置…</p>}
          {busy === 'copy' && <p role="status">正在想文案…</p>}
          {busy === 'image' && (
            <p role="status" className="ink-cg-feedback">
              正在生成封面配图，稍等片刻…
            </p>
          )}
          {!!notice && (
            <p role="status" className="ink-cg-feedback">
              {notice}
            </p>
          )}
          {!!error && (
            <p role="alert" className="ink-cg-error">
              {error}
            </p>
          )}

          {step === 'input' && (
            <div className="ink-cg-form">
              <section className="ink-cg-block">
                <h3>画面风格</h3>
                <div className="ink-cg-styles" role="group" aria-label="画面风格">
                  {STYLES.map((item) => (
                    <BlogButton
                      key={item.value}
                      type="button"
                      className="ink-cg-style"
                      aria-pressed={style === item.value}
                      disabled={!!busy}
                      onClick={() => setStyle(item.value)}
                    >
                      <strong>{item.label}</strong>
                      <small>{item.hint}</small>
                    </BlogButton>
                  ))}
                </div>
              </section>

              <section className="ink-cg-block">
                <h3>封面文字</h3>
                <label className="ink-cg-field">
                  <span>
                    封面大字
                    <small>4–6 字</small>
                    <small className={invalidTitle ? 'ink-cg-error' : ''}>
                      {shortCoverTitleLength(title)}/6
                    </small>
                  </span>
                  <BlogInput
                    className="ink-mg-field"
                    maxLength={24}
                    value={title}
                    disabled={!!busy}
                    aria-invalid={invalidTitle}
                    placeholder="例如：三段式改造"
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  {invalidTitle && (
                    <small className="ink-cg-error">
                      封面大字要 4–6 字：它会排在画面左侧，太长会被裁断。
                    </small>
                  )}
                </label>
                <label className="ink-cg-field">
                  <span>
                    封面小字
                    <small>可留空</small>
                  </span>
                  <BlogInput
                    className="ink-mg-field"
                    maxLength={40}
                    value={subtitle}
                    disabled={!!busy}
                    placeholder="例如：一次上线，三段召回"
                    onChange={(event) => setSubtitle(event.target.value)}
                  />
                </label>
                <BlogButton
                  type="button"
                  className="ink-mg-button"
                  disabled={!!busy}
                  onClick={() => void suggest()}
                >
                  <Icon icon="tabler:sparkles" width={15} />
                  {busy === 'copy' ? '正在想…' : '让 AI 想文案'}
                </BlogButton>
              </section>

              <section className="ink-cg-block">
                <h3>想画什么</h3>
                <label className="ink-cg-field">
                  <span>
                    画面描述
                    <small>可留空，留空则按文章内容自动判断</small>
                  </span>
                  <BlogTextarea
                    className="ink-mg-field"
                    rows={3}
                    maxLength={200}
                    value={direction}
                    disabled={!!busy}
                    placeholder="例如：三段流程的立体图解，中间是漏斗，两侧是数据卡片"
                    onChange={(event) => setDirection(event.target.value)}
                  />
                </label>
                {!!options?.prompt && (
                  <details className="ink-cg-prompt">
                    <summary>查看将要使用的提示词</summary>
                    <pre>{options.prompt}</pre>
                    {direction.trim() && (
                      <p className="ink-cg-prompt-extra">
                        你的画面要求会一起发给模型：
                        {direction.trim()}
                      </p>
                    )}
                  </details>
                )}
              </section>
            </div>
          )}

          {step === 'result' && (
            <div className="ink-cg-result">
              <div className="ink-cg-hero">
                {picked ? (
                  <CoverCanvas
                    key={picked.path}
                    src={blogImageUrl(picked.path)}
                    config={textConfig}
                    placement="double"
                    loading="eager"
                  />
                ) : (
                  <p>尚未生成</p>
                )}
              </div>
              {picks.length > 1 && (
                <div className="ink-cg-picks" role="group" aria-label="候选底图">
                  <p>出了 {picks.length} 张，选一张用：</p>
                  <div className="ink-cg-picks-row">
                    {picks.map((item) => (
                      <BlogButton
                        key={item.id}
                        type="button"
                        className="ink-cg-pick"
                        aria-pressed={picked?.id === item.id}
                        disabled={!!busy}
                        onClick={() => setPicked(item)}
                      >
                        <img
                          src={blogImageUrl(item.path)}
                          alt="候选底图"
                          loading="lazy"
                        />
                      </BlogButton>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="ink-cg-step" role="region" aria-label="封面预览">
              <div className="ink-cg-text">
                <label className="ink-cg-field">
                  <span>
                    封面大字
                    <small>4–6 字</small>
                  </span>
                  <BlogInput
                    className="ink-mg-field"
                    maxLength={24}
                    value={previewTitle}
                    disabled={!!busy}
                    placeholder="例如：三段式改造"
                    onChange={(event) => setPreviewTitle(event.target.value)}
                  />
                </label>
                <label className="ink-cg-field">
                  <span>
                    封面小字
                    <small>可留空</small>
                  </span>
                  <BlogInput
                    className="ink-mg-field"
                    maxLength={40}
                    value={previewSubtitle}
                    disabled={!!busy}
                    placeholder="例如：一次上线，三段召回"
                    onChange={(event) => setPreviewSubtitle(event.target.value)}
                  />
                </label>
                <label className="ink-cg-toggle">
                  <BlogCheckbox
                    type="checkbox"
                    checked={overlay}
                    disabled={!!busy}
                    onChange={(event) => setOverlay(event.target.checked)}
                  />
                  在图片上显示标题
                </label>
                <p className="ink-cg-hint">
                  文字按容器的真实尺寸排版：大图上更大，列表缩略图上自动缩小；空间不够时副标题会自动隐藏。
                </p>
              </div>
              <div className="ink-cg-scenes">
                {PREVIEW_SCENES.map((scene) => {
                  const scale = scene.scale ?? 1;
                  return (
                    <figure className="ink-cg-scene" key={scene.key}>
                      <div
                        className="ink-cg-scene-frame"
                        style={{
                          width: scene.width * scale,
                          height: scene.height * scale,
                        }}
                      >
                        <div
                          className="ink-cg-scene-scale"
                          style={{
                            width: scene.width,
                            height: scene.height,
                            transform:
                              scale === 1 ? undefined : `scale(${scale})`,
                          }}
                        >
                          <CoverCanvas
                            src={picked ? blogImageUrl(picked.path) : ''}
                            alt=""
                            config={textConfig}
                            placement={scene.key}
                            loading="eager"
                          />
                        </div>
                      </div>
                      <figcaption className="ink-mg-sub">
                        {scene.label} · {scene.width}×{scene.height}
                        <span>{scene.note}</span>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <footer className="ink-cg-foot">
          <p>
            {step === 'input'
              ? '生成的只是草稿底图，保存后才会进入发布设置。'
              : step === 'result'
                ? '先看看效果，满意再应用。'
                : '预览的是待发布效果；应用后仍需在发布设置里保存。'}
          </p>
          <div>
            {step === 'input' && (
              <>
                <BlogButton
                  type="button"
                  className="ink-mg-button"
                  disabled={!!busy}
                  onClick={onClose}
                >
                  取消
                </BlogButton>
                <BlogButton
                  type="button"
                  className="ink-mg-button ink-mg-button-primary"
                  disabled={!!busy || !validShortCoverTitle(title)}
                  onClick={() => void generate()}
                >
                  <Icon icon="tabler:sparkles" width={15} />
                  {busy === 'image' ? '正在生成…' : '生成封面'}
                </BlogButton>
              </>
            )}
            {step === 'result' && (
              <>
                <BlogButton
                  type="button"
                  className="ink-mg-button"
                  disabled={!!busy}
                  onClick={() => setStep('input')}
                >
                  <Icon icon="tabler:arrow-left" width={15} />
                  改一下条件
                </BlogButton>
                <BlogButton
                  type="button"
                  className="ink-mg-button"
                  disabled={!!busy}
                  onClick={() => void generate()}
                >
                  <Icon icon="tabler:refresh" width={15} />
                  重新生成
                </BlogButton>
                <BlogButton
                  type="button"
                  className="ink-mg-button ink-mg-button-primary"
                  disabled={!!busy}
                  onClick={() => setStep('preview')}
                >
                  <Icon icon="tabler:eye" width={15} />
                  预览各场景
                </BlogButton>
              </>
            )}
            {step === 'preview' && (
              <>
                <BlogButton
                  type="button"
                  className="ink-mg-button"
                  disabled={!!busy}
                  onClick={() =>
                    setStep(picks.length || mode === 'generate' ? 'result' : 'input')
                  }
                >
                  <Icon icon="tabler:arrow-left" width={15} />
                  返回
                </BlogButton>
                <BlogButton
                  type="button"
                  className="ink-mg-button ink-mg-button-primary"
                  disabled={!!busy || !picked}
                  onClick={apply}
                >
                  应用到封面
                </BlogButton>
              </>
            )}
          </div>
        </footer>
      </ModalContent>
    </Modal>
  );
}
