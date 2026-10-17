/**
 * FontManager - A singleton class for managing web fonts dynamically
 * 
 * Features:
 * - Lazy loading fonts - binary data fetched only when needed
 * - Caching loaded fonts to avoid re-downloading
 * - Applying fonts to document body
 * - Integration with the fonts database
 * - Support for CDN URLs as fallback
 */

import { api } from './trpc';
import { getBlinkoEndpoint } from './blinkoEndpoint';
import { resolveFontStylesheetUrl, WENKAI_LOCAL_CSS } from '@shared/lib/fontStylesheetUrl';
import {
  clearSavedFontPreference,
  readSavedFontPreference,
  writeSavedFontPreference,
} from './fontPreference';
import {
  readCachedFontBinary,
  writeCachedFontBinary,
} from './fontBinaryCache';

// Font metadata (without binary data)
export interface FontMetadata {
  id: number;
  name: string;
  displayName: string;
  url: string | null;
  isLocal: boolean;
  weights: number[];
  category: string;
  isSystem: boolean;
  sortOrder: number;
}

// Full font config with binary data (used internally after fetching)
export interface FontConfig extends FontMetadata {
  fileData?: string | null; // Base64 string, fetched on demand
}

interface LoadedFont {
  name: string;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  blobUrl?: string; // Store blob URL for cleanup
}

/**
 * Startup prepares cached glyphs with `block` within a brief rendering budget.
 * Font changes also await readiness before committing a new family.
 */
export type FontDisplay = 'swap' | 'optional' | 'block' | 'fallback';

