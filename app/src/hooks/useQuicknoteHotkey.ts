import { useEffect } from 'react';
import { isInTauri } from '@/lib/tauriHelper';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { ShowSettingsDialog } from '@/components/BlinkoSettings/SettingsDialog';

export const useQuicknoteHotkey = (isCreateMode: boolean) => {
  const blinko = RootStore.Get(BlinkoStore);

  useEffect(() => {
    if (!isInTauri() || !isCreateMode) return;

    let isMounted = true;
    const unlisteners: (() => void)[] = [];

    const setupEventListeners = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        if (!isMounted) return;

        // Listen for quick note events
        const unlistenQuicknote = await listen('quicknote-triggered', () => {
          try {
            // Focus to editor
            const editorElement = document.getElementById('global-editor');
            if (editorElement) {
              // Try to focus to editor internal text area
              const textArea = editorElement.querySelector('textarea');
              const contentEditable = editorElement.querySelector('[contenteditable="true"]');

              if (textArea) {
                textArea.focus();
                // Move cursor to end of text
                textArea.setSelectionRange(textArea.value.length, textArea.value.length);
              } else if (contentEditable) {
                (contentEditable as HTMLElement).focus();
                // Move cursor to end of content
                const range = document.createRange();
                const selection = window.getSelection();
                range.selectNodeContents(contentEditable);
                range.collapse(false);
                selection?.removeAllRanges();
                selection?.addRange(range);
              } else {
                // Fallback: focus to entire editor element
                editorElement.focus();
              }
            }

            // Ensure in create mode
            blinko.isCreateMode = true;

            console.log('Quick note triggered - editor focused');
          } catch (error) {
            console.error('Error handling quicknote event:', error);
          }
        });

        if (isMounted && unlistenQuicknote) {
          unlisteners.push(unlistenQuicknote);
        }

        if (!isMounted) return;

        // Listen for navigate to settings page events
        // 走弹窗而非 navigate('/settings')，与 PC 端「统一为 1 个入口、统一弹窗」一致。
        const unlistenNavigateSettings = await listen('navigate-to-settings', () => {
          try {
            ShowSettingsDialog('hotkey');
            console.log('Opening hotkey settings dialog');
          } catch (error) {
            console.error('Error opening settings dialog:', error);
          }
        });

        if (isMounted && unlistenNavigateSettings) {
          unlisteners.push(unlistenNavigateSettings);
        }

      } catch (error) {
        console.error('Failed to setup Tauri event listeners:', error);
      }
    };

    setupEventListeners();

    // Cleanup function
    return () => {
      isMounted = false;

      // Clean up all listeners
      unlisteners.forEach(unlisten => {
        try {
          if (unlisten && typeof unlisten === 'function') {
            unlisten();
          }
        } catch (error) {
          console.error('Error cleaning up event listener:', error);
        }
      });
    };
  }, [isCreateMode, blinko]);
};