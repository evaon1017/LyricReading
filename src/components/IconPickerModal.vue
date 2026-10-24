<script setup lang="ts">
import { ref, computed } from 'vue';
import { AVAILABLE_ICONS, type IconOption } from '../utils/iconHelper';

const props = defineProps<{
  modelValue: string;
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'close'): void;
}>();

const selectedCategory = ref<string>('全部');
const searchQuery = ref<string>('');

const categories = computed(() => {
  const cats = new Set(AVAILABLE_ICONS.map((i) => i.category));
  return ['全部', ...Array.from(cats)];
});

const filteredIcons = computed(() => {
  return AVAILABLE_ICONS.filter((icon) => {
    const matchesCat = selectedCategory.value === '全部' || icon.category === selectedCategory.value;
    const matchesSearch =
      !searchQuery.value.trim() ||
      icon.label.includes(searchQuery.value.trim()) ||
      icon.name.includes(searchQuery.value.trim());
    return matchesCat && matchesSearch;
  });
});

function selectIcon(icon: IconOption) {
  emit('update:modelValue', icon.name);
  emit('close');
}
</script>

<template>
  <div v-if="show" class="icon-modal-overlay" @click.self="emit('close')">
    <div class="icon-modal-card">
      <div class="icon-modal-header">
        <div class="title-wrap">
          <span class="material-symbols-outlined header-icon">palette</span>
          <h3>挑選歌曲圖示 (Google Material Icons)</h3>
        </div>
        <button class="btn-close" @click="emit('close')">✕</button>
      </div>

      <div class="icon-filter-bar">
        <!-- 搜尋 -->
        <div class="search-box">
          <span class="material-symbols-outlined">search</span>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜尋圖示名稱或關鍵字..."
            class="search-input"
          />
        </div>
        <!-- 分類切換標籤 -->
        <div class="category-tabs">
          <button
            v-for="cat in categories"
            :key="cat"
            :class="['cat-btn', { active: selectedCategory === cat }]"
            @click="selectedCategory = cat"
          >
            {{ cat }}
          </button>
        </div>
      </div>

      <div class="icon-grid-container">
        <div
          v-for="icon in filteredIcons"
          :key="icon.name"
          :class="['icon-choice-card', { selected: modelValue === icon.name }]"
          @click="selectIcon(icon)"
          :title="icon.label"
        >
          <span class="material-symbols-outlined icon-display">{{ icon.name }}</span>
          <span class="icon-label">{{ icon.label }}</span>
        </div>

        <div v-if="filteredIcons.length === 0" class="no-icons">
          找不到相關圖示，請嘗試其他關鍵字
        </div>
      </div>

      <div class="icon-modal-footer">
        <button class="btn-cancel" @click="emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.icon-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 1rem;
}

.icon-modal-card {
  background: white;
  width: 100%;
  max-width: 580px;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  animation: scale-up 0.2s ease-out;
}

.icon-modal-header {
  padding: 1.2rem 1.5rem;
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
  font-size: 1.5rem;
}

.icon-modal-header h3 {
  font-size: 1.15rem;
  font-weight: 700;
  color: #0f172a;
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 1.25rem;
  color: #64748b;
  cursor: pointer;
  padding: 0.25rem;
}

.icon-filter-bar {
  padding: 1rem 1.5rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.4rem 0.75rem;
  color: #64748b;
}

.search-input {
  border: none;
  outline: none;
  font-size: 0.9rem;
  width: 100%;
}

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.cat-btn {
  border: 1px solid #e2e8f0;
  background: white;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
  font-size: 0.8rem;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.cat-btn.active {
  background: #6366f1;
  color: white;
  border-color: #6366f1;
}

.icon-grid-container {
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 0.8rem;
  min-height: 250px;
}

.icon-choice-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.85rem 0.5rem;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  cursor: pointer;
  background: #ffffff;
  transition: all 0.2s;
}

.icon-choice-card:hover {
  border-color: #818cf8;
  background: #f5f3ff;
  transform: translateY(-2px);
}

.icon-choice-card.selected {
  border-color: #6366f1;
  background: #eef2ff;
  box-shadow: 0 0 0 2px #6366f1;
}

.icon-display {
  font-size: 2rem;
  color: #334155;
}

.icon-choice-card.selected .icon-display {
  color: #6366f1;
}

.icon-label {
  font-size: 0.75rem;
  color: #64748b;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.no-icons {
  grid-column: 1 / -1;
  text-align: center;
  color: #94a3b8;
  padding: 2rem 0;
}

.icon-modal-footer {
  padding: 0.85rem 1.5rem;
  border-top: 1px solid #e2e8f0;
  display: flex;
  justify-content: flex-end;
  background: #f8fafc;
}

.btn-cancel {
  padding: 0.5rem 1.2rem;
  border-radius: 9999px;
  border: 1px solid #cbd5e1;
  background: white;
  color: #475569;
  font-weight: 600;
  cursor: pointer;
}

@keyframes scale-up {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
