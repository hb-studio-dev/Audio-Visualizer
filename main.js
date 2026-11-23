import { AudioAnalyser } from "./audio/audioAnalyser.js?v=meter-clean-v3";
import { AudioSelector } from "./audio/audioSelector.js";
import { SettingsMenu } from "./ui/settingsMenu.js?v=meter-clean-v3";
// ★ 新しいページで差し替えるのは、基本的にこの1行だけ
import { createVisualizer } from "./visualizers/particle-wave-gravity.js";

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

// 右上の全画面・設定ボタンを、無操作時だけフェードアウトする。
// 非表示までの時間は、この値（ミリ秒）で変更できます。
const CONTROLS_IDLE_MS = 3000;
const menuHotspot = $("menuHotspot");
const settingsPanel = $("settingsPanel");
let controlsHideTimer = 0;

function showControls() {
  window.clearTimeout(controlsHideTimer);
  menuHotspot.classList.remove("is-idle");
  menuHotspot.inert = false;

  controlsHideTimer = window.setTimeout(() => {
    // 設定パネルの表示中は、操作が止まってもボタンを隠さない。
    if (settingsPanel.classList.contains("is-open")) return;
    menuHotspot.classList.add("is-idle");
    menuHotspot.inert = true;
  }, CONTROLS_IDLE_MS);
}

// PCとスマートフォンの両方に対応。再生中の音や描画ではタイマーを更新しない。
for (const eventName of ["pointermove", "pointerdown", "wheel", "keydown", "touchstart"]) {
  window.addEventListener(eventName, showControls, { passive: true });
}
menuHotspot.addEventListener("focusin", showControls);
document.addEventListener("fullscreenchange", showControls);
window.addEventListener("pageshow", showControls);
showControls();

let running = false,
  lastTime = 0,
  rafId = 0;
let visualizerErrorLogged = false;

function render(time) {
  if (!running) return;
  // 次の更新は最初に予約。描画エラーで監視が止まらないようにする。
  rafId = requestAnimationFrame(render);
  const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
  lastTime = time;
  let analysis;
  try {
    analysis = analyser.getAnalysis();
  } catch (error) {
    console.error("音声解析エラー:", error);
    return;
  }
  // 解析結果はレンダラーと監視UIに同一オブジェクトを渡す。
  // フレーム間引きなし。検出イベントの取りこぼしを防ぐ。
  try {
    menu.updateMonitoring(analysis, Boolean(analyser.ctx));
  } catch (error) {
    console.error("入力メーター更新エラー:", error);
  }
  try {
    renderer.update(analysis, dt);
  } catch (error) {
    if (!visualizerErrorLogged) {
      console.error("ビジュアライザー描画エラー（メーターは継続します）:", error);
      visualizerErrorLogged = true;
    }
  }
}
function status(message) {
  $("sourceStatus").textContent = message;
  $("settingsStatus").textContent = message;
}
async function selectStream(deviceId) {
  menu.resetMonitoring();
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
