<script setup lang="ts">
import { ref } from 'vue';
import { uploadSongShare } from '../utils/firebaseService';
import type { Song } from '../types';

const props = defineProps<{
  show: boolean;
  song: Song | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const isUploading = ref<boolean>(false);
const shareCode = ref<string>('');
const errorMsg = ref<string>('');
const isCopied = ref<boolean>(false);

async function handleStartShare() {
  if (!props.song) return;
  isUploading.value = true;
  errorMsg.value = '';
  shareCode.value = '';
  isCopied.value = false;

  try {
    const code = await uploadSongShare({ song: props.song });
    shareCode.value = code;
  } catch (err: any) {
    console.error('Firebase share error:', err);
    errorMsg.value = err.message || '分享失敗，請檢查網路連線或稍後再試';
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
</script>

<template>
  <div v-if="show" class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <div class="title-wrap">
          <span class="material-symbols-outlined header-icon">cloud_upload</span>
          <h3>雲端分享歌曲</h3>
        </div>
        <button class="btn-icon" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body" v-if="song">
        <div class="song-summary">
          <span class="material-symbols-outlined song-icon">{{ song.icon || 'music_note' }}</span>
          <div class="song-info">
            <h4 class="song-title">{{ song.title }}</h4>
            <span class="song-meta">即將為這首歌建立臨時雲端分享碼</span>
          </div>
        </div>

        <!-- 尚未產生代碼時 -->
        <div v-if="!shareCode" class="action-section">
          <p class="description">
            點擊下方按鈕上傳到 Firebase 雲端空間，將會產生一組 <strong>6 碼代碼</strong>。任何人在 <strong>24 小時內</strong> 只要輸入這組代碼就能直接匯入這首歌！
          </p>
          <div v-if="errorMsg" class="error-tip">{{ errorMsg }}</div>
          <button class="btn btn-primary btn-block" :disabled="isUploading" @click="handleStartShare">
            <span class="material-symbols-outlined btn-icon-inline">cloud_sync</span>
            {{ isUploading ? '正在建立分享碼...' : '立即產生 6 碼分享代碼' }}
          </button>
        </div>

        <!-- 成功產生代碼時 -->
        <div v-else class="result-section">
          <div class="code-box">
            <span class="code-label">您的專屬 6 碼分享代碼</span>
            <div class="code-display">{{ shareCode }}</div>
            <span class="code-validity">⏱️ 有效期：24 小時</span>
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
            👉 朋友或另一台裝置只需在網站頂部點選「<strong>雲端取歌</strong>」並輸入這 6 碼，即可瞬間同步學唱！
          </p>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" @click="emit('close')">關閉</button>
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
  max-width: 480px;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
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

.modal-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.song-summary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}

.song-icon {
  font-size: 2rem;
  color: #6366f1;
  background: #eef2ff;
  border-radius: 8px;
  padding: 0.25rem;
}

.song-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #1e293b;
}

.song-meta {
  font-size: 0.8rem;
  color: #64748b;
}

.description {
  font-size: 0.9rem;
  color: #475569;
  line-height: 1.6;
  margin-bottom: 1rem;
}

.code-box {
  background: linear-gradient(135deg, #eef2ff, #f5f3ff);
  border: 2px dashed #818cf8;
  border-radius: 16px;
  padding: 1.25rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.code-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #6366f1;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.code-display {
  font-size: 2.2rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  color: #1e1b4b;
  font-family: monospace;
}

.code-validity {
  font-size: 0.75rem;
  color: #64748b;
}

.copy-actions {
  margin-top: 1rem;
}

.guide-tip {
  font-size: 0.85rem;
  color: #475569;
  margin-top: 0.75rem;
  background: #f1f5f9;
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
}

.error-tip {
  color: #ef4444;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}

.btn-block {
  width: 100%;
}

.modal-footer {
  padding: 0.85rem 1.5rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  background: #f8fafc;
}

.btn {
  padding: 0.6rem 1.2rem;
  border-radius: 9999px;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: #6366f1;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #4f46e5;
}

.btn-secondary {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #334155;
}

.btn-secondary:hover {
  background: #f8fafc;
}

.btn-ghost {
  background: transparent;
  color: #64748b;
}

.btn-icon {
  background: transparent;
  border: none;
  font-size: 1.2rem;
  color: #64748b;
  cursor: pointer;
}
</style>
