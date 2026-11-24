import { AudioAnalyser } from "./audio/audioAnalyser.js?v=crossover-v1";
import { AudioSelector } from "./audio/audioSelector.js?v=fast-audio-v1";
import { SettingsMenu } from "./ui/settingsMenu.js?v=crossover-v1";
// Replace this import to load a different visualizer.
import { createVisualizer } from "./visualizers/particle-wave-gravity.js?v=fast-audio-v1";

const $ = (id) => document.getElementById(id);
const initial = $("initialDeviceSelect");
const settings = $("settingsDeviceSelect");
const selector = new AudioSelector([initial, settings]);
const analyser = new AudioAnalyser();
const menu = new SettingsMenu((values) => analyser.setSettings(values));
const renderer = createVisualizer($("visualizerMount"));

const permissionStep = $("permissionStep");
const permissionStatus = $("permissionStatus");
const retryPermissionButton = $("retryPermissionButton");
const deviceSelectionStep = $("deviceSelectionStep");

// Keep the temporary microphone stream open until SET is pressed. Besides
// preventing a second permission prompt, this helps some browsers retain
// device labels while the input picker is on screen.
let permissionStream = null;
let permissionRequestId = 0;
let permissionGranted = false;
let sourceChangeBusy = false;

const fullscreenRoot = $("visualizerRoot");
const fullscreenButton = $("fullscreenButton");
function syncFullscreenButton() {
  const active = document.fullscreenElement === fullscreenRoot;
  fullscreenButton.classList.toggle("is-fullscreen", active);
  fullscreenButton.setAttribute("aria-pressed", String(active));
  const label = active ? "Exit fullscreen" : "Enter fullscreen";
  fullscreenButton.setAttribute("aria-label", label);
  fullscreenButton.title = label;
}
if (!document.fullscreenEnabled || !fullscreenRoot.requestFullscreen) {
  fullscreenButton.disabled = true;
  fullscreenButton.title = "Fullscreen is not supported in this browser";
}
fullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await fullscreenRoot.requestFullscreen();
    }
  } catch (error) {
    console.error("Could not toggle fullscreen:", error);
    fullscreenButton.title = `Fullscreen error: ${error.message}`;
  }
});
document.addEventListener("fullscreenchange", syncFullscreenButton);
syncFullscreenButton();

// Fade out the fullscreen and menu buttons after inactivity. User input,
// rather than the animation loop, resets this timer.
const CONTROLS_IDLE_MS = 3000;
const menuHotspot = $("menuHotspot");
const settingsPanel = $("settingsPanel");
let controlsHideTimer = 0;
function showControls() {
  window.clearTimeout(controlsHideTimer);
  menuHotspot.classList.remove("is-idle");
  menuHotspot.inert = false;
  controlsHideTimer = window.setTimeout(() => {
    if (settingsPanel.classList.contains("is-open")) return;
    menuHotspot.classList.add("is-idle");
    menuHotspot.inert = true;
  }, CONTROLS_IDLE_MS);
}
for (const eventName of ["pointermove", "pointerdown", "wheel", "keydown", "touchstart"]) {
  window.addEventListener(eventName, showControls, { passive: true });
}
menuHotspot.addEventListener("focusin", showControls);
document.addEventListener("fullscreenchange", showControls);
window.addEventListener("pageshow", showControls);
showControls();

let running = false;
let lastTime = 0;
let rafId = 0;
let visualizerErrorLogged = false;
function render(time) {
  if (!running) return;
  rafId = requestAnimationFrame(render);
  const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
  lastTime = time;
  let analysis;
  try {
    analysis = analyser.getAnalysis();
  } catch (error) {
    console.error("Audio analysis error:", error);
    return;
  }
  try {
    menu.updateMonitoring(analysis, Boolean(analyser.ctx));
  } catch (error) {
    console.error("Input meter update error:", error);
  }
  try {
    renderer.update(analysis, dt);
  } catch (error) {
    if (!visualizerErrorLogged) {
      console.error("Visualizer render error (audio meters continue):", error);
      visualizerErrorLogged = true;
    }
  }
}

function status(message) {
  $("sourceStatus").textContent = message;
  $("settingsStatus").textContent = message;
}

function sourceError(error) {
  if (["OverconstrainedError", "NotFoundError", "DevicesNotFoundError"].includes(error?.name)) {
    return "The selected microphone was not found. Check that it is connected.";
  }
  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(error?.name)) {
    return "Microphone access was denied or blocked. Allow access in your browser's site settings, then try again.";
  }
  if (["NotReadableError", "TrackStartError"].includes(error?.name)) {
    return "The microphone could not be opened. Check whether another app is using it.";
  }
  if (error?.name === "AbortError") {
    return "The microphone could not be started. Please try again.";
  }
  return error?.message || String(error);
}

