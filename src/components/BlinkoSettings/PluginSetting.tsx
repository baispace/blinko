import { observer } from "mobx-react-lite";
import { Tabs, Tab, Card, Button, Chip, Modal, Input, Spinner, CardBody } from "@nextui-org/react";
import { useTranslation } from "react-i18next";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { CollapsibleCard } from "../Common/CollapsibleCard";
import { Icon } from "@iconify/react";
import { DialogStore } from "@/store/module/Dialog";
import { DialogStandaloneStore } from "@/store/module/DialogStandalone";
import { useState, useEffect } from "react";
import { PluginManagerStore } from "@/store/plugin/pluginManagerStore";
import i18n from "@/lib/i18n";
import { type PluginInfo } from "@/server/types";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { LoadingAndEmpty } from "../Common/LoadingAndEmpty";
import { PromiseCall } from "@/store/standard/PromiseState";

interface PluginCardProps {
  name: string;
  version: string;
  displayName: { default: string; zh_CN: string };
  description: { default: string; zh_CN: string };
  author?: string;
  downloads?: number;
  actionButton: React.ReactNode;
}

const PluginCard = ({ name, version, displayName, description, author, downloads, actionButton }: PluginCardProps) => {
  const { t } = useTranslation();
  return (
    <Card key={name} className="group relative overflow-hidden backdrop-blur-sm border border-default-200 dark:border-default-100/20">
      <div className="absolute inset-0 bg-gradient-to-r from-default-100/50 via-default-200/30 to-default-100/50 dark:from-default-50/10 dark:via-default-100/5 dark:to-default-50/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <CardBody className="p-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div>
                  <h3 className="text-lg font-semibold">
                    {displayName[i18n.language] || displayName.default}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Chip
                      size="sm"
                      variant="flat"
                      color="success"
                      className="px-2 h-5 text-xs font-medium"
                    >
                      v{version}
                    </Chip>
                    {author && (
                      <span className="text-xs text-default-500">
                        by <span className="text-default-700 dark:text-default-400">{author}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="ml-4">
              {actionButton}
            </div>
          </div>

          <p className="text-sm text-default-600 dark:text-default-400 leading-relaxed">
            {description[i18n.language] || description.default}
          </p>

          {downloads && (
            <div className="flex items-center gap-4 mt-1">
              <div className="flex items-center gap-1.5 text-xs text-default-500">
                <Icon icon="mdi:download" className="text-base" />
                <span>{downloads.toLocaleString()} {t('downloads')}</span>
              </div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
};

const InstalledPlugins = observer(() => {
  const { t } = useTranslation();
  const pluginManager = RootStore.Get(PluginManagerStore);

  const handleUninstall = async (id: number) => {
    await PromiseCall(pluginManager.uninstallPlugin(id));
  };


  return (
    <div className="space-y-2">
      <LoadingAndEmpty isLoading={pluginManager.installedPlugins.loading.value} isEmpty={pluginManager.installedPlugins.value?.length === 0} />
      {pluginManager.installedPlugins.value?.map((plugin) => {
        const metadata = plugin.metadata as {
          name: string;
          version: string;
          displayName: { default: string; zh_CN: string };
          description: { default: string; zh_CN: string };
        };
        return (
          <PluginCard
            key={plugin.id}
            {...metadata}
            actionButton={
              <Button
                size="sm"
                color="danger"
                startContent={<Icon icon="mdi:trash-can" width="16" height="16" />}
                className="min-w-[80px]"
                onPress={() => handleUninstall(plugin.id)}
              >
                {t('uninstall')}
              </Button>
            }
          />
        );
      })}
    </div>
  );
});

const AllPlugins = observer(() => {
  const { t } = useTranslation();
  const pluginManager = RootStore.Get(PluginManagerStore);

  const handleInstall = async (plugin: PluginInfo) => {
    await PromiseCall(pluginManager.installPlugin(plugin));
  };

  return (
    <div className="space-y-2">
      <LoadingAndEmpty isLoading={pluginManager.marketplacePlugins.loading.value} isEmpty={pluginManager.marketplacePlugins.value?.length === 0} />
      {pluginManager.marketplacePlugins.value?.map((plugin) => (
        <PluginCard
          key={plugin.name}
          {...plugin}
          actionButton={
            <Button
              size="sm"
              color="primary"
              className="min-w-[80px]"
              startContent={<Icon icon="mdi:download" width="16" height="16" />}
              onPress={() => handleInstall(plugin)}
            >
              {t('install')}
            </Button>
          }
        />
      ))}
    </div>
  );
});

const LocalDevelopment = observer(() => {
  const { t } = useTranslation();
  const dialog = RootStore.Get(DialogStandaloneStore);
  const [url, setUrl] = useState('');

  const handleAddLocalPlugin = async () => {
    dialog.setData({
      isOpen: true,
      title: t('add-local-plugin'),
      size: 'md',
      content: <div className="flex flex-col gap-4">
        <Input
          label={t('endpoint')}
          placeholder="ws://192.168.16.x:8080"
          value={url}
          onChange={(e) => {
            console.log(e.target.value);
            setUrl(e.target.value);
          }}
        />
        <div className="flex justify-end gap-2">
          <Button color="danger" variant="light" onPress={() => dialog.close()}>
            {t('cancel')}
          </Button>
          <Button color="primary" onPress={() => {
            RootStore.Get(PluginManagerStore).connectDevPlugin(url);
            dialog.close();
          }}>
            {t('confirm')}
          </Button>
        </div>
      </div>
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          color="primary"
          startContent={<Icon icon="mdi:plus" />}
          onPress={handleAddLocalPlugin}
        >
          {t('add-local-plugin')}
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:code-braces" width="24" height="24" />
            <div>
              <div className="font-medium">{t('local-plugin')}</div>
              <div className="text-sm text-default-500">ws://192.168.1.100:8080</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" color="danger">{t('remove')}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
});

export const PluginSetting = observer(() => {
  const { t } = useTranslation();
  useEffect(() => {
    RootStore.Get(PluginManagerStore).loadAllPlugins();
  }, []);
  return (
    <CollapsibleCard
      icon="mingcute:plugin-line"
      title={t('plugin-settings')}
    >
      <Tabs aria-label="Plugin settings tabs">
        <Tab key="installed" title={t('installed-plugins')}>
          <InstalledPlugins />
        </Tab>
        <Tab key="all" title={t('marketplace')}>
          <AllPlugins />
        </Tab>
        <Tab key="development" title={t('local-development')}>
          <LocalDevelopment />
        </Tab>
      </Tabs>
    </CollapsibleCard>
  );
}); 