
/**
 * 時間領域波形の描画サンプル
 * audio.waveform: Float32Array(1024), 通常 -1 ～ +1
 * 既存の main.js から createVisualizer を読み込んで使用する。
 */

let attackWave = [];
let attackWaveOpacity = 0;

export function createVisualizer(mount) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D を利用できません。");

  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  mount.appendChild(canvas);

  let width = 1;
  let height = 1;

  // ========================================
  // 描画パラメータ
  // ========================================

  const step = 4;

  const pointRadius = 1;
  const pointColor = "rgba(255,255,255,0.5)";
  const lineColor = "rgba(255,255,255,1)";
  const lineWidth = 0.3;

  function resize() {
    const bounds = mount.getBoundingClientRect();

    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(mount);
  resize();

  return {
    update(audio, dt) {
      const waveform = audio.waveform;
      const centerY = height / 2;
      const amplitude = height * 0.42;

      // ========================================
      // 背景
      // ========================================

      ctx.fillStyle = "#090b12";
      ctx.fillRect(0, 0, width, height);

      if (!waveform || waveform.length < 2) return;

      const pointsPerLine = Math.floor(waveform.length / step);

      if (pointsPerLine < 2) return;

      const attakedLine = audio.attackTriggered;

      // ========================================
      // 赤いアタック波形
      // ========================================

      if (attackWave.length > 0) {
        ctx.beginPath();

        for (let i = 0; i < attackWave.length; i++) {
          const x = (i / (attackWave.length - 1)) * width;
          const y = attackWave[i];

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);

          attackWave[i] =
            (y - centerY) * 0.997 + centerY;
        }

        ctx.strokeStyle =
          `rgba(255,0,0,${attackWaveOpacity})`;

        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.stroke();

        attackWaveOpacity *= 0.99;
      }

      // ========================================
      // 白い波形
      // ========================================

      for (let i = 0; i < step; i++) {

        // 各頂点の座標を保存
        const points = [];

        // 波形のパスを新規作成
        ctx.beginPath();

        for (let j = 0; j < pointsPerLine; j++) {
          const x =
            (j / (pointsPerLine - 1)) * width;

          const sample = Math.max(
            -1,
            Math.min(
              1,
              waveform[i * step + j]
            )
          );

          const y = centerY - sample * amplitude;

          // 線を構成
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);

          // 頂点座標を保存
          points.push({ x, y });
        }

        // ----------------------------------------
        // 白い線の描画
        // ----------------------------------------

        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = "round";
        ctx.stroke();

        // ----------------------------------------
        // 白い頂点の円を描画
        // ----------------------------------------

        // ctx.beginPath();

        // for (const point of points) {
        //   ctx.moveTo(
        //     point.x + pointRadius,
        //     point.y
        //   );

        //   ctx.arc(
        //     point.x,
        //     point.y,
        //     pointRadius,
        //     0,
        //     Math.PI * 2
        //   );
        // }

        // ctx.fillStyle = pointColor;
        // ctx.fill();

        // ----------------------------------------
        // アタック波形を保存
        // ----------------------------------------

        if (attakedLine && i === 0) {
          attackWave = points.map(point => point.y);
          attackWaveOpacity = 1;
        }
      }
    },

    dispose() {
      observer.disconnect();
      canvas.remove();
    },
  };
}
