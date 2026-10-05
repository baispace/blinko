import { Image } from '@heroui/react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import { toRenderableContentUrl } from '@/lib/fileUrl';

interface ImageWrapperProps {
  src?: string;
  width?: number | string;
  height?: number | string;
  alt?: string;
  /** 编辑器里手动设置的对齐（`<img align="...">`），缺省按居中处理 */
  align?: string;
}

const toPx = (v?: number | string): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const ImageWrapper = ({ src = '', width, alt, align }: ImageWrapperProps) => {
  if (!src) return null;

  // markdown 里存的是内部路径（/api/file/*、/api/s3file/*）：
  // 本地存储需补 ?token=，S3+CDN 则换成绝对 CDN 地址。
  const resolved = toRenderableContentUrl(src) ?? src;

  const w = toPx(width);
  const justify =
    align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center';

  // 这个组件永远不会被 <p> 包：MarkdownRender 的 components.p 已把"只含图片"段落
  // 重写为 <div className="md-image-block">，见 index.tsx p 映射。
  return (
    <div className={`md-image-block w-full flex ${justify}`}>
      {/*
        宽度放在这层容器上而不是 Image 上：HeroUI 的 Image 不一定转发 style，
        而 img 上的 w-full 会把显式宽度又拉满。手动调过宽度的图片放行高度上限，
        否则 object-contain 会按 360px 把宽度重新压回去，看起来像没生效。
      */}
      <div style={{ width: w ?? '100%', maxWidth: '100%' }}>
        <PhotoProvider>
          <PhotoView src={resolved}>
            <Image
              src={resolved}
              alt={alt}
              classNames={{ wrapper: '!max-w-fit !m-0' }}
              className={`w-full object-contain ${w ? 'max-h-[620px]' : 'max-h-[360px]'}`}
            />
          </PhotoView>
        </PhotoProvider>
      </div>
    </div>
  );
};
