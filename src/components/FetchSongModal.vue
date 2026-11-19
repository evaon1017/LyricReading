<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Song } from '../types';
import { fetchSongByCode, type SharedData } from '../utils/firebaseService';
import { getYouTubeThumbnailUrl, isSongIdentical } from '../utils/songHelper';

const props = defineProps<{
  show: boolean;
  existingSongs: Song[];
  initialCode?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'import-success', songs: Song[]): void;
}>();

type ModalStep = 'input' | 'confirm';

const step = ref<ModalStep>('input');
const inputCode = ref<string>('');
const fetchedCode = ref<string>('');
const isLoading = ref<boolean>(false);
const isAutoLoading = ref<boolean>(false);
const errorMsg = ref<string>('');

const totalIncomingCount = ref<number>(0);
const hiddenDuplicateCount = ref<number>(0);
const previewSongs = ref<Song[]>([]);
const selectedIndices = ref<number[]>([]);

let fetchSequence = 0;

function resetState() {
  fetchSequence++;
  step.value = 'input';
  inputCode.value = '';
  fetchedCode.value = '';
  isLoading.value = false;
  isAutoLoading.value = false;
  errorMsg.value = '';
  totalIncomingCount.value = 0;
  hiddenDuplicateCount.value = 0;
  previewSongs.value = [];
  selectedIndices.value = [];
}

watch(
  () => props.show,
  (isOpen) => {
    if (!isOpen) {
      resetState();
      return;
    }

    resetState();
    const initial = props.initialCode?.trim().toUpperCase() || '';
    if (initial) {
      inputCode.value = initial;
      handleFetch(true);
    }
  },
  { immediate: true }
);

const existingTitleSet = computed(() => {
  return new Set(props.existingSongs.map((s) => s.title.trim()));
});

const isAllSelected = computed(() => {
  return previewSongs.value.length > 0 && selectedIndices.value.length === previewSongs.value.length;
});

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIndices.value = [];
  } else {
    selectedIndices.value = previewSongs.value.map((_, idx) => idx);
  }
}

function toggleSong(index: number) {
  const pos = selectedIndices.value.indexOf(index);
  if (pos === -1) {
    selectedIndices.value.push(index);
  } else {
    selectedIndices.value.splice(pos, 1);
  }
}

function getParagraphCount(lyrics: string): number {
  if (!lyrics?.trim()) return 0;
  return lyrics
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0).length;
}

function getLyricsSnippet(lyrics: string): string {
  if (!lyrics?.trim()) return '';
  const firstLine = lyrics
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return firstLine || '';
}

function extractSongsFromSharedData(data: SharedData): Song[] {
  if (data.format === 'HanaSongs' && Array.isArray(data.songs)) {
    return data.songs;
  }
  if (data.song) {
    return [data.song];
  }
  return [];
}

async function handleFetch(autoFromLink = false) {
  const cleanCode = inputCode.value.trim().toUpperCase();
  if (!cleanCode) {
    errorMsg.value = '請輸入 6 碼分享代碼';
    return;
  }

  const currentSeq = ++fetchSequence;
  isLoading.value = true;
  isAutoLoading.value = autoFromLink;
  errorMsg.value = '';

  try {
    const data = await fetchSongByCode(cleanCode);
    if (currentSeq !== fetchSequence) return;

    const incomingList = extractSongsFromSharedData(data);
    if (incomingList.length === 0) {
      errorMsg.value = '該分享代碼內未包含任何歌曲！';
      return;
    }

    const nonDuplicates: Song[] = [];
    let duplicateCount = 0;

    for (const raw of incomingList) {
      const normalized: Song = {
        id: raw.id || '',
        title: (raw.title || '未命名歌曲').trim(),
        youtubeUrl: (raw.youtubeUrl || '').trim(),
        lyrics: (raw.lyrics || '').trim(),
        icon: (raw.icon || '').trim() || undefined,
        createdAt: raw.createdAt || Date.now()
      };

      const isDuplicate =
        props.existingSongs.some((existing) => isSongIdentical(existing, normalized)) ||
        nonDuplicates.some((accepted) => isSongIdentical(accepted, normalized));

      if (isDuplicate) {
        duplicateCount++;
        continue;
      }

      nonDuplicates.push(normalized);
    }

    fetchedCode.value = cleanCode;
    totalIncomingCount.value = incomingList.length;
    hiddenDuplicateCount.value = duplicateCount;
    previewSongs.value = nonDuplicates;
    selectedIndices.value = nonDuplicates.map((_, idx) => idx);
    step.value = 'confirm';
  } catch (err: any) {
    if (currentSeq !== fetchSequence) return;
    errorMsg.value = err.message || '查詢失敗，請檢查代碼或網路連線';
  } finally {
    if (currentSeq === fetchSequence) {
      isLoading.value = false;
      isAutoLoading.value = false;
    }
  }
}

