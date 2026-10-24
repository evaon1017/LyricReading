<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { Song, SpeechSettings } from './types';
import { loadSongs, saveSongs, extractYouTubeId, fetchYouTubeTitle } from './utils/songHelper';
import { LyricSpeaker } from './utils/speechHelper';
import { DEFAULT_SONG_ICON } from './utils/iconHelper';
import IconPickerModal from './components/IconPickerModal.vue';

// 狀態管理
const songs = ref<Song[]>([]);
const currentSongId = ref<string>('');
const isEditing = ref<boolean>(false);
const showAddModal = ref<boolean>(false);
const showPlayer = ref<boolean>(false);
const showSettings = ref<boolean>(false);

// 圖示挑選開窗狀態
const showIconPicker = ref<boolean>(false);
const iconPickerTarget = ref<'add' | 'edit'>('add');

// 拖曳排序狀態
const draggedSongIndex = ref<number | null>(null);
const dragOverSongIndex = ref<number | null>(null);

// 語音朗讀設定 (空白停頓預設由 320ms 減半為 160ms，可設定至更短 40ms)
const speechSettings = ref<SpeechSettings>({
  rate: 0.85, // 適合小朋友學唱的清晰語速
  pitch: 1.1, // 親切活潑音調
  voiceURI: '',
  pausePerSpaceMs: 160 // 停頓時間減半，約 160ms (單行換行自動以 80ms 呼吸停頓)
});
const availableVoices = ref<SpeechSynthesisVoice[]>([]);

// 播放朗讀狀態
const speaker = new LyricSpeaker();
const isPlaying = ref<boolean>(false);
const isSequentialPlaying = ref<boolean>(false);
const activeParagraphIndex = ref<number | null>(null);
const lastPlayedParagraphIndex = ref<number | null>(null);

// 編輯中的暫存資料
const editTitle = ref<string>('');
const editYoutubeUrl = ref<string>('');
const editLyrics = ref<string>('');
const editIcon = ref<string>(DEFAULT_SONG_ICON);

// 新增歌曲的表單資料
const newUrl = ref<string>('');
const newTitle = ref<string>('');
const newLyrics = ref<string>('');
const newIcon = ref<string>(DEFAULT_SONG_ICON);
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
  // 正規表達式匹配連續兩個或更多換行：\r?\n\s*\r?\n
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
});

// 監聽語音清單變更
function initVoices() {
  if ('speechSynthesis' in window) {
    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      availableVoices.value = voices;
      if (!speechSettings.value.voiceURI && voices.length > 0) {
        // 預設找台灣中文或廣東話/普通話
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
  activeParagraphIndex.value = null;
  lastPlayedParagraphIndex.value = null;
}

// 自動抓取 YouTube 標題 (新增歌曲時)
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

// 打開圖示挑選視窗
function openIconPicker(target: 'add' | 'edit') {
  iconPickerTarget.value = target;
  showIconPicker.value = true;
}

// 選擇圖示後的更新
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
    icon: newIcon.value || DEFAULT_SONG_ICON,
    createdAt: Date.now()
  };

  songs.value.unshift(newSong);
  saveSongs(songs.value);
  currentSongId.value = newSong.id;

  // 清空表單並關閉彈窗
  newUrl.value = '';
  newTitle.value = '';
  newLyrics.value = '';
  newIcon.value = DEFAULT_SONG_ICON;
  fetchError.value = '';
  showAddModal.value = false;
  isEditing.value = false;
}

// 進入編輯模式
function startEditing() {
  if (!currentSong.value) return;
  editTitle.value = currentSong.value.title;
  editYoutubeUrl.value = currentSong.value.youtubeUrl;
  editLyrics.value = currentSong.value.lyrics;
  editIcon.value = currentSong.value.icon || DEFAULT_SONG_ICON;
  isEditing.value = true;
}

// 儲存編輯
function saveEditing() {
  if (!currentSong.value) return;
  currentSong.value.title = editTitle.value.trim() || '未命名歌曲';
  currentSong.value.youtubeUrl = editYoutubeUrl.value.trim();
  currentSong.value.lyrics = editLyrics.value.trim();
  currentSong.value.icon = editIcon.value || DEFAULT_SONG_ICON;
  saveSongs(songs.value);
  isEditing.value = false;
}

