/**
 * audioKeepalive.ts
 *
 * Mantiene la sesión de audio del navegador activa en segundo plano
 * para que speechSynthesis NO se congele al minimizar el navegador en Android.
 *
 * Estrategia triple:
 *   1. AudioContext con oscilador silencioso → mantiene el proceso de audio vivo
 *   2. <audio> element reproduciendo una pista generada desde el AudioContext
 *      → activa la Media Session (notificación de reproducción en Android)
 *   3. Screen Wake Lock (opcional) → evita que la pantalla se apague
 *
 * El truco clave es que Android Chrome mantiene vivo un tab que tiene un
 * AudioContext activo con un MediaStream conectado a un <audio> element.
 * Esto es lo que usan internamente sitios como YouTube/Rumble.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AudioKeepaliveManager {
  /** Inicia el audio keepalive + solicita Wake Lock */
  start(): Promise<void>;
  /** Detiene el audio y libera Wake Lock */
  stop(): void;
  /** Indica si el keep-alive está activo */
  isActive(): boolean;
  /** Devuelve el HTMLAudioElement interno (para vincular Media Session) */
  getAudioElement(): HTMLAudioElement | null;
  /** Limpieza completa (destruye todos los recursos) */
  destroy(): void;
}

// ─── Silent WAV Generator (fallback) ────────────────────────────────────────

/**
 * Genera un WAV de 2 segundos de silencio a 22050Hz, mono, 16-bit.
 * Más sustancial que 1s@8kHz para que Android lo reconozca como media.
 */
function createSilentWavBlob(): Blob {
  const sampleRate = 22050;
  const duration = 2;
  const numSamples = sampleRate * duration;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ─── Implementation ────────────────────────────────────────────────────────────

export function createAudioKeepalive(): AudioKeepaliveManager {
  let audioCtx: AudioContext | null = null;
  let oscillator: OscillatorNode | null = null;
  let gainNode: GainNode | null = null;
  let audio: HTMLAudioElement | null = null;
  let wavUrl: string | null = null;
  let wakeLock: WakeLockSentinel | null = null;
  let active = false;

  // ── Visibility change handler (closure) ─────────────────────────────────
  function onVisibilityChange() {
    if (document.visibilityState === 'visible' && active) {
      // Re-resumir AudioContext al volver al foreground
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => { /* ignore */ });
      }
      // Re-play audio element si se pausó
      if (audio && audio.paused) {
        audio.play().catch(() => { /* ignore */ });
      }
    }
  }

  // ── Setup helpers ───────────────────────────────────────────────────────
  function setupAudioContext(): boolean {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return false;

      audioCtx = new AudioCtx();

      // Oscilador a frecuencia muy baja (1 Hz) — inaudible
      oscillator = audioCtx.createOscillator();
      oscillator.frequency.setValueAtTime(1, audioCtx.currentTime);
      oscillator.type = 'sine';

      // Gain a nivel mínimo — esencialmente silencioso pero activo
      gainNode = audioCtx.createGain();
      gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      // Crear un MediaStream → <audio> para activar Media Session en Android
      if (audioCtx.createMediaStreamDestination) {
        const streamDest = audioCtx.createMediaStreamDestination();
        gainNode.connect(streamDest);

        audio = new Audio();
        audio.srcObject = streamDest.stream;
        audio.loop = true;
        audio.setAttribute('playsinline', '');
        audio.volume = 0.01;
      }

      return true;
    } catch {
      return false;
    }
  }

  function setupFallbackAudio() {
    if (audio) return;
    const blob = createSilentWavBlob();
    wavUrl = URL.createObjectURL(blob);
    audio = new Audio(wavUrl);
    audio.loop = true;
    audio.volume = 0.01;
    audio.setAttribute('playsinline', '');
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch { /* no es crítico */ }
  }

  function releaseWakeLock() {
    try { wakeLock?.release(); } catch { /* ignore */ }
    wakeLock = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────
  return {
    async start() {
      if (active) return;

      // 1. Intentar AudioContext (preferida)
      setupAudioContext();

      // 2. Fallback a WAV si no se creó audio element
      if (!audio) setupFallbackAudio();

      // 3. Iniciar oscilador
      if (oscillator && audioCtx) {
        try { oscillator.start(0); } catch { /* ya iniciado */ }
        if (audioCtx.state === 'suspended') {
          try { await audioCtx.resume(); } catch { /* ignore */ }
        }
      }

      // 4. Play <audio> — activa Media Session en Android
      if (audio) {
        try { await audio.play(); } catch { /* autoplay blocked */ }
      }

      active = true;
      await requestWakeLock();
      document.addEventListener('visibilitychange', onVisibilityChange);
    },

    stop() {
      if (!active) return;

      if (audio) {
        audio.pause();
        if (!audio.srcObject && audio.src) audio.currentTime = 0;
      }

      if (oscillator) {
        try { oscillator.stop(); } catch { /* ignore */ }
      }

      if (audioCtx && audioCtx.state !== 'closed') {
        try { audioCtx.suspend(); } catch { /* ignore */ }
      }

      releaseWakeLock();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      active = false;
    },

    isActive() {
      return active;
    },

    getAudioElement() {
      return audio;
    },

    destroy() {
      this.stop();

      if (audioCtx && audioCtx.state !== 'closed') {
        try { audioCtx.close(); } catch { /* ignore */ }
      }
      audioCtx = null;
      oscillator = null;
      gainNode = null;

      if (audio) {
        audio.srcObject = null;
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
