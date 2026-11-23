
export function createVisualizer(mount) {
    const PARTICLE_SPACING = 1;
    const NORMAL_INITIAL_SIZE = 1.5;
    const NORMAL_FINAL_SIZE = 1.5;
    const NORMAL_SIZE_CURVE = 3.0;
    const ATTACK_INITIAL_SIZE = 3.0;
    const ATTACK_FINAL_SIZE = 1.5;
    const ATTACK_SIZE_CURVE = 50.0;
    const NORMAL_INITIAL_ALPHA = 0.5;
    const ATTACK_INITIAL_ALPHA = 1.0;
    const NORMAL_ALPHA_DECAY = 0.998;
    const ATTACK_ALPHA_DECAY = 0.999;
    const PARTICLE_MIN_ALPHA = 0.001;
    const NORMAL_SPEED_HALF_LIFE = 10.0;
    const ATTACK_SPEED_HALF_LIFE = 5.0;
    const NORMAL_COLOR_HALF_LIFE = 2.0;
    const COLOR_LFO_ENABLED = true;
    const COLOR_LFO_FREQ_MIN = 0.001;
    const COLOR_LFO_FREQ_MAX = 0.01;
    const COLOR_LFO_FREQ_DRIFT = 0.001;
    const COLOR_LFO_PHASE_OFFSET = 0;
    const SPEED_DIVISOR = 0.05;
    const SPEED_MULTIPLIER = 0.99;

    const GRAVITY_ENABLED = true;

    // 同時に存在できる重力点の最大数
    // 上限に達したら最古の重力点を置き換える
    const GRAVITY_MAX_POINTS = 8;

    const GRAVITY_SPEED_MIN = 0;
    const GRAVITY_SPEED_MAX = 5;
    const GRAVITY_STATIONARY_PROBABILITY = 0.5;
    const GRAVITY_STRENGTH_MIN = 3;
    const GRAVITY_STRENGTH_MAX = 20;
    const GRAVITY_VOLUME_INFLUENCE = 0.8;
    const GRAVITY_VOLUME_REFERENCE = 0.25;
    const GRAVITY_RADIUS_MIN = 70;
    const GRAVITY_RADIUS_MAX = 130;
    const GRAVITY_DECAY_RATE = 0.1;
    const GRAVITY_DECAY_CURVE = 1.8;
    const GRAVITY_ZERO_THRESHOLD = 0.001;
    const GRAVITY_SHOW_MARKERS = false;
    const GRAVITY_MARKER_SIZE = 3;
    const GRAVITY_MARKER_COLOR = "#ff4545";
    const MAX_PARTICLES = 10000000;
    const MAX_PIXEL_RATIO = 1.5;
    const CENTER_LINE_COLOR = "#ff0000";
    const CENTER_LINE_WIDTH = 0.1;
    const BACKGROUND_COLOR = [9, 11, 18];

    if (
        PARTICLE_SPACING <= 0 ||
        SPEED_DIVISOR === 0 ||
        NORMAL_ALPHA_DECAY <= 0 ||
        NORMAL_ALPHA_DECAY > 1 ||
        ATTACK_ALPHA_DECAY <= 0 ||
        ATTACK_ALPHA_DECAY > 1 ||
        PARTICLE_MIN_ALPHA <= 0 ||
        PARTICLE_MIN_ALPHA >= 1 ||
        NORMAL_SPEED_HALF_LIFE <= 0 ||
        ATTACK_SPEED_HALF_LIFE <= 0 ||
        NORMAL_COLOR_HALF_LIFE <= 0 ||
        COLOR_LFO_FREQ_MIN < 0 ||
        COLOR_LFO_FREQ_MAX < COLOR_LFO_FREQ_MIN ||
        COLOR_LFO_FREQ_DRIFT < 0 ||
        !Number.isSafeInteger(GRAVITY_MAX_POINTS) ||
        GRAVITY_MAX_POINTS < 1 ||
        GRAVITY_DECAY_RATE <= 0 ||
        GRAVITY_DECAY_CURVE <= 0 ||
        GRAVITY_ZERO_THRESHOLD <= 0 ||
        GRAVITY_RADIUS_MIN <= 0 ||
        GRAVITY_RADIUS_MAX < GRAVITY_RADIUS_MIN ||
        GRAVITY_STRENGTH_MIN < 0 ||
        GRAVITY_STRENGTH_MAX < GRAVITY_STRENGTH_MIN ||
        GRAVITY_SPEED_MIN < 0 ||
        GRAVITY_SPEED_MAX < GRAVITY_SPEED_MIN ||
        GRAVITY_STATIONARY_PROBABILITY < 0 ||
        GRAVITY_STATIONARY_PROBABILITY > 1 ||
        GRAVITY_VOLUME_INFLUENCE < 0 ||
        GRAVITY_VOLUME_INFLUENCE > 1 ||
        GRAVITY_VOLUME_REFERENCE <= 0
    ) {
        throw new Error("Invalid visualizer parameter.");
    }

    const originalPosition = mount.style.position;
    const changedPosition =
        getComputedStyle(mount).position === "static";

    if (changedPosition) {
        mount.style.position = "relative";
    }

    const canvas = document.createElement("canvas");

    Object.assign(canvas.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        display: "block"
    });

    mount.appendChild(canvas);

    const gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false
    });

    if (!gl) {
        canvas.remove();

        if (changedPosition) {
            mount.style.position = originalPosition;
        }

        throw new Error("WebGL2 is not available.");
    }

    const centerLine = document.createElement("div");

    Object.assign(centerLine.style, {
        position: "absolute",
        left: "0",
        top: "50%",
        width: "100%",
        height: `${CENTER_LINE_WIDTH}px`,
        transform: "translateY(-50%)",
        background: CENTER_LINE_COLOR,
        pointerEvents: "none"
    });

    mount.appendChild(centerLine);

    const markerLayer = document.createElement("div");

    Object.assign(markerLayer.style, {
        position: "absolute",
        inset: "0",
        overflow: "hidden",
        pointerEvents: "none"
    });

    mount.appendChild(markerLayer);

    // ========================================
    // 物理シミュレーション Vertex Shader
    // ========================================

    const simulateVertex = `#version 300 es
precision highp float;
precision highp sampler2D;

layout(location = 0) in vec4 aState;
layout(location = 1) in vec3 aMeta;

uniform sampler2D uGravityTexture;
uniform int uGravityCount;
uniform float uDt;
uniform float uNormalHalfLife;
uniform float uAttackHalfLife;

out vec4 nextState;

const float LN2 = 0.69314718056;

vec4 gravityTexel(int index) {
    ivec2 s = textureSize(uGravityTexture, 0);
    return texelFetch(
        uGravityTexture,
        ivec2(index % s.x, index / s.x),
        0
    );
}

void main() {
    vec2 pos = aState.xy;
    vec2 vel = aState.zw;

    float halfLife = mix(
        uNormalHalfLife,
        uAttackHalfLife,
        aMeta.y
    );

    float damping = exp(
        -LN2 * uDt / max(halfLife, 0.0001)
    );

    vec2 acceleration = vec2(0.0);

    for (int i = 0; i < uGravityCount; ++i) {
        vec4 gravity = gravityTexel(i);

        vec2 center = gravity.xy;
        vec2 delta = center - pos;

        float distanceToCenter = length(delta);
        float radius = max(gravity.z, 0.0001);

        if (distanceToCenter >= radius) {
            continue;
        }

        float t = clamp(
            1.0 - distanceToCenter / radius,
            0.0,
            1.0
        );

        float falloff = t * t * (3.0 - 2.0 * t);

        vec2 direction =
            delta / max(distanceToCenter, 0.001);

        acceleration +=
            direction * gravity.w * falloff;
    }

    vel = vel * damping + acceleration * uDt;
    pos += vel * uDt;

    nextState = vec4(pos, vel);
    gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

    // ========================================
    // 描画 Vertex Shader
    // ========================================

    const renderVertex = `#version 300 es
