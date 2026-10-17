import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { syncHeroAccent } from '@/lib/themeAccent';
export async function saveThemeColor(background: string, foreground: string) {
  try {
    await Promise.all([api.config.update.mutate({key:'themeColor',value:background}),api.config.update.mutate({key:'themeForegroundColor',value:foreground})]);
    const blinko = RootStore.Get(BlinkoStore);
    if (blinko.config.value) blinko.config.value = {...blinko.config.value,themeColor:background,themeForegroundColor:foreground};
    for (const element of document.querySelectorAll<HTMLElement>('.dark,.light')) {
      const dark=element.classList.contains('dark');
      element.style.setProperty('--primary',background||(dark?'#4d8bff':'#2f6feb'));
      element.style.setProperty('--primary-foreground',foreground||(dark?'#000000':'#ffffff'));
      if(background) element.style.setProperty('--tag',background); else element.style.removeProperty('--tag');
      syncHeroAccent(element);
    }
  } catch(error) { RootStore.Get(ToastPlugin).error(error instanceof Error?error.message:'Unable to save theme color'); throw error; }
}
