/**
 * Finds the pitch of one sustained note in a chunk of audio (the YIN method).
 * Returns the frequency in Hz, or null when it hears silence or noise.
 */
export function detectPitch(buf: Float32Array, sampleRate: number, minRms = 0.01): number | null {
  let energy = 0;
  for (let i = 0; i < buf.length; i++) energy += buf[i] * buf[i];
  if (Math.sqrt(energy / buf.length) < minRms) return null;

  const maxLag = Math.min(Math.floor(sampleRate / 55), buf.length >> 1);
  const minLag = Math.max(2, Math.floor(sampleRate / 2200));
  const window = buf.length - maxLag;
  const diff = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < window; i++) {
      const d = buf[i] - buf[i + lag];
      sum += d * d;
    }
    diff[lag] = sum;
  }
  // Cumulative mean normalised difference.
  let running = 0;
  diff[0] = 1;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += diff[lag];
    diff[lag] = running === 0 ? 1 : (diff[lag] * lag) / running;
  }

  let lag = -1;
  for (let t = minLag; t < maxLag; t++) {
    if (diff[t] < 0.12) {
      while (t + 1 < maxLag && diff[t + 1] < diff[t]) t++;
      lag = t;
      break;
    }
  }
  if (lag < 0) return null;

  // Parabolic interpolation for a finer estimate.
  const a = diff[lag - 1];
  const b = diff[lag];
  const c = diff[lag + 1];
  const denom = a - 2 * b + c;
  const shift = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
  return sampleRate / (lag + shift);
}

export function hzToMidi(hz: number): number {
  return Math.round(69 + 12 * Math.log2(hz / 440));
}
