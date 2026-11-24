export function createVisualizer(mount) {

    // ========================================
    // パーティクル設定
    // ========================================

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

    // ========================================
    // Color LFO
    // ========================================

    const COLOR_LFO_ENABLED = true;
    const COLOR_LFO_FREQ_MIN = 0.001;
    const COLOR_LFO_FREQ_MAX = 0.01;
    const COLOR_LFO_FREQ_DRIFT = 0.001;
    const COLOR_LFO_PHASE_OFFSET = 0;

    const SPEED_DIVISOR = 0.05;
    const SPEED_MULTIPLIER = 0.99;

    // ========================================
    // 重力点設定
    // ========================================

    const GRAVITY_ENABLED = true;

    const GRAVITY_MAX_POINTS = 6;

    const GRAVITY_SPEED_MIN = 0;
    const GRAVITY_SPEED_MAX = 5;
    const GRAVITY_STATIONARY_PROBABILITY = 0.5;

    const GRAVITY_STRENGTH_MIN = 3;
    const GRAVITY_STRENGTH_MAX = 20;

    const GRAVITY_VOLUME_INFLUENCE = 0.8;
    const GRAVITY_VOLUME_REFERENCE = 0.25;

    const GRAVITY_RADIUS_MIN = 70;
    const GRAVITY_RADIUS_MAX = 200;

    const GRAVITY_DECAY_RATE = 0.07;
    const GRAVITY_DECAY_CURVE = 1.8;
    const GRAVITY_ZERO_THRESHOLD = 0.001;

    const GRAVITY_SHOW_MARKERS = false;
    const GRAVITY_MARKER_SIZE = 3;
    const GRAVITY_MARKER_COLOR = "#ff4545";

    // ========================================
    // 描画設定
    // ========================================

    const MAX_PARTICLES = 10000000;
    const MAX_PIXEL_RATIO = 1.5;

    const CENTER_LINE_COLOR = "#ff0000";
    const CENTER_LINE_WIDTH = 0.1;

    const BACKGROUND_COLOR = [9, 11, 18];

    // ========================================
    // 内部最適化設定
    // 画質には影響しない
    // ========================================

    const INITIAL_PARTICLE_CAPACITY = 262144;
    const PARTICLE_BUFFER_GROWTH = 1.5;

    const COMPACT_MIN_DEAD = 65536;
    const COMPACT_DEAD_RATIO = 0.15;
    const COMPACT_INTERVAL = 2.0;

    // ========================================
    // パラメータ検証
    // ========================================

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
        GRAVITY_VOLUME_REFERENCE <= 0 ||
        !Number.isSafeInteger(MAX_PARTICLES) ||
        MAX_PARTICLES < 1 ||
        !Number.isSafeInteger(INITIAL_PARTICLE_CAPACITY) ||
        INITIAL_PARTICLE_CAPACITY < 1 ||
        PARTICLE_BUFFER_GROWTH <= 1 ||
        COMPACT_MIN_DEAD < 1 ||
        COMPACT_DEAD_RATIO <= 0 ||
        COMPACT_DEAD_RATIO > 1 ||
        COMPACT_INTERVAL < 0
    ) {
        throw new Error("Invalid visualizer parameter.");
    }

    // ========================================
    // 固定値の事前計算
    // ========================================

    function lifetime(alpha, decay) {
        if (alpha <= PARTICLE_MIN_ALPHA) {
            return 0;
        }

        if (decay === 1) {
            return Infinity;
        }

        return (
            Math.log(PARTICLE_MIN_ALPHA / alpha) /
            Math.log(decay) /
            60
        );
    }

    const normalLife = lifetime(
        NORMAL_INITIAL_ALPHA,
        NORMAL_ALPHA_DECAY
    );

    const attackLife = lifetime(
        ATTACK_INITIAL_ALPHA,
        ATTACK_ALPHA_DECAY
    );

    const inverseLife = life =>
        Number.isFinite(life) && life > 0
            ? 1 / life
            : 0;

    const shaderLife = life =>
        Number.isFinite(life)
            ? life
            : -1;

    const curveFactor = curve =>
        curve < 0.0001
            ? 0
            : 1 / (1 - Math.exp(-curve));

    const normalDampingRate =
        -Math.LN2 /
        Math.max(NORMAL_SPEED_HALF_LIFE, 0.0001);

    const attackDampingRate =
        -Math.LN2 /
        Math.max(ATTACK_SPEED_HALF_LIFE, 0.0001);

    // ========================================
    // Canvas初期化
    // ========================================

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

    if (
        GRAVITY_MAX_POINTS + 8 >
        gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)
    ) {
        canvas.remove();

        if (changedPosition) {
            mount.style.position = originalPosition;
        }

        throw new Error(
            "GRAVITY_MAX_POINTS exceeds the vertex uniform limit."
        );
    }

    // ========================================
    // 中央ライン
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
        pointerEvents: "none"
    });

    mount.appendChild(centerLine);

    // ========================================
    // 重力点マーカーレイヤー
    // ========================================

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

