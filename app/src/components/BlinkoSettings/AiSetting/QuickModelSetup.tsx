import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Input, Select, SelectItem, Switch } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { AiSettingStore } from '@/store/aiSettingStore';
import { BlinkoStore } from '@/store/blinkoStore';
import { DialogStore } from '@/store/module/Dialog';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { api } from '@/lib/trpc';
import { quickModelSetupSchema, QUICK_PROVIDERS } from '@shared/lib/quickModelSetup';
import { PROVIDER_TEMPLATES } from './constants';
export const QuickModelSetup = observer(({ initialProviderId }: { initialProviderId?:number }) => {
  const { t,i18n }=useTranslation(); const text=(zh:string,en:string)=>i18n.language.startsWith('zh')?zh:en;
  const ai=RootStore.Get(AiSettingStore),blinko=RootStore.Get(BlinkoStore),toast=RootStore.Get(ToastPlugin);
  const [existing,setExisting]=useState(initialProviderId ? String(initialProviderId) : ai.aiProviders.value?.[0]?.id ? String(ai.aiProviders.value[0].id):'new');
  const [type,setType]=useState('openai'),[key,setKey]=useState(''),[url,setUrl]=useState(PROVIDER_TEMPLATES[0]!.defaultBaseURL),[name,setName]=useState('OpenAI'),[model,setModel]=useState('');
  const [makeDefault,setDefault]=useState(!blinko.config.value?.mainModelId),[saving,setSaving]=useState(false);
  const supported=PROVIDER_TEMPLATES.filter(template=>QUICK_PROVIDERS.includes(template.value as any));
  return <form className="space-y-4" onSubmit={async event=>{
    event.preventDefault(); const input=quickModelSetupSchema.safeParse({providerId:existing!=='new'?Number(existing):undefined,provider:existing==='new'?{title:name,provider:type,baseURL:url,apiKey:key}:undefined,modelKey:model,makeDefault});
    if(!input.success){toast.error(input.error.issues[0]?.message||t('operation-failed'));return;}
    setSaving(true);
    try { await api.ai.quickModelSetup.mutate(input.data); await Promise.all([ai.aiProviders.call(),ai.allModels.call(),blinko.config.call()]); RootStore.Get(DialogStore).close(); toast.success(t('operation-success')); }
    catch(error){toast.error(error instanceof Error?error.message:t('operation-failed'));} finally{setSaving(false);}
  }}>
    <p className="text-xs leading-relaxed text-default-500">{text('选择服务商并填写模型名称即可使用。已有服务商会复用连接配置，无需重复填写密钥。','Choose a provider and enter a model ID. Existing providers reuse their connection settings.')}</p>
    <Select label={text('服务商','Provider')} selectedKeys={[existing]} isDisabled={saving} onChange={event=>{if(event.target.value)setExisting(event.target.value);}}>
      {[...(ai.aiProviders.value||[]).map(provider=><SelectItem key={String(provider.id)}>{provider.title}</SelectItem>),<SelectItem key="new">{text('连接新的服务商','Connect a new provider')}</SelectItem>]}
    </Select>
    {existing==='new' && <>
      <Select label={text('服务类型','Service type')} selectedKeys={[type]} isDisabled={saving} onChange={event=>{const value=event.target.value;if(!value)return;setType(value);const template=supported.find(item=>item.value===value);setUrl(template?.defaultBaseURL||'');setName(template?.defaultName||text('自定义服务商','Custom provider'));setKey('');}}>
        {[...supported.map(template=><SelectItem key={template.value}>{template.label}</SelectItem>),<SelectItem key="custom">{text('兼容 OpenAI 的服务','OpenAI-compatible service')}</SelectItem>]}
      </Select>
      {type!=='ollama' && <Input type="password" autoComplete="off" label={t('api-key')} value={key} onValueChange={setKey} isRequired isDisabled={saving} />}
      <details open={type==='custom'} className="text-sm"><summary className="cursor-pointer text-xs text-default-500">{text('连接地址与显示名称','Endpoint & display name')}</summary><div className="mt-3 space-y-3"><Input label={t('base-url')} value={url} onValueChange={setUrl} isRequired isDisabled={saving} /><Input label={t('provider-name')} value={name} onValueChange={setName} isRequired isDisabled={saving} /></div></details>
    </>}
    <Input label={text('模型名称 / ID','Model name / ID')} description={text('填写服务商提供的模型 ID，注意大小写。','Use the exact model ID from your provider.')} value={model} onValueChange={setModel} isRequired isDisabled={saving} />
    <Switch size="sm" isSelected={makeDefault} onValueChange={setDefault} isDisabled={saving}>{text('设为默认对话模型','Use as the default chat model')}</Switch>
    <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="light" isDisabled={saving} onPress={()=>RootStore.Get(DialogStore).close()}>{t('cancel')}</Button><Button type="submit" color="primary" isLoading={saving}>{text('保存模型','Save model')}</Button></div>
  </form>;
});
