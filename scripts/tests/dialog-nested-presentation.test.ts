import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRESENTATION_DEFAULTS, resolvePresentation } from '../../app/src/store/module/Dialog/presentation';

/**
 * 嵌套弹窗的表现层标志不能继承外层。
 *
 * 外层（设置面板、AI 聊天面板）是用 onlyContent 打开的 —— 头部和内边距由
 * 弹窗内容自己负责。内层再开弹窗时，如果继承了 onlyContent，就会：
 *   - 不渲染 ModalHeader → 标题消失
 *   - 不渲染 ModalBody   → 表单没有 px-5 / pb-5 内边距，内容直接贴到弹窗边缘
 *   - 不渲染关闭按钮     → 用户只能靠 Esc 或点击外部关闭
 *
 * setData 过去只在弹窗关闭时重置这些标志；嵌套时 store 仍是 isOpen，
 * 重置逻辑不执行，于是标志被原样带进了内层。
 */

const ROOT = join(import.meta.dir, '../..');
const STORE_SOURCE = readFileSync(join(ROOT, 'app/src/store/module/Dialog/index.tsx'), 'utf8');

test('表现层默认值为普通弹窗形态', () => {
  expect(PRESENTATION_DEFAULTS.onlyContent).toBe(false);
  expect(PRESENTATION_DEFAULTS.noPadding).toBe(false);
  expect(PRESENTATION_DEFAULTS.showOnlyContentCloseButton).toBe(false);
  expect(PRESENTATION_DEFAULTS.hideCloseButton).toBe(false);
  expect(PRESENTATION_DEFAULTS.size).toBe('md');
});

test('未显式指定的字段回到默认值 —— 嵌套弹窗不继承外层标志', () => {
  // 内层只传了 title / content
  const reset = resolvePresentation({});
  expect(reset.onlyContent).toBe(false);
  expect(reset.noPadding).toBe(false);
  expect(reset.showOnlyContentCloseButton).toBe(false);
  expect(reset.size).toBe('md');
});

test('调用点显式指定的字段以调用点为准', () => {
  const reset = resolvePresentation({ onlyContent: true, size: '2xl' });
  expect('onlyContent' in reset).toBe(false);
  expect('size' in reset).toBe(false);
  // 其余未指定的仍回到默认值
  expect(reset.noPadding).toBe(false);
  expect(reset.showOnlyContentCloseButton).toBe(false);
});

test('setData 确实应用了表现层重置', () => {
  // 纯逻辑模块已经被抽出来单测，这里钉住 store 侧没有退回旧的「只在关闭时重置」
  expect(STORE_SOURCE).toContain('resolvePresentation(v)');
  expect(STORE_SOURCE).not.toMatch(/if\s*\(!this\.isOpen\)\s*\{[^}]*onlyContent:\s*false/);
});
