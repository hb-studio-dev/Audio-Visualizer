// 音声解析は描画処理から独立。全しきい値はUIから変更可能。
export const DEFAULT_SETTINGS = Object.freeze({
  inputGain: 1,
  attackThreshold: 0.028,
  lowAttackThreshold: 0.022,
  midAttackThreshold: 0.024,
  highAttackThreshold: 0.026,
  peakThreshold: 0.72,
});
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rms = (data) =>
  Math.sqrt(data.reduce((s, x) => s + x * x, 0) / data.length);
export class AudioAnalyser {
  constructor(settings = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.ctx = null;
    this.stream = null;
    this.nodes = [];
    this.sampleBuffers = [];
    this.previous = { full: 0, low: 0, mid: 0, high: 0 };
    this.waveform = new Float32Array(1024);
    this.analysis = this.emptyAnalysis();
  }
  emptyAnalysis() {
    return {
      volume: 0,
      rawVolume: 0,
      attack: 0,
      attackTriggered: false,
      lowAttack: 0,
      lowAttackTriggered: false,
      midAttack: 0,
      midAttackTriggered: false,
      highAttack: 0,
      highAttackTriggered: false,
      peak: 0,
      peakTriggered: false,
      waveform: this.waveform,
    };
  }
  setSettings(settings) {
    this.settings = { ...this.settings, ...settings };
    if (this.gainNode) this.gainNode.gain.value = this.settings.inputGain;
  }
  async useStream(stream) {
    await this.stop();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error("Web Audio APIに対応していません。");
    const ctx = new Ctx();
    this.ctx = ctx;
    this.stream = stream;
    const source = ctx.createMediaStreamSource(stream),
      gain = ctx.createGain();
    gain.gain.value = this.settings.inputGain;
    this.gainNode = gain;
    source.connect(gain);
    const createBand = (type, frequency) => {
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = 0.707;
      gain.connect(filter);
      return filter;
    };
    const low = createBand("lowpass", 250),
      midLow = createBand("highpass", 250),
      midHigh = ctx.createBiquadFilter();
    midHigh.type = "lowpass";
    midHigh.frequency.value = 4000;
    midLow.connect(midHigh);
    const high = createBand("highpass", 4000);
    const sources = [gain, low, midHigh, high];
    this.nodes = sources.map((node) => {
      const a = ctx.createAnalyser();
      a.fftSize = 1024;
      a.smoothingTimeConstant = 0;
      node.connect(a);
      return a;
    });
    this.sampleBuffers = this.nodes.map(() => new Float32Array(1024));
    this.waveform = this.sampleBuffers[0];
    this.previous = { full: 0, low: 0, mid: 0, high: 0 };
    this.analysis = this.emptyAnalysis();
    await ctx.resume();
  }
  getAnalysis() {
    if (!this.ctx || !this.nodes.length) return this.analysis;
    const values = this.nodes.map((node, i) => {
      node.getFloatTimeDomainData(this.sampleBuffers[i]);
      return rms(this.sampleBuffers[i]);
    });
    const [full, low, mid, high] = values;
    const raw = full / Math.max(this.settings.inputGain, 0.00001);
    // Attackは前フレームからの正のRMS変化。しきい値は線形値（dBではない）。
    const attack = Math.max(0, full - this.previous.full),
      lowAttack = Math.max(0, low - this.previous.low),
      midAttack = Math.max(0, mid - this.previous.mid),
      highAttack = Math.max(0, high - this.previous.high);
    Object.assign(this.previous, { full, low, mid, high });
    let peak = 0;
    for (const s of this.sampleBuffers[0]) peak = Math.max(peak, Math.abs(s));
    this.analysis = {
      volume: clamp(full, 0, 1),
      rawVolume: raw,
      attack,
      attackTriggered: attack >= this.settings.attackThreshold,
      lowAttack,
      lowAttackTriggered: lowAttack >= this.settings.lowAttackThreshold,
      midAttack,
      midAttackTriggered: midAttack >= this.settings.midAttackThreshold,
      highAttack,
      highAttackTriggered: highAttack >= this.settings.highAttackThreshold,
      peak,
      peakTriggered: peak >= this.settings.peakThreshold,
      waveform: this.waveform,
    };
    return this.analysis;
  }
  async stop() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) await this.ctx.close().catch(() => {});
    this.ctx = null;
    this.stream = null;
    this.nodes = [];
    this.sampleBuffers = [];
    this.waveform = new Float32Array(1024);
    this.gainNode = null;
    this.analysis = this.emptyAnalysis();
  }
}
