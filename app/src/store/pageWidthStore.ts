import { action, computed, makeObservable, observable } from 'mobx';
import { Store } from './standard/base';

/**
 * Reading / editing page width, Feishu style: the user picks how much of the
 * window the note body should occupy.
 *
 * Kept in localStorage rather than the server config: it is a pure per-device
 * display preference, and a note that is comfortable on a 27" monitor is not
 * the one you want on a laptop.
 */
export type PageWidthMode = 'default' | 'wide' | 'full';

export const PAGE_WIDTH_STORAGE_KEY = 'blinko-note-page-width';

export const PAGE_WIDTH_ORDER: PageWidthMode[] = ['default', 'wide', 'full'];

/**
 * Measured off Feishu Docs (`page-main.docx-width-mode-*` rules):
 * standard 820px, large 1020px, full 100%.
 *
 * `undefined` means "fill the container".
 */
export const PAGE_WIDTH_MAX: Record<PageWidthMode, string | undefined> = {
  default: '820px',
  wide: '1020px',
  full: undefined,
};

/**
 * Horizontal inset for the note container: Feishu keeps the body away from the
 * window edges even in full mode (`page-main` 66px + `page-main-item` 32px),
 * so the full option is not truly full-bleed. Tailwind class, PC only — mobile
 * keeps its own tighter padding.
 */
export const PAGE_WIDTH_PAD_CLASS: Record<PageWidthMode, string> = {
  default: 'px-4 md:px-8',
  wide: 'px-4 md:px-8',
  full: 'px-6 md:px-16',
};

export class PageWidthStore extends Store {
  sid = 'PageWidthStore';
  mode: PageWidthMode = 'default';

  constructor() {
    super();
    try {
      const saved = localStorage.getItem(PAGE_WIDTH_STORAGE_KEY) as PageWidthMode | null;
      if (saved && PAGE_WIDTH_ORDER.includes(saved)) {
        this.mode = saved;
      }
    } catch { /* localStorage unavailable; fall back to default */ }
    // Not makeAutoObservable: MobX refuses it on classes that have a
    // superclass, so the fields are annotated explicitly instead.
    makeObservable(this, {
      mode: observable,
      maxWidth: computed,
      setMode: action,
      cycle: action,
    });
  }

  /** Applied as `maxWidth` on the note container; `undefined` = fill. */
  get maxWidth(): string | undefined {
    return PAGE_WIDTH_MAX[this.mode];
  }

  setMode = (mode: PageWidthMode) => {
    this.mode = mode;
    try {
      localStorage.setItem(PAGE_WIDTH_STORAGE_KEY, mode);
    } catch { /* ignore */ }
  };

  /** Cycles default → wide → full → default, for the single toolbar button. */
  cycle = () => {
    const i = PAGE_WIDTH_ORDER.indexOf(this.mode);
    this.setMode(PAGE_WIDTH_ORDER[(i + 1) % PAGE_WIDTH_ORDER.length]!);
  };
}
