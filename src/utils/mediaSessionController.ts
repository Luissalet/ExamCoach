/**
 * mediaSessionController.ts
 *
 * Wrapper sobre la Media Session API para mostrar controles de reproducción
 * en la pantalla de bloqueo y la barra de notificaciones del móvil.
 *
 * Degradación elegante: si el navegador no soporta Media Session,
 * todas las operaciones son no-ops silenciosos.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MediaSessionMetadata {
  /** Nombre del PDF o tema */
  title: string;
  /** Texto secundario, p.ej. nombre de la asignatura */
  artist?: string;
  /** Texto terciario, p.ej. "Bloque 5 de 42" */
  album?: string;
}

export interface MediaSessionHandlers {
  onPlay?: () => void;
  onPause?: () => void;
  onNextTrack?: () => void;
  onPreviousTrack?: () => void;
  onStop?: () => void;
}

export interface MediaSessionController {
  /** Actualiza la info mostrada en la notificación */
  updateMetadata(info: MediaSessionMetadata): void;
  /** Actualiza el estado del reproductor (playing/paused/none) */
  setPlaybackState(state: 'playing' | 'paused' | 'none'): void;
  /** Registra los handlers de los botones del lock screen */
  setHandlers(handlers: MediaSessionHandlers): void;
  /** Limpia handlers y metadata */
  cleanup(): void;
}

// ─── Implementation ────────────────────────────────────────────────────────────

function isMediaSessionSupported(): boolean {
  return 'mediaSession' in navigator;
}

export function createMediaSessionController(): MediaSessionController {
  const supported = isMediaSessionSupported();

  return {
    updateMetadata(info: MediaSessionMetadata) {
      if (!supported) return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: info.title,
          artist: info.artist ?? 'ExamCoach',
          album: info.album ?? '',
          // Usar el icono de la PWA como artwork
          artwork: [
            { src: './icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: './icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
          ],
        });
      } catch {
        // Algunos navegadores pueden fallar con artwork inválido
      }
    },

    setPlaybackState(state: 'playing' | 'paused' | 'none') {
      if (!supported) return;
      try {
        navigator.mediaSession.playbackState = state;
      } catch {
        // No-op
      }
    },

    setHandlers(handlers: MediaSessionHandlers) {
      if (!supported) return;
      const actions: Array<[MediaSessionAction, (() => void) | undefined]> = [
        ['play', handlers.onPlay],
        ['pause', handlers.onPause],
        ['nexttrack', handlers.onNextTrack],
        ['previoustrack', handlers.onPreviousTrack],
        ['stop', handlers.onStop],
      ];

      for (const [action, handler] of actions) {
        try {
          if (handler) {
            navigator.mediaSession.setActionHandler(action, handler);
          }
        } catch {
          // Acción no soportada en este navegador — ignorar
        }
      }
    },

    cleanup() {
      if (!supported) return;
      const actions: MediaSessionAction[] = [
        'play', 'pause', 'nexttrack', 'previoustrack', 'stop',
      ];
      for (const action of actions) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Ignorar
        }
      }
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      } catch {
        // Ignorar
      }
    },
  };
}
