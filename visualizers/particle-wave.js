
/**
 * GPU Particle Wave Visualizer
 *
 * WebGL2 / 最大200万パーティクル
 *
 * - 毎フレーム波形からパーティクルを生成
 * - 通常粒子：赤から白へ変化
 * - アタック粒子：赤のまま
 * - アルファ値は毎フレーム一定倍率で減衰
 * - アルファ値が下限以下になったら消滅
 * - 移動速度は指数減衰
 * - 粒子の寿命（秒数）は設定しない
 */

export function createVisualizer(mount) {

  // ========================================
  // パラメータ
  // ========================================

  const PARTICLE_SPACING = 1;
  const PARTICLE_SIZE = 1.5;

  // ========================================
  // 初期アルファ値
  // ========================================

  const NORMAL_INITIAL_ALPHA = 0.3;
  const ATTACK_INITIAL_ALPHA = 1.0;

  // ========================================
  // アルファ値の減衰
  // ========================================

  // 毎フレーム掛ける倍率（60fps基準）
  // 1.0 = 減衰しない
  // 0.9 = 毎フレーム90%になる
  // 0.99 = 毎フレーム99%になる

  const NORMAL_ALPHA_DECAY = 0.999;
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
      "アルファ減衰倍率は0より大きく1以下にしてください。"
    );
  }

  if (
    PARTICLE_MIN_ALPHA <= 0 ||
    PARTICLE_MIN_ALPHA >= 1
  ) {
    throw new Error(
      "PARTICLE_MIN_ALPHAは0より大きく1未満にしてください。"
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

    throw new Error("WebGL2が利用できません。");
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
    uniform float uPointSize;

    // 初期アルファ値
    uniform float uNormalInitialAlpha;
    uniform float uAttackInitialAlpha;

    // フレーム単位の減衰倍率
    uniform float uNormalAlphaDecay;
    uniform float uAttackAlphaDecay;

    // アルファ下限
    uniform float uMinAlpha;

    // 移動速度の半減期
    uniform float uNormalSpeedHalfLife;
    uniform float uAttackSpeedHalfLife;

    // 色変化の半減期
    uniform float uNormalColorHalfLife;

    out float vAlpha;
    out float vWhiteness;

    const float LN2 = 0.69314718056;

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

      // alpha = initialAlpha * decay ^ frames

      vAlpha = initialAlpha * pow(
        alphaDecay,
        frames
      );

      // ========================================
      // 消滅判定
      // ========================================

      // 下限に達した場合は描画しない
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

      // 減衰する速度を積分して移動量を計算
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

      gl_PointSize = uPointSize;

      // ========================================
      // 通常粒子の色変化
      // ========================================

      float colorDecay =
        LN2 / max(uNormalColorHalfLife, 0.0001);

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

    precision mediump float;

    in float vAlpha;
    in float vWhiteness;

    out vec4 fragColor;

    void main() {

      if (vAlpha <= 0.0) {
        discard;
      }

      // ========================================
      // 円形パーティクル
      // ========================================

      vec2 uv = gl_PointCoord - vec2(0.5);

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
      // 赤から白への変化
      // ========================================

      vec3 color = mix(
        redColor,
        whiteColor,
        vWhiteness
      );

      fragColor = vec4(
        color,
        vAlpha
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

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {

      const error = gl.getShaderInfoLog(shader);

      gl.deleteShader(shader);

      throw new Error(error || "Shader compile error");
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

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {

    const error = gl.getProgramInfoLog(program);

    throw new Error(error || "Shader link error");
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  gl.useProgram(program);

  // ========================================
  // Uniform取得
  // ========================================

  const uTime = gl.getUniformLocation(
    program, "uTime"
  );

  const uHeight = gl.getUniformLocation(
    program, "uHeight"
  );

  const uPointSize = gl.getUniformLocation(
    program, "uPointSize"
  );

  const uNormalInitialAlpha = gl.getUniformLocation(
    program, "uNormalInitialAlpha"
  );

  const uAttackInitialAlpha = gl.getUniformLocation(
    program, "uAttackInitialAlpha"
  );

  const uNormalAlphaDecay = gl.getUniformLocation(
    program, "uNormalAlphaDecay"
  );

  const uAttackAlphaDecay = gl.getUniformLocation(
    program, "uAttackAlphaDecay"
  );

  const uMinAlpha = gl.getUniformLocation(
    program, "uMinAlpha"
  );

  const uNormalSpeedHalfLife = gl.getUniformLocation(
    program, "uNormalSpeedHalfLife"
  );

  const uAttackSpeedHalfLife = gl.getUniformLocation(
    program, "uAttackSpeedHalfLife"
  );

  const uNormalColorHalfLife = gl.getUniformLocation(
    program, "uNormalColorHalfLife"
  );

  // ========================================
  // Uniform設定
  // ========================================

  gl.uniform1f(
    uNormalInitialAlpha,
    NORMAL_INITIAL_ALPHA
  );

  gl.uniform1f(
    uAttackInitialAlpha,
    ATTACK_INITIAL_ALPHA
  );

  gl.uniform1f(
    uNormalAlphaDecay,
    NORMAL_ALPHA_DECAY
  );

  gl.uniform1f(
    uAttackAlphaDecay,
    ATTACK_ALPHA_DECAY
  );

  gl.uniform1f(
    uMinAlpha,
    PARTICLE_MIN_ALPHA
  );

  gl.uniform1f(
    uNormalSpeedHalfLife,
    NORMAL_SPEED_HALF_LIFE
  );

  gl.uniform1f(
    uAttackSpeedHalfLife,
    ATTACK_SPEED_HALF_LIFE
  );

  gl.uniform1f(
    uNormalColorHalfLife,
    NORMAL_COLOR_HALF_LIFE
  );

  // ========================================
  // GPUバッファ
  // ========================================

  const FLOATS_PER_PARTICLE = 4;

  const BYTES_PER_PARTICLE =
    FLOATS_PER_PARTICLE * Float32Array.BYTES_PER_ELEMENT;

  const vao = gl.createVertexArray();
  const particleBuffer = gl.createBuffer();

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);

  // 最大200万個分のGPU領域を確保
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

  // 各粒子がアルファ下限に到達する時刻
  const expirationTimes = new Float64Array(
    MAX_PARTICLES
  );

  let head = 0;
  let writeIndex = 0;
  let particleCount = 0;

  // GPU転送用の一時バッファ
  let staging = new Float32Array(0);

  const startTime = performance.now();

  function getTime() {
    return (performance.now() - startTime) / 1000;
  }

  // ========================================
  // 消滅時刻の計算
  // ========================================

  function calculateExpirationTime(
    initialAlpha,
    decay,
    now
  ) {

    // 最初から下限以下なら即座に消滅
    if (initialAlpha <= PARTICLE_MIN_ALPHA) {
      return now;
    }

    // 減衰倍率1なら消滅しない
    if (decay === 1) {
      return Infinity;
    }

    // initialAlpha * decay^(time*60) = minAlpha
    //
    // この式から消滅時刻を求める

    const frames =
      Math.log(PARTICLE_MIN_ALPHA / initialAlpha) /
      Math.log(decay);

    const seconds = frames / 60;

    return now + seconds;
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

    gl.uniform1f(uHeight, height);

    gl.uniform1f(
      uPointSize,
      PARTICLE_SIZE * dpr
    );
  }

  const observer = new ResizeObserver(resize);

  observer.observe(mount);
  resize();

  // ========================================
  // 消滅したパーティクルの管理
  // ========================================

  function expireParticles(now) {

    // リングバッファの先頭から、
    // 消滅済みのパーティクルを取り除く

    while (particleCount > 0) {

      if (now < expirationTimes[head]) {
        break;
      }

      head =
        (head + 1) % MAX_PARTICLES;

      particleCount--;
    }

    // 赤白で減衰率が異なるため、
    // 途中に消滅済みの粒子が残る場合もある。
    // それらはGPU側のアルファ判定で非表示にする。
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
    // 赤白ごとの減衰設定
    // ========================================

    const initialAlpha = attack
      ? ATTACK_INITIAL_ALPHA
      : NORMAL_INITIAL_ALPHA;

    const alphaDecay = attack
      ? ATTACK_ALPHA_DECAY
      : NORMAL_ALPHA_DECAY;

    // このフレームで生成する粒子の消滅時刻
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

      // GPUへ渡すデータ
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

    // リングバッファを折り返す場合
    const remaining = spawnCount - firstCount;

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

    // 上限を超える場合は古い粒子を上書き
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
      uTime,
      now
    );

    // ========================================
    // アルファブレンディング
    // ========================================

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

      // アルファ下限に達した粒子を管理
      expireParticles(now);

      // 毎フレーム粒子を生成
      spawnParticles(
        waveform,
        attack,
        now
      );

      // GPUで移動・減衰・描画
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
