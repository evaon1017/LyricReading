export interface Song {
  id: string;
  title: string;
  youtubeUrl: string;
  lyrics: string;
  icon?: string; // Google Material Symbol name, e.g. 'music_note'
  createdAt: number;
}

export interface SpeechSettings {
  rate: number; // 語速 0.5 - 2.0
  pitch: number; // 音調 0.5 - 2.0
  voiceURI: string;
  pausePerSpaceMs: number; // 每個空白停頓的毫秒數 (預設約 300ms ~ 一個字的讀音長度)
}
