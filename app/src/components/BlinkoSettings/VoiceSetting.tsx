import { observer } from 'mobx-react-lite';
import { Button, Input, Switch, Select, SelectItem } from '@heroui/react';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { Item, ItemWithTooltip } from './Item';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop, isInTauri } from '@/lib/tauriHelper';
import { CollapsibleCard } from '../Common/CollapsibleCard';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { VoiceRecognitionConfig } from '@/../../shared/lib/types';
import { HuggingFace } from '@lobehub/icons';

// Predefined hotkey options
const VOICE_HOTKEY_OPTIONS = [
  // Function keys
  { label: 'F1', value: 'F1' },
  { label: 'F2', value: 'F2' },
  { label: 'F3', value: 'F3' },
  { label: 'F4', value: 'F4' },
  { label: 'F5', value: 'F5' },
  { label: 'F6', value: 'F6' },
  { label: 'F7', value: 'F7' },
  { label: 'F8', value: 'F8' },
  { label: 'F9', value: 'F9' },
  { label: 'F10', value: 'F10' },
  { label: 'F11', value: 'F11' },
  { label: 'F12', value: 'F12' },
  // Special keys (excluding Enter and Tilde as they interfere with text input)
  { label: 'Alt', value: 'Alt' },
  { label: 'Option (macOS)', value: 'Option' },
  { label: 'Win/Cmd', value: 'Win' },
  { label: 'Ctrl', value: 'Ctrl' },
  { label: 'Tab', value: 'Tab' },
  { label: 'Space', value: 'Space' },
];

