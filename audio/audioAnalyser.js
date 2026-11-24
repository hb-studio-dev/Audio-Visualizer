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

export const CROSSOVER_MIN_HZ = 20;
export const CROSSOVER_MAX_HZ = 20000;
export const CROSSOVER_KEYS = ['lowMidCrossoverHz', 'midHighCrossoverHz'];

// Preserve the existing band boundaries by default. Keep the two frequencies ordered.
export function normalizeCrossovers(settings, editedKey) {
  const hz = (value, fallback) => Number.isFinite(value)
    ? Math.round(Math.max(CROSSOVER_MIN_HZ, Math.min(CROSSOVER_MAX_HZ, value)))
    : fallback;
  let low = hz(settings.lowMidCrossoverHz, 120);
  let high = hz(settings.midHighCrossoverHz, 4000);
  if (low >= high) {
    if (editedKey === 'midHighCrossoverHz') {
      low = Math.min(low, CROSSOVER_MAX_HZ - 1);
      high = low + 1;
    } else {
      high = Math.max(high, CROSSOVER_MIN_HZ + 1);
      low = high - 1;
    }
  }
  return { lowMidCrossoverHz: low, midHighCrossoverHz: high };
}

export const DEFAULT_SETTINGS = Object.freeze({
  inputGainDb: 18,
  lowMidCrossoverHz: 120,
  midHighCrossoverHz: 4000,
  bandSeparationDb: -9,
  ...DEFAULT_THRESHOLDS_DB,
});

export const DEVICE_DEFAULT_SETTINGS = Object.freeze({
  desktop: Object.freeze({ ...DEFAULT_SETTINGS, inputGainDb: 0 }),
  mobile: Object.freeze({ ...DEFAULT_SETTINGS, inputGainDb: 30 }),
});

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rms = (data, size = data.length) => {
  let sum = 0;
  const start = Math.max(0, data.length - size);
  for (let i = start; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / (data.length - start));
};
const FAST_WINDOWS = [256, 512, 256, 256];
// Web Audio lowpass/highpass Q is a dB value, not a linear Q factor.
const BUTTERWORTH_Q_DB = 20 * Math.log10(Math.SQRT1_2);
const bandSeparationRatio = (db) => db <= -60 ? 0 : dbToAmplitude(db);
const passesBandSeparation = (index, deltas, ratio) => {
  if (index === 0 || ratio === 0) return true;
  const left = index > 1 ? deltas[index - 1] : 0;
  const right = index < 3 ? deltas[index + 1] : 0;
  return deltas[index] >= Math.max(left, right) * ratio;
};

