<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { Song, SpeechSettings } from './types';
import { loadSongs, saveSongs, extractYouTubeId, fetchYouTubeTitle, getYouTubeThumbnailUrl } from './utils/songHelper';
import { LyricSpeaker } from './utils/speechHelper';
import IconPickerModal from './components/IconPickerModal.vue';
import BatchExportModal from './components/BatchExportModal.vue';
import FetchSongModal from './components/FetchSongModal.vue';
import type { SharedData } from './utils/firebaseService';

const SPEECH_SETTINGS_KEY = 'kid_speech_settings';

// 段落可愛圖示列表，依序循環賦予段落童趣視覺標記
const PARAGRAPH_EMOJIS = ['🌟', '🎈', '🐰', '🌈', '🚀', '🐱', '👑', '🍭', '🌸', '🧸', '🌞', '🎨'];
function getParagraphEmoji(index: number): string {
  return PARAGRAPH_EMOJIS[index % PARAGRAPH_EMOJIS.length];
}

// 狀態管理
const songs = ref<Song[]>([]);
const currentSongId = ref<string>('');
const isEditing = ref<boolean>(false);
const showAddModal = ref<boolean>(false);
const showBatchExport = ref<boolean>(false);
const showFetchModal = ref<boolean>(false);
const showActionMenu = ref<boolean>(false);
const showParentMenu = ref<boolean>(false);
const showSongDrawer = ref<boolean>(false); // 行動裝置專屬：歌庫抽屜
const showPlayer = ref<boolean>(false);
const showSettings = ref<boolean>(false);
const isMobileView = ref<boolean>(typeof window !== 'undefined' ? window.innerWidth <= 1024 : false);

function onWindowResize() {
  isMobileView.value = window.innerWidth <= 1024;
}

// 語音設定儲存成功提示
const showSettingsSaved = ref<boolean>(false);

// 圖示挑選開窗狀態
const showIconPicker = ref<boolean>(false);
const iconPickerTarget = ref<'add' | 'edit'>('add');

// 拖曳排序狀態
const draggedSongIndex = ref<number | null>(null);
const dragOverSongIndex = ref<number | null>(null);

// 語音朗讀設定 (三段停頓拆分：空白、換行、換段)
const defaultSettings: SpeechSettings = {
  rate: 0.85, // 適合小朋友學唱的清晰語速
  pitch: 1.1, // 親切活潑音調
  voiceURI: '',
  pausePerSpaceMs: 160, // 空白停頓時間 (預設 160ms)
  pausePerNewlineMs: 80, // 單換行停頓時間 (預設 80ms)
  pausePerParagraphMs: 500 // 換段停頓時間 (預設 500ms)
};

function loadSpeechSettings(): SpeechSettings {
  try {
    const raw = localStorage.getItem(SPEECH_SETTINGS_KEY);
    if (raw) {
      return { ...defaultSettings, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Failed to load speech settings:', e);
  }
  return { ...defaultSettings };
}

function saveSpeechSettings() {
  try {
    localStorage.setItem(SPEECH_SETTINGS_KEY, JSON.stringify(speechSettings.value));
    showSettingsSaved.value = true;
    setTimeout(() => {
      showSettingsSaved.value = false;
    }, 2000);
  } catch (e) {
    console.error('Failed to save speech settings:', e);
  }
}

const speechSettings = ref<SpeechSettings>(loadSpeechSettings());
const availableVoices = ref<SpeechSynthesisVoice[]>([]);

// 播放朗讀狀態
const speaker = new LyricSpeaker();
const isPlaying = ref<boolean>(false);
const isSequentialPlaying = ref<boolean>(false);
const activeParagraphIndex = ref<number | null>(null); // 當前正在播放中的段落
const lastAttemptedParagraphIndex = ref<number | null>(null); // 最近一次點擊或嘗試播放的段落
const lastCompletedParagraphIndex = ref<number | null>(null); // 完整朗讀完畢的最後段落

// 編輯中的暫存資料
const editTitle = ref<string>('');
const editYoutubeUrl = ref<string>('');
const editLyrics = ref<string>('');
const editIcon = ref<string>('');

// 新增歌曲的表單資料
const newUrl = ref<string>('');
const newTitle = ref<string>('');
const newLyrics = ref<string>('');
const newIcon = ref<string>('');
const isFetchingTitle = ref<boolean>(false);
const fetchError = ref<string>('');

// 當前選中的歌曲
const currentSong = computed(() => {
  return songs.value.find((s) => s.id === currentSongId.value) || songs.value[0] || null;
});

// 當前歌曲的 YouTube 嵌入網址
const currentEmbedUrl = computed(() => {
  if (!currentSong.value) return '';
  const videoId = extractYouTubeId(currentSong.value.youtubeUrl);
  return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0` : '';
});

// 依據「兩個換行符號」將歌詞拆解為段落列表
const lyricParagraphs = computed(() => {
  if (!currentSong.value || !currentSong.value.lyrics) return [];
  return currentSong.value.lyrics
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
});

// 初始化載入
onMounted(() => {
  songs.value = loadSongs();
  if (songs.value.length > 0) {
    currentSongId.value = songs.value[0].id;
  }
  initVoices();
  onWindowResize();
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('click', onWindowClick);
});

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize);
  window.removeEventListener('click', onWindowClick);
});

function onWindowClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target || !target.closest('.action-dropdown')) {
    showActionMenu.value = false;
  }
  if (!target || !target.closest('.parent-dropdown')) {
    showParentMenu.value = false;
  }
}

// 監聽語音清單變更
function initVoices() {
  if ('speechSynthesis' in window) {
    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      availableVoices.value = voices;
      if (!speechSettings.value.voiceURI && voices.length > 0) {
        const preferred =
          voices.find((v) => v.lang.includes('zh-TW') || v.lang.includes('zh_TW')) ||
          voices.find((v) => v.lang.startsWith('zh')) ||
          voices[0];
        if (preferred) {
          speechSettings.value.voiceURI = preferred.voiceURI;
        }
      }
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }
}

// 切換歌曲
function selectSong(id: string) {
  if (isPlaying.value) {
    stopSpeaking();
  }
  currentSongId.value = id;
  isEditing.value = false;
  showActionMenu.value = false;
  showSongDrawer.value = false;
  activeParagraphIndex.value = null;
  lastAttemptedParagraphIndex.value = null;
  lastCompletedParagraphIndex.value = null;
}

// 平滑滾動到指定段落 (朗讀時方便小朋友眼睛跟著歌詞跑)
function scrollToParagraph(index: number) {
  setTimeout(() => {
    const el = document.getElementById(`para-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 60);
}

// 上下移動調整歌曲順序 (手機觸控特別方便)
function moveSong(index: number, direction: 'up' | 'down') {
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= songs.value.length) return;
  const item = songs.value.splice(index, 1)[0];
  songs.value.splice(targetIndex, 0, item);
  saveSongs(songs.value);
}

// 自動抓取 YouTube 標題
async function onUrlInputBlur() {
  if (!newUrl.value.trim()) return;
  isFetchingTitle.value = true;
  fetchError.value = '';
  try {
    const title = await fetchYouTubeTitle(newUrl.value.trim());
    if (title && !newTitle.value) {
      newTitle.value = title;
    }
  } catch (err: any) {
    fetchError.value = err.message || '抓取標題失敗，請手動填寫';
  } finally {
    isFetchingTitle.value = false;
  }
}

// 圖示挑選開窗
function openIconPicker(target: 'add' | 'edit') {
  iconPickerTarget.value = target;
  showIconPicker.value = true;
}

function handleIconSelected(iconName: string) {
  if (iconPickerTarget.value === 'add') {
    newIcon.value = iconName;
  } else {
    editIcon.value = iconName;
  }
}

// 提交新增歌曲
function handleAddSong() {
  if (!newTitle.value.trim()) {
    alert('請輸入歌曲標題');
    return;
  }
  if (!newLyrics.value.trim()) {
    alert('請提供歌詞文字');
    return;
  }

  const newSong: Song = {
    id: 'song-' + Date.now(),
    title: newTitle.value.trim(),
    youtubeUrl: newUrl.value.trim(),
    lyrics: newLyrics.value.trim(),
    icon: newIcon.value.trim() || undefined,
    createdAt: Date.now()
  };

  songs.value.unshift(newSong);
  saveSongs(songs.value);
  currentSongId.value = newSong.id;

  newUrl.value = '';
  newTitle.value = '';
  newLyrics.value = '';
  newIcon.value = '';
  fetchError.value = '';
  showAddModal.value = false;
  isEditing.value = false;
}

// 編輯功能
function startEditing() {
  if (!currentSong.value) return;
  editTitle.value = currentSong.value.title;
  editYoutubeUrl.value = currentSong.value.youtubeUrl;
  editLyrics.value = currentSong.value.lyrics;
  editIcon.value = currentSong.value.icon || '';
  isEditing.value = true;
  showActionMenu.value = false;
}

function saveEditing() {
  if (!currentSong.value) return;
  currentSong.value.title = editTitle.value.trim() || '未命名歌曲';
  currentSong.value.youtubeUrl = editYoutubeUrl.value.trim();
  currentSong.value.lyrics = editLyrics.value.trim();
  currentSong.value.icon = editIcon.value.trim() || undefined;
  saveSongs(songs.value);
  isEditing.value = false;
}

function cancelEditing() {
  isEditing.value = false;
}

function handleDropdownEdit() {
  showActionMenu.value = false;
  startEditing();
}

function handleDropdownDelete() {
  showActionMenu.value = false;
  deleteCurrentSong();
}

function isSongIdentical(
  a: { title: string; lyrics: string; icon?: string; youtubeUrl?: string },
  b: { title: string; lyrics: string; icon?: string; youtubeUrl?: string }
): boolean {
  return (
    a.title.trim() === b.title.trim() &&
    a.lyrics.trim() === b.lyrics.trim() &&
    (a.icon?.trim() || '') === (b.icon?.trim() || '') &&
    (a.youtubeUrl?.trim() || '') === (b.youtubeUrl?.trim() || '')
  );
}

function getUniqueTitle(rawTitle: string, existingTitles: Set<string>): string {
  const title = rawTitle.trim() || '未命名歌曲';
  if (!existingTitles.has(title)) {
    existingTitles.add(title);
    return title;
  }
  const match = title.match(/^(.*?)-(\d+)$/);
  const base = match ? match[1] : title;
  let counter = match ? parseInt(match[2], 10) + 1 : 1;
  while (existingTitles.has(`${base}-${counter}`)) {
    counter++;
  }
  const unique = `${base}-${counter}`;
  existingTitles.add(unique);
  return unique;
}

function handleCloudImportSuccess(data: SharedData) {
  const incomingList: Song[] = [];
  if (data.format === 'HanaSongs' && Array.isArray(data.songs)) {
    incomingList.push(...data.songs);
  } else if (data.song) {
    incomingList.push(data.song);
  }

  if (incomingList.length === 0) {
    alert('⚠️ 該分享代碼內未包含任何歌曲！');
    return;
  }

  const existingTitles = new Set<string>(songs.value.map((s) => s.title.trim()));
  const acceptedSongs: Song[] = [];
  let skippedCount = 0;

  for (const raw of incomingList) {
    const candidate = {
      title: (raw.title || '未命名歌曲').trim(),
      youtubeUrl: (raw.youtubeUrl || '').trim(),
      lyrics: (raw.lyrics || '').trim(),
      icon: (raw.icon || '').trim() || undefined
    };

    const isDuplicate =
      songs.value.some((existing) => isSongIdentical(existing, candidate)) ||
      acceptedSongs.some((accepted) => isSongIdentical(accepted, candidate));

    if (isDuplicate) {
      skippedCount++;
      continue;
    }

    const uniqueTitle = getUniqueTitle(candidate.title, existingTitles);
    const newSong: Song = {
      id: 'song-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      title: uniqueTitle,
      youtubeUrl: candidate.youtubeUrl,
      lyrics: candidate.lyrics,
      icon: candidate.icon,
      createdAt: Date.now()
    };
    acceptedSongs.push(newSong);
  }

  if (acceptedSongs.length > 0) {
    songs.value.unshift(...acceptedSongs);
    saveSongs(songs.value);
    currentSongId.value = acceptedSongs[0].id;
  }

  if (acceptedSongs.length === 0 && skippedCount > 0) {
    alert(`ℹ️ 匯入的 ${skippedCount} 首歌曲皆已存在且內容完全相同，已為您自動略過。`);
  } else if (skippedCount > 0) {
    alert(`🎉 成功匯入 ${acceptedSongs.length} 首歌曲！（已自動略過 ${skippedCount} 首完全重複歌曲）`);
  } else {
    alert(`🎉 成功從雲端同步匯入 ${acceptedSongs.length} 首歌曲！`);
  }
}

function deleteCurrentSong() {
  if (!currentSong.value) return;
  const confirmed = window.confirm(`⚠️ 確定要刪除歌曲《${currentSong.value.title}》嗎？\n刪除後將無法恢復！`);
  if (!confirmed) return;

  const idx = songs.value.findIndex((s) => s.id === currentSong.value!.id);
  if (idx !== -1) {
    songs.value.splice(idx, 1);
    saveSongs(songs.value);
    currentSongId.value = songs.value[0]?.id || '';
    stopSpeaking();
  }
}

// 拖曳排序
function onDragStart(index: number, event: DragEvent) {
  draggedSongIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', index.toString());
  }
}

