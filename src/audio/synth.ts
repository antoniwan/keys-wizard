/**
 * A small built-in synth, so a silent USB controller makes sound and the
 * backing tracks can play. No samples, so nothing to license or download.
 */
interface Voice {
  gain: GainNode;
  oscs: OscillatorNode[];
}

export class Synth {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private held = new Map<number, Voice>();
  volume = 0.8;

  /** Browsers only allow sound after a click or key press. Call this from one. */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      this.out = this.ctx.createGain();
      this.out.gain.value = this.volume;
      this.out.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  get ready(): boolean {
    return this.ctx?.state === 'running';
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.out) this.out.gain.value = v;
  }

  private start(midi: number, velocity: number, level: number): Voice | null {
    if (!this.ctx || !this.out || this.ctx.state !== 'running') return null;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = 440 * 2 ** ((midi - 69) / 12);
    const peak = level * (0.15 + 0.85 * velocity) * 0.32;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.006);
    // Piano-like: quick strike, slow fade while held. High notes fade faster.
    const decay = Math.max(0.5, 3.2 - (midi - 36) * 0.035);
    gain.gain.setTargetAtTime(peak * 0.08, now + 0.006, decay / 3);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(12000, freq * 6 + 1200 * velocity), now);
    filter.frequency.setTargetAtTime(Math.min(8000, freq * 2.5), now, 0.4);

    const oscs: OscillatorNode[] = [];
    const add = (type: OscillatorType, ratio: number, amount: number, detune = 0) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq * ratio;
      osc.detune.value = detune;
      g.gain.value = amount;
      osc.connect(g).connect(filter);
      osc.start(now);
      oscs.push(osc);
    };
    add('triangle', 1, 1);
    add('sawtooth', 1, 0.18, 4);
    add('sine', 2, 0.25, -3);

    filter.connect(gain).connect(this.out);
    return { gain, oscs };
  }

  private stop(voice: Voice, at?: number): void {
    if (!this.ctx) return;
    const t = Math.max(at ?? 0, this.ctx.currentTime);
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setTargetAtTime(0, t, 0.06);
    for (const osc of voice.oscs) osc.stop(t + 0.5);
  }

  /** A key you are holding down. */
  noteOn(midi: number, velocity = 0.8): void {
    this.noteOff(midi);
    const voice = this.start(midi, velocity, 1);
    if (voice) this.held.set(midi, voice);
  }

  noteOff(midi: number): void {
    const voice = this.held.get(midi);
    if (!voice) return;
    this.held.delete(midi);
    this.stop(voice);
  }

  /** A note with a known length (backing tracks, listen mode). */
  play(midi: number, velocity: number, seconds: number, level = 0.6): void {
    const voice = this.start(midi, velocity, level);
    if (voice && this.ctx) this.stop(voice, this.ctx.currentTime + Math.max(0.08, seconds));
  }

  allOff(): void {
    for (const midi of [...this.held.keys()]) this.noteOff(midi);
  }
}
