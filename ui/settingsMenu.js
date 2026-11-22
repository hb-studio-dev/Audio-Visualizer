import { DEFAULT_SETTINGS } from "../audio/audioAnalyser.js";
const CONTROL_DEFS = [
  {
    key: "inputGain",
    label: "入力ゲイン",
    min: 0,
    max: 5,
    step: 0.01,
    description: "入力音量の倍率",
  },
  {
    key: "attackThreshold",
    label: "全帯域 Attack しきい値",
    min: 0,
    max: 0.2,
    step: 0.001,
    description: "全帯域での急な音量変化を検出",
  },
  {
    key: "lowAttackThreshold",
    label: "Low Attack しきい値",
    min: 0,
    max: 0.2,
    step: 0.001,
    description: "低域（概ね250Hz以下）",
  },
  {
    key: "midAttackThreshold",
    label: "Mid Attack しきい値",
    min: 0,
    max: 0.2,
    step: 0.001,
    description: "中域（概ね250–4000Hz）",
  },
  {
    key: "highAttackThreshold",
    label: "High Attack しきい値",
    min: 0,
    max: 0.2,
    step: 0.001,
    description: "高域（概ね4000Hz以上）",
  },
  {
    key: "peakThreshold",
    label: "Peak しきい値",
    min: 0,
    max: 1,
    step: 0.01,
    description: "瞬間最大振幅の検出",
  },
];
export class SettingsMenu {
  constructor(onSettingsChange) {
    this.onSettingsChange = onSettingsChange;
    try {
      this.values = {
        ...DEFAULT_SETTINGS,
        ...JSON.parse(localStorage.getItem("audioVisualizerSettings") || "{}"),
      };
    } catch {
      this.values = { ...DEFAULT_SETTINGS };
    }
    this.button = document.getElementById("menuButton");
    this.panel = document.getElementById("settingsPanel");
    this.backdrop = document.getElementById("settingsBackdrop");
    this.button.addEventListener("click", () =>
      this.setOpen(!this.panel.classList.contains("is-open")),
    );
    document
      .getElementById("closeSettingsButton")
      .addEventListener("click", () => this.setOpen(false));
    this.backdrop.addEventListener("click", () => this.setOpen(false));
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.setOpen(false);
    });
    const controls = document.getElementById("analysisControls");
    for (const def of CONTROL_DEFS) {
      const row = document.createElement("div");
      row.className = "control-row";
      const label = document.createElement("label");
      label.className = "control-heading";
      const title = document.createElement("span");
      title.textContent = def.label;
      const output = document.createElement("output");
      output.textContent = String(this.values[def.key]);
      label.append(title, output);
      const input = document.createElement("input");
      input.type = "range";
      input.id = `setting-${def.key}`;
      input.min = def.min;
      input.max = def.max;
      input.step = def.step;
      input.value = this.values[def.key];
      label.htmlFor = input.id;
      const small = document.createElement("small");
      small.textContent = def.description;
      row.append(label, input, small);
      controls.append(row);
      input.addEventListener("input", () => {
        this.values[def.key] = Number(input.value);
        output.textContent = Number(input.value).toFixed(
          def.step < 0.01 ? 3 : 2,
        );
        this.emit();
      });
    }
    document
      .getElementById("resetSettingsButton")
      .addEventListener("click", () => {
        this.values = { ...DEFAULT_SETTINGS };
        for (const def of CONTROL_DEFS) {
          const input = document.getElementById(`setting-${def.key}`);
          input.value = this.values[def.key];
          input.parentElement.querySelector("output").textContent = String(
            this.values[def.key],
          );
        }
        this.emit();
      });
    this.emit();
  }
  emit() {
    try {
      localStorage.setItem(
        "audioVisualizerSettings",
        JSON.stringify(this.values),
      );
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
