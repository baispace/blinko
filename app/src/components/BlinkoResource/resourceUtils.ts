import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';
import { downloadFromLink } from '@/lib/tauriHelper';
import { RootStore } from '@/store';
import { UserStore } from '@/store/user';
import { type ResourceType } from '@shared/lib/types';

export const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'ico', 'avif', 'svg'];
export const VIDEO_EXTS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'];
export const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
export const DOC_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'epub'];

export const getExt = (item: { name?: string; type?: string | null }) =>
  (item.name?.split('.').pop() || '').toLowerCase();

export const isImageResource = (item: { name?: string; type?: string | null }) => {
  if (item.type?.startsWith('image/')) return true;
  return IMAGE_EXTS.includes(getExt(item));
};

export const formatFolderPath = (perfixPath?: string | null) => {
  if (!perfixPath) return '';
  return perfixPath.split(',').filter(Boolean).join('/');
};

export const getResourceUrl = (item: Pick<ResourceType, 'path'>) => {
  if (!item.path) return '';
  const token = RootStore.Get(UserStore).tokenData.value?.token;
  return getBlinkoEndpoint(`${item.path}${token ? `?token=${token}` : ''}`);
};

export const openResourceFile = (item: ResourceType) => {
  const url = getResourceUrl(item);
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
};

export const downloadResourceFile = (item: ResourceType) => {
  const url = getResourceUrl(item);
  if (!url) return;
  void downloadFromLink(url, item.name);
};
