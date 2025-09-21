import { observer } from 'mobx-react-lite';
import { Button, Input, Select, SelectItem, Switch, Autocomplete, AutocompleteItem, Tooltip } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { RootStore } from '@/store';
import { AiStore, AiModel, ModelCapabilities, ProviderModel } from '@/store/aiStore';
import { DialogStore } from '@/store/module/Dialog';
import { ToastPlugin } from '@/store/module/Toast/Toast';

const CAPABILITY_ICONS = {
  inference: <Icon icon="hugeicons:cpu" width="16" height="16" />,
  tools: <Icon icon="hugeicons:settings-02" width="16" height="16" />,
  image: <Icon icon="hugeicons:view" width="16" height="16" />,
  imageGeneration: <Icon icon="hugeicons:image-01" width="16" height="16" />,
  video: <Icon icon="hugeicons:video-01" width="16" height="16" />,
  audio: <Icon icon="hugeicons:mic-01" width="16" height="16" />,
  embedding: <Icon icon="hugeicons:database-01" width="16" height="16" />,
  rerank: <Icon icon="hugeicons:arrow-up-down" width="16" height="16" />
};

const CAPABILITY_LABELS = {
  inference: 'Chat',
  tools: 'Tools',
  image: 'Vision',
  imageGeneration: 'Image Gen',
  video: 'Video',
  audio: 'Audio',
  embedding: 'Embedding',
  rerank: 'Rerank'
};

interface ModelTemplate {
  modelKey: string;
  title: string;
  capabilities: Partial<ModelCapabilities>;
  config?: {
    embeddingDimensions?: number;
  };
}