// 取消編輯
function cancelEditing() {
  isEditing.value = false;
}

// 匯出單一歌曲為 .HanaSong (JSON 格式)
function exportCurrentSong() {
  if (!currentSong.value) return;
  const songData = {
    format: 'HanaSong',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    song: currentSong.value
  };

  const jsonStr = JSON.stringify(songData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  
  // 清理檔案名稱中的非法字元
  const safeTitle = currentSong.value.title.replace(/[\\/:*?"<>|]/g, '_');
  a.href = url;
  a.download = `${safeTitle}.HanaSong`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 隱藏的檔案上傳 input
const fileInputRef = ref<HTMLInputElement | null>(null);

function triggerImport() {
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
    fileInputRef.value.click();
  }
}

// 處理匯入歌曲
function handleFileImport(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const parsed = JSON.parse(content);

      // 支援 { format: 'HanaSong', song: Song } 或直接是 Song 物件
      let importedSong: Partial<Song> | null = null;
      if (parsed.song && typeof parsed.song === 'object') {
        importedSong = parsed.song;
      } else if (parsed.title && parsed.lyrics) {
        importedSong = parsed;
      }

      if (!importedSong || !importedSong.title || !importedSong.lyrics) {
        alert('匯入失敗：檔案格式不符合 .HanaSong 格式！');
        return;
      }

      const newSong: Song = {
        id: 'song-' + Date.now(),
        title: importedSong.title,
        youtubeUrl: importedSong.youtubeUrl || '',
        lyrics: importedSong.lyrics,
        icon: importedSong.icon || DEFAULT_SONG_ICON,
        createdAt: Date.now()
      };

      songs.value.unshift(newSong);
      saveSongs(songs.value);
      currentSongId.value = newSong.id;
      alert(`🎉 成功匯入歌曲《${newSong.title}》！`);
    } catch (err: any) {
      console.error('Import error:', err);
      alert('解析檔案失敗，請確認是否為有效的 .HanaSong 檔案');
    }
  };
  reader.readAsText(file);
}

// 刪除當前歌曲 (包含確認 confirm 視窗)
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

// 拖曳排序 (Drag and Drop)
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

  // 將被拖曳的項目移至新位置
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
    // 再次點擊正在播的段落即停止
    stopSpeaking();
    return;
  }

  stopSpeaking();
  isPlaying.value = true;
  isSequentialPlaying.value = false;
  activeParagraphIndex.value = index;
  lastPlayedParagraphIndex.value = index;

  const paragraphText = lyricParagraphs.value[index];
  if (!paragraphText) {
    stopSpeaking();
    return;
  }

  const finished = await speaker.speakParagraph(paragraphText, speechSettings.value);
  if (finished && activeParagraphIndex.value === index) {
    // 播放完成，解除正在播放狀態，但保留 lastPlayedParagraphIndex 供接續播放判斷
    isPlaying.value = false;
    activeParagraphIndex.value = null;
  }
}

