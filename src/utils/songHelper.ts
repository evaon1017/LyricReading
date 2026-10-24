import type { Song } from '../types';

const COOKIE_KEY = 'kid_songs_data';
const STORAGE_BACKUP_KEY = 'kid_songs_backup';

/**
 * 設置 Cookie
 * 支援 max-age (365天)，並做 encodeURIComponent
 */
export function setCookie(name: string, val: string, days = 365): void {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(val)}; expires=${expires}; path=/; SameSite=Lax`;
}

/**
 * 取得 Cookie
 */
export function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + encodeURIComponent(name) + '=([^;]+)'));
  if (match && match[2]) {
    try {
      return decodeURIComponent(match[2]);
    } catch {
      return match[2];
    }
  }
  return null;
}

/**
 * 儲存歌曲清單到 Cookie 與 LocalStorage
 * 注意：單一 Cookie 大小上限僅 4096 bytes，歌詞稍長即會被瀏覽器拒絕儲存！
 * 因此：
 * 1. localStorage 是最安全可靠的持久化主庫 (大小達 5MB ~ 10MB)。
 * 2. 同步將歌曲摘要/或能放得下的歌曲存入 Cookie。
 */
export function saveSongs(songs: Song[]): void {
  try {
    const jsonStr = JSON.stringify(songs);
    // 優先完整保存在 localStorage (避免瀏覽器在開發刷新或 Cookie 超過 4KB 默默丟棄歌曲)
    localStorage.setItem(STORAGE_BACKUP_KEY, jsonStr);

    // 儲存於 Cookie (若太大則僅保留前幾首或縮減版，以防 Cookie 寫入失敗)
    if (jsonStr.length < 3800) {
      setCookie(COOKIE_KEY, jsonStr);
    } else {
      // 僅把前 1~2 首或簡化資料放進 Cookie，標記使用 localStorage
      const compact = songs.map(s => ({
        id: s.id,
        title: s.title,
        youtubeUrl: s.youtubeUrl,
        icon: s.icon,
        lyrics: s.lyrics.slice(0, 100),
        createdAt: s.createdAt
      }));
      setCookie(COOKIE_KEY, JSON.stringify(compact));
    }
  } catch (e) {
    console.error('Failed to save songs:', e);
  }
}

/**
 * 載入歌曲清單
 * 優先從 localStorage 讀取完整資料（因為 Cookie 常因 4KB 上限遺失長歌詞），若無再讀 Cookie
 */
export function loadSongs(): Song[] {
  try {
    // 1. 優先從 localStorage 讀取完整資料
    const rawStorage = localStorage.getItem(STORAGE_BACKUP_KEY);
    if (rawStorage) {
      const parsed = JSON.parse(rawStorage);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }

    // 2. 次之從 Cookie 讀取
    const rawCookie = getCookie(COOKIE_KEY);
    if (rawCookie) {
      const parsed = JSON.parse(rawCookie);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load songs from cookie/storage:', e);
  }

  // 檢查是否使用者曾經清空過 (如果有標記過 initialized 就不會反覆塞預設值)
  if (localStorage.getItem('lyric_app_initialized') === 'true') {
    return [];
  }

  // 預設示範歌曲 (提供可愛童謠供首次使用體驗)
  const defaultSongs: Song[] = [
    {
      id: 'default-twinkle-star',
      title: '一閃一閃小星星 (Twinkle Twinkle Little Star)',
      youtubeUrl: 'https://www.youtube.com/watch?v=yCjJyiqpAuU',
      icon: 'star',
      lyrics: `一閃一閃亮晶晶  滿天都是小星星
掛在天上放光明  好像許多小眼睛

一閃一閃亮晶晶  滿天都是小星星
太陽慢慢落下去  白天已經過去了

一閃一閃亮晶晶  滿天都是小星星
黑夜悄悄來到了  星星對我眨眼睛`,
      createdAt: Date.now()
    },
    {
      id: 'default-two-tigers',
      title: '兩隻老虎 (Two Tigers)',
      youtubeUrl: 'https://www.youtube.com/watch?v=Vl0l0o6iCqM',
      icon: 'cruelty_free',
      lyrics: `兩隻老虎  兩隻老虎
跑得快  跑得快

一隻沒有耳朵  一隻沒有尾巴
真奇怪  真奇怪`,
      createdAt: Date.now() + 1
    }
  ];

  localStorage.setItem('lyric_app_initialized', 'true');
  saveSongs(defaultSongs);
  return defaultSongs;
}

/**
 * 從 YouTube URL 提取 Video ID
 */
export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

/**
 * 呼叫 YouTube oEmbed API 抓取影片標題
 */
export async function fetchYouTubeTitle(url: string): Promise<string> {
  const videoId = extractYouTubeId(url);
  if (!videoId) {
    throw new Error('請輸入有效的 YouTube 影片網址');
  }

  // 乾淨的標準網址請求 oEmbed
  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`;

  try {
    const res = await fetch(oEmbedUrl);
    if (!res.ok) {
      throw new Error(`無法取得影片資訊 (HTTP ${res.status})`);
    }
    const data = await res.json();
    return data.title || '未命名歌曲';
  } catch (err: any) {
    // 若因 CORS 限制或網路問題，降級為備用策略提示
    console.warn('Direct oEmbed failed, trying alternative/fallback:', err);
    return `YouTube 影片 (${videoId})`;
  }
}
