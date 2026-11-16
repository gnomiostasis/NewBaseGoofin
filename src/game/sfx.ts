// Tiny synthesized sound effects, so there are no audio files to license or load.
// The audio context starts on the first sound, which always follows a key press.

export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  private ac(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        this.muted = true;
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const ac = this.ac();
    if (!ac) return;
    const t = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, lowpass: number) {
    const ac = this.ac();
    if (!ac) return;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ac.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start();
  }

  pickup() {
    this.tone(660, 0.08, 'square', 0.05);
    this.tone(990, 0.1, 'square', 0.04, undefined, 0.06);
  }

  chop() {
    this.noise(0.09, 0.35, 900);
    this.tone(140, 0.08, 'triangle', 0.18, 90);
  }

  clink() {
    this.tone(1400, 0.07, 'square', 0.035, 900);
    this.noise(0.05, 0.15, 3000);
  }

  thud() {
    this.tone(110, 0.12, 'triangle', 0.15, 70);
  }

  munch() {
    this.noise(0.06, 0.2, 1500);
    setTimeout(() => this.noise(0.06, 0.2, 1300), 110);
  }

  craft() {
    this.tone(523, 0.09, 'square', 0.04);
    this.tone(659, 0.09, 'square', 0.04, undefined, 0.08);
    this.tone(784, 0.14, 'square', 0.04, undefined, 0.16);
  }
}