function onDragOver(index: number, event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  dragOverSongIndex.value = index;
}

function onDragLeave() {
  dragOverSongIndex.value = null;
}

function onDrop(targetIndex: number) {
  if (draggedSongIndex.value === null || draggedSongIndex.value === targetIndex) {
    draggedSongIndex.value = null;
    dragOverSongIndex.value = null;
    return;
  }
  const itemToMove = songs.value.splice(draggedSongIndex.value, 1)[0];
  songs.value.splice(targetIndex, 0, itemToMove);
  saveSongs(songs.value);
  draggedSongIndex.value = null;
  dragOverSongIndex.value = null;
}

function onDragEnd() {
  draggedSongIndex.value = null;
  dragOverSongIndex.value = null;
}

// 停止朗讀
function stopSpeaking() {
  speaker.stop();
  isPlaying.value = false;
  isSequentialPlaying.value = false;
  activeParagraphIndex.value = null;
}

// 朗讀單一段落
async function playParagraph(index: number) {
  if (isPlaying.value && activeParagraphIndex.value === index) {
    stopSpeaking();
    return;
  }

  stopSpeaking();
  isPlaying.value = true;
  isSequentialPlaying.value = false;
  activeParagraphIndex.value = index;
  lastAttemptedParagraphIndex.value = index;
  scrollToParagraph(index);

  const paragraphText = lyricParagraphs.value[index];
  if (!paragraphText) {
    stopSpeaking();
    return;
  }

  const finished = await speaker.speakParagraph(paragraphText, speechSettings.value);
  if (finished && activeParagraphIndex.value === index) {
    lastCompletedParagraphIndex.value = index;
    isPlaying.value = false;
    activeParagraphIndex.value = null;
  }
}

// 接續播放到底
async function playAllSequentially() {
  if (isPlaying.value && isSequentialPlaying.value) {
    stopSpeaking();
    return;
  }

  const paragraphs = lyricParagraphs.value;
  if (paragraphs.length === 0) return;

  let startIndex = 0;
  if (isPlaying.value && activeParagraphIndex.value !== null) {
    startIndex = activeParagraphIndex.value;
  } else if (lastAttemptedParagraphIndex.value !== null) {
    const attemptIdx = lastAttemptedParagraphIndex.value;
    const isAttemptCompleted = (lastCompletedParagraphIndex.value === attemptIdx);

    if (isAttemptCompleted) {
      if (attemptIdx >= paragraphs.length - 1) {
        startIndex = 0;
      } else {
        startIndex = attemptIdx + 1;
      }
    } else {
      startIndex = attemptIdx;
    }
  } else {
    startIndex = 0;
  }

  stopSpeaking();
  isPlaying.value = true;
  isSequentialPlaying.value = true;

  for (let i = startIndex; i < paragraphs.length; i++) {
    if (!isPlaying.value || !isSequentialPlaying.value) break;

    activeParagraphIndex.value = i;
    lastAttemptedParagraphIndex.value = i;
    scrollToParagraph(i);

    const finished = await speaker.speakParagraph(paragraphs[i], speechSettings.value);
    if (!finished) break;

    lastCompletedParagraphIndex.value = i;

    if (i < paragraphs.length - 1 && isPlaying.value) {
      const pDelay = speechSettings.value.pausePerParagraphMs ?? 500;
      await new Promise((r) => setTimeout(r, pDelay));
    }
  }

  isPlaying.value = false;
  isSequentialPlaying.value = false;
  activeParagraphIndex.value = null;
}
</script>

