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
 *   - PRE-BUFFERING: Mientras bloque N suena, bloque N+1 se sintetiza en paralelo
 *   - Cuando termina bloque N, bloque N+1 se reproduce INMEDIATAMENTE (sin gap)
 *   - Esto es CRÍTICO en Android: si el <audio> deja de sonar entre bloques,
 *     Android mata el tab en segundo plano y la notificación desaparece
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
  onSynthesisFailed?: (errorDetail?: string) => void;
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

  // ── Pre-buffer: sintetizar bloque N+1 mientras N suena ──────────────────
  // Esto elimina el gap entre bloques que causa que Android mate el tab
  let prefetchedBlobUrl: string | null = null;
  let prefetchedBlockIdx: number = -1;
  let prefetchPromise: Promise<void> | null = null;

  function clearPrefetch() {
    if (prefetchedBlobUrl) {
      URL.revokeObjectURL(prefetchedBlobUrl);
      prefetchedBlobUrl = null;
    }
    prefetchedBlockIdx = -1;
    prefetchPromise = null;
  }

  /** Inicia la síntesis del siguiente bloque en background (fire-and-forget) */
  function startPrefetch(nextIdx: number) {
    if (destroyed) return;
    if (nextIdx >= blocks.length) return;

    const text = blocks[nextIdx];
    if (!text || !text.trim()) return; // bloque vacío, no pre-fetch

    // Si ya tenemos este bloque pre-fetched, no hacer nada
    if (prefetchedBlockIdx === nextIdx && prefetchedBlobUrl) return;

    // Limpiar prefetch anterior
    if (prefetchedBlobUrl) {
      URL.revokeObjectURL(prefetchedBlobUrl);
      prefetchedBlobUrl = null;
    }
    prefetchedBlockIdx = nextIdx;

    prefetchPromise = (async () => {
      try {
        const url = await synthesizeToBlobUrl(text);
        if (destroyed || prefetchedBlockIdx !== nextIdx) {
          // Estado cambió mientras sintetizábamos → descartar
          if (url) URL.revokeObjectURL(url);
          return;
        }
        prefetchedBlobUrl = url;
        console.log(`[AudioTTS] Pre-buffered block ${nextIdx + 1}`);
      } catch {
        // No es fatal — playBlock sintetizará bajo demanda
        console.warn(`[AudioTTS] Pre-buffer failed for block ${nextIdx + 1}`);
      }
    })();
  }

  // Timing
  let blockStartTime = 0;

  // ── Media Session (notificación de Android) ──────────────────────────────
  // NOTA: NO creamos MediaMetadata aquí. La metadata (con artwork, etc.) la
  // maneja mediaSessionController desde PdfListenMode. Aquí solo actualizamos
  // el playbackState para que Android sepa si estamos playing/paused/none.

  function updateMediaSession(playing: boolean) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = playing
        ? 'playing'
        : (state === 'paused' ? 'paused' : 'none');
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
      clearPrefetch();
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

    // ── Intentar usar el pre-buffer primero ──────────────────────────────
    let blobUrl: string | null = null;

    if (prefetchedBlockIdx === blockIdx && prefetchedBlobUrl) {
      // Pre-buffer listo → usar inmediatamente (0 gap!)
      blobUrl = prefetchedBlobUrl;
      prefetchedBlobUrl = null; // transferir ownership
      prefetchedBlockIdx = -1;
      console.log(`[AudioTTS] Using pre-buffered block ${blockIdx + 1} (zero gap)`);
    } else if (prefetchedBlockIdx === blockIdx && prefetchPromise) {
      // Pre-buffer en progreso → esperar a que termine
      console.log(`[AudioTTS] Waiting for pre-buffer of block ${blockIdx + 1}...`);
      await prefetchPromise;
      if (destroyed) return;
      if (prefetchedBlockIdx === blockIdx && prefetchedBlobUrl) {
        blobUrl = prefetchedBlobUrl;
        prefetchedBlobUrl = null;
        prefetchedBlockIdx = -1;
      }
    }

    // Si no hay pre-buffer, sintetizar bajo demanda
    if (!blobUrl) {
      console.log(`[AudioTTS] Synthesizing block ${blockIdx + 1} on demand (no pre-buffer)`);
      blobUrl = await synthesizeToBlobUrl(text);
    }

    if (destroyed) return;

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

      // ── CLAVE: iniciar pre-buffer del SIGUIENTE bloque AHORA ──────
      // Mientras este bloque suena, sintetizamos el siguiente en paralelo.
      // Cuando audio.onended dispare, el siguiente ya estará listo → 0 gap.
      startPrefetch(blockIdx + 1);

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

    // Siguiente bloque — si pre-buffer está listo, será instantáneo
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
      clearPrefetch();

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
                onSynthesisFailed('initPiperTts returned false (session not ready)');
              }
              return;
            }
            startPlayback();
          })
          .catch((err) => {
            if (!synthFailReported && onSynthesisFailed) {
              synthFailReported = true;
              state = 'idle';
              keepalive?.stop();
              callbacks.onStateChange?.('idle');
              onSynthesisFailed(`initPiperTts threw: ${err?.message ?? err}`);
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
      clearPrefetch();
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
      clearPrefetch();
      state = 'loading';
      callbacks.onStateChange?.('loading');
      playBlock(blockIndex);
    },

    next() {
      if (currentBlockIndex < blocks.length - 1) {
        audio.pause();
        revokePreviousBlob();
        clearPrefetch();
        playBlock(currentBlockIndex + 1);
      }
    },

    previous() {
      if (currentBlockIndex > 0) {
        audio.pause();
        revokePreviousBlob();
        clearPrefetch();
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
      clearPrefetch();
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
