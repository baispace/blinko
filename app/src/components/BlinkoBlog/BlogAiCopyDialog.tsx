import { useEffect, useRef, useState } from 'react';
import { Button, Modal, ModalContent } from '@heroui/react';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { Icon } from '@/components/Common/Iconify/icons';
import { BlogCheckbox } from './BlogUI';
import { validShortCoverTitle } from '@shared/lib/blogPublishSettings';

type Settings = Awaited<ReturnType<typeof api.blog.publishSettings.query>>;
type CopyState = Awaited<ReturnType<typeof api.blog.aiCopyState.query>>;
type CopyGroup = Awaited<ReturnType<typeof api.blog.generateCopyGroup.mutate>>;

type FieldKey = 'title' | 'summary' | 'coverTitle' | 'coverSubtitle' | 'publicTags';

const FIELD_META: { key: FieldKey; label: string; hint: string }[] = [
  { key: 'title', label: '公开标题', hint: '列表与公开页显示的标题' },
  { key: 'summary', label: '文章概要', hint: '卡片与搜索结果里的摘要' },
  { key: 'coverTitle', label: '封面短标题', hint: '2–8 字（推荐 4–6 字），排在画面左侧' },
  { key: 'coverSubtitle', label: '封面小字', hint: '可留空' },
  { key: 'publicTags', label: '公开标签', hint: '与笔记的私有标签分开' },
];

/** 一次生成出来的一整套建议，外加每项是按哪一版正文生成的。 */
type Draft = {
  title: string;
  summary: string;
  coverTitle: string;
  coverSubtitle: string;
  publicTags: string[];
  issues: string[];
  generatedAt: string;
  /** 正文指纹：正文改过之后，这几项就过期了。 */
  versions: Partial<Record<FieldKey, string>>;
};

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败，请重试。';

const valueOf = (draft: Draft, key: FieldKey) =>
  key === 'publicTags' ? draft.publicTags.join('、') : draft[key];

const hasValue = (draft: Draft, key: FieldKey) =>
  key === 'publicTags' ? draft.publicTags.length > 0 : !!draft[key].trim();

/**
 * 存下来的候选（notePublication.aiCopy）。
 *
 * 候选是「还没决定要不要用」的中间产物，生成过一次就留着：
 * 再点开直接看，不重复烧模型；正文改过只标记过期，由作者决定要不要重新生成。
 */
function draftFromCandidates(candidates: NonNullable<CopyState['candidates']>): Draft {
  return {
    title: candidates.title,
    summary: candidates.summary,
    coverTitle: candidates.coverTitle,
    coverSubtitle: candidates.coverSubtitle,
    publicTags: candidates.publicTags,
    issues: candidates.issues,
    generatedAt: candidates.generatedAt,
    versions: {
      title: candidates.fields.title?.version,
      summary: candidates.fields.summary?.version,
      coverTitle: candidates.fields.cover?.version,
      coverSubtitle: candidates.fields.cover?.version,
      publicTags: candidates.fields.tags?.version,
    },
  };
}

/** 刚生成出来的一组：所有字段都出自同一版正文。 */
function draftFromGroup(group: CopyGroup): Draft {
  return {
    title: group.title,
    summary: group.summary,
    coverTitle: group.coverTitle,
    coverSubtitle: group.coverSubtitle,
    publicTags: group.publicTags,
    issues: group.issues,
    generatedAt: new Date().toISOString(),
    versions: {
      title: group.contentVersion,
      summary: group.contentVersion,
      coverTitle: group.contentVersion,
      coverSubtitle: group.contentVersion,
      publicTags: group.contentVersion,
    },
  };
}

/** 封面短标题不是 2–8 字（推荐 4–6 字）就不能用：它会排在画面左侧，超过 8 字请精简。 */
function usable(draft: Draft, key: FieldKey) {
  if (!hasValue(draft, key)) return false;
  if (key === 'coverTitle') return validShortCoverTitle(draft.coverTitle);
  return true;
}