layout(location = 0) in vec4 aState;
layout(location = 1) in vec2 aMeta;

uniform vec4 uGravityPoints[${GRAVITY_MAX_POINTS}];

uniform int uGravityCount;

uniform float uTime;
uniform float uDt;

uniform vec2 uDamping;
uniform vec2 uLifetime;

out vec4 nextState;

void main() {

    gl_Position = vec4(0.0, 0.0, 0.0, 1.0);

    bool attack = aMeta.y < 0.0;

    float age = max(0.0, uTime - aMeta.x);

    float life = attack
        ? uLifetime.y
        : uLifetime.x;

    // 消滅済み粒子は物理演算を省略する

    if (
        life >= 0.0 &&
        age > life + max(
            0.001,
            abs(uTime) * 0.0000002
        )
    ) {
        nextState = aState;
        return;
    }

    vec2 pos = aState.xy;
    vec2 vel = aState.zw;

    float damping = attack
        ? uDamping.y
        : uDamping.x;

    vec2 acceleration = vec2(0.0);

    for (int i = 0; i < uGravityCount; ++i) {

        vec4 gravity = uGravityPoints[i];

        vec2 delta = gravity.xy - pos;

        float radius = max(gravity.z, 0.0001);

        // 平方根計算の前に重力範囲を判定

        float distanceSquared = dot(delta, delta);

        if (distanceSquared >= radius * radius) {
            continue;
        }

        float distanceToCenter = sqrt(distanceSquared);

        float t = clamp(
            1.0 - distanceToCenter / radius,
            0.0,
            1.0
        );

        float falloff =
            t * t * (3.0 - 2.0 * t);

        vec2 direction =
            delta / max(distanceToCenter, 0.001);

        acceleration +=
            direction * gravity.w * falloff;
    }

    vel = vel * damping + acceleration * uDt;

    pos += vel * uDt;

    nextState = vec4(pos, vel);
}
`;

    // ========================================
    // 物理シミュレーション Fragment Shader
    // ========================================

    const simulateFragment = `#version 300 es

precision highp float;

out vec4 color;

void main() {
    color = vec4(0.0);
}
`;

    // ========================================
    // 描画 Vertex Shader
    // ========================================

    const renderVertex = `#version 300 es

precision highp float;

layout(location = 0) in vec4 aState;
layout(location = 1) in vec2 aMeta;

uniform float uTime;
uniform vec2 uResolution;

uniform float uPixelRatio;
uniform float uCullMargin;

uniform vec4 uSizeNormal;
uniform vec4 uSizeAttack;

uniform vec4 uAlphaNormal;
uniform vec4 uAlphaAttack;

uniform float uMinAlpha;
uniform float uColorRate;

out vec4 vColor;

void hideParticle() {

    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);

    gl_PointSize = 1.0;

    vColor = vec4(0.0);
}

