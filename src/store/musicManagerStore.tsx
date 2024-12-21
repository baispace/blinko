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

export interface PlaylistTrack {
  file: FileType;
  metadata?: AudioMetadata;
  addedAt: number;
}

export class MusicManagerStore implements Store {
  sid = 'MusicManagerStore';
  private static instance: MusicManagerStore;
  private static audioInstance: HTMLAudioElement | null = null;
  
  constructor() {
    makeAutoObservable(this);
    if (MusicManagerStore.instance) {
      return MusicManagerStore.instance;
    }
    MusicManagerStore.instance = this;
  }

  private storedPlaylist = new StorageState<PlaylistTrack[]>({
    key: 'music-playlist',
    default: []
  });

  private currentTrackName = new StorageState<string>({
    key: 'current-track-name',
    default: ''
  });

  get playlist(): PlaylistTrack[] {
    return this.storedPlaylist.value || [];
  }

  isPlaying = false;
  currentTime = 0;
  duration = 0;
  audioElement: HTMLAudioElement | null = null;
  showMiniPlayer = false;
  playMode = new StorageState<number>({ 
    key: 'play-mode',
    default: 0 
  });

  get currentTrack(): PlaylistTrack | undefined {
    const trackName = this.currentTrackName.value;
    return this.playlist.find(track => 
      (track.metadata?.trackName || track.file.name) === trackName
    );
  }

  get currentIndex(): number {
    return this.playlist.findIndex(track => 
      (track.metadata?.trackName || track.file.name) === this.currentTrackName.value
    );
  }

  initAudio(audio: HTMLAudioElement) {
    if (this.audioElement) {
      this.removeAudioEvents(this.audioElement);
    }

    if (MusicManagerStore.audioInstance) {
      audio.pause();
      audio.src = '';
      
      this.audioElement = MusicManagerStore.audioInstance;
    } else {
      this.audioElement = audio;
      MusicManagerStore.audioInstance = audio;
    }

    this.bindAudioEvents();
  }

  private removeAudioEvents(audio: HTMLAudioElement) {
    audio.removeEventListener('timeupdate', this.handleTimeUpdate);
    audio.removeEventListener('ended', this.handleEnded);
    audio.removeEventListener('loadedmetadata', this.handleLoadedMetadata);
    audio.removeEventListener('error', this.handleError);
  }

  private handleTimeUpdate = () => {
    this.currentTime = this.audioElement?.currentTime || 0;
  };

  private handleEnded = () => {
    this.isPlaying = false;
    this.playNext();
  };

  private handleLoadedMetadata = () => {
    this.duration = this.audioElement?.duration || 0;
  };

  private handleError = (e: Event) => {
    console.error('play error:', e);
    this.isPlaying = false;
  };

  private bindAudioEvents() {
    if (!this.audioElement) return;

    this.audioElement.addEventListener('timeupdate', this.handleTimeUpdate);
    this.audioElement.addEventListener('ended', this.handleEnded);
    this.audioElement.addEventListener('loadedmetadata', this.handleLoadedMetadata);
    this.audioElement.addEventListener('error', this.handleError);
  }

  addToPlaylist(file: FileType, metadata?: AudioMetadata, playNow: boolean = false) {
    const trackName = metadata?.trackName || file.name;
    
    const exists = this.playlist.some(track => 
      (track.metadata?.trackName || track.file.name) === trackName
    );

    if (!exists) {
      const newTrack: PlaylistTrack = {
        file,
        metadata,
        addedAt: Date.now()
      };
      
      this.storedPlaylist.save([...this.playlist, newTrack]);
      this.showMiniPlayer = true;
    }

    if (playNow || !this.currentTrack) {
      this.playTrackByName(trackName);
    }
  }

