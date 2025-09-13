import { observer } from 'mobx-react-lite';
import { Button, Input, Switch, Code, Card, CardBody, CardHeader, Divider, Kbd } from '@heroui/react';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { PromiseCall } from '@/store/standard/PromiseState';
import { Icon } from '@/components/Common/Iconify/icons';
import { api } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';
import { Item, ItemWithTooltip } from './Item';
import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop, isInTauri } from '@/lib/tauriHelper';
import { CollapsibleCard } from '../Common/CollapsibleCard';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { HotkeyConfig, DEFAULT_HOTKEY_CONFIG } from '@/../../shared/lib/types';

const HOTKEY_EXAMPLES = {
  'Shift+Space': 'Shift+Space (Recommended)',
  'CommandOrControl+Shift+N': 'Ctrl+Shift+N (Windows/Linux) / ⌘+Shift+N (Mac)',
  'CommandOrControl+Alt+Space': 'Ctrl+Alt+Space (Windows/Linux) / ⌘+Option+Space (Mac)',
  'Alt+Shift+B': 'Alt+Shift+B',
  'F1': 'F1',
  'CommandOrControl+`': 'Ctrl+` (Windows/Linux) / ⌘+` (Mac)',
};

const MODIFIER_KEYS = {
  'CommandOrControl': { windows: 'Ctrl', mac: '⌘', description: 'Main modifier key' },
  'Alt': { windows: 'Alt', mac: 'Option', description: 'Alt key' },
  'Shift': { windows: 'Shift', mac: 'Shift', description: 'Shift key' },
  'Super': { windows: 'Win', mac: '⌘', description: 'System key' },
};

