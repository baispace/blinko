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

export class PluginManagerStore implements Store {
  sid = 'pluginManagerStore';
  private plugins: Map<string, BasePlugin> = new Map();
  private ws: WebSocket | null = null;

  constructor() {
    this.initBlinkoContext();
  }

  async connectDevPlugin(url: string) {
    try {
      if (this.ws) {
        this.ws.close();
      }

      this.ws = new WebSocket(url.replace('http', 'ws'));

      this.ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        try {
          await this.saveDevPlugin(data.code, data.fileName);
          await this.loadDevPlugin(data.fileName);
          RootStore.Get(ToastPlugin).success(i18n.t('plugin-updated'));
        } catch (error) {
          console.error('Plugin update error:', error);
          RootStore.Get(ToastPlugin).error(i18n.t('plugin-update-failed'));
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        RootStore.Get(ToastPlugin).error(i18n.t('plugin-connection-failed'));
      };

      this.ws.onclose = () => {
        this.ws = null;
      };

    } catch (error) {
      console.error('Connect dev plugin error:', error);
      throw error;
    }
  }

  initBlinkoContext() {
    if (typeof window !== 'undefined') {
      const pluginApi = RootStore.Get(PluginApiStore);
      window.Blinko = {
        api,
        eventBus,
        i18n,
        toast: RootStore.Get(ToastPlugin),
        version: '1.0.0',
        addToolBarIcon: pluginApi.addToolBarIcon.bind(pluginApi),
      };
    }

    if (typeof window !== 'undefined' && !window.System) {
      window.System = System;
    }
  }

  private async saveDevPlugin(code: string, fileName: string) {
    try {
      await api.plugin.saveDevPlugin.mutate({ code, fileName });
    } catch (error) {
      console.error('Save dev plugin error:', error);
      throw error;
    }
  }

  private async loadDevPlugin(fileName: string) {
    console.log('loadDevPlugin');
    try {
      const module = await window.System.import(`/plugins/dev/${fileName}`);
      const PluginClass = module.default;
      const plugin = new PluginClass();
      console.log('plugin', plugin);
      plugin.init();
      this.plugins.set(plugin.name, plugin);
      return plugin;
    } catch (error) {
      console.error('Load dev plugin error:', error);
    }
  }

  disconnectDevPlugin() {
    if (this.ws) {
      this.ws.close();
    }
  }

  async loadPlugin(pluginPath: string) {
    return
    return this.loadDevPlugin()
    try {
      const module = await window.System.import(`/plugins/index.js`);
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
