// Low-latency audio analysis, independent of requestAnimationFrame.
// Each input is a mono signal: full, low, mid, high (after input gain).
const HOP_SAMPLES = 128;
const RMS_WINDOWS = [256, 512, 256, 256];
const REPORT_HOPS = 2;
const ATTACK_LOOKBACK_MS = 10;
const ATTACK_RELEASE_MS = 30;
const ATTACK_HOLD_MS = 24;
const ATTACK_REARM_RATIO = 0.5;
const ATTACK_MIN_INTERVAL_MS = 16;

class FastAnalysisProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = options.processorOptions || {};
    this.thresholds = config.thresholds || [Infinity, Infinity, Infinity, Infinity];
    this.epoch = 0;
    this.lookback = Math.max(1, Math.round(sampleRate * ATTACK_LOOKBACK_MS / 1000 / HOP_SAMPLES));
    this.hold = Math.max(1, Math.ceil(sampleRate * ATTACK_HOLD_MS / 1000 / HOP_SAMPLES));
    this.release = Math.exp(-HOP_SAMPLES / (sampleRate * ATTACK_RELEASE_MS / 1000));
    this.minInterval = Math.ceil(sampleRate * ATTACK_MIN_INTERVAL_MS / 1000 / HOP_SAMPLES);
    this.bands = RMS_WINDOWS.map(size => ({
      ring: new Float32Array(size), index: 0, sum: 0,
      history: new Float64Array(this.lookback), historyIndex: 0,
      recent: new Float64Array(this.hold), recentIndex: 0,
      envelope: 0, armed: true, lastAttack: -Infinity,
    }));
    this.levels = new Float64Array(4);
    this.deltas = new Float64Array(4);
    this.flags = new Array(4).fill(false);
    this.eventVolumes = new Float64Array(4);
    this.reset(0);
    this.port.onmessage = ({ data }) => {
      if (data.type === 'reset') this.reset(data.epoch);
      if (data.type === 'settings') this.thresholds = data.thresholds;
    };
  }

  reset(epoch) {
    this.epoch = epoch;
    this.samples = 0;
    this.hopNumber = 0;
    this.reportHops = 0;
    this.peak = 0;
    this.levels.fill(0);
    this.deltas.fill(0);
    this.flags.fill(false);
    this.eventVolumes.fill(0);
    for (const b of this.bands) {
      b.ring.fill(0);
      b.history.fill(0);
      b.recent.fill(0);
      b.recentIndex = 0;
      b.index = b.sum = b.historyIndex = b.envelope = 0;
      b.armed = true;
      b.lastAttack = -Infinity;
    }
  }

  analyseHop() {
    this.hopNumber++;
    this.reportHops++;
    let hasEvent = false;
    for (let i = 0; i < 4; i++) {
      const b = this.bands[i];
      this.levels[i] = Math.sqrt(Math.max(0, b.sum) / b.ring.length);
      // Trailing peak hold + fast rise/slow fall: steady low frequencies
      // should not become a new onset every time their RMS oscillates.
      b.recent[b.recentIndex] = this.levels[i];
      b.recentIndex = (b.recentIndex + 1) % b.recent.length;
      let held = 0;
      for (const level of b.recent) held = Math.max(held, level);
      b.envelope = Math.max(held, b.envelope * this.release);
      const previous = b.history[b.historyIndex];
      b.history[b.historyIndex] = b.envelope;
      b.historyIndex = (b.historyIndex + 1) % this.lookback;
      const delta = Math.max(0, b.envelope - previous);
      this.deltas[i] = Math.max(this.deltas[i], delta);
      const threshold = this.thresholds[i];
      if (delta < threshold * ATTACK_REARM_RATIO) b.armed = true;
      if (b.armed && delta >= threshold && this.hopNumber - b.lastAttack >= this.minInterval) {
        b.armed = false;
        b.lastAttack = this.hopNumber;
        this.flags[i] = true;
        hasEvent = true;
      }
    }
    for (let i = 0; i < 4; i++) {
      if (this.flags[i]) this.eventVolumes[i] = Math.max(this.eventVolumes[i], this.levels[0]);
    }
    // Send attacks immediately. Routine level reports are batched in pairs.
    if (hasEvent || this.reportHops >= REPORT_HOPS) {
      this.port.postMessage({
        epoch: this.epoch,
        level: this.levels[0],
        deltas: this.deltas,
        flags: this.flags,
        eventVolumes: this.eventVolumes,
        peak: this.peak,
      });
      this.deltas.fill(0);
      this.flags.fill(false);
      this.eventVolumes.fill(0);
      this.peak = 0;
      this.reportHops = 0;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0]?.[0];
    if (output) output.fill(0);
    const count = output?.length || inputs[0]?.[0]?.length || HOP_SAMPLES;
    for (let s = 0; s < count; s++) {
      for (let i = 0; i < 4; i++) {
        const b = this.bands[i];
        const sample = inputs[i]?.[0]?.[s] || 0;
        const power = sample * sample;
        // Subtract the old sample's squared amplitude before adding the new one.
        const old = b.ring[b.index];
        b.ring[b.index] = sample;
        b.sum += power - old * old;
        b.index = (b.index + 1) % b.ring.length;
        if (i === 0) this.peak = Math.max(this.peak, Math.abs(sample));
      }
      if (++this.samples === HOP_SAMPLES) {
        this.samples = 0;
        this.analyseHop();
      }
    }
    return true;
  }
}

registerProcessor('fast-audio-analysis', FastAnalysisProcessor);
