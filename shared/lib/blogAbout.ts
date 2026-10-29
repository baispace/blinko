/**
 * 关于页的共享限制。
 *
 * 前后端都从这里取数字：后台编辑器不能填超，后端校验也用同一套，
 * 不会出现「后台能填 5 篇、公开页只显示 3 篇」这种对不上的情况。
 */

/** 关于页最多精选几篇文章。 */
export const ABOUT_FEATURED_MAX = 3;
/** 关于页最多展示几个专题。 */
export const ABOUT_TOPIC_MAX = 4;
/** 单条推荐理由最长。 */
export const ABOUT_REASON_MAX = 120;
/** 站点说明最长。 */
export const ABOUT_SPACE_INTRO_MAX = 2000;
