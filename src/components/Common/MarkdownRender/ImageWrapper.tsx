import { Image } from '@heroui/react';
import { PhotoProvider, PhotoView } from 'react-photo-view';

interface ImageWrapperProps {
  src: string;
  width?: number;
  height?: number;
}

export const ImageWrapper = ({ src, width, height }: ImageWrapperProps) => {
  const props = { width, height }
  return (
    <div className='markdown-image-wrapper w-full'>
      <PhotoProvider>
        <PhotoView src={src} >
          <Image src={src} {...props}
            classNames={{
              wrapper: '!max-w-fit !m-auto',
            }} className='w-full max-h-[200px] object-cover' />
        </PhotoView>
      </PhotoProvider>
    </div>
  );
}; 