import { observer } from "mobx-react-lite";
import { Tabs, Tab, Card, Button, Chip, Modal, Input } from "@nextui-org/react";
import { useTranslation } from "react-i18next";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { CollapsibleCard } from "../Common/CollapsibleCard";
import { Icon } from "@iconify/react";
import { DialogStore } from "@/store/module/Dialog";
import { DialogStandaloneStore } from "@/store/module/DialogStandalone";
import { useState } from "react";
import { PluginManagerStore } from "@/store/plugin/pluginManagerStore";

const InstalledPlugins = observer(() => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);

  return (
    <div className="space-y-4">
      {/* 这里展示已安装的插件列表 */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:puzzle" width="24" height="24" />
            <div>
              <div className="font-medium">Plugin Name</div>
              <div className="text-sm text-default-500">Plugin Description</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Chip size="sm" color="success">v1.0.0</Chip>
            <Button size="sm" color="danger">卸载</Button>
          </div>
        </div>
      </Card>
    </div>
  );
});

const AllPlugins = observer(() => {
  const { t } = useTranslation();
  
  return (
    <div className="space-y-4">
      {/* 这里展示所有可用插件列表 */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:puzzle" width="24" height="24" />
            <div>
              <div className="font-medium">Plugin Name</div>
              <div className="text-sm text-default-500">Plugin Description</div>
            </div>
          </div>
          <Button size="sm" color="primary">安装</Button>
        </div>
      </Card>
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
          label={t('plugin-url')}
          placeholder="ws://192.168.16.x:xxxx"
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

      {/* 已添加的本地插件列表 */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon icon="mdi:code-braces" width="24" height="24" />
            <div>
              <div className="font-medium">本地插件</div>
              <div className="text-sm text-default-500">http://192.168.16.1:3000</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" color="primary">{t('reload')}</Button>
            <Button size="sm" color="danger">{t('remove')}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
});

export const PluginSetting = observer(() => {
  const { t } = useTranslation();

  return (
    <CollapsibleCard
      icon="mdi:puzzle"
      title={t('plugin-settings')}
    >
      <Tabs aria-label="Plugin settings tabs">
        <Tab key="installed" title={t('installed-plugins')}>
          <InstalledPlugins />
        </Tab>
        <Tab key="all" title={t('all-plugins')}>
          <AllPlugins />
        </Tab>
        <Tab key="development" title={t('local-development')}>
          <LocalDevelopment />
        </Tab>
      </Tabs>
    </CollapsibleCard>
  );
}); 