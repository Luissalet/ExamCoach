/**
 * audioKeepalive.ts
 *
 * Mantiene la sesión de audio del navegador activa en segundo plano
 * reproduciendo un WAV silencioso en loop. Esto evita que los navegadores
 * móviles congelen la pestaña y suspendan speechSynthesis.
 *
 * Opcionalmente solicita Screen Wake Lock para evitar que la pantalla
 * se apague durante la reproducción.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AudioKeepaliveManager {
  /** Inicia el audio silencioso en loop + solicita Wake Lock */
  start(): Promise<void>;
  /** Detiene el audio y libera Wake Lock */
  stop(): void;
  /** Indica si el keep-alive está activo */
  isActive(): boolean;
  /** Limpieza completa (destruye el elemento audio) */
  destroy(): void;
}

// ─── Silent WAV Generator ──────────────────────────────────────────────────────

/**
 * Genera un WAV de 1 segundo de silencio a 8kHz, mono, 8-bit.
 * Tamaño resultante: 8044 bytes (~8KB) — mínimo para mantener la sesión de audio.
 */
function createSilentWavDataUrl(): string {
  const sampleRate = 8000;
  const numSamples = sampleRate; // 1 segundo
  const numChannels = 1;
  const bitsPerSample = 8;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // file size - 8
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Silencio: para 8-bit PCM, 128 = silencio (0dB)
  const bytes = new Uint8Array(buffer, headerSize);
  bytes.fill(128);

  // Convertir a data URL
  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ─── Implementation ────────────────────────────────────────────────────────────

export function createAudioKeepalive(): AudioKeepaliveManager {
  let audio: HTMLAudioElement | null = null;
  let wavUrl: string | null = null;
  let wakeLock: WakeLockSentinel | null = null;
  let active = false;

  function ensureAudioElement(): HTMLAudioElement {
    if (!audio) {
      wavUrl = createSilentWavDataUrl();
      audio = new Audio(wavUrl);
      audio.loop = true;
      audio.volume = 0.01; // casi inaudible
      // Necesario para que iOS trate esto como media playback
      audio.setAttribute('playsinline', '');
    }
    return audio;
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      }
    } catch {
      // Silencioso — Wake Lock no es crítico
    }
  }

  function releaseWakeLock() {
    try {
      wakeLock?.release();
    } catch {
      // Ignorar errores al liberar
    }
    wakeLock = null;
  }

  return {
    async start() {
      if (active) return;
      const el = ensureAudioElement();
      try {
        await el.play();
        active = true;
        await requestWakeLock();
      } catch {
        // Autoplay bloqueado — no es crítico, el TTS sigue funcionando
        // (normalmente no ocurre porque el usuario ya hizo click para iniciar)
        active = false;
      }
    },

    stop() {
      if (!active) return;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      releaseWakeLock();
      active = false;
    },

    isActive() {
      return active;
    },

    destroy() {
      this.stop();
      if (audio) {
        audio.src = '';
        audio = null;
      }
      if (wavUrl) {
        URL.revokeObjectURL(wavUrl);
        wavUrl = null;
      }
    },
  };
}
