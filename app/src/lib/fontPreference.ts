/**
 * 字体偏好本地镜像（消除刷新时的 FOUT）
 *
 * 背景：用户的字体选择存在服务端 config 表里，浏览器拿到 HTML 的那一刻根本不知道
 * 该用哪个字体，只能先用 `globals.css` 里的系统字体栈把首屏画出来。等
 * `UserStore` 拉完 config → `api.fonts.list` 拉完字体清单 → `api.fonts.getFontData`
 * 下载完二进制，字体才终于应用上。整条链路有三段串行网络往返，刷新时肉眼能看到
 * "系统字体 → 自定义字体"跳一下。
 *
 * 这里把已生效的字体镜像到 localStorage，让 `index.html` 的首屏内联脚本能在
 * React 和业务请求之前同步套上正确的 font-family。
 *
 * ⚠️ key 必须与 `app/index.html` 里的内联脚本保持一致，
 *    由 `scripts/tests/font-preference.test.ts` 校验，漂移会让首屏脚本失效。
 */

export const FONT_STACK_KEY = 'ink:font-stack';
export const FONT_NAME_KEY = 'ink:font-name';
export const FONT_WEIGHTS_KEY = 'ink:font-weights';

export interface SavedFontPreference {
  /** 字体名，同时用作 FontFace 的 family 名 */
  name: string;
  /** 完整的 font-family 栈（含 fallback），直接写进 --font-family */
  stack: string;
  /** 字重列表，长度 > 4 视为可变字体 */
  weights: number[];
}

/**
 * 读出上次生效的字体偏好。任何异常（隐私模式 / 配额满 / 数据损坏）都退化成 null，
 * 静默走系统字体栈 —— 首屏优化失败不应该影响功能。
 */
export function readSavedFontPreference(): SavedFontPreference | null {
  try {
    const name = localStorage.getItem(FONT_NAME_KEY);
    const stack = localStorage.getItem(FONT_STACK_KEY);
    if (!name || !stack) return null;

    let weights: number[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(FONT_WEIGHTS_KEY) || '[]');
      if (Array.isArray(parsed)) weights = parsed.filter((n) => typeof n === 'number');
    } catch {
      weights = [];
    }

    return { name, stack, weights };
  } catch {
    return null;
  }
}

/** 把当前生效的字体镜像到 localStorage，供下一次首屏同步读取。 */
export function writeSavedFontPreference(pref: SavedFontPreference): void {
  try {
    localStorage.setItem(FONT_NAME_KEY, pref.name);
    localStorage.setItem(FONT_STACK_KEY, pref.stack);
    localStorage.setItem(FONT_WEIGHTS_KEY, JSON.stringify(pref.weights));
  } catch {
    // 存储不可用不影响功能，忽略
  }
}

/** 用户切回系统字体时清掉镜像，首屏脚本就会保持 CSS 默认值。 */
export function clearSavedFontPreference(): void {
  try {
    localStorage.removeItem(FONT_NAME_KEY);
    localStorage.removeItem(FONT_STACK_KEY);
    localStorage.removeItem(FONT_WEIGHTS_KEY);
  } catch {
    // 同上，忽略
  }
}