function backToInput() {
  step.value = 'input';
  errorMsg.value = '';
}

function handleConfirmImport() {
  const chosenSongs = previewSongs.value.filter((_, idx) => selectedIndices.value.includes(idx));
  if (chosenSongs.length === 0) return;

  emit('import-success', chosenSongs);
  emit('close');
}
</script>

<template>
  <div v-if="show" class="modal-overlay" @click.self="emit('close')">
    <div :class="['modal-card', { 'modal-card-wide': step === 'confirm' }]">
      <div class="modal-header">
        <div class="title-wrap">
          <span class="material-symbols-outlined header-icon">
            {{ step === 'confirm' ? 'playlist_add_check' : 'cloud_download' }}
          </span>
          <h3>{{ step === 'confirm' ? '確認匯入歌曲' : '雲端匯入歌曲' }}</h3>
          <span v-if="step === 'confirm' && fetchedCode" class="code-pill">{{ fetchedCode }}</span>
        </div>
        <button class="btn-icon" @click="emit('close')">✕</button>
      </div>

      <!-- 步驟 1：輸入代碼 或 透過網址自動載入中 -->
      <template v-if="step === 'input'">
        <div v-if="isAutoLoading && isLoading" class="modal-body auto-loading-body">
          <div class="loading-spinner"></div>
          <p class="loading-title">正在讀取分享歌曲清單...</p>
          <p class="loading-sub">分享代碼：<strong>{{ inputCode }}</strong></p>
        </div>

        <div v-else class="modal-body">
          <p class="description">
            請輸入對方分享給您的 <strong>6 碼英數代碼</strong>（不分大小寫），確定後可先預覽並確認要匯入的歌曲清單：
          </p>

          <div class="input-wrap">
            <input
              v-model="inputCode"
              type="text"
              maxlength="6"
              class="code-input"
              placeholder="例如：H7K9X2"
              @keyup.enter="handleFetch(false)"
            />
          </div>

          <div v-if="errorMsg" class="error-tip">
            ⚠️ {{ errorMsg }}
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" @click="emit('close')">取消</button>
          <button
            v-if="!(isAutoLoading && isLoading)"
            class="btn btn-primary"
            :disabled="isLoading || !inputCode.trim()"
            @click="handleFetch(false)"
          >
            <span class="material-symbols-outlined btn-icon-inline">search</span>
            {{ isLoading ? '正在查詢歌曲...' : '確定' }}
          </button>
        </div>
      </template>

      <!-- 步驟 2：列出此代碼包含的歌曲（完全重複的歌曲直接隱藏） -->
      <template v-else>
        <div class="modal-body confirm-body">
          <!-- 情況 A：全部歌曲皆已存在且內容完全重複 -->
          <div v-if="previewSongs.length === 0" class="all-duplicate-box">
            <span class="material-symbols-outlined all-dup-icon">library_add_check</span>
            <h4>這些歌曲都已經在您的歌庫中囉！</h4>
            <p>
              分享代碼 <strong>{{ fetchedCode }}</strong> 共包含 {{ totalIncomingCount }} 首歌曲，但內容皆與您現有的歌單完全相同，已自動隱藏重複項目。
            </p>
          </div>

          <!-- 情況 B：顯示可匯入的非重複歌曲 -->
          <template v-else>
            <div class="confirm-summary-banner">
              <p class="description">
                找到 <strong>{{ previewSongs.length }}</strong> 首可匯入的歌曲，請確認清單並點擊下方按鈕加入您的歌庫：
              </p>
              <span v-if="hiddenDuplicateCount > 0" class="hidden-dup-badge">
                <span class="material-symbols-outlined badge-icon">visibility_off</span>
                已自動隱藏 {{ hiddenDuplicateCount }} 首完全重複的歌曲
              </span>
            </div>

            <div class="toolbar-row">
              <button class="btn-text" @click="toggleSelectAll">
                {{ isAllSelected ? '取消全選' : '全部選取' }}
              </button>
              <span class="select-count">
                已勾選 {{ selectedIndices.length }} / {{ previewSongs.length }} 首
              </span>
            </div>

            <div class="song-confirm-list">
              <div
                v-for="(song, idx) in previewSongs"
                :key="idx"
                :class="['confirm-song-item', { checked: selectedIndices.includes(idx) }]"
                @click="toggleSong(idx)"
              >
                <input
                  type="checkbox"
                  :checked="selectedIndices.includes(idx)"
                  @click.stop="toggleSong(idx)"
                />

                <!-- 縮圖或圖示 -->
                <div class="song-thumb-box">
                  <img
                    v-if="!song.icon && getYouTubeThumbnailUrl(song.youtubeUrl)"
                    :src="getYouTubeThumbnailUrl(song.youtubeUrl)!"
                    class="song-thumb-img"
                    alt=""
                    loading="lazy"
                  />
                  <span v-else class="material-symbols-outlined song-icon">
                    {{ song.icon || 'music_note' }}
                  </span>
                </div>

                <div class="song-info">
                  <div class="song-title-row">
                    <span class="song-title">{{ song.title }}</span>
                    <span
                      v-if="existingTitleSet.has(song.title.trim())"
                      class="rename-badge"
                      title="歌庫已有同名但內容不同的歌曲，匯入時會自動加上編號區分"
                    >
                      同名不同內容
                    </span>
                  </div>
                  <div class="song-meta-row">
                    <span class="meta-chip">共 {{ getParagraphCount(song.lyrics) }} 段歌詞</span>
                    <span v-if="song.youtubeUrl" class="meta-yt">YouTube</span>
                  </div>
                  <div v-if="getLyricsSnippet(song.lyrics)" class="song-snippet">
                    {{ getLyricsSnippet(song.lyrics) }}
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <div class="modal-footer confirm-footer">
          <button class="btn btn-ghost" @click="backToInput">
            <span class="material-symbols-outlined btn-icon-inline">arrow_back</span>
            輸入其他代碼
          </button>
          <div class="footer-right-actions">
            <button class="btn btn-ghost" @click="emit('close')">
              {{ previewSongs.length === 0 ? '關閉' : '取消' }}
            </button>
            <button
              v-if="previewSongs.length > 0"
              class="btn btn-primary"
              :disabled="selectedIndices.length === 0"
              @click="handleConfirmImport"
            >
              <span class="material-symbols-outlined btn-icon-inline">download</span>
              確認匯入 ({{ selectedIndices.length }} 首)
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 150;
  padding: 1rem;
}
.modal-card {
  background: white;
  width: 100%;
  max-width: 440px;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 86vh;
  transition: max-width 0.2s ease;
}
.modal-card-wide {
  max-width: 560px;
}
.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.title-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.header-icon {
  color: #6366f1;
}
.modal-header h3 {
  font-size: 1.2rem;
  font-weight: 700;
  color: #0f172a;
}
.code-pill {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #4f46e5;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
}
.btn-icon {
  background: transparent;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #64748b;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
}
.btn-icon:hover {
  background: #f1f5f9;
}
.modal-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
}
.confirm-body {
  padding: 1.25rem 1.5rem;
  gap: 0.85rem;
}
.auto-loading-body {
  align-items: center;
  text-align: center;
  padding: 2.5rem 1.5rem;
  gap: 0.6rem;
}
.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e0e7ff;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 0.4rem;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.loading-title {
  font-size: 1rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}
