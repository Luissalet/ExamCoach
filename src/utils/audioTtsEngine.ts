/**
 * audioTtsEngine.ts
 *
 * Motor TTS basado en Piper (VITS neural) ejecutado 100% en el navegador.
 * Genera audio WAV de alta calidad y lo reproduce a través de un <audio> element.
 *
 * Esto permite:
 *   - Reproducción en segundo plano en Android (tab se mantiene vivo)
 *   - Notificación de media con controles play/pause/next/prev
 *   - Voces naturales (no robóticas)
 *   - Funciona offline tras la primera carga del modelo
 *
 * Estrategia:
 *   - Cada bloque de texto se sintetiza con Piper → WAV Blob
 *   - El WAV se reproduce vía blob URL → <audio>.src → audio.play()
 *   - Los bloques se encadenan secuencialmente vía audio.onended
 *   - La velocidad se controla con audio.playbackRate
 */

import {
  initPiperTts,
  isPiperReady,
  synthesizeToBlobUrl,
  DEFAULT_VOICE_ID,
  SPANISH_VOICES,
} from './piperTts';
import type { PiperVoiceOption } from './piperTts';
import type { ProgressCallback, VoiceId } from '@mintplex-labs/piper-tts-web';
import type { AudioKeepaliveManager } from './audioKeepalive';
import type { TtsCallbacks, TtsEngine, TtsState, TtsVoiceInfo } from './ttsEngine';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface AudioTtsEngineOptions {
  keepalive?: AudioKeepaliveManager;
  /**
   * Callback invocado si Piper TTS no funciona (WASM no carga, modelo falla, etc.)
   * Permite hacer fallback a speechSynthesis.
   */
  onSynthesisFailed?: () => void;
  /**
   * Callback de progreso de descarga del modelo.
   * Se invoca durante la primera carga (o al cambiar de voz).
   */
  onModelProgress?: ProgressCallback;
  /**
   * Metadata para la notificación de media (Android).
   */
  mediaTitle?: string;
  mediaArtist?: string;
}

// ─── Implementation ─────────────────────────────────────────────────────────────

