/**
 * Normalizes text for accent-insensitive and case-insensitive POS/catalog searches.
 * Example: "Café Molido" -> "cafe molido"
 */
export function normalizeSearchText(text?: string | null): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if `target` contains all space-separated search tokens from `query`, ignoring accents and case.
 */
export function matchesNormalizedSearch(target?: string | null, query?: string | null): boolean {
  const normQuery = normalizeSearchText(query);
  if (!normQuery) return true;
  const normTarget = normalizeSearchText(target);
  if (!normTarget) return false;
  if (normTarget.includes(normQuery)) return true;

  const tokens = normQuery.split(' ').filter(Boolean);
  return tokens.every((token) => normTarget.includes(token));
}

const POS_ERROR_SOUND_URL =
  '/assets/aistudio/vadim_makes_sound-ui-error-denied-sound-2-547856_288260a8.mp3';

let cachedErrorAudio: HTMLAudioElement | null = null;

function getPosErrorAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!cachedErrorAudio) {
    cachedErrorAudio = new Audio(POS_ERROR_SOUND_URL);
    cachedErrorAudio.preload = 'auto';
    cachedErrorAudio.volume = 0.85;
  }
  return cachedErrorAudio;
}

// Preload the POS error audio clip so first playback is instant
if (typeof window !== 'undefined') {
  try {
    getPosErrorAudio()?.load();
  } catch {
    // Ignore preload errors
  }
}

function playFallbackAlertTone(type: 'not_found' | 'no_stock' | 'error'): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const now = ctx.currentTime;

    const scheduleTone = (
      freq: number,
      startOffset: number,
      duration: number,
      oscType: OscillatorType = 'triangle',
      peakGain: number = 0.18
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = oscType;
      osc.frequency.setValueAtTime(freq, now + startOffset);

      gain.gain.setValueAtTime(0.001, now + startOffset);
      gain.gain.linearRampToValueAtTime(peakGain, now + startOffset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    if (type === 'not_found') {
      scheduleTone(520, 0, 0.13, 'triangle', 0.2);
      scheduleTone(330, 0.14, 0.2, 'triangle', 0.2);
    } else if (type === 'no_stock') {
      scheduleTone(340, 0, 0.11, 'sawtooth', 0.13);
      scheduleTone(270, 0.14, 0.18, 'sawtooth', 0.14);
    } else {
      scheduleTone(380, 0, 0.16, 'triangle', 0.18);
    }

    setTimeout(() => {
      if (ctx.state !== 'closed') {
        void ctx.close().catch(() => {});
      }
    }, 600);
  } catch {
    // Ignore audio errors in restricted browser environments
  }
}

/**
 * Plays the custom POS error/denied sound (article not found, insufficient stock, etc.),
 * falling back to synthesized Web Audio tones if the audio clip cannot play.
 */
export function playPosAlertSound(type: 'not_found' | 'no_stock' | 'error' = 'error'): void {
  try {
    const audio = getPosErrorAudio();
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          playFallbackAlertTone(type);
        });
      }
      return;
    }
  } catch {
    // Fall through to synthesized fallback
  }

  playFallbackAlertTone(type);
}
