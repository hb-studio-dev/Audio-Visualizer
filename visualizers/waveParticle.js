
/**
 * Particle Wave Visualizer
 *
 * audio.waveform: Float32Array(1024)
 * audio.attackTriggered: boolean
 *
 * 毎フレーム波形からパーティクルを生成
 * アタックあり：赤
 * アタックなし：白
 *
 * 各パーティクルは生成時の波形に応じた
 * 一定速度で上下移動し、フェードアウトする。
 */

export function createVisualizer(mount) {

  // ========================================
  // パラメータ
  // ========================================

  const PARTICLE_SPACING = 1;
  // 横方向の生成間隔（px）
  // 1 = 毎ピクセルに生成

  const PARTICLE_SIZE = 1;
  // パーティクルの大きさ（px）

  const PARTICLE_LIFETIME = 3;
  // 消滅するまでの秒数

  const SPEED_DIVISOR = 0.1;
  // 移動速度の除数
  // 小さいほど高速

  const SPEED_MULTIPLIER = 1;
  // 移動速度の追加倍率

  const MAX_PARTICLES = 1000000;
  // パーティクル最大数

  const BACKGROUND_COLOR = "#090b12";

  const ATTACK_COLOR = [255, 0, 0];
  const NORMAL_COLOR = [255, 255, 255];

  const CENTER_LINE_COLOR = "rgba(255,0,0,1)";
  const CENTER_LINE_WIDTH = 1;

  const MAX_PIXEL_RATIO = 1.5;

  // ========================================
  // Canvas初期化
  // ========================================

  const canvas = document.createElement("canvas");

  const ctx = canvas.getContext("2d", {
    alpha: false
  });

  if (!ctx) {
    throw new Error("Canvas 2D is not available.");
  }

  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  mount.appendChild(canvas);

  let width = 1;
  let height = 1;

  // パーティクル配列
  const particles = [];

  // ========================================
  // リサイズ
  // ========================================

  function resize() {

    const bounds = mount.getBoundingClientRect();

    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);

    const dpr = Math.min(
      window.devicePixelRatio || 1,
      MAX_PIXEL_RATIO
    );

    canvas.width = Math.max(
      1,
      Math.round(width * dpr)
    );

    canvas.height = Math.max(
      1,
      Math.round(height * dpr)
    );

    ctx.setTransform(
      dpr, 0,
      0, dpr,
      0, 0
    );
  }

  const observer = new ResizeObserver(resize);

  observer.observe(mount);

  resize();

  // ========================================
  // パーティクル生成
  // ========================================

  function spawnParticles(waveform, attack) {

    if (!waveform || waveform.length < 2) {
      return;
    }

    const color = attack
      ? ATTACK_COLOR
      : NORMAL_COLOR;

    // 画面横方向に一定間隔で生成
    for (
      let x = 0;
      x < width;
      x += PARTICLE_SPACING
    ) {

      // X座標を波形サンプル位置に変換
      const sampleIndex = Math.min(
        waveform.length - 1,
        Math.floor(
          (x / width) * waveform.length
        )
      );

      const sample = Math.max(
        -1,
        Math.min(1, waveform[sampleIndex])
      );

      // 波形の振幅から速度を計算
      const velocity =
        (sample / SPEED_DIVISOR) *
        SPEED_MULTIPLIER;

      particles.push({

        // 横方向の位置
        xRatio: x / width,

        // 中央からのY方向移動量
        yOffset: 0,

        // 移動速度
        vy: velocity,

        // 経過時間
        age: 0,

        // 寿命
        lifetime: PARTICLE_LIFETIME,

        // 色
        r: color[0],
        g: color[1],
        b: color[2]

      });
    }

    // 上限を超えた古いパーティクルを削除
    if (particles.length > MAX_PARTICLES) {

      particles.splice(
        0,
        particles.length - MAX_PARTICLES
      );
    }
  }

  // ========================================
  // パーティクル更新
  // ========================================

  function updateParticles(dt) {

    // 60fps基準
    const frameScale = dt * 60;

    // 後ろから処理して削除を安全に行う
    for (
      let i = particles.length - 1;
      i >= 0;
      i--
    ) {

      const p = particles[i];

      // 移動
      p.yOffset += p.vy * frameScale;

      // 時間経過
      p.age += dt;

      // 寿命終了
      if (p.age >= p.lifetime) {

        particles.splice(i, 1);
      }
    }
  }

  // ========================================
  // パーティクル描画
  // ========================================

  function drawParticles() {

    const centerY = height / 2;

    for (let i = 0; i < particles.length; i++) {

      const p = particles[i];

      // フェードアウト
      const opacity = Math.max(
        0,
        1 - p.age / p.lifetime
      );

      const x = p.xRatio * width;
      const y = centerY + p.yOffset;

      // 画面外のパーティクルは描画しない
      if (
        y < -PARTICLE_SIZE ||
        y > height + PARTICLE_SIZE
      ) {
        continue;
      }

      ctx.fillStyle =
        `rgba(${p.r},${p.g},${p.b},${opacity})`;

      ctx.fillRect(
        x,
        y,
        PARTICLE_SIZE,
        PARTICLE_SIZE
      );
    }
  }

  // ========================================
  // 中央の赤い線
  // ========================================

  function drawCenterLine() {

    const centerY = height / 2;

    ctx.beginPath();

    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);

    ctx.strokeStyle = CENTER_LINE_COLOR;
    ctx.lineWidth = CENTER_LINE_WIDTH;

    ctx.stroke();
  }

  // ========================================
  // メインループ
  // ========================================

  return {

    update(audio, dt) {

      const waveform = audio.waveform;

      const attack = Boolean(
        audio.attackTriggered
      );

      // dtの異常値を防止
      const delta = Number.isFinite(dt)
        ? Math.max(0, Math.min(dt, 0.1))
        : 1 / 60;

      // 背景をクリア
      ctx.fillStyle = BACKGROUND_COLOR;

      ctx.fillRect(
        0,
        0,
        width,
        height
      );

      // 既存パーティクルを更新
      updateParticles(delta);

      // 毎フレーム新しいパーティクルを生成
      spawnParticles(waveform, attack);

      // パーティクル描画
      drawParticles();

      // 中央の線を描画
      drawCenterLine();
    },

    dispose() {

      observer.disconnect();

      particles.length = 0;

      canvas.remove();
    }
  };
}
