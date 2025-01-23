import { api } from "@/lib/trpc";
import { BasePlugin } from ".";
import { Store } from "../standard/base";
import { eventBus } from "@/lib/event";
import System from 'systemjs/dist/system.js';

export class PluginManagerStore extends Store {
  sid = 'pluginManagerStore';
  private plugins: Map<string, BasePlugin> = new Map();

  constructor() {
    super();
    if (typeof window !== 'undefined') {
      window.Blinko = {
        api,
        eventBus,
      };
    }
  }

  async loadPlugin(pluginPath: string) {
    try {
      if (typeof window !== 'undefined' && !window.System) {
        window.System = System;
      }
      const module = await window.System.import(`/plugins/index.js`);
      console.log(module);
      const PluginClass = module.default;
      console.log(PluginClass);
      const plugin = new PluginClass();
      console.log(plugin);
      plugin.mount();

      this.plugins.set(plugin.name, plugin);
      return plugin;
    } catch (error) {
      console.error(`load plugin error: ${pluginPath}`, error);
      throw error;
    }
  }

  destroyPlugin(pluginName: string) {
    const plugin = this.plugins.get(pluginName);
    if (plugin) {
      plugin.destroy();
      this.plugins.delete(pluginName);
    }
  }
}

declare global {
  interface Window {
    System: typeof System;
  }
}