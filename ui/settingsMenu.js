import { DEVICE_DEFAULT_SETTINGS } from "../audio/audioAnalyser.js";

const CONTROL_DEFS = [
  {
    key: "inputGainDb",
    label: "入力ゲイン",
    min: -70,
    max: 100,
    step: 0.1,
    description: "音声解析用の入力ゲイン（dB）。音声はスピーカーへ出力しません。",
  },
  {
    key: "attackThresholdDb",
    label: "全帯域 Attack しきい値",
    min: -100,
    max: 100,
    step: 0.1,
    description: "前フレームからの全帯域RMS増加量（dBFS）",
  },
  {
    key: "lowAttackThresholdDb",
    label: "Low Attack しきい値",
    min: -100,
    max: 100,
    step: 0.1,
    description: "低域（概ね250Hz以下）のRMS増加量（dBFS）",
  },
  {
    key: "midAttackThresholdDb",
    label: "Mid Attack しきい値",
    min: -100,
    max: 100,
    step: 0.1,
    description: "中域（概ね250–4000Hz）のRMS増加量（dBFS）",
  },
  {
    key: "highAttackThresholdDb",
    label: "High Attack しきい値",
    min: -100,
    max: 100,
    step: 0.1,
    description: "高域（概ね4000Hz以上）のRMS増加量（dBFS）",
  },
  {
    key: "peakThresholdDb",
    label: "Peak しきい値",
    min: -100,
    max: 100,
    step: 0.1,
    description: "瞬間最大振幅（dBFS）",
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
      `現在の初期設定：${this.deviceProfile === "mobile" ? "スマートフォン" : "PC"} ` +
      `（入力ゲイン ${labelDb(this.defaults.inputGainDb)}）`;
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
      number.setAttribute("aria-label", `${def.label}（dB）`);
      const unit = document.createElement("span");
      unit.textContent = "dB";
      numberRow.append(number, unit);

      const help = document.createElement("small");
      help.textContent = def.description;
      row.append(label, range, numberRow, help);
      controls.append(row);
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

  setOpen(open) {
    this.panel.classList.toggle("is-open", open);
    this.panel.setAttribute("aria-hidden", String(!open));
    this.panel.inert = !open;
    this.backdrop.hidden = !open;
    this.button.setAttribute("aria-expanded", String(open));
  }
}
