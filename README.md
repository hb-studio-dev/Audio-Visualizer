# Audio Visualizer

A browser-based, microphone-driven audio visualizer. It uses Web Audio for
analysis and a separate renderer in `visualizers/` for the animation.

## Start

Run a local development server from this directory:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`, or deploy the directory to an **HTTPS**
site such as GitHub Pages. Opening `index.html` as a `file://` URL will not
provide a reliable microphone-permission environment.

## Microphone selection (updated)

1. On page load, the app calls `getUserMedia({ audio: ... })` automatically.
   Allow microphone access in your browser's permission dialog.
2. Before permission is granted, the input selector is **not shown**. If the
   browser blocks automatic prompts, use the **ALLOW MICROPHONE** button. If
   access was denied, change your browser's site permission and use **TRY AGAIN**.
3. After permission, the app calls `enumerateDevices()` again while the
   permission stream is still active. Available input device names appear in
   the dropdown. Choose one and press **SET**.
4. To switch inputs later, open **SETTINGS → AUDIO SOURCE**, choose a device,
   then press **SWITCH SOURCE**.

A device switch uses `deviceId: { exact: ... }`. If the new input cannot be
opened, the previously connected input keeps running. The selected device is
synchronized across the startup screen and settings menu after a successful
switch. Device lists also refresh on the browser's `devicechange` event.

**Important:** Browsers and operating systems decide which input devices are
exposed to webpages. Even with permission, the page cannot display devices
that the browser/OS does not make available. Device labels are obtained from
the browser; their language may depend on the operating system or drivers.

## Controls

The top-right buttons open fullscreen and the settings sidebar. Both fade out
after 3 seconds of inactivity and return when you interact with the page.
The settings menu controls input gain, full-band/low/mid/high attack detection,
crossover frequencies, and peak detection. The input-level meter shows the gain-adjusted RMS level in
dBFS and threshold lamps light when attacks are detected.

- Desktop default gain: **0 dB**
- Mobile default gain: **+30 dB**
- Gain range: **−70 to +100 dB**, step **0.1 dB**
- Threshold range: **−100 to +100 dB**, step **0.1 dB**
- Low / Mid Crossover: **120 Hz** by default
- Mid / High Crossover: **4,000 Hz** by default
- Band Separation: **−9 dB** by default. A band attack must also be at least
  35.5% of the stronger adjacent band's onset magnitude. Closer to 0 dB is
  stricter; −60 dB disables the relative check. Full-band/peak detection and
  raw attack magnitudes are unchanged. The check uses the same analysis hop
  (or frame in fallback mode); there is no lookahead or extra buffer.
- Crossover controls: **20–20,000 Hz**, logarithmic sliders and 1 Hz numeric entry.
  Low / Mid must stay below Mid / High. Filters update live, without reconnecting
  the audio source, for both AudioWorklet and the fallback analyzer. Cutoffs are
  limited below Nyquist on low-sample-rate devices. Changing cutoffs during sound
  may itself produce a band attack.

Settings are retained locally using the separate keys
`audioVisualizerSettingsDb:v1:desktop` and
`audioVisualizerSettingsDb:v1:mobile`. The **RESET ANALYSIS SETTINGS**
button restores the corresponding defaults. Audio is analyzed without audible
speaker playback.

## Audio data

The renderer receives the following values in each `update(audio, dt)` call:

| Property | Meaning |
| --- | --- |
| `volume` | Gain-adjusted full-band RMS, clamped to 0–1 |
| `inputLevel` | Gain-adjusted full-band RMS without the 1.0 cap |
| `rawVolume` | RMS before input gain |
| `attack`, `attackTriggered` | Full-band envelope increase and detection flag |
| `lowAttack`, `lowAttackTriggered` | Low-band (below Low / Mid crossover; default 120 Hz) |
| `midAttack`, `midAttackTriggered` | Mid-band (between crossovers; default 120–4000 Hz) |
| `highAttack`, `highAttackTriggered` | High-band (above Mid / High crossover; default 4000 Hz) |
| `peak`, `peakTriggered` | Peak sample amplitude and detection flag |
| `waveform` | Reused `Float32Array(1024)` of time-domain audio samples |
| `attackEventMode` | True when flags are consumed audio-thread events (do not edge-detect them again) |
| `attackVolume`, `lowAttackVolume` | Full-band short-window RMS at the corresponding attack (otherwise latest RMS) |

Thresholds are expressed as dBFS relative to amplitude 1.0, including the
positive envelope difference used for attack detection. Existing threshold values
and saved settings are retained, but detection sensitivity may differ.

The AudioWorklet (`audio/analysisProcessor.js`) analyzes every 128 samples,
using 256-sample RMS windows for full/mid/high and 512 samples for low.
At 48 kHz this is a 2.67 ms analysis hop with 5.33/10.67 ms windows.
The crossover uses second-order Butterworth filters (12 dB/oct) with the
Web Audio Q parameter correctly expressed in dB. No extra filter stages are
introduced. Filter response changes can still change threshold-crossing times.
The onset detector compares a fast-rise, slow-release envelope to its value
about 10 ms earlier, with a 24 ms trailing peak hold to suppress steady bass
oscillations. A half-threshold rearm and 16 ms minimum interval
per band reduce repeated triggers. Routine reports are sent every two hops;
attacks are sent immediately and retained until the next render. Multiple
attacks in the same band within one render frame are combined into one flag.
The renderer still updates at display refresh rate. The audio device and
browser determine the actual capture and presentation latency.
If AudioWorklet is unavailable, the existing frame-based analyser uses the
short RMS windows as a fallback. Microphone input requests low latency, but
browsers may ignore this hint. Waveform length and graphics settings are unchanged.

## Use a different visualizer

Create a module exporting `createVisualizer(mount)` that returns the functions
`update(audio, dt)` and `dispose()`. Use `visualizers/blank.js` for the interface
and change the import in `main.js` to point to your renderer. The current
renderer is `visualizers/particle-wave-gravity.js`.

After deploying updated files to GitHub Pages, refresh the browser to load the
new JavaScript and CSS. The version query parameters in `index.html` and
imports of `main.js` help avoid stale cached modules.
