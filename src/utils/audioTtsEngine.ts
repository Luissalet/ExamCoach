/**
 * audioTtsEngine.ts
 *
 * Motor TTS basado en Piper (VITS neural) ejecutado 100% en el navegador.
 *
 * ARQUITECTURA: SINGLE-TRACK (como Spotify)
 *
 * Problema resuelto:
 *   Android 16 (Pixel, Chrome) mata tabs en segundo plano de forma MUY agresiva.
 *   Cualquier micro-gap entre bloques de audio (incluso microsegundos) causa que
 *   Android considere que "no hay audio" y mate el tab. Esto pasa con:
 *     - Un solo <audio> cambiando src entre bloques
 *     - Dos <audio> alternando (double-buffer)
 *     - Early transition con overlap
 *     - Keepalive con AudioContext/WAV silencioso
 *
 * Solución:
 *   1. Pre-sintetizar TODOS los bloques de texto a WAV (con barra de progreso)
 *   2. Concatenar todos los WAV en UN SOLO archivo WAV continuo
 *   3. Reproducir con UN SOLO <audio> element — exactamente como Spotify
 *   4. Rastrear el bloque actual via timestamps (blockBoundaries)
 *
 * Resultado:
 *   - Cero gaps → Android nunca ve "sin audio" → no mata el tab
 *   - Un solo <audio> → MediaSession funciona perfecto (notificación + controles)
 *   - Seeking nativo → skip/next/prev via audio.currentTime
 *   - Rate nativo → audio.playbackRate
 *   - Sin hacks → no keepalive, no double-buffer, no early transition
 */

import {
  initPiperTts,
  isPiperReady,
  synthesizeToBlob,
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
  onSynthesisFailed?: (errorDetail?: string) => void;
  onModelProgress?: ProgressCallback;
  mediaTitle?: string;
  mediaArtist?: string;
  /**
   * Función que devuelve la clave de caché actual para el WAV concatenado.
   * Se llama en cada speak() para obtener la clave dinámica.
   * Si devuelve null/undefined, no se cachea.
   * Típicamente: `${pdfHash}:${voiceId}`.
   */
  getCacheKey?: () => string | null | undefined;
}

// ─── WAV Cache (IndexedDB) ───────────────────────────────────────────────────────

const WAV_CACHE_DB = 'audio-tts-wav-cache';
const WAV_CACHE_STORE = 'wavs';
const WAV_CACHE_VERSION = 1;

interface CachedWavEntry {
  wav: Blob;
  blockBoundaries: number[];
  blockCount: number;
  voiceId: string;
  createdAt: number;
}

function openWavCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(WAV_CACHE_DB, WAV_CACHE_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(WAV_CACHE_STORE)) {
        db.createObjectStore(WAV_CACHE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function wavCacheGet(key: string): Promise<CachedWavEntry | undefined> {
  try {
    const db = await openWavCacheDB();
    return new Promise((resolve) => {
      const tx = db.transaction(WAV_CACHE_STORE, 'readonly');
      const store = tx.objectStore(WAV_CACHE_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? undefined);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

async function wavCachePut(key: string, entry: CachedWavEntry): Promise<void> {
  try {
    const db = await openWavCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(WAV_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(WAV_CACHE_STORE);
      const req = store.put(entry, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[AudioTTS] WAV cache write failed:', e);
  }
}

/** Genera un hash simple de los textos para usar como clave de caché */
export async function hashBlockTexts(texts: string[]): Promise<string> {
  const combined = texts.join('\n');
  const encoded = new TextEncoder().encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// ─── WAV utilities ──────────────────────────────────────────────────────────────

/** Información extraída del header WAV */
interface WavInfo {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  /** Offset donde empiezan los datos PCM */
  dataOffset: number;
  /** Tamaño de los datos PCM en bytes */
  dataSize: number;
  /** Duración en segundos */
  duration: number;
}

/** Lee el header de un WAV y extrae metadata + ubicación de datos PCM */
function parseWavHeader(buffer: ArrayBuffer): WavInfo | null {
  if (buffer.byteLength < 44) return null;
  const view = new DataView(buffer);

  // Verificar RIFF header
  const riff =
    String.fromCharCode(view.getUint8(0)) +
    String.fromCharCode(view.getUint8(1)) +
    String.fromCharCode(view.getUint8(2)) +
    String.fromCharCode(view.getUint8(3));
  if (riff !== 'RIFF') return null;

  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);

  // Buscar el chunk "data" (puede no estar en offset 36 si hay chunks extra)
  let offset = 12; // después de "RIFF" + size + "WAVE"
  while (offset < buffer.byteLength - 8) {
    const chunkId =
      String.fromCharCode(view.getUint8(offset)) +
      String.fromCharCode(view.getUint8(offset + 1)) +
      String.fromCharCode(view.getUint8(offset + 2)) +
      String.fromCharCode(view.getUint8(offset + 3));
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'data') {
      const bytesPerSample = bitsPerSample / 8;
      const duration = chunkSize / (sampleRate * numChannels * bytesPerSample);
      return {
        sampleRate,
        numChannels,
        bitsPerSample,
        dataOffset: offset + 8,
        dataSize: chunkSize,
        duration,
      };
    }

    // Siguiente chunk (alineado a 2 bytes)
    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset++;
  }

  return null;
}

/**
 * Concatena múltiples WAV blobs en UN SOLO WAV continuo.
 * Devuelve el WAV concatenado y las duraciones individuales de cada bloque.
 *
 * REQUISITO: Todos los WAV deben tener el mismo sampleRate, channels, bitsPerSample.
 * (Piper siempre genera con el mismo formato para una voz dada.)
 */
async function concatWavBlobs(
  blobs: Blob[],
): Promise<{ wav: Blob; durations: number[] } | null> {
  if (blobs.length === 0) return null;

  const buffers: ArrayBuffer[] = [];
  for (const blob of blobs) {
    buffers.push(await blob.arrayBuffer());
  }

  // Parsear headers para obtener metadata y PCM data
  const infos: WavInfo[] = [];
  for (const buf of buffers) {
    const info = parseWavHeader(buf);
    if (!info) return null;
    infos.push(info);
  }

  // Usar formato del primer bloque como referencia
  const ref = infos[0];
  const { sampleRate, numChannels, bitsPerSample } = ref;

  // Calcular tamaño total de PCM
  let totalPcmSize = 0;
  const durations: number[] = [];
  for (const info of infos) {
    totalPcmSize += info.dataSize;
    durations.push(info.duration);
  }

  // Crear WAV concatenado
  const headerSize = 44;
  const totalSize = headerSize + totalPcmSize;
  const output = new ArrayBuffer(totalSize);
  const view = new DataView(output);

  // Escribir header WAV
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  // RIFF header
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeStr(view, 8, 'WAVE');

  // fmt chunk
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeStr(view, 36, 'data');
  view.setUint32(40, totalPcmSize, true);

  // Copiar PCM de cada bloque
  const outputBytes = new Uint8Array(output);
  let writeOffset = headerSize;
  for (let i = 0; i < buffers.length; i++) {
    const srcBytes = new Uint8Array(buffers[i]);
    const info = infos[i];
    outputBytes.set(
      srcBytes.subarray(info.dataOffset, info.dataOffset + info.dataSize),
      writeOffset,
    );
    writeOffset += info.dataSize;
  }

  return {
    wav: new Blob([output], { type: 'audio/wav' }),
    durations,
  };
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ─── Hidden audio element ───────────────────────────────────────────────────────

const HIDDEN_STYLE =
  'position:fixed;top:-9999px;left:-9999px;width:0;height:0;opacity:0;pointer-events:none';

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

  // Un solo <audio> element — como Spotify
  const audio = document.createElement('audio');
  audio.setAttribute('playsinline', '');
  audio.volume = 1.0;
  audio.style.cssText = HIDDEN_STYLE;
  document.body.appendChild(audio);

  // URL del blob del WAV concatenado (para revocar)
  let concatBlobUrl: string | null = null;

  // Boundaries: timestamps acumulados en segundos [0, 3.2, 7.5, ...]
  let blockBoundaries: number[] = [];

  // Control de síntesis (para poder cancelar)
  let synthAborted = false;

  // ── Media Session ──────────────────────────────────────────────────────

  function updateMediaSession(playing: boolean) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = playing
        ? 'playing'
        : state === 'paused'
          ? 'paused'
          : 'none';
    } catch {
      /* ignore */
    }
  }

  // ── Block tracking via timeupdate ──────────────────────────────────────

  function findBlockAtTime(time: number): number {
    // Búsqueda binaria en blockBoundaries
    let lo = 0;
    let hi = blockBoundaries.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (blockBoundaries[mid] <= time) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  function onTimeUpdate() {
    if (destroyed || state !== 'playing') return;
    const newBlock = findBlockAtTime(audio.currentTime);
    if (newBlock !== currentBlockIndex) {
      // Reportar fin del bloque anterior
      callbacks.onBlockEnd?.(currentBlockIndex);
      // Reportar timing del bloque anterior
      if (currentBlockIndex < blockBoundaries.length) {
        const blockDuration =
          currentBlockIndex < blockBoundaries.length - 1
            ? blockBoundaries[currentBlockIndex + 1] - blockBoundaries[currentBlockIndex]
            : audio.duration - blockBoundaries[currentBlockIndex];
        const blockText = blocks[currentBlockIndex] || '';
        callbacks.onBlockTiming?.(
          currentBlockIndex,
          blockDuration * 1000 / rate,
          blockText.length,
        );
      }
      currentBlockIndex = newBlock;
      callbacks.onBlockStart?.(currentBlockIndex);
    }
  }

  audio.addEventListener('timeupdate', onTimeUpdate);

  audio.addEventListener('ended', () => {
    if (destroyed) return;
    // Reportar fin del último bloque
    callbacks.onBlockEnd?.(currentBlockIndex);
    if (currentBlockIndex < blockBoundaries.length) {
      const blockDuration =
        currentBlockIndex < blockBoundaries.length - 1
          ? blockBoundaries[currentBlockIndex + 1] - blockBoundaries[currentBlockIndex]
          : audio.duration - blockBoundaries[currentBlockIndex];
      const blockText = blocks[currentBlockIndex] || '';
      callbacks.onBlockTiming?.(
        currentBlockIndex,
        blockDuration * 1000 / rate,
        blockText.length,
      );
    }
    // Finished
    state = 'idle';
    currentBlockIndex = 0;
    keepalive?.stop();
    updateMediaSession(false);
    callbacks.onFinish?.();
    callbacks.onStateChange?.('idle');
  });

  // ── Synthesis + concatenation + playback ───────────────────────────────

  async function synthesizeAndPlay() {
    if (destroyed) return;

    // ── Intentar cargar desde caché ──────────────────────────────────────
    const cacheKey = options?.getCacheKey?.() ?? null;
    if (cacheKey) {
      try {
        const cached = await wavCacheGet(cacheKey);
        if (cached && cached.blockCount === blocks.length && cached.voiceId === voiceId) {
          console.log('[AudioTTS] WAV loaded from cache:', cacheKey);
          if (synthAborted || destroyed) return;

          // Usar datos cacheados directamente
          blockBoundaries = cached.blockBoundaries;

          if (concatBlobUrl) URL.revokeObjectURL(concatBlobUrl);
          concatBlobUrl = URL.createObjectURL(cached.wav);

          // Reportar progreso completo inmediatamente
          callbacks.onSynthesisProgress?.(blocks.length, blocks.length);

          return await startPlayback();
        }
      } catch (err) {
        console.warn('[AudioTTS] Cache read failed, synthesizing fresh:', err);
      }
    }

    // ── Sintetizar TODOS los bloques ─────────────────────────────────────
    const wavBlobs: Blob[] = [];

    for (let i = 0; i < blocks.length; i++) {
      if (synthAborted || destroyed) return;

      const text = blocks[i];
      if (!text || !text.trim()) {
        // Bloque vacío — generar 200ms de silencio para mantener el mapeo
        const silenceBlob = createSilenceWav(0.2);
        wavBlobs.push(silenceBlob);
        callbacks.onSynthesisProgress?.(i + 1, blocks.length);
        continue;
      }

      try {
        const blob = await synthesizeToBlob(text);
        if (synthAborted || destroyed) return;

        if (!blob) {
          if (i === 0 && !synthFailReported && onSynthesisFailed) {
            synthFailReported = true;
            state = 'idle';
            keepalive?.stop();
            callbacks.onStateChange?.('idle');
            onSynthesisFailed('First block synthesis returned null');
            return;
          }
          wavBlobs.push(createSilenceWav(0.5));
          callbacks.onError?.(`Error sintetizando bloque ${i + 1}`);
        } else {
          wavBlobs.push(blob);
        }
      } catch (err) {
        if (synthAborted || destroyed) return;
        if (i === 0 && !synthFailReported && onSynthesisFailed) {
          synthFailReported = true;
          state = 'idle';
          keepalive?.stop();
          callbacks.onStateChange?.('idle');
          onSynthesisFailed(
            `Synthesis error: ${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }
        wavBlobs.push(createSilenceWav(0.5));
        callbacks.onError?.(`Error sintetizando bloque ${i + 1}`);
      }

      callbacks.onSynthesisProgress?.(i + 1, blocks.length);
    }

    if (synthAborted || destroyed) return;

    // ── Concatenar en un solo WAV ────────────────────────────────────────
    const result = await concatWavBlobs(wavBlobs);
    if (!result || synthAborted || destroyed) {
      if (!synthFailReported && onSynthesisFailed) {
        synthFailReported = true;
        state = 'idle';
        keepalive?.stop();
        callbacks.onStateChange?.('idle');
        onSynthesisFailed('WAV concatenation failed');
      }
      return;
    }

    // ── Calcular boundaries ──────────────────────────────────────────────
    blockBoundaries = [];
    let cumulative = 0;
    for (const dur of result.durations) {
      blockBoundaries.push(cumulative);
      cumulative += dur;
    }

    // ── Guardar en caché ─────────────────────────────────────────────────
    if (cacheKey) {
      wavCachePut(cacheKey, {
        wav: result.wav,
        blockBoundaries: [...blockBoundaries],
        blockCount: blocks.length,
        voiceId,
        createdAt: Date.now(),
      }).catch((err) => console.warn('[AudioTTS] Cache write failed:', err));
    }

    // ── Preparar para reproducir ─────────────────────────────────────────
    if (concatBlobUrl) URL.revokeObjectURL(concatBlobUrl);
    concatBlobUrl = URL.createObjectURL(result.wav);

    await startPlayback();
  }

  /** Inicia la reproducción del WAV concatenado (ya preparado en concatBlobUrl) */
  async function startPlayback() {
    if (destroyed || synthAborted || !concatBlobUrl) return;

    audio.src = concatBlobUrl;
    audio.playbackRate = rate;
    currentBlockIndex = 0;

    try {
      await audio.play();
      if (destroyed || synthAborted) return;
      state = 'playing';
      callbacks.onStateChange?.('playing');
      callbacks.onBlockStart?.(0);
      updateMediaSession(true);
    } catch (err) {
      if (destroyed) return;
      console.warn('[AudioTTS] Play failed:', err);
      if (!synthFailReported && onSynthesisFailed) {
        synthFailReported = true;
        state = 'idle';
        keepalive?.stop();
        callbacks.onStateChange?.('idle');
        onSynthesisFailed(`Play failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // ── Silence generator ──────────────────────────────────────────────────

  /** Genera un WAV de silencio de la duración especificada (22050Hz, mono, 16-bit) */
  function createSilenceWav(durationSec: number): Blob {
    const sampleRate = 22050;
    const numSamples = Math.round(sampleRate * durationSec);
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = numSamples * numChannels * (bitsPerSample / 8);
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    writeStr(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(view, 8, 'WAVE');
    writeStr(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    // PCM data ya es 0 (silencio) por defecto en ArrayBuffer

    return new Blob([buffer], { type: 'audio/wav' });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    getSpanishVoices(): TtsVoiceInfo[] {
      return SPANISH_VOICES.map((v: PiperVoiceOption) => ({
        name: v.id,
        lang: v.id.startsWith('es_MX') ? 'es-MX' : 'es-ES',
        quality:
          v.quality === 'alta' || v.quality === 'media'
            ? ('enhanced' as const)
            : ('standard' as const),
      }));
    },

    setVoice(voiceName: string) {
      const found = SPANISH_VOICES.find((v) => v.id === voiceName);
      if (found) {
        voiceId = found.id;
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
      audio.playbackRate = rate;
    },

    getRate() {
      return rate;
    },

    speak(newBlocks: string[], cbs?: TtsCallbacks) {
      // Cancelar síntesis anterior
      synthAborted = true;
      audio.pause();
      if (concatBlobUrl) {
        URL.revokeObjectURL(concatBlobUrl);
        concatBlobUrl = null;
      }

      blocks = newBlocks;
      callbacks = cbs ?? {};
      currentBlockIndex = 0;
      blockBoundaries = [];
      destroyed = false;
      synthFailReported = false;
      synthAborted = false;

      state = 'loading';
      callbacks.onStateChange?.('loading');

      keepalive?.start();

      // Inicializar Piper si no está listo, luego sintetizar
      if (isPiperReady()) {
        synthesizeAndPlay();
      } else {
        initPiperTts(voiceId, onModelProgress)
          .then((ok) => {
            if (synthAborted || destroyed) return;
            if (!ok) {
              if (!synthFailReported && onSynthesisFailed) {
                synthFailReported = true;
                state = 'idle';
                keepalive?.stop();
                callbacks.onStateChange?.('idle');
                onSynthesisFailed('initPiperTts returned false');
              }
              return;
            }
            synthesizeAndPlay();
          })
          .catch((err) => {
            if (synthAborted || destroyed) return;
            if (!synthFailReported && onSynthesisFailed) {
              synthFailReported = true;
              state = 'idle';
              keepalive?.stop();
              callbacks.onStateChange?.('idle');
              onSynthesisFailed(
                `initPiperTts threw: ${err?.message ?? err}`,
              );
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
        audio.play().catch(() => {
          /* ignore */
        });
        state = 'playing';
        updateMediaSession(true);
        callbacks.onStateChange?.('playing');
      }
    },

    stop() {
      synthAborted = true;
      audio.pause();
      audio.currentTime = 0;
      if (concatBlobUrl) {
        URL.revokeObjectURL(concatBlobUrl);
        concatBlobUrl = null;
      }
      state = 'idle';
      currentBlockIndex = 0;
      blockBoundaries = [];
      keepalive?.stop();
      updateMediaSession(false);
      callbacks.onStateChange?.('idle');
    },

    skipTo(blockIndex: number) {
      if (blockIndex < 0 || blockIndex >= blockBoundaries.length) return;
      if (state !== 'playing' && state !== 'paused') return;

      // Reportar fin del bloque actual
      callbacks.onBlockEnd?.(currentBlockIndex);

      currentBlockIndex = blockIndex;
      audio.currentTime = blockBoundaries[blockIndex];
      callbacks.onBlockStart?.(blockIndex);

      if (state === 'paused') {
        audio.play().catch(() => {});
        state = 'playing';
        updateMediaSession(true);
        callbacks.onStateChange?.('playing');
      }
    },

    next() {
      if (currentBlockIndex < blocks.length - 1) {
        this.skipTo(currentBlockIndex + 1);
      }
    },

    previous() {
      if (currentBlockIndex > 0) {
        this.skipTo(currentBlockIndex - 1);
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
      synthAborted = true;
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      if (concatBlobUrl) {
        URL.revokeObjectURL(concatBlobUrl);
        concatBlobUrl = null;
      }
      audio.removeAttribute('src');
      audio.remove();
      state = 'idle';
      keepalive?.stop();
      updateMediaSession(false);
      blocks = [];
      callbacks = {};
      blockBoundaries = [];
    },
  };
}
