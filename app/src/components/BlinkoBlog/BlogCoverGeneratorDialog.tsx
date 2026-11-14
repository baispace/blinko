import { useEffect, useRef, useState } from "react";
import { Modal, ModalContent } from "@heroui/react";
import { api } from "@/lib/trpc";
import { blogImageUrl } from "@/lib/blogImage";
import { Icon } from "@/components/Common/Iconify/icons";
import {
  CoverScenePreview,
  CoverSceneSwitch,
  type CoverPreviewSceneKey,
} from "./BlogCoverPreview";
import { BlogInput, BlogTextarea, BlogSelect, BlogButton } from "./BlogUI";
import { normalizeCoverTextConfig } from "@shared/lib/blogCoverText";
type Options = Pick<
  Awaited<ReturnType<typeof api.blog.coverGenerationOptions.query>>,
  | "suggestedTitle"
  | "artPlan"
  | "modelTitle"
  | "modelKey"
  | "models"
  | "revision"
  | "prompt"
> & { sourceVersion?: string };
type Base = {
  coverTitle?: string;
  coverSubtitle?: string;
  id: number | null;
  path: string;
  palette?: string;
  artwork?: "icon" | "tile" | "image";
};

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请重试。";

export type CoverGeneratorInitial = {
  base?: Base | null;
  coverTitle?: string;
  coverSubtitle?: string;
  coverMode?: "full" | "overlay";
  /** 文章标题：卡片预览里那一行「文章标题」要显示真的那份。 */
  articleTitle?: string;
  text?: {
    align?: "left" | "center" | "right";
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
  coverMode: "full" | "overlay";
  coverPalette?: string;
  coverArtwork?: "icon" | "tile" | "image";
};

export function BlogCoverGeneratorDialog({
  noteId = 0,
  target,
  initial,
  onApply,
  onClose,
}: {
  noteId?: number;
  target?: {
    type: "note" | "topic";
    id: number;
    title?: string;
    description?: string;
  };
  mode?: "generate" | "preview";
  initial?: CoverGeneratorInitial;
  onApply?: (result: CoverGeneratorResult) => void | Promise<void>;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [modelId, setModelId] = useState("");
  const [headline, setHeadline] = useState(initial?.coverTitle || "");
  const [direction, setDirection] = useState("");
  const [selected, setSelected] = useState<Base | null>(initial?.base || null);
  const [candidates, setCandidates] = useState<Base[]>([]);
  const [busy, setBusy] = useState<"load" | "generate" | "apply" | null>(null);
  const [error, setError] = useState("");
  const [scene, setScene] = useState<CoverPreviewSceneKey>("double");
  const [original, setOriginal] = useState(true);
  const [useReference, setUseReference] = useState(false);
  const alive = useRef(true);
  const generating = useRef(false);

  const load = async () => {
    setBusy("load");
    setError("");
    try {
      const result = target
        ? await api.blog.assetCoverOptions.query({
            target: { type: target.type, id: target.id },
          })
        : await api.blog.coverGenerationOptions.query({ noteId, style: "ink" });
      if (!alive.current) return;
      setOptions(result);
      setModelId((previous) =>
        result.models.some(
          (model) => String(model.id) === previous && model.available,
        )
          ? previous
          : String(result.models.find((model) => model.available)?.id || ""),
      );
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
  }, [noteId, target?.type, target?.id]);

  const generate = async () => {
    if (!options || !modelId || generating.current) return;
    generating.current = true;
    setBusy("generate");
    setError("");
    const requestedTitle = headline.trim();
    const brief = [
      requestedTitle
        ? `图片必须准确显示标题「${requestedTitle}」`
        : "不添加任何文字",
      direction.trim(),
    ]
      .filter(Boolean)
      .join("。")
      .slice(0, 300);
    try {
      const result = target
        ? await api.blog.generateAssetCover.mutate({
            target,
            modelId: Number(modelId),
            referenceAttachmentId: useReference ? selected?.id || undefined : undefined,
            sourceVersion: options.sourceVersion || "",
            direction: brief,
          })
        : await api.blog.generateCover.mutate({
            noteId,
            modelId: Number(modelId),
            referenceAttachmentId: useReference ? selected?.id || undefined : undefined,
            revision: options.revision,
            style: "ink",
            direction: brief,
          });
      if (!alive.current) return;
      const candidate: Base = {
        id: result.id,
        path: result.path,
        artwork: "image",
        coverTitle: requestedTitle,
        coverSubtitle: "",
      };
      setCandidates((previous) =>
        [
          candidate,
          ...previous.filter((item) => item.path !== candidate.path),
        ].slice(0, 6),
      );
      setSelected(candidate);
      setOriginal(true);
    } catch (error) {
      if (alive.current) setError(errorText(error));
    } finally {
      generating.current = false;
      if (alive.current) setBusy(null);
    }
  };
  const apply = async () => {
    if (!selected || busy) return;
    setBusy("apply");
    setError("");
    const fresh = candidates.some((item) => item.path === selected.path);
    try {
      await onApply?.({
        id: selected.id,
        path: selected.path,
        coverTitle: fresh
          ? selected.coverTitle || ""
          : initial?.coverTitle || "",
        coverSubtitle: fresh ? "" : initial?.coverSubtitle || "",
        coverMode: fresh ? "full" : initial?.coverMode || "full",
        coverArtwork: fresh
          ? "image"
          : initial?.text?.artwork || selected.artwork || "image",
        coverPalette: fresh ? undefined : initial?.text?.palette,
      });
      onClose();
    } catch (error) {
      if (alive.current) setError(errorText(error));
    } finally {
      if (alive.current) setBusy(null);
    }
  };
  const fresh = candidates.some((item) => item.path === selected?.path);
  const config = normalizeCoverTextConfig(
    fresh
      ? { mode: "full", artwork: "image" }
      : {
          ...initial?.text,
          mode: initial?.coverMode || "full",
          title: initial?.coverTitle || "",
          subtitle: initial?.coverSubtitle || "",
        },
  );

  return (
    <Modal
      isOpen
      size="5xl"
      scrollBehavior="inside"
      hideCloseButton
      isDismissable={!busy}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      classNames={{
        wrapper: "blog-cover-modal-wrapper z-[10001]",
        backdrop: "blog-cover-modal-backdrop z-[10000]",
      }}
    >
      <ModalContent className="blog-cover-dialog">
        <header className="flex items-center justify-between gap-4 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold">设计封面</h2>
            <p className="mt-1 text-sm text-default-500">
              居中图标 · 背景大字 · 轻渐变底色
            </p>
          </div>
          <BlogButton aria-label="关闭" disabled={!!busy} onClick={onClose}>
            <Icon icon="tabler:x" width={20} />
          </BlogButton>
        </header>
        <div className="grid min-h-0 gap-6 overflow-y-auto px-6 pb-6 md:grid-cols-[260px_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <label className="flex flex-col gap-2 text-sm">
              封面标题{" "}
              <span className="text-xs text-default-500">
                选填，留空生成无字封面
              </span>
              <BlogInput
                value={headline}
                maxLength={40}
                disabled={!!busy}
                onChange={(event) => setHeadline(event.target.value)}
                placeholder="例如：详情推荐，建议 4–6 字"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              画面要求
              <BlogTextarea
                value={direction}
                maxLength={200}
                rows={5}
                disabled={!!busy}
                onChange={(event) => setDirection(event.target.value)}
                placeholder="例如：青绿色，中央用推荐路径图标，也可留空按主题变化"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              生图模型
              <BlogSelect
                value={modelId}
                disabled={!!busy}
                onChange={(event) => setModelId(event.target.value)}
              >
                <option value="">选择模型</option>
                {options?.models.map((model) => (
                  <option
                    key={model.id}
                    value={model.id}
                    disabled={!model.available}
                  >
                    {model.title || model.id}
                    {!model.available ? "（不可用）" : ""}
                  </option>
                ))}
              </BlogSelect>
            </label>
            {selected?.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useReference} disabled={!!busy} onChange={event => setUseReference(event.target.checked)}/>参考当前封面风格（H3）</label>}
            <BlogButton
              disabled={!!busy || !modelId}
              onClick={() => void generate()}
            >
              {busy === "generate"
                ? "正在生成…"
                : candidates.length
                  ? "再生成一张"
                  : "生成封面"}
            </BlogButton>
            {!modelId && !busy && (
              <div className="text-sm">
                <a
                  href="/settings?section=ai"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  配置生图模型 ↗
                </a>
                <button
                  type="button"
                  className="ml-3 text-primary"
                  onClick={() => void load()}
                >
                  刷新配置
                </button>
              </div>
            )}
            {headline.trim() && (
              <p className="text-xs leading-6 text-default-500">
                H3 直接生成图片内标题，Image-01 自动排字。应用前请检查文字。
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
          <section
            className="flex min-w-0 flex-col gap-4"
            aria-label="封面预览"
            aria-busy={busy === "generate"}
          >
            <div className="flex flex-wrap items-center gap-3">
              <BlogButton
                onClick={() => setOriginal(true)}
                aria-pressed={original}
              >
                完整原图
              </BlogButton>
              <BlogButton
                onClick={() => setOriginal(false)}
                aria-pressed={!original}
              >
                场景预览
              </BlogButton>
            </div>
            {!original && (
              <CoverSceneSwitch value={scene} onChange={setScene} />
            )}
            {selected ? (
              original ? (
                <img
                  src={blogImageUrl(selected.path)}
                  alt="完整封面"
                  className="w-full rounded-xl"
                />
              ) : (
                <CoverScenePreview
                  src={blogImageUrl(selected.path)}
                  scene={scene}
                  config={config}
                  title={
                    initial?.articleTitle ||
                    target?.title ||
                    options?.suggestedTitle
                  }
                />
              )
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-xl bg-default-100 text-sm text-default-500">
                {busy === "generate"
                  ? "正在生成封面…"
                  : "生成的封面会显示在这里"}
              </div>
            )}
            {busy === "generate" && selected && (
              <p role="status" className="text-sm text-default-500">
                正在生成新候选，当前封面仍可查看…
              </p>
            )}
            {candidates.length > 0 && (
              <div
                className="flex gap-3 overflow-x-auto"
                aria-label="本次候选封面"
              >
                {candidates.map((candidate) => (
                  <button
                    type="button"
                    key={candidate.path}
                    aria-label={`选择封面${candidate.coverTitle ? ` ${candidate.coverTitle}` : ""}`}
                    aria-pressed={candidate.path === selected?.path}
                    onClick={() => setSelected(candidate)}
                    className={`shrink-0 overflow-hidden rounded-lg border-2 ${selected?.path === candidate.path ? "border-primary" : "border-transparent"}`}
                  >
                    <img
                      src={blogImageUrl(candidate.path)}
                      alt="候选封面"
                      className="h-16 w-28 object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <p className="text-xs text-default-500">
            {target?.type === "note"
              ? "应用后更新笔记封面"
              : target?.type === "topic"
                ? "应用后请保存专题资料"
                : "应用到草稿，更新发布后对外生效"}
          </p>
          <BlogButton
            disabled={!!busy || !selected}
            onClick={() => void apply()}
          >
            {busy === "apply" ? "正在应用…" : "应用选中封面"}
          </BlogButton>
        </footer>
      </ModalContent>
    </Modal>
  );
}