export class AudioAnalyser {
  constructor(settings = {}) {
    this.ctx = null;
    this.stream = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.silentSink = null;
    this.worklet = null;
    this.workletEpoch = 0;
    this.fastLevel = 0;
    this.pendingDeltas = new Float64Array(4);
    this.pendingFlags = new Array(4).fill(false);
    this.pendingVolumes = new Float64Array(4);
    this.pendingPeak = 0;
    this.nodes = [];
    this.bandFilters = null;
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
      attackEventMode: false,
      attackVolume: 0,
      lowAttackVolume: 0,
    };
  }

  workletThresholds() {
    const t = this.thresholds;
    return [t.attack, t.low, t.mid, t.high];
  }

  workletSettings() {
    return { thresholds: this.workletThresholds(), separationRatio: this.separationRatio };
  }

  clearPending() {
    this.pendingDeltas.fill(0);
    this.pendingFlags.fill(false);
    this.pendingVolumes.fill(0);
    this.pendingPeak = 0;
  }

  resetFastAnalysis() {
    this.fastLevel = 0;
    this.clearPending();
    if (this.worklet) {
      this.worklet.port.postMessage({ type: 'settings', ...this.workletSettings() });
      this.worklet.port.postMessage({ type: 'reset', epoch: ++this.workletEpoch });
    }
  }

  receiveFastAnalysis(data, worklet) {
    if (this.worklet !== worklet || data.epoch !== this.workletEpoch) return;
    this.fastLevel = data.level;
    for (let i = 0; i < 4; i++) {
      this.pendingDeltas[i] = Math.max(this.pendingDeltas[i], data.deltas[i]);
      this.pendingFlags[i] ||= data.flags[i];
      this.pendingVolumes[i] = Math.max(this.pendingVolumes[i], data.eventVolumes[i]);
    }
    this.pendingPeak = Math.max(this.pendingPeak, data.peak);
  }

  setSettings(settings = {}) {
    const previous = this.settings;
    this.settings = { ...previous, ...settings };
    Object.assign(this.settings, normalizeCrossovers(this.settings));
    this.inputGain = dbToAmplitude(this.settings.inputGainDb);
    const separationDb = Number.isFinite(this.settings.bandSeparationDb)
      ? clamp(this.settings.bandSeparationDb, -60, 0) : DEFAULT_SETTINGS.bandSeparationDb;
    this.settings.bandSeparationDb = separationDb;
    this.separationRatio = bandSeparationRatio(separationDb);
    this.thresholds = {
      attack: dbToAmplitude(this.settings.attackThresholdDb),
      low: dbToAmplitude(this.settings.lowAttackThresholdDb),
      mid: dbToAmplitude(this.settings.midAttackThresholdDb),
      high: dbToAmplitude(this.settings.highAttackThresholdDb),
      peak: dbToAmplitude(this.settings.peakThresholdDb),
    };
    if (this.gainNode) this.gainNode.gain.value = this.inputGain;
    if (CROSSOVER_KEYS.some(key => previous[key] !== this.settings[key])) {
      this.applyCrossovers();
    }
    if (this.worklet) this.worklet.port.postMessage({
      type: 'settings', ...this.workletSettings(),
    });
  }

  crossoverFrequencies(ctx) {
    // Web Audio cutoffs must stay below Nyquist, including low-rate devices.
    const high = Math.min(this.settings.midHighCrossoverHz, ctx.sampleRate * 0.49);
    const low = Math.min(this.settings.lowMidCrossoverHz, high - 1);
    return [low, high];
  }

  applyCrossovers() {
    if (!this.ctx || !this.bandFilters) return;
    const [low, high] = this.crossoverFrequencies(this.ctx);
    const { lowPass, midLow, midHigh, highPass } = this.bandFilters;
    const now = this.ctx.currentTime;
    // Update the shared filter graph without restarting the stream/worklet.
    for (const [filter, frequency] of [[lowPass, low], [midLow, low],
      [midHigh, high], [highPass, high]]) {
      filter.frequency.cancelScheduledValues(now);
      filter.frequency.setTargetAtTime(frequency, now, 0.01);
    }
  }

  async useStream(stream) {
    if (!stream?.getAudioTracks().length) {
      throw new Error("No audio track was available.");
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error("Web Audio API is not supported in this browser.");

    // 切り替えるたびにAudioContextを破棄すると、音の途切れや
    // ブラウザによるオーディオ初期化失敗が起こりやすいので、解析グラフは維持する。
    const isNewContext = !this.ctx;
    const ctx = this.ctx || new Ctx({ latencyHint: "interactive" });
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
          filter.Q.value = BUTTERWORTH_Q_DB;
          gain.connect(filter);
          return filter;
        };
        const [lowHz, highHz] = this.crossoverFrequencies(ctx);
        const low = createBand("lowpass", lowHz);
        const midLow = createBand("highpass", lowHz);
        const midHigh = ctx.createBiquadFilter();
        midHigh.type = "lowpass";
        midHigh.frequency.value = highHz;
        midHigh.Q.value = BUTTERWORTH_Q_DB;
        midLow.connect(midHigh);
        const high = createBand("highpass", highHz);
        const bands = [gain, low, midHigh, high];
        const nodes = bands.map((node) => {
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
        let worklet = null;
        // Keep the original analyser graph as a compatibility fallback and
        // keep its full-band 1024-sample waveform for all visualizers.
        try {
          if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
            await ctx.audioWorklet.addModule(new URL('./analysisProcessor.js?v=band-separation-v1', import.meta.url));
            worklet = new AudioWorkletNode(ctx, 'fast-audio-analysis', {
              numberOfInputs: 4, numberOfOutputs: 1, outputChannelCount: [1],
              channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers',
              processorOptions: this.workletSettings(),
            });
            bands.forEach((band, i) => band.connect(worklet, 0, i));
            worklet.connect(silentSink);
          }
        } catch (error) {
          worklet?.disconnect();
          worklet = null;
          console.warn('AudioWorklet unavailable; using short-window analyser fallback.', error);
        }
        graph = { gain, nodes, silentSink, worklet,
          bandFilters: { lowPass: low, midLow, midHigh, highPass: high } };
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
      this.gainNode.gain.value = this.inputGain;
      this.nodes = graph.nodes;
      this.bandFilters = graph.bandFilters;
      this.applyCrossovers();
      this.silentSink = graph.silentSink;
      this.worklet = graph.worklet;
      if (this.worklet) {
        const worklet = this.worklet;
        worklet.port.onmessage = ({ data }) => this.receiveFastAnalysis(data, worklet);
        worklet.onprocessorerror = () => {
          if (this.worklet !== worklet) return;
          console.warn('AudioWorklet stopped; using short-window analyser fallback.');
          worklet.disconnect();
          worklet.port.close();
          this.worklet = null;
          this.previous = { full: 0, low: 0, mid: 0, high: 0 };
          this.clearPending();
        };
      }
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
    this.resetFastAnalysis();
    this.analysis = this.emptyAnalysis();
  }

  getAnalysis() {
    if (!this.ctx || !this.nodes.length) return this.analysis;
    if (this.worklet) {
      this.nodes[0].getFloatTimeDomainData(this.waveform);
      const full = this.fastLevel;
      const [attack, lowAttack, midAttack, highAttack] = this.pendingDeltas;
      const [attackTriggered, lowAttackTriggered, midAttackTriggered, highAttackTriggered] = this.pendingFlags;
      const peak = this.pendingPeak;
      this.analysis = {
        volume: clamp(full, 0, 1), inputLevel: full,
        rawVolume: full / Math.max(this.inputGain, 1e-12),
        attack, attackTriggered, lowAttack, lowAttackTriggered,
        midAttack, midAttackTriggered, highAttack, highAttackTriggered,
        peak, peakTriggered: peak >= this.thresholds.peak,
        waveform: this.waveform, attackEventMode: true,
        attackVolume: attackTriggered ? this.pendingVolumes[0] : full,
        lowAttackVolume: lowAttackTriggered ? this.pendingVolumes[1] : full,
      };
      this.clearPending();
      return this.analysis;
    }
    const values = this.nodes.map((node, i) => {
      node.getFloatTimeDomainData(this.sampleBuffers[i]);
      return rms(this.sampleBuffers[i], FAST_WINDOWS[i]);
    });
    const [full, low, mid, high] = values;
    const raw = full / Math.max(this.inputGain, 1e-12);
    // Attack は前フレームとの正の RMS 差。振幅を dBFS 換算したしきい値で判定。
    const attack = Math.max(0, full - this.previous.full);
    const lowAttack = Math.max(0, low - this.previous.low);
    const midAttack = Math.max(0, mid - this.previous.mid);
    const highAttack = Math.max(0, high - this.previous.high);
    const deltas = [attack, lowAttack, midAttack, highAttack];
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
      lowAttackTriggered: lowAttack >= this.thresholds.low &&
        passesBandSeparation(1, deltas, this.separationRatio),
      midAttack,
      midAttackTriggered: midAttack >= this.thresholds.mid &&
        passesBandSeparation(2, deltas, this.separationRatio),
      highAttack,
      highAttackTriggered: highAttack >= this.thresholds.high &&
        passesBandSeparation(3, deltas, this.separationRatio),
      peak,
      peakTriggered: peak >= this.thresholds.peak,
      waveform: this.waveform,
      attackEventMode: false,
      attackVolume: full,
      lowAttackVolume: full,
    };
    return this.analysis;
  }

  async stop() {
    const stream = this.stream;
    const ctx = this.ctx;
    this.sourceNode?.disconnect();
    this.worklet?.disconnect();
    this.worklet?.port.close();
    this.worklet = null;
    this.resetFastAnalysis();
    this.sourceNode = null;
    this.ctx = null;
    this.stream = null;
    this.nodes = [];
    this.bandFilters = null;
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