const DEFAULT_MODEL_TEMPLATES: ModelTemplate[] = [
  // OpenAI Models
  { modelKey: 'gpt-4o', title: 'GPT-4o', capabilities: { inference: true, tools: true, image: true } },
  { modelKey: 'gpt-4o-mini', title: 'GPT-4o Mini', capabilities: { inference: true, tools: true, image: true } },
  { modelKey: 'gpt-4-turbo', title: 'GPT-4 Turbo', capabilities: { inference: true, tools: true, image: true } },
  { modelKey: 'gpt-4-turbo-preview', title: 'GPT-4 Turbo Preview', capabilities: { inference: true, tools: true } },
  { modelKey: 'gpt-4', title: 'GPT-4', capabilities: { inference: true, tools: true } },
  { modelKey: 'gpt-4-vision-preview', title: 'GPT-4 Vision Preview', capabilities: { inference: true, image: true } },
  { modelKey: 'gpt-3.5-turbo', title: 'GPT-3.5 Turbo', capabilities: { inference: true, tools: true } },
  { modelKey: 'gpt-3.5-turbo-instruct', title: 'GPT-3.5 Turbo Instruct', capabilities: { inference: true } },
  { modelKey: 'text-embedding-3-large', title: 'Text Embedding 3 Large', capabilities: { embedding: true }, config: { embeddingDimensions: 3072 } },
  { modelKey: 'text-embedding-3-small', title: 'Text Embedding 3 Small', capabilities: { embedding: true }, config: { embeddingDimensions: 1536 } },
  { modelKey: 'text-embedding-ada-002', title: 'Text Embedding Ada 002', capabilities: { embedding: true }, config: { embeddingDimensions: 1536 } },
  { modelKey: 'dall-e-3', title: 'DALL-E 3', capabilities: { imageGeneration: true } },
  { modelKey: 'dall-e-2', title: 'DALL-E 2', capabilities: { imageGeneration: true } },
  { modelKey: 'whisper-1', title: 'Whisper', capabilities: { audio: true } },
  { modelKey: 'tts-1', title: 'TTS 1', capabilities: { audio: true } },
  { modelKey: 'tts-1-hd', title: 'TTS 1 HD', capabilities: { audio: true } },

  // Anthropic Models
  { modelKey: 'claude-3-5-sonnet-20241022', title: 'Claude 3.5 Sonnet', capabilities: { inference: true, tools: true, image: true } },
  { modelKey: 'claude-3-5-haiku-20241022', title: 'Claude 3.5 Haiku', capabilities: { inference: true, tools: true, image: true } },
  { modelKey: 'claude-3-opus-20240229', title: 'Claude 3 Opus', capabilities: { inference: true, tools: true, image: true } },
  { modelKey: 'claude-3-sonnet-20240229', title: 'Claude 3 Sonnet', capabilities: { inference: true, tools: true, image: true } },
  { modelKey: 'claude-3-haiku-20240307', title: 'Claude 3 Haiku', capabilities: { inference: true, tools: true, image: true } },
  { modelKey: 'claude-2.1', title: 'Claude 2.1', capabilities: { inference: true } },
  { modelKey: 'claude-2.0', title: 'Claude 2.0', capabilities: { inference: true } },
  { modelKey: 'claude-instant-1.2', title: 'Claude Instant 1.2', capabilities: { inference: true } },

  // Google Models
  { modelKey: 'gemini-1.5-pro', title: 'Gemini 1.5 Pro', capabilities: { inference: true, tools: true, image: true, video: true, audio: true } },
  { modelKey: 'gemini-1.5-flash', title: 'Gemini 1.5 Flash', capabilities: { inference: true, tools: true, image: true, video: true, audio: true } },
  { modelKey: 'gemini-pro', title: 'Gemini Pro', capabilities: { inference: true, tools: true } },
  { modelKey: 'gemini-pro-vision', title: 'Gemini Pro Vision', capabilities: { inference: true, image: true } },
  { modelKey: 'text-embedding-004', title: 'Text Embedding 004', capabilities: { embedding: true }, config: { embeddingDimensions: 768 } },
  { modelKey: 'text-embedding-gecko', title: 'Text Embedding Gecko', capabilities: { embedding: true }, config: { embeddingDimensions: 768 } },

  // Meta Llama Models
  { modelKey: 'llama-3.1-405b-instruct', title: 'Llama 3.1 405B Instruct', capabilities: { inference: true, tools: true } },
  { modelKey: 'llama-3.1-70b-instruct', title: 'Llama 3.1 70B Instruct', capabilities: { inference: true, tools: true } },
  { modelKey: 'llama-3.1-8b-instruct', title: 'Llama 3.1 8B Instruct', capabilities: { inference: true, tools: true } },
  { modelKey: 'llama-3-70b-instruct', title: 'Llama 3 70B Instruct', capabilities: { inference: true, tools: true } },
  { modelKey: 'llama-3-8b-instruct', title: 'Llama 3 8B Instruct', capabilities: { inference: true, tools: true } },
  { modelKey: 'llama-2-70b-chat', title: 'Llama 2 70B Chat', capabilities: { inference: true } },
  { modelKey: 'llama-2-13b-chat', title: 'Llama 2 13B Chat', capabilities: { inference: true } },
  { modelKey: 'llama-2-7b-chat', title: 'Llama 2 7B Chat', capabilities: { inference: true } },

  // Mistral Models
  { modelKey: 'mistral-large-2407', title: 'Mistral Large 2407', capabilities: { inference: true, tools: true } },
  { modelKey: 'mistral-large-2402', title: 'Mistral Large 2402', capabilities: { inference: true, tools: true } },
  { modelKey: 'mistral-medium', title: 'Mistral Medium', capabilities: { inference: true } },
  { modelKey: 'mistral-small', title: 'Mistral Small', capabilities: { inference: true } },
  { modelKey: 'mistral-tiny', title: 'Mistral Tiny', capabilities: { inference: true } },
  { modelKey: 'mixtral-8x7b-instruct', title: 'Mixtral 8x7B Instruct', capabilities: { inference: true } },
  { modelKey: 'mixtral-8x22b-instruct', title: 'Mixtral 8x22B Instruct', capabilities: { inference: true } },
  { modelKey: 'mistral-7b-instruct', title: 'Mistral 7B Instruct', capabilities: { inference: true } },

  // Qwen Models
  { modelKey: 'qwen2.5-72b-instruct', title: 'Qwen 2.5 72B Instruct', capabilities: { inference: true, tools: true } },
  { modelKey: 'qwen2.5-32b-instruct', title: 'Qwen 2.5 32B Instruct', capabilities: { inference: true, tools: true } },
  { modelKey: 'qwen2.5-14b-instruct', title: 'Qwen 2.5 14B Instruct', capabilities: { inference: true, tools: true } },
  { modelKey: 'qwen2.5-7b-instruct', title: 'Qwen 2.5 7B Instruct', capabilities: { inference: true, tools: true } },
  { modelKey: 'qwen2-72b-instruct', title: 'Qwen 2 72B Instruct', capabilities: { inference: true, tools: true } },
  { modelKey: 'qwen2-7b-instruct', title: 'Qwen 2 7B Instruct', capabilities: { inference: true, tools: true } },
  { modelKey: 'qwen-vl-plus', title: 'Qwen VL Plus', capabilities: { inference: true, image: true } },
  { modelKey: 'qwen-vl-max', title: 'Qwen VL Max', capabilities: { inference: true, image: true } },

  // DeepSeek Models
  { modelKey: 'deepseek-chat', title: 'DeepSeek Chat', capabilities: { inference: true, tools: true } },
  { modelKey: 'deepseek-coder', title: 'DeepSeek Coder', capabilities: { inference: true, tools: true } },
  { modelKey: 'deepseek-v2.5', title: 'DeepSeek V2.5', capabilities: { inference: true, tools: true } },

  // Yi Models
  { modelKey: 'yi-large', title: 'Yi Large', capabilities: { inference: true, tools: true } },
  { modelKey: 'yi-medium', title: 'Yi Medium', capabilities: { inference: true } },
  { modelKey: 'yi-vision', title: 'Yi Vision', capabilities: { inference: true, image: true } },

  // Cohere Models
  { modelKey: 'command-r-plus', title: 'Command R+', capabilities: { inference: true, tools: true } },
  { modelKey: 'command-r', title: 'Command R', capabilities: { inference: true, tools: true } },
  { modelKey: 'command', title: 'Command', capabilities: { inference: true } },
  { modelKey: 'command-light', title: 'Command Light', capabilities: { inference: true } },
  { modelKey: 'embed-english-v3.0', title: 'Embed English v3.0', capabilities: { embedding: true } },
  { modelKey: 'embed-multilingual-v3.0', title: 'Embed Multilingual v3.0', capabilities: { embedding: true } },
  { modelKey: 'rerank-english-v3.0', title: 'Rerank English v3.0', capabilities: { rerank: true } },
  { modelKey: 'rerank-multilingual-v3.0', title: 'Rerank Multilingual v3.0', capabilities: { rerank: true } },

  // Popular Ollama Models
  { modelKey: 'llama3.1:70b', title: 'Llama 3.1 70B (Ollama)', capabilities: { inference: true, tools: true } },
  { modelKey: 'llama3.1:8b', title: 'Llama 3.1 8B (Ollama)', capabilities: { inference: true, tools: true } },
  { modelKey: 'qwen2.5:72b', title: 'Qwen 2.5 72B (Ollama)', capabilities: { inference: true, tools: true } },
  { modelKey: 'qwen2.5:32b', title: 'Qwen 2.5 32B (Ollama)', capabilities: { inference: true, tools: true } },
  { modelKey: 'qwen2.5:14b', title: 'Qwen 2.5 14B (Ollama)', capabilities: { inference: true, tools: true } },
  { modelKey: 'qwen2.5:7b', title: 'Qwen 2.5 7B (Ollama)', capabilities: { inference: true, tools: true } },
  { modelKey: 'mistral-nemo:12b', title: 'Mistral Nemo 12B (Ollama)', capabilities: { inference: true } },
  { modelKey: 'codestral:22b', title: 'Codestral 22B (Ollama)', capabilities: { inference: true, tools: true } },
  { modelKey: 'codeqwen:7b', title: 'CodeQwen 7B (Ollama)', capabilities: { inference: true, tools: true } },
  { modelKey: 'deepseek-coder-v2:16b', title: 'DeepSeek Coder V2 16B (Ollama)', capabilities: { inference: true, tools: true } },
  { modelKey: 'phi3.5:3.8b', title: 'Phi 3.5 3.8B (Ollama)', capabilities: { inference: true } },
  { modelKey: 'gemma2:27b', title: 'Gemma 2 27B (Ollama)', capabilities: { inference: true } },
  { modelKey: 'gemma2:9b', title: 'Gemma 2 9B (Ollama)', capabilities: { inference: true } },
  { modelKey: 'llava:34b', title: 'LLaVA 34B (Ollama)', capabilities: { inference: true, image: true } },
  { modelKey: 'llava:13b', title: 'LLaVA 13B (Ollama)', capabilities: { inference: true, image: true } },
  { modelKey: 'llava:7b', title: 'LLaVA 7B (Ollama)', capabilities: { inference: true, image: true } },
  { modelKey: 'bakllava:7b', title: 'BakLLaVA 7B (Ollama)', capabilities: { inference: true, image: true } },
  { modelKey: 'dolphin-llama3:70b', title: 'Dolphin Llama 3 70B (Ollama)', capabilities: { inference: true } },
  { modelKey: 'dolphin-llama3:8b', title: 'Dolphin Llama 3 8B (Ollama)', capabilities: { inference: true } },
  { modelKey: 'nous-hermes2:34b', title: 'Nous Hermes 2 34B (Ollama)', capabilities: { inference: true } },
  { modelKey: 'wizardlm2:7b', title: 'WizardLM 2 7B (Ollama)', capabilities: { inference: true } },
  { modelKey: 'neural-chat:7b', title: 'Neural Chat 7B (Ollama)', capabilities: { inference: true } },
  { modelKey: 'starling-lm:7b', title: 'Starling LM 7B (Ollama)', capabilities: { inference: true } },
  { modelKey: 'openchat:7b', title: 'OpenChat 7B (Ollama)', capabilities: { inference: true } },
  { modelKey: 'solar:10.7b', title: 'Solar 10.7B (Ollama)', capabilities: { inference: true } },
  { modelKey: 'orca-mini:3b', title: 'Orca Mini 3B (Ollama)', capabilities: { inference: true } },
  { modelKey: 'tinyllama:1.1b', title: 'TinyLlama 1.1B (Ollama)', capabilities: { inference: true } },
  { modelKey: 'stable-code:3b', title: 'Stable Code 3B (Ollama)', capabilities: { inference: true } },
  { modelKey: 'nomic-embed-text', title: 'Nomic Embed Text (Ollama)', capabilities: { embedding: true }, config: { embeddingDimensions: 768 } },
  { modelKey: 'mxbai-embed-large', title: 'MxBai Embed Large (Ollama)', capabilities: { embedding: true }, config: { embeddingDimensions: 1024 } },
  { modelKey: 'all-minilm:l6-v2', title: 'All MiniLM L6 v2 (Ollama)', capabilities: { embedding: true }, config: { embeddingDimensions: 384 } },

  // Azure OpenAI Models
  { modelKey: 'gpt-4o-azure', title: 'GPT-4o (Azure)', capabilities: { inference: true, tools: true, image: true } },
  { modelKey: 'gpt-4-turbo-azure', title: 'GPT-4 Turbo (Azure)', capabilities: { inference: true, tools: true, image: true } },
  { modelKey: 'gpt-35-turbo-azure', title: 'GPT-3.5 Turbo (Azure)', capabilities: { inference: true, tools: true } },

  // Perplexity Models
  { modelKey: 'llama-3.1-sonar-large-128k-online', title: 'Llama 3.1 Sonar Large Online', capabilities: { inference: true, tools: true } },
  { modelKey: 'llama-3.1-sonar-small-128k-online', title: 'Llama 3.1 Sonar Small Online', capabilities: { inference: true, tools: true } },
  { modelKey: 'llama-3.1-sonar-large-128k-chat', title: 'Llama 3.1 Sonar Large Chat', capabilities: { inference: true, tools: true } },
  { modelKey: 'llama-3.1-sonar-small-128k-chat', title: 'Llama 3.1 Sonar Small Chat', capabilities: { inference: true, tools: true } }
];