<template>
  <div class="app-container">
    <!-- 頂部歡樂導航列 -->
    <header class="app-header">
      <div class="header-left">
        <div class="header-brand" @click="showSongDrawer = false">
          <span class="brand-mascot">🎵</span>
          <div class="brand-titles">
            <h1 class="app-title">寶貝學唱歌</h1>
            <span class="app-tagline">歌詞朗讀 ‧ 快樂練唱</span>
          </div>
        </div>
      </div>

      <!-- 右側家長管理與快捷動作 -->
      <div class="header-actions">
        <!-- 行動版：查看全部歌單按鈕 -->
        <button
          class="btn btn-pill btn-song-drawer-trigger"
          @click="showSongDrawer = !showSongDrawer"
          title="開啟完整歌單"
        >
          <span class="material-symbols-outlined">queue_music</span>
          <span class="btn-text">歌單 ({{ songs.length }})</span>
        </button>

        <!-- 收折的「家長專區」下拉選單，避免孩子誤點大人功能 -->
        <div class="parent-dropdown">
          <button
            class="btn btn-pill btn-parent-toggle"
            @click.stop="showParentMenu = !showParentMenu"
            title="家長專區與管理"
          >
            <span class="material-symbols-outlined">family_restroom</span>
            <span class="parent-label">家長專區</span>
            <span class="material-symbols-outlined dropdown-arrow">
              {{ showParentMenu ? 'arrow_drop_up' : 'arrow_drop_down' }}
            </span>
          </button>

          <div v-if="showParentMenu" class="parent-menu-sheet" @click.stop>
            <div class="menu-title">👨‍👩‍👧 家長專區管理</div>
            <button class="menu-item" @click="showAddModal = true; showParentMenu = false">
              <span class="material-symbols-outlined menu-icon text-indigo">add_circle</span>
              <div class="menu-item-text">
                <strong>新增歌曲</strong>
                <small>輸入 YouTube 與歌詞</small>
              </div>
            </button>
            <button class="menu-item" @click="showSettings = !showSettings; showParentMenu = false">
              <span class="material-symbols-outlined menu-icon text-amber">tune</span>
              <div class="menu-item-text">
                <strong>語音與節奏設定</strong>
                <small>調整語速與停頓時間</small>
              </div>
            </button>
            <button class="menu-item" @click="showFetchModal = true; showParentMenu = false">
              <span class="material-symbols-outlined menu-icon text-emerald">cloud_download</span>
              <div class="menu-item-text">
                <strong>雲端代碼取歌</strong>
                <small>輸入 6 碼匯入新歌曲</small>
              </div>
            </button>
            <button class="menu-item" @click="showBatchExport = true; showParentMenu = false">
              <span class="material-symbols-outlined menu-icon text-blue">cloud_upload</span>
              <div class="menu-item-text">
                <strong>批次匯出分享</strong>
                <small>打包歌曲上傳產生代碼</small>
              </div>
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- 語音設定滑出面板 -->
    <div v-if="showSettings" class="settings-drawer">
      <div class="settings-drawer-inner">
        <div class="settings-header">
          <div class="drawer-title">
            <span class="material-symbols-outlined title-icon">settings_voice</span>
            <h3>語音朗讀與停頓節奏設定</h3>
          </div>
          <div class="settings-header-actions">
            <span v-if="showSettingsSaved" class="saved-badge">✓ 設定已儲存！</span>
            <button class="btn btn-primary btn-sm" @click="saveSpeechSettings">
              <span class="material-symbols-outlined">save</span>
              儲存設定
            </button>
            <button class="btn-icon" @click="showSettings = false">✕</button>
          </div>
        </div>

        <div class="settings-body">
          <div class="form-group">
            <label>朗讀語音 (Voice)：</label>
            <select v-model="speechSettings.voiceURI" class="form-control">
              <option v-for="v in availableVoices" :key="v.voiceURI" :value="v.voiceURI">
                {{ v.name }} ({{ v.lang }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <div class="label-with-val">
              <label>語速 (Speed)：</label>
              <span class="badge">{{ speechSettings.rate }}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              v-model.number="speechSettings.rate"
              class="range-slider"
            />
            <small class="tip">清晰明快的語速最適合 5~6 歲小朋友發音跟讀。</small>
          </div>
          <div class="form-group">
            <div class="label-with-val">
              <label>1. 空白停頓時間 (每 1 個空格)：</label>
              <span class="badge">{{ speechSettings.pausePerSpaceMs }} ms</span>
            </div>
            <input
              type="range"
              min="20"
              max="500"
              step="10"
              v-model.number="speechSettings.pausePerSpaceMs"
              class="range-slider"
            />
            <small class="tip">連續兩個空格會停頓 {{ speechSettings.pausePerSpaceMs * 2 }} ms，幫助孩子抓準節奏！</small>
          </div>
          <div class="form-group">
            <div class="label-with-val">
              <label>2. 換行停頓時間 (歌詞單行換行)：</label>
              <span class="badge">{{ speechSettings.pausePerNewlineMs }} ms</span>
            </div>
            <input
              type="range"
              min="0"
              max="500"
              step="10"
              v-model.number="speechSettings.pausePerNewlineMs"
              class="range-slider"
            />
            <small class="tip">換行處預留呼吸換氣的節奏時間。</small>
          </div>
          <div class="form-group">
            <div class="label-with-val">
              <label>3. 換段停頓時間 (接續播放段落間隔)：</label>
              <span class="badge">{{ speechSettings.pausePerParagraphMs }} ms</span>
            </div>
            <input
              type="range"
              min="100"
              max="1500"
              step="50"
              v-model.number="speechSettings.pausePerParagraphMs"
              class="range-slider"
            />
            <small class="tip">整段念完與下一段開始前的準備時間。</small>
          </div>
        </div>
      </div>
    </div>

    <!-- 主要工作區 (PC 雙欄 / 手機單欄) -->
    <div class="main-layout">
      <!-- 左側歌曲庫 (桌面版顯示，含拖曳與上下排序按鈕) -->
      <aside class="desktop-sidebar">
        <div class="sidebar-header">
          <div class="sidebar-title-row">
            <h2>🎶 歡樂歌庫</h2>
            <span class="song-count-pill">{{ songs.length }} 首</span>
          </div>
          <span class="drag-hint">↕ 拖曳或按上下箭頭可調整順序</span>
        </div>

        <div class="desktop-song-list">
          <div
            v-for="(song, sIdx) in songs"
            :key="song.id"
            :class="[
              'song-item-card',
              {
                active: song.id === currentSongId,
                'drag-over': dragOverSongIndex === sIdx,
                'is-dragging': draggedSongIndex === sIdx
              }
            ]"
            draggable="true"
            @dragstart="onDragStart(sIdx, $event)"
            @dragover="onDragOver(sIdx, $event)"
            @dragleave="onDragLeave"
            @drop="onDrop(sIdx)"
            @dragend="onDragEnd"
            @click="selectSong(song.id)"
          >
            <!-- 拖曳把手 -->
            <span class="material-symbols-outlined drag-handle" title="按住可拖曳排序">drag_indicator</span>

            <!-- 歌曲圖示 / 縮圖 -->
            <div
              class="song-item-thumb-box"
              :class="{ 'is-thumb': !song.icon && getYouTubeThumbnailUrl(song.youtubeUrl) }"
            >
              <img
                v-if="!song.icon && getYouTubeThumbnailUrl(song.youtubeUrl)"
                :src="getYouTubeThumbnailUrl(song.youtubeUrl)!"
                class="thumb-img"
                alt=""
                loading="lazy"
              />
              <span v-else class="material-symbols-outlined item-icon">
                {{ song.icon || 'music_note' }}
              </span>
            </div>

            <!-- 標題與標籤 -->
            <div class="song-item-meta">
              <div class="song-name">{{ song.title }}</div>
              <div class="song-sub-info" v-if="song.youtubeUrl">
                <span class="yt-pill">YouTube</span>
              </div>
            </div>

            <!-- 排序輔助按鈕 (方便小孩或觸控螢幕精準點擊) -->
            <div class="reorder-actions" @click.stop>
              <button
                class="btn-arrow"
                :disabled="sIdx === 0"
                @click="moveSong(sIdx, 'up')"
                title="向上移動"
              >
                ▲
              </button>
              <button
                class="btn-arrow"
                :disabled="sIdx === songs.length - 1"
                @click="moveSong(sIdx, 'down')"
                title="向下移動"
              >
                ▼
              </button>
            </div>
          </div>

          <div v-if="songs.length === 0" class="empty-song-box">
            <span class="material-symbols-outlined empty-icon-sm">queue_music</span>
            <p>目前還沒有歌曲，點擊右上角「➕ 新增歌曲」開始加入吧！</p>
          </div>
        </div>
      </aside>

      <!-- 右側 (主要練唱與歌詞舞台) -->
      <main class="reading-stage" v-if="currentSong">
        <!-- 歌曲頭部資訊卡片 -->
        <div class="song-hero-card">
          <div class="hero-header-row">
            <div class="hero-identity">
              <div
                class="hero-icon-box"
                :class="{ 'has-thumb': !currentSong.icon && getYouTubeThumbnailUrl(currentSong.youtubeUrl) }"
              >
                <img
                  v-if="!currentSong.icon && getYouTubeThumbnailUrl(currentSong.youtubeUrl)"
                  :src="getYouTubeThumbnailUrl(currentSong.youtubeUrl)!"
                  class="hero-thumb-img"
                  alt=""
                />
                <span v-else class="material-symbols-outlined hero-icon">
                  {{ currentSong.icon || 'music_note' }}
                </span>
              </div>
              <div class="hero-titles">
                <div class="hero-tag">🎵 正在練習歌曲</div>
                <h2 class="hero-song-title">{{ currentSong.title }}</h2>
              </div>
            </div>

            <!-- 歌曲管理操作區 -->
            <div class="hero-action-buttons">
              <!-- YouTube 展開/收起按鈕 (僅桌面版顯示；行動版固定打開影片) -->
              <button
                v-if="currentEmbedUrl && !isMobileView"
                class="btn btn-pill btn-video-toggle"
                @click="showPlayer = !showPlayer"
              >
                <span class="material-symbols-outlined">
                  {{ showPlayer ? 'visibility_off' : 'smart_display' }}
                </span>
                <span>{{ showPlayer ? '收起影片' : '觀看影片' }}</span>
              </button>

              <!-- 編輯狀態 -->
              <template v-if="isEditing">
                <button class="btn btn-pill btn-success" @click="saveEditing">
                  <span class="material-symbols-outlined">save</span>
                  儲存修改
                </button>
                <button class="btn btn-pill btn-ghost" @click="cancelEditing">
                  取消
                </button>
              </template>

              <!-- 非編輯狀態：大人管理功能折疊 -->
              <div v-else class="action-dropdown">
                <button
                  class="btn btn-pill btn-outline-manage"
                  @click.stop="showActionMenu = !showActionMenu"
                  title="歌曲管理選項"
                >
                  <span class="material-symbols-outlined">more_horiz</span>
                  <span>管理</span>
                </button>

                <div v-if="showActionMenu" class="dropdown-menu" @click.stop>
                  <button class="dropdown-item" @click="handleDropdownEdit">
                    <span class="material-symbols-outlined text-indigo">edit</span>
                    <span>編輯歌詞與設定</span>
                  </button>
                  <div class="dropdown-divider"></div>
                  <button class="dropdown-item text-danger" @click="handleDropdownDelete">
                    <span class="material-symbols-outlined">delete</span>
                    <span>刪除此首歌曲</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- YouTube 嵌入影片區 (響應式 16:9；行動版固定打開) -->
          <div v-if="(isMobileView || showPlayer) && currentEmbedUrl" class="video-container">
            <iframe
              :src="currentEmbedUrl"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>
          </div>

          <!-- 幼童友善：巨型主控朗讀列 (超大按鈕、清晰提示) -->
          <div v-if="!isEditing" class="giant-kid-controller">
            <div class="primary-controls">
              <!-- 大綠/大橘 按鈕：接續念到底 -->
              <button
                :class="['btn', 'btn-giant-play', isSequentialPlaying ? 'is-playing' : 'is-ready']"
                @click="playAllSequentially"
              >
                <span class="material-symbols-outlined giant-icon">
                  {{ isSequentialPlaying ? 'pause_circle' : 'play_circle' }}
                </span>
                <span class="giant-text">
                  {{ isSequentialPlaying ? '暫停接續念' : '▶ 接續念到底' }}
                </span>
              </button>

              <!-- 停止朗讀大按鈕 (播放中時顯現) -->
              <button v-if="isPlaying" class="btn btn-giant-stop" @click="stopSpeaking">
                <span class="material-symbols-outlined">stop_circle</span>
                <span>停止</span>
              </button>
            </div>

            <!-- 小朋友友善進度氣泡 -->
            <div class="kid-status-bubble" v-if="activeParagraphIndex !== null">
              <span class="pulse-sparkle">🎵</span>
              <span>正在念第 <strong>{{ activeParagraphIndex + 1 }}</strong> 段 (共 {{ lyricParagraphs.length }} 段) ～ 跟著大聲念！</span>
            </div>
            <div class="kid-status-bubble muted" v-else-if="lastAttemptedParagraphIndex !== null">
              <span v-if="lastCompletedParagraphIndex === lastAttemptedParagraphIndex">
                🌟 太棒了！已完整念完第 <strong>{{ lastCompletedParagraphIndex + 1 }}</strong> 段 (按接續播放將從下一段開始)
              </span>
              <span v-else>
                ⏸️ 剛才念到第 <strong>{{ lastAttemptedParagraphIndex + 1 }}</strong> 段 (按接續播放將重播這段)
              </span>
            </div>
            <div class="kid-status-bubble initial" v-else>
              <span>🐰 點選「接續念到底」或下方任一段落，一起快樂學唱歌！</span>
            </div>
          </div>
        </div>

        <!-- 編輯模式表單 -->
        <div v-if="isEditing" class="edit-card">
          <div class="edit-hint-banner">
            💡 <strong>歌詞小秘訣：</strong>每一段之間請按兩次 Enter (<strong>空一行</strong>) 分開。歌詞字與字之間加「<strong>空格</strong>」會自動產生節奏停頓喔！
          </div>

          <!-- 圖示設定 -->
          <div class="form-group">
            <label>歌曲可愛圖示 (選填，未設定時自動使用 YouTube 縮圖)：</label>
            <div class="icon-selector-field">
              <div class="selected-icon-preview">
                <span v-if="editIcon" class="material-symbols-outlined">{{ editIcon }}</span>
                <img
                  v-else-if="getYouTubeThumbnailUrl(editYoutubeUrl)"
                  :src="getYouTubeThumbnailUrl(editYoutubeUrl)!"
                  class="preview-thumb-img"
                  alt="YouTube 縮圖"
                />
                <span v-else class="material-symbols-outlined placeholder-icon">smart_display</span>
              </div>
              <div class="icon-field-actions">
                <button type="button" class="btn btn-secondary btn-pill" @click="openIconPicker('edit')">
                  <span class="material-symbols-outlined">image_search</span>
                  {{ editIcon ? '更換圖示' : '挑選圖示' }}
                </button>
                <button
                  v-if="editIcon"
                  type="button"
                  class="btn btn-ghost btn-pill text-danger"
                  @click="editIcon = ''"
                >
                  <span class="material-symbols-outlined">clear</span>
                  清除圖示 (使用 YouTube 縮圖)
                </button>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>歌曲標題：</label>
            <input v-model="editTitle" type="text" class="form-control" />
          </div>

          <div class="form-group">
            <label>YouTube 影片網址：</label>
            <input v-model="editYoutubeUrl" type="text" class="form-control" />
          </div>

          <div class="form-group">
            <label>歌詞內容：</label>
            <textarea
              v-model="editLyrics"
              rows="10"
              class="form-control lyrics-textarea"
              placeholder="輸入或貼上歌詞..."
            ></textarea>
          </div>
        </div>

        <!-- 歌詞檢視模式：幼童友善段落大卡片 -->
        <div v-else class="lyrics-card-list">
          <div
            v-for="(para, pIdx) in lyricParagraphs"
            :id="`para-${pIdx}`"
            :key="pIdx"
            :class="[
              'kid-paragraph-box',
              {
                'is-active': activeParagraphIndex === pIdx,
                'is-last-played': lastAttemptedParagraphIndex === pIdx && activeParagraphIndex !== pIdx
              }
            ]"
          >
            <!-- 卡片頂部欄：段落標籤與大按鈕 -->
            <div class="para-card-header">
              <div class="para-badge-wrap">
                <span class="para-emoji">{{ getParagraphEmoji(pIdx) }}</span>
                <span class="para-title-text">第 {{ pIdx + 1 }} 段</span>
              </div>

              <!-- 單段朗讀按鈕 (超大點擊範圍) -->
              <button
                :class="[
                  'btn',
                  'btn-pill',
                  'btn-para-play',
                  { 'is-reading': activeParagraphIndex === pIdx }
                ]"
                @click="playParagraph(pIdx)"
                :title="activeParagraphIndex === pIdx ? '暫停朗讀' : '播放此段落'"
              >
                <span class="material-symbols-outlined">
                  {{ activeParagraphIndex === pIdx ? 'pause_circle' : 'play_arrow' }}
                </span>
                <span>{{ activeParagraphIndex === pIdx ? '暫停' : '念這段' }}</span>
              </button>
            </div>

            <!-- 歌詞內文 (大字體、寬行高、易辨識) -->
            <div class="para-card-body">
              <div class="lyrics-text">
                <template v-for="(line, lIdx) in para.split('\n')" :key="lIdx">
                  <div class="lyric-line">{{ line }}</div>
                </template>
              </div>

              <!-- 播放動態提示 -->
              <div class="para-indicator" v-if="activeParagraphIndex === pIdx">
                <div class="kid-sound-wave">
                  <span></span><span></span><span></span><span></span><span></span>
                </div>
                <span class="indicator-text">🎵 正在朗讀這一段... 大聲跟著唱！</span>
              </div>
              <div class="para-indicator completed" v-else-if="lastCompletedParagraphIndex === pIdx">
                <span class="indicator-icon">🌟</span>
                <span class="indicator-text">太棒了！這一段已經念完囉</span>
              </div>
            </div>
          </div>

          <div v-if="lyricParagraphs.length === 0" class="no-lyrics-card">
            <span class="material-symbols-outlined no-lyrics-icon">edit_note</span>
            <h3>這首歌還沒有輸入歌詞喔！</h3>
            <p>點選右上角「管理」➜「編輯歌詞」，貼入歌詞即可開始練習。</p>
          </div>
        </div>
      </main>

      <!-- 空白歌單提示 -->
      <main class="reading-stage empty-stage" v-else>
        <div class="empty-welcome-card">
          <span class="welcome-mascot">🎉</span>
          <h2>歡迎來到寶貝學唱歌！</h2>
          <p>請點選右上角「➕ 新增歌曲」，貼上 YouTube 影片網址與歌詞，讓朗讀助手陪伴孩子快樂學唱歌！</p>
          <button class="btn btn-pill btn-primary-bounce btn-lg" @click="showAddModal = true">
            <span class="material-symbols-outlined">add_circle</span>
            立即新增第一首歌曲
          </button>
        </div>
      </main>
    </div>

    <!-- 行動/平板專屬：底部常駐朗讀迷你播放列 (當滾動到下方時隨時可暫停或播放) -->
    <div
      v-if="currentSong && !isEditing && lyricParagraphs.length > 0"
      class="mobile-bottom-dock"
    >
      <div class="dock-inner">
        <div class="dock-info">
          <span class="dock-title">{{ currentSong.title }}</span>
          <span class="dock-status" v-if="activeParagraphIndex !== null">
            🎵 朗讀第 {{ activeParagraphIndex + 1 }} 段中
          </span>
          <span class="dock-status" v-else>
            {{ isSequentialPlaying ? '準備中' : '隨時可播放' }}
          </span>
        </div>
        <div class="dock-controls">
          <button
            :class="['btn', 'btn-dock-play', isSequentialPlaying ? 'btn-playing' : 'btn-accent']"
            @click="playAllSequentially"
          >
            <span class="material-symbols-outlined">
              {{ isSequentialPlaying ? 'pause' : 'play_arrow' }}
            </span>
            <span>{{ isSequentialPlaying ? '暫停' : '接續念' }}</span>
          </button>
          <button v-if="isPlaying" class="btn btn-dock-stop" @click="stopSpeaking">
            <span class="material-symbols-outlined">stop</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 行動版：歌庫抽屜 Modal (Bottom Sheet / Full Drawer) -->
    <div v-if="showSongDrawer" class="drawer-overlay" @click.self="showSongDrawer = false">
      <div class="drawer-sheet">
        <div class="drawer-sheet-header">
          <div class="sheet-title-row">
            <span class="material-symbols-outlined sheet-icon">queue_music</span>
            <h3>全部歌曲庫 ({{ songs.length }})</h3>
          </div>
          <button class="btn-icon" @click="showSongDrawer = false">✕</button>
        </div>
        <div class="drawer-sheet-body">
          <div
            v-for="(song, sIdx) in songs"
            :key="song.id"
            :class="['sheet-song-item', { active: song.id === currentSongId }]"
            @click="selectSong(song.id)"
          >
            <div class="sheet-thumb-box">
              <img
                v-if="!song.icon && getYouTubeThumbnailUrl(song.youtubeUrl)"
                :src="getYouTubeThumbnailUrl(song.youtubeUrl)!"
                class="sheet-thumb-img"
                alt=""
              />
              <span v-else class="material-symbols-outlined sheet-item-icon">
                {{ song.icon || 'music_note' }}
              </span>
            </div>
            <div class="sheet-song-meta">
              <div class="sheet-song-title">{{ song.title }}</div>
              <span v-if="song.id === currentSongId" class="sheet-current-badge">正在朗讀</span>
            </div>
            <div class="sheet-reorder-buttons" @click.stop>
              <button
                class="btn-sheet-arrow"
                :disabled="sIdx === 0"
                @click="moveSong(sIdx, 'up')"
                title="上移"
              >
                ▲
              </button>
              <button
                class="btn-sheet-arrow"
                :disabled="sIdx === songs.length - 1"
                @click="moveSong(sIdx, 'down')"
                title="下移"
              >
                ▼
              </button>
            </div>
          </div>
        </div>
        <div class="drawer-sheet-footer">
          <button class="btn btn-pill btn-primary-bounce btn-block" @click="showAddModal = true; showSongDrawer = false">
            <span class="material-symbols-outlined">add_circle</span>
            新增一首新歌曲
          </button>
        </div>
      </div>
    </div>

    <!-- 新增歌曲彈窗 (Modal) -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <div class="title-wrap">
            <span class="material-symbols-outlined header-icon text-indigo">library_music</span>
            <h3>新增學唱歌曲</h3>
          </div>
          <button class="btn-icon" @click="showAddModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>YouTube 影片網址：</label>
            <div class="input-with-button">
              <input
                v-model="newUrl"
                @blur="onUrlInputBlur"
                type="text"
                class="form-control"
                placeholder="例如：https://www.youtube.com/watch?v=..."
              />
              <button
                class="btn btn-pill btn-secondary"
                :disabled="isFetchingTitle || !newUrl"
                @click="onUrlInputBlur"
              >
                <span class="material-symbols-outlined">travel_explore</span>
                {{ isFetchingTitle ? '抓取中...' : '抓取標題' }}
              </button>
            </div>
            <small v-if="fetchError" class="error-tip">{{ fetchError }}</small>
            <small v-else class="tip">貼入網址後點擊「抓取標題」，系統將自動取得 YouTube 標題與封面！</small>
          </div>

          <!-- 圖示設定 -->
          <div class="form-group">
            <label>歌曲專屬圖示 (選填，未設定時自動使用 YouTube 縮圖)：</label>
            <div class="icon-selector-field">
              <div class="selected-icon-preview">
                <span v-if="newIcon" class="material-symbols-outlined">{{ newIcon }}</span>
                <img
                  v-else-if="getYouTubeThumbnailUrl(newUrl)"
                  :src="getYouTubeThumbnailUrl(newUrl)!"
                  class="preview-thumb-img"
                  alt="YouTube 縮圖"
                />
                <span v-else class="material-symbols-outlined placeholder-icon">smart_display</span>
              </div>
              <div class="icon-field-actions">
                <button type="button" class="btn btn-pill btn-secondary" @click="openIconPicker('add')">
                  <span class="material-symbols-outlined">image_search</span>
                  {{ newIcon ? '更換圖示' : '挑選圖示' }}
                </button>
                <button
                  v-if="newIcon"
                  type="button"
                  class="btn btn-pill btn-ghost text-danger"
                  @click="newIcon = ''"
                >
                  <span class="material-symbols-outlined">clear</span>
                  清除 (使用 YouTube 縮圖)
                </button>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>歌曲標題：</label>
            <input
              v-model="newTitle"
              type="text"
              class="form-control"
              placeholder="例如：一閃一閃亮晶晶"
            />
          </div>

          <div class="form-group">
            <label>歌詞內容：</label>
            <div class="tip-box">
              ⭐ <strong>段落規則：</strong>請在段落之間輸入「<strong>兩個換行 (空一行)</strong>」。<br />
              ⭐ <strong>停頓節奏：</strong>歌詞字詞之間加「<strong>空白</strong>」，系統會自動停頓相應的時間！
            </div>
            <textarea
              v-model="newLyrics"
              rows="7"
              class="form-control lyrics-textarea"
              placeholder="請貼入您準備的多行歌詞..."
            ></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-pill btn-ghost" @click="showAddModal = false">取消</button>
          <button class="btn btn-pill btn-primary-bounce" @click="handleAddSong">確定新增</button>
        </div>
      </div>
    </div>

    <!-- 批次匯出歌曲彈窗 -->
    <BatchExportModal
      :show="showBatchExport"
      :songs="songs"
      @close="showBatchExport = false"
    />

    <!-- 雲端取歌彈窗 (Firebase 輸入 6 碼) -->
    <FetchSongModal
      :show="showFetchModal"
      @import-success="handleCloudImportSuccess"
      @close="showFetchModal = false"
    />

    <!-- 圖示挑選開窗 -->
    <IconPickerModal
      :show="showIconPicker"
      :modelValue="iconPickerTarget === 'add' ? newIcon : editIcon"
      @update:modelValue="handleIconSelected"
      @close="showIconPicker = false"
    />
  </div>
