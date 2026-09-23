import { Icon } from '@/components/Common/Iconify/icons';
import React from 'react';

interface ListItemProps {
  children: React.ReactNode;
  onChange?: (updater: (current: string) => string) => void;
  className?: string;
  /** 任务项在源 markdown 中的 DFS 全局序号（来自 remark-task-list 注入的 id） */
  taskIndex?: number;
}

/**
 * 按任务项序号翻转源 markdown 中对应任务项的完成状态。
 * 通过逐行扫描任务项（`- [ ]` / `- [x]`）并计数定位到第 N 个（N = 序号），
 * 相比用文本 indexOf 定位，能正确处理任务文本带前导空格、重复文本、
 * 多次切换后错位等问题。
 */
const toggleTasksByIndex = (
  content: string,
  indexes: number[],
  targetState: boolean
): string => {
  const idxSet = new Set(indexes);
  const lines = content.split('\n');
  let taskIdx = 0;
  let changed = false;
  const out = lines.map(line => {
    const m = /^(\s*[-*+]\s+)\[([ xX])\](.*)$/.exec(line);
    if (!m) return line;
    const cur = taskIdx;
    taskIdx++;
    if (!idxSet.has(cur)) return line;
    const next = `${m[1]}[${targetState ? 'x' : ' '}]${m[3]}`;
    if (next !== line) changed = true;
    return next;
  });
  // 未匹配到任何目标（例如 taskIndex 失效）时原样返回，避免误写
  return changed ? out.join('\n') : content;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getChildTasks = (nodes: any[]): { index: number; checked: boolean }[] => {
  return nodes.map(node => {
    const className = node?.props?.className;
    if (!className) return null;

    if (className.includes('task-list-item')) {
      const checkbox = findCheckbox(node.props.children);
      // 子任务 li 是 react-markdown 默认渲染的 <li>（不会走自定义 li renderer），
      // 因此没有 taskIndex prop，但 remark-task-list 仍注入了 id="task-list-item-N"，
      // 直接从 id 解析序号即可。
      const id = node?.props?.id;
      const index = typeof id === 'string' && id.startsWith('task-list-item-')
        ? parseInt(id.slice('task-list-item-'.length), 10)
        : (node?.props?.taskIndex ?? -1);
      const checked = checkbox?.props?.checked ?? false;
      return [{ index, checked }, ...getChildTasks(node.props.children)];
    }
    if (className.includes('contains-task-list')) {
      return getChildTasks(node.props.children);
    }
    return null;
  }).filter(v => v !== null).flat();
};

/**
 * Find the checkbox <input> among a task item's children. In a tight list the
 * input is a direct child of <li>; in a loose list (blank lines between items)
 * mdast-util-to-hast nests it inside a <p>, so we recurse.
 */
const findCheckbox = (nodes: React.ReactNode): any => {
  const arr = React.Children.toArray(nodes);
  for (const node of arr) {
    if (!node || typeof node !== 'object') continue;
    const el = node as any;
    if (el.type === 'input') return el;
    if (el.props?.children) {
      const found = findCheckbox(el.props.children);
      if (found) return found;
    }
  }
  return null;
};

export const ListItem: React.FC<ListItemProps> = ({ children, onChange, className, taskIndex = -1 }) => {
  if (!className?.includes('task-list-item')) {
    return <li className={className}>{children}</li>;
  }

  const childArray = React.Children.toArray(children);
  const checkbox = findCheckbox(children) as any;
  const isChecked = checkbox?.props?.checked ?? false;

  const textContent = childArray.map((child: any) => {
    if (child?.type === 'input') return null;
    if (child?.props?.children?.[0]?.props?.type === 'checkbox') {
      return {
        ...child,
        props: {
          ...child.props,
          children: child.props.children.slice(1),
        }
      }
    }
    return child;
  }).filter(v => v !== null);
  const childTasks = getChildTasks(childArray);
  const hasChildren = childTasks.length > 0;
  const allChildrenChecked = hasChildren && childTasks.every(task => task.checked);
  const someChildrenChecked = hasChildren && childTasks.some(task => task.checked);

  const handleToggle = (e: React.MouseEvent) => {
    if (!onChange) return;
    e.stopPropagation();

    const targetState = hasChildren ? !allChildrenChecked : !isChecked;
    const indexes = hasChildren
      ? [taskIndex, ...childTasks.map(t => t.index)]
      : [taskIndex];

    // 以函数式更新基于「最新」内容计算，避免连续点击时用陈旧闭包
    // 覆盖前一次点击结果（此前只会生效最后一次/第一次点击）。
    onChange(current => toggleTasksByIndex(current, indexes, targetState));
  };

  const getIcon = () => {
    if (!hasChildren) {
      return isChecked ? "lets-icons:check-fill" : "ci:radio-unchecked";
    }
    if (allChildrenChecked) {
      return "lets-icons:check-fill";
    }
    if (someChildrenChecked) {
      return "ri:indeterminate-circle-line";
    }
    return "ci:radio-unchecked";
  };

  const getTextStyle = () => {
    if (!hasChildren) {
      return isChecked ? 'line-through text-desc' : '';
    }
    return allChildrenChecked ? 'line-through text-desc' : '';
  };

  return (
    <li className={`${className} !list-none`}>
      <div 
        className='flex items-start gap-1 -ml-[15px] cursor-pointer justify-center'
        onClick={handleToggle}
      >
        <div className='w-[20px] h-[20px] flex-shrink-0 mt-[3px] hover:opacity-80 !transition-all'>
          <Icon 
            className='text-[#EAB308]' 
            icon={getIcon()} 
            width="20" 
            height="20" 
          />
        </div>
        <div
          className={`${getTextStyle()} break-all flex-1 min-w-0 md:mt-0 mt-[2px]`}
          onClick={e => e.stopPropagation()}
        >
          {textContent}
        </div>
      </div>
    </li>
  );
}; 