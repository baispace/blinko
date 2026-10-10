import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { MarkdownRender } from '@/components/Common/MarkdownRender';
import dayjs from '@/lib/dayjs';
import { NoteType } from '@shared/lib/types';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@heroui/react';
import { PromiseCall } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';
import { showTipsDialog } from '@/components/Common/TipsDialog';
import confetti from 'canvas-confetti';
import { useMediaQuery } from 'usehooks-ts';
import { FilesAttachmentRender } from '@/components/Common/AttachmentRender';
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';
import { BlinkoCard } from '@/components/BlinkoCard';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { useNavigate } from 'react-router-dom';

/**
 * 每日回顾页 —— 按设计稿（CleanShot 2026-10-10 10:21）精确重写：
 *
 *   背景：米色 #fdf2e9 + 散点网格 dot pattern
 *   顶部 L：模式 label / 大标题 / 描述 / 2 个白色 pill
 *   顶部 R：× 关闭按钮
 *   主区：1 张主卡片居中 (z-20, drag 跟随)
 *         + 4 张"卫星卡片"散落四周 (absolute 定位 + 旋转 + 半透)
 *         + 拖动时卫星卡片反向 parallax 视差
 *   底部：5 个图标按钮 (白 pill 容器) + 操作提示
 *
 * 卫星卡片内容：真实 prev / next 笔记预览（不重复主卡片），
 * 给用户「这片笔记海洋里有 N 张浮起的卡片」的视觉感。
 */
