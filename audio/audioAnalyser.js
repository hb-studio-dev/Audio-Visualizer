// 音声解析エンジン。サイドメニューからの設定値は dB 単位。
// しきい値の dB は振幅の基準値 1.0 = 0 dBFS として扱う。
export const dbToAmplitude = (db) => Math.pow(10, db / 20);
export const amplitudeToDb = (value) => 20 * Math.log10(Math.max(value, 1e-12));

// しきい値は添付元コードの線形値を dBFS 換算し、検出感度を維持。
export const DEFAULT_THRESHOLDS_DB = Object.freeze({
  attackThresholdDb: amplitudeToDb(0.028),
  lowAttackThresholdDb: amplitudeToDb(0.022),
  midAttackThresholdDb: amplitudeToDb(0.024),
  highAttackThresholdDb: amplitudeToDb(0.026),
  peakThresholdDb: amplitudeToDb(0.72),
});

export const DEFAULT_SETTINGS = Object.freeze({
  inputGainDb: 18,
  ...DEFAULT_THRESHOLDS_DB,
});

export const DEVICE_DEFAULT_SETTINGS = Object.freeze({
  desktop: Object.freeze({ ...DEFAULT_SETTINGS, inputGainDb: 0 }),
  mobile: Object.freeze({ ...DEFAULT_SETTINGS, inputGainDb: 30 }),
});

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rms = (data) =>
  Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);

export class AudioAnalyser {
  constructor(settings = {}) {
    this.ctx = null;
    this.stream = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.silentSink = null;
    this.nodes = [];
    this.sampleBuffers = [];
    this.previous = { full: 0, low: 0, mid: 0, high: 0 };
    this.waveform = new Float32Array(1024);
    this.settings = { ...DEFAULT_SETTINGS };
    this.thresholds = {};
    this.inputGain = 1;
    this.setSettings(settings);
    this.analysis = this.emptyAnalysis();
  }

  emptyAnalysis() {
    return {
      volume: 0,
      inputLevel: 0, // ゲイン適用後のRMS（表示用、1を超える場合あり）
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

  setSettings(settings = {}) {
    this.settings = { ...this.settings, ...settings };
    this.inputGain = dbToAmplitude(this.settings.inputGainDb);
    this.thresholds = {
      attack: dbToAmplitude(this.settings.attackThresholdDb),
      low: dbToAmplitude(this.settings.lowAttackThresholdDb),
      mid: dbToAmplitude(this.settings.midAttackThresholdDb),
      high: dbToAmplitude(this.settings.highAttackThresholdDb),
      peak: dbToAmplitude(this.settings.peakThresholdDb),
    };
    if (this.gainNode) this.gainNode.gain.value = this.inputGain;
  }

  async useStream(stream) {
    if (!stream?.getAudioTracks().length) {
      throw new Error("音声トラックを取得できませんでした。");
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error("Web Audio APIに対応していません。");

    // 切り替えるたびにAudioContextを破棄すると、音の途切れや
    // ブラウザによるオーディオ初期化失敗が起こりやすいので、解析グラフは維持する。
    const isNewContext = !this.ctx;
    const ctx = this.ctx || new Ctx();
    let graph = null;
    let newSource = null;
    try {
      if (isNewContext) {
        const gain = ctx.createGain();
        gain.gain.value = this.inputGain;
        const createBand = (type, frequency) => {
          const filter = ctx.createBiquadFilter();
          filter.type = type;
          filter.frequency.value = frequency;
          filter.Q.value = 0.707;
          gain.connect(filter);
          return filter;
        };
        const low = createBand("lowpass", 250);
        const midLow = createBand("highpass", 250);
        const midHigh = ctx.createBiquadFilter();
        midHigh.type = "lowpass";
        midHigh.frequency.value = 4000;
        midLow.connect(midHigh);
        const high = createBand("highpass", 4000);
        const nodes = [gain, low, midHigh, high].map((node) => {
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          analyser.smoothingTimeConstant = 0;
          node.connect(analyser);
          return analyser;
        });
        // 音声の解析を継続するための無音出力。実際の音は再生しない。
        const silentSink = ctx.createGain();
        silentSink.gain.value = 0;
        nodes.forEach((node) => node.connect(silentSink));
        silentSink.connect(ctx.destination);
        graph = { gain, nodes, silentSink };
      }

      newSource = ctx.createMediaStreamSource(stream);
      if (ctx.state !== "running") await ctx.resume();
      newSource.connect(graph?.gain || this.gainNode);
    } catch (error) {
      newSource?.disconnect();
      if (isNewContext) await ctx.close().catch(() => {});
      throw error;
    }

    // 新しい入力の接続が完了してから、古い入力を切断する。
    // 接続失敗時は古い入力がそのまま動作する。
    const oldSource = this.sourceNode;
    const oldStream = this.stream;
    if (graph) {
      this.ctx = ctx;
      this.gainNode = graph.gain;
      this.nodes = graph.nodes;
      this.silentSink = graph.silentSink;
      this.sampleBuffers = this.nodes.map(() => new Float32Array(1024));
      this.waveform = this.sampleBuffers[0];
    }
    this.sourceNode = newSource;
    this.stream = stream;
    oldSource?.disconnect();
    if (oldStream && oldStream !== stream) {
      oldStream.getTracks().forEach((track) => track.stop());
    }
    this.previous = { full: 0, low: 0, mid: 0, high: 0 };
    this.analysis = this.emptyAnalysis();
  }

  getAnalysis() {
    if (!this.ctx || !this.nodes.length) return this.analysis;
    const values = this.nodes.map((node, i) => {
      node.getFloatTimeDomainData(this.sampleBuffers[i]);
      return rms(this.sampleBuffers[i]);
    });
    const [full, low, mid, high] = values;
    const raw = full / Math.max(this.inputGain, 1e-12);
    // Attack は前フレームとの正の RMS 差。振幅を dBFS 換算したしきい値で判定。
    const attack = Math.max(0, full - this.previous.full);
    const lowAttack = Math.max(0, low - this.previous.low);
    const midAttack = Math.max(0, mid - this.previous.mid);
    const highAttack = Math.max(0, high - this.previous.high);
    Object.assign(this.previous, { full, low, mid, high });
    let peak = 0;
    for (const sample of this.sampleBuffers[0]) {
      peak = Math.max(peak, Math.abs(sample));
    }
    this.analysis = {
      volume: clamp(full, 0, 1),
      inputLevel: full,
      rawVolume: raw,
      attack,
      attackTriggered: attack >= this.thresholds.attack,
      lowAttack,
      lowAttackTriggered: lowAttack >= this.thresholds.low,
      midAttack,
      midAttackTriggered: midAttack >= this.thresholds.mid,
      highAttack,
      highAttackTriggered: highAttack >= this.thresholds.high,
      peak,
      peakTriggered: peak >= this.thresholds.peak,
      waveform: this.waveform,
    };
    return this.analysis;
  }

  async stop() {
    const stream = this.stream;
    const ctx = this.ctx;
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.ctx = null;
    this.stream = null;
    this.nodes = [];
    this.sampleBuffers = [];
    this.waveform = new Float32Array(1024);
    this.gainNode = null;
    this.silentSink = null;
    this.previous = { full: 0, low: 0, mid: 0, high: 0 };
    this.analysis = this.emptyAnalysis();
    stream?.getTracks().forEach((track) => track.stop());
    if (ctx) await ctx.close().catch(() => {});
  }
}