void main() {

    vec2 pos = aState.xy;
    vec2 margin = vec2(uCullMargin);

    // 画面外の粒子は描画計算のみ省略する

    if (
        any(lessThan(pos, -margin)) ||
        any(greaterThan(pos, uResolution + margin))
    ) {
        hideParticle();
        return;
    }

    float age = max(0.0, uTime - aMeta.x);

    bool attack = aMeta.y < 0.0;

    vec4 alphaCfg = attack
        ? uAlphaAttack
        : uAlphaNormal;

    float alpha =
        alphaCfg.x *
        pow(alphaCfg.y, age * 60.0);

    if (alpha <= uMinAlpha) {
        hideParticle();
        return;
    }

    vec4 cfg = attack
        ? uSizeAttack
        : uSizeNormal;

    float size = cfg.x;

    // サイズが一定なら曲線計算を省略

    if (cfg.x != cfg.y) {

        float p = clamp(
            age * alphaCfg.z,
            0.0,
            1.0
        );

        if (cfg.z >= 0.0001) {
            p = (
                1.0 - exp(-cfg.z * p)
            ) * cfg.w;
        }

        size = mix(cfg.x, cfg.y, p);
    }

    float diameter = max(
        0.0,
        size * uPixelRatio
    );

    if (diameter <= 0.0) {
        hideParticle();
        return;
    }

    gl_Position = vec4(
        pos.x * 2.0 / uResolution.x - 1.0,
        1.0 - pos.y * 2.0 / uResolution.y,
        0.0,
        1.0
    );

    gl_PointSize = max(1.0, diameter);

    // アタック粒子は赤固定

    vec3 color = vec3(1.0, 0.0, 0.0);

    // 通常粒子のみ色変化を計算

    if (!attack) {

        float w = (
            1.0 - exp(uColorRate * age)
        ) * clamp(aMeta.y, 0.0, 1.0);

        if (w < 0.5) {

            // 赤 → 白

            color = mix(
                vec3(1.0, 0.0, 0.0),
                vec3(1.0),
                w * 2.0
            );

        } else {

            // 白 → シアン

            color = mix(
                vec3(1.0),
                vec3(0.0, 1.0, 1.0),
                (w - 0.5) * 2.0
            );
        }
    }

    float coverage = min(
        1.0,
        diameter * diameter
    );

    vColor = vec4(
        color,
        alpha * coverage
    );
}
`;

    // ========================================
    // 描画 Fragment Shader
    // ========================================

    const renderFragment = `#version 300 es

precision highp float;

in vec4 vColor;

out vec4 fragColor;

