
import { api } from "../../lib/trpc";
import { eventBus } from "../../lib/event";
import System from 'systemjs/dist/system.js';
import React from "react";
import ReactDOM from "react-dom";
import i18n from "@/lib/i18n";

export enum PluginType {
  FrontendPlugin = 'frontend',
  BackendPlugin = 'backend',
}

export interface BlinkoGlobal {
  api: typeof api;
  eventBus: typeof eventBus;
  i18n: typeof i18n;
  version: string;
}

declare global {
  interface Window {
    Blinko: BlinkoGlobal;
    React: typeof React;
    ReactDOM: typeof ReactDOM;
    System: typeof System;
  }
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