export const HotkeySetting = observer(() => {
  const blinko = RootStore.Get(BlinkoStore);
  const { t } = useTranslation();
  const toast = RootStore.Get(ToastPlugin);

  const [hotkeyConfig, setHotkeyConfig] = useState<HotkeyConfig>(DEFAULT_HOTKEY_CONFIG);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);
  const [registeredShortcuts, setRegisteredShortcuts] = useState<Record<string, string>>({});
  const recordingRef = useRef<HTMLInputElement>(null);

  // Check if running on Tauri desktop
  const isTauriDesktop = isInTauri() && isDesktop();

  // Get current configuration
  const getCurrentConfig = async () => {
    try {
      const config = await blinko.config.value?.desktopHotkeys;
      if (config) {
        // Ensure system tray is always enabled, window behavior fixed to show
        setHotkeyConfig({
          ...DEFAULT_HOTKEY_CONFIG,
          ...config,
          systemTrayEnabled: true,
          windowBehavior: 'show'
        });
      }
    } catch (error) {
      console.error('Failed to get hotkey config:', error);
    }
  };

  // Get registered shortcuts
  const getRegisteredShortcuts = async () => {
    if (!isTauriDesktop) return;
    try {
      const shortcuts = await invoke<Record<string, string>>('get_registered_shortcuts');
      setRegisteredShortcuts(shortcuts);
    } catch (error) {
      console.error('Failed to get registered shortcuts:', error);
    }
  };

  // Save configuration
  const saveConfig = async (newConfig: Partial<HotkeyConfig>) => {
    // Ensure system tray is always enabled, window behavior fixed to show
    const updatedConfig = {
      ...hotkeyConfig,
      ...newConfig,
      systemTrayEnabled: true,
      windowBehavior: 'show' as const
    };

    try {
      await PromiseCall(
        api.config.update.mutate({
          key: 'desktopHotkeys',
          value: updatedConfig,
        }),
        { autoAlert: false }
      );

      setHotkeyConfig(updatedConfig);
      toast.success(t('operation-success'));

      // If Tauri desktop, update hotkey registration
      if (isTauriDesktop && updatedConfig.enabled) {
        await updateHotkeyRegistration(updatedConfig.quickNote);
      }
    } catch (error) {
      console.error('Failed to save hotkey config:', error);
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  // Update hotkey registration
  const updateHotkeyRegistration = async (newShortcut: string) => {
    if (!isTauriDesktop) return;

    try {
      // Unregister old shortcut - use current config shortcut, not registration record
      const oldShortcut = hotkeyConfig.quickNote;
      if (oldShortcut && oldShortcut !== newShortcut) {
        try {
          await invoke('unregister_hotkey', { shortcut: oldShortcut });
        } catch (error) {
          console.warn('Failed to unregister old shortcut:', error);
          // Continue execution, old shortcut may not exist
        }
      }

      // Register new shortcut
      if (hotkeyConfig.enabled) {
        await invoke('register_hotkey', {
          shortcut: newShortcut,
          command: 'quicknote'
        });
      }

      // Refresh registration status
      await getRegisteredShortcuts();
      console.log('Hotkey registration updated successfully');
    } catch (error) {
      console.error('Failed to update hotkey registration:', error);
      toast.error('热键注册失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // Keyboard event handling
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isRecording) return;

    event.preventDefault();
    event.stopPropagation();

    const keys: string[] = [];

    // Add modifier keys
    if (event.metaKey || event.ctrlKey) keys.push('CommandOrControl');
    if (event.altKey) keys.push('Alt');
    if (event.shiftKey) keys.push('Shift');

    // Add main key
    const mainKey = event.key;
    if (mainKey && !['Control', 'Alt', 'Shift', 'Meta', 'Command'].includes(mainKey)) {
      // Special key mapping
      const keyMap: Record<string, string> = {
        ' ': 'Space',
        'ArrowUp': 'Up',
        'ArrowDown': 'Down',
        'ArrowLeft': 'Left',
        'ArrowRight': 'Right',
        'Escape': 'Esc',
      };

      keys.push(keyMap[mainKey] || mainKey.toUpperCase());
    }

    setRecordedKeys(keys);
  };

  // Start/stop shortcut recording
  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording, apply recorded shortcut
      if (recordedKeys.length > 1) {
        const newShortcut = recordedKeys.join('+');
        // Immediately save to database and update registration
        await saveConfig({ quickNote: newShortcut });
      }
      setIsRecording(false);
      setRecordedKeys([]);
    } else {
      // Start recording
      setIsRecording(true);
      setRecordedKeys([]);
      recordingRef.current?.focus();
    }
  };

  // Format shortcut display
  const formatShortcut = (shortcut: string) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    return shortcut
      .replace('CommandOrControl', isMac ? '⌘' : 'Ctrl')
      .replace('Alt', isMac ? 'Option' : 'Alt')
      .replace('Shift', '⇧')
      .replace('+', isMac ? '' : '+');
  };

  // Initialize
  useEffect(() => {
    getCurrentConfig();
    getRegisteredShortcuts();
  }, []);

  // Don't show this setting if not Tauri desktop
  if (!isTauriDesktop) {
    return null;
  }

  return (
    <CollapsibleCard
      icon="material-symbols:keyboard"
      title={t('hotkey-settings')}
      className="w-full"
    >
      <div className="flex flex-col gap-4">
        {/* Hotkey enable switch */}
        <Item
          leftContent={
            <ItemWithTooltip
              content={t('hotkey.enableGlobalHotkey')}
              toolTipContent={t('enable-hotkeys-desc')}
            />
          }
          rightContent={
            <Switch
              isSelected={hotkeyConfig.enabled}
              onValueChange={(enabled) => saveConfig({ enabled })}
            />
          }
        />

        {/* Hotkey configuration */}
        <Item
          leftContent={t('hotkey.quickNoteShortcut')}
          rightContent={
            <div className="flex items-center gap-2">
              <Input
                ref={recordingRef}
                value={isRecording ? recordedKeys.join('+') || t('hotkey.pressShortcut') : hotkeyConfig.quickNote}
                placeholder={t('hotkey.clickRecordButton')}
                readOnly
                onKeyDown={handleKeyDown}
                classNames={{
                  input: "text-center font-mono",
                  inputWrapper: isRecording ? "ring-2 ring-primary" : ""
                }}
              />
              <Button
                size="sm"
                color={isRecording ? "danger" : "primary"}
                variant={isRecording ? "flat" : "solid"}
                onPress={toggleRecording}
                startContent={
                  <Icon icon={isRecording ? "material-symbols:stop" : "material-symbols:keyboard"} />
                }
              >
                {isRecording ? t('hotkey.stop') : t('hotkey.record')}
              </Button>
            </div>
          }
          type="col"
        />
      </div>
    </CollapsibleCard>
  );
});