export const VoiceSetting = observer(() => {
  const blinko = RootStore.Get(BlinkoStore);
  const { t } = useTranslation();
  const toast = RootStore.Get(ToastPlugin);

  // Voice recognition states
  const [voiceConfig, setVoiceConfig] = useState<VoiceRecognitionConfig | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<any>(null);
  const [isVoiceInitializing, setIsVoiceInitializing] = useState(false);

  // Check if running on Tauri desktop
  const isTauriDesktop = isInTauri() && isDesktop();

  // Voice recognition functions
  const loadVoiceConfig = async () => {
    if (!isTauriDesktop) return;
    try {
      const config = await invoke<VoiceRecognitionConfig>('get_voice_config');
      console.log('Loaded voice config from Rust:', config);
      setVoiceConfig(config);

      // Load voice status
      const status = await invoke('get_voice_status');
      setVoiceStatus(status);
    } catch (error) {
      console.error('Failed to load voice config:', error);
    }
  };

  const saveVoiceConfig = async (newConfig: Partial<VoiceRecognitionConfig>, baseConfig?: VoiceRecognitionConfig) => {
    if (!isTauriDesktop || !voiceConfig) return;

    const updatedConfig = { ...(baseConfig || voiceConfig), ...newConfig };
    console.log('Saving voice config:', updatedConfig);

    try {
      await invoke('save_voice_config_cmd', { config: updatedConfig });
      setVoiceConfig(updatedConfig);
      console.log('Voice config saved successfully, new state:', updatedConfig);
      toast.success('Voice settings saved successfully');

      // Refresh voice status
      const status = await invoke('get_voice_status');
      setVoiceStatus(status);
    } catch (error) {
      console.error('Failed to save voice config:', error);
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  // Update voice hotkey registration
  const updateVoiceHotkeyRegistration = async (newShortcut: string) => {
    if (!isTauriDesktop) return;

    try {
      console.log('Voice hotkey updated to:', newShortcut);

      // Reinitialize voice recognition system to pick up the new hotkey
      // This ensures the new hotkey is immediately active
      if (voiceConfig?.enabled && voiceConfig.modelPath) {
        setIsVoiceInitializing(true);
        const result = await invoke<string>('initialize_voice_recognition');
        console.log('Voice recognition reinitialized after hotkey change:', result);

        // Refresh voice status
        const status = await invoke('get_voice_status');
        setVoiceStatus(status);
        setIsVoiceInitializing(false);
      }

      toast.success(`Voice hotkey updated to: ${newShortcut}`);
    } catch (error) {
      console.error('Failed to update voice hotkey:', error);
      toast.error((error instanceof Error ? error.message : String(error)));
      setIsVoiceInitializing(false);
    }
  };

  const initializeVoiceRecognition = async () => {
    if (!isTauriDesktop) return;
    setIsVoiceInitializing(true);

    try {
      const result = await invoke<string>('initialize_voice_recognition');
      toast.success(result);

      // Refresh voice status
      const status = await invoke('get_voice_status');
      setVoiceStatus(status);
    } catch (error) {
      console.error('Failed to initialize voice recognition:', error);
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsVoiceInitializing(false);
    }
  };

  const restartApplication = async () => {
    if (!isTauriDesktop) return;

    try {
      // Use Tauri's built-in process API instead of custom backend command
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (error) {
      console.error('Failed to restart application:', error);
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const selectModelPath = async () => {
    if (!isTauriDesktop) return;

    try {
      // Use Tauri's dialog plugin instead
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        filters: [
          { name: 'Whisper Models', extensions: ['bin'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (selected && voiceConfig) {
        console.log('Selected file path:', selected);
        // Create updated config with new path
        const updatedConfig = { ...voiceConfig, modelPath: selected as string };
        // Save to backend with the complete config
        await saveVoiceConfig({ modelPath: selected as string }, updatedConfig);
      }
    } catch (error) {
      console.error('Failed to select model path:', error);
      toast.error('Failed to select model file');
    }
  };

  // Reset voice hotkey to default
  const resetVoiceHotkeyToDefault = async () => {
    await saveVoiceConfig({ hotkey: 'F2' });
    await updateVoiceHotkeyRegistration('F2');
  };

  // Initialize
  useEffect(() => {
    if (isTauriDesktop) {
      loadVoiceConfig();
    }
  }, []);

  // Don't show this setting if not Tauri desktop
  if (!isTauriDesktop) {
    return null;
  }

  return (
    <CollapsibleCard
      icon="material-symbols:mic"
      title={t('local-voice-recognition')}
      className="w-full"
    >
      <div className="flex flex-col gap-4">
        {/* Voice recognition enable switch */}
        <Item
          leftContent={
            <div>
              {t('enable-voice-recognition')}
            </div>
          }
          rightContent={
            <Switch
              isSelected={voiceConfig?.enabled ?? false}
              onValueChange={(enabled) => saveVoiceConfig({ enabled })}
            />
          }
        />

        {/* Tips when voice recognition is enabled */}
        {voiceConfig?.enabled && (
          <div className="text-xs text-gray-500 -mt-2">
            {t('voice-tip')}
          </div>
        )}

        {/* Voice recognition hotkey */}
        <Item
          leftContent={
            <ItemWithTooltip
              content={t('voice-recognition-hotkey')}
              toolTipContent={t('audio-tips')}
            />
          }
          rightContent={
            <div className="flex items-center gap-2">
              <Select
                size="md"
                selectedKeys={[voiceConfig?.hotkey ?? 'F2']}
                onSelectionChange={async (keys) => {
                  const hotkey = Array.from(keys)[0] as string;
                  await saveVoiceConfig({ hotkey });
                  await updateVoiceHotkeyRegistration(hotkey);
                }}
                className="w-40"
                variant="flat"
              >
                {VOICE_HOTKEY_OPTIONS.map((option) => (
                  <SelectItem key={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </Select>
              {(voiceConfig?.hotkey ?? 'F2') !== 'F2' && (
                <Button
                  size="md"
                  variant="flat"
                  isIconOnly
                  onPress={resetVoiceHotkeyToDefault}
                  className="opacity-70 hover:opacity-100"
                >
                  <Icon icon="material-symbols:refresh" />
                </Button>
              )}
            </div>
          }
          type="col"
        />

        {/* CUDA acceleration switch (Windows only) */}
        {typeof window !== 'undefined' && navigator.platform.indexOf('Win') > -1 && (
          <Item
            leftContent={
              <div className="flex flex-col gap-1">
                <ItemWithTooltip
                  content={t('cuda-acceleration')}
                  toolTipContent="Enable NVIDIA CUDA GPU acceleration for faster processing"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-yellow-600">Requires NVIDIA GPU and CUDA toolkit</span>
                  <button
                    onClick={() => window.open('https://developer.nvidia.com/cuda-downloads', '_blank')}
                    className="text-xs text-blue-500 hover:text-blue-700 underline"
                  >
                    Download CUDA
                  </button>
                </div>
              </div>
            }
            rightContent={
              <Switch
                isSelected={voiceConfig?.gpuAcceleration ?? false}
                onValueChange={(enabled) => saveVoiceConfig({ gpuAcceleration: enabled })}
              />
            }
            type="row"
          />
        )}

        {/* Model path selection */}
        <Item
          leftContent="Model File Path(.bin)"
          rightContent={
            <div className="flex items-center gap-2 w-full">
              <Input
                value={voiceConfig?.modelPath ?? ''}
                onChange={(e) => saveVoiceConfig({ modelPath: e.target.value })}
                placeholder="Please select a Whisper model file (.bin)"
                className="flex-1"
                size="md"
                variant="flat"
              />
              <Button
                size="md"
                variant="flat"
                onPress={selectModelPath}
              >
                Browse
              </Button>
              <Button
                size="md"
                color='primary'
                onPress={() => window.open('https://huggingface.co/ggerganov/whisper.cpp/tree/main', '_blank')}
                startContent={<HuggingFace.Color size={16} />}
                className="min-w-fit px-3"
              >
                Download Models
              </Button>
            </div>
          }
          type="col"
        />

        {/* Language selection */}
        <Item
          leftContent="Recognition Language"
          rightContent={
            <Select
              size="md"
              selectedKeys={[voiceConfig?.language ?? 'auto']}
              onSelectionChange={(keys) => {
                const language = Array.from(keys)[0] as string;
                saveVoiceConfig({ language });
              }}
              className="w-40"
              variant="flat"
            >
              <SelectItem key="auto">Auto-detect</SelectItem>
              <SelectItem key="en">English</SelectItem>
              <SelectItem key="zh">Chinese</SelectItem>
              <SelectItem key="ja">Japanese</SelectItem>
              <SelectItem key="ko">Korean</SelectItem>
              <SelectItem key="fr">French</SelectItem>
              <SelectItem key="de">German</SelectItem>
              <SelectItem key="es">Spanish</SelectItem>
              <SelectItem key="ru">Russian</SelectItem>
              <SelectItem key="ar">Arabic</SelectItem>
              <SelectItem key="pt">Portuguese</SelectItem>
              <SelectItem key="it">Italian</SelectItem>
              <SelectItem key="hi">Hindi</SelectItem>
              <SelectItem key="th">Thai</SelectItem>
            </Select>
          }
          type="col"
        />

        {/* Initialize and restart */}
        <div className="flex justify-between items-center pt-6">
          {/* Voice status */}
          {voiceStatus ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${voiceStatus.is_initialized ? 'bg-green-500' : 'bg-red-500'
                  }`}></span>
                <span className="text-sm">
                  {voiceStatus.is_initialized ? 'Initialized' : 'Not Initialized'}
                </span>
              </div>
              {voiceStatus.mode_info && (
                <span className="text-xs text-gray-500">
                  Mode: {voiceStatus.mode_info}
                </span>
              )}
            </div>
          ) : (
            <div></div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              size="md"
              variant="flat"
              onPress={initializeVoiceRecognition}
              isLoading={isVoiceInitializing}
              isDisabled={!voiceConfig?.enabled}
              startContent={!isVoiceInitializing && <Icon icon="material-symbols:play-arrow" />}
            >
              {isVoiceInitializing ? 'Initializing...' : 'Initialize'}
            </Button>
            <Button
              size="md"
              variant="flat"
              onPress={restartApplication}
              startContent={<Icon icon="material-symbols:restart-alt" />}
              className="bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40"
            >
              Save & Restart
            </Button>
          </div>
        </div>
      </div>
    </CollapsibleCard>
  );
});