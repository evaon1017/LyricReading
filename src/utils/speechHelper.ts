import type { SpeechSettings } from '../types';

/**
 * 將一段歌詞文字拆解為「文字片段」與「停頓延遲」的序列
 * 規則：
 * 歌詞中每遇到空白，停頓一個字的時間 (預設 pausePerSpaceMs，一般約 320ms ~ 360ms)
 * 2 個連續空白則停頓 2 倍時間
 */
export interface SpeechToken {
  type: 'word' | 'pause';
  text?: string;
  pauseMs?: number;
}

export function parseTokens(text: string, pausePerSpaceMs: number): SpeechToken[] {
  const tokens: SpeechToken[] = [];
  // 逐字元或分詞掃描，連續空格累積停頓
  let currentWord = '';

  const pushWord = () => {
    if (currentWord.length > 0) {
      tokens.push({ type: 'word', text: currentWord });
      currentWord = '';
    }
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === ' ' || char === '\u3000') {
      // 遇到空格：停頓時間減半 (預設由 320ms 降為 pausePerSpaceMs / 2 或可直接傳入更小的值)
      pushWord();
      let spaceCount = 1;
      while (i + 1 < text.length && (text[i + 1] === ' ' || text[i + 1] === '\u3000')) {
        spaceCount++;
        i++;
      }
      tokens.push({
        type: 'pause',
        pauseMs: Math.round(spaceCount * pausePerSpaceMs)
      });
    } else if (char === '\n') {
      // 單行換行呼吸停頓減半
      pushWord();
      tokens.push({
        type: 'pause',
        pauseMs: Math.round(pausePerSpaceMs * 0.5)
      });
    } else {
      currentWord += char;
    }
  }

  pushWord();
  return tokens;
}

export class LyricSpeaker {
  private isCancelled = false;
  private currentTimer: number | null = null;

  public stop(): void {
    this.isCancelled = true;
    if (this.currentTimer !== null) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  /**
   * 朗讀單一段落
   * @param paragraphText 段落文字
   * @param settings 語音設定
   * @param onTokenSpoken 朗讀過程中的進度回呼
   */
  public async speakParagraph(
    paragraphText: string,
    settings: SpeechSettings,
    onTokenSpoken?: (token: SpeechToken) => void
  ): Promise<boolean> {
    this.stop();
    this.isCancelled = false;

    if (!('speechSynthesis' in window)) {
      alert('您的瀏覽器不支援 Web Speech API 語音朗讀功能');
      return false;
    }

    const tokens = parseTokens(paragraphText, settings.pausePerSpaceMs || 320);
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice: SpeechSynthesisVoice | undefined;

    if (settings.voiceURI) {
      selectedVoice = voices.find((v) => v.voiceURI === settings.voiceURI);
    }
    if (!selectedVoice) {
      // 優先尋找中文語音 (zh-TW, zh-HK, zh-CN)
      selectedVoice =
        voices.find((v) => v.lang.includes('zh-TW') || v.lang.includes('zh_TW')) ||
        voices.find((v) => v.lang.startsWith('zh')) ||
        voices[0];
    }

    for (const token of tokens) {
      if (this.isCancelled) return false;

      if (token.type === 'pause' && token.pauseMs) {
        if (onTokenSpoken) onTokenSpoken(token);
        await new Promise<void>((resolve) => {
          this.currentTimer = window.setTimeout(() => {
            this.currentTimer = null;
            resolve();
          }, token.pauseMs);
        });
      } else if (token.type === 'word' && token.text) {
        if (this.isCancelled) return false;
        if (onTokenSpoken) onTokenSpoken(token);

        await new Promise<void>((resolve) => {
          const utterance = new SpeechSynthesisUtterance(token.text);

          if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.lang = selectedVoice.lang;
          }
          utterance.rate = settings.rate || 0.9; // 兒童學習稍慢一點點更清晰
          utterance.pitch = settings.pitch || 1.1; // 稍高一點更活潑親切

          utterance.onend = () => {
            resolve();
          };

          utterance.onerror = (e) => {
            // interrupted 是 cancel 時產生的正常錯誤
            if (e.error !== 'interrupted' && e.error !== 'canceled') {
              console.warn('SpeechSynthesis error:', e);
            }
            resolve();
          };

          window.speechSynthesis.speak(utterance);
        });
      }
    }

    return !this.isCancelled;
  }
}