  setPlaylist(files: FileType[], metadata: Record<string, AudioMetadata> = {}) {
    const newTracks = files.map(file => ({
      file,
      metadata: metadata[file.name],
      addedAt: Date.now()
    }));

    const uniqueTracks = this.mergePlaylist(this.playlist, newTracks);
    this.storedPlaylist.save(uniqueTracks);
    
    const currentTrackName = this.currentTrackName.value;
    const stillExists = uniqueTracks.some(track => 
      (track.metadata?.trackName || track.file.name) === currentTrackName
    );
    
    if (!stillExists) {
      this.currentTrackName.save('');
    }
    
    this.showMiniPlayer = true;
  }

  private mergePlaylist(oldTracks: PlaylistTrack[], newTracks: PlaylistTrack[]): PlaylistTrack[] {
    const trackMap = new Map<string, PlaylistTrack>();
    
    oldTracks.forEach(track => {
      const key = track.metadata?.trackName || track.file.name;
      trackMap.set(key, track);
    });

    newTracks.forEach(track => {
      const key = track.metadata?.trackName || track.file.name;
      if (!trackMap.has(key)) {
        trackMap.set(key, track);
      }
    });

    return Array.from(trackMap.values());
  }

  removeFromPlaylist(trackName: string) {
    const newPlaylist = this.playlist.filter(track => 
      (track.metadata?.trackName || track.file.name) !== trackName
    );
    this.storedPlaylist.save(newPlaylist);

    if (this.currentTrackName.value === trackName) {
      if (newPlaylist.length > 0) {
        this.playNext();
      } else {
        this.closeMiniPlayer();
      }
    }
  }

  async playTrackByName(trackName: string) {
    const track = this.playlist.find(t => 
      (t.metadata?.trackName || t.file.name) === trackName
    );
    
    if (!track || !this.audioElement) return;
    
    this.audioElement.pause();
    this.isPlaying = false;
    
    this.currentTrackName.save(trackName);
    
    if (track.file.preview) {
      try {
        this.audioElement.src = track.file.preview;
        await this.audioElement.play();
        this.isPlaying = true;
        this.showMiniPlayer = true;
      } catch (error) {
        console.error('play error:', error);
        this.isPlaying = false;
      }
    }
  }

  async togglePlay() {
    if (!this.audioElement) {
      return;
    }

    try {
      if (this.isPlaying) {
        this.audioElement.pause();
        this.isPlaying = false;
      } else {
        if (!this.audioElement.src) {
          return;
        }
        
        if (this.audioElement.readyState < 2) {
          await new Promise((resolve) => {
            this.audioElement!.addEventListener('canplay', resolve, { once: true });
          });
        }
        
        await this.audioElement.play();
        this.isPlaying = true;
      }
    } catch (error) {
      this.isPlaying = false;
    }
  }

  playNext() {
    const currentIndex = this.currentIndex;
    let nextTrack: PlaylistTrack | undefined;

    switch (this.playMode.value) {
      case 1:
        nextTrack = this.currentTrack;
        break;
      case 2:
        const randomIndex = Math.floor(Math.random() * this.playlist.length);
        nextTrack = this.playlist[randomIndex];
        break;
      default:
        const nextIndex = (currentIndex + 1) % this.playlist.length;
        nextTrack = this.playlist[nextIndex];
    }

    if (nextTrack) {
      this.playTrackByName(nextTrack.metadata?.trackName || nextTrack.file.name);
    }
  }

  playPrevious() {
    const currentIndex = this.currentIndex;
    if (currentIndex === -1) return;

    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      prevIndex = this.playlist.length - 1;
    }

    const prevTrack = this.playlist[prevIndex];
    if (prevTrack) {
      this.playTrackByName(prevTrack.metadata?.trackName || prevTrack.file.name);
    }
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

  closeMiniPlayer() {
    this.showMiniPlayer = false;
    if (this.audioElement) {
      this.audioElement.pause();
      this.isPlaying = false;
    }
    this.currentTrackName.save('');
  }

  clearPlaylist() {
    this.storedPlaylist.save([]);
    this.currentTrackName.save('');
    this.closeMiniPlayer();
  }
}
