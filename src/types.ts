export interface Song {
  id: string;
  title: string;
  youtubeUrl: string;
  lyrics: string;
  icon?: string; // Google Material Symbol name, e.g. 'music_note'
  createdAt: number;
  shareCode?: string; // 最近產生的雲端分享代碼
  shareTime?: number; // 產生分享代碼的時間戳記
}

export interface SpeechSettings {
  rate: number; // 語速 0.5 - 2.0
  pitch: number; // 音調 0.5 - 2.0
  voiceURI: string;
  pausePerSpaceMs: number; // 每個空白停頓的毫秒數 (預設 160ms)
  pausePerNewlineMs: number; // 單換行停頓毫秒數 (預設 80ms)
  pausePerParagraphMs: number; // 換段（段落間）停頓毫秒數 (預設 500ms)
}
