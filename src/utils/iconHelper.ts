export interface IconOption {
  name: string;
  label: string;
  category: string;
}

export const AVAILABLE_ICONS: IconOption[] = [
  // 音樂與表演
  { name: 'music_note', label: '音符', category: '音樂' },
  { name: 'queue_music', label: '歌單', category: '音樂' },
  { name: 'headphones', label: '耳機', category: '音樂' },
  { name: 'mic', label: '麥克風', category: '音樂' },
  { name: 'piano', label: '鋼琴', category: '音樂' },
  { name: 'graphic_eq', label: '節奏', category: '音樂' },
  { name: 'radio', label: '收音機', category: '音樂' },
  { name: 'speaker', label: '音箱', category: '音樂' },

  // 可愛動物
  { name: 'cruelty_free', label: '小兔子/動物', category: '可愛動物' },
  { name: 'pets', label: '小爪印', category: '可愛動物' },
  { name: 'flutter_dash', label: '小鳥', category: '可愛動物' },
  { name: 'pest_control_rodent', label: '小老鼠', category: '可愛動物' },

  // 大自然與天文
  { name: 'star', label: '閃亮星星', category: '自然景觀' },
  { name: 'wb_sunny', label: '大太陽', category: '自然景觀' },
  { name: 'bedtime', label: '彎彎月亮', category: '自然景觀' },
  { name: 'cloud', label: '朵朵白雲', category: '自然景觀' },
  { name: 'water_drop', label: '小雨滴', category: '自然景觀' },
  { name: 'air', label: '微風', category: '自然景觀' },
  { name: 'eco', label: '小樹葉', category: '自然景觀' },
  { name: 'local_florist', label: '小花朵', category: '自然景觀' },
  { name: 'park', label: '森林大樹', category: '自然景觀' },
  { name: 'rainbow', label: '美麗彩虹', category: '自然景觀' },

  // 童趣與歡樂
  { name: 'child_care', label: '可愛寶貝', category: '童趣歡樂' },
  { name: 'toys', label: '旋轉玩具', category: '童趣歡樂' },
  { name: 'sports_esports', label: '遊戲手把', category: '童趣歡樂' },
  { name: 'celebration', label: '歡樂彩帶', category: '童趣歡樂' },
  { name: 'cake', label: '生日蛋糕', category: '童趣歡樂' },
  { name: 'palette', label: '繪畫調色盤', category: '童趣歡樂' },
  { name: 'school', label: '小學校', category: '童趣歡樂' },
  { name: 'favorite', label: '愛心', category: '童趣歡樂' },
  { name: 'emoji_events', label: '金牌獎盃', category: '童趣歡樂' },
  { name: 'rocket_launch', label: '衝天火箭', category: '童趣歡樂' },
  { name: 'directions_car', label: '小汽車', category: '交通工具' },
  { name: 'train', label: '嘟嘟火車', category: '交通工具' },
  { name: 'sailing', label: '小帆船', category: '交通工具' },
  { name: 'flight', label: '小飛機', category: '交通工具' }
];

export const DEFAULT_SONG_ICON = 'music_note';
