/**
 * このファイルだけ置換して各ページ固有のアニメーションを実装する。
 * mount: 描画領域のDOM要素
 * update(audio, dt): 毎フレーム呼ばれる。dtは秒。
 * audio: {volume,rawVolume,attack,attackTriggered,lowAttack,lowAttackTriggered,
 *         midAttack,midAttackTriggered,highAttack,highAttackTriggered,peak,peakTriggered,
 *         waveform: Float32Array(1024)}
 * dispose(): 画面遷移や破棄に備えた後片付け
 * Three.jsで描く場合もこのインターフェースを維持する。
 */
export function createVisualizer(mount) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  mount.append(canvas);
  function resize() {
    const r = mount.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(mount);
  resize();
  return {
    update(audio, dt) {
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      // TODO: ここに描画処理を記述。audio.volume や audio.lowAttackTriggered などを利用。
      // audio.waveform は長さ1024のFloat32Array（時間領域波形、ゲイン適用後）。
    },
    dispose() {
      observer.disconnect();
      canvas.remove();
    },
  };
}
