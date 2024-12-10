import { Icon } from '@iconify/react';
import React from 'react';

interface ListItemProps {
  children: any;
  content: string;
  onChange?: (newContent: string) => void;
}

const renderListItems = (children: any, onChange: (newContent: string) => void, content: string) => {
  return children.map((child: any, index: number) => {
    if (child?.type === 'input') {
      let text = '';
      let renderItem: React.ReactElement[] = [];
      const siblings = children.filter((_, i) => i !== index);
      const textContent = typeof siblings[0] === 'string' ? siblings[0] : '';
      text = textContent;
      renderItem.push(<span key={index}>{textContent}</span>);
      const isChecked = child.props?.checked ?? false;
      const iconType = isChecked ? "lets-icons:check-fill" : "ci:radio-unchecked";
      return (
        <div key={index} className='!ml-[-30px] flex items-start gap-1 cursor-pointer hover:opacity-80'
          onClick={() => {
            const newContent = isChecked
              ? content.replace(`* [x]${text}`, `* [ ]${text}`).replace(`- [x]${text}`, `- [ ]${text}`)
              : content.replace(`* [ ]${text}`, `* [x]${text}`).replace(`- [ ]${text}`, `- [x]${text}`);
            onChange(newContent)
          }}>
          <div className='w-[20px] h-[20px] flex-shrink-0 mt-1'>
            <Icon className='text-[#EAB308]' icon={iconType} width="20" height="20" />
          </div>
          <div className={`${isChecked ? 'line-through text-desc' : ''} break-all`}>{renderItem}</div>
        </div>
      );
    }
    if (child?.props?.className === 'task-list-item') {
      return renderListItems(child.props.children, onChange, content);
    }
    if (child?.type === 'ul') {
      return (
        <ul key={index}>
          {renderListItems(child.props.children, onChange, content)}
        </ul>
      );
    }
    if (typeof child === 'string') {
      return null;
    }
    if (child?.props?.children) {
      return renderListItems(child.props.children, onChange, content);
    }
    return null;
  }).filter(Boolean);
};

export const ListItem = ({ children, content, onChange }: ListItemProps) => {
  try {
    //@ts-ignore
    return <ul className="break-all">{renderListItems(children, onChange, content)}</ul>;
  } catch (error) {
    return <li className="break-all">{children}</li>;
  }
}; 