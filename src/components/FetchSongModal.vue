<script setup lang="ts">
import { ref } from 'vue';
import { fetchSongByCode, type SharedData } from '../utils/firebaseService';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'import-success', data: SharedData): void;
}>();

const inputCode = ref<string>('');
const isLoading = ref<boolean>(false);
const errorMsg = ref<string>('');

async function handleFetch() {
  if (!inputCode.value.trim()) {
    errorMsg.value = '請輸入 6 碼分享代碼';
    return;
  }

  isLoading.value = true;
  errorMsg.value = '';

  try {
    const data = await fetchSongByCode(inputCode.value.trim());
    emit('import-success', data);
    inputCode.value = '';
    emit('close');
  } catch (err: any) {
    errorMsg.value = err.message || '查詢失敗，請檢查代碼或網路連線';
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div v-if="show" class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <div class="title-wrap">
          <span class="material-symbols-outlined header-icon">cloud_download</span>
          <h3>雲端取歌 (輸入代碼)</h3>
        </div>
        <button class="btn-icon" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <p class="description">
          請輸入對方分享給您的 <strong>6 碼英數代碼</strong>（不分大小寫），系統將直接從雲端下載歌曲與歌詞：
        </p>

        <div class="input-wrap">
          <input
            v-model="inputCode"
            type="text"
            maxlength="6"
            class="code-input"
            placeholder="例如：H7K9X2"
            @keyup.enter="handleFetch"
          />
        </div>

        <div v-if="errorMsg" class="error-tip">
          ⚠️ {{ errorMsg }}
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" @click="emit('close')">取消</button>
        <button
          class="btn btn-primary"
          :disabled="isLoading || !inputCode.trim()"
          @click="handleFetch"
        >
          <span class="material-symbols-outlined btn-icon-inline">download</span>
          {{ isLoading ? '正在查詢下載...' : '立即下載匯入' }}
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
  max-width: 440px;
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
  gap: 1rem;
}
.description {
  font-size: 0.9rem;
  color: #475569;
  line-height: 1.6;
}
.input-wrap {
  display: flex;
  justify-content: center;
  margin: 0.5rem 0;
}
.code-input {
  width: 100%;
  text-align: center;
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: 0.25em;
  padding: 0.75rem 1rem;
  border: 2px solid #cbd5e1;
  border-radius: 12px;
  outline: none;
  font-family: monospace;
  text-transform: uppercase;
  color: #1e1b4b;
  transition: all 0.2s;
}
.code-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
}
.error-tip {
  color: #ef4444;
  font-size: 0.85rem;
  background: #fef2f2;
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
  border: 1px solid #fecaca;
}
.modal-footer {
  padding: 0.85rem 1.5rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
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
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