export function BlogAiCopyDialog({
  noteId,
  onApplied,
  onClose,
}: {
  noteId: number;
  onApplied?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<null | 'load' | 'generate' | 'apply'>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picked, setPicked] = useState<FieldKey[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [currentVersion, setCurrentVersion] = useState('');
  const alive = useRef(true);
  /*
   * 设置也要有个 ref：读设置与算「哪些字段可以选」必须看到同一份数据。
   * 只靠 state 的话，刚读到设置的那一次渲染里拿到的还是旧值 ——
   * 于是「没有发布记录」的笔记也会被勾上封面文案。
   */
  const settingsRef = useRef<Settings | null>(null);

  const putSettings = (next: Settings | null) => {
    settingsRef.current = next;
    setSettings(next);
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /*
   * 封面文案要有发布记录才落得下库：
   * 草稿箱里的笔记还没发布过，这条建议先不给，用得上的时候再生成。
   *
   * 只认明确的 false：字段缺失（服务端版本对不上）时照常给建议，
   * 真写不进去时服务端会把原因说出来，比在这里先拦一道更准。
   */
  const blocked = (key: FieldKey) =>
    (key === 'coverTitle' || key === 'coverSubtitle') &&
    settingsRef.current?.hasPublication === false;

  const selectAll = (next: Draft) =>
    FIELD_META.filter((item) => usable(next, item.key) && !blocked(item.key)).map(
      (item) => item.key,
    );

  const generate = async () => {
    setBusy('generate');
    setError('');
    setNotice('');
    try {
      const group = await api.blog.generateCopyGroup.mutate({ noteId });
      if (!alive.current) return;
      const next = draftFromGroup(group);
      setDraft(next);
      setPicked(selectAll(next));
      setCurrentVersion(group.contentVersion);
      setNotice('已生成一版建议，逐项挑选后写入草稿。');
    } catch (error) {
      if (alive.current) setError(errorText(error));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const load = async () => {
    setBusy('load');
    setError('');
    try {
      const [state, current] = await Promise.all([
        api.blog.aiCopyState.query({ noteId }),
        api.blog.publishSettings.query({ noteId }),
      ]);
      if (!alive.current) return;
      putSettings(current);
      setCurrentVersion(state.contentVersion);
      if (state.candidates) {
        // 有候选就直接展示：不重新烧一次模型，作者想换再点「重新生成」。
        const next = draftFromCandidates(state.candidates);
        setDraft(next);
        setPicked(selectAll(next));
        setNotice('这是上一次生成的建议，可以直接采用，也可以重新生成。');
      } else {
        await generate();
      }
    } catch (error) {
      if (alive.current) setError(errorText(error));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const staleFields = (next: Draft) =>
    FIELD_META.filter(
      (item) =>
        picked.includes(item.key) &&
        !!next.versions[item.key] &&
        next.versions[item.key] !== currentVersion,
    ).map((item) => item.key);

  const apply = async () => {
    if (!draft || !settings) return;
    const stale = staleFields(draft);
    if (stale.length) {
      setError('正文在生成之后被改过了，请重新生成建议再采用。');
      return;
    }
    setBusy('apply');
    setError('');
    setNotice('');
    try {
      /*
       * 只写草稿：公开页读的是快照，要点「更新发布」才会对外生效。
       *
       * 标题、概要、标签走 saveCopy —— 它只碰这三样，不会动封面与排版；
       * 封面文案走 saveCoverText —— 只改文字层，不碰底图。
       */
      await api.blog.saveCopy.mutate({
        noteId,
        ...(picked.includes('title')
          ? { title: draft.title.trim().slice(0, 200) }
          : {}),
        ...(picked.includes('summary')
          ? { summary: draft.summary.trim().slice(0, 2000) }
          : {}),
        ...(picked.includes('publicTags')
          ? {
              // 模型偶尔会多给几个标签：按接口上限先收一收，别让整次写入失败。
              publicTags: draft.publicTags.slice(0, 8).map((tag) => tag.slice(0, 20)),
            }
          : {}),
        expectedContentVersion: currentVersion,
      });
      if (picked.includes('coverTitle') || picked.includes('coverSubtitle')) {
        await api.blog.saveCoverText.mutate({
          noteId,
          title: (
            picked.includes('coverTitle') ? draft.coverTitle : settings.config.title
          )
            .trim()
            .slice(0, 24),
          subtitle: (
            picked.includes('coverSubtitle')
              ? draft.coverSubtitle
              : settings.config.subtitle
          )
            .trim()
            .slice(0, 40),
        });
      }
      RootStore.Get(ToastPlugin).success('建议已写入草稿，发布后生效。');
      await onApplied?.();
      onClose();
    } catch (error) {
      if (alive.current) setError(errorText(error));
    } finally {
      if (alive.current) setBusy(null);
    }
  };

  const stale = draft ? staleFields(draft) : [];

  return (
    <Modal
      isOpen
      classNames={{ wrapper: 'z-[10001]', backdrop: 'z-[10000]' }}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      hideCloseButton
      disableAnimation
      isDismissable={!busy}
      isKeyboardDismissDisabled={!!busy}
      scrollBehavior="inside"
      placement="center"
      size="xl"
    >
      <ModalContent
        aria-label="AI 优化文案"
        className="bg-background"
        style={{
          width: 'min(640px, calc(100vw - 32px))',
          maxHeight: 'calc(100dvh - 48px)',
          borderRadius: 16,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif',
        }}
      >
        <header className="flex items-center justify-between border-b border-default-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">AI 优化文案</h2>
            <small className="text-sm text-default-500">
              按正文给一版标题、概述与封面文案，逐项挑选后写入草稿
            </small>
          </div>
          <Button
            isIconOnly
            variant="light"
            onPress={onClose}
            isDisabled={!!busy}
            aria-label="关闭 AI 优化文案"
          >
            <Icon icon="tabler:x" width={18} />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4" aria-busy={!!busy}>
          {busy === 'load' && (
            <p className="text-sm text-default-500" role="status">
              正在读取已有建议…
            </p>
          )}
          {busy === 'generate' && (
            <p className="text-sm text-default-500" role="status">
              正在读正文并想文案，稍等片刻…
            </p>
          )}
          {!!notice && (
            <div
              className="mb-3 rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary"
              role="status"
            >
              {notice}
            </div>
          )}
          {!!error && (
            <div
              className="mb-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {error}
            </div>
          )}

          {draft && (
            <div className="flex flex-col gap-2.5">
              <p className="text-xs text-default-500">
                勾选要采用的建议，没勾的保持现在的内容。
              </p>
              {FIELD_META.map((item) => {
                const usableField = usable(draft, item.key);
                const isBlocked = blocked(item.key);
                const current =
                  item.key === 'publicTags'
                    ? (settings?.draftPublicTags ?? []).join('、')
                    : item.key === 'title'
                      ? (settings?.title ?? '')
                      : item.key === 'summary'
                        ? (settings?.summary ?? '')
                        : item.key === 'coverTitle'
                          ? (settings?.config.title ?? '')
                          : (settings?.config.subtitle ?? '');
                const outdated = stale.includes(item.key);
                return (
                  <label
                    key={item.key}
                    className="flex items-start gap-2.5 rounded-lg border border-default-200 p-3 text-sm"
                  >
                    <BlogCheckbox
                      type="checkbox"
                      className="mt-0.5"
                      disabled={!!busy || !usableField || isBlocked}
                      checked={picked.includes(item.key)}
                      onChange={(event) =>
                        setPicked((previous) =>
                          event.target.checked
                            ? [...previous, item.key]
                            : previous.filter((field) => field !== item.key),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <b className="text-xs">{item.label}</b>
                        <small className="text-xs text-default-400">{item.hint}</small>
                        {outdated && (
                          <small className="text-xs text-warning-600">
                            正文已改，建议重新生成
                          </small>
                        )}
                        {isBlocked && (
                          <small className="text-xs text-default-400">
                            先发布正文才能写封面文案
                          </small>
                        )}
                        {item.key === 'coverTitle' &&
                          draft.coverTitle.trim() &&
                          !validShortCoverTitle(draft.coverTitle) && (
                            <small className="text-xs text-danger">
                              要 2–8 字（推荐 4–6 字），超过 8 字请精简
                            </small>
                          )}
                      </span>
                      <span className="mt-1 block whitespace-pre-wrap break-words text-sm text-foreground">
                        {hasValue(draft, item.key)
                          ? valueOf(draft, item.key)
                          : '未生成'}
                      </span>
                      {current.trim() && (
                        <span className="mt-1 block truncate text-xs text-default-400">
                          当前：{current}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
              {!!draft.issues.length && (
                <div className="rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning">
                  {draft.issues.join(' ')}
                </div>
              )}
              {draft.generatedAt && (
                <p className="text-xs text-default-400">
                  生成于 {new Date(draft.generatedAt).toLocaleString('zh-CN')}
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-default-200 px-5 py-4">
          <p className="text-xs text-default-500">
            改动先存在草稿里，点「更新发布」才会对外生效。
          </p>
          <div className="flex gap-2">
            <Button
              variant="flat"
              isDisabled={!!busy}
              onPress={() => void generate()}
              startContent={<Icon icon="tabler:refresh" width={15} />}
            >
              {busy === 'generate' ? '正在生成…' : '重新生成'}
            </Button>
            <Button
              color="primary"
              isDisabled={!!busy || !draft || !picked.length}
              onPress={() => void apply()}
            >
              {busy === 'apply' ? '正在写入…' : '写入草稿'}
            </Button>
          </div>
        </footer>
      </ModalContent>
    </Modal>
  );
}
