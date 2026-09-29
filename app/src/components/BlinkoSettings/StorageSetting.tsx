import { observer } from "mobx-react-lite";
import { Button, Checkbox, DropdownItem, DropdownMenu, DropdownTrigger, Dropdown, Input, Switch, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/react";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { PromiseCall } from "@/store/standard/PromiseState";
import { Icon } from '@/components/Common/Iconify/icons';
import { api } from "@/lib/trpc";
import { Item } from "./Item";
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "usehooks-ts";
import { useEffect, useMemo, useState } from "react";
import { PasswordInput } from "@/components/Common/PasswordInput";
import { CollapsibleCard } from "@/components/Common/CollapsibleCard";


export const StorageSetting = observer(() => {
  const isPc = useMediaQuery('(min-width: 768px)')
  const { t } = useTranslation()
  const blinko = RootStore.Get(BlinkoStore)
  const store = RootStore.Local(() => ({
    s3AccessKeyId: "",
    s3AccessKeySecret: "",
    s3Endpoint: "",
    s3Region: "",
    s3Bucket: "",
    s3CustomPath: "",
    s3CdnDomain: "",
    cdnEnabled: true,
    localCustomPath: "",
    staticCdnBaseUrl: "",
    staticCdnPath: "",
    staticCdnEnabled: false,
    uploading: false,
    uploadResult: "",
  }))

  useEffect(() => {
    store.s3AccessKeyId = blinko.config.value?.s3AccessKeyId!
    store.s3AccessKeySecret = blinko.config.value?.s3AccessKeySecret!
    store.s3Endpoint = blinko.config.value?.s3Endpoint!
    store.s3Region = blinko.config.value?.s3Region!
    store.s3Bucket = blinko.config.value?.s3Bucket!
    store.s3CustomPath = blinko.config.value?.s3CustomPath!
    store.s3CdnDomain = blinko.config.value?.s3CdnDomain ?? ''
    // Default to true when the flag is unset so existing installs that already
    // configured s3CdnDomain keep their CDN acceleration behavior. The value may
    // arrive as a boolean or the string 'false'/'true' — treat both falsy forms
    // as disabled, anything else (incl. unset) as enabled.
    const rawCdn = blinko.config.value?.cdnEnabled;
    store.cdnEnabled = !(rawCdn === false || rawCdn === 'false');
    store.localCustomPath = blinko.config.value?.localCustomPath!
    store.staticCdnBaseUrl = blinko.config.value?.staticCdnBaseUrl ?? ''
    store.staticCdnPath = blinko.config.value?.staticCdnPath ?? ''
    const rawStaticCdn = blinko.config.value?.staticCdnEnabled;
    store.staticCdnEnabled = rawStaticCdn === true || rawStaticCdn === 'true'
  }, [blinko.config.value])

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [fileList, setFileList] = useState<{ path: string; size: number }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const openUploadDialog = async () => {
    setLoadingFiles(true);
    try {
      const res = await api.attachments.listStaticAssets.query();
      const files = (res as any).files || [];
      setFileList(files);
      setSelected(files.map((f: any) => f.path));
    } catch (e: any) {
      setFileList([]);
      setSelected([]);
      store.uploadResult = `${t('upload-static-fail')}: ${e?.message ?? e}`;
    } finally {
      setLoadingFiles(false);
      onOpen();
    }
  };

  const toggleFile = (p: string) => {
    setSelected(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const allSelected = fileList.length > 0 && selected.length === fileList.length;
  const toggleAll = () => {
    setSelected(allSelected ? [] : fileList.map(f => f.path));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  // Group files by their top-level directory for a readable checklist.
  const groupedFiles = useMemo(() => {
    const map = new Map<string, { path: string; size: number }[]>();
    for (const f of fileList) {
      const dir = f.path.includes('/') ? f.path.split('/')[0] : '';
      if (!map.has(dir)) map.set(dir, []);
      map.get(dir)!.push(f);
    }
    const groups = [...map.entries()].map(([dir, files]) => {
      files.sort((a, b) => a.path.localeCompare(b.path));
      return { dir, files };
    });
    groups.sort((a, b) => a.dir.localeCompare(b.dir));
    return groups;
  }, [fileList]);

  const handleConfirmUpload = async () => {
    if (selected.length === 0) {
      store.uploadResult = t('upload-static-empty');
      return;
    }
    store.uploading = true;
    store.uploadResult = '';
    try {
      const res = await PromiseCall(api.attachments.uploadStaticAssetsToCdn.mutate({ files: selected }), { autoAlert: false });
      store.uploadResult = `${t('upload-static-success')} ${res.uploaded}${res.failed ? ` · ${res.failed} ${t('upload-static-fail')}` : ''}`;
      onClose();
    } catch (e: any) {
      store.uploadResult = `${t('upload-static-fail')}: ${e?.message ?? e}`;
    } finally {
      store.uploading = false;
    }
  };


  return (<>
    <CollapsibleCard
      icon="tabler:brush"
      title={t('storage')}
    >
    <Item
      leftContent={<div className="flex flex-col gap-2">
        <div>{t('object-storage')}</div>
      </div>}
      rightContent={<div>
        <Dropdown>
          <DropdownTrigger>
            <Button startContent={<Icon icon="mdi:storage" width="20" height="20" />} color='primary' >
              {blinko.config.value?.objectStorage ?? t('local-file-system')}
            </Button>
          </DropdownTrigger>
          <DropdownMenu onAction={async (key) => {
            await PromiseCall(api.config.update.mutate({
              key: 'objectStorage',
              value: key.toString()
            }), { autoAlert: false })
          }}>
            <DropdownItem key="local">  {t('local-file-system')}</DropdownItem>
            <DropdownItem key="s3">S3</DropdownItem>
          </DropdownMenu>


        </Dropdown>
      </div>} />

    {blinko.config.value?.objectStorage != 's3' &&
      <Item
        leftContent={<>
          <div>{t('custom-path')}</div>
        </>}
        rightContent={<Input
          value={store.localCustomPath}
          onChange={e => store.localCustomPath = e.target.value}
          placeholder="/custom/path/"
          onBlur={async (e) => {
            await PromiseCall(api.config.update.mutate({
              key: 'localCustomPath',
              value: e.target.value
            }), { autoAlert: false })
          }} />}
      />
    }

    {
      blinko.config.value?.objectStorage === 's3' && <>
        <Item
          leftContent={<>{t('access-key-id')}</>}
          rightContent={<PasswordInput
            value={store.s3AccessKeyId}
            onChange={e => store.s3AccessKeyId = e.target.value}
            placeholder={t('access-key-id')}
            onBlur={async (e) => {
              await PromiseCall(api.config.update.mutate({
                key: 's3AccessKeyId',
                value: e.target.value
              }), { autoAlert: false })
            }} />} />
        <Item
          leftContent={<>{t('access-key-secret')}</>}
          rightContent={<PasswordInput
            value={store.s3AccessKeySecret}
            onChange={e => store.s3AccessKeySecret = e.target.value}
            placeholder={t('access-key-secret')}
            onBlur={async (e) => {
              await PromiseCall(api.config.update.mutate({
                key: 's3AccessKeySecret',
                value: e.target.value
              }), { autoAlert: false })
            }} />} />
        <Item
          leftContent={<>{t('endpoint')}</>}
          rightContent={<Input value={store.s3Endpoint} onChange={e => store.s3Endpoint = e.target.value} placeholder="Endpoint" onBlur={async (e) => {
            await PromiseCall(api.config.update.mutate({
              key: 's3Endpoint',
              value: e.target.value
            }), { autoAlert: false })
          }} />} />
        <Item
          leftContent={<>{t('region')}</>}
          rightContent={<Input value={store.s3Region} onChange={e => store.s3Region = e.target.value} placeholder="Region" onBlur={async (e) => {
            await PromiseCall(api.config.update.mutate({
              key: 's3Region',
              value: e.target.value
            }), { autoAlert: false })
          }} />} />
        <Item
          leftContent={<>{t('bucket')}</>}
          rightContent={<Input value={store.s3Bucket} onChange={e => store.s3Bucket = e.target.value} placeholder="Bucket" onBlur={async (e) => {
            await PromiseCall(api.config.update.mutate({
              key: 's3Bucket',
              value: e.target.value
            }), { autoAlert: false })
          }} />} />
        <Item
          leftContent={<>
            <div>{t('custom-path')}</div>
          </>}
          rightContent={<Input
            value={store.s3CustomPath}
            onChange={e => store.s3CustomPath = e.target.value}
            placeholder="/custom/path/"
            onBlur={async (e) => {
              await PromiseCall(api.config.update.mutate({
                key: 's3CustomPath',
                value: e.target.value
              }), { autoAlert: false })
            }} />} />
        <Item
          leftContent={<>
            <div>{t('cdn-enabled')}</div>
          </>}
          rightContent={<Switch
            isSelected={store.cdnEnabled}
            onValueChange={async (v) => {
              store.cdnEnabled = v
              await PromiseCall(api.config.update.mutate({
                key: 'cdnEnabled',
                value: v
              }), { autoAlert: false })
            }}
            aria-label={t('cdn-enabled')}
          />} />
        <Item
          leftContent={<>
            <div>{t('cdn-domain')}</div>
          </>}
          rightContent={<Input
            value={store.s3CdnDomain}
            onChange={e => store.s3CdnDomain = e.target.value}
            placeholder="cdn.example.com"
            isDisabled={!store.cdnEnabled}
            onBlur={async (e) => {
              await PromiseCall(api.config.update.mutate({
                key: 's3CdnDomain',
                value: e.target.value
              }), { autoAlert: false })
            }} />} />
      </>
    }


  </CollapsibleCard>

  <CollapsibleCard
    icon="tabler:cloud-cog"
    title={t('static-cdn')}
  >
    <Item
      leftContent={<>
        <div>{t('static-cdn-base-url')}</div>
      </>}
      rightContent={<Input
        value={store.staticCdnBaseUrl}
        onChange={e => store.staticCdnBaseUrl = e.target.value}
        placeholder="https://cdn.example.com/blinko"
        onBlur={async (e) => {
          await PromiseCall(api.config.update.mutate({
            key: 'staticCdnBaseUrl',
            value: e.target.value
          }), { autoAlert: false })
        }} />} />
    <Item
      leftContent={<>
        <div>{t('static-cdn-path')}</div>
      </>}
      rightContent={<Input
        value={store.staticCdnPath}
        onChange={e => store.staticCdnPath = e.target.value}
        placeholder="blinko"
        onBlur={async (e) => {
          await PromiseCall(api.config.update.mutate({
            key: 'staticCdnPath',
            value: e.target.value
          }), { autoAlert: false })
        }} />} />
    <Item
      leftContent={<>
        <div>{t('static-cdn-enabled')}</div>
      </>}
      rightContent={<Switch
        isSelected={store.staticCdnEnabled}
        onValueChange={async (v) => {
          store.staticCdnEnabled = v
          await PromiseCall(api.config.update.mutate({
            key: 'staticCdnEnabled',
            value: v
          }), { autoAlert: false })
        }}
        aria-label={t('static-cdn-enabled')}
      />} />
    <Item
      leftContent={<>
        <div>{t('static-cdn-upload')}</div>
      </>}
      rightContent={<div className="flex flex-col gap-1 items-end">
        <Button color="primary" isLoading={store.uploading} onPress={openUploadDialog}>
          {t('upload-static-to-cdn')}
        </Button>
        {store.uploadResult && <div className="text-xs text-default-500 max-w-[240px] text-right">{store.uploadResult}</div>}
      </div>} />
    <div className="text-xs text-default-400 px-2 pb-1 leading-relaxed">
      {t('static-cdn-hint')}
    </div>
  </CollapsibleCard>

  <Modal isOpen={isOpen} onClose={onClose} size="2xl">
    <ModalContent>
      <ModalHeader>{t('upload-to-cdn-title')}</ModalHeader>
      <ModalBody>
        <div className="flex flex-col gap-3">
          <div className="text-sm text-default-500">{t('upload-cdn-source')}</div>

          {loadingFiles ? (
            <div className="text-sm text-default-400 py-8 text-center">{t('loading')}</div>
          ) : fileList.length === 0 ? (
            <div className="text-sm text-default-400 py-8 text-center">{t('upload-cdn-empty')}</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Checkbox isSelected={allSelected} onValueChange={toggleAll} size="sm">
                  {allSelected ? t('deselect-all') : t('select-all')}
                </Checkbox>
                <span className="text-xs text-default-400">
                  {t('upload-cdn-selected', { n: selected.length, total: fileList.length })}
                </span>
              </div>
              <div className="max-h-72 overflow-auto rounded-lg border border-default-200 divide-y divide-default-100">
                {groupedFiles.map(group => (
                  <div key={group.dir || '__root'}>
                    {group.dir && (
                      <div className="px-3 py-1.5 text-xs font-medium text-default-400 bg-default-50 sticky top-0">
                        {group.dir}/
                      </div>
                    )}
                    {group.files.map(f => (
                      <label key={f.path} className="flex items-center gap-2 px-3 py-2 hover:bg-default-50 cursor-pointer">
                        <Checkbox
                          isSelected={selected.includes(f.path)}
                          onValueChange={() => toggleFile(f.path)}
                          size="sm"
                        />
                        <span className="flex-1 text-sm truncate" title={f.path}>{f.path}</span>
                        <span className="text-xs text-default-400 shrink-0">{formatSize(f.size)}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}

          {store.uploadResult && <div className="text-xs text-default-500">{store.uploadResult}</div>}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="light" onPress={onClose}>{t('cancel')}</Button>
        <Button
          color="primary"
          isLoading={store.uploading}
          onPress={handleConfirmUpload}
          isDisabled={loadingFiles || fileList.length === 0}
        >
          {t('confirm-upload')}{selected.length > 0 ? ` (${selected.length})` : ''}
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
  </>)
})