export function createAudioTtsEngine(options?: AudioTtsEngineOptions): TtsEngine {
  const keepalive = options?.keepalive;
  const onSynthesisFailed = options?.onSynthesisFailed;
  const onModelProgress = options?.onModelProgress;

  let rate = 1.0;
  let state: TtsState = 'idle';
  let blocks: string[] = [];
  let currentBlockIndex = 0;
  let callbacks: TtsCallbacks = {};
  let destroyed = false;
  let synthFailReported = false;
  let voiceId: VoiceId = DEFAULT_VOICE_ID;

  // Audio element para reproducción
  const audio = new Audio();
  audio.setAttribute('playsinline', '');
  audio.volume = 1.0;

  // URL del blob actual (para revocar cuando cambie)
  let currentBlobUrl: string | null = null;

  // Timing
  let blockStartTime = 0;

  // ── Media Session (notificación de Android) ──────────────────────────────

  function updateMediaSession(playing: boolean) {
    if (!('mediaSession' in navigator)) return;
    try {
      if (playing) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: options?.mediaTitle ?? 'Lectura PDF',
          artist: options?.mediaArtist ?? 'ExamCoach',
          album: blocks.length > 0 ? `Bloque ${currentBlockIndex + 1} de ${blocks.length}` : '',
        });
        navigator.mediaSession.playbackState = 'playing';
      } else {
        navigator.mediaSession.playbackState = state === 'paused' ? 'paused' : 'none';
      }
    } catch { /* ignore */ }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function revokePreviousBlob() {
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  async function playBlock(blockIdx: number) {
    if (destroyed) return;

    // ¿Ya terminamos todos los bloques?
    if (blockIdx >= blocks.length) {
      finishPlayback();
      return;
    }

    const text = blocks[blockIdx];

    // Bloque vacío → saltar
    if (!text || !text.trim()) {
      callbacks.onBlockStart?.(blockIdx);
      callbacks.onBlockEnd?.(blockIdx);
      currentBlockIndex = blockIdx;
      if ((state === 'playing' || state === 'loading') && !destroyed) {
        playBlock(blockIdx + 1);
      }
      return;
    }

    // Notificar inicio del bloque
    currentBlockIndex = blockIdx;
    blockStartTime = performance.now();
    callbacks.onBlockStart?.(blockIdx);

    // Sintetizar audio con Piper (async - corre en Web Worker)
    const blobUrl = await synthesizeToBlobUrl(text);

    if (destroyed) return; // Check again after async

    if (!blobUrl) {
      // Síntesis falló
      if (!synthFailReported && blockIdx === 0 && onSynthesisFailed) {
        synthFailReported = true;
        state = 'idle';
        keepalive?.stop();
        callbacks.onStateChange?.('idle');
        onSynthesisFailed();
        return;
      }

      // Saltar bloque fallido
      callbacks.onError?.(`Error sintetizando bloque ${blockIdx + 1}`);
      callbacks.onBlockEnd?.(blockIdx);
      playBlock(blockIdx + 1);
      return;
    }

    // Revocar blob anterior y reproducir el nuevo
    revokePreviousBlob();
    currentBlobUrl = blobUrl;
    audio.src = blobUrl;
    audio.playbackRate = rate;

    try {
      await audio.play();
      if (destroyed) return;
      if (state === 'loading') {
        state = 'playing';
        callbacks.onStateChange?.('playing');
      }
      // Activar notificación de media (Android)
      updateMediaSession(true);
    } catch (err) {
      if (destroyed) return;
      console.warn('[AudioTTS] Error playing block:', err);

      if (!synthFailReported && blockIdx === 0 && onSynthesisFailed) {
        synthFailReported = true;
        audio.pause();
        revokePreviousBlob();
        state = 'idle';
        keepalive?.stop();
        callbacks.onStateChange?.('idle');
        onSynthesisFailed();
        return;
      }

      callbacks.onError?.(`Error reproduciendo bloque ${blockIdx + 1}`);
      callbacks.onBlockEnd?.(blockIdx);
      playBlock(blockIdx + 1);
    }
  }

  function finishPlayback() {
    revokePreviousBlob();
    state = 'idle';
    currentBlockIndex = 0;
    keepalive?.stop();
    updateMediaSession(false);
    callbacks.onFinish?.();
    callbacks.onStateChange?.('idle');
  }

  // ── Audio element events ──────────────────────────────────────────────────

  audio.onended = () => {
    if (destroyed) return;
    if (state !== 'playing') return;

    // Bloque terminado → reportar timing y avanzar
    const elapsed = performance.now() - blockStartTime;
    const text = blocks[currentBlockIndex] || '';
    callbacks.onBlockTiming?.(currentBlockIndex, elapsed, text.length);
    callbacks.onBlockEnd?.(currentBlockIndex);

    // Siguiente bloque
    playBlock(currentBlockIndex + 1);
  };

  audio.onerror = () => {
    if (destroyed) return;

    if (!synthFailReported && currentBlockIndex === 0 && onSynthesisFailed) {
      synthFailReported = true;
      audio.pause();
      revokePreviousBlob();
      state = 'idle';
      keepalive?.stop();
      callbacks.onStateChange?.('idle');
      onSynthesisFailed();
      return;
    }

    callbacks.onError?.(`Error de audio en bloque ${currentBlockIndex + 1}`);
    callbacks.onBlockEnd?.(currentBlockIndex);

    if (currentBlockIndex < blocks.length - 1) {
      playBlock(currentBlockIndex + 1);
    } else {
      finishPlayback();
    }
  };

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    getSpanishVoices(): TtsVoiceInfo[] {
      return SPANISH_VOICES.map((v: PiperVoiceOption) => ({
        name: v.id,
        lang: v.id.startsWith('es_MX') ? 'es-MX' : 'es-ES',
        quality: (v.quality === 'alta' || v.quality === 'media') ? 'enhanced' as const : 'standard' as const,
      }));
    },

    setVoice(voiceName: string) {
      const found = SPANISH_VOICES.find((v) => v.id === voiceName);
      if (found) {
        voiceId = found.id;
        // Re-init con la nueva voz si ya estaba inicializado
        if (isPiperReady()) {
          initPiperTts(voiceId, onModelProgress).catch(() => {});
        }
      }
    },

    getVoice(): TtsVoiceInfo | null {
      const v = SPANISH_VOICES.find((sv) => sv.id === voiceId) ?? SPANISH_VOICES[0];
      return {
        name: v.id,
        lang: v.id.startsWith('es_MX') ? 'es-MX' : 'es-ES',
        quality: 'enhanced' as const,
      };
    },

    setRate(r: number) {
      rate = Math.max(0.5, Math.min(2.0, r));
      // Aplicar inmediatamente al audio que está sonando
      audio.playbackRate = rate;
    },

    getRate() {
      return rate;
    },

    speak(newBlocks: string[], cbs?: TtsCallbacks) {
      audio.pause();
      revokePreviousBlob();

      blocks = newBlocks;
      callbacks = cbs ?? {};
      currentBlockIndex = 0;
      destroyed = false;
      synthFailReported = false;

      state = 'loading';
      callbacks.onStateChange?.('loading');

      keepalive?.start();

      // Inicializar Piper si no está listo, luego empezar reproducción
      const startPlayback = () => {
        if (destroyed) return;
        playBlock(0);
      };

      if (isPiperReady()) {
        startPlayback();
      } else {
        initPiperTts(voiceId, onModelProgress)
          .then((ok) => {
            if (!ok) {
              if (!synthFailReported && onSynthesisFailed) {
                synthFailReported = true;
                state = 'idle';
                keepalive?.stop();
                callbacks.onStateChange?.('idle');
                onSynthesisFailed();
              }
              return;
            }
            startPlayback();
          })
          .catch(() => {
            if (!synthFailReported && onSynthesisFailed) {
              synthFailReported = true;
              state = 'idle';
              keepalive?.stop();
              callbacks.onStateChange?.('idle');
              onSynthesisFailed();
            }
          });
      }
    },

    pause() {
      if (state === 'playing') {
        audio.pause();
        state = 'paused';
        updateMediaSession(false);
        callbacks.onStateChange?.('paused');
      }
    },

    resume() {
      if (state === 'paused') {
        audio.play().catch(() => { /* ignore */ });
        state = 'playing';
        updateMediaSession(true);
        callbacks.onStateChange?.('playing');
      }
    },

    stop() {
      audio.pause();
      revokePreviousBlob();
      state = 'idle';
      currentBlockIndex = 0;
      keepalive?.stop();
      updateMediaSession(false);
      callbacks.onStateChange?.('idle');
    },

    skipTo(blockIndex: number) {
      if (blockIndex < 0 || blockIndex >= blocks.length) return;
      audio.pause();
      revokePreviousBlob();
      state = 'loading';
      callbacks.onStateChange?.('loading');
      playBlock(blockIndex);
    },

    next() {
      if (currentBlockIndex < blocks.length - 1) {
        audio.pause();
        revokePreviousBlob();
        playBlock(currentBlockIndex + 1);
      }
    },

    previous() {
      if (currentBlockIndex > 0) {
        audio.pause();
        revokePreviousBlob();
        playBlock(currentBlockIndex - 1);
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
      audio.pause();
      revokePreviousBlob();
      audio.removeAttribute('src');
      audio.onended = null;
      audio.onerror = null;
      state = 'idle';
      keepalive?.stop();
      updateMediaSession(false);
      blocks = [];
      callbacks = {};
    },
  };
}
