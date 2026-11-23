
/**
 * GPU Particle Wave Visualizer
 *
 * WebGL2 / 最大1000万パーティクル
 *
 * - 毎フレーム波形から粒子を生成
 * - 通常粒子：赤から白へ変化
 * - アタック粒子：赤のまま
 * - アルファ値は毎フレーム乗算減衰
 * - アルファ下限で消滅
 * - 移動速度は指数減衰
 * - 粒子サイズは曲線的に変化
 * - 通常・アタックでサイズを個別設定
 */

export function createVisualizer(mount) {

  // ========================================
  // パラメータ
  // ========================================

  const PARTICLE_SPACING = 1;

  // ========================================
  // パーティクルサイズ
  // ========================================

  // 通常パーティクル
  const NORMAL_INITIAL_SIZE = 1.5;
  const NORMAL_FINAL_SIZE = 1.5;
  const NORMAL_SIZE_CURVE = 3.0;

  // アタックパーティクル
  const ATTACK_INITIAL_SIZE = 3.0;
  const ATTACK_FINAL_SIZE = 1.5;
  const ATTACK_SIZE_CURVE = 50.0;

  // SIZE_CURVE:
  // 0 = 直線的に変化
  // 1 = 緩やかな曲線
  // 3 = 最初に速く、最後にゆっくり
  // 8 = 最初に非常に速く変化
  //
  // INITIAL_SIZE < FINAL_SIZE なら拡大
  // INITIAL_SIZE > FINAL_SIZE なら縮小

  // ========================================
  // 初期アルファ値
  // ========================================

  const NORMAL_INITIAL_ALPHA = 0.3;
  const ATTACK_INITIAL_ALPHA = 1.0;

  // ========================================
  // アルファ値の減衰
  // ========================================

  // 60fps基準で毎フレーム掛ける倍率
  const NORMAL_ALPHA_DECAY = 0.998;
  const ATTACK_ALPHA_DECAY = 0.999;

  // この値以下になったら消滅
  const PARTICLE_MIN_ALPHA = 0.000001;

  // ========================================
  // 移動速度の指数減衰
  // ========================================

  const NORMAL_SPEED_HALF_LIFE = 10.0;
  const ATTACK_SPEED_HALF_LIFE = 5.0;

  // ========================================
  // 色変化の半減期
  // ========================================

  // 通常粒子：赤 → 白
  // アタック粒子：赤のまま
  const NORMAL_COLOR_HALF_LIFE = 2.0;

  // ========================================
  // 移動速度
  // ========================================

  const SPEED_DIVISOR = 0.05;
  const SPEED_MULTIPLIER = 0.99;

  // ========================================
  // 描画設定
  // ========================================

  const MAX_PARTICLES = 10000000;
  const MAX_PIXEL_RATIO = 1.5;

  const CENTER_LINE_COLOR = "#ff0000";
  const CENTER_LINE_WIDTH = 0.1;

  const BACKGROUND_COLOR = [9, 11, 18];

  // ========================================
  // パラメータ検証
  // ========================================

  if (
    NORMAL_ALPHA_DECAY <= 0 ||
    NORMAL_ALPHA_DECAY > 1 ||
    ATTACK_ALPHA_DECAY <= 0 ||
    ATTACK_ALPHA_DECAY > 1
  ) {
    throw new Error(
      "Alpha decay must be greater than 0 and at most 1."
    );
  }

  if (
    PARTICLE_MIN_ALPHA <= 0 ||
    PARTICLE_MIN_ALPHA >= 1
  ) {
    throw new Error(
      "PARTICLE_MIN_ALPHA must be greater than 0 and less than 1."
    );
  }

  if (
    NORMAL_INITIAL_SIZE < 0 ||
    NORMAL_FINAL_SIZE < 0 ||
    ATTACK_INITIAL_SIZE < 0 ||
    ATTACK_FINAL_SIZE < 0
  ) {
    throw new Error(
      "Particle sizes must be zero or greater."
    );
  }

  if (
    NORMAL_SIZE_CURVE < 0 ||
    ATTACK_SIZE_CURVE < 0
  ) {
    throw new Error(
      "SIZE_CURVE must be zero or greater."
    );
  }

  if (PARTICLE_SPACING <= 0) {
    throw new Error(
      "PARTICLE_SPACING must be greater than 0."
    );
  }

  // ========================================
  // Canvas初期化
  // ========================================

  const originalPosition = mount.style.position;
  let changedPosition = false;

  if (getComputedStyle(mount).position === "static") {
    mount.style.position = "relative";
    changedPosition = true;
  }

  const canvas = document.createElement("canvas");

  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    display: "block",
  });

  mount.appendChild(canvas);

  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    canvas.remove();

    if (changedPosition) {
      mount.style.position = originalPosition;
    }

    throw new Error("WebGL2 is not available.");
  }

  // ========================================
  // 中央の赤い線
  // ========================================

  const centerLine = document.createElement("div");

  Object.assign(centerLine.style, {
    position: "absolute",
    left: "0",
    top: "50%",
    width: "100%",
    height: `${CENTER_LINE_WIDTH}px`,
    transform: "translateY(-50%)",
    background: CENTER_LINE_COLOR,
    pointerEvents: "none",
  });

  mount.appendChild(centerLine);

  // ========================================
  // Vertex Shader
  // ========================================

  const vertexShaderSource = `#version 300 es

    precision highp float;

    layout(location = 0) in vec4 aParticle;

    // xRatio, velocity, birthTime, attackFlag

    uniform float uTime;
    uniform float uHeight;
    uniform float uPixelRatio;

    // ========================================
    // サイズ関連
    // ========================================

    uniform float uNormalInitialSize;
    uniform float uNormalFinalSize;
    uniform float uNormalSizeCurve;

    uniform float uAttackInitialSize;
    uniform float uAttackFinalSize;
    uniform float uAttackSizeCurve;

    // ========================================
    // アルファ関連
    // ========================================

    uniform float uNormalInitialAlpha;
    uniform float uAttackInitialAlpha;

    uniform float uNormalAlphaDecay;
    uniform float uAttackAlphaDecay;

    uniform float uMinAlpha;

    // ========================================
    // 移動速度関連
    // ========================================

    uniform float uNormalSpeedHalfLife;
    uniform float uAttackSpeedHalfLife;

    // ========================================
    // 色変化関連
    // ========================================

    uniform float uNormalColorHalfLife;

    out float vAlpha;
    out float vWhiteness;
    out float vPointDiameter;

    const float LN2 = 0.69314718056;

    // ========================================
    // 曲線補間関数
    // ========================================

    float curvedProgress(
      float progress,
      float curve
    ) {

      progress = clamp(
        progress,
        0.0,
        1.0
      );

      // curve = 0 の場合は線形補間
      if (curve < 0.0001) {
        return progress;
      }

      // 指数関数によるEase Out
      // 0～1の範囲に正規化
      float numerator =
        1.0 - exp(-curve * progress);

      float denominator =
        1.0 - exp(-curve);

      return numerator / denominator;
    }

    void main() {

      float xRatio = aParticle.x;
      float velocity = aParticle.y;
      float birthTime = aParticle.z;
      float attackFlag = aParticle.w;

      // ========================================
      // 経過時間
      // ========================================

      float age = max(
        0.0,
        uTime - birthTime
      );

      // 60fps換算の経過フレーム数
      float frames = age * 60.0;

      // ========================================
      // 初期アルファ値
      // ========================================

      float initialAlpha = mix(
        uNormalInitialAlpha,
        uAttackInitialAlpha,
        attackFlag
      );

      // ========================================
      // アルファ減衰倍率
      // ========================================

      float alphaDecay = mix(
        uNormalAlphaDecay,
        uAttackAlphaDecay,
        attackFlag
      );

      // ========================================
      // アルファ値の乗算減衰
      // ========================================

      vAlpha = initialAlpha * pow(
        alphaDecay,
        frames
      );

      // ========================================
      // アルファ下限による消滅判定
      // ========================================

      if (vAlpha <= uMinAlpha) {

        gl_Position = vec4(
          2.0,
          2.0,
          0.0,
          1.0
        );

        gl_PointSize = 0.0;

        vAlpha = 0.0;
        vWhiteness = 0.0;
        vPointDiameter = 0.0;

        return;
      }

      // ========================================
      // 移動速度の半減期
      // ========================================

      float speedHalfLife = mix(
        uNormalSpeedHalfLife,
        uAttackSpeedHalfLife,
        attackFlag
      );

      float speedDecay =
        LN2 / max(speedHalfLife, 0.0001);

      // ========================================
      // 上下移動
      // ========================================

      float yOffset =
        velocity * 60.0 *
        (1.0 - exp(-speedDecay * age)) /
        speedDecay;

      // ========================================
      // 画面座標への変換
      // ========================================

      float x = xRatio * 2.0 - 1.0;

      float y =
        -yOffset * 2.0 / uHeight;

      gl_Position = vec4(
        x,
        y,
        0.0,
        1.0
      );

      // ========================================
      // パーティクルサイズ
      // ========================================

      // 初期サイズ
      float initialSize = mix(
        uNormalInitialSize,
        uAttackInitialSize,
        attackFlag
      );

      // 最終サイズ
      float finalSize = mix(
        uNormalFinalSize,
        uAttackFinalSize,
        attackFlag
      );

      // サイズ変化の曲線
      float sizeCurve = mix(
        uNormalSizeCurve,
        uAttackSizeCurve,
        attackFlag
      );

      // ========================================
      // 消滅までの進行率
      // ========================================

      float lifeProgress = 0.0;

      if (
        alphaDecay < 1.0 &&
        initialAlpha > uMinAlpha
      ) {

        // アルファ下限に到達するまでの
        // 60fps換算フレーム数
        float totalFrames =
          log(uMinAlpha / initialAlpha) /
          log(alphaDecay);

        lifeProgress = clamp(
          frames / max(totalFrames, 0.0001),
          0.0,
          1.0
        );
      }

      // ========================================
      // 曲線的なサイズ変化
      // ========================================

      float sizeProgress = curvedProgress(
        lifeProgress,
        sizeCurve
      );

      // 初期サイズから最終サイズへ補間
      float particleSize = mix(
        initialSize,
        finalSize,
        sizeProgress
      );

      // WebGLのポイントサイズは
      // デバイスピクセル単位で指定
      float diameter = max(
        0.0,
        particleSize * uPixelRatio
      );

      // WebGLの実装によっては
      // 1px未満のgl_PointSizeは1pxに丸められる。
      // Fragment Shader側で小さい円を再現する。
      vPointDiameter = diameter;

      gl_PointSize = max(
        1.0,
        diameter
      );

      // ========================================
      // 通常粒子の色変化
      // ========================================

      float colorDecay =
        LN2 / max(
          uNormalColorHalfLife,
          0.0001
        );

      float whiteness =
        1.0 - exp(-colorDecay * age);

      // 通常粒子：赤から白
      // アタック粒子：赤のまま
      vWhiteness =
        whiteness * (1.0 - attackFlag);
    }
  `;

  // ========================================
  // Fragment Shader
  // ========================================

  const fragmentShaderSource = `#version 300 es

    precision highp float;

    in float vAlpha;
    in float vWhiteness;
    in float vPointDiameter;

    out vec4 fragColor;

    void main() {

      if (vAlpha <= 0.0) {
        discard;
      }

      // ========================================
      // 円形パーティクル
      // ========================================

      vec2 uv = gl_PointCoord - vec2(0.5);

      // 直径1px未満の場合は
      // カバー率で透明度を補正
      float coverage = min(
        1.0,
        vPointDiameter * vPointDiameter
      );

      // ポイントが0以下なら非表示
      if (vPointDiameter <= 0.0) {
        discard;
      }

      if (dot(uv, uv) > 0.25) {
        discard;
      }

      // ========================================
      // 色の定義
      // ========================================

      vec3 redColor = vec3(
        1.0, 0.0, 0.0
      );

      vec3 whiteColor = vec3(
        1.0, 1.0, 1.0
      );

      // ========================================
      // 赤から白への色変化
      // ========================================

      vec3 color = mix(
        redColor,
        whiteColor,
        vWhiteness
      );

      fragColor = vec4(
        color,
        vAlpha * coverage
      );
    }
  `;

  // ========================================
  // Shaderコンパイル
  // ========================================

  function compileShader(type, source) {

    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (
      !gl.getShaderParameter(
        shader,
        gl.COMPILE_STATUS
      )
    ) {

      const error = gl.getShaderInfoLog(shader);

      gl.deleteShader(shader);

      throw new Error(
        error || "Shader compile error"
      );
    }

    return shader;
  }

  const vertexShader = compileShader(
    gl.VERTEX_SHADER,
    vertexShaderSource
  );

  const fragmentShader = compileShader(
    gl.FRAGMENT_SHADER,
    fragmentShaderSource
  );

  // ========================================
  // Shader Program
  // ========================================

  const program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);

  gl.linkProgram(program);

  if (
    !gl.getProgramParameter(
      program,
      gl.LINK_STATUS
    )
  ) {

    const error = gl.getProgramInfoLog(program);

    throw new Error(
      error || "Shader link error"
    );
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  gl.useProgram(program);

  // ========================================
  // Uniform取得
  // ========================================

  const getUniform = (name) =>
    gl.getUniformLocation(program, name);

  const uniforms = {

    // 時間・画面
    time: getUniform("uTime"),
    height: getUniform("uHeight"),
    pixelRatio: getUniform("uPixelRatio"),

    // 初期アルファ値
    normalInitialAlpha:
      getUniform("uNormalInitialAlpha"),

    attackInitialAlpha:
      getUniform("uAttackInitialAlpha"),

    // アルファ減衰
    normalAlphaDecay:
      getUniform("uNormalAlphaDecay"),

    attackAlphaDecay:
      getUniform("uAttackAlphaDecay"),

    minAlpha:
      getUniform("uMinAlpha"),

    // 移動速度の半減期
    normalSpeedHalfLife:
      getUniform("uNormalSpeedHalfLife"),

    attackSpeedHalfLife:
      getUniform("uAttackSpeedHalfLife"),

    // 色変化
    normalColorHalfLife:
      getUniform("uNormalColorHalfLife"),

    // 通常パーティクルサイズ
    normalInitialSize:
      getUniform("uNormalInitialSize"),

    normalFinalSize:
      getUniform("uNormalFinalSize"),

    normalSizeCurve:
      getUniform("uNormalSizeCurve"),

    // アタックパーティクルサイズ
    attackInitialSize:
      getUniform("uAttackInitialSize"),

    attackFinalSize:
      getUniform("uAttackFinalSize"),

    attackSizeCurve:
      getUniform("uAttackSizeCurve"),
  };

  // ========================================
  // Uniform設定
  // ========================================

  gl.uniform1f(
    uniforms.normalInitialAlpha,
    NORMAL_INITIAL_ALPHA
  );

  gl.uniform1f(
    uniforms.attackInitialAlpha,
    ATTACK_INITIAL_ALPHA
  );

  gl.uniform1f(
    uniforms.normalAlphaDecay,
    NORMAL_ALPHA_DECAY
  );

  gl.uniform1f(
    uniforms.attackAlphaDecay,
    ATTACK_ALPHA_DECAY
  );

  gl.uniform1f(
    uniforms.minAlpha,
    PARTICLE_MIN_ALPHA
  );

  gl.uniform1f(
    uniforms.normalSpeedHalfLife,
    NORMAL_SPEED_HALF_LIFE
  );

  gl.uniform1f(
    uniforms.attackSpeedHalfLife,
    ATTACK_SPEED_HALF_LIFE
  );

  gl.uniform1f(
    uniforms.normalColorHalfLife,
    NORMAL_COLOR_HALF_LIFE
  );

  // ========================================
  // サイズ関連Uniform
  // ========================================

  gl.uniform1f(
    uniforms.normalInitialSize,
    NORMAL_INITIAL_SIZE
  );

  gl.uniform1f(
    uniforms.normalFinalSize,
    NORMAL_FINAL_SIZE
  );

  gl.uniform1f(
    uniforms.normalSizeCurve,
    NORMAL_SIZE_CURVE
  );

  gl.uniform1f(
    uniforms.attackInitialSize,
    ATTACK_INITIAL_SIZE
  );

  gl.uniform1f(
    uniforms.attackFinalSize,
    ATTACK_FINAL_SIZE
  );

  gl.uniform1f(
    uniforms.attackSizeCurve,
    ATTACK_SIZE_CURVE
  );

  // ========================================
  // GPUバッファ
  // ========================================

  const FLOATS_PER_PARTICLE = 4;

  const BYTES_PER_PARTICLE =
    FLOATS_PER_PARTICLE *
    Float32Array.BYTES_PER_ELEMENT;

  const vao = gl.createVertexArray();
  const particleBuffer = gl.createBuffer();

  gl.bindVertexArray(vao);

  gl.bindBuffer(
    gl.ARRAY_BUFFER,
    particleBuffer
  );

  gl.bufferData(
    gl.ARRAY_BUFFER,
    MAX_PARTICLES * BYTES_PER_PARTICLE,
    gl.DYNAMIC_DRAW
  );

  gl.enableVertexAttribArray(0);

  gl.vertexAttribPointer(
    0,
    FLOATS_PER_PARTICLE,
    gl.FLOAT,
    false,
    BYTES_PER_PARTICLE,
    0
  );

  gl.bindVertexArray(null);

  // ========================================
  // パーティクル管理
  // ========================================

  const expirationTimes = new Float64Array(
    MAX_PARTICLES
  );

  let head = 0;
  let writeIndex = 0;
  let particleCount = 0;

  let staging = new Float32Array(0);

  const startTime = performance.now();

  function getTime() {

    return (
      performance.now() - startTime
    ) / 1000;
  }

  // ========================================
  // 消滅時刻の計算
  // ========================================

  function calculateExpirationTime(
    initialAlpha,
    decay,
    now
  ) {

    if (initialAlpha <= PARTICLE_MIN_ALPHA) {
      return now;
    }

    if (decay === 1) {
      return Infinity;
    }

    const frames =
      Math.log(PARTICLE_MIN_ALPHA / initialAlpha) /
      Math.log(decay);

    return now + frames / 60;
  }

  // ========================================
  // リサイズ
  // ========================================

  let width = 1;
  let height = 1;
  let dpr = 1;

  function resize() {

    const bounds = mount.getBoundingClientRect();

    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);

    dpr = Math.min(
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

    gl.viewport(
      0,
      0,
      canvas.width,
      canvas.height
    );

    gl.useProgram(program);

    gl.uniform1f(
      uniforms.height,
      height
    );

    gl.uniform1f(
      uniforms.pixelRatio,
      dpr
    );
  }

  const observer = new ResizeObserver(resize);

  observer.observe(mount);
  resize();

  // ========================================
  // 消滅したパーティクルの管理
  // ========================================

  function expireParticles(now) {

    while (particleCount > 0) {

      if (now < expirationTimes[head]) {
        break;
      }

      head =
        (head + 1) % MAX_PARTICLES;

      particleCount--;
    }

    // 赤白で減衰率が違う場合、
    // 途中の消滅済み粒子はGPUで非表示。
  }

  // ========================================
  // パーティクル生成
  // ========================================

  function spawnParticles(waveform, attack, now) {

    if (!waveform || waveform.length < 2) {
      return;
    }

    const spawnCount = Math.min(
      MAX_PARTICLES,
      Math.ceil(width / PARTICLE_SPACING)
    );

    if (spawnCount <= 0) {
      return;
    }

    const floatCount =
      spawnCount * FLOATS_PER_PARTICLE;

    if (staging.length < floatCount) {
      staging = new Float32Array(floatCount);
    }

    const attackFlag = attack ? 1 : 0;

    // ========================================
    // 赤白ごとのアルファ減衰設定
    // ========================================

    const initialAlpha = attack
      ? ATTACK_INITIAL_ALPHA
      : NORMAL_INITIAL_ALPHA;

    const alphaDecay = attack
      ? ATTACK_ALPHA_DECAY
      : NORMAL_ALPHA_DECAY;

    const expirationTime = calculateExpirationTime(
      initialAlpha,
      alphaDecay,
      now
    );

    // ========================================
    // 波形データから粒子を生成
    // ========================================

    for (let i = 0; i < spawnCount; i++) {

      const xRatio = Math.min(
        1,
        (i * PARTICLE_SPACING) / width
      );

      const sampleIndex = Math.min(
        waveform.length - 1,
        Math.floor(xRatio * waveform.length)
      );

      const sample = Math.max(
        -1,
        Math.min(1, waveform[sampleIndex] || 0)
      );

      const velocity =
        (sample / SPEED_DIVISOR) *
        SPEED_MULTIPLIER;

      const offset =
        i * FLOATS_PER_PARTICLE;

      staging[offset] = xRatio;
      staging[offset + 1] = velocity;
      staging[offset + 2] = now;
      staging[offset + 3] = attackFlag;
    }

    // ========================================
    // GPUへ新しい粒子だけ転送
    // ========================================

    gl.bindBuffer(
      gl.ARRAY_BUFFER,
      particleBuffer
    );

    const firstCount = Math.min(
      spawnCount,
      MAX_PARTICLES - writeIndex
    );

    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      writeIndex * BYTES_PER_PARTICLE,
      staging.subarray(
        0,
        firstCount * FLOATS_PER_PARTICLE
      )
    );

    const remaining =
      spawnCount - firstCount;

    if (remaining > 0) {

      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        staging.subarray(
          firstCount * FLOATS_PER_PARTICLE,
          spawnCount * FLOATS_PER_PARTICLE
        )
      );
    }

    // ========================================
    // CPU側の消滅時刻を更新
    // ========================================

    for (let i = 0; i < spawnCount; i++) {

      const index =
        (writeIndex + i) % MAX_PARTICLES;

      expirationTimes[index] = expirationTime;
    }

    // ========================================
    // 最大パーティクル数の管理
    // ========================================

    const overflow = Math.max(
      0,
      particleCount + spawnCount - MAX_PARTICLES
    );

    head =
      (head + overflow) % MAX_PARTICLES;

    particleCount = Math.min(
      MAX_PARTICLES,
      particleCount + spawnCount
    );

    writeIndex =
      (writeIndex + spawnCount) % MAX_PARTICLES;
  }

  // ========================================
  // GPU描画
  // ========================================

  function drawParticles(now) {

    gl.clearColor(
      BACKGROUND_COLOR[0] / 255,
      BACKGROUND_COLOR[1] / 255,
      BACKGROUND_COLOR[2] / 255,
      1
    );

    gl.clear(gl.COLOR_BUFFER_BIT);

    if (particleCount === 0) {
      return;
    }

    gl.useProgram(program);
    gl.bindVertexArray(vao);

    gl.uniform1f(
      uniforms.time,
      now
    );

    gl.enable(gl.BLEND);

    gl.blendFunc(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA
    );

    // ========================================
    // リングバッファ描画
    // ========================================

    const firstCount = Math.min(
      particleCount,
      MAX_PARTICLES - head
    );

    gl.drawArrays(
      gl.POINTS,
      head,
      firstCount
    );

    const remaining =
      particleCount - firstCount;

    if (remaining > 0) {

      gl.drawArrays(
        gl.POINTS,
        0,
        remaining
      );
    }

    gl.bindVertexArray(null);
  }

  // ========================================
  // メインループ
  // ========================================

  return {

    update(audio, dt) {

      const now = getTime();

      const waveform = audio.waveform;

      const attack = Boolean(
        audio.attackTriggered
      );

      expireParticles(now);

      spawnParticles(
        waveform,
        attack,
        now
      );

      drawParticles(now);
    },

    dispose() {

      observer.disconnect();

      gl.deleteBuffer(particleBuffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);

      centerLine.remove();
      canvas.remove();

      if (changedPosition) {
        mount.style.position = originalPosition;
      }
    }
  };
}
