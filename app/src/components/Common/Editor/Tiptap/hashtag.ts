import { Extension } from '@tiptap/core';
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import type { TagTreeDBNode } from '@shared/lib/helper';
import { scanHashtagTokens } from '@shared/lib/tags';
import type { HashtagState, HashtagItem } from './hashtagState';

const MAX_ITEMS = 20;

/**
 * 这个 key 必须是**独立实例**，不能省。
 *
 * `@tiptap/suggestion` 内部的默认 key 是模块级单例
 * `const SuggestionPluginKey = new PluginKey('suggestion')`，所有 Suggestion 实例共用同一个。
 * ProseMirror 建 EditorState 时会校验同 key 的插件实例，撞上就抛
 * `RangeError: Adding different instances of a keyed plugin (suggestion$)`，
 * 直接把整个 React 树打崩成白屏。
 *
 * 所以：每多开一个 Suggestion 实例，就必须多给一个 pluginKey。
 */
const HashtagSuggestionKey = new PluginKey('hashtagSuggestion');

/**
 * 把标签树摊平成「全路径 + 计数」，供建议列表本地过滤。
 * 数据源是 store 里已加载的 tagList（侧边栏标签面板在用同一份），不发请求。
 */
const collectTagItems = (): HashtagItem[] => {
  const tagList = RootStore.Get(BlinkoStore).tagList.value;
  if (!tagList) return [];
  const items: HashtagItem[] = [];
  const walk = (nodes: TagTreeDBNode[]) => {
    nodes.forEach((node) => {
      const path = node.metadata?.path;
      if (path) items.push({ id: node.id, path, count: tagList.tagCounts?.[node.id] ?? 0 });
      if (node.children?.length) walk(node.children);
    });
  };
  walk(tagList.listTags);
  return items;
};

const filterTagItems = (query: string): HashtagItem[] => {
  const q = query.trim().toLowerCase();
  const matched = collectTagItems()
    .filter((i) => !q || i.path.toLowerCase().includes(q))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, MAX_ITEMS);

  // 输入的名字库里还没有 → 允许直接创建（flomo 的行为）
  if (q && !matched.some((i) => i.path.toLowerCase() === q)) {
    matched.unshift({ id: -1, path: query.trim(), count: 0, isNew: true })
  }
  return matched
}

/**
 * 编辑器内的行内标签高亮。
 *
 * 用 Decoration 而不是 Mark/Node：文档结构完全不变，markdown 序列化也不变，
 * 所以对库里已有笔记零影响 —— 只是「看起来是蓝色的」。
 */
const HashtagHighlight = new Plugin({
  key: new PluginKey('hashtagHighlight'),
  props: {
    decorations(state) {
      const decorations: Decoration[] = []
      state.doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return
        for (const token of scanHashtagTokens(node.text)) {
          decorations.push(
            Decoration.inline(pos + token.start, pos + token.end, { class: 'blinko-hashtag' })
          )
        }
      })
      return DecorationSet.create(state.doc, decorations)
    },
  },
})

/**
 * 输入 `#` 弹出标签建议。
 *
 * 独立于 SlashCommand 的一个 Suggestion 实例。两条约束互不相同，都踩过：
 * - `char` 只接受单个字符串。曾经的 `@` 提及就是塞成 `char: ['/', '@']` 被回滚的（见 b06a9a0f）。
 * - 每个实例必须带自己的 `pluginKey`，见 HashtagSuggestionKey 的注释。
 *
 * 选中后插入的是**纯文本** `#标签名 `，与服务端解析规则完全一致 ——
 * 存进库的还是 markdown 里的 `#xxx`，不引入任何新的存储格式。
 */
export const HashtagSuggestion = Extension.create<{ hashtagMenu: HashtagState }>({
  name: 'hashtagSuggestion',

  addOptions() {
    return {
      hashtagMenu: undefined as unknown as HashtagState,
    }
  },

  addProseMirrorPlugins() {
    const plugins = [HashtagHighlight]
    const { hashtagMenu } = this.options
    if (!hashtagMenu) return plugins

    plugins.push(
      Suggestion({
        editor: this.editor,
        pluginKey: HashtagSuggestionKey,
        char: '#',
        allowSpaces: false,
        items: ({ query }) => filterTagItems(query),
        command: ({ editor, range, props }) => {
          const item = props as HashtagItem
          // 中文输入法提交时，query 文本可能落在 suggestion range 之外，
          // 把删除范围扩到最近的 '#'，否则过滤词会残留在正文里
          try {
            const $from = editor.state.selection.$from
            const before = $from.parent.textBetween(0, $from.parentOffset, null, '\uFFFC')
            const hashIdx = before.lastIndexOf('#')
            if (hashIdx !== -1) {
              const absHash = $from.start() + hashIdx
              if (absHash < range.from) {
                range = { ...range, from: absHash }
              }
            }
          } catch { /* keep original range */ }
          // 末尾补一个空格：服务端的标签正则要求 token 右侧是空白或文末，
          // 不补空格的话紧跟着的下一个词会把这个标签粘住
          editor.chain().focus().deleteRange(range).insertContent(`#${item.path} `).run()
        },
        render: () => ({
          onStart: (props: SuggestionProps) => hashtagMenu.open(props),
          onUpdate: (props: SuggestionProps) => hashtagMenu.update(props),
          onKeyDown: (props: SuggestionKeyDownProps) => hashtagMenu.onKeyDown(props),
          onExit: () => hashtagMenu.close(),
        }),
      })
    )
    return plugins
  },
})
