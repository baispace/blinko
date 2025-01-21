export enum PluginType {
  FrontendPlugin = 'frontend',
  BackendPlugin = 'backend',
}

export abstract class BasePlugin {
  name: string;
  description: string;
  version: string;
  type: PluginType;
  icon?: string;
  mountPoints?: {
    navbar?: string;
    sidebar?: string;
    noteToolbar?: string;
    settingPanel?: string;
  };
  constructor(args: Partial<BasePlugin>) {
    Object.assign(this, args);
  }

  abstract mount(context: any): void;
  abstract init(): void;
  abstract destroy(): void;
}

export class FrontendPlugin extends BasePlugin {
  type: PluginType.FrontendPlugin
  constructor(args: Partial<FrontendPlugin>) {
    super(args);
    this.type = PluginType.FrontendPlugin;
  }

  mount(context: any) {
    console.log('mount', context);
  }

  init() {
    console.log('init');
  }

  destroy() {
    console.log('destroy');
  }
}