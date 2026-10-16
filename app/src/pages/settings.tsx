import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SettingsWorkspace } from '@/components/BlinkoSettings/SettingsWorkspace';
import { ImportAIDialog } from '@/components/BlinkoSettings/ImportAIDialog';
export { allSettings } from '@/components/BlinkoSettings/settingsRegistry';

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const selectSection = useCallback((section: string) => setParams(previous => {
    const next = new URLSearchParams(previous); next.set('section', section); return next;
  }, { replace: true }), [setParams]);
  return <div className="h-full min-h-0 overflow-hidden pt-14 md:pt-0">
    <ImportAIDialog onSelectTab={selectSection} />
    <SettingsWorkspace initialSection={params.get('section') || 'basic'} onSectionChange={selectSection} />
  </div>;
}
