<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Song } from '../types';
import { uploadSongShare } from '../utils/firebaseService';
import { getYouTubeThumbnailUrl } from '../utils/songHelper';

const props = defineProps<{
  show: boolean;
  songs: Song[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const selectedSongIds = ref<string[]>([]);
const isUploading = ref<boolean>(false);
const shareCode = ref<string>('');
const errorMsg = ref<string>('');
const isCopied = ref<boolean>(false);
const exportedCount = ref<number>(0);

// 當彈窗打開時重置狀態並預設全選
watch(
  () => props.show,
  (val) => {
    if (val) {
      shareCode.value = '';
      errorMsg.value = '';
      isCopied.value = false;
      selectedSongIds.value = props.songs.map((s) => s.id);
    }
  }
);

// 全選狀態
const isAllSelected = computed(() => {
  return props.songs.length > 0 && selectedSongIds.value.length === props.songs.length;
});

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedSongIds.value = [];
  } else {
    selectedSongIds.value = props.songs.map((s) => s.id);
  }
}

function toggleSong(id: string) {
  const idx = selectedSongIds.value.indexOf(id);
  if (idx === -1) {
    selectedSongIds.value.push(id);
  } else {
    selectedSongIds.value.splice(idx, 1);
  }
}

// 執行雲端批次匯出
async function handleCloudExport() {
  if (selectedSongIds.value.length === 0) {
    errorMsg.value = '請至少勾選一首要匯出的歌曲！';
    return;
  }

  isUploading.value = true;
  errorMsg.value = '';
  isCopied.value = false;

  try {
    const exportList = props.songs.filter((s) => selectedSongIds.value.includes(s.id));
    exportedCount.value = exportList.length;
    const code = await uploadSongShare({ songs: exportList });
    shareCode.value = code;
  } catch (err: any) {
    console.error('Cloud batch export error:', err);
    errorMsg.value = err.message || '雲端匯出失敗，請檢查網路連線或稍後再試';
  } finally {
    isUploading.value = false;
  }
}

function copyCode() {
  if (!shareCode.value) return;
  navigator.clipboard.writeText(shareCode.value).then(() => {
    isCopied.value = true;
    setTimeout(() => {
      isCopied.value = false;
    }, 2000);
  });
}

function resetToSelection() {
  shareCode.value = '';
  errorMsg.value = '';
  isCopied.value = false;
}
</script>

