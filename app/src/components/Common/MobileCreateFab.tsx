import { Icon } from "@/components/Common/Iconify/icons";
import { NoteType } from "@shared/lib/types";
import { ShowEditBlinkoModel } from "@/components/BlinkoRightClickMenu";
import { FocusEditorFixMobile } from "@/components/Common/Editor/editorUtils";

/**
 * 移动端的「新建」悬浮按钮。
 *
 * 列表页底部常驻输入框在 H5 上太贵：编辑框加一整行工具栏要吃掉小半屏，
 * 列表真正能看到的闪念只剩几条，而且输入框一直占着焦点位。
 *
 * 换成右下角一个按钮：
 *   · 列表拿回整屏高度，滚动能看到更多内容；
 *   · 点开是底部弹出的创建面板，工具栏、附件、标签都在那一屏里，不用和列表挤；
 *   · 写完保存回到列表，位置和动线都比「先滑到底部再点输入框」短。
 *
 * 类型跟当前所在的列表走：闪念页写闪念，笔记页写笔记 ——
 * 和原来常驻输入框的行为一致，不让用户每次都改一次类型。
 */
export function MobileCreateFab({
  noteType = NoteType.BLINKO,
}: {
  noteType?: NoteType;
}) {
  const label = noteType === NoteType.NOTE ? "新建笔记" : "新建闪念";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        ShowEditBlinkoModel("2xl", "create", undefined, noteType);
        // 弹层里的编辑器要等挂载后才拿得到焦点节点，这里补一次聚焦。
        setTimeout(() => FocusEditorFixMobile(), 350);
      }}
      className="fixed right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition-transform active:scale-95 md:hidden"
      style={{ bottom: "calc(76px + env(safe-area-inset-bottom, 0px))" }}
    >
      <Icon icon="tabler:plus" width={24} height={24} />
    </button>
  );
}