interface ModelDialogContentProps {
  model?: AiModel;
}

export default observer(function ModelDialogContent({ model }: ModelDialogContentProps) {
  const { t } = useTranslation();
  const aiStore = RootStore.Get(AiStore);

  const [editingModel, setEditingModel] = useState<Partial<AiModel>>(() => {
    if (model) {
      return { ...model };
    }
    return {
      id: 0,
      providerId: aiStore.aiProviders.value?.[0]?.id || 0,
      title: '',
      modelKey: '',
      capabilities: {
        inference: true,
        tools: false,
        image: false,
        imageGeneration: false,
        video: false,
        audio: false,
        embedding: false,
        rerank: false
      },
      config: {
        embeddingDimensions: 0
      },
      sortOrder: 0
    };
  });

  const selectedProvider = aiStore.aiProviders.value?.find(p => p.id === editingModel.providerId);

  const getProviderModels = (): ProviderModel[] => {
    if (!selectedProvider) return [];
    return aiStore.getCachedProviderModels(selectedProvider.id);
  };

  const fetchProviderModels = async () => {
    if (!selectedProvider) return;

    try {
      await aiStore.fetchProviderModels.call(selectedProvider);
    } catch (error) {
      console.error('Failed to fetch provider models:', error);
    }
  };

  const handleModelSelect = (modelKey: string) => {
    const providerModels = getProviderModels();
    const providerModel = providerModels.find(m => m.id === modelKey);
    const defaultTemplate = DEFAULT_MODEL_TEMPLATES.find(t => t.modelKey === modelKey);

    if (providerModel) {
      // Use provider model data, but enhance with template capabilities if available
      const capabilities = defaultTemplate?.capabilities || aiStore.inferModelCapabilities(modelKey);
      const config = defaultTemplate?.config || {};

      setEditingModel(prev => ({
        ...prev,
        modelKey: providerModel.id,
        title: providerModel.name,
        capabilities,
        config: {
          ...prev.config,
          ...config
        }
      }));
    } else {
      // Fallback for manual input
      const capabilities = defaultTemplate?.capabilities || aiStore.inferModelCapabilities(modelKey);
      const title = defaultTemplate?.title || modelKey;
      const config = defaultTemplate?.config || {};

      setEditingModel(prev => ({
        ...prev,
        modelKey,
        title,
        capabilities,
        config: {
          ...prev.config,
          ...config
        }
      }));
    }
  };

  const getAllAvailableModels = () => {
    const providerModels = getProviderModels();
    return providerModels.map(m => ({ id: m.id, name: m.name, source: 'provider' as const }));
  };

  const handleSaveModel = async () => {
    if (!editingModel) return;

    try {
      if (editingModel.id) {
        await aiStore.updateModel.call(editingModel as any);
        RootStore.Get(ToastPlugin).success('Model updated successfully!');
      } else {
        await aiStore.createModel.call(editingModel as any);
        RootStore.Get(ToastPlugin).success('Model created successfully!');
      }
      RootStore.Get(DialogStore).close();
    } catch (error) {
      RootStore.Get(ToastPlugin).error('Failed to save model: ' + error.message);
    }
  };

  return (
    <div className="space-y-4">
      <Select
        label="Provider"
        placeholder="Select provider"
        selectedKeys={editingModel.providerId ? [String(editingModel.providerId)] : []}
        onSelectionChange={(keys) => {
          const value = Array.from(keys)[0];
          setEditingModel(prev => ({ ...prev, providerId: Number(value) }));
        }}
      >
        {aiStore.aiProviders.value?.map(provider => (
          <SelectItem key={provider.id}>
            {provider.title}
          </SelectItem>
        ))}
      </Select>

      <Input
        label="Model Name"
        placeholder="Enter display name"
        value={editingModel.title || ''}
        onValueChange={(value) => {
          setEditingModel(prev => ({ ...prev, title: value }));
        }}
      />

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium">Model Selection</p>
          <Button
            size="sm"
            variant="flat"
            startContent={<Icon icon="hugeicons:refresh" width="14" height="14" />}
            onPress={fetchProviderModels}
            isLoading={aiStore.fetchProviderModels.loading}
            isDisabled={!selectedProvider}
          >
            Fetch Models
          </Button>
        </div>
        <Autocomplete
          label="Model"
          placeholder="Select or enter model"
          inputValue={editingModel.modelKey || ''}
          onInputChange={(value) => {
            setEditingModel(prev => ({ ...prev, modelKey: value }));
          }}
          onSelectionChange={(key) => {
            if (key) {
              handleModelSelect(String(key));
            }
          }}
          allowsCustomValue
        >
          {getAllAvailableModels().map(model => (
            <AutocompleteItem
              key={model.id}
              value={model.id}
              startContent={
                <Icon
                  icon="hugeicons:cloud"
                  width="14"
                  height="14"
                />
              }
            >
              {model.name}
            </AutocompleteItem>
          ))}
        </Autocomplete>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Model Capabilities</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(CAPABILITY_LABELS).map(([key, label]) => (
            <Switch
              key={key}
              isSelected={editingModel.capabilities?.[key as keyof ModelCapabilities] || false}
              onValueChange={(checked) => {
                setEditingModel(prev => ({
                  ...prev,
                  capabilities: {
                    ...prev.capabilities,
                    [key]: checked
                  }
                }));
              }}
            >
              <div className="flex items-center gap-2">
                {CAPABILITY_ICONS[key as keyof ModelCapabilities]}
                {label}
              </div>
            </Switch>
          ))}
        </div>
      </div>

      {/* Embedding Dimensions - Only show for embedding models */}
      {editingModel.capabilities?.embedding && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Icon icon="hugeicons:database-01" width="16" height="16" />
            <p className="text-sm font-medium">Embedding Dimensions</p>
            <Tooltip content="Specify the dimensions for this embedding model. Leave 0 for auto-detection.">
              <Icon icon="proicons:info" width="14" height="14" />
            </Tooltip>
          </div>
          <Input
            type="number"
            label="Dimensions"
            placeholder="0 (auto-detect)"
            value={String(editingModel.config?.embeddingDimensions || 0)}
            onChange={(e) => {
              const dimensions = parseInt(e.target.value) || 0;
              setEditingModel(prev => ({
                ...prev,
                config: {
                  ...prev.config,
                  embeddingDimensions: dimensions
                }
              }));
            }}
            description="Common values: 384, 512, 768, 1024, 1536, 3072. Set to 0 for auto-detection."
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="flat" onPress={() => RootStore.Get(DialogStore).close()}>
          Cancel
        </Button>
        <Button color="primary" onPress={handleSaveModel}>
          {editingModel.id ? 'Update' : 'Create'}
        </Button>
      </div>
    </div>
  );
});