# Audio Visualizer Template

以前のDeclarative Audio Visualizerの「音声入力と設定UI」という考え方を引き継いだ**新規の独立テンプレート**です。元プロジェクトのソースをそのまま抽出したものではありません。描画部分を差し替えて複数のページを作れます。

## 起動

ローカルでプロジェクトディレクトリに移動し `python3 -m http.server 8000` → `http://localhost:8000` で開く。またはHTTPS配信する。`file://` 直開きは不可。

## 新しいページを作成する

1. テンプレートのフォルダを複製する。
2. `visualizers/blank.js` を参考に自作アニメーションJS（例 `visualizers/myScene.js`）を作る。
3. `main.js` の `import {createVisualizer} from './visualizers/example.js';` を `./visualizers/myScene.js` に変更する。
4. それ以外のコードは変更不要。Canvas以外にThree.jsを使う場合も `createVisualizer(mount)` が `update(audio,dt)` と `dispose()` を返せばよい。

## 全画面表示

入力デバイスを SET で確定すると、画面右上の左側に全画面表示ボタンが出ます。クリックすると `#visualizerRoot` を全画面表示にし、同じボタンで解除できます。Escキーで解除した場合もアイコンが同期します。右上の設定メニューも全画面内で表示できます。Fullscreen API未対応の環境ではボタンが無効になります。ブラウザの制約により全画面表示できない場合があります。

## 音声解析の値

| キー | 内容 |
| --- | --- |
| `volume` | ゲイン調整後RMS（約0～1） |
| `rawVolume` | ゲイン調整前のRMS |
| `attack` / `attackTriggered` | 全帯域の正のRMS変化 / しきい値判定 |
| `lowAttack` / `lowAttackTriggered` | 250Hz以下に近い帯域 |
| `midAttack` / `midAttackTriggered` | 250～4000Hzに近い帯域 |
| `highAttack` / `highAttackTriggered` | 4000Hz以上に近い帯域 |
| `peak` / `peakTriggered` | 現フレームの最大振幅 / しきい値判定 |
| `waveform` | `Float32Array(1024)`。入力ゲイン適用後の時間領域波形（通常 -1～+1 付近） |

解析しきい値と入力ゲインは右上の設定パネルで変更し、ブラウザのlocalStorageに保存されます。同一オリジン内では設定を共有します。値は線形値でありdBではありません。これは旧コードの解析計算・設定値と完全互換ではありません。

## 注意

- マイク利用にはHTTPSまたはlocalhostが必要。OS/ブラウザの入力許可も必要です。
- 別の描画コードには、`visualizers` のファイルのみ差し替えてください。
- 実運用で旧ビジュアライザーと解析感度やUIを厳密に合わせるには、元ソースを参照して `audio/audioAnalyser.js` とCSSの調整が必要です。

## 波形配列の利用例

各フレームの `update(audio, dt)` から `audio.waveform` を参照できます。

```js
update(audio, dt) {
  const samples = audio.waveform; // Float32Array、1024サンプル
  const firstSample = samples[0];
  // Canvas上に描画する等、自由に利用できます。
}
```

**注意:** 余計なメモリ割当を減らすため、波形配列はフレーム間で再利用されます。過去の波形を保持したい場合は `new Float32Array(audio.waveform)` でコピーしてください。サンプルの値は入力ゲインを反映しています。`waveform` は周波数スペクトルではなく時間領域のPCM波形です。
