<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Song } from '../types';

const props = defineProps<{
  show: boolean;
  songs: Song[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const selectedSongIds = ref<string[]>([]);

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

// 執行批次匯出
function doBatchExport() {
  if (selectedSongIds.value.length === 0) {
    alert('請至少勾選一首要匯出的歌曲！');
    return;
  }

  const exportList = props.songs.filter((s) => selectedSongIds.value.includes(s.id));
  const exportPayload = {
    format: 'HanaSongs',
    version: '1.0',
    count: exportList.length,
    exportedAt: new Date().toISOString(),
    songs: exportList
  };

  const jsonStr = JSON.stringify(exportPayload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `學唱歌曲集錦_${dateStr}_(${exportList.length}首).HanaSongs`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  emit('close');
}
</script>

<template>
  <div v-if="show" class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <div class="title-wrap">
          <span class="material-symbols-outlined header-icon">file_copy</span>
          <h3>批次匯出歌曲 (.HanaSongs)</h3>
        </div>
        <button class="btn-icon" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
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
            <span class="material-symbols-outlined song-icon">
              {{ song.icon || 'music_note' }}
            </span>
            <div class="song-info">
              <span class="song-title">{{ song.title }}</span>
              <span class="song-sub" v-if="song.youtubeUrl">已綁定 YouTube</span>
            </div>
          </div>
          <div v-if="songs.length === 0" class="empty-tip">
            目前歌單中還沒有歌曲
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" @click="emit('close')">取消</button>
        <button
          class="btn btn-primary"
          :disabled="selectedSongIds.length === 0"
          @click="doBatchExport"
        >
          匯出選取歌曲 ({{ selectedSongIds.length }})
        </button>
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
  max-height: 80vh;
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
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
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
}
.song-checkbox-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 320px;
  overflow-y: auto;
}
.checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
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
}
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
}
.btn-primary {
  background: #6366f1;
  color: white;
  border: none;
}
.btn-primary:hover:not(:disabled) {
  background: #4f46e5;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-ghost {
  background: transparent;
  color: #64748b;
  border: none;
}
.btn-icon {
  background: transparent;
  border: none;
  font-size: 1.2rem;
  color: #64748b;
  cursor: pointer;
}
</style>
