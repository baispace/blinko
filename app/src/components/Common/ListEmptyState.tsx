import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';

type EmptyVariant = 'blinko' | 'notes' | 'todo' | 'tag';

const EMPTY_VISUALS: Record<EmptyVariant, { icon: string; iconClass: string; surfaceClass: string; titleKey: string; descriptionKey: string }> = {
  blinko: {
    icon: 'basil:lightning-outline',
    iconClass: 'text-amber-500',
    surfaceClass: 'bg-amber-500/10',
    titleKey: 'empty-blinko-title',
    descriptionKey: 'empty-blinko-description',
  },
  notes: {
    icon: 'hugeicons:note',
    iconClass: 'text-primary',
    surfaceClass: 'bg-primary/10',
    titleKey: 'empty-notes-title',
    descriptionKey: 'empty-notes-description',
  },
  todo: {
    icon: 'solar:bill-check-linear',
    iconClass: 'text-emerald-500',
    surfaceClass: 'bg-emerald-500/10',
    titleKey: 'empty-todo-title',
    descriptionKey: 'empty-todo-description',
  },
  tag: {
    icon: 'mingcute:hashtag-line',
    iconClass: 'text-violet-500',
    surfaceClass: 'bg-violet-500/10',
    titleKey: 'empty-filter-title',
    descriptionKey: 'empty-filter-description',
  },
};

export const ListEmptyState = ({
  variant,
  filtered = false,
  onClearFilters,
  compact = false,
}: {
  variant: EmptyVariant;
  filtered?: boolean;
  onClearFilters?: () => void;
  compact?: boolean;
}) => {
  const { t } = useTranslation();
  const visual = EMPTY_VISUALS[filtered ? 'tag' : variant];

  return (
    <div
      className={`flex w-full select-none flex-col items-center justify-center px-5 text-center ${compact ? 'min-h-36 py-6' : 'min-h-64 py-10'}`}
      role="status"
    >
      <div className={`mb-3 grid size-11 place-items-center rounded-2xl ${visual.surfaceClass} ${visual.iconClass}`}>
        <Icon icon={visual.icon} width={22} height={22} />
      </div>
      <h2 className="text-[14px] font-semibold text-foreground">
        {t(visual.titleKey)}
      </h2>
      <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-default-500">
        {t(visual.descriptionKey)}
      </p>
      {filtered && onClearFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-3 inline-flex h-8 items-center rounded-lg bg-default-100 px-3 text-[12px] font-medium text-default-600 transition-colors hover:bg-default-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          {t('clear-filters')}
        </button>
      )}
    </div>
  );
};