// 接續播放到底
async function playAllSequentially() {
  if (isPlaying.value && isSequentialPlaying.value) {
    // 若正在連續播放中再次按下，則停止
    stopSpeaking();
    return;
  }

  const paragraphs = lyricParagraphs.value;
  if (paragraphs.length === 0) return;

  let startIndex = 0;

  // 判斷接續起點：
  // 1. 若當前正有段落「播放中」：從當前這一段 (N) 繼續播
  // 2. 若不在播放中，但有「上次已播放完畢的段落 (N)」：
  //    - 如果 N 已是最後一段，則從第 1 段 (索引 0) 開始播放
  //    - 否則從第 N + 1 段開始接續播放
  // 3. 若從未播放過：從第 1 段 (索引 0) 開始播放
  if (isPlaying.value && activeParagraphIndex.value !== null) {
    startIndex = activeParagraphIndex.value;
  } else if (lastPlayedParagraphIndex.value !== null) {
    if (lastPlayedParagraphIndex.value >= paragraphs.length - 1) {
      startIndex = 0; // 已播完最後一段，從頭開始
    } else {
      startIndex = lastPlayedParagraphIndex.value + 1; // 從第 N+1 段開始
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
    lastPlayedParagraphIndex.value = i;

    const finished = await speaker.speakParagraph(paragraphs[i], speechSettings.value);
    if (!finished) break;

    // 段落間稍作停頓 (約 600ms)，更有歌唱學唱的段落呼吸感
    if (i < paragraphs.length - 1 && isPlaying.value) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  isPlaying.value = false;
  isSequentialPlaying.value = false;
  activeParagraphIndex.value = null;
}
</script>

<template>
  <div class="app-layout">
    <!-- 頂部導航列 -->
    <header class="app-header">
      <div class="header-brand">
        <span class="material-symbols-outlined brand-symbol">queue_music</span>
        <div class="brand-text">
          <h1>寶貝學唱歌 ‧ 歌詞朗讀助手</h1>
          <p class="subtitle">自訂停頓節奏 ‧ 逐段念唱 ‧ 陪伴孩子快樂歌唱</p>
        </div>
      </div>
      <div class="header-actions">
        <!-- 隱藏的檔案選擇器 (副檔名 .HanaSong 或 .json) -->
        <input
          ref="fileInputRef"
          type="file"
          accept=".HanaSong,.json"
          style="display: none"
          @change="handleFileImport"
        />

        <button class="btn btn-secondary" @click="showSettings = !showSettings" title="朗讀語音設定">
          <span class="material-symbols-outlined btn-icon-inline">tune</span>
          語音設定
        </button>
        <button class="btn btn-secondary" @click="triggerImport" title="匯入 .HanaSong 格式歌曲">
          <span class="material-symbols-outlined btn-icon-inline">file_upload</span>
          匯入歌曲
        </button>
        <button class="btn btn-primary" @click="showAddModal = true">
          <span class="material-symbols-outlined btn-icon-inline">add_circle</span>
          新增歌曲
        </button>
      </div>
    </header>

    <!-- 語音設定滑出面板 -->
    <div v-if="showSettings" class="settings-drawer">
      <div class="settings-header">
        <div class="drawer-title">
          <span class="material-symbols-outlined">settings_voice</span>
          <h3>朗讀與停頓節奏設定</h3>
        </div>
        <button class="btn-icon" @click="showSettings = false">✕</button>
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
        </div>
        <div class="form-group">
          <div class="label-with-val">
            <label>空白停頓時間 (每個空格停頓長度)：</label>
            <span class="badge">{{ speechSettings.pausePerSpaceMs }} ms</span>
          </div>
          <input
            type="range"
            min="40"
            max="600"
            step="10"
            v-model.number="speechSettings.pausePerSpaceMs"
            class="range-slider"
          />
          <small class="tip">已將停頓節奏減半！兩個空格停頓 {{ speechSettings.pausePerSpaceMs * 2 }} ms，行間呼吸停頓 {{ Math.round(speechSettings.pausePerSpaceMs * 0.5) }} ms，可依需求調至極短！</small>
        </div>
      </div>
    </div>

    <!-- 主要工作區 -->
    <div class="app-main">
      <!-- 左側歌單欄 -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-title-wrap">
            <h2>🎶 歌曲庫 ({{ songs.length }})</h2>
            <span class="drag-hint">↕ 拖曳可排序</span>
          </div>
        </div>
        <div class="song-list">
          <div
            v-for="(song, sIdx) in songs"
            :key="song.id"
            :class="[
              'song-item',
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
            <!-- 拖曳把手提示 -->
            <span class="material-symbols-outlined drag-handle" title="按住可拖曳排序">drag_indicator</span>

            <!-- 自訂 Google Material Icon -->
            <div class="song-item-icon-box">
              <span class="material-symbols-outlined song-icon">
                {{ song.icon || DEFAULT_SONG_ICON }}
              </span>
            </div>

            <div class="song-item-info">
              <div class="song-item-title">{{ song.title }}</div>
              <div class="song-item-meta" v-if="song.youtubeUrl">
                <span class="yt-badge">YouTube</span>
              </div>
            </div>
          </div>
          <div v-if="songs.length === 0" class="empty-songs">
            目前還沒有歌曲，點擊右上角「➕ 新增歌曲」開始加入吧！
          </div>
        </div>
      </aside>

      <!-- 右側歌詞與播放主畫面 -->
      <main class="content-area" v-if="currentSong">
        <!-- 歌曲頂部資訊與控制列 -->
        <div class="song-header-card">
          <div class="song-title-row">
            <div class="song-identity">
              <span class="material-symbols-outlined current-song-icon">
                {{ currentSong.icon || DEFAULT_SONG_ICON }}
              </span>
              <div>
                <h2 class="current-title">{{ currentSong.title }}</h2>
                <div class="current-url" v-if="currentSong.youtubeUrl">
                  <span class="url-label">YouTube:</span>
                  <a :href="currentSong.youtubeUrl" target="_blank" rel="noreferrer">
                    {{ currentSong.youtubeUrl }}
                  </a>
                </div>
              </div>
            </div>

            <!-- 操作按鈕群 -->
            <div class="song-action-buttons">
              <!-- 顯示 YouTube 影片播放器 -->
              <button
                v-if="currentEmbedUrl"
                class="btn btn-outline-yt"
                @click="showPlayer = !showPlayer"
              >
                <span class="material-symbols-outlined btn-icon-inline">smart_display</span>
                {{ showPlayer ? '收起影片' : '展開影片' }}
              </button>

              <!-- 匯出歌曲檔案 (.HanaSong) -->
              <button class="btn btn-outline" @click="exportCurrentSong" title="匯出這首歌為 .HanaSong 檔案">
                <span class="material-symbols-outlined btn-icon-inline">file_download</span>
                匯出歌曲
              </button>

              <!-- 編輯 / 儲存按鈕 -->
              <button v-if="!isEditing" class="btn btn-outline" @click="startEditing">
                <span class="material-symbols-outlined btn-icon-inline">edit</span>
                編輯歌詞
              </button>
              <template v-else>
                <button class="btn btn-primary" @click="saveEditing">
                  <span class="material-symbols-outlined btn-icon-inline">save</span>
                  儲存修改
                </button>
                <button class="btn btn-ghost" @click="cancelEditing">
                  取消
                </button>
              </template>

              <!-- 刪除按鈕 (有確認 confirm) -->
              <button
                class="btn btn-danger-action"
                @click="deleteCurrentSong"
                title="刪除此首歌曲"
              >
                <span class="material-symbols-outlined btn-icon-inline">delete</span>
                刪除歌曲
              </button>
            </div>
          </div>

          <!-- YouTube 嵌入播放器 -->
          <div v-if="showPlayer && currentEmbedUrl" class="video-embed-container">
            <iframe
              :src="currentEmbedUrl"
              frameborder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>
          </div>

          <!-- 非編輯模式的全局播放工具列 -->
          <div v-if="!isEditing" class="play-toolbar">
            <button
              :class="['btn', isSequentialPlaying ? 'btn-playing' : 'btn-accent']"
              @click="playAllSequentially"
            >
              <span class="material-symbols-outlined btn-icon-inline">
                {{ isSequentialPlaying ? 'pause_circle' : 'play_circle' }}
              </span>
              <span v-if="isSequentialPlaying">停止接續播放</span>
              <span v-else>接續播放到底</span>
            </button>

            <button v-if="isPlaying" class="btn btn-danger" @click="stopSpeaking">
              <span class="material-symbols-outlined btn-icon-inline">stop</span>
              停止朗讀
            </button>

            <div class="play-status-tip" v-if="activeParagraphIndex !== null">
              <span class="pulse-dot"></span>
              正在朗讀第 <strong>{{ activeParagraphIndex + 1 }}</strong> 段
            </div>
            <div class="play-status-tip" v-else-if="lastPlayedParagraphIndex !== null">
              已播完第 <strong>{{ lastPlayedParagraphIndex + 1 }}</strong> 段 (下次將接續播第 {{ lastPlayedParagraphIndex + 2 > lyricParagraphs.length ? 1 : lastPlayedParagraphIndex + 2 }} 段)
            </div>
          </div>
        </div>

        <!-- 編輯模式 -->
        <div v-if="isEditing" class="edit-card">
          <div class="edit-hint-banner">
            💡 <strong>小提示：</strong>段落之間請用「<strong>兩個換行</strong>」分開。歌詞中按「<strong>空白鍵</strong>」可在朗讀時自動產生停頓拍子！
          </div>

          <!-- 圖示設定 -->
          <div class="form-group">
            <label>歌曲圖示 (Google Material Icon)：</label>
            <div class="icon-selector-field">
              <div class="selected-icon-preview">
                <span class="material-symbols-outlined">{{ editIcon }}</span>
              </div>
              <button type="button" class="btn btn-secondary" @click="openIconPicker('edit')">
                <span class="material-symbols-outlined btn-icon-inline">image_search</span>
                更換圖示
              </button>
            </div>
          </div>

          <div class="form-group">
            <label>歌曲標題：</label>
            <input v-model="editTitle" type="text" class="form-control" />
          </div>
          <div class="form-group">
            <label>YouTube 網址：</label>
            <input v-model="editYoutubeUrl" type="text" class="form-control" />
          </div>
          <div class="form-group">
            <label>歌詞內容 (雙換行代表段落，空白代表停頓)：</label>
            <textarea
              v-model="editLyrics"
              rows="12"
              class="form-control lyrics-textarea"
              placeholder="輸入或貼上歌詞..."
            ></textarea>
          </div>
        </div>

        <!-- 檢視模式：段落清單呈現 -->
        <div v-else class="lyrics-view-container">
          <div
            v-for="(para, pIdx) in lyricParagraphs"
            :key="pIdx"
            :class="[
              'paragraph-card',
              {
                'is-active': activeParagraphIndex === pIdx,
                'is-last-played': lastPlayedParagraphIndex === pIdx && activeParagraphIndex !== pIdx
              }
            ]"
          >
            <div class="paragraph-sidebar">
              <span class="paragraph-badge">段落 {{ pIdx + 1 }}</span>
              <button
                :class="[
                  'btn-play-para',
                  { 'para-playing': activeParagraphIndex === pIdx }
                ]"
                @click="playParagraph(pIdx)"
                :title="activeParagraphIndex === pIdx ? '點擊暫停' : '播放此段落'"
              >
                <span class="material-symbols-outlined btn-icon-inline">
                  {{ activeParagraphIndex === pIdx ? 'pause' : 'play_arrow' }}
                </span>
                <span v-if="activeParagraphIndex === pIdx">暫停</span>
                <span v-else>播放此段</span>
              </button>
            </div>
            <div class="paragraph-text-wrapper">
              <div class="paragraph-text">
                <template v-for="(line, lIdx) in para.split('\n')" :key="lIdx">
                  <div class="lyric-line">{{ line }}</div>
                </template>
              </div>
              <div class="paragraph-indicator" v-if="activeParagraphIndex === pIdx">
                <span class="sound-wave">
                  <span></span><span></span><span></span><span></span>
                </span>
                正在朗讀中...
              </div>
              <div class="paragraph-indicator last-mark" v-else-if="lastPlayedParagraphIndex === pIdx">
                📌 上次播放完畢的段落
              </div>
            </div>
          </div>

          <div v-if="lyricParagraphs.length === 0" class="no-lyrics">
            尚未填寫歌詞，請點擊上方「✏️ 編輯歌詞」輸入內容！
          </div>
        </div>
      </main>

      <main class="content-area empty-state" v-else>
        <div class="empty-box">
          <span class="material-symbols-outlined empty-icon">sentiment_very_satisfied</span>
          <h2>歡迎來到寶貝歌詞朗讀助手！</h2>
          <p>請點擊右上角「➕ 新增歌曲」貼入 YouTube 網址與歌詞，幫助小朋友開心學唱歌！</p>
        </div>
      </main>
    </div>

    <!-- 新增歌曲彈窗 (Modal) -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <div class="title-wrap">
            <span class="material-symbols-outlined header-icon">library_music</span>
            <h3>新增學唱歌曲</h3>
          </div>
          <button class="btn-icon" @click="showAddModal = false">✕</button>
        </div>
        <div class="modal-body">
          <!-- 圖示設定 (必選，提供預設值) -->
          <div class="form-group">
            <label>歌曲專屬圖示 (Google Material Icon)：</label>
            <div class="icon-selector-field">
              <div class="selected-icon-preview">
                <span class="material-symbols-outlined">{{ newIcon }}</span>
              </div>
              <button type="button" class="btn btn-secondary" @click="openIconPicker('add')">
                <span class="material-symbols-outlined btn-icon-inline">image_search</span>
                挑選圖示
              </button>
            </div>
            <small class="tip">預設為音樂圖示，可點擊更換可愛動物、星星或玩具等標誌！</small>
          </div>

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
                class="btn btn-secondary"
                :disabled="isFetchingTitle || !newUrl"
                @click="onUrlInputBlur"
              >
                <span class="material-symbols-outlined btn-icon-inline">travel_explore</span>
                {{ isFetchingTitle ? '抓取中...' : '抓取標題' }}
              </button>
            </div>
            <small v-if="fetchError" class="error-tip">{{ fetchError }}</small>
            <small v-else class="tip">貼入網址後點擊或移開，將自動抓取 YouTube 影片標題！</small>
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
              ⭐ <strong>段落規則：</strong>請在段落間隔處輸入「<strong>兩個換行</strong>」。<br />
              ⭐ <strong>停頓節奏：</strong>歌詞字與字之間加「<strong>空白</strong>」，系統會自動停頓相應的時間！
            </div>
            <textarea
              v-model="newLyrics"
              rows="8"
              class="form-control lyrics-textarea"
              placeholder="請貼入您找到的多行歌詞..."
            ></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="showAddModal = false">取消</button>
          <button class="btn btn-primary" @click="handleAddSong">確定新增</button>
        </div>
      </div>
    </div>

    <!-- Google Material Icons 挑選開窗元件 -->
    <IconPickerModal
      :show="showIconPicker"
      :modelValue="iconPickerTarget === 'add' ? newIcon : editIcon"
      @update:modelValue="handleIconSelected"
      @close="showIconPicker = false"
    />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* 頂部導航列 */