.loading-sub {
  font-size: 0.9rem;
  color: #64748b;
  margin: 0;
}
.description {
  font-size: 0.95rem;
  color: #475569;
  line-height: 1.5;
  margin: 0;
}
.input-wrap {
  display: flex;
  justify-content: center;
  margin: 0.5rem 0;
}
.code-input {
  width: 100%;
  font-size: 1.8rem;
  font-weight: 800;
  letter-spacing: 0.25em;
  text-align: center;
  text-transform: uppercase;
  padding: 0.75rem 1rem;
  border: 2px solid #cbd5e1;
  border-radius: 12px;
  color: #4f46e5;
  background: #f8fafc;
  outline: none;
  transition: all 0.2s;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
}
.code-input:focus {
  border-color: #6366f1;
  background: white;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
}
.error-tip {
  background: #fef2f2;
  color: #dc2626;
  padding: 0.6rem 0.85rem;
  border-radius: 8px;
  font-size: 0.85rem;
}

/* 確認匯入步驟樣式 */
.confirm-summary-banner {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.hidden-dup-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  align-self: flex-start;
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
}
.badge-icon {
  font-size: 0.95rem;
  color: #64748b;
}
.toolbar-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #f1f5f9;
}
.btn-text {
  background: none;
  border: none;
  color: #6366f1;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}
.btn-text:hover {
  background: #eef2ff;
}
.select-count {
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 500;
}
.song-confirm-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 0.25rem;
}
.confirm-song-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.85rem;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: all 0.15s;
}
.confirm-song-item:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}
.confirm-song-item.checked {
  background: #f5f3ff;
  border-color: #a5b4fc;
}
.confirm-song-item input[type='checkbox'] {
  width: 18px;
  height: 18px;
  accent-color: #6366f1;
  cursor: pointer;
  flex-shrink: 0;
}
.song-thumb-box {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: #eef2ff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.song-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.song-icon {
  font-size: 1.4rem;
  color: #4f46e5;
}
.song-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  flex: 1;
}
.song-title-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.song-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.rename-badge {
  font-size: 0.7rem;
  font-weight: 600;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fde68a;
  padding: 0.08rem 0.45rem;
  border-radius: 9999px;
  flex-shrink: 0;
}
.song-meta-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}
.meta-chip {
  font-size: 0.75rem;
  color: #64748b;
}
.meta-yt {
  font-size: 0.7rem;
  font-weight: 700;
  color: #dc2626;
  background: #fee2e2;
  padding: 0.05rem 0.4rem;
  border-radius: 9999px;
}
.song-snippet {
  font-size: 0.78rem;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.all-duplicate-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 1.5rem 1rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  gap: 0.5rem;
}
.all-dup-icon {
  font-size: 2.6rem;
  color: #16a34a;
}
.all-duplicate-box h4 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #15803d;
}
.all-duplicate-box p {
  margin: 0;
  font-size: 0.88rem;
  color: #166534;
  line-height: 1.5;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.75rem;
  background: #f8fafc;
  flex-shrink: 0;
}
.confirm-footer {
  justify-content: space-between;
}
.footer-right-actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.btn {
  padding: 0.55rem 1.2rem;
  border-radius: 9999px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid transparent;
  transition: all 0.2s;
}
.btn-primary {
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: white;
  border: none;
}
.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #4f46e5, #4338ca);
}
.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-ghost {
  background: transparent;
  color: #64748b;
}
.btn-ghost:hover {
  background: #e2e8f0;
}
.btn-icon-inline {
  font-size: 1.15rem;
  vertical-align: middle;
}

@media (max-width: 520px) {
  .modal-overlay {
    padding: 0.5rem;
  }
  .modal-card {
    border-radius: 14px;
    max-height: 90vh;
  }
  .modal-header, .modal-body, .modal-footer {
    padding: 1rem;
  }
  .code-input {
    font-size: 1.4rem;
    letter-spacing: 0.15em;
    padding: 0.6rem 0.8rem;
  }
  .modal-footer {
    flex-direction: column-reverse;
    align-items: stretch;
  }
  .confirm-footer {
    flex-direction: column-reverse;
  }
  .footer-right-actions {
    flex-direction: column-reverse;
    width: 100%;
  }
  .modal-footer .btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