<template>
  <div v-if="show" class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <div class="title-wrap">
          <span class="material-symbols-outlined header-icon">cloud_upload</span>
          <h3>{{ shareCode ? '雲端分享代碼已生成' : '批次匯出歌曲至雲端' }}</h3>
        </div>
        <button class="btn-icon" @click="emit('close')">✕</button>
      </div>

      <!-- 尚未產生代碼時：挑選要匯出的歌曲 -->
      <div v-if="!shareCode" class="modal-body">
        <p class="description">
          請勾選您想分享的歌曲，系統將上傳至 Firebase 雲端空間並產生一組 <strong>6 碼代碼</strong>。
        </p>

        <div class="toolbar-row">
          <button class="btn-text" @click="toggleSelectAll">
            {{ isAllSelected ? '取消全選' : '全部選取' }}
          </button>
          <span class="select-count">已勾選 {{ selectedSongIds.length }} / {{ songs.length }} 首</span>
        </div>

        <div class="song-checkbox-list">
          <div
            v-for="song in songs"
            :key="song.id"
            :class="['checkbox-item', { checked: selectedSongIds.includes(song.id) }]"
            @click="toggleSong(song.id)"
          >
            <input
              type="checkbox"
              :checked="selectedSongIds.includes(song.id)"
              @click.stop="toggleSong(song.id)"
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
              <span class="song-title">{{ song.title }}</span>
              <span class="song-sub" v-if="song.youtubeUrl">已連結 YouTube</span>
            </div>
          </div>

          <div v-if="songs.length === 0" class="empty-tip">
            目前歌單中還沒有歌曲，請先新增歌曲
          </div>
        </div>

        <div v-if="errorMsg" class="error-tip">
          ⚠️ {{ errorMsg }}
        </div>
      </div>

      <!-- 成功產生代碼時 -->
      <div v-else class="modal-body result-section">
        <div class="success-banner">
          <span class="material-symbols-outlined success-icon">check_circle</span>
          <div class="success-text">
            <h4>成功打包 {{ exportedCount }} 首歌曲！</h4>
            <p>已上傳至雲端空間，可透過下方 6 碼代碼一鍵匯入。</p>
          </div>
        </div>

        <div class="code-box">
          <span class="code-label">您的專屬 6 碼分享代碼</span>
          <div class="code-display">{{ shareCode }}</div>
          <span class="code-validity">⏱️ 有效期：24 小時（過期將自動清除）</span>
        </div>

        <div class="copy-actions">
          <button class="btn btn-secondary btn-block" @click="copyCode">
            <span class="material-symbols-outlined btn-icon-inline">
              {{ isCopied ? 'check' : 'content_copy' }}
            </span>
            {{ isCopied ? '已複製代碼！' : '一鍵複製分享代碼' }}
          </button>
        </div>

        <p class="guide-tip">
          👉 對方只需在網站頂部點選「<strong>匯入</strong>」並輸入這 6 碼，即可瞬間將這 {{ exportedCount }} 首歌曲同步進歌單！
        </p>
      </div>

      <!-- 底部按鈕列 -->
      <div class="modal-footer">
        <template v-if="!shareCode">
          <button class="btn btn-ghost" @click="emit('close')">取消</button>
          <button
            class="btn btn-primary"
            :disabled="selectedSongIds.length === 0 || isUploading"
            @click="handleCloudExport"
          >
            <span class="material-symbols-outlined btn-icon-inline">cloud_sync</span>
            {{ isUploading ? '正在打包上傳中...' : `產生雲端分享碼 (${selectedSongIds.length} 首)` }}
          </button>
        </template>
        <template v-else>
          <button class="btn btn-ghost" @click="resetToSelection">重新選擇歌曲</button>
          <button class="btn btn-primary" @click="emit('close')">完成</button>
        </template>
      </div>
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
  max-width: 540px;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 85vh;
}
.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.description {
  font-size: 0.9rem;
  color: #475569;
  line-height: 1.5;
  margin: 0;
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
.song-checkbox-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 280px;
  overflow-y: auto;
  padding-right: 0.25rem;
}
.checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: all 0.15s;
}
.checkbox-item:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}
.checkbox-item.checked {
  background: #f5f3ff;
  border-color: #a5b4fc;
}
.checkbox-item input[type='checkbox'] {
  width: 18px;
  height: 18px;
  accent-color: #6366f1;
  cursor: pointer;
}
.song-thumb-box {
  width: 40px;
  height: 40px;
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
  font-size: 1.3rem;
  color: #4f46e5;
}
.song-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.song-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-sub {
  font-size: 0.75rem;
  color: #dc2626;
  margin-top: 0.1rem;
}
.empty-tip {
  text-align: center;
  padding: 2rem 1rem;
  color: #94a3b8;
  font-size: 0.9rem;
}
.error-tip {
  background: #fef2f2;
  color: #dc2626;
  padding: 0.6rem 0.85rem;
  border-radius: 8px;
  font-size: 0.85rem;
}

/* 成功畫面樣式 */
.result-section {
  gap: 1.25rem;
}
.success-banner {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  padding: 0.85rem 1rem;
}
.success-icon {
  font-size: 2.2rem;
  color: #16a34a;
  flex-shrink: 0;
}
.success-text h4 {
  margin: 0;
  font-size: 1.05rem;
  color: #15803d;
  font-weight: 700;
}
.success-text p {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: #166534;
}
.code-box {
  background: linear-gradient(135deg, #f8fafc, #f1f5f9);
  border: 2px dashed #cbd5e1;
  border-radius: 14px;
  padding: 1.25rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.code-label {
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 600;
}
.code-display {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
  font-size: 2.4rem;
  font-weight: 800;
  color: #4f46e5;
  letter-spacing: 0.25em;
  padding: 0.4rem 0;
  user-select: all;
}
.code-validity {
  font-size: 0.8rem;
  color: #94a3b8;
}
.copy-actions {
  display: flex;
}
.btn-block {
  width: 100%;
  justify-content: center;
}
.guide-tip {
  font-size: 0.88rem;
  color: #334155;
  background: #eff6ff;
  border-left: 4px solid #3b82f6;
  padding: 0.75rem 1rem;
  border-radius: 0 8px 8px 0;
  line-height: 1.5;
  margin: 0;
}

/* 底部按鈕 */
.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  background: #f8fafc;
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
  background: #e2e8f0;
}
.btn-icon-inline {
  font-size: 1.15rem;
  vertical-align: middle;
}

@media (max-width: 480px) {
  .modal-overlay {
    padding: 0.5rem;
  }
  .modal-card {
    max-height: 90vh;
    border-radius: 14px;
  }
  .modal-header, .modal-body, .modal-footer {
    padding: 1rem;
  }
  .code-display {
    font-size: 1.8rem;
    letter-spacing: 0.15em;
  }
  .modal-footer {
    flex-direction: column-reverse;
  }
  .modal-footer .btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