.app-header {
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 50;
  box-shadow: var(--shadow-sm);
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.brand-symbol {
  font-size: 2.2rem;
  color: #6366f1;
  background: #eef2ff;
  border-radius: var(--radius-md);
  padding: 0.3rem;
  box-shadow: var(--shadow-sm);
}

.brand-text h1 {
  font-size: 1.4rem;
  font-weight: 800;
  color: #1e1b4b;
  letter-spacing: -0.02em;
}

.subtitle {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.header-actions {
  display: flex;
  gap: 0.75rem;
}

/* 按鈕風格 */
.btn {
  padding: 0.6rem 1.2rem;
  border-radius: var(--radius-full);
  font-size: 0.95rem;
  font-weight: 600;
}

.btn-icon-inline {
  font-size: 1.2rem;
  vertical-align: middle;
}

.btn-primary {
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: white;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
}
.btn-primary:hover {
  background: linear-gradient(135deg, #4f46e5, #4338ca);
}

.btn-secondary {
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
}
.btn-secondary:hover {
  background: #e2e8f0;
}

.btn-accent {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: white;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35);
}
.btn-accent:hover {
  background: linear-gradient(135deg, #d97706, #b45309);
}

.btn-playing {
  background: linear-gradient(135deg, #10b981, #059669);
  color: white;
  animation: pulse-border 2s infinite;
}

.btn-outline {
  background: white;
  border: 1px solid #cbd5e1;
  color: #334155;
}
.btn-outline:hover {
  background: #f8fafc;
}

.btn-outline-yt {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  color: #dc2626;
}
.btn-outline-yt:hover {
  background: #fecaca;
}

.btn-ghost {
  background: transparent;
  color: #64748b;
}
.btn-ghost:hover {
  background: #f1f5f9;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-danger-action {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
}
.btn-danger-action:hover {
  background: #fecaca;
  color: #991b1b;
}

.btn-icon {
  background: transparent;
  font-size: 1.2rem;
  color: #64748b;
  padding: 0.2rem 0.5rem;
}

/* 語音設定面板 */
.settings-drawer {
  background: #ffffff;
  border-bottom: 2px solid #e2e8f0;
  box-shadow: var(--shadow-md);
  padding: 1.25rem 2rem;
  animation: slide-down 0.3s ease-out;
}
.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.drawer-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #1e293b;
}
.settings-body {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}
.label-with-val {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.35rem;
}
.badge {
  background: #e0e7ff;
  color: #4338ca;
  padding: 0.1rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 700;
}
.range-slider {
  width: 100%;
  accent-color: var(--primary);
}

/* 主畫面版面 */
.app-main {
  display: flex;
  flex: 1;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  padding: 1.5rem;
  gap: 1.5rem;
}

/* 側邊歌單欄 */
.sidebar {
  width: 330px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: calc(100vh - 120px);
}
.sidebar-header {
  padding: 1.1rem 1.25rem;
  border-bottom: 1px solid var(--border);
}
.sidebar-title-wrap {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.sidebar-header h2 {
  font-size: 1.15rem;
  color: #334155;
  font-weight: 700;
}
.drag-hint {
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 500;
}

.song-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.song-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 0.85rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  background: white;
  border: 2px solid transparent;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}
.song-item:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  transform: translateX(3px);
}
.song-item.active {
  background: linear-gradient(135deg, #eef2ff, #e0e7ff);
  border-color: #818cf8;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);
}

/* 拖曳狀態樣式 */
.song-item.is-dragging {
  opacity: 0.4;
  transform: scale(0.98);
}
.song-item.drag-over {
  border-color: #6366f1;
  background: #f5f3ff;
  border-style: dashed;
}

.drag-handle {
  color: #94a3b8;
  font-size: 1.25rem;
  cursor: grab;
  transition: color 0.2s;
}
.song-item:hover .drag-handle {
  color: #6366f1;
}

.song-item-icon-box {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #eef2ff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.song-icon {
  font-size: 1.35rem;
  color: #4f46e5;
}

.song-item-info {
  flex: 1;
  min-width: 0;
}
.song-item-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: #1e293b;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.yt-badge {
  font-size: 0.7rem;
  color: #dc2626;
  background: #fee2e2;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-weight: 700;
}
.empty-songs {
  padding: 2rem 1rem;
  text-align: center;
  color: #94a3b8;
  font-size: 0.9rem;
}

/* 內容區 */
.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-width: 0;
}

.song-header-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.song-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}