const ReviewPage = observer(() => {
  const blinko = RootStore.Get(BlinkoStore);
  const { t } = useTranslation();
  const isPc = useMediaQuery('(min-width: 768px)');
  const navigate = useNavigate();

  const store = RootStore.Local(() => {
    /** 当前模式下的笔记列表（取自 BlinkoStore） */
    const getList = () => store.isRandomReviewMode
      ? blinko.randomReviewNoteList.value ?? []
      : blinko.dailyReviewNoteList.value ?? [];

    return {
      currentIndex: 0,
      get currentNote() {
        return getList()[store.currentIndex] ?? null;
      },
      /** 主卡片周围 4 张卫星：前后各 2 张 */
      get satelliteNotes() {
        const arr = getList();
        const total = arr.length;
        const cur = store.currentIndex;
        if (total < 2) return [];
        const indices = [
          (cur - 2 + total) % total,
          (cur - 1 + total) % total,
          (cur + 1) % total,
          (cur + 2) % total,
        ];
        return indices.map((i) => arr[i]).filter(Boolean);
      },
      isRandomReviewMode: false,
      get totalCount() {
        return getList().length;
      },
      get isBlinko() {
        return store.currentNote?.type == NoteType.BLINKO;
      },
      switchMode(mode: 'daily' | 'random') {
        const shouldRandom = mode === 'random';
        if (store.isRandomReviewMode === shouldRandom) return;
        store.isRandomReviewMode = shouldRandom;
        store.currentIndex = 0;
        if (shouldRandom) blinko.randomReviewNoteList.call({ limit: 30 });
        else blinko.dailyReviewNoteList.call();
      },
      goNext() {
        const arr = getList();
        const total = arr.length;
        if (total === 0) return;
        // 离开当前笔记时标记为已读，避免循环展示
        const leaving = arr[store.currentIndex];
        if (leaving?.id) {
          api.notes.reviewNote.mutate({ id: leaving.id }).catch(() => {});
        }
        store.currentIndex = (store.currentIndex + 1) % total;
      },
      goPrev() {
        const total = getList().length;
        if (total === 0) return;
        // 返回上一张不重复标记（第一次经过时已标过）
        store.currentIndex = (store.currentIndex - 1 + total) % total;
      },
    };
  });

  /** 拖动偏移：主卡片跟 drag，卫星卡片反向视差 */
  const [dragDx, setDragDx] = useState(0);
  /**
   * 区分 click vs drag：
   * - pressed：已按下但未移动
   * - dragging：移动超过 8px
   * - idle：无按下
   * 关键：拖动和点击共享同一组 pointer 事件，靠移动距离区分
   */
  const pointerIntent = useRef<'idle' | 'pressed' | 'dragging'>('idle');
  const dragState = useRef({ startX: 0, startY: 0, dragging: false, dx: 0, dy: 0 });

  /** 切换动画：旧卡滑出 → 换内容 → 新卡滑入 */
  const [animKey, setAnimKey] = useState(0);
  const [animTransform, setAnimTransform] = useState('translate3d(0,0,0)');
  const [animOpacity, setAnimOpacity] = useState(1);
  const isAnimatingRef = useRef(false);

  const animateSwitch = (direction: 'next' | 'prev', action: () => void) => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    const exitX = direction === 'next' ? -60 : 60;
    const enterX = direction === 'next' ? 60 : -60;
    const exitRot = direction === 'next' ? -4 : 4;
    const enterRot = direction === 'next' ? 4 : -4;
    // 1) 滑出
    setAnimTransform(`translate3d(${exitX}px, 0, 0) rotate(${exitRot}deg)`);
    setAnimOpacity(0);
    setTimeout(() => {
      // 2) 切换内容
      action();
      setAnimKey(k => k + 1);
      // 3) 新卡先在对侧
      setAnimTransform(`translate3d(${enterX}px, 0, 0) rotate(${enterRot}deg)`);
      setAnimOpacity(0);
      // 4) requestAnimationFrame 后滑入
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimTransform('translate3d(0,0,0)');
          setAnimOpacity(1);
          setTimeout(() => {
            isAnimatingRef.current = false;
          }, 240);
        });
      });
    }, 200);
  };

  /** 点击主卡 → 打开全屏详情（review 页内覆盖层，保留米色氛围） */
  const [detailNote, setDetailNote] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const openDetail = async (note: any) => {
    if (!note?.id) return;
    // 先用当前缓存的笔记显示，避免空白
    setDetailNote(note);
    setDetailLoading(true);
    try {
      const fullNote = await api.notes.detail.mutate({ id: note.id });
      setDetailNote(fullNote);
    } finally {
      setDetailLoading(false);
    }
  };
  const closeDetail = () => setDetailNote(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isAnimatingRef.current) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointerIntent.current = 'pressed';
    dragState.current = { startX: e.clientX, startY: e.clientY, dragging: true, dx: 0, dy: 0 };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState.current.dragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    dragState.current.dx = dx;
    dragState.current.dy = dy;
    // 8px 阈值：超过才算 dragging（避免按下时的微抖动误判）
    if (pointerIntent.current !== 'dragging' && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      pointerIntent.current = 'dragging';
    }
    setDragDx(dx);
  };
  const handlePointerUp = () => {
    if (!dragState.current.dragging) return;
    const dx = dragState.current.dx;
    const intent = pointerIntent.current;
    dragState.current.dragging = false;
    setDragDx(0);
    // 只有「dragging + 超过 50px」才切卡
    // pressed (未移动或移动 < 8px) 视为 click，交给 onClick 处理
    if (intent === 'dragging' && Math.abs(dx) > 50) {
      if (dx < 0) animateSwitch('next', () => store.goNext());
      else animateSwitch('prev', () => store.goPrev());
    }
    // 等当前 click 事件处理完再重置 intent
    setTimeout(() => { pointerIntent.current = 'idle'; }, 0);
  };
  const handlePointerCancel = () => {
    dragState.current.dragging = false;
    setDragDx(0);
    pointerIntent.current = 'idle';
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); animateSwitch('next', () => store.goNext()); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); animateSwitch('prev', () => store.goPrev()); }
      else if (e.key === ' ') { e.preventDefault(); animateSwitch('next', () => store.goNext()); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!store.isRandomReviewMode && (blinko.dailyReviewNoteList.value?.length ?? 0) === 0) {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6, x: isPc ? 0.6 : 0.5 } });
    }
  }, [blinko.dailyReviewNoteList.value, blinko.randomReviewNoteList.value, store.isRandomReviewMode]);

  const reviewNotes = store.isRandomReviewMode
    ? blinko.randomReviewNoteList.value ?? []
    : blinko.dailyReviewNoteList.value ?? [];

  /** 卫星卡片位置：散落 4 个位置（贴近主卡 + 不超出可见区） */
  const satellitePositions = [
    // top-left
    { top: '2%', left: '2%', rotate: -7, opacity: 0.55, parallax: -0.45, zIndex: 1 },
    // top-right
    { top: '4%', right: '2%', rotate: 6, opacity: 0.45, parallax: -0.30, zIndex: 1 },
    // bottom-left
    { bottom: '4%', left: '1%', rotate: 5, opacity: 0.40, parallax: 0.35, zIndex: 1 },
    // bottom-right
    { bottom: '2%', right: '2%', rotate: -8, opacity: 0.55, parallax: 0.50, zIndex: 1 },
  ];

  return (
    <ScrollArea fixMobileTopBar className="h-full">
      <div
        className="min-h-full bg-[#fdf2e9] dark:bg-[#1d1814]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {/* ───────────── 顶部栏 ───────────── */}
        <div className="flex items-start justify-between gap-4 px-5 md:px-8 pt-4 md:pt-6">
          {/* LEFT：模式 label + 大标题 + 描述 + 2 个白色 pill */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-primary uppercase">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
              {store.isRandomReviewMode ? 'RANDOM WALK' : 'DAILY REVIEW'}
            </div>
            <h1 className="mt-1 text-[28px] md:text-[36px] font-bold tracking-tight text-foreground leading-none">
              {store.isRandomReviewMode ? '随机漫步' : '每日回顾'}
            </h1>
            <p className="mt-1.5 text-[12.5px] text-default-500">
              {store.isRandomReviewMode ? t('random-mode-subtitle') : t('daily-mode-subtitle')}
            </p>
            {/* 2 个白色 pill（无紫色选中） */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <FilterChip
                icon="solar:calendar-mark-bold"
                label={t('last-month')}
                trailing
                active={!store.isRandomReviewMode}
              />
              <FilterChip
                icon="ri:star-smile-line"
                label={t('memory-map')}
                trailing
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); store.switchMode(store.isRandomReviewMode ? 'daily' : 'random'); }}
                className="inline-flex items-center gap-1 rounded-full px-3 h-7 text-[12px] bg-default-100 text-default-700 hover:bg-default-200 !transition-colors"
              >
                <Icon
                  icon={store.isRandomReviewMode ? 'solar:calendar-mark-bold' : 'ri:exchange-2-line'}
                  width="13" height="13"
                />
                <span>{t('switch-mode')}</span>
              </button>
            </div>
          </div>

          {/* RIGHT：进度 + × 关闭 */}
          <div className="flex flex-col items-end gap-3 shrink-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/70 backdrop-blur border border-default-200/60 text-[12.5px] text-default-600 tabular-nums pt-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-foreground font-semibold">{store.currentIndex + 1}</span>
              <span className="text-default-400">/</span>
              <span>{store.totalCount}</span>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate('/'); }}
              className="w-11 h-11 rounded-lg bg-[#FF5722] hover:bg-[#f4511e] text-white flex items-center justify-center !transition-colors shadow-md"
              aria-label={t('close')}
              title={t('close')}
            >
              <Icon icon="mdi:close" width="22" height="22" />
            </button>
          </div>
        </div>

        {/* ───────────── 主区：卫星卡片 + 主卡片 + 左右切换按钮 ───────────── */}
        <div className="relative w-full min-h-[440px] md:min-h-[500px] mt-4 md:mt-6 select-none">
          {/* 底层 dot pattern */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none opacity-60"
            style={{
              backgroundImage:
                'radial-gradient(circle, rgba(0,0,0,0.12) 1px, transparent 1.5px)',
              backgroundSize: '18px 18px',
              maskImage:
                'radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0) 80%)',
              WebkitMaskImage:
                'radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0) 80%)',
            }}
          />

          {/* 卫星卡片 - 散落画布 */}
          {reviewNotes.length > 1 &&
            store.satelliteNotes.map((sat, idx) => {
              const pos = satellitePositions[idx % satellitePositions.length];
              const satIsBlinko = sat.type === NoteType.BLINKO;
              const satEmoji = (sat as any).metadata?.icon || (satIsBlinko ? '⚡' : '📝');
              const satCoverBg = satIsBlinko
                ? 'linear-gradient(135deg,#fbbf24 0%,#fb923c 60%,#f97316 100%)'
                : 'linear-gradient(135deg,#fef3c7 0%,#fde68a 60%,#fcd34d 100%)';
              return (
                <article
                  key={`sat-${sat.id}-${idx}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (pointerIntent.current === 'dragging') return; // 拖动中不响应
                    const arr = reviewNotes;
                    const i = arr.findIndex((n: any) => n.id === sat.id);
                    if (i < 0) return;
                    // 判断方向：从右侧卫星卡跳到主卡 = 反向（prev），反之 next
                    const direction = i < store.currentIndex ? 'prev' : 'next';
                    animateSwitch(direction, () => { store.currentIndex = i; });
                  }}
                  style={{
                    top: pos.top as any,
                    left: pos.left as any,
                    right: pos.right as any,
                    bottom: pos.bottom as any,
                    transform: `translateX(${dragDx * pos.parallax}px) rotate(${pos.rotate}deg)`,
                    transition: dragState.current.dragging ? 'none' : 'transform 260ms cubic-bezier(.4,0,.2,1)',
                    opacity: pos.opacity,
                    zIndex: pos.zIndex,
                  }}
                  className="absolute w-[min(36vw,200px)] md:w-[min(28vw,260px)] rounded-xl bg-white shadow-lg border border-default-200/60 overflow-hidden cursor-pointer hover:opacity-90 hover:!shadow-xl !transition-opacity"
                >
                  {/* mini cover */}
                  <div
                    className="relative w-full h-[68px] grid place-items-center"
                    style={{ background: satCoverBg }}
                  >
                    <span
                      className="text-[28px] leading-none"
                      style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.18))' }}
                    >
                      {satEmoji}
                    </span>
                    <span
                      className={`absolute left-1.5 top-1.5 inline-flex items-center px-1.5 py-px rounded-md text-[9px] font-semibold backdrop-blur-sm ${
                        satIsBlinko
                          ? 'bg-amber-500/90 text-white'
                          : 'bg-blue-500/90 text-white'
                      }`}
                    >
                      {satIsBlinko ? '⚡' : '📝'}
                    </span>
                    <span className="absolute right-1.5 bottom-1 text-[9px] text-white/90 tabular-nums tracking-wide">
                      {dayjs(sat.createdAt).format('MM·DD')}
                    </span>
                  </div>
                  <div className="px-2.5 py-1.5 text-[11.5px] text-default-700 leading-relaxed line-clamp-2 max-h-[52px] overflow-hidden">
                    <MarkdownTruncate content={sat.content ?? ''} />
                  </div>
                </article>
              );
            })}

          {/* 主卡片 - 居中（外层定位 + 中层切换动画 + 内层 drag transform） */}
          {reviewNotes.length > 0 && store.currentNote && (
            <div className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
              {/* 切换动画层：旧卡滑出 → 换内容 → 新卡滑入 */}
              <div
                key={animKey}
                style={{
                  transform: animTransform,
                  opacity: animOpacity,
                  transition: 'transform 200ms cubic-bezier(.4,0,.2,1), opacity 200ms ease',
                  willChange: 'transform, opacity',
                }}
              >
                {/* drag transform 层 */}
                <div
                  style={{
                    transform: `translate3d(${dragDx}px, 0, 0) rotate(${dragDx * 0.012}deg)`,
                    transition: dragState.current.dragging ? 'none' : 'transform 220ms cubic-bezier(.4,0,.2,1)',
                    cursor: dragState.current.dragging ? 'grabbing' : 'grab',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    // 关键：拖动期间（dragging）不开详情；只有真正的「点击」才开
                    if (pointerIntent.current === 'dragging') return;
                    openDetail(store.currentNote!);
                  }}
                >
                  <StickyCard note={store.currentNote} />
                </div>
              </div>
            </div>
          )}

          {/* 左右切换按钮（主卡两侧的大圆形 ghost） */}
          {reviewNotes.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); animateSwitch('prev', () => store.goPrev()); }}
                title={t('previous')}
                aria-label={t('previous')}
                className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 z-30 w-9 h-9 md:w-11 md:h-11 rounded-full bg-white/90 hover:bg-white text-default-700 hover:text-foreground shadow-md border border-default-200/60 flex items-center justify-center !transition-all hover:scale-110 active:scale-95 backdrop-blur"
              >
                <Icon icon="mdi:chevron-left" width="20" height="20" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); animateSwitch('next', () => store.goNext()); }}
                title={t('next')}
                aria-label={t('next')}
                className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 z-30 w-9 h-9 md:w-11 md:h-11 rounded-full bg-white/90 hover:bg-white text-default-700 hover:text-foreground shadow-md border border-default-200/60 flex items-center justify-center !transition-all hover:scale-110 active:scale-95 backdrop-blur"
              >
                <Icon icon="mdi:chevron-right" width="20" height="20" />
              </button>
            </>
          )}

          {reviewNotes.length === 0 && (
            <EmptyState onBack={() => navigate('/')} />
          )}
        </div>

        {/* ───────────── 底部操作 + 提示 ───────────── */}
        {reviewNotes.length > 0 && store.currentNote && (
          <div className="w-full max-w-[820px] mx-auto pb-6">
            {/* 进度点指示器：点击跳转 */}
            {reviewNotes.length > 1 && reviewNotes.length <= 30 && (
              <div className="flex items-center justify-center gap-1 mb-3 flex-wrap px-4">
                {reviewNotes.map((_: any, i: number) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (i === store.currentIndex) return;
                      const direction = i < store.currentIndex ? 'prev' : 'next';
                      animateSwitch(direction, () => { store.currentIndex = i; });
                    }}
                    aria-label={`Go to ${i + 1}`}
                    className={`!transition-all rounded-full ${
                      i === store.currentIndex
                        ? 'w-5 h-1.5 bg-primary'
                        : 'w-1.5 h-1.5 bg-default-300 hover:bg-default-400'
                    }`}
                  />
                ))}
              </div>
            )}
            <div className="flex items-center justify-center gap-3">
              {/* 6 个操作按钮 - 白 pill 容器 */}
              <div className="inline-flex items-center gap-1 px-3 py-2 rounded-full bg-white shadow-md border border-default-200/60">
                <ActionButton icon="hugeicons:share-05" title={t('share')} onClick={() => {
                  if (!store.currentNote) return;
                  blinko.curSelectedNote = store.currentNote;
                }} />
                <ActionButton icon="mdi:content-copy" title={t('copy-content')} onClick={() => {
                  if (!store.currentNote) return;
                  navigator.clipboard?.writeText(store.currentNote.content ?? '');
                }} />
                <ActionButton icon="tabler:trash" title={t('delete')} danger onClick={() => {
                  if (!store.currentNote) return;
                  showTipsDialog({
                    title: t('confirm-to-delete'),
                    content: t('this-operation-removes-the-associated-label-and-cannot-be-restored-please-confirm'),
                    onConfirm: async () => {
                      await api.notes.deleteMany.mutate({ ids: [store.currentNote!.id!] });
                      if (!store.isRandomReviewMode) await blinko.dailyReviewNoteList.call();
                      RootStore.Get(DialogStandaloneStore).close();
                    },
                  });
                }} />
                <ActionButton icon="hugeicons:logout-05" title={t('archive')} onClick={async () => {
                  if (!store.currentNote) return;
                  await blinko.upsertNote.call({ id: store.currentNote.id, isArchived: true });
                  if (!store.isRandomReviewMode) await blinko.dailyReviewNoteList.call();
                }} />
                <ActionButton icon="mdi:pencil-outline" title={t('edit')} onClick={async () => {
                  if (!store.currentNote) return;
                  const note = await api.notes.detail.mutate({ id: store.currentNote.id! });
                  RootStore.Get(DialogStandaloneStore).setData({
                    isOpen: true, onlyContent: true, showOnlyContentCloseButton: true, size: '4xl',
                    content: <BlinkoCard blinkoItem={note!} withoutHoverAnimation />,
                  });
                }} />
              </div>
            </div>
            <p className="mt-3 text-center text-[11.5px] text-default-500 inline-flex items-center gap-1.5 mx-auto">
              <span className="inline-flex items-center text-default-400">
                <Icon icon="mdi:arrow-left" width="12" height="12" />
                <Icon icon="mdi:arrow-right" width="12" height="12" />
              </span>
              <span>{t('review-shortcuts')}</span>
            </p>
          </div>
        )}
      </div>

      {/* 详情覆盖层：点击主卡打开，保留 review 页米色氛围 */}
      {detailNote && (
        <ReviewDetail
          note={detailNote}
          loading={detailLoading}
          onClose={closeDetail}
          onEdit={(n) => {
            // 编辑：复用原有 DialogStandalone 路径打开编辑器
            setDetailNote(null);
            RootStore.Get(DialogStandaloneStore).setData({
              isOpen: true, onlyContent: true, showOnlyContentCloseButton: true, size: '4xl',
              content: <BlinkoCard blinkoItem={n} withoutHoverAnimation />,
            });
          }}
        />
      )}
    </ScrollArea>
  );
});

/** 简短文本截取（不依赖 MarkdownRender 避免巨大节点渲染） */
const MarkdownTruncate = ({ content }: { content: string }) => {
  const text = content
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return <span>{text}{content.length > 80 ? '…' : ''}</span>;
};

/** pill 筛选 chip —— 白底 + icon + label + 可选 chevron + 选中态 */
const FilterChip = ({
  icon, label, trailing, active, onClick,
}: { icon: string; label: string; trailing?: boolean; active?: boolean; onClick?: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 h-8 text-[12.5px] border !transition-colors ${
      active
        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
        : 'bg-white border-default-200 text-default-700 hover:border-default-300 hover:text-foreground'
    }`}
  >
    <Icon icon={icon} width="14" height="14" />
    <span>{label}</span>
    {trailing && <Icon icon="mdi:chevron-down" width="12" height="12" />}
  </button>
);

/** 圆形 ghost 操作按钮 —— 8×8 icon，design 风格 + danger 变体 */
const ActionButton = ({
  icon, title, onClick, danger,
}: { icon: string; title: string; onClick: () => void; danger?: boolean }) => (
  <Tooltip content={title} delay={500}>
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      aria-label={title}
      className={`w-9 h-9 rounded-full flex items-center justify-center !transition-colors ${
        danger
          ? 'text-default-500 hover:!bg-red-50 hover:!text-red-500'
          : 'text-default-600 hover:!bg-default-100 hover:text-foreground'
      }`}
    >
      <Icon icon={icon} width="16" height="16" />
    </button>
  </Tooltip>
);

/** 主卡片 —— 白底 rounded-2xl + 装饰 cover + meta + 内容 + tags */
const StickyCard = observer(({ note }: { note: any }) => {
  if (!note) return null;
  const isBlinko = note.type === NoteType.BLINKO;
  const emoji = (note as any).metadata?.icon || (isBlinko ? '⚡' : '📝');
  const firstImage = (note.attachments ?? []).find((a: any) => a.type?.startsWith?.('image/'));
  // Blinko 卡片默认是橙黄渐变；Note 有图就用图
  const coverBg = isBlinko
    ? 'linear-gradient(135deg,#fbbf24 0%,#fb923c 50%,#f97316 100%)'
    : 'linear-gradient(135deg,#fef3c7 0%,#fde68a 50%,#fcd34d 100%)';
  return (
    <article className="relative w-[min(90vw,360px)] md:w-[min(70vw,520px)] rounded-2xl bg-white shadow-2xl border border-default-200/60 overflow-hidden cursor-grab active:cursor-grabbing">
      {/* 顶部拖动手柄 —— 提示可左右滑动 */}
      <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/15 backdrop-blur-sm">
        <span className="block w-1 h-1 rounded-full bg-white/80" />
        <span className="block w-1 h-1 rounded-full bg-white/80" />
        <span className="block w-1 h-1 rounded-full bg-white/80" />
      </div>
      {/* Cover - 渐变 + emoji / 图片 */}
      <div
        className="relative w-full h-[140px] md:h-[180px] overflow-hidden"
        style={firstImage ? undefined : { background: coverBg }}
      >
        {!firstImage && (
          <>
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle at 30% 40%, rgba(255,255,255,0.35) 0%, transparent 60%)',
              }}
            />
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                backgroundImage:
                  'radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1.5px)',
                backgroundSize: '14px 14px',
              }}
            />
            <div
              className="absolute inset-0 grid place-items-center text-[52px] md:text-[72px]"
              style={{ filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.18))' }}
            >
              {emoji}
            </div>
          </>
        )}
        {firstImage && (
          <img
            src={firstImage.path}
            alt=""
            className="w-full h-full object-cover"
          />
        )}
        {/* meta - 浮在 cover 左下角 */}
        <div className="absolute left-3 bottom-3 flex items-center gap-1.5">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-semibold backdrop-blur ${
            isBlinko
              ? 'bg-amber-500/95 text-white'
              : 'bg-blue-500/95 text-white'
          }`}>
            {isBlinko ? '⚡ 闪念' : '📝 笔记'}
          </span>
        </div>
        <div className="absolute right-3 bottom-3 text-[11px] text-white/90 tabular-nums tracking-wide backdrop-blur-sm bg-black/20 px-2 py-0.5 rounded-md">
          {dayjs(note.createdAt).format('YYYY · MM · DD')}
        </div>
      </div>

      {/* 正文 + 附件 */}
      <div className="px-6 py-4 md:py-5 text-[13.5px] text-foreground leading-relaxed max-h-[180px] md:max-h-[220px] overflow-y-auto">
        <MarkdownRender content={note.content ?? ''} />
        {(note.attachments ?? []).filter((a: any) => a !== firstImage).length > 0 && (
          <div className="mt-3">
            <FilesAttachmentRender
              columns={3}
              files={(note.attachments ?? []).filter((a: any) => a !== firstImage)}
              preview
            />
          </div>
        )}
      </div>

      {/* tags 行（如果有） */}
      <div className="px-5 pb-3 pt-1 flex flex-wrap items-center gap-1.5 text-[11px] border-t border-default-200/40">
        {(note.tags ?? []).slice(0, 5).map((tag: any, idx: number) => (
          <span
            key={idx}
            className="inline-flex items-center px-2 py-0.5 rounded-full bg-default-100 text-default-600"
          >
            # {tag?.tag?.name ?? tag?.name}
          </span>
        ))}
      </div>
    </article>
  );
});

const EmptyState = ({ onBack }: { onBack: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-32 select-none">
      <div className="text-[80px] leading-none">🎉</div>
      <div className="mt-4 text-[18px] font-bold text-foreground">{t('review-everything')}</div>
      <div className="mt-2 text-[13px] text-default-500 max-w-[420px]">
        {t('review-blank-hint')}
      </div>
      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 !transition-colors shadow-sm"
      >
        <Icon icon="tabler:home" width="16" height="16" />
        <span>{t('back-to-home')}</span>
      </button>
    </div>
  );
};

/**
 * Review 页内详情覆盖层 —— 不弹 Modal，保持米色氛围
 * 仿竞品：顶部大封面 + 统计行 + 完整正文 + 标签 + 底部操作
 */
const ReviewDetail = observer(({
  note, loading, onClose, onEdit,
}: {
  note: any;
  loading: boolean;
  onClose: () => void;
  onEdit: (n: any) => void;
}) => {
  const { t } = useTranslation();
  if (!note) return null;
  const isBlinko = note.type === NoteType.BLINKO;
  const isNote = note.type === NoteType.NOTE;
  const emoji = note.metadata?.icon || (isBlinko ? '⚡' : '📝');
  const firstImage = (note.attachments ?? []).find((a: any) => a.type?.startsWith?.('image/'));
  const otherAttachments = (note.attachments ?? []).filter((a: any) => a !== firstImage);
  const coverBg = isBlinko
    ? 'linear-gradient(135deg,#fbbf24 0%,#fb923c 50%,#f97316 100%)'
    : 'linear-gradient(135deg,#fef3c7 0%,#fde68a 50%,#fcd34d 100%)';
  // 统计
  const text = String(note.content ?? '').replace(/```[\s\S]*?```/g, '').replace(/[#*`>_\-\[\]\(\)]/g, '');
  const wordCount = text.trim().length;
  const imageCount = (note.attachments ?? []).filter((a: any) => a.type?.startsWith?.('image/')).length;
  const fileCount = (note.attachments ?? []).length;
  const minutes = Math.max(1, Math.ceil(wordCount / 300));

  return (
    <div
      className="fixed inset-0 z-[10060] bg-[#fdf2e9] dark:bg-[#1d1814] overflow-y-auto"
      onClick={onClose}
    >
      {/* 顶部 toolbar：返回 + 编辑 */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 md:px-8 py-3 bg-[#fdf2e9]/80 dark:bg-[#1d1814]/80 backdrop-blur-md border-b border-default-200/40">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-white border border-default-200 text-default-700 hover:border-default-300 hover:text-foreground !transition-colors text-[13px] shadow-sm"
        >
          <Icon icon="mdi:arrow-left" width="16" height="16" />
          <span>{t('back-to-home') === '回到首页' ? '返回回顾' : 'Back'}</span>
        </button>
        <div className="flex items-center gap-2">
          {loading && <span className="text-[12px] text-default-400">…</span>}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(note); }}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-default-100 text-default-700 hover:bg-default-200 !transition-colors text-[13px]"
          >
            <Icon icon="mdi:pencil-outline" width="14" height="14" />
            <span>{t('edit')}</span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="w-9 h-9 rounded-lg bg-[#FF5722] hover:bg-[#f4511e] text-white flex items-center justify-center !transition-colors shadow-md"
            aria-label={t('close')}
            title={t('close')}
          >
            <Icon icon="mdi:close" width="18" height="18" />
          </button>
        </div>
      </div>

      {/* 主体 */}
      <div className="max-w-[920px] mx-auto px-5 md:px-8 pt-8 md:pt-12 pb-24" onClick={(e) => e.stopPropagation()}>
        {/* type chip + date */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            isBlinko ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {isBlinko ? '⚡ 闪念' : '📝 笔记'}
          </span>
          <span className="text-[12px] text-default-500 tabular-nums tracking-wide">
            {dayjs(note.createdAt).format('YYYY · MM · DD · HH:mm')}
          </span>
        </div>

        {/* 统计行（仿竞品） */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-default-600 mb-6 pb-6 border-b border-default-200/60">
          <span className="flex items-center gap-1.5">
            <span className="text-[18px] font-semibold text-foreground tabular-nums">{minutes}</span>
            <span className="text-default-500">分钟阅读</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-[18px] font-semibold text-foreground tabular-nums">{wordCount}</span>
            <span className="text-default-500">字</span>
          </span>
          <span className="flex items-center gap-1.5 text-default-500">
            <Icon icon="mdi:image-outline" width="14" height="14" />
            <span className="tabular-nums">{imageCount}</span> 张图片
          </span>
          <span className="flex items-center gap-1.5 text-default-500">
            <Icon icon="mdi:paperclip" width="14" height="14" />
            <span className="tabular-nums">{fileCount}</span> 个附件
          </span>
          {(note.tags ?? []).slice(0, 3).map((tag: any, idx: number) => (
            <span
              key={idx}
              className="inline-flex items-center px-2 py-0.5 rounded-full bg-default-100 text-default-600 text-[11px]"
            >
              # {tag?.tag?.name ?? tag?.name}
            </span>
          ))}
        </div>

        {/* 大封面 */}
        <div
          className="relative w-full h-[260px] md:h-[360px] rounded-2xl overflow-hidden mb-8 shadow-lg"
          style={firstImage ? undefined : { background: coverBg }}
        >
          {!firstImage && (
            <>
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(circle at 30% 40%, rgba(255,255,255,0.35) 0%, transparent 60%)' }}
              />
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                  backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1.5px)',
                  backgroundSize: '14px 14px',
                }}
              />
              <div
                className="absolute inset-0 grid place-items-center text-[120px] md:text-[160px]"
                style={{ filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.2))' }}
              >
                {emoji}
              </div>
            </>
          )}
          {firstImage && (
            <img src={firstImage.path} alt="" className="w-full h-full object-cover" />
          )}
        </div>

        {/* 正文 */}
        <article className="text-[16px] leading-[1.8] text-foreground">
          <MarkdownRender content={note.content ?? ''} />
        </article>

        {/* 其他附件 */}
        {otherAttachments.length > 0 && (
          <div className="mt-8 pt-6 border-t border-default-200/60">
            <div className="text-[11.5px] font-medium tracking-[0.04em] uppercase text-default-400 mb-3">
              附件
            </div>
            <FilesAttachmentRender columns={3} files={otherAttachments} preview />
          </div>
        )}

        {/* tags */}
        {(note.tags ?? []).length > 0 && (
          <div className="mt-8 flex flex-wrap items-center gap-1.5 text-[12px]">
            {(note.tags ?? []).map((tag: any, idx: number) => (
              <span
                key={idx}
                className="inline-flex items-center px-2.5 py-1 rounded-full bg-default-100 text-default-600"
              >
                # {tag?.tag?.name ?? tag?.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default ReviewPage;
