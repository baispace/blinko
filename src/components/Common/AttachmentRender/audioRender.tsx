import React, { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/trpc';
import { FileType } from '../Editor/type';
import { DeleteIcon, DownloadIcon } from './icons';
import { Icon } from '@iconify/react';
import { RootStore, useStore } from '@/store';
import { MusicManagerStore } from '@/store/musicManagerStore'
import { observer } from 'mobx-react-lite';

interface AudioMetadata {
  coverUrl?: string;
  trackName?: string;
  albumName?: string;
  artists?: string[];
  previewUrl?: string;
}

interface Props {
  files: FileType[];
  preview?: boolean;
}

export const AudioRender = observer(({ files, preview = false }: Props) => {
  const [audioMetadata, setAudioMetadata] = useState<Record<string, AudioMetadata>>({});
  const musicManager = RootStore.Get(MusicManagerStore);
  const [isPlaying, setIsPlaying] = useState<Record<string, boolean>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const progressRefs = useRef<Record<string, HTMLDivElement>>({});
  const [currentTime, setCurrentTime] = useState<Record<string, string>>({});
  const [duration, setDuration] = useState<Record<string, string>>({});
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      musicManager.initAudio(audioRef.current);
    }
  }, []);

  const getMetadata = async (file: FileType) => {
    try {
      const metadata = await api.public.musicMetadata.query({
        filePath: file.preview
      });
      setAudioMetadata(prev => ({
        ...prev,
        [file.name]: metadata
      }));
    } catch (error) {
      console.error('Failed to fetch audio metadata:', error);
    }
  };

  useEffect(() => {
    files?.filter(i => i.previewType === 'audio').forEach(file => {
      getMetadata(file);
    });
  }, [files]);

  const isCurrentPlaying = (fileName: string) => {
    return musicManager.isPlaying && musicManager.currentTrack?.file.name === fileName;
  };

  const togglePlay = (fileName: string) => {
    const audioFiles = files.filter(i => i.previewType === 'audio');
    const index = audioFiles.findIndex(f => f.name === fileName);

    if (index === -1) return;
    console.log('togglePlay', fileName);
    musicManager.setPlaylist(audioFiles, audioMetadata);

    if (musicManager.currentTrack?.file.name === fileName) {
      console.log('togglePlay', 'pause');
      musicManager.togglePlay();
    } else {
      console.log('togglePlay', 'play');
      musicManager.playTrack(index);
    }
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const updateProgress = () => {
      if (!musicManager.audioElement) return;

      const fileName = musicManager.currentTrack?.file.name;
      if (!fileName) return;

      const progress = progressRefs.current[fileName];
      if (!progress) return;

      const percentage = (musicManager.currentTime / musicManager.duration) * 100;
      progress.style.width = `${percentage}%`;

      setCurrentTime(prev => ({
        ...prev,
        [fileName]: formatTime(musicManager.currentTime)
      }));
    };

    const interval = setInterval(updateProgress, 100);
    return () => clearInterval(interval);
  }, [musicManager.currentTrack]);

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>, fileName: string) => {
    if (!musicManager.audioElement || musicManager.currentTrack?.file.name !== fileName) return;

    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;

    musicManager.seek(musicManager.duration * percentage);
  };

  const handleLoadedMetadata = (fileName: string) => {
    const audio = audioRefs.current[fileName];
    if (!audio) return;

    setDuration(prev => ({
      ...prev,
      [fileName]: formatTime(audio.duration)
    }));
  };

  const handleEnded = (fileName: string) => {
    setIsPlaying(prev => ({ ...prev, [fileName]: false }));
    const progress = progressRefs.current[fileName];
    if (progress) {
      progress.style.width = '0%';
    }
  };

  const handleProgressBarDrag = (e: React.MouseEvent<HTMLDivElement>, fileName: string) => {
    if (!musicManager.audioElement || musicManager.currentTrack?.file.name !== fileName) return;

    const progressBar = e.currentTarget;
    const updateTimeFromMousePosition = (e: MouseEvent) => {
      const rect = progressBar.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const percentage = x / rect.width;
      musicManager.seek(musicManager.duration * percentage);
    };

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      updateTimeFromMousePosition(e);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const getBackgroundStyle = (coverUrl?: string) => {
    if (!coverUrl) {
      return 'bg-sencondbackground hover:bg-hover';
    }
    return 'bg-cover bg-center relative overflow-hidden hover:bg-opacity-90';
  };

  return (
    <div className="flex flex-col gap-2">
      <audio ref={audioRef} hidden />

      {files?.filter(i => i.previewType === 'audio').map((file, index) => {
        const metadata = audioMetadata[file.name];

        return (
          <div
            key={`${file.name}-${index}`}
            className={`group relative flex items-center gap-3 p-3 cursor-pointer transition-all rounded-xl ${getBackgroundStyle(metadata?.coverUrl)}`}
          >
            {metadata?.coverUrl && (
              <>
                <div
                  className="absolute inset-0 bg-cover bg-center blur-2xl opacity-40"
                  style={{ backgroundImage: `url(${metadata.coverUrl})` }}
                />
                <div className="absolute inset-0 bg-black bg-opacity-20" />
              </>
            )}

            <div className="relative flex items-center gap-3 w-full z-10">
              <div className="relative min-w-[50px] h-[50px]">
                {metadata?.coverUrl ? (
                  <img
                    src={metadata.coverUrl}
                    alt="Album Cover"
                    className="w-full h-full rounded-md object-cover"
                  />
                ) : (
                  <div className="w-full h-full rounded-md bg-gray-200 flex items-center justify-center">
                    <Icon icon="ph:music-notes" className="w-6 h-6 text-gray-400" />
                  </div>
                )}
                <button
                  onClick={() => togglePlay(file.name)}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <Icon
                    icon={isCurrentPlaying(file.name) ? "ph:pause-fill" : "ph:play-fill"}
                    className="w-6 h-6 text-white drop-shadow-lg"
                  />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className={`font-medium truncate ${metadata?.coverUrl ? 'text-white' : ''}`}>
                    {metadata?.trackName || file.name}
                  </div>
                  <div className={`text-xs ${metadata?.coverUrl ? 'text-white/80' : 'text-gray-500'}`}>
                    {currentTime[file.name] || '0:00'} / {duration[file.name] || '0:00'}
                  </div>
                </div>
                {metadata?.artists && metadata.artists.length > 0 && (
                  <div className={`text-sm truncate ${metadata?.coverUrl ? 'text-white/80' : 'text-gray-500'}`}>
                    {metadata.artists.join(', ')}
                  </div>
                )}

                <div
                  className="relative h-1 bg-black/20 rounded-full mt-2 cursor-pointer"
                  onClick={(e) => handleProgressBarClick(e, file.name)}
                  onMouseDown={(e) => handleProgressBarDrag(e, file.name)}
                >
                  <div
                    ref={el => el && (progressRefs.current[file.name] = el)}
                    className={`absolute h-full rounded-full transition-all duration-100 ${metadata?.coverUrl ? 'bg-white' : 'bg-primary'
                      }`}
                  />
                </div>
              </div>

              {!file.uploadPromise?.loading?.value && !preview && (
                <DeleteIcon
                  files={files}
                  className={`ml-2 group-hover:opacity-100 opacity-0 ${metadata?.coverUrl ? 'text-white' : ''
                    }`}
                  file={file}
                />
              )}
              {preview && (
                <DownloadIcon
                  className={`ml-2 ${metadata?.coverUrl ? 'text-white' : ''}`}
                  file={file}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
})