// 動作確認用サンプル。実制作では blank.js または独自のRendererへ差し替える。
export function createVisualizer(mount) {
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d");
  mount.append(canvas);
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 1.5),
      { width, height } = mount.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(mount);
  resize();
  let t = 0,
    flash = 0;
  return {
    update(audio, dt) {
      t += dt;
      flash = audio.lowAttackTriggered ? 1 : Math.max(0, flash - dt * 3);
      const w = canvas.clientWidth,
        h = canvas.clientHeight;
      ctx.fillStyle = "#090b12";
      ctx.fillRect(0, 0, w, h);
      const r = 45 + audio.volume * 380 + flash * 80;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(149,179,255,${0.5 + flash * 0.5})`;
      ctx.lineWidth = 3 + flash * 10;
      ctx.stroke();
      ctx.fillStyle = "#a5adbe";
      ctx.textAlign = "center";
      ctx.font = "14px Arial";
      ctx.fillText(
        `volume: ${audio.volume.toFixed(3)}   lowAttack: ${audio.lowAttack.toFixed(3)}`,
        w / 2,
        h / 2 + r + 30,
      );
    },
    dispose() {
      ro.disconnect();
      canvas.remove();
    },
  };
}
