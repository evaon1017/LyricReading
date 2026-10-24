import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import type { Song } from '../types';

// 使用者提供的 Firebase 設定
const firebaseConfig = {
  apiKey: "AIzaSyDDYmC0PhJB_FYKi6f6eA34yXewCrVA4Js",
  authDomain: "haha-lyric-reading.firebaseapp.com",
  projectId: "haha-lyric-reading",
  storageBucket: "haha-lyric-reading.firebasestorage.app",
  messagingSenderId: "354705462927",
  appId: "1:354705462927:web:dfdec66e25dc4bb78242fa",
  measurementId: "G-HHCZ4HLRB6"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLLECTION_NAME = 'shared_songs';

/**
 * 產生 6 碼大寫英數字分享碼 (排除容易混淆的 0, O, 1, I)
 */
export function generateShareCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export interface SharedData {
  format: 'HanaSong' | 'HanaSongs';
  createdAt: number;
  expiresAt: number; // 過期時間戳記
  song?: Song;
  songs?: Song[];
}

/**
 * 上傳歌曲至 Firestore 並返回短分享碼
 * @param data 欲分享的單曲或多曲
 * @param expireHours 有效小時數 (預設 24 小時)
 */
export async function uploadSongShare(
  data: { song?: Song; songs?: Song[] },
  expireHours = 24
): Promise<string> {
  const shareCode = generateShareCode();
  const now = Date.now();
  const expiresAt = now + expireHours * 3600 * 1000;

  const payload: SharedData = {
    format: data.songs ? 'HanaSongs' : 'HanaSong',
    createdAt: now,
    expiresAt,
    ...(data.song ? { song: data.song } : {}),
    ...(data.songs ? { songs: data.songs } : {})
  };

  const docRef = doc(db, COLLECTION_NAME, shareCode);
  await setDoc(docRef, payload);
  return shareCode;
}

/**
 * 透過短分享碼從 Firestore 獲取歌曲資料
 * @param code 6 碼英數代碼
 */
export async function fetchSongByCode(code: string): Promise<SharedData> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    throw new Error('請輸入分享代碼');
  }

  const docRef = doc(db, COLLECTION_NAME, cleanCode);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    throw new Error(`找不到分享代碼【${cleanCode}】，請確認代碼是否正確。`);
  }

  const data = snap.data() as SharedData;

  // 檢查是否已過期
  if (data.expiresAt && Date.now() > data.expiresAt) {
    throw new Error(`該分享代碼【${cleanCode}】已過期失效（超過24小時）。`);
  }

  return data;
}