void main() {

    vec2 uv = gl_PointCoord - vec2(0.5);

    if (
        vColor.a <= 0.0 ||
        dot(uv, uv) > 0.25
    ) {
        discard;
    }

    fragColor = vColor;
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
        gravity: uniform(simulation, "uGravityPoints[0]"),
        count: uniform(simulation, "uGravityCount"),
        time: uniform(simulation, "uTime"),
        dt: uniform(simulation, "uDt"),
        damping: uniform(simulation, "uDamping"),
        lifetime: uniform(simulation, "uLifetime")
    };

    const ru = {
        time: uniform(rendering, "uTime"),
        resolution: uniform(rendering, "uResolution"),
        dpr: uniform(rendering, "uPixelRatio"),
        margin: uniform(rendering, "uCullMargin"),
        normal: uniform(rendering, "uSizeNormal"),
        attack: uniform(rendering, "uSizeAttack"),
        normalAlpha: uniform(rendering, "uAlphaNormal"),
        attackAlpha: uniform(rendering, "uAlphaAttack"),
        minAlpha: uniform(rendering, "uMinAlpha"),
        colorRate: uniform(rendering, "uColorRate")
    };

    // ========================================
    // 固定Uniform設定
    // ========================================

    gl.useProgram(simulation);

    gl.uniform2f(
        su.lifetime,
        shaderLife(normalLife),
        shaderLife(attackLife)
    );

    gl.useProgram(rendering);

    gl.uniform4f(
        ru.normal,
        NORMAL_INITIAL_SIZE,
        NORMAL_FINAL_SIZE,
        NORMAL_SIZE_CURVE,
        curveFactor(NORMAL_SIZE_CURVE)
    );

    gl.uniform4f(
        ru.attack,
        ATTACK_INITIAL_SIZE,
        ATTACK_FINAL_SIZE,
        ATTACK_SIZE_CURVE,
        curveFactor(ATTACK_SIZE_CURVE)
    );

    gl.uniform4f(
        ru.normalAlpha,
        NORMAL_INITIAL_ALPHA,
        NORMAL_ALPHA_DECAY,
        inverseLife(normalLife),
        0
    );

    gl.uniform4f(
        ru.attackAlpha,
        ATTACK_INITIAL_ALPHA,
        ATTACK_ALPHA_DECAY,
        inverseLife(attackLife),
        0
    );

    gl.uniform1f(
        ru.minAlpha,
        PARTICLE_MIN_ALPHA
    );

    gl.uniform1f(
        ru.colorRate,
        -Math.LN2 /
        Math.max(NORMAL_COLOR_HALF_LIFE, 0.0001)
    );

    gl.clearColor(
        BACKGROUND_COLOR[0] / 255,
        BACKGROUND_COLOR[1] / 255,
        BACKGROUND_COLOR[2] / 255,
        1
    );

    gl.enable(gl.BLEND);

    gl.blendFunc(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA
    );

    // ========================================
    // 動的GPUバッファ
    // ========================================

    const STATE_BYTES = 16;
    const META_BYTES = 8;

    let capacity = Math.min(
        MAX_PARTICLES,
        INITIAL_PARTICLE_CAPACITY
    );

    function createBuffer(size, usage) {

        const buffer = gl.createBuffer();

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, size, usage);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        return buffer;
    }

    let states = [
        createBuffer(
            capacity * STATE_BYTES,
            gl.DYNAMIC_COPY
        ),
        createBuffer(
            capacity * STATE_BYTES,
            gl.DYNAMIC_COPY
        )
    ];

    let metaBuffer = createBuffer(
        capacity * META_BYTES,
        gl.DYNAMIC_DRAW
    );

    let scratchMeta = null;

    let currentState = 0;

    let vaos = [];

    // ========================================
    // VAO
    // ========================================

    function rebuildVAOs() {

        for (const vao of vaos) {
            gl.deleteVertexArray(vao);
        }

        vaos = states.map(buffer => {

            const vao = gl.createVertexArray();

            gl.bindVertexArray(vao);

            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

            gl.enableVertexAttribArray(0);

            gl.vertexAttribPointer(
                0,
                4,
                gl.FLOAT,
                false,
                STATE_BYTES,
                0
            );

            gl.bindBuffer(gl.ARRAY_BUFFER, metaBuffer);

            gl.enableVertexAttribArray(1);

            gl.vertexAttribPointer(
                1,
                2,
                gl.FLOAT,
                false,
                META_BYTES,
                0
            );

            gl.bindVertexArray(null);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);

            return vao;
        });
    }

    rebuildVAOs();

    const feedback = gl.createTransformFeedback();

    // ========================================
    // パーティクル管理
    // ========================================

    const batches = [];

    let serial = 0;
    let writeIndex = 0;
    let liveCount = 0;
    let lastCompact = -Infinity;

    let stagingState = new Float32Array(0);
    let stagingMeta = new Float32Array(0);

    function refreshTail() {

        if (batches.length === 0) {

            writeIndex = 0;

        } else {

            const last = batches[batches.length - 1];

            writeIndex =
                (last.start + last.count) % capacity;
        }
    }

    function usedCount() {

        if (batches.length === 0) {
            return 0;
        }

        const head = batches[0].start;

        const distance = (
            writeIndex - head + capacity
        ) % capacity;

        return distance === 0
            ? capacity
            : distance;
    }

    // ========================================
    // 消滅済み粒子の除外
    // ========================================

    function expireParticles(now) {

        let kept = 0;
        let count = 0;

        for (let i = 0; i < batches.length; i++) {

            const batch = batches[i];

            if (batch.expiry <= now) {
                continue;
            }

            batches[kept++] = batch;

            count += batch.count;
        }

        batches.length = kept;

        liveCount = count;

        refreshTail();
    }

    // ========================================
    // 最大粒子数制限
    // ========================================

    function trimLogicalCapacity(newCount) {

        const cutoff =
            serial + newCount - MAX_PARTICLES;

        if (
            batches.length === 0 ||
            batches[0].serial >= cutoff
        ) {
            return;
        }

        let removed = 0;

        while (removed < batches.length) {

            const batch = batches[removed];

            const drop = Math.min(
                batch.count,
                Math.max(0, cutoff - batch.serial)
            );

            if (drop === 0) {
                break;
            }

            liveCount -= drop;

            if (drop === batch.count) {

                removed++;

            } else {

                batch.start =
                    (batch.start + drop) % capacity;

                batch.serial += drop;
                batch.count -= drop;

                break;
            }
        }

        if (removed > 0) {
            batches.splice(0, removed);
        }

        refreshTail();
    }

    // ========================================
    // GPUバッファ整理・拡張
    // ========================================

    function compact(newCapacity, now) {

        const oldCapacity = capacity;

        const growing = newCapacity !== oldCapacity;

        const oldStates = states;
        const oldMeta = metaBuffer;
        const oldScratch = scratchMeta;

        const sourceState = states[currentState];

        let targetState;
        let targetMeta;

        if (growing) {

            states = [
                createBuffer(
                    newCapacity * STATE_BYTES,
                    gl.DYNAMIC_COPY
                ),
                createBuffer(
                    newCapacity * STATE_BYTES,
                    gl.DYNAMIC_COPY
                )
            ];

            targetState = states[0];

            targetMeta = createBuffer(
                newCapacity * META_BYTES,
                gl.DYNAMIC_DRAW
            );

            currentState = 0;
            scratchMeta = null;

        } else {

            targetState = states[1 - currentState];

            targetMeta =
                scratchMeta ||
                createBuffer(
                    capacity * META_BYTES,
                    gl.DYNAMIC_COPY
                );

            currentState = 1 - currentState;

            scratchMeta = oldMeta;
        }

        const ranges = [];

        let dest = 0;

        function addRange(src, count) {

            if (count <= 0) {
                return;
            }

            const prev = ranges[ranges.length - 1];

            if (
                prev &&
                prev.src + prev.count === src
            ) {

                prev.count += count;

            } else {

                ranges.push({
                    src,
                    dst: dest,
                    count
                });
            }

            dest += count;
        }

        for (const batch of batches) {

            const start = batch.start;

            const first = Math.min(
                batch.count,
                oldCapacity - start
            );

            batch.start = dest;

            addRange(start, first);

            addRange(0, batch.count - first);
        }

        function copyRanges(source, target, stride) {

            if (ranges.length === 0) {
                return;
            }

            gl.bindBuffer(
                gl.COPY_READ_BUFFER,
                source
            );

            gl.bindBuffer(
                gl.COPY_WRITE_BUFFER,
                target
            );

            for (const range of ranges) {

                gl.copyBufferSubData(
                    gl.COPY_READ_BUFFER,
                    gl.COPY_WRITE_BUFFER,
                    range.src * stride,
                    range.dst * stride,
                    range.count * stride
                );
            }
        }

        copyRanges(
            sourceState,
            targetState,
            STATE_BYTES
        );

        copyRanges(
            oldMeta,
            targetMeta,
            META_BYTES
        );

        gl.bindBuffer(gl.COPY_READ_BUFFER, null);
        gl.bindBuffer(gl.COPY_WRITE_BUFFER, null);

        metaBuffer = targetMeta;

        capacity = newCapacity;

        writeIndex = dest % capacity;

        lastCompact = now;

        rebuildVAOs();

        if (growing) {

            for (const buffer of oldStates) {
                gl.deleteBuffer(buffer);
            }

            gl.deleteBuffer(oldMeta);

            if (oldScratch) {
                gl.deleteBuffer(oldScratch);
            }
        }
    }

    // ========================================
    // 定期バッファ整理
    // ========================================

    function maybeCompact(now) {

        const used = usedCount();

        const dead = used - liveCount;

        if (
            dead >= COMPACT_MIN_DEAD &&
            dead / used >= COMPACT_DEAD_RATIO &&
            now - lastCompact >= COMPACT_INTERVAL
        ) {

            compact(capacity, now);
        }
    }

    // ========================================
    // バッファ容量の自動拡張
    // ========================================

    function ensureCapacity(count, now) {

        if (usedCount() + count <= capacity) {
            return;
        }

        const needed = liveCount + count;

        if (needed <= capacity) {

            compact(capacity, now);

        } else {

            const next = Math.min(
                MAX_PARTICLES,
                Math.max(
                    needed,
                    Math.ceil(
                        capacity * PARTICLE_BUFFER_GROWTH
                    )
                )
            );

            compact(next, now);
        }
    }

    // ========================================
    // 時間管理
    // ========================================

    const startTime = performance.now();

    const getTime = () =>
        (performance.now() - startTime) / 1000;

    let previousTime = getTime();
    let previousAttack = false;

    let width = 1;
    let height = 1;
    let dpr = 1;

    const randomBetween = (a, b) =>
        a + Math.random() * (b - a);

    // ========================================
    // Color LFO
    // ========================================

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
                2 *
                Math.PI *
                COLOR_LFO_FREQ_DRIFT *
                now
            ) + 1
        ) * 0.5;

        const frequency =
            COLOR_LFO_FREQ_MIN +
            (
                COLOR_LFO_FREQ_MAX -
                COLOR_LFO_FREQ_MIN
            ) * modulation;

        colorLfoPhase = (
            colorLfoPhase +
            2 * Math.PI * frequency * dt
        ) % (2 * Math.PI);

        colorLfoValue =
            (Math.sin(colorLfoPhase) + 1) * 0.5;
    }

    // ========================================
    // 重力点管理
    // ========================================

    const gravityPoints = [];

    const gravityData = new Float32Array(
        GRAVITY_MAX_POINTS * 4
    );

    // ========================================
    // アタック音量による重力強度の変化
    // ========================================

    function calculateGravityVolumeFactor(waveform) {

        if (
            GRAVITY_VOLUME_INFLUENCE === 0 ||
            !waveform ||
            waveform.length === 0
        ) {
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

        const volume = Math.max(
            0,
            Math.min(
                1,
                rms / GRAVITY_VOLUME_REFERENCE
            )
        );

        return Math.max(
            0,
            1 +
            GRAVITY_VOLUME_INFLUENCE *
            (volume * 2 - 1)
        );
    }

    // ========================================
    // 重力強度の時間減衰
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

        const strength = point.strength * envelope;

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

        const direction =
            Math.random() < 0.5 ? -1 : 1;

        const speed = stationary
            ? 0
            : randomBetween(
                GRAVITY_SPEED_MIN,
                GRAVITY_SPEED_MAX
            );

        const volumeFactor =
            calculateGravityVolumeFactor(waveform);

        const strength = randomBetween(
            GRAVITY_STRENGTH_MIN,
            GRAVITY_STRENGTH_MAX
        ) * volumeFactor;

        if (gravityPoints.length >= GRAVITY_MAX_POINTS) {

            const oldest = gravityPoints.shift();

            oldest?.marker?.remove();
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

            strength,

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
    // 重力点更新
    // ========================================

    function updateGravity(now) {

        let count = 0;

        const baseSize = Math.min(width, height);

        for (let i = 0; i < gravityPoints.length; i++) {

            const point = gravityPoints[i];

            const strength = effectiveStrength(
                point,
                now
            );

            if (strength === 0) {

                point.marker?.remove();

                continue;
            }

            const elapsed = now - point.born;

            const x = (
                point.x + point.vx * elapsed
            ) * width;

            const y = (
                point.y + point.vy * elapsed
            ) * height;

            const j = count * 4;

            gravityData[j] = x;

            gravityData[j + 1] = y;

            gravityData[j + 2] =
                point.radius / 100 * baseSize;

            gravityData[j + 3] =
                strength / 100 * height;

            if (point.marker) {

                point.marker.style.left = `${x}px`;

                point.marker.style.top = `${y}px`;

                point.marker.style.opacity =
                    point.strength > 0
                        ? `${strength / point.strength}`
                        : "0";
            }

            gravityPoints[count++] = point;
        }

        gravityPoints.length = count;

        return count;
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

        trimLogicalCapacity(count);

        ensureCapacity(count, now);

        if (stagingState.length < count * 4) {
            stagingState = new Float32Array(count * 4);
        }

        if (stagingMeta.length < count * 2) {
            stagingMeta = new Float32Array(count * 2);
        }

        // アタック粒子は色の値を-1にする

        const target = attack
            ? -1
            : colorLfoValue;

        const centerY = height * 0.5;

        for (let i = 0; i < count; i++) {

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

            const s = i * 4;
            const m = i * 2;

            stagingState[s] = xr * width;
            stagingState[s + 1] = centerY;
            stagingState[s + 2] = 0;
            stagingState[s + 3] = velocity * 60;

            stagingMeta[m] = now;
            stagingMeta[m + 1] = target;
        }

        const first = Math.min(
            count,
            capacity - writeIndex
        );

        const rest = count - first;

        // 現在の状態バッファだけに書き込む

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            states[currentState]
        );

        gl.bufferSubData(
            gl.ARRAY_BUFFER,
            writeIndex * STATE_BYTES,
            stagingState,
            0,
            first * 4
        );

        if (rest > 0) {

            gl.bufferSubData(
                gl.ARRAY_BUFFER,
                0,
                stagingState,
                first * 4,
                rest * 4
            );
        }

        // メタデータ転送

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            metaBuffer
        );

        gl.bufferSubData(
            gl.ARRAY_BUFFER,
            writeIndex * META_BYTES,
            stagingMeta,
            0,
            first * 2
        );

        if (rest > 0) {

            gl.bufferSubData(
                gl.ARRAY_BUFFER,
                0,
                stagingMeta,
                first * 2,
                rest * 2
            );
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        // 同じフレームで生成された粒子を
        // まとめて管理する

        batches.push({
            start: writeIndex,
            count,
            serial,
            expiry: now + (
                attack
                    ? attackLife
                    : normalLife
            )
        });

        serial += count;

        liveCount += count;

        writeIndex =
            (writeIndex + count) % capacity;
    }

    // ========================================
    // GPU物理シミュレーション
    // ========================================

    function simulate(now, dt, gravityCount) {

        const used = usedCount();

        if (used === 0 || dt <= 0) {
            return;
        }

        const target = 1 - currentState;

        gl.useProgram(simulation);

        gl.uniform1f(su.time, now);

        gl.uniform1f(su.dt, dt);

        // 速度減衰係数を事前計算

        gl.uniform2f(
            su.damping,
            Math.exp(normalDampingRate * dt),
            Math.exp(attackDampingRate * dt)
        );

        gl.uniform1i(su.count, gravityCount);

        if (gravityCount > 0) {

            gl.uniform4fv(
                su.gravity,
                gravityData,
                0,
                gravityCount * 4
            );
        }

        gl.bindVertexArray(
            vaos[currentState]
        );

        gl.bindTransformFeedback(
            gl.TRANSFORM_FEEDBACK,
            feedback
        );

        gl.enable(gl.RASTERIZER_DISCARD);

        function run(start, count) {

            gl.bindBufferRange(
                gl.TRANSFORM_FEEDBACK_BUFFER,
                0,
                states[target],
                start * STATE_BYTES,
                count * STATE_BYTES
            );

            gl.beginTransformFeedback(gl.POINTS);

            gl.drawArrays(
                gl.POINTS,
                start,
                count
            );

            gl.endTransformFeedback();
        }

        const head = batches[0].start;

        const first = Math.min(
            used,
            capacity - head
        );

        run(head, first);

        if (used > first) {
            run(0, used - first);
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

        gl.clear(gl.COLOR_BUFFER_BIT);

        const used = usedCount();

        if (used === 0) {
            return;
        }

        gl.useProgram(rendering);

        gl.uniform1f(ru.time, now);

        gl.bindVertexArray(
            vaos[currentState]
        );

        const head = batches[0].start;

        const first = Math.min(
            used,
            capacity - head
        );

        gl.drawArrays(
            gl.POINTS,
            head,
            first
        );

        if (used > first) {

            gl.drawArrays(
                gl.POINTS,
                0,
                used - first
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

        const w = Math.max(
            1,
            Math.round(width * dpr)
        );

        const h = Math.max(
            1,
            Math.round(height * dpr)
        );

        // 解像度が変化した場合のみ再設定

        if (canvas.width !== w) {
            canvas.width = w;
        }

        if (canvas.height !== h) {
            canvas.height = h;
        }

        gl.viewport(0, 0, w, h);

        gl.useProgram(rendering);

        gl.uniform2f(
            ru.resolution,
            width,
            height
        );

        gl.uniform1f(ru.dpr, dpr);

        const margin = Math.max(
            1 / dpr,
            NORMAL_INITIAL_SIZE,
            NORMAL_FINAL_SIZE,
            ATTACK_INITIAL_SIZE,
            ATTACK_FINAL_SIZE
        ) + 2;

        gl.uniform1f(ru.margin, margin);
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

            // LFO更新

            updateColorLfo(now, elapsed);

            // アタック検出

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

            // 重力点更新

            const gravityCount = updateGravity(now);

            // 消滅済み粒子を除外

            expireParticles(now);

            // 必要に応じてバッファを整理

            maybeCompact(now);

            // GPU物理演算

            simulate(
                now,
                step,
                gravityCount
            );

            // 新規パーティクル生成

            spawnParticles(
                audio?.waveform,
                attack,
                now
            );

            // GPU描画

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
            batches.length = 0;

            gl.deleteTransformFeedback(feedback);

            for (const vao of vaos) {
                gl.deleteVertexArray(vao);
            }

            for (const buffer of states) {
                gl.deleteBuffer(buffer);
            }

            gl.deleteBuffer(metaBuffer);

            if (scratchMeta) {
                gl.deleteBuffer(scratchMeta);
            }

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