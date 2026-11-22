import { AudioAnalyser } from "./audio/audioAnalyser.js";
import { AudioSelector } from "./audio/audioSelector.js";
import { SettingsMenu } from "./ui/settingsMenu.js";
// ★ 新しいページで差し替えるのは、基本的にこの1行だけ
import { createVisualizer } from "./visualizers/particle-wave.js";

const $ = (id) => document.getElementById(id);
const initial = $("initialDeviceSelect"),
  settings = $("settingsDeviceSelect");
const selector = new AudioSelector([initial, settings]);
const analyser = new AudioAnalyser();
const menu = new SettingsMenu((values) => analyser.setSettings(values));
const renderer = createVisualizer($("visualizerMount"));
// ページの描画領域と設定UIをまとめて全画面にする。
const fullscreenRoot = $("visualizerRoot");
const fullscreenButton = $("fullscreenButton");
function syncFullscreenButton() {
  const active = document.fullscreenElement === fullscreenRoot;
  fullscreenButton.classList.toggle("is-fullscreen", active);
  fullscreenButton.setAttribute("aria-pressed", String(active));
  const label = active ? "全画面表示を解除する" : "全画面表示にする";
  fullscreenButton.setAttribute("aria-label", label);
  fullscreenButton.title = label;
}
if (!document.fullscreenEnabled || !fullscreenRoot.requestFullscreen) {
  fullscreenButton.disabled = true;
  fullscreenButton.title = "このブラウザでは全画面表示を利用できません";
}
fullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await fullscreenRoot.requestFullscreen();
    }
  } catch (error) {
    console.error("全画面表示の切り替えに失敗しました:", error);
    fullscreenButton.title = `全画面切り替え失敗: ${error.message}`;
  }
});
document.addEventListener("fullscreenchange", syncFullscreenButton);
syncFullscreenButton();
let running = false,
  lastTime = 0,
  rafId = 0;
function render(time) {
  if (!running) return;
  const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
  lastTime = time;
  renderer.update(analyser.getAnalysis(), dt);
  rafId = requestAnimationFrame(render);
}
function status(message) {
  $("sourceStatus").textContent = message;
  $("settingsStatus").textContent = message;
}
async function selectStream(deviceId) {
  const stream = await selector.open(deviceId);
  try {
    await analyser.useStream(stream);
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }
  await selector.refresh();
  if (!running) {
    running = true;
    rafId = requestAnimationFrame(render);
  }
}
async function init() {
  if (!navigator.mediaDevices?.getUserMedia) {
    status("HTTPS または localhost で開いてください。");
    return;
  }
  try {
    // 権限取得後ならデバイス名を列挙できる。権限が未付与の場合はボタン押下で許可を要求する。
    const devices = await selector.refresh();
    $("setSourceButton").disabled = false;
    if (!devices.length)
      status("SETを押してマイクへのアクセスを許可してください。");
    else status("デバイスを選びSETを押してください。");
  } catch (e) {
    status(`デバイス一覧取得失敗: ${e.message}`);
    $("setSourceButton").disabled = false;
  }
}
$("setSourceButton").addEventListener("click", async () => {
  $("setSourceButton").disabled = true;
  status("マイクを接続しています…");
  try {
    await selectStream(initial.value);
    $("sourceScreen").classList.add("is-hidden");
    status("接続中");
  } catch (e) {
    status(`接続できません: ${e.message}`);
  } finally {
    $("setSourceButton").disabled = false;
  }
});
$("applySourceButton").addEventListener("click", async () => {
  $("applySourceButton").disabled = true;
  status("入力デバイスを切り替えています…");
  try {
    await selectStream(settings.value);
    status("入力デバイスを切り替えました。");
  } catch (e) {
    status(`切り替え失敗: ${e.message}`);
  } finally {
    $("applySourceButton").disabled = false;
  }
});
navigator.mediaDevices?.addEventListener?.("devicechange", () =>
  selector.refresh().catch(() => {}),
);
window.addEventListener(
  "pagehide",
  () => {
    running = false;
    cancelAnimationFrame(rafId);
    renderer.dispose();
    analyser.stop();
  },
  { once: true },
);
init();
