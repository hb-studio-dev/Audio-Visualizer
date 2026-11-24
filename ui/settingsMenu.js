import { DEVICE_DEFAULT_SETTINGS } from "../audio/audioAnalyser.js?v=fast-audio-v1";

const CONTROL_DEFS = [
  {
    key: "inputGainDb",
    label: "Input Gain",
    min: -70,
    max: 100,
    step: 0.1,
    description: "Input gain for audio analysis (dB). Audio is not played through the speakers.",
  },
  {
    key: "attackThresholdDb",
    label: "Full-Band Attack Threshold",
    min: -100,
    max: 100,
    step: 0.1,
    description: "Increase in full-band RMS since the previous frame (dBFS).",
  },
  {
    key: "lowAttackThresholdDb",
    label: "Low Attack Threshold",
    min: -100,
    max: 100,
    step: 0.1,
    description: "Increase in low-band RMS (approximately below 250 Hz), in dBFS.",
  },
  {
    key: "midAttackThresholdDb",
    label: "Mid Attack Threshold",
    min: -100,
    max: 100,
    step: 0.1,
    description: "Increase in mid-band RMS (approximately 250–4000 Hz), in dBFS.",
  },
  {
    key: "highAttackThresholdDb",
    label: "High Attack Threshold",
    min: -100,
    max: 100,
    step: 0.1,
    description: "Increase in high-band RMS (approximately above 4000 Hz), in dBFS.",
  },
  {
    key: "peakThresholdDb",
    label: "Peak Threshold",
    min: -100,
    max: 100,
    step: 0.1,
    description: "Instantaneous peak amplitude (dBFS).",
  },
];