precision highp float;

layout(location = 0) in vec4 aState;
layout(location = 1) in vec3 aMeta;

uniform float uTime;
uniform float uWidth;
uniform float uHeight;
uniform float uPixelRatio;

uniform vec4 uSizeNormal;
uniform vec4 uSizeAttack;
uniform vec3 uDecay;
uniform float uColorHalfLife;

out float vAlpha;
out float vWhiteness;
out float vPointDiameter;

const float LN2 = 0.69314718056;

float curvedProgress(float p, float curve) {
    p = clamp(p, 0.0, 1.0);

    if (curve < 0.0001) {
        return p;
    }

    return (
        1.0 - exp(-curve * p)
    ) / (
        1.0 - exp(-curve)
    );
}

void main() {
    float age = max(0.0, uTime - aMeta.x);
    float attack = aMeta.y;

    float targetColor = clamp(
        aMeta.z,
        0.0,
        1.0
    );

    float decay = mix(
        uDecay.x,
        uDecay.y,
        attack
    );

    vec4 cfg = mix(
        uSizeNormal,
        uSizeAttack,
        attack
    );

    vAlpha = cfg.w * pow(
        decay,
        age * 60.0
    );

    if (vAlpha <= uDecay.z) {
        gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
        gl_PointSize = 0.0;
        vPointDiameter = 0.0;
        vWhiteness = 0.0;
        return;
    }

    gl_Position = vec4(
        aState.x * 2.0 / uWidth - 1.0,
        1.0 - aState.y * 2.0 / uHeight,
        0.0,
        1.0
    );

    float progress = 0.0;

    if (decay < 1.0 && cfg.w > uDecay.z) {
        float totalFrames =
            log(uDecay.z / cfg.w) / log(decay);

        progress = clamp(
            age * 60.0 / max(totalFrames, 0.0001),
            0.0,
            1.0
        );
    }

    float size = mix(
        cfg.x,
        cfg.y,
        curvedProgress(progress, cfg.z)
    );

    vPointDiameter = max(
        0.0,
        size * uPixelRatio
    );

    gl_PointSize = max(1.0, vPointDiameter);

    float colorProgress = 1.0 - exp(
        -LN2 * age /
        max(uColorHalfLife, 0.0001)
    );

    vWhiteness =
        colorProgress *
        targetColor *
        (1.0 - attack);
}
`;

    // ========================================
    // 描画 Fragment Shader
    // ========================================

    const renderFragment = `#version 300 es