.song-identity {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1;
  min-width: 250px;
}

.current-song-icon {
  font-size: 2.5rem;
  color: #4f46e5;
  background: #eef2ff;
  border-radius: 12px;
  padding: 0.5rem;
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
}

.current-title {
  font-size: 1.6rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.3;
}
.current-url {
  font-size: 0.85rem;
  color: #64748b;
  margin-top: 0.35rem;
}
.current-url a {
  color: #6366f1;
  text-decoration: none;
  word-break: break-all;
}
.current-url a:hover {
  text-decoration: underline;
}

.song-action-buttons {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

/* YouTube 嵌入播放器 */
.video-embed-container {
  width: 100%;
  max-width: 640px;
  aspect-ratio: 16 / 9;
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-md);
  background: #000;
}
.video-embed-container iframe {
  width: 100%;
  height: 100%;
}

/* 播放狀態與全局控制列 */
.play-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}

.play-status-tip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  color: #475569;
  background: #f1f5f9;
  padding: 0.4rem 0.85rem;
  border-radius: var(--radius-full);
}

.pulse-dot {
  width: 10px;
  height: 10px;
  background: #10b981;
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

/* 檢視模式：段落卡片 */
.lyrics-view-container {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding-bottom: 3rem;
}

.paragraph-card {
  background: white;
  border-radius: var(--radius-lg);
  border: 2px solid #e2e8f0;
  box-shadow: var(--shadow-sm);
  display: flex;
  padding: 1.5rem;
  gap: 1.5rem;
  transition: all 0.25s ease;
  position: relative;
}

.paragraph-card:hover {
  border-color: #cbd5e1;
  box-shadow: var(--shadow-md);
}

/* 正在播放的段落高亮 */
.paragraph-card.is-active {
  border-color: #6366f1;
  background: linear-gradient(135deg, #ffffff 0%, #f5f3ff 100%);
  box-shadow: 0 8px 25px rgba(99, 102, 241, 0.2);
  transform: scale(1.01);
}

/* 上次播放過的段落標記 */
.paragraph-card.is-last-played {
  border-color: #fbbf24;
  background: linear-gradient(135deg, #ffffff 0%, #fffbeb 100%);
}

.paragraph-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: flex-start;
  min-width: 140px;
}

.paragraph-badge {
  font-size: 0.8rem;
  font-weight: 700;
  color: #64748b;
  background: #f1f5f9;
  padding: 0.2rem 0.6rem;
  border-radius: 6px;
}

.btn-play-para {
  padding: 0.5rem 0.9rem;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: var(--radius-full);
  font-size: 0.85rem;
  font-weight: 600;
  color: #1e293b;
}

.btn-play-para:hover {
  background: #6366f1;
  color: white;
  border-color: #6366f1;
}

.btn-play-para.para-playing {
  background: #ef4444;
  color: white;
  border-color: #ef4444;
  animation: pulse-border 1.5s infinite;
}

.paragraph-text-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.paragraph-text {
  font-size: 1.35rem;
  line-height: 1.8;
  font-weight: 600;
  color: #1e293b;
  letter-spacing: 0.03em;
  white-space: pre-wrap;
}

.lyric-line {
  margin-bottom: 0.25rem;
}

.paragraph-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: #6366f1;
}
.paragraph-indicator.last-mark {
  color: #d97706;
}

/* 音波動畫 */
.sound-wave {
  display: inline-flex;
  gap: 3px;
  align-items: flex-end;
  height: 14px;
}
.sound-wave span {
  width: 3px;
  background-color: #6366f1;
  border-radius: 2px;
  animation: sound-wave-bar 1s infinite ease-in-out;
}
.sound-wave span:nth-child(1) { height: 6px; animation-delay: 0s; }
.sound-wave span:nth-child(2) { height: 14px; animation-delay: 0.2s; }
.sound-wave span:nth-child(3) { height: 10px; animation-delay: 0.4s; }
.sound-wave span:nth-child(4) { height: 8px; animation-delay: 0.1s; }

/* 編輯區 */
.edit-card {
  background: white;
  padding: 2rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.edit-hint-banner {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  font-size: 0.95rem;
}

/* 表單元件 */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.form-group label {
  font-weight: 700;
  font-size: 0.9rem;
  color: #334155;
}
.form-control {
  padding: 0.75rem 1rem;
  border: 1px solid #cbd5e1;
  border-radius: var(--radius-md);
  font-size: 1rem;
  outline: none;
  font-family: inherit;
  transition: border-color 0.2s;
}
.form-control:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
}
.lyrics-textarea {
  resize: vertical;
  line-height: 1.6;
}
.input-with-button {
  display: flex;
  gap: 0.5rem;
}
.input-with-button .form-control {
  flex: 1;
}

/* 圖示選擇器區域 */
.icon-selector-field {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.selected-icon-preview {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4f46e5;
}
.selected-icon-preview .material-symbols-outlined {
  font-size: 1.8rem;
}

.tip {
  font-size: 0.8rem;
  color: #64748b;
}
.error-tip {
  font-size: 0.8rem;
  color: #ef4444;
}

/* Modal 彈窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
  animation: fade-in 0.2s ease-out;
}
.modal-card {
  background: white;
  width: 100%;
  max-width: 600px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: scale-up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-header .title-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.modal-header .header-icon {
  color: #6366f1;
}
.modal-header h3 {
  font-size: 1.2rem;
  color: #0f172a;
}
.modal-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 75vh;
  overflow-y: auto;
}
.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  background: #f8fafc;
}
.tip-box {
  background: #fefce8;
  border: 1px solid #fef08a;
  color: #854d0e;
  padding: 0.75rem;
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  line-height: 1.5;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-box {
  text-align: center;
  background: white;
  padding: 3rem 2rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  max-width: 500px;
}
.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  display: inline-block;
  color: #f59e0b;
}

/* 動畫 */
@keyframes sound-wave-bar {
  0%, 100% { height: 4px; }
  50% { height: 16px; }
}
@keyframes pulse {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}
@keyframes pulse-border {
  0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.5); }
  50% { box-shadow: 0 0 0 6px rgba(99, 102, 241, 0); }
}
@keyframes slide-down {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes scale-up {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

/* 響應式佈局適應行動裝置或平板 */
@media (max-width: 860px) {
  .app-main {
    flex-direction: column;
    padding: 1rem;
  }
  .sidebar {
    width: 100%;
    height: auto;
    max-height: 280px;
  }
  .paragraph-card {
    flex-direction: column;
    gap: 1rem;
  }
  .paragraph-sidebar {
    flex-direction: row;
    justify-content: space-between;
    width: 100%;
  }
}
</style>
