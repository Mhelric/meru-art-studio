/**
 * Web Audio API notification sound synthesizer.
 * Synthesizes gentle, high-quality chimes directly in the browser without loading external audio assets.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {
      // autoplay policy might keep it suspended until user gesture
    });
  }
  return audioCtx;
}

export function isAudioNotificationEnabled(): boolean {
  try {
    return localStorage.getItem('meru_sound_enabled') !== 'false';
  } catch {
    return true;
  }
}

export function setAudioNotificationEnabled(enabled: boolean): void {
  try {
    localStorage.setItem('meru_sound_enabled', enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
}

/**
 * Play a synthesized sound effect for realtime events.
 * - 'message': Gentle dual-tone ping (880Hz -> 1320Hz)
 * - 'stage': Three-tone ascending flourish (C5 -> E5 -> G5)
 * - 'success': Crisp triumphant bell (1046Hz & 1318Hz dual harmonic)
 */
export function playNotificationSound(type: 'message' | 'stage' | 'success' = 'message'): void {
  if (!isAudioNotificationEnabled()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    if (type === 'message') {
      // Two-tone marimba chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';

      osc1.frequency.setValueAtTime(880, now); // A5
      osc2.frequency.setValueAtTime(1320, now + 0.06); // E6

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.22);
      osc2.start(now + 0.06);
      osc2.stop(now + 0.22);
    } else if (type === 'stage') {
      // Ascending triad flourish: C5 (523Hz), E5 (659Hz), G5 (784Hz)
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + i * 0.08;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.14, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + 0.28);
      });
    } else if (type === 'success') {
      // Crisp bell: C6 (1046.5Hz) with E6 (1318.5Hz) harmonic
      const osc = ctx.createOscillator();
      const oscHarmonic = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      oscHarmonic.type = 'sine';

      osc.frequency.setValueAtTime(1046.5, now);
      oscHarmonic.frequency.setValueAtTime(1318.5, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      oscHarmonic.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
      oscHarmonic.start(now);
      oscHarmonic.stop(now + 0.35);
    }
  } catch (err) {
    console.debug('Failed to play synthetic chime (likely autoplay policy):', err);
  }
}
