import { api } from "../../lib/trpc";
import { eventBus } from "../../lib/event";
import System from 'systemjs/dist/system.js';
import React from "react";
import ReactDOM from "react-dom";
import i18n from "@/lib/i18n";
import { ToastPlugin } from "../module/Toast/Toast";
import { RootStore } from "../root";

export enum PluginType {
  FrontendPlugin = 'frontend',
  BackendPlugin = 'backend',
}

declare global {
  interface Window {
    Blinko: {
      api: typeof api;
      eventBus: typeof eventBus;
      i18n: typeof i18n;
      version: string;
      toast: InstanceType<typeof ToastPlugin>;
      addToolBarIcon: (options: { name: string; icon: string; content: () => HTMLElement; placement?: string; maxWidth?: number; }) => void;
    };
    System?: typeof System;
  }
}

export interface I18nString {
  default: string;
  zh?: string;
  'zh-tw'?: string;
  en?: string;
  vi?: string;
  tr?: string;
  ka?: string;
  de?: string;
  es?: string;
  fr?: string;
  pt?: string;
  pl?: string;
  ru?: string;
  ko?: string;
  ja?: string;
  [key: string]: string | undefined;
}

export abstract class BasePlugin {
  name?: string;
  author?: string;
  url?: string;
  version?: string;
  minAppVersion?: string;
  displayName?: I18nString;
  description?: I18nString;
  readme?: I18nString;
  type?: PluginType;
  icon?: string;
  constructor(args: Partial<BasePlugin>) {
    Object.assign(this, args);
  }
  abstract init(): void;
  abstract destroy(): void;
}