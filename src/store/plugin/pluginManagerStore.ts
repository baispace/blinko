import { api } from "@/lib/trpc";
import { BasePlugin } from ".";
import { Store } from "../standard/base";
import { eventBus } from "@/lib/event";

export class PluginManagerStore extends Store {
  sid = 'pluginManagerStore';
  private plugins: Map<string, BasePlugin> = new Map();

  async loadPlugin(pluginPath: string) {
    try {
      const response = await fetch('/plugins/index.js');
      const code = await response.text();

      const processedCode = code.replace(/export\s*{[\s\S]*}.*;/, '');
      console.log(processedCode);
      const moduleFactory = new Function(`
        ${processedCode}
        return function createPlugin(args) {
          return new MyCustomPlugin(args);
        }
      `);
      console.log(moduleFactory);
      const createPlugin = moduleFactory();
      console.log(createPlugin);
      const plugin = createPlugin({});
      plugin.mount({
        api,
        eventBus
      });
      this.plugins.set(plugin.name, plugin);
      return plugin;
    } catch (error) {
      console.error(`error loading plugin: ${pluginPath}`, error);
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