// タッチ操作が主で、スマートフォン相当の画面幅の場合にモバイル扱い。
export function getDeviceProfile() {
  return window.matchMedia("(pointer: coarse) and (max-width: 1024px)").matches
    ? "mobile"
    : "desktop";
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const clean = (value) => Math.round(value * 10) / 10;
const labelDb = (value) => `${value > 0 ? "+" : ""}${value.toFixed(1)} dB`;

export class SettingsMenu {
  constructor(onSettingsChange) {
    this.onSettingsChange = onSettingsChange;
    this.deviceProfile = getDeviceProfile();
    // 旧バージョンの倍率・線形値を、dB値として誤読しないため新キーを使用。
    this.storageKey = `audioVisualizerSettingsDb:v1:${this.deviceProfile}`;
    this.defaults = { ...DEVICE_DEFAULT_SETTINGS[this.deviceProfile] };
    this.values = this.loadValues();
    this.inputs = new Map();
    this.indicators = new Map();
    this.litUntil = new Map();
    this.meterLevel = null;
    this.meterValue = null;
    this.meterFill = null;

    this.button = document.getElementById("menuButton");
    this.panel = document.getElementById("settingsPanel");
    this.backdrop = document.getElementById("settingsBackdrop");
    this.button.addEventListener("click", () =>
      this.setOpen(!this.panel.classList.contains("is-open")),
    );
    document.getElementById("closeSettingsButton")
      .addEventListener("click", () => this.setOpen(false));
    this.backdrop.addEventListener("click", () => this.setOpen(false));
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.setOpen(false);
    });

    const controls = document.getElementById("analysisControls");
    const deviceInfo = document.createElement("p");
    deviceInfo.className = "device-profile-note";
    deviceInfo.textContent =
      `Default profile: ${this.deviceProfile === "mobile" ? "Mobile" : "Desktop"} ` +
      `(input gain ${labelDb(this.defaults.inputGainDb)})`;
    controls.append(deviceInfo);

    for (const def of CONTROL_DEFS) {
      const row = document.createElement("div");
      row.className = "control-row";
      const label = document.createElement("label");
      label.className = "control-heading";
      label.htmlFor = `setting-${def.key}`;
      const title = document.createElement("span");
      title.textContent = def.label;
      const output = document.createElement("output");
      // しきい値に対応する検出ランプ（入力ゲインには付けない）
      if (def.key !== "inputGainDb") {
        const lamp = document.createElement("span");
        lamp.className = "detection-lamp";
        lamp.setAttribute("role", "status");
        lamp.setAttribute("aria-label", `${def.label}: Not detected`);
        lamp.title = "Lights up when an attack is detected";
        title.append(" ", lamp);
        this.indicators.set(def.key, lamp);
      }
      label.append(title, output);

      const range = document.createElement("input");
      range.type = "range";
      range.id = `setting-${def.key}`;
      range.min = String(def.min);
      range.max = String(def.max);
      range.step = String(def.step);

      const numberRow = document.createElement("div");
      numberRow.className = "setting-number-row";
      const number = document.createElement("input");
      number.type = "number";
      number.min = String(def.min);
      number.max = String(def.max);
      number.step = String(def.step);
      number.id = `setting-number-${def.key}`;
      number.setAttribute("aria-label", `${def.label} (dB)`);
      const unit = document.createElement("span");
      unit.textContent = "dB";
      numberRow.append(number, unit);

      const help = document.createElement("small");
      help.textContent = def.description;
      row.append(label, range, numberRow, help);
      controls.append(row);
      if (def.key === "inputGainDb") {
        // ゲイン調整のすぐ下に、解析系に入った実際の音量を表示
        const meter = document.createElement("div");
        meter.className = "input-level-meter";
        meter.innerHTML = `
          <div class="meter-heading">
            <span>Input Level (After Gain)</span>
            <output class="meter-reading" aria-label="Current input level">−∞ dBFS</output>
          </div>
          <div class="meter-track" role="meter" aria-label="Input level" aria-valuemin="-70" aria-valuemax="12" aria-valuenow="-70" aria-valuetext="Silence">
            <div class="meter-fill"></div>
            <div class="meter-zero"></div>
          </div>
          <div class="meter-ticks"><span>−70</span><span>−40</span><span>−20</span><span>0</span><span>+12 dBFS</span></div>
          <small>Adjust the gain to keep normal input levels below 0 dBFS.</small>
        `;
        row.append(meter);
        this.meterLevel = meter.querySelector(".meter-track");
        this.meterValue = meter.querySelector(".meter-reading");
        this.meterFill = meter.querySelector(".meter-fill");
      }
      this.inputs.set(def.key, { range, number, output });

      range.addEventListener("input", () => this.change(def, range.value));
      number.addEventListener("change", () => this.change(def, number.value));
      number.addEventListener("keydown", (event) => {
        if (event.key === "Enter") number.blur();
      });
    }

    document.getElementById("resetSettingsButton")
      .addEventListener("click", () => {
        this.values = { ...this.defaults };
        this.syncControls();
        this.emit();
      });

    this.syncControls();
    this.emit();
  }

  loadValues() {
    let stored = {};
    try {
      const parsed = JSON.parse(localStorage.getItem(this.storageKey) || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        stored = parsed;
      }
    } catch {}
    const settings = { ...this.defaults };
    for (const def of CONTROL_DEFS) {
      const value = Number(stored[def.key]);
      if (stored[def.key] != null && Number.isFinite(value)) {
        settings[def.key] = clean(clamp(value, def.min, def.max));
      }
    }
    return settings;
  }

  change(def, rawValue) {
    if (rawValue === "") {
      this.syncControl(def);
      return;
    }
    const number = Number(rawValue);
    if (!Number.isFinite(number)) {
      this.syncControl(def);
      return;
    }
    this.values[def.key] = clean(clamp(number, def.min, def.max));
    this.syncControl(def);
    this.emit();
  }

  syncControl(def) {
    const { range, number, output } = this.inputs.get(def.key);
    const value = clean(this.values[def.key]);
    range.value = String(value);
    number.value = value.toFixed(1);
    output.textContent = labelDb(value);
  }

  syncControls() {
    for (const def of CONTROL_DEFS) this.syncControl(def);
  }

  emit() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.values));
    } catch {}
    this.onSettingsChange({ ...this.values });
  }

  // 同じフレームでビジュアライザーに渡す解析オブジェクトを監視UIへ反映。
  // メニューが閉じていても状態を受け取り続けることで、再度開いた時にも値を確認できる。
  updateMonitoring(analysis, connected = true) {

    // 解析器が返すinputLevelを優先。旧版データとの互換性のため
    // waveform/volumeもフォールバックに使う。
    let level = Number(analysis?.inputLevel);
    if (!Number.isFinite(level) || level < 0) {
      const wave = analysis?.waveform;
      if (wave && wave.length) {
        let power = 0;
        for (let i = 0; i < wave.length; i++) power += wave[i] * wave[i];
        level = Math.sqrt(power / wave.length);
      }
      if (!(level > 0)) level = Math.max(0, Number(analysis?.volume) || 0);
    }
    if (!connected) level = 0;

    const db = level > 0 ? 20 * Math.log10(level) : -Infinity;
    const shownDb = Number.isFinite(db) ? Math.max(-70, Math.min(12, db)) : -70;
    const percent = ((shownDb + 70) / 82) * 100;
    const readout = Number.isFinite(db)
      ? `${db > 0 ? "+" : ""}${db.toFixed(1)} dBFS`
      : "−∞ dBFS";

    if (this.meterFill) {
      this.meterFill.style.width = `${percent}%`;
      this.meterFill.classList.toggle("is-over", db >= 0);
    }
    if (this.meterValue) {
      this.meterValue.textContent = readout;
      this.meterValue.classList.toggle("is-over", db >= 0);
    }
    if (this.meterLevel) {
      this.meterLevel.setAttribute("aria-valuenow", String(shownDb));
      this.meterLevel.setAttribute("aria-valuetext", readout);
    }

    const flags = {
      attackThresholdDb: "attackTriggered",
      lowAttackThresholdDb: "lowAttackTriggered",
      midAttackThresholdDb: "midAttackTriggered",
      highAttackThresholdDb: "highAttackTriggered",
      peakThresholdDb: "peakTriggered",
    };
    const now = performance.now();
    for (const [key, flag] of Object.entries(flags)) {
      if (connected && analysis?.[flag]) this.litUntil.set(key, now + 250);
      const lit = connected && now < (this.litUntil.get(key) ?? 0);
      const lamp = this.indicators.get(key);
      if (!lamp) continue;
      lamp.classList.toggle("is-lit", lit);
      const label = CONTROL_DEFS.find((def) => def.key === key).label;
      lamp.setAttribute("aria-label", `${label}: ${lit ? "Detected" : "Not detected"}`);
    }

  }

  resetMonitoring() {
    this.litUntil.clear();
    if (this.meterFill) {
      this.meterFill.style.width = "0%";
      this.meterFill.classList.remove("is-over");
      this.meterValue.textContent = "−∞ dBFS";
      this.meterValue.classList.remove("is-over");
      this.meterLevel.setAttribute("aria-valuenow", "-70");
      this.meterLevel.setAttribute("aria-valuetext", "Silence");
    }
    for (const lamp of this.indicators.values()) lamp.classList.remove("is-lit");
  }

  setOpen(open) {
    this.panel.classList.toggle("is-open", open);
    this.panel.setAttribute("aria-hidden", String(!open));
    this.panel.inert = !open;
    this.backdrop.hidden = !open;
    this.button.setAttribute("aria-expanded", String(open));
  }
}
