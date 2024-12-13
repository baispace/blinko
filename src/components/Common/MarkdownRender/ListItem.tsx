import { Icon } from '@iconify/react';
import React from 'react';

interface ListItemProps {
  children: React.ReactNode;
  content: string;
  onChange?: (newContent: string) => void;
  className?: string;
}

export const ListItem: React.FC<ListItemProps> = ({ children, content, onChange, className }) => {
  if (!className?.includes('task-list-item')) {
    return <li className={className}>{children}</li>;
  }

  const childArray = React.Children.toArray(children);
  const checkbox = childArray.find((child: any) => child?.type === 'input') as any;
  const isChecked = checkbox?.props?.checked ?? false;

  const getTaskText = (nodes: any[]): string => {
    return nodes
      .filter((node: any) => node?.type !== 'input')
      .map((node: any) => {
        if (typeof node === 'string') return node;
        if (node?.props?.href) return `[${node.props.children}](${node.props.href})`;
        if (node?.props?.children) {
          return Array.isArray(node.props.children)
            ? getTaskText(node.props.children)
            : node.props.children;
        }
        return '';
      })
      .join('');
  };

  const getChildTasks = (nodes: any[]): { text: string; checked: boolean }[] => {
    //@ts-ignore
    return nodes
      .filter((node: any) => node?.type !== 'input')
      .map((node: any) => {
        if (node?.props?.className?.includes('task-list-item')) {
          const childCheckbox = node.props.children.find((child: any) => child?.type === 'input');
          const text = getTaskText([node]);
          console.log('Found child task:', { text, checked: childCheckbox?.props?.checked });
          return { text, checked: childCheckbox?.props?.checked ?? false };
        }
        if (node?.props?.children) {
          return getChildTasks(Array.isArray(node.props.children) ? node.props.children : [node.props.children]).flat();
        }
        return null;
      })
      .filter(Boolean)
      .flat();
  };

  const taskText = getTaskText(childArray);
  const textContent = childArray.filter((child: any) => child?.type !== 'input');
  const childTasks = getChildTasks(childArray);
  const hasChildren = childTasks.length > 0;
  const allChildrenChecked = hasChildren && childTasks.every(task => task.checked);
  const someChildrenChecked = hasChildren && childTasks.some(task => task.checked);

  // console.log('Task info:', {
  //   text: taskText,
  //   hasChildren,
  //   childTasks,
  //   allChildrenChecked,
  //   someChildrenChecked
  // });

  const handleToggle = (e: React.MouseEvent) => {
    // console.log('Toggle clicked');
    if (!onChange) return;
    e.stopPropagation();
    
    let newContent = content;
    const targetState = hasChildren ? !allChildrenChecked : !isChecked;

    // console.log('Updating states:', {
    //   current: isChecked,
    //   target: targetState,
    //   hasChildren,
    //   allChildrenChecked
    // });

    const oldMark = `* [${isChecked ? 'x' : ' '}]${taskText}`;
    const newMark = `* [${targetState ? 'x' : ' '}]${taskText}`;
    newContent = newContent.replace(oldMark, newMark);

    if (hasChildren) {
      childTasks.forEach(task => {
        const oldChildMark = `* [${task.checked ? 'x' : ' '}]${task.text}`;
        const newChildMark = `* [${targetState ? 'x' : ' '}]${task.text}`;
        // console.log('Updating child task:', {
        //   from: oldChildMark,
        //   to: newChildMark
        // });
        newContent = newContent.replace(oldChildMark, newChildMark);
      });
    }

    // console.log('Content update:', {
    //   old: content,
    //   new: newContent
    // });

    onChange(newContent);
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

  return (
    <li className={`${className} !list-none`}>
      <div 
        className='flex items-start gap-1 -ml-[15px] cursor-pointer'
        onClick={handleToggle}
      >
        <div className='w-[20px] h-[20px] flex-shrink-0 mt-[3px] hover:opacity-80 transition-all'>
          <Icon 
            className='text-[#EAB308]' 
            icon={getIcon()} 
            width="20" 
            height="20" 
          />
        </div>
        <div 
          className={`${isChecked ? 'line-through text-desc' : ''} break-all flex-1 min-w-0`}
          onClick={e => e.stopPropagation()}
        >
          {textContent}
        </div>
      </div>
    </li>
  );
}; 