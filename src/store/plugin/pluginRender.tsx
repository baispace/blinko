import React, { useRef } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@nextui-org/react';
import { Icon } from '@iconify/react';
import { type ToolbarIcon } from './pluginApiStore';

interface PluginRenderProps {
  item: ToolbarIcon;
}

export const PluginRender: React.FC<PluginRenderProps> = ({ item }) => {
  const contentRef = useRef<HTMLElement | null>(null);

  return (
    <Popover placement={item.placement} onOpenChange={(open) => {
      if (!open && contentRef.current) {
        contentRef.current.remove();
        contentRef.current = null;
      }
    }}>
      <PopoverTrigger>
        <button className="p-1 hover:bg-default-100 rounded-md">
          {item.icon.includes('svg') ?
            <div dangerouslySetInnerHTML={{ __html: item.icon }} className="w-[20px] h-[20px]" /> :
            <Icon icon={item.icon} className="w-[20px] h-[20px]" />
          }
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <div id={`plugin-${item.name}`} ref={(el) => {
          if (el && !contentRef.current) {
            contentRef.current = item.content();
            el.appendChild(contentRef.current);
          }
        }} />
      </PopoverContent>
    </Popover>
  );
}; 