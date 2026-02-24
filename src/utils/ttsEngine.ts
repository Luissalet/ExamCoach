/**
 * ttsEngine.ts
 *
 * Wrapper sobre Web Speech API con:
 *   - Selección de voz española (prioriza Google/MS neural)
 *   - Control de reproducción (play/pause/skip/velocidad)
 *   - Callbacks para sincronizar UI
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TtsVoiceInfo {
  name: string;
  lang: string;
  /** Indica si es una voz "premium" (Google/MS neural) */
  quality: 'standard' | 'enhanced';
}

export interface TtsCallbacks {
  onBlockStart?: (blockIndex: number) => void;
  onBlockEnd?: (blockIndex: number) => void;
  onFinish?: () => void;
  onError?: (error: string) => void;
  onStateChange?: (state: TtsState) => void;
}

export type TtsState = 'idle' | 'playing' | 'paused' | 'loading';

export interface TtsEngine {
  getSpanishVoices(): TtsVoiceInfo[];
  setVoice(voiceName: string): void;
  getVoice(): TtsVoiceInfo | null;
  setRate(rate: number): void;
  getRate(): number;
  speak(blocks: string[], callbacks?: TtsCallbacks): void;
  pause(): void;
  resume(): void;
  stop(): void;
  skipTo(blockIndex: number): void;
  next(): void;
  previous(): void;
  getState(): TtsState;
  getCurrentBlockIndex(): number;
  destroy(): void;
}

// ─── Implementation ────────────────────────────────────────────────────────────

function voiceQualityScore(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  if (name.includes('google')) return 100;
  if (name.includes('microsoft') && (name.includes('neural') || name.includes('online'))) return 90;
  if (name.includes('microsoft')) return 70;
  if (voice.localService === false) return 60;
  if (name.includes('monica') || name.includes('jorge') || name.includes('paulina')) return 50;
  return 10;
}

function pickBestSpanishVoice(allVoices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const spanish = allVoices.filter((v) => v.lang.startsWith('es'));
  if (spanish.length === 0) return allVoices[0] ?? null;

  const prioritized = [...spanish].sort((a, b) => voiceQualityScore(b) - voiceQualityScore(a));
  return prioritized[0];
}

export function createTtsEngine(): TtsEngine {
  const synth = window.speechSynthesis;
  let voices: SpeechSynthesisVoice[] = [];
  let selectedVoice: SpeechSynthesisVoice | null = null;
  let rate = 1.0;
  let state: TtsState = 'idle';
  let blocks: string[] = [];
  let currentBlockIndex = 0;
  let callbacks: TtsCallbacks = {};
  let destroyed = false;

  // ── Load voices ────────────────────────────────────────────────────────────
  function loadVoices() {
    voices = synth.getVoices();
    if (!selectedVoice) {
      selectedVoice = pickBestSpanishVoice(voices);
    }
  }

  loadVoices();
  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = loadVoices;
  }

  // ── Speak a single block ───────────────────────────────────────────────────
  function speakBlock(index: number) {
    if (destroyed) return;
    if (index >= blocks.length) {
      state = 'idle';
      callbacks.onFinish?.();
      callbacks.onStateChange?.('idle');
      return;
    }

    currentBlockIndex = index;
    callbacks.onBlockStart?.(index);

    const text = blocks[index];
    if (!text.trim()) {
      // Skip empty blocks
      callbacks.onBlockEnd?.(index);
      setTimeout(() => {
        if (state === 'playing') speakBlock(index + 1);
      }, 100);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.lang = 'es-ES';
    utterance.rate = rate;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      if (destroyed) return;
      callbacks.onBlockEnd?.(index);
      // Encadenar inmediatamente al siguiente bloque — la separación natural
      // entre utterances ya produce una micro-pausa suficiente.
      if (state === 'playing' && !destroyed) {
        speakBlock(index + 1);
      }
    };

    utterance.onerror = (event) => {
      if (destroyed) return;
      // 'interrupted' and 'canceled' are normal (skip/stop)
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        callbacks.onError?.(`Error TTS: ${event.error}`);
      }
    };

    synth.speak(utterance);
  }

  return {
    getSpanishVoices() {
      return voices
        .filter((v) => v.lang.startsWith('es'))
        .map((v) => ({
          name: v.name,
          lang: v.lang,
          quality: voiceQualityScore(v) >= 60 ? ('enhanced' as const) : ('standard' as const),
        }));
    },

    setVoice(voiceName: string) {
      selectedVoice = voices.find((v) => v.name === voiceName) ?? selectedVoice;
    },

    getVoice() {
      if (!selectedVoice) return null;
      return {
        name: selectedVoice.name,
        lang: selectedVoice.lang,
        quality: voiceQualityScore(selectedVoice) >= 60 ? ('enhanced' as const) : ('standard' as const),
      };
    },

    setRate(r: number) {
      rate = Math.max(0.5, Math.min(2.0, r));
    },
    getRate() {
      return rate;
    },

    speak(newBlocks: string[], cbs?: TtsCallbacks) {
      synth.cancel();
      blocks = newBlocks;
      callbacks = cbs ?? {};
      currentBlockIndex = 0;
      state = 'playing';
      callbacks.onStateChange?.('playing');
      speakBlock(0);
    },

    pause() {
      if (state === 'playing') {
        synth.pause();
        state = 'paused';
        callbacks.onStateChange?.('paused');
      }
    },

    resume() {
      if (state === 'paused') {
        synth.resume();
        state = 'playing';
        callbacks.onStateChange?.('playing');
      }
    },

    stop() {
      synth.cancel();
      state = 'idle';
      currentBlockIndex = 0;
      callbacks.onStateChange?.('idle');
    },

    skipTo(blockIndex: number) {
      if (blockIndex < 0 || blockIndex >= blocks.length) return;
      synth.cancel();
      state = 'playing';
      callbacks.onStateChange?.('playing');
      speakBlock(blockIndex);
    },

    next() {
      if (currentBlockIndex < blocks.length - 1) {
        synth.cancel();
        state = 'playing';
        speakBlock(currentBlockIndex + 1);
      }
    },

    previous() {
      if (currentBlockIndex > 0) {
        synth.cancel();
        state = 'playing';
        speakBlock(currentBlockIndex - 1);
      }
    },

    getState() {
      return state;
    },
    getCurrentBlockIndex() {
      return currentBlockIndex;
    },

    destroy() {
      destroyed = true;
      synth.cancel();
      state = 'idle';
      blocks = [];
      callbacks = {};
    },
  };
}