</template>

<style scoped>
/* 全域版面架構 */
.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  position: relative;
}

/* 頂部導航列 */
.app-header {
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(12px);
  border-bottom: 2px solid #f1f5f9;
  padding: 0.85rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 50;
  box-shadow: 0 4px 20px -5px rgba(0, 0, 0, 0.05);
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  user-select: none;
}

.brand-mascot {
  font-size: 2.2rem;
  display: inline-block;
  animation: kid-bounce 2s infinite ease-in-out;
}

.app-title {
  font-size: 1.35rem;
  font-weight: 800;
  color: #1e1b4b;
  letter-spacing: -0.01em;
  line-height: 1.2;
}

.app-tagline {
  font-size: 0.78rem;
  color: #64748b;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

/* 按鈕風格 */
.btn-pill {
  border-radius: var(--radius-full);
  padding: 0.55rem 1.15rem;
  font-weight: 700;
  font-size: 0.92rem;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid transparent;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.btn-primary-bounce {
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: white;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
}
.btn-primary-bounce:hover {
  background: linear-gradient(135deg, #4f46e5, #4338ca);
  transform: translateY(-2px);
}

.btn-secondary {
  background: #f1f5f9;
  color: #334155;
  border-color: #cbd5e1;
}
.btn-secondary:hover {
  background: #e2e8f0;
}

.btn-ghost {
  background: transparent;
  color: #64748b;
}
.btn-ghost:hover {
  background: #f1f5f9;
}

.btn-success {
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
}

.btn-icon {
  background: transparent;
  border: none;
  font-size: 1.3rem;
  color: #64748b;
  cursor: pointer;
  padding: 0.3rem 0.6rem;
  border-radius: 8px;
}
.btn-icon:hover {
  background: #f1f5f9;
}

/* 行動版歌單按鈕 */
.btn-song-drawer-trigger {
  display: none;
  background: #eff6ff;
  color: #2563eb;
  border-color: #bfdbfe;
}

/* 家長專區折疊選單 */
.parent-dropdown {
  position: relative;
}
.btn-parent-toggle {
  background: #fefce8;
  border-color: #fef08a;
  color: #854d0e;
}
.btn-parent-toggle:hover {
  background: #fef9c3;
}
.dropdown-arrow {
  font-size: 1.2rem;
  margin-left: -0.2rem;
}

.parent-menu-sheet {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 16px 36px -4px rgba(0, 0, 0, 0.16);
  min-width: 250px;
  padding: 0.6rem;
  z-index: 80;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  animation: scale-up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.menu-title {
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: #94a3b8;
  border-bottom: 1px solid #f1f5f9;
  margin-bottom: 0.2rem;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}
.menu-item:hover {
  background: #f8fafc;
  transform: translateX(3px);
}
.menu-icon {
  font-size: 1.6rem;
}
.menu-item-text {
  display: flex;
  flex-direction: column;
}
.menu-item-text strong {
  font-size: 0.95rem;
  color: #1e293b;
}
.menu-item-text small {
  font-size: 0.78rem;
  color: #64748b;
}

.text-indigo { color: #6366f1; }
.text-amber { color: #f59e0b; }
.text-emerald { color: #10b981; }
.text-blue { color: #2563eb; }
.text-danger { color: #ef4444; }

/* 語音設定滑出面板 */
.settings-drawer {
  background: #ffffff;
  border-bottom: 3px solid #e0e7ff;
  box-shadow: var(--shadow-lg);
  padding: 1.25rem 2rem;
  animation: slide-down 0.25s ease-out;
}
.settings-drawer-inner {
  max-width: 1360px;
  margin: 0 auto;
}
.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.2rem;
}
.drawer-title {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: #1e1b4b;
}
.drawer-title .title-icon {
  font-size: 1.7rem;
  color: #6366f1;
}
.settings-header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.saved-badge {
  font-size: 0.85rem;
  color: #059669;
  background: #d1fae5;
  padding: 0.3rem 0.75rem;
  border-radius: var(--radius-full);
  font-weight: 700;
}
.btn-sm {
  padding: 0.45rem 0.95rem;
  font-size: 0.88rem;
}
.settings-body {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.5rem;
}
.label-with-val {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.4rem;
}
.badge {
  background: #e0e7ff;
  color: #4338ca;
  padding: 0.15rem 0.6rem;
  border-radius: var(--radius-full);
  font-size: 0.82rem;
  font-weight: 700;
}
.range-slider {
  width: 100%;
  height: 8px;
  accent-color: #6366f1;
  cursor: pointer;
}

/* 主體兩欄佈局 */
.main-layout {
  display: flex;
  flex: 1;
  max-width: 1420px;
  margin: 0 auto;
  width: 100%;
  padding: 1.5rem;
  gap: 1.75rem;
}

/* 左側桌面歌單欄 */
.desktop-sidebar {
  width: 340px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border-radius: 20px;
  border: 2px solid #e2e8f0;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: calc(100vh - 125px);
  position: sticky;
  top: 90px;
}
.sidebar-header {
  padding: 1.25rem 1.4rem;
  border-bottom: 2px solid #f1f5f9;
}
.sidebar-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sidebar-header h2 {
  font-size: 1.2rem;
  color: #1e293b;
  font-weight: 800;
}
.song-count-pill {
  font-size: 0.82rem;
  font-weight: 700;
  color: #4f46e5;
  background: #e0e7ff;
  padding: 0.2rem 0.65rem;
  border-radius: 9999px;
}
.drag-hint {
  display: block;
  font-size: 0.78rem;
  color: #94a3b8;
  margin-top: 0.3rem;
  font-weight: 500;
}

.desktop-song-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.song-item-card {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.75rem 0.85rem;
  border-radius: 14px;
  cursor: pointer;
  background: white;
  border: 2px solid #f1f5f9;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  user-select: none;
}
.song-item-card:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  transform: translateX(3px);
}
.song-item-card.active {
  background: linear-gradient(135deg, #eef2ff, #f5f3ff);
  border-color: #818cf8;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.18);
}
.song-item-card.is-dragging {
  opacity: 0.4;
  transform: scale(0.97);
}
.song-item-card.drag-over {
  border-color: #6366f1;
  background: #f5f3ff;
  border-style: dashed;
}

.drag-handle {
  color: #94a3b8;
  font-size: 1.3rem;
  cursor: grab;
}
.song-item-card:hover .drag-handle {
  color: #6366f1;
}

.song-item-thumb-box {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: #eef2ff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}
.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.item-icon {
  font-size: 1.5rem;
  color: #6366f1;
}

.song-item-meta {
  flex: 1;
  min-width: 0;
}
.song-name {
  font-weight: 700;
  font-size: 0.95rem;
  color: #1e293b;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.35;
}
.yt-pill {
  font-size: 0.68rem;
  font-weight: 700;
  color: #dc2626;
  background: #fee2e2;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.reorder-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.btn-arrow {
  background: #f1f5f9;
  border: none;
  font-size: 0.65rem;
  color: #64748b;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  cursor: pointer;
  line-height: 1;
}
.btn-arrow:hover:not(:disabled) {
  background: #6366f1;
  color: white;
}
.btn-arrow:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.empty-song-box {
  padding: 3rem 1.5rem;
  text-align: center;
  color: #94a3b8;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.empty-icon-sm {
  font-size: 2.5rem;
  color: #cbd5e1;
}

/* 右側主舞台 */
.reading-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  min-width: 0;
}

/* 歌曲頭部卡片 */
.song-hero-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 24px;
  border: 2px solid #e2e8f0;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.05);
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
}

.hero-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.25rem;
  flex-wrap: wrap;
}

.hero-identity {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  flex: 1;
  min-width: 260px;
}

.hero-icon-box {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: #eef2ff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
  border: 2px solid #e2e8f0;
}
.hero-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hero-icon {
  font-size: 2.5rem;
  color: #6366f1;
}

.hero-titles {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.hero-tag {
  font-size: 0.78rem;
  font-weight: 700;
  color: #6366f1;
  background: #eef2ff;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  width: fit-content;
}
.hero-song-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.hero-action-buttons {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  flex-wrap: wrap;
}

.btn-video-toggle {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #dc2626;
}
.btn-video-toggle:hover {
  background: #fecaca;
  transform: translateY(-2px);
}

.btn-outline-manage {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #475569;
}
.btn-outline-manage:hover {
  background: #eef2ff;
  border-color: #818cf8;
}

/* 更多操作下拉選單 */
.action-dropdown {
  position: relative;
}
.dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  box-shadow: 0 16px 30px -4px rgba(0, 0, 0, 0.15);
  min-width: 185px;
  padding: 0.45rem;
  z-index: 70;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  animation: scale-up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.7rem 0.9rem;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 0.92rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}
.dropdown-item:hover {
  background: #f1f5f9;
}
.dropdown-item.text-danger:hover {
  background: #fee2e2;
  color: #b91c1c;
}
.dropdown-divider {
  height: 1px;
  background: #f1f5f9;
  margin: 0.2rem 0;
}

/* YouTube 影片區 (16:9 響應式) */
.video-container {
  width: 100%;
  max-width: 720px;
  aspect-ratio: 16 / 9;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  background: #000;
  align-self: center;
}
.video-container iframe {
  width: 100%;
  height: 100%;
}

/* 巨型幼童友善主控台 */
.giant-kid-controller {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 2px dashed #e2e8f0;
}

.primary-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

/* 專為 5~6 歲小孩設計的超大朗讀按鈕 */
.btn-giant-play {
  padding: 0.85rem 2rem;
  border-radius: 9999px;
  font-size: 1.15rem;
  font-weight: 800;
  box-shadow: 0 8px 20px -2px rgba(99, 102, 241, 0.35);
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 58px;
}
.btn-giant-play.is-ready {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  box-shadow: 0 8px 20px -2px rgba(16, 185, 129, 0.4);
}
.btn-giant-play.is-ready:hover {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  transform: translateY(-2px);
}
.btn-giant-play.is-playing {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  animation: glow-pulse 1.8s infinite;
  box-shadow: 0 8px 20px -2px rgba(245, 158, 11, 0.4);
}
.giant-icon {
  font-size: 2rem;
}
.giant-text {
  letter-spacing: 0.02em;
}

.btn-giant-stop {
  padding: 0.85rem 1.6rem;
  border-radius: 9999px;
  background: #fee2e2;
  color: #dc2626;
  border: 2px solid #fca5a5;
  font-size: 1.05rem;
  font-weight: 800;
  min-height: 58px;
}
.btn-giant-stop:hover {
  background: #fecaca;
  transform: translateY(-2px);
}

/* 友善狀態氣泡 */
.kid-status-bubble {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1rem;
  font-weight: 700;
  color: #1e1b4b;
  background: linear-gradient(135deg, #eef2ff, #faf5ff);
  border: 1px solid #c7d2fe;
  padding: 0.65rem 1.25rem;
  border-radius: 9999px;
  width: fit-content;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.08);
}
.kid-status-bubble.muted {
  background: #fefce8;
  border-color: #fef08a;
  color: #854d0e;
}
.kid-status-bubble.initial {
  background: #f8fafc;
  border-color: #e2e8f0;
  color: #475569;
}
.pulse-sparkle {
  font-size: 1.25rem;
  display: inline-block;
  animation: kid-bounce 1.5s infinite;
}

/* 歌詞卡片清單 */
.lyrics-card-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding-bottom: 5rem;
}

/* 幼童大段落卡片 */
.kid-paragraph-box {
  background: white;
  border-radius: 22px;
  border: 2px solid #e2e8f0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  padding: 1.75rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
}
.kid-paragraph-box:hover {
  border-color: #cbd5e1;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

/* 當前朗讀中的段落 (超級亮眼、有音波動畫) */
.kid-paragraph-box.is-active {
  border-color: #6366f1;
  background: linear-gradient(135deg, #ffffff 0%, #f5f3ff 100%);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.25), 0 12px 32px rgba(99, 102, 241, 0.18);
  transform: scale(1.015);
}

/* 上次播放過的段落 */
.kid-paragraph-box.is-last-played {
  border-color: #f59e0b;
  background: linear-gradient(135deg, #ffffff 0%, #fefce8 100%);
}

.para-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 0.85rem;
}

.para-badge-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.para-emoji {
  font-size: 1.6rem;
  line-height: 1;
}
.para-title-text {
  font-size: 1.1rem;
  font-weight: 800;
  color: #334155;
}

/* 單段播放按鈕 */
.btn-para-play {
  background: #f1f5f9;
  color: #1e293b;
  border-color: #cbd5e1;
  padding: 0.55rem 1.25rem;
  font-size: 0.95rem;
  min-height: 46px;
}
.btn-para-play:hover {
  background: #6366f1;
  color: white;
  border-color: #6366f1;
  transform: translateY(-2px);
}
.btn-para-play.is-reading {
  background: #ef4444;
  color: white;
  border-color: #ef4444;
  animation: glow-pulse 1.5s infinite;
}

/* 歌詞文字 (超大、清晰、大行高) */
.para-card-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.lyrics-text {
  font-size: 1.6rem;
  line-height: 1.9;
  font-weight: 600;
  color: #1e293b;
  letter-spacing: 0.03em;
  white-space: pre-wrap;
}
.lyric-line {
  margin-bottom: 0.35rem;
}

/* 音波動畫與提示 */
.para-indicator {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.92rem;
  font-weight: 700;
  color: #6366f1;
  background: #eef2ff;
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  width: fit-content;
}
.para-indicator.completed {
  color: #15803d;
  background: #dcfce7;
}

.kid-sound-wave {
  display: inline-flex;
  gap: 4px;
  align-items: flex-end;
  height: 16px;
}
.kid-sound-wave span {
  width: 4px;
  background: #6366f1;
  border-radius: 2px;
  animation: wave-bar 0.9s infinite ease-in-out;
}
.kid-sound-wave span:nth-child(1) { height: 6px; animation-delay: 0s; }
.kid-sound-wave span:nth-child(2) { height: 16px; animation-delay: 0.15s; }
.kid-sound-wave span:nth-child(3) { height: 10px; animation-delay: 0.3s; }
.kid-sound-wave span:nth-child(4) { height: 14px; animation-delay: 0.45s; }
.kid-sound-wave span:nth-child(5) { height: 8px; animation-delay: 0.2s; }

@keyframes wave-bar {
  0%, 100% { height: 5px; }
  50% { height: 16px; }
}

.no-lyrics-card {
  background: white;
  padding: 3rem 1.5rem;
  border-radius: 20px;
  border: 2px dashed #cbd5e1;
  text-align: center;
  color: #64748b;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}
.no-lyrics-icon {
  font-size: 3.5rem;
  color: #a5b4fc;
}

/* 編輯區卡片 */
.edit-card {
  background: white;
  padding: 2rem;
  border-radius: 22px;
  border: 2px solid #e2e8f0;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
}
.edit-hint-banner {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  padding: 0.85rem 1.25rem;
  border-radius: 12px;
  font-size: 0.95rem;
  line-height: 1.5;
}

/* 表單元件 */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.form-group label {
  font-weight: 700;
  font-size: 0.92rem;
  color: #1e293b;
}
.form-control {
  padding: 0.8rem 1.15rem;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  font-size: 1.05rem;
  outline: none;
  font-family: inherit;
  transition: all 0.2s;
}
.form-control:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
}
.lyrics-textarea {
  resize: vertical;
  line-height: 1.7;
}
.input-with-button {
  display: flex;
  gap: 0.6rem;
}
.input-with-button .form-control {
  flex: 1;
}

/* 圖示欄位 */
.icon-selector-field {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.selected-icon-preview {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: #f8fafc;
  border: 2px solid #cbd5e1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6366f1;
  overflow: hidden;
  flex-shrink: 0;
}
.selected-icon-preview .material-symbols-outlined {
  font-size: 2rem;
}
.selected-icon-preview .placeholder-icon {
  color: #94a3b8;
}
.preview-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.icon-field-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.tip {
  font-size: 0.82rem;
  color: #64748b;
}
.error-tip {
  font-size: 0.85rem;
  color: #dc2626;
  font-weight: 600;
}

/* 行動/平板專屬：底部常駐浮動迷你播放列 */
.mobile-bottom-dock {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(16px);
  border-top: 2px solid #e0e7ff;
  box-shadow: 0 -8px 25px rgba(0, 0, 0, 0.12);
  padding: 0.75rem 1.25rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
  z-index: 60;
  animation: slide-up 0.25s ease-out;
}
.dock-inner {
  max-width: 600px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.dock-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.dock-title {
  font-size: 0.95rem;
  font-weight: 800;
  color: #1e1b4b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dock-status {
  font-size: 0.78rem;
  font-weight: 700;
  color: #6366f1;
}
.dock-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.btn-dock-play {
  border-radius: 9999px;
  padding: 0.65rem 1.4rem;
  font-size: 1rem;
  font-weight: 800;
  min-height: 48px;
}
.btn-dock-stop {
  border-radius: 50%;
  width: 48px;
  height: 48px;
  background: #fee2e2;
  color: #dc2626;
  border: 1px solid #fca5a5;
  padding: 0;
  justify-content: center;
}

/* 行動版歌庫抽屜 (Bottom Sheet) */
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  z-index: 120;
  display: flex;
  justify-content: flex-end;
  animation: fade-in 0.2s ease-out;
}
.drawer-sheet {
  background: white;
  width: 100%;
  max-width: 420px;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.2);
  animation: slide-left 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-sheet-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 2px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sheet-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.sheet-icon {
  font-size: 1.6rem;
  color: #6366f1;
}
.drawer-sheet-header h3 {
  font-size: 1.2rem;
  font-weight: 800;
  color: #0f172a;
}
.drawer-sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.sheet-song-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.85rem;
  border-radius: 14px;
  border: 2px solid #f1f5f9;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}
.sheet-song-item.active {
  background: #eef2ff;
  border-color: #818cf8;
}
.sheet-thumb-box {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: #eef2ff;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.sheet-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.sheet-item-icon {
  font-size: 1.4rem;
  color: #6366f1;
}
.sheet-song-meta {
  flex: 1;
  min-width: 0;
}
.sheet-song-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: #1e293b;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sheet-current-badge {
  font-size: 0.7rem;
  color: #4f46e5;
  background: #e0e7ff;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-weight: 700;
}
.sheet-reorder-buttons {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.btn-sheet-arrow {
  background: #f1f5f9;
  border: none;
  font-size: 0.7rem;
  color: #64748b;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
}
.btn-sheet-arrow:disabled {
  opacity: 0.3;
}
.drawer-sheet-footer {
  padding: 1rem 1.25rem;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}
.btn-block {
  width: 100%;
  justify-content: center;
}

/* Modal 彈窗樣式 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 140;
  padding: 1rem;
  animation: fade-in 0.2s ease-out;
}
.modal-card {
  background: white;
  width: 100%;
  max-width: 580px;
  border-radius: 20px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: scale-up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 2px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-header .title-wrap {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.modal-header h3 {
  font-size: 1.25rem;
  color: #0f172a;
  font-weight: 800;
}
.modal-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  overflow-y: auto;
}
.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  background: #f8fafc;
}
.tip-box {
  background: #fefce8;
  border: 1px solid #fef08a;
  color: #854d0e;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  font-size: 0.88rem;
  line-height: 1.5;
}

/* 空白首頁大卡片 */
.empty-stage {
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}
.empty-welcome-card {
  text-align: center;
  background: white;
  padding: 3.5rem 2rem;
  border-radius: 28px;
  border: 2px solid #e2e8f0;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
  max-width: 520px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}
.welcome-mascot {
  font-size: 4rem;
  display: inline-block;
  animation: kid-bounce 2s infinite ease-in-out;
}
.empty-welcome-card h2 {
  font-size: 1.6rem;
  font-weight: 800;
  color: #1e1b4b;
}
.empty-welcome-card p {
  color: #64748b;
  font-size: 1rem;
  line-height: 1.6;
}
.btn-lg {
  padding: 0.85rem 1.75rem;
  font-size: 1.05rem;
}

/* 動畫定義 */
@keyframes slide-down {
  from { opacity: 0; transform: translateY(-12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes slide-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes slide-left {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes scale-up {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

/* ========================================================
   響應式設計 (RWD) 斷點設定：平板與手機適配
   ======================================================== */

/* 1. 平板與行動裝置 (<= 1024px) */
@media (max-width: 1024px) {
  .main-layout {
    flex-direction: column;
    padding: 1rem;
    gap: 1.25rem;
  }
  /* 隱藏桌機左側欄，改用頂部「歌單」按鈕開啟抽屜切換歌曲 */
  .desktop-sidebar {
    display: none;
  }
  .btn-song-drawer-trigger {
    display: inline-flex;
  }
  .mobile-bottom-dock {
    display: block;
  }
  /* 行動版面：固定展開 YouTube 播放器，隱藏開闔按鈕、小縮圖與「正在練習歌曲」標籤，僅保留標題與管理按鈕 */
  .hero-icon-box,
  .hero-tag,
  .btn-video-toggle {
    display: none;
  }
  .hero-header-row {
    align-items: center;
    gap: 0.75rem;
  }
  .hero-identity {
    min-width: 0;
  }
}

/* 2. 手機螢幕 (<= 640px) */
@media (max-width: 640px) {
  .app-header {
    padding: 0.75rem 1rem;
  }
  .brand-mascot {
    font-size: 1.8rem;
  }
  .app-title {
    font-size: 1.15rem;
  }
  .app-tagline {
    display: none;
  }
  .parent-label {
    display: none;
  }
  .btn-parent-toggle {
    padding: 0.45rem 0.65rem;
  }
  .hero-song-title {
    font-size: 1.35rem;
  }
  .song-hero-card {
    padding: 1.15rem;
    border-radius: 18px;
    gap: 1rem;
  }
  .btn-giant-play {
    width: 100%;
    justify-content: center;
    font-size: 1.05rem;
    padding: 0.75rem 1.25rem;
  }
  .btn-giant-stop {
    width: 100%;
    justify-content: center;
  }
  .kid-paragraph-box {
    padding: 1.15rem;
    border-radius: 18px;
    gap: 1rem;
  }
  .lyrics-text {
    font-size: 1.35rem;
    line-height: 1.8;
  }
  .para-card-header {
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .settings-drawer {
    padding: 1rem;
  }
  .settings-body {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  .modal-card {
    border-radius: 16px;
    max-height: 90vh;
  }
  .modal-header, .modal-body, .modal-footer {
    padding: 1rem;
  }
  .input-with-button {
    flex-direction: column;
  }
  .input-with-button .btn {
    width: 100%;
  }
  .modal-footer {
    flex-direction: column-reverse;
  }
  .modal-footer .btn {
    width: 100%;
  }
}
</style>
