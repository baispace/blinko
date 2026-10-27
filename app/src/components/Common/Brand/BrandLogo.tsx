import { BrandMark, type BrandTone } from './BrandMark';
import { BRAND_NAME } from './brandGeometry';

export interface BrandLogoProps {
  /** Height of the mark in pixels; the wordmark scales with it. */
  size?: number;
  /** English wordmark. */
  name?: string;
  /** Chinese wordmark, shown next to or below the English one. */
  chineseName?: string;
  /** Set to false for an icon-only lockup. */
  showName?: boolean;
  showChinese?: boolean;
  /** `inline` keeps everything on one line, `stacked` puts 拾成 below. */
  layout?: 'inline' | 'stacked';
  tone?: BrandTone;
  simplified?: boolean;
  /** Accessible name — required when the logo has no text of its own. */
  title?: string;
  className?: string;
  nameClassName?: string;
  chineseClassName?: string;
}

/**
 * Jomio wordmark.
 *
 * With text next to it the mark is decorative (screen readers read the
 * wordmark once); on its own it carries an explicit accessible name.
 */
export const BrandLogo = ({
  size = 30,
  name = BRAND_NAME.en,
  chineseName = BRAND_NAME.zh,
  showName = true,
  showChinese = false,
  layout = 'inline',
  tone = 'primary',
  simplified = false,
  title,
  className,
  nameClassName,
  chineseClassName,
}: BrandLogoProps) => {
  const nameSize = Math.max(11, Math.round(size * 0.48));
  const chineseSize = Math.max(10, Math.round(size * 0.42));
  const stacked = layout === 'stacked';

  return (
    <span className={`flex min-w-0 items-center ${stacked ? 'gap-3' : 'gap-2.5'} ${className ?? ''}`}>
      <BrandMark
        size={size}
        tone={tone}
        simplified={simplified}
        title={showName ? undefined : title}
        className="shrink-0"
      />
      {showName && (
        <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span
              className={`truncate font-semibold tracking-[-0.01em] text-foreground ${nameClassName ?? ''}`}
              style={{ fontSize: nameSize, lineHeight: `${Math.round(nameSize * 1.25)}px` }}
            >
              {name}
            </span>
            {!stacked && showChinese && (
              <>
                <span aria-hidden="true" className={`text-default-400 ${chineseClassName ?? ''}`} style={{ fontSize: chineseSize }}>
                  ·
                </span>
                <span
                  className={`shrink-0 text-default-500 ${chineseClassName ?? ''}`}
                  style={{ fontSize: chineseSize, lineHeight: `${Math.round(chineseSize * 1.25)}px` }}
                >
                  {chineseName}
                </span>
              </>
            )}
          </span>
          {stacked && showChinese && (
            <span
              className={`truncate text-default-500 ${chineseClassName ?? ''}`}
              style={{ fontSize: chineseSize, lineHeight: `${Math.round(chineseSize * 1.3)}px` }}
            >
              {chineseName}
            </span>
          )}
        </span>
      )}
    </span>
  );
};
