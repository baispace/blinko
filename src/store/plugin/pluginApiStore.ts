import { Store } from "../standard/base";

type ToolbarIcon = {
  name: string;
  icon: string;
  content: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
  maxWidth: number;
}

type AddToolBarIconOptions = {
  name: string;
  icon: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  maxWidth?: number;
}

export class PluginApiStore extends Store {
  sid = 'pluginApiStore';
  
  customToolbarIcons: ToolbarIcon[] = [];

  addToolBarIcon(options: AddToolBarIconOptions) {
    this.customToolbarIcons.push({
      name: options.name,
      icon: options.icon,
      content: options.content,
      placement: options.placement || 'top',
      maxWidth: options.maxWidth || 300,
    });
  }
}