precision highp float;

in float vAlpha;
in float vWhiteness;
in float vPointDiameter;

out vec4 fragColor;

void main() {
    if (
        vAlpha <= 0.0 ||
        vPointDiameter <= 0.0
    ) {
        discard;
    }

    vec2 uv = gl_PointCoord - vec2(0.5);

    if (dot(uv, uv) > 0.25) {
        discard;
    }

    vec3 initialColor = vec3(1.0, 0.0, 0.0);
    vec3 middleColor = vec3(1.0, 1.0, 1.0);
    vec3 finalColor = vec3(0.0, 1.0, 1.0);

    vec3 color;

    if (vWhiteness < 0.5) {
        color = mix(
            initialColor,
            middleColor,
            vWhiteness * 2.0
        );
    } else {
        color = mix(
            middleColor,
            finalColor,
            (vWhiteness - 0.5) * 2.0
        );
    }

    float coverage = min(
        1.0,
        vPointDiameter * vPointDiameter
    );

    fragColor = vec4(
        color,
        vAlpha * coverage
    );
}
`;

    const simulateFragment = `#version 300 es
precision highp float;

out vec4 color;

void main() {
    color = vec4(0.0);
}
`;

    // ========================================
    // Shader / Program
    // ========================================

    function compile(type, source) {
        const shader = gl.createShader(type);

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(
            shader,
            gl.COMPILE_STATUS
        )) {
            const error = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);

            throw new Error(
                error || "Shader compile error"
            );
        }

        return shader;
    }

    function makeProgram(vertex, fragment, varyingNames) {
        const vs = compile(gl.VERTEX_SHADER, vertex);
        const fs = compile(gl.FRAGMENT_SHADER, fragment);
        const program = gl.createProgram();

        gl.attachShader(program, vs);
        gl.attachShader(program, fs);

        if (varyingNames) {
            gl.transformFeedbackVaryings(
                program,
                varyingNames,
                gl.INTERLEAVED_ATTRIBS
            );
        }

        gl.linkProgram(program);

        gl.deleteShader(vs);
        gl.deleteShader(fs);

        if (!gl.getProgramParameter(
            program,
            gl.LINK_STATUS
        )) {
            const error = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);

            throw new Error(
                error || "Program link error"
            );
        }

        return program;
    }

    const simulation = makeProgram(
        simulateVertex,
        simulateFragment,
        ["nextState"]
    );

    const rendering = makeProgram(
        renderVertex,
        renderFragment
    );

    const uniform = (program, name) =>
        gl.getUniformLocation(program, name);

    const su = {
        gravity: uniform(simulation, "uGravityTexture"),
        count: uniform(simulation, "uGravityCount"),
        dt: uniform(simulation, "uDt"),
        normalHalf: uniform(simulation, "uNormalHalfLife"),
        attackHalf: uniform(simulation, "uAttackHalfLife")
    };

    const ru = {
        time: uniform(rendering, "uTime"),
        width: uniform(rendering, "uWidth"),
        height: uniform(rendering, "uHeight"),
        dpr: uniform(rendering, "uPixelRatio"),
        normal: uniform(rendering, "uSizeNormal"),
        attack: uniform(rendering, "uSizeAttack"),
        decay: uniform(rendering, "uDecay"),
        colorHalf: uniform(rendering, "uColorHalfLife")
    };

    gl.useProgram(simulation);
    gl.uniform1i(su.gravity, 0);
    gl.uniform1f(
        su.normalHalf,
        NORMAL_SPEED_HALF_LIFE
    );
    gl.uniform1f(
        su.attackHalf,
        ATTACK_SPEED_HALF_LIFE
    );

    gl.useProgram(rendering);

    gl.uniform4f(
        ru.normal,
        NORMAL_INITIAL_SIZE,
        NORMAL_FINAL_SIZE,
        NORMAL_SIZE_CURVE,
        NORMAL_INITIAL_ALPHA
    );

    gl.uniform4f(
        ru.attack,
        ATTACK_INITIAL_SIZE,
        ATTACK_FINAL_SIZE,
        ATTACK_SIZE_CURVE,
        ATTACK_INITIAL_ALPHA
    );

    gl.uniform3f(
        ru.decay,
        NORMAL_ALPHA_DECAY,
        ATTACK_ALPHA_DECAY,
        PARTICLE_MIN_ALPHA
    );

    gl.uniform1f(
        ru.colorHalf,
        NORMAL_COLOR_HALF_LIFE
    );

    // ========================================
    // GPUパーティクルバッファ
    // ========================================

    const STATE_BYTES = 16;
    const META_BYTES = 12;

    const states = [
        gl.createBuffer(),
        gl.createBuffer()
    ];

    const metaBuffer = gl.createBuffer();

    for (const buffer of states) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            MAX_PARTICLES * STATE_BYTES,
            gl.DYNAMIC_COPY
        );
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, metaBuffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        MAX_PARTICLES * META_BYTES,
        gl.DYNAMIC_DRAW
    );

    function makeVAO(buffer) {
        const vao = gl.createVertexArray();

        gl.bindVertexArray(vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(
            0, 4, gl.FLOAT, false, STATE_BYTES, 0
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, metaBuffer);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(
            1, 3, gl.FLOAT, false, META_BYTES, 0
        );

        gl.bindVertexArray(null);

        return vao;
    }

    const simVaos = [];
    const drawVaos = [];

    for (const buffer of states) {
        simVaos.push(makeVAO(buffer));
        drawVaos.push(makeVAO(buffer));
    }

    const feedback = gl.createTransformFeedback();
    let currentState = 0;

    // ========================================
    // パーティクル管理
    // ========================================

    let head = 0;
    let writeIndex = 0;
    let particleCount = 0;

    const expirationTimes =
        new Float64Array(MAX_PARTICLES);

    let stagingState = new Float32Array(0);
    let stagingMeta = new Float32Array(0);

    // ========================================
    // 重力点テクスチャ
    // ========================================

    const gravityTexture = gl.createTexture();
    const textureLimit =
        gl.getParameter(gl.MAX_TEXTURE_SIZE);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gravityTexture);

    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.NEAREST
    );

    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MAG_FILTER,
        gl.NEAREST
    );

    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_S,
        gl.CLAMP_TO_EDGE
    );

    gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_WRAP_T,
        gl.CLAMP_TO_EDGE
    );

    let texWidth = 0;
    let texHeight = 0;
    let texPixels = new Float32Array(0);

    // ========================================
    // 重力点管理
    // ========================================

    const gravityPoints = [];
    let previousAttack = false;

    const randomBetween = (a, b) =>
        a + Math.random() * (b - a);

    const startTime = performance.now();
    const getTime = () =>
        (performance.now() - startTime) / 1000;

    let previousTime = getTime();

    let colorLfoPhase = COLOR_LFO_PHASE_OFFSET;
    let colorLfoValue =
        (Math.sin(colorLfoPhase) + 1) * 0.5;

    function updateColorLfo(now, dt) {
        if (!COLOR_LFO_ENABLED) {
            colorLfoValue = 1.0;
            return;
        }

        const modulation = (
            Math.sin(
                2 * Math.PI *
                COLOR_LFO_FREQ_DRIFT *
                now
            ) + 1
        ) * 0.5;

        const frequency =
            COLOR_LFO_FREQ_MIN +
            (COLOR_LFO_FREQ_MAX - COLOR_LFO_FREQ_MIN) *
            modulation;

        colorLfoPhase +=
            2 * Math.PI * frequency * dt;

        colorLfoPhase %= 2 * Math.PI;

        colorLfoValue =
            (Math.sin(colorLfoPhase) + 1) * 0.5;
    }

    let width = 1;
    let height = 1;
    let dpr = 1;

    // ========================================
    // アタック音量と重力
    // ========================================

    function calculateGravityVolumeFactor(waveform) {
        if (GRAVITY_VOLUME_INFLUENCE === 0) {
            return 1;
        }

        if (!waveform || waveform.length === 0) {
            return 1;
        }

        let sum = 0;

        for (let i = 0; i < waveform.length; i++) {
            const sample = waveform[i];
            sum += sample * sample;
        }

        const rms = Math.sqrt(
            sum / waveform.length
        );

        const normalizedVolume = Math.max(
            0,
            Math.min(
                1,
                rms / GRAVITY_VOLUME_REFERENCE
            )
        );

        const volumeFactor =
            1 +
            GRAVITY_VOLUME_INFLUENCE *
            (normalizedVolume * 2 - 1);

        return Math.max(0, volumeFactor);
    }

    // ========================================
    // 重力の時間減衰
    // ========================================

    function effectiveStrength(point, now) {
        const age = Math.max(
            0,
            now - point.born
        );

        const envelope = Math.exp(
            -Math.pow(
                age * GRAVITY_DECAY_RATE,
                GRAVITY_DECAY_CURVE
            )
        );

        const strength =
            point.strength * envelope;

        return strength <= GRAVITY_ZERO_THRESHOLD
            ? 0
            : strength;
    }

    // ========================================
    // 重力点生成
    // ========================================

    function spawnGravity(now, waveform) {
        if (!GRAVITY_ENABLED) {
            return;
        }

        const stationary =
            Math.random() <
            GRAVITY_STATIONARY_PROBABILITY;

        const axisX = Math.random() < 0.5;
        const direction = Math.random() < 0.5 ? -1 : 1;

        const speed = stationary
            ? 0
            : randomBetween(
                GRAVITY_SPEED_MIN,
                GRAVITY_SPEED_MAX
            );

        const volumeFactor =
            calculateGravityVolumeFactor(waveform);

        const baseStrength = randomBetween(
            GRAVITY_STRENGTH_MIN,
            GRAVITY_STRENGTH_MAX
        );

        const finalStrength =
            baseStrength * volumeFactor;

        // ====================================
        // 最大重力点数の制御
        // ====================================
        // 8個存在している状態で9個目が生成された場合、
        // 最も古い1個目を削除して9個目を追加する。
        // 10個目なら2個目を削除する。
        // ====================================

        if (gravityPoints.length >= GRAVITY_MAX_POINTS) {
            const oldestPoint = gravityPoints.shift();
            oldestPoint?.marker?.remove();
        }

        let marker = null;

        if (GRAVITY_SHOW_MARKERS) {
            marker = document.createElement("div");

            Object.assign(marker.style, {
                position: "absolute",
                width: `${GRAVITY_MARKER_SIZE}px`,
                height: `${GRAVITY_MARKER_SIZE}px`,
                borderRadius: "50%",
                background: GRAVITY_MARKER_COLOR,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none"
            });

            markerLayer.appendChild(marker);
        }

        gravityPoints.push({
            x: Math.random(),
            y: Math.random(),

            radius: randomBetween(
                GRAVITY_RADIUS_MIN,
                GRAVITY_RADIUS_MAX
            ),

            strength: finalStrength,

            vx: axisX
                ? (speed / 100) * direction
                : 0,

            vy: axisX
                ? 0
                : (speed / 100) * direction,

            born: now,
            marker
        });
    }

    // ========================================
    // 重力点更新・GPU転送
    // ========================================

    function uploadGravity(now) {
        for (
            let i = gravityPoints.length - 1;
            i >= 0;
            --i
        ) {
            const point = gravityPoints[i];

            if (effectiveStrength(point, now) === 0) {
                point.marker?.remove();
                gravityPoints.splice(i, 1);
            }
        }

        const count = gravityPoints.length;
        const texels = Math.max(1, count);

        const requestedWidth = Math.min(
            textureLimit,
            texels
        );

        const requestedHeight = Math.ceil(
            texels / requestedWidth
        );

        if (requestedHeight > textureLimit) {
            throw new Error(
                "The GPU texture size limit was exceeded."
            );
        }

        if (
            requestedWidth !== texWidth ||
            requestedHeight !== texHeight
        ) {
            texWidth = requestedWidth;
            texHeight = requestedHeight;

            texPixels = new Float32Array(
                texWidth * texHeight * 4
            );

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, gravityTexture);

            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA32F,
                texWidth,
                texHeight,
                0,
                gl.RGBA,
                gl.FLOAT,
                null
            );
        }

        texPixels.fill(0);

        const baseSize = Math.min(width, height);

        for (let i = 0; i < count; ++i) {
            const point = gravityPoints[i];
            const elapsed = now - point.born;

            const x = (
                point.x + point.vx * elapsed
            ) * width;

            const y = (
                point.y + point.vy * elapsed
            ) * height;

            const radiusPx =
                point.radius / 100 * baseSize;

            const currentStrength =
                effectiveStrength(point, now);

            const strengthPx =
                currentStrength / 100 * height;

            const index = i * 4;

            texPixels[index] = x;
            texPixels[index + 1] = y;
            texPixels[index + 2] = radiusPx;
            texPixels[index + 3] = strengthPx;

            if (point.marker) {
                point.marker.style.left = `${x}px`;
                point.marker.style.top = `${y}px`;

                point.marker.style.opacity =
                    point.strength > 0
                        ? `${currentStrength / point.strength}`
                        : "0";
            }
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, gravityTexture);

        gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            0,
            texWidth,
            texHeight,
            gl.RGBA,
            gl.FLOAT,
            texPixels
        );

        return count;
    }

    // ========================================
    // 粒子の消滅時刻
    // ========================================

    function expiration(initialAlpha, decay, now) {
        if (initialAlpha <= PARTICLE_MIN_ALPHA) {
            return now;
        }

        if (decay === 1) {
            return Infinity;
        }

        const frames =
            Math.log(
                PARTICLE_MIN_ALPHA / initialAlpha
            ) / Math.log(decay);

        return now + frames / 60;
    }

    function expireParticles(now) {
        while (
            particleCount > 0 &&
            expirationTimes[head] <= now
        ) {
            head = (head + 1) % MAX_PARTICLES;
            particleCount--;
        }
    }

    // ========================================
    // 新規パーティクル生成
    // ========================================

    function spawnParticles(waveform, attack, now) {
        if (!waveform || waveform.length < 2) {
            return;
        }

        const count = Math.min(
            MAX_PARTICLES,
            Math.ceil(width / PARTICLE_SPACING)
        );

        if (count <= 0) {
            return;
        }

        if (stagingState.length < count * 4) {
            stagingState = new Float32Array(count * 4);
        }

        if (stagingMeta.length < count * 3) {
            stagingMeta = new Float32Array(count * 3);
        }

        const flag = attack ? 1 : 0;
        const targetColor = colorLfoValue;

        for (let i = 0; i < count; ++i) {
            const xr = Math.min(
                1,
                i * PARTICLE_SPACING / width
            );

            const idx = Math.min(
                waveform.length - 1,
                Math.floor(xr * waveform.length)
            );

            const sample = Math.max(
                -1,
                Math.min(1, waveform[idx] || 0)
            );

            const velocity =
                sample /
                SPEED_DIVISOR *
                SPEED_MULTIPLIER;

            const k = i * 4;
            const m = i * 3;

            stagingState[k] = xr * width;
            stagingState[k + 1] = height * 0.5;
            stagingState[k + 2] = 0;
            stagingState[k + 3] = velocity * 60;

            stagingMeta[m] = now;
            stagingMeta[m + 1] = flag;
            stagingMeta[m + 2] = targetColor;
        }

        const first = Math.min(
            count,
            MAX_PARTICLES - writeIndex
        );

        const chunks = [
            [writeIndex, 0, first]
        ];

        if (count > first) {
            chunks.push([
                0,
                first,
                count - first
            ]);
        }

        for (const [start, src, length] of chunks) {
            const stateChunk = stagingState.subarray(
                src * 4,
                (src + length) * 4
            );

            for (const buffer of states) {
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

                gl.bufferSubData(
                    gl.ARRAY_BUFFER,
                    start * STATE_BYTES,
                    stateChunk
                );
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, metaBuffer);

            gl.bufferSubData(
                gl.ARRAY_BUFFER,
                start * META_BYTES,
                stagingMeta.subarray(
                    src * 3,
                    (src + length) * 3
                )
            );
        }

        const expiry = expiration(
            attack
                ? ATTACK_INITIAL_ALPHA
                : NORMAL_INITIAL_ALPHA,
            attack
                ? ATTACK_ALPHA_DECAY
                : NORMAL_ALPHA_DECAY,
            now
        );

        for (let i = 0; i < count; ++i) {
            expirationTimes[
                (writeIndex + i) % MAX_PARTICLES
            ] = expiry;
        }

        const overflow = Math.max(
            0,
            particleCount + count - MAX_PARTICLES
        );

        head =
            (head + overflow) % MAX_PARTICLES;

        particleCount = Math.min(
            MAX_PARTICLES,
            particleCount + count
        );

        writeIndex =
            (writeIndex + count) % MAX_PARTICLES;
    }

    // ========================================
    // GPU物理シミュレーション
    // ========================================

    function simulate(now, dt, count) {
        if (particleCount === 0 || dt <= 0) {
            return;
        }

        const target = 1 - currentState;

        gl.useProgram(simulation);
        gl.uniform1f(su.dt, dt);
        gl.uniform1i(su.count, count);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, gravityTexture);
        gl.bindVertexArray(simVaos[currentState]);

        gl.bindTransformFeedback(
            gl.TRANSFORM_FEEDBACK,
            feedback
        );

        gl.enable(gl.RASTERIZER_DISCARD);

        const first = Math.min(
            particleCount,
            MAX_PARTICLES - head
        );

        const chunks = [[head, first]];

        if (particleCount > first) {
            chunks.push([
                0,
                particleCount - first
            ]);
        }

        for (const [start, length] of chunks) {
            gl.bindBufferRange(
                gl.TRANSFORM_FEEDBACK_BUFFER,
                0,
                states[target],
                start * STATE_BYTES,
                length * STATE_BYTES
            );

            gl.beginTransformFeedback(gl.POINTS);

            gl.drawArrays(
                gl.POINTS,
                start,
                length
            );

            gl.endTransformFeedback();
        }

        gl.disable(gl.RASTERIZER_DISCARD);

        gl.bindBufferBase(
            gl.TRANSFORM_FEEDBACK_BUFFER,
            0,
            null
        );

        gl.bindTransformFeedback(
            gl.TRANSFORM_FEEDBACK,
            null
        );

        gl.bindVertexArray(null);
        currentState = target;
    }

    // ========================================
    // GPU描画
    // ========================================

    function render(now) {
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

        gl.useProgram(rendering);
        gl.uniform1f(ru.time, now);
        gl.bindVertexArray(drawVaos[currentState]);

        gl.enable(gl.BLEND);

        gl.blendFunc(
            gl.SRC_ALPHA,
            gl.ONE_MINUS_SRC_ALPHA
        );

        const first = Math.min(
            particleCount,
            MAX_PARTICLES - head
        );

        gl.drawArrays(
            gl.POINTS,
            head,
            first
        );

        if (particleCount > first) {
            gl.drawArrays(
                gl.POINTS,
                0,
                particleCount - first
            );
        }

        gl.bindVertexArray(null);
    }

    // ========================================
    // リサイズ
    // ========================================

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

        gl.useProgram(rendering);
        gl.uniform1f(ru.width, width);
        gl.uniform1f(ru.height, height);
        gl.uniform1f(ru.dpr, dpr);
    }

    const observer = new ResizeObserver(resize);

    observer.observe(mount);
    resize();

    // ========================================
    // メインループ
    // ========================================

    return {
        update(audio, dt) {
            const now = getTime();

            const elapsed = Math.max(
                now - previousTime,
                0
            );

            const step = Math.min(
                elapsed,
                1 / 30
            );

            previousTime = now;

            updateColorLfo(now, elapsed);

            const attack = Boolean(
                audio?.attackTriggered
            );

            if (attack && !previousAttack) {
                spawnGravity(
                    now,
                    audio?.waveform
                );
            }

            previousAttack = attack;

            const count = uploadGravity(now);

            expireParticles(now);

            simulate(now, step, count);

            spawnParticles(
                audio?.waveform,
                attack,
                now
            );

            render(now);
        },

        // ====================================
        // 終了処理
        // ====================================

        dispose() {
            observer.disconnect();

            for (const point of gravityPoints) {
                point.marker?.remove();
            }

            gravityPoints.length = 0;

            gl.deleteTransformFeedback(feedback);
            gl.deleteTexture(gravityTexture);

            for (const vao of simVaos) {
                gl.deleteVertexArray(vao);
            }

            for (const vao of drawVaos) {
                gl.deleteVertexArray(vao);
            }

            for (const buffer of states) {
                gl.deleteBuffer(buffer);
            }

            gl.deleteBuffer(metaBuffer);

            gl.deleteProgram(simulation);
            gl.deleteProgram(rendering);

            markerLayer.remove();
            centerLine.remove();
            canvas.remove();

            if (changedPosition) {
                mount.style.position = originalPosition;
            }
        }
    };
}
