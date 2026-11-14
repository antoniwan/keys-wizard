import type { NoteHandlers } from './midi';
import { detectPitch, hzToMidi } from './pitch';

/**
 * Listens through the microphone and reports the note it hears.
 * It follows one note at a time, so it suits melodies on an acoustic
 * instrument. A USB MIDI keyboard is faster and exact; prefer that.
 */
export class MicInput {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private timer = 0;
  private current = -1;
  private candidate = -1;
  private candidateFrames = 0;
  private lastRms = 0;
  /** 0..1 input level, for a meter. */
  level = 0;

  constructor(private handlers: NoteHandlers) {}

  get active(): boolean {
    return this.stream !== null;
  }

  async start(): Promise<void> {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const sampleRate = this.ctx.sampleRate;

    this.timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let energy = 0;
      for (let i = 0; i < buf.length; i++) energy += buf[i] * buf[i];
      const rms = Math.sqrt(energy / buf.length);
      this.level = Math.min(1, rms * 6);

      const hz = detectPitch(buf, sampleRate, 0.012);
      const midi = hz ? hzToMidi(hz) : -1;
      // A fresh attack on the same pitch (a repeated note) shows up as a jump in loudness.
      const attack = rms > this.lastRms * 1.6 && rms > 0.03;
      this.lastRms = rms;

      if (midi === this.candidate) this.candidateFrames++;
      else {
        this.candidate = midi;
        this.candidateFrames = 1;
      }
      if (this.candidateFrames < 2) return;

      if (midi === -1) {
        if (this.current !== -1) this.handlers.noteOff(this.current);
        this.current = -1;
      } else if (midi !== this.current || attack) {
        if (this.current !== -1) this.handlers.noteOff(this.current);
        this.current = midi;
        this.handlers.noteOn(midi, Math.min(1, 0.4 + rms * 3));
      }
    }, 35);
  }

  stop(): void {
    window.clearInterval(this.timer);
    if (this.current !== -1) this.handlers.noteOff(this.current);
    this.current = -1;
    this.level = 0;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}
