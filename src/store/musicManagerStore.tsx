import { makeAutoObservable } from 'mobx';
import { Store } from './standard/base';
import { StorageState } from './standard/StorageState';
import { FileType } from '@/components/Common/Editor/type';

export interface AudioMetadata {
  coverUrl?: string;
  trackName?: string;
  albumName?: string;
  artists?: string[];
  previewUrl?: string;
}

export class MusicManagerStore implements Store {
  sid = 'MusicManagerStore';

  constructor() {
    makeAutoObservable(this);
  }

  playlist: Array<{
    file: FileType;
    metadata?: AudioMetadata;
  }> = [];

  currentIndex = 0;

  isPlaying = false;

  currentTime = 0;

  duration = 0;

  audioElement: HTMLAudioElement | null = null;

  showMiniPlayer = false;

  playMode = new StorageState<number>({ 
    key: 'play-mode',
    default: 0 
  });

  initAudio(audio: HTMLAudioElement) {
    this.audioElement = audio;
    this.bindAudioEvents();
  }

  private bindAudioEvents() {
    if (!this.audioElement) return;

    this.audioElement.addEventListener('timeupdate', () => {
      this.currentTime = this.audioElement?.currentTime || 0;
    });

    this.audioElement.addEventListener('ended', () => {
      this.isPlaying = false;
      this.playNext();
    });

    this.audioElement.addEventListener('loadedmetadata', () => {
      this.duration = this.audioElement?.duration || 0;
    });

    this.audioElement.addEventListener('error', (e) => {
      console.error('音频播放错误:', e);
      this.isPlaying = false;
    });
  }

  setPlaylist(files: FileType[], metadata: Record<string, AudioMetadata> = {}) {
    const currentFileName = this.currentTrack?.file.name;
    
    this.playlist = files.map(file => ({
      file,
      metadata: metadata[file.name]
    }));
    
    if (currentFileName) {
      const newIndex = this.playlist.findIndex(item => item.file.name === currentFileName);
      if (newIndex !== -1) {
        this.currentIndex = newIndex;
      }
    }
    
    this.showMiniPlayer = true;
  }

  playTrack(index: number) {
    if (index < 0 || index >= this.playlist.length || !this.audioElement) return;
    
    if (this.isPlaying) {
      this.audioElement.pause();
    }
    
    this.currentIndex = index;
    const track = this.playlist[index];
    
    if (track?.file.preview) {
      this.audioElement.src = track.file.preview;
      const playPromise = this.audioElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            this.isPlaying = true;
            this.showMiniPlayer = true;
          })
          .catch(error => {
            console.error('播放失败:', error);
            this.isPlaying = false;
          });
      }
    }
  }

  togglePlay() {
    if (!this.audioElement) return;

    if (this.isPlaying) {
      console.log('isPlaying', 'pause');
      this.audioElement.pause();
      this.isPlaying = false;
    } else {
      const playPromise = this.audioElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            this.isPlaying = true;
          })
          .catch(error => {
            console.error('播放失败:', error);
            this.isPlaying = false;
          });
      }
    }
  }

  playNext() {
    let nextIndex: number;

    switch (this.playMode.value) {
      case 1:
        nextIndex = this.currentIndex;
        break;
      case 2: 
        nextIndex = Math.floor(Math.random() * this.playlist.length);
        break;
      default:
        nextIndex = (this.currentIndex + 1) % this.playlist.length;
    }

    this.playTrack(nextIndex);
  }

  playPrevious() {
    let prevIndex = this.currentIndex - 1;
    if (prevIndex < 0) {
      prevIndex = this.playlist.length - 1;
    }
    this.playTrack(prevIndex);
  }

  seek(time: number) {
    if (this.audioElement) {
      this.audioElement.currentTime = time;
    }
  }

  togglePlayMode() {
    const nextMode = (this.playMode.value + 1) % 3;
    this.playMode.save(nextMode);
  }

  get currentTrack() {
    return this.playlist[this.currentIndex];
  }

  closeMiniPlayer() {
    this.showMiniPlayer = false;
    if (this.audioElement) {
      this.audioElement.pause();
      this.isPlaying = false;
    }
  }
}
