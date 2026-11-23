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
and peak detection. The input-level meter shows the gain-adjusted RMS level in
dBFS and threshold lamps light when attacks are detected.

- Desktop default gain: **0 dB**
- Mobile default gain: **+30 dB**
- Gain range: **−70 to +100 dB**, step **0.1 dB**
- Threshold range: **−100 to +100 dB**, step **0.1 dB**

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
| `attack`, `attackTriggered` | Full-band RMS increase and detection flag |
| `lowAttack`, `lowAttackTriggered` | Low-band (approximately below 250 Hz) |
| `midAttack`, `midAttackTriggered` | Mid-band (approximately 250–4000 Hz) |
| `highAttack`, `highAttackTriggered` | High-band (approximately above 4000 Hz) |
| `peak`, `peakTriggered` | Peak sample amplitude and detection flag |
| `waveform` | Reused `Float32Array(1024)` of time-domain audio samples |

Thresholds are expressed as dBFS relative to amplitude 1.0, including the
positive RMS *difference* used for attack detection. Existing defaults are
converted from the original amplitude thresholds and were not changed by the
microphone-selector update.

## Use a different visualizer

Create a module exporting `createVisualizer(mount)` that returns the functions
`update(audio, dt)` and `dispose()`. Use `visualizers/blank.js` for the interface
and change the import in `main.js` to point to your renderer. The current
renderer is `visualizers/particle-wave-gravity.js`.

After deploying updated files to GitHub Pages, refresh the browser to load the
new JavaScript and CSS. The version query parameters in `index.html` and
imports of `main.js` help avoid stale cached modules.
