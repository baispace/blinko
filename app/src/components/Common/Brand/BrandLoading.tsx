import { useId } from 'react';
import { Icon } from '@/components/Common/Iconify/icons';
import { BRAND_MARK_RATIO, BRAND_MARK_VIEWBOX, BRAND_PATH_BODY, BRAND_PATH_FRAGMENT } from './brandGeometry';
import './brand.css';

export interface BrandLoadingProps {
  /** Height of the mark in pixels. */
  size?: number;
  /** Short status text; announced once, not on every animation frame. */
  label?: string;
  /** Switch to the error state instead of looping forever. */
  state?: 'loading' | 'error';
  errorMessage?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Page-level brand loading.
 *
 * Only used where the main content is genuinely blocked (app start-up, route
 * lazy boundaries). Local requests keep their existing spinners and
 * skeletons.
 */
export const BrandLoading = ({
  size = 88,
  label = '正在加载…',
  state = 'loading',
  errorMessage = '加载失败',
  onRetry,
  className,
}: BrandLoadingProps) => {
  const clipId = `brand-loading-clip-${useId().replace(/:/g, '')}`;
  const width = Math.round(size * BRAND_MARK_RATIO * 100) / 100;

  if (state === 'error') {
    return (
      <div role="alert" className={`flex flex-col items-center gap-3 ${className ?? ''}`}>
        <Icon icon="tabler:alert-triangle" width={26} height={26} className="text-danger-500" />
        <p className="text-sm text-default-600">{errorMessage}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-default-300 px-3 py-1.5 text-sm text-default-700 transition-colors hover:bg-default-100"
          >
            重试
          </button>
        )}
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" aria-busy="true" className={`brand-loading ${className ?? ''}`}>
      <svg
        viewBox={BRAND_MARK_VIEWBOX}
        width={width}
        height={size}
        className="brand-loading__mark text-[#5F40FD] dark:text-[#CABEFC]"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <rect className="brand-loading__clip" x={0} y={0} width={64} height={100} />
          </clipPath>
        </defs>
        <path className="brand-loading__fragment" d={BRAND_PATH_FRAGMENT} />
        <path className="brand-loading__body" d={BRAND_PATH_BODY} clipPath={`url(#${clipId})`} />
      </svg>
      <span className="text-[13px] leading-none text-default-500">{label}</span>
    </div>
  );
};
