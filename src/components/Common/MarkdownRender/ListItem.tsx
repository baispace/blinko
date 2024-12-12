import { Icon } from '@iconify/react';
import React from 'react';

interface ListItemProps {
  children: any;
  content: string;
  onChange?: (newContent: string) => void;
}

const renderListItems = (children: any, onChange: (newContent: string) => void, content: string) => {
  const childrenArray = Array.isArray(children) ? children : [children];

  return childrenArray?.map((child: any, index: number) => {
    if (child?.type === 'input') {
      let text = '';
      let originalText = '';
      let renderItem: React.ReactElement[] = [];
      const siblings = children.filter((_, i) => i !== index);

      const textContent = siblings.map(sibling => {
        if (typeof sibling === 'string') {
          return sibling;
        }
        if (sibling?.props?.children) {
          return sibling.props.children;
        }
        return '';
      }).join('');

      const originalTextContent = siblings.map(sibling => {
        if (typeof sibling === 'string') {
          return sibling;
        }
        if (sibling?.props?.href) {
          return `[${sibling.props.children}](${sibling.props.href})`;
        }
        if (sibling?.props?.children) {
          return sibling.props.children;
        }
        return '';
      }).join('');

      text = textContent;
      originalText = originalTextContent;

      renderItem.push(
        <span key={index}>
          {siblings.map((sibling, i) =>
            typeof sibling === 'string' ? sibling : React.cloneElement(sibling, { key: `sibling-${i}` })
          )}
        </span>
      );

      const isChecked = child.props?.checked ?? false;
      const iconType = isChecked ? "lets-icons:check-fill" : "ci:radio-unchecked";

      return (
        <div key={index} className='!ml-[-30px] flex items-start gap-1 cursor-pointer hover:opacity-80'
          onClick={() => {
            const newContent = isChecked
              ? content.replace(`* [x]${originalText}`, `* [ ]${originalText}`).replace(`- [x]${originalText}`, `- [ ]${originalText}`)
              : content.replace(`* [ ]${originalText}`, `* [x]${originalText}`).replace(`- [ ]${originalText}`, `- [x]${originalText}`);
            onChange(newContent)
          }}>
          <div className='w-[20px] h-[20px] flex-shrink-0 mt-[3px]'>
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
    }
    if (child?.props?.children) {
      return renderListItems(child.props.children, onChange, content);
    }
  }).filter(Boolean);
};

export const ListItem = ({ children, content, onChange }: ListItemProps) => {
  try {
    //@ts-ignore
    return <ul className="break-all">{renderListItems(children, onChange, content)}</ul>;
  } catch (error) {
    console.log(error)
    return <li className="break-all">{children}</li>;
  }
}; 