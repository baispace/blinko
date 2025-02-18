/// <reference types="systemjs" />
import { api } from "@/lib/trpc";
import { BasePlugin } from ".";
import { Store } from "../standard/base";
import { eventBus } from "@/lib/event";
import System from 'systemjs/dist/system.js';
import i18n from "@/lib/i18n";
import { PluginApiStore } from './pluginApiStore';
import { RootStore } from "../root";
import { ToastPlugin } from "../module/Toast/Toast";

export class PluginManagerStore extends Store {
  sid = 'pluginManagerStore';
  private plugins: Map<string, BasePlugin> = new Map();

  constructor() {
    super();
  }

  async loadPlugin(pluginPath: string) {
    try {
      if (typeof window !== 'undefined') {
        const pluginApi = RootStore.Get(PluginApiStore);
        window.Blinko = {
          api,
          eventBus,
          i18n,
          //@ts-ignore
          toast: RootStore.Get(ToastPlugin),
          version: '1.0.0',
          addToolBarIcon: pluginApi.addToolBarIcon.bind(pluginApi),
        };
      }

      if (typeof window !== 'undefined' && !window.System) {
        window.System = System;
      }
      
      const module = await window.System.import(`/plugins/index.js`);
      console.log(module);
      const PluginClass = module.default;
      const plugin = new PluginClass();
      plugin.init();
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