async function requestMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
    permissionStatus.textContent = "Microphone access requires HTTPS or localhost and a supported browser.";
    retryPermissionButton.hidden = true;
    return;
  }

  const requestId = ++permissionRequestId;
  permissionGranted = false;
  permissionStep.hidden = false;
  deviceSelectionStep.hidden = true;
  permissionStatus.textContent = "Please allow microphone access in your browser's permission prompt.";
  retryPermissionButton.hidden = true;

  // Some browsers require a user gesture or suppress automatic prompts.
  // Show a manual fallback if no answer arrives; it can make a new request.
  const fallbackTimer = window.setTimeout(() => {
    if (requestId === permissionRequestId && !permissionGranted) {
      retryPermissionButton.hidden = false;
      retryPermissionButton.textContent = "ALLOW MICROPHONE";
    }
  }, 5000);

  let stream;
  try {
    // Request permission BEFORE enumerateDevices(), with no deviceId filter.
    stream = await selector.open();
    if (requestId !== permissionRequestId) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    permissionStream?.getTracks().forEach((track) => track.stop());
    permissionStream = stream;

    // Enumerate while a permitted audio track is actively open, so the
    // browser can reveal the available physical devices and their labels.
    permissionStatus.textContent = "Loading available audio inputs…";
    const devices = await selector.refresh();
    if (requestId !== permissionRequestId) return;
    if (!devices.length) {
      throw new Error("No audio input devices are available.");
    }

    selector.syncToStream(stream);
    permissionGranted = true;
    permissionStep.hidden = true;
    deviceSelectionStep.hidden = false;
    $("setSourceButton").disabled = false;
    status("Choose an input device and press SET.");
  } catch (error) {
    if (requestId !== permissionRequestId) return;
    if (permissionStream) {
      permissionStream.getTracks().forEach((track) => track.stop());
      permissionStream = null;
    } else {
      stream?.getTracks().forEach((track) => track.stop());
    }
    permissionStatus.textContent = sourceError(error);
    retryPermissionButton.textContent = "TRY AGAIN";
    retryPermissionButton.hidden = false;
  } finally {
    window.clearTimeout(fallbackTimer);
  }
}

// Switch only after the chosen stream and audio graph are ready. An error
// leaves the previous source running and the settings unchanged.
async function selectStream(deviceId) {
  if (sourceChangeBusy) return null;
  sourceChangeBusy = true;
  $("setSourceButton").disabled = true;
  $("applySourceButton").disabled = true;

  let stream;
  try {
    const preview = permissionStream;
    const previewId = preview?.getAudioTracks()[0]?.getSettings?.().deviceId;
    const previewActive = preview?.getAudioTracks().some((track) => track.readyState === "live");
    const canReusePreview = previewActive && (
      !deviceId || deviceId === "default" || deviceId === previewId
    );
    stream = canReusePreview ? preview : await selector.open(deviceId);
    try {
      await analyser.useStream(stream);
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      if (permissionStream === stream) permissionStream = null;
      throw error;
    }

    if (permissionStream && permissionStream !== stream) {
      permissionStream.getTracks().forEach((track) => track.stop());
    }
    permissionStream = null;
    menu.resetMonitoring();

    try {
      await selector.refresh();
    } catch (error) {
      console.warn("Could not refresh audio inputs:", error);
    }
    const name = selector.syncToStream(stream, deviceId);
    if (!running) {
      running = true;
      rafId = requestAnimationFrame(render);
    }
    return name;
  } finally {
    sourceChangeBusy = false;
    $("setSourceButton").disabled = !permissionGranted;
    $("applySourceButton").disabled = false;
  }
}

retryPermissionButton.addEventListener("click", requestMicrophonePermission);
$("setSourceButton").addEventListener("click", async () => {
  if (sourceChangeBusy || !permissionGranted) return;
  const deviceId = initial.value;
  status("Connecting to microphone…");
  try {
    const name = await selectStream(deviceId);
    $("sourceScreen").classList.add("is-hidden");
    status(`Connected: ${name}`);
  } catch (error) {
    status(`Connection failed: ${sourceError(error)}`);
  }
});
$("applySourceButton").addEventListener("click", async () => {
  if (sourceChangeBusy || !permissionGranted) return;
  const deviceId = settings.value;
  status("Switching audio input…");
  try {
    const name = await selectStream(deviceId);
    status(`Connected: ${name}`);
  } catch (error) {
    if (analyser.stream) selector.syncToStream(analyser.stream);
    status(`Switch failed: ${sourceError(error)} (Previous input remains active.)`);
  }
});

navigator.mediaDevices?.addEventListener?.("devicechange", () => {
  if (permissionGranted) selector.refresh().catch((error) => {
    console.warn("Could not update the input device list:", error);
  });
});
window.addEventListener("pagehide", () => {
  // An outstanding permission request is invalidated when the page closes.
  ++permissionRequestId;
  running = false;
  cancelAnimationFrame(rafId);
  permissionStream?.getTracks().forEach((track) => track.stop());
  permissionStream = null;
  renderer.dispose();
  analyser.stop();
}, { once: true });

// Automatically show the browser's microphone permission prompt on load.
// Browsers that require a click can use the fallback ALLOW MICROPHONE button.
requestMicrophonePermission();