/**
 * 给 Promise 加超时保护。首屏恢复路径不能被一个卡住的 IndexedDB 读取拖住。
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

class FontManagerClass {
  private static instance: FontManagerClass;
  private loadedFonts: Map<string, LoadedFont> = new Map();
  private fontRegistry: Map<string, FontConfig> = new Map();
  private currentFont: string = 'default';
  private initialized: boolean = false;
  private observer: MutationObserver | null = null;
  private currentFontFamily: string = '';
  private applyVersion = 0;
  /** Fonts that were requested but no longer exist, so we only warn once each. */
  private missingFontsWarned: Set<string> = new Set();

  private warnUnknownFont(fontName: string) {
    if (this.missingFontsWarned.has(fontName)) return;
    this.missingFontsWarned.add(fontName);
    console.warn(`FontManager: Font "${fontName}" is no longer available; using the system font stack instead`);
  }

  private constructor() {
    // Initialize with default font
    this.loadedFonts.set('default', {
      name: 'default',
      loaded: true,
      loading: false,
      error: null,
    });
    
    // Setup MutationObserver to watch for new markdown-body elements
    this.setupMutationObserver();
  }
  
  /**
   * Setup MutationObserver to automatically apply font to new markdown-body elements
   */
  private setupMutationObserver(): void {
    if (typeof window === 'undefined' || !window.MutationObserver) return;
    
    // Use a debounce mechanism to avoid excessive DOM queries
    let debounceTimer: number | null = null;
    this.observer = new MutationObserver((mutations) => {
      if (!this.currentFontFamily) return;
      
      // Debounce: batch DOM updates
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      debounceTimer = window.setTimeout(() => {
        const elementsToUpdate: HTMLElement[] = [];
        
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;
              
              // Check if the added node is a markdown-body
              if (element.classList?.contains('markdown-body')) {
                elementsToUpdate.push(element);
              }
              
              // Check for markdown-body descendants
              const markdownBodies = element.querySelectorAll?.('.markdown-body');
              markdownBodies?.forEach((mb) => {
                elementsToUpdate.push(mb as HTMLElement);
              });
            }
          });
        });
        
        // Batch apply font family
        elementsToUpdate.forEach((el) => {
          el.style.fontFamily = this.currentFontFamily;
        });
      }, 50); // 50ms debounce
    });
    
    // Start observing
    if (document.body) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    } else {
      // Wait for body to be available (with timeout to prevent infinite loop)
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max wait
      const checkBody = setInterval(() => {
        attempts++;
        if (document.body) {
          this.observer?.observe(document.body, {
            childList: true,
            subtree: true,
          });
          clearInterval(checkBody);
        } else if (attempts >= maxAttempts) {
          // Give up after max attempts
          clearInterval(checkBody);
          console.warn('FontManager: document.body not available after timeout, MutationObserver not started');
        }
      }, 100);
    }
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): FontManagerClass {
    if (!FontManagerClass.instance) {
      FontManagerClass.instance = new FontManagerClass();
    }
    return FontManagerClass.instance;
  }

  /**
   * Initialize the font manager with font metadata from the database
   * Note: This only stores metadata, binary data is fetched on-demand
   */
  public initializeRegistry(fonts: FontMetadata[]): void {
    this.fontRegistry.clear();
    fonts.forEach(font => {
      this.fontRegistry.set(font.name, font);
    });
    this.initialized = true;
  }

  /**
   * Get all registered fonts
   */
  public getRegisteredFonts(): FontConfig[] {
    return Array.from(this.fontRegistry.values());
  }

  /**
   * Get font by name
   */
  public getFont(name: string): FontConfig | undefined {
    return this.fontRegistry.get(name);
  }

  /**
   * Check if a font is loaded
   */
  public isFontLoaded(fontName: string): boolean {
    return this.loadedFonts.get(fontName)?.loaded ?? false;
  }

  /**
   * Check if a font is currently loading
   */
  public isFontLoading(fontName: string): boolean {
    return this.loadedFonts.get(fontName)?.loading ?? false;
  }

  /**
   * Get the current applied font
   */
  public getCurrentFont(): string {
    return this.currentFont;
  }

  /**
   * 首屏恢复：在 React 渲染之前，把上次选中的字体从 IndexedDB 缓存灌进 document.fonts。
   *
   * `index.html` 的内联脚本此时已经把 font-family 套好了，这里补的是字形本身。
   * 命中缓存就完全不走网络；没命中直接返回 false，交给后续 `applyFont` 走正常加载。
   *
   * 带超时保护：字体动辄几 MB，缓存读取也不该无限期挡住首屏。
   */
  public async restoreSavedFont(timeoutMs: number = 1500): Promise<boolean> {
    const pref = readSavedFontPreference();
    if (!pref) return false;
    if (this.isFontLoaded(pref.name)) return true;
    const version = this.applyVersion;
    const deadline = Date.now() + timeoutMs;
    const remaining = () => Math.max(1, deadline - Date.now());

    try {
      const cached = await withTimeout(readCachedFontBinary(pref.name), remaining());
      if (cached) {
        const ready = await withTimeout(this.loadFontFromBuffer(pref.name, cached.buffer, cached.format, pref.weights, 'block').then(() => true), remaining());
        if (!ready) return false;
      } else return false;
      // A slow cache restore must not overwrite a newer user/config selection.
      if (version !== this.applyVersion) return false;

      this.currentFont = pref.name;
      this.currentFontFamily = pref.stack;
      this.loadedFonts.set(pref.name, {
        name: pref.name,
        loaded: true,
        loading: false,
        error: null,
      });

      // 让首屏内联脚本已经写好的 --font-family 与 FontManager 内部状态保持一致
      if (document.body) document.body.style.fontFamily = pref.stack;
      document.documentElement.style.setProperty('--font-family', pref.stack);

      return true;
    } catch {
      // 缓存损坏 / 超时 / 环境不支持：静默回落到正常加载路径
      return false;
    }
  }

  /**
   * Load a font by injecting styles (local @font-face or Google Fonts CSS link)
   */
  public async loadFont(fontName: string, display: FontDisplay = 'swap'): Promise<boolean> {
    // Default font is always "loaded"
    if (fontName === 'default') {
      return true;
    }

    // Check if already loaded
    const existingState = this.loadedFonts.get(fontName);
    if (existingState?.loaded) {
      return true;
    }

    // Check if currently loading
    if (existingState?.loading) {
      // Wait for existing load to complete
      return this.waitForFontLoad(fontName);
    }

    // Get font config
    const fontConfig = this.fontRegistry.get(fontName);
    if (!fontConfig) {
      this.warnUnknownFont(fontName);
      // Font not found, return false to indicate load failure
      return false;
    }

    // Mark as loading
    this.loadedFonts.set(fontName, {
      name: fontName,
      loaded: false,
      loading: true,
      error: null,
    });

    try {
      // Check if it's a local font - need to fetch binary data on demand
      if (fontConfig.isLocal) {
        // 优先命中 IndexedDB 缓存，避免每次都走 getFontData 的网络往返
        const cached = await readCachedFontBinary(fontName);
        if (cached) {
          await this.loadFontFromBuffer(fontName, cached.buffer, cached.format, fontConfig.weights, display);
        } else {
          const fontData = await api.fonts.getFontData.query({ name: fontName });
          if (!fontData.fileData) {
            throw new Error(`No font data available for "${fontName}"`);
          }
          await this.loadFontFromBinaryData(fontName, fontData.fileData, fontConfig.weights, display);
        }
      } else if (fontConfig.url) {
        // CDN font - inject stylesheet
        await this.injectFontStylesheet(fontConfig.url, fontName);
      }

      // Wait for the font to be actually available
      await this.waitForFontAvailable(fontName);

      // Mark as loaded
      this.loadedFonts.set(fontName, {
        name: fontName,
        loaded: true,
        loading: false,
        error: null,
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.loadedFonts.set(fontName, {
        name: fontName,
        loaded: false,
        loading: false,
        error: errorMessage,
      });
      console.error(`FontManager: Failed to load font "${fontName}":`, error);
      return false;
    }
  }

  /**
   * Load a font from base64-encoded binary data
   * Converts the binary data to a Blob URL and uses FontFace API
   */
  private async loadFontFromBinaryData(
    fontName: string, 
    fileData: string, 
    weights: number[],
    display: FontDisplay = 'swap'
  ): Promise<void> {
    // Check if already injected
    const existingStyle = document.querySelector(`style[data-font="${fontName}"]`);
    if (existingStyle) {
      return;
    }

    // Decode base64 to Uint8Array
    const binaryString = atob(fileData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const binaryData = bytes;

    // Detect font format from magic bytes
    const format = this.detectFontFormat(binaryData);

    // 存进 IndexedDB：下一次刷新可以直接命中缓存，省掉一次 getFontData 网络往返
    void writeCachedFontBinary(fontName, binaryData.buffer.slice(0), format);

    await this.loadFontFromBuffer(fontName, binaryData.buffer.slice(0), format, weights, display);
  }

  /**
   * 从原始字节构建 FontFace 并注入 document.fonts。
   * 网络下载路径（loadFontFromBinaryData）与 IndexedDB 缓存路径（restoreSavedFont /
   * loadFont）共用这一段，避免两条路径行为不一致。
   */
  private async loadFontFromBuffer(
    fontName: string,
    buffer: ArrayBuffer,
    format: string,
    weights: number[],
    display: FontDisplay = 'swap'
  ): Promise<void> {
    // 已经注入过就不要重复建 FontFace（blob URL 也随之省掉）
    if (document.querySelector(`style[data-font="${fontName}"]`)) {
      return;
    }

    const mimeType =
      format === 'woff2' ? 'font/woff2'
      : format === 'woff' ? 'font/woff'
      : format === 'ttf' ? 'font/ttf'
      : 'font/opentype';

    const blob = new Blob([buffer], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);

    // Store blob URL for cleanup
    const loadedFontState = this.loadedFonts.get(fontName);
    if (loadedFontState) {
      loadedFontState.blobUrl = blobUrl;
    }

    // Use FontFace API for more reliable font loading
    try {
      // Determine font-weight descriptor based on whether it's a variable font
      const isVariable = weights.length > 4; // Variable fonts typically have many weights
      const weightDescriptor = isVariable ? '100 900' : weights.join(' ');

      const fontFace = new FontFace(fontName, `url(${blobUrl})`, {
        weight: weightDescriptor,
        style: 'normal',
        display
      });

      // Load the font
      await fontFace.load();

      // Add to document fonts
      document.fonts.add(fontFace);

      // Also inject a style tag as fallback for CSS usage
      const fontFaceCSS = `
        @font-face {
          font-family: '${fontName}';
          src: url('${blobUrl}') format('${format}');
          font-weight: ${weightDescriptor};
          font-style: normal;
          font-display: ${display};
        }
      `;

      const style = document.createElement('style');
      style.setAttribute('data-font', fontName);
      style.textContent = fontFaceCSS;
      document.head.appendChild(style);
      // The CSS fallback creates a second face; load it too before first paint.
      await document.fonts.load(`${weights[0] || 400} 16px ${JSON.stringify(fontName)}`);

    } catch (error) {
      // Cleanup blob URL on error
      URL.revokeObjectURL(blobUrl);
      throw error;
    }
  }

  /**
   * Detect font format from magic bytes
   */
  private detectFontFormat(data: Uint8Array): 'woff2' | 'woff' | 'ttf' | 'otf' {
    if (data.length < 4) return 'ttf';

    // WOFF2: starts with 'wOF2' (0x774F4632)
    if (data[0] === 0x77 && data[1] === 0x4F && data[2] === 0x46 && data[3] === 0x32) {
      return 'woff2';
    }

    // WOFF: starts with 'wOFF' (0x774F4646)
    if (data[0] === 0x77 && data[1] === 0x4F && data[2] === 0x46 && data[3] === 0x46) {
      return 'woff';
    }

    // TTF: starts with 0x00010000 or 'true' (0x74727565)
    if ((data[0] === 0x00 && data[1] === 0x01 && data[2] === 0x00 && data[3] === 0x00) ||
        (data[0] === 0x74 && data[1] === 0x72 && data[2] === 0x75 && data[3] === 0x65)) {
      return 'ttf';
    }

    // OTF: starts with 'OTTO' (0x4F54544F)
    if (data[0] === 0x4F && data[1] === 0x54 && data[2] === 0x54 && data[3] === 0x4F) {
      return 'otf';
    }

    // Default to ttf as fallback (more compatible than assuming woff2)
    return 'ttf';
  }



  /**
   * Inject a font stylesheet link tag
   */
  private async injectFontStylesheet(url: string, fontName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already injected
      const existingLink = document.querySelector(`link[data-font="${fontName}"]`);
      if (existingLink) {
        resolve();
        return;
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = getBlinkoEndpoint(resolveFontStylesheetUrl(url));
      link.setAttribute('data-font', fontName);
      const originFontUrl = getBlinkoEndpoint(WENKAI_LOCAL_CSS);
      let triedOrigin = false;
      
      link.onload = () => resolve();
      link.onerror = () => {
        // Existing CDN installations may not have uploaded these new files yet.
        if (!triedOrigin && fontName === 'LXGW WenKai' && url.endsWith(WENKAI_LOCAL_CSS) && link.href !== originFontUrl) {
          triedOrigin = true;
          link.href = originFontUrl;
          return;
        }
        reject(new Error(`Failed to load stylesheet for font: ${fontName}`));
      };
      
      document.head.appendChild(link);
    });
  }

  /**
   * Wait for a font to become available in the document
   */
  private async waitForFontAvailable(fontName: string, timeout: number = 5000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      // Use document.fonts API to check if font is loaded
      if (document.fonts) {
        const fontFaces = document.fonts.values();
        for (const fontFace of fontFaces) {
          if (fontFace.family.replace(/['"]/g, '') === fontName && fontFace.status === 'loaded') {
            return;
          }
        }
        
        // Also try checking with document.fonts.check
        try {
          if (document.fonts.check(`16px "${fontName}"`)) {
            return;
          }
        } catch {
          // Ignore check errors
        }
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Font might still work even if we can't confirm it's loaded
    console.warn(`FontManager: Timeout waiting for font "${fontName}" to load; continuing without confirmed load status (font may not be applied correctly)`);
  }

  /**
   * Wait for an existing font load operation to complete
   */
  private async waitForFontLoad(fontName: string, timeout: number = 10000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const state = this.loadedFonts.get(fontName);
      if (state?.loaded) {
        return true;
      }
      if (state?.error) {
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return false;
  }

  /**
   * Apply a font to the document body and CSS variables
   *
   * @param fontName 字体名，`default` 表示系统字体栈
   * @param display  `optional` 用于首屏恢复（宁可这次不生效也不跳变），
   *                 `swap` 用于用户主动切换（保证切换可见）。默认 `swap`。
   */
  public async applyFont(fontName: string, display: FontDisplay = 'swap'): Promise<boolean> {
    const version = ++this.applyVersion;
    if (fontName === 'default') {
      // Reset to system font stack
      this.currentFontFamily = '';
      document.body.style.fontFamily = '';
      document.documentElement.style.setProperty('--font-family', '');
      document.documentElement.style.fontFamily = '';
      clearSavedFontPreference();
      
      // Clear font from all elements
      const expandedContainers = document.querySelectorAll('.expanded-container');
      expandedContainers.forEach((container) => {
        (container as HTMLElement).style.fontFamily = '';
      });
      
      const markdownBodies = document.querySelectorAll('.markdown-body');
      markdownBodies.forEach((element) => {
        (element as HTMLElement).style.fontFamily = '';
      });
      
      // Clear font from vditor elements
      this.applyFontToVditor('');
      
      this.currentFont = 'default';
      return true;
    }
    
    // Get font config to build font family string
    const fontConfig = this.fontRegistry.get(fontName);
    if (!fontConfig) {
      // The font is no longer offered (e.g. HarmonyOS Sans was removed) but the
      // user's saved preference still points at it. Fall back to the system stack
      // instead of leaving the UI pinned to a font that can never resolve.
      this.warnUnknownFont(fontName);
      return this.applyFont('default');
    }
    
    const fallback = this.getFallbackStack(fontConfig.category || 'sans-serif');
    const fontFamily = `"${fontName}", ${fallback}`;
    // Keep the currently visible font until the replacement glyphs are ready.
    if (!await this.loadFont(fontName, display) || version !== this.applyVersion) return false;

    // 镜像到 localStorage：下一次刷新时 index.html 的内联脚本能在首帧前套上同样的栈，
    // 不用等 config → fonts.list 两段往返（见 lib/fontPreference.ts）
    writeSavedFontPreference({
      name: fontName,
      stack: fontFamily,
      weights: fontConfig.weights ?? [],
    });
    
    // Apply the family only after its font has loaded.
    this.currentFontFamily = fontFamily;
    this.currentFont = fontName;
    
    // Apply to document body immediately
    document.body.style.fontFamily = fontFamily;
    
    // Apply to CSS variable for global use
    document.documentElement.style.setProperty('--font-family', fontFamily);
    
    // Apply to all existing elements immediately
    const expandedContainers = document.querySelectorAll('.expanded-container');
    expandedContainers.forEach((container) => {
      (container as HTMLElement).style.fontFamily = fontFamily;
    });
    
    const markdownBodies = document.querySelectorAll('.markdown-body');
    markdownBodies.forEach((element) => {
      (element as HTMLElement).style.fontFamily = fontFamily;
    });
    
    // Apply to vditor elements
    this.applyFontToVditor(fontFamily);
    
    return true;
  }

  /**
   * Apply font to vditor editor elements
   */
  public applyFontToVditor(fontFamily: string): void {
    // Apply to all vditor elements
    const vditorElements = document.querySelectorAll('.vditor-reset, .vditor-preview, .vditor-content, .vditor-ir, .vditor-sv, .vditor-wysiwyg');
    vditorElements.forEach((element) => {
      (element as HTMLElement).style.fontFamily = fontFamily;
    });
    
    // Also apply to vditor input areas
    const vditorInputs = document.querySelectorAll('.vditor-input, .vditor-ir__editor, .vditor-sv__editor, .vditor-wysiwyg__editor');
    vditorInputs.forEach((element) => {
      (element as HTMLElement).style.fontFamily = fontFamily;
    });
  }

  /**
   * Get the current font family string
   */
  public getCurrentFontFamily(): string {
    return this.currentFontFamily;
  }

  /**
   * Get fallback font stack based on category
   */
  private getFallbackStack(category: string): string {
    switch (category) {
      case 'serif':
        return 'Georgia, "Times New Roman", serif';
      case 'monospace':
        return '"Courier New", Consolas, monospace';
      case 'display':
      case 'handwriting':
        return 'cursive';
      case 'sans-serif':
      default:
        return '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    }
  }

  /**
   * Preload popular fonts in the background
   */

  /**
   * Get loading status for debugging
   */
  public getLoadingStatus(): Record<string, LoadedFont> {
    return Object.fromEntries(this.loadedFonts);
  }

  /**
   * Clear all loaded fonts (except default)
   */
  public clearLoadedFonts(): void {
    // Revoke blob URLs to free memory
    this.loadedFonts.forEach((font) => {
      if (font.blobUrl) {
        URL.revokeObjectURL(font.blobUrl);
      }
    });

    // Remove injected stylesheets
    document.querySelectorAll('link[data-font], style[data-font]').forEach(el => {
      if (el.getAttribute('data-font') !== 'default') {
        el.remove();
      }
    });
    
    // Reset loaded fonts map
    this.loadedFonts.clear();
    this.loadedFonts.set('default', {
      name: 'default',
      loaded: true,
      loading: false,
      error: null,
    });
  }
}

// Export singleton instance
export const FontManager = FontManagerClass.getInstance();

// Export type for the class
export type FontManagerType = FontManagerClass;
