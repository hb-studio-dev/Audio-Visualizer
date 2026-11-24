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
    // 映像の品質・粒子数には影響しない
    // ========================================

    // 初期バッファ容量を算出するための想定FPS
    // 実際のFPSを制限するものではない
    const INITIAL_ESTIMATED_FPS = 60;

    // 初期バッファの最小・最大容量
    const INITIAL_MIN_CAPACITY = 262144;
    const INITIAL_MAX_CAPACITY = 1500000;

    // 容量不足時の拡張倍率
    const PARTICLE_BUFFER_GROWTH = 1.5;

    // 消滅済み粒子の整理条件
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
        MAX_PARTICLES > 2147483647 ||

        MAX_PIXEL_RATIO <= 0 ||

        INITIAL_ESTIMATED_FPS <= 0 ||
        INITIAL_MIN_CAPACITY < 1 ||
        INITIAL_MAX_CAPACITY < INITIAL_MIN_CAPACITY ||

        PARTICLE_BUFFER_GROWTH <= 1 ||

        COMPACT_MIN_DEAD < 1 ||
        COMPACT_DEAD_RATIO <= 0 ||
        COMPACT_DEAD_RATIO > 1 ||
        COMPACT_INTERVAL < 0
    ) {
        throw new Error("Invalid visualizer parameter.");
    }

    // ========================================
    // 共通関数・固定値の事前計算
    // ========================================

    const clamp = (x, lo, hi) =>
        Math.max(lo, Math.min(hi, x));

    const randomBetween = (a, b) =>
        a + Math.random() * (b - a);

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

    const normalRate =
        -Math.LN2 /
        Math.max(NORMAL_SPEED_HALF_LIFE, 0.0001);

    const attackRate =
        -Math.LN2 /
        Math.max(ATTACK_SPEED_HALF_LIFE, 0.0001);

    const colorRate =
        -Math.LN2 /
        Math.max(NORMAL_COLOR_HALF_LIFE, 0.0001);

    const curveFactor = curve =>
        curve < 0.0001
            ? 1
            : 1 / (-Math.expm1(-curve));

    const normalCurveFactor =
        curveFactor(NORMAL_SIZE_CURVE);

    const attackCurveFactor =
        curveFactor(ATTACK_SIZE_CURVE);

    // ========================================
    // Canvas初期化
    // ========================================

    const originalPosition =
        mount.style.position;

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

    if (
        !gl ||
        GRAVITY_MAX_POINTS + 8 >
        gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)
    ) {

        canvas.remove();

        if (changedPosition) {
            mount.style.position = originalPosition;
        }

        throw new Error(
            "WebGL2 or required vertex uniforms are not available."
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

    const markerLayer =
        document.createElement("div");

    Object.assign(markerLayer.style, {
        position: "absolute",
        inset: "0",
        overflow: "hidden",
        pointerEvents: "none"
    });

    mount.appendChild(markerLayer);

    let width = Math.max(
        1,
        mount.getBoundingClientRect().width
    );

    let height = Math.max(
        1,
        mount.getBoundingClientRect().height
    );

    let dpr = 1;

    // ========================================
    // バッチデータ用テクスチャ
    //
    // 同じフレームに生成された粒子は
    // 色・サイズ・透明度・減衰係数を共有する
    //
    // 1バッチにつきRGBA32Fを2テクセル使用
    // ========================================

    const textureLimit =
        gl.getParameter(gl.MAX_TEXTURE_SIZE);

    const textureWidth =
        Math.min(1024, textureLimit);

    const slotsPerRow =
        Math.floor(textureWidth / 2);

    const rowWidth = slotsPerRow * 2;

    const batchTexture = gl.createTexture();

    gl.activeTexture(gl.TEXTURE0);

    gl.bindTexture(
        gl.TEXTURE_2D,
        batchTexture
    );

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

    let textureRows = 0;
    let batchPixels = new Float32Array(0);

    let nextSlot = 0;

    const freeSlots = [];

    function ensureTexture(rows) {

        if (rows <= textureRows) {
            return;
        }

        if (rows > textureLimit) {
            throw new Error(
                "Batch texture capacity exceeded."
            );
        }

        textureRows = Math.min(
            textureLimit,
            Math.max(
                rows,
                16,
                textureRows * 2
            )
        );

        batchPixels = new Float32Array(
            rowWidth * textureRows * 4
        );

        gl.activeTexture(gl.TEXTURE0);

        gl.bindTexture(
            gl.TEXTURE_2D,
            batchTexture
        );

        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA32F,
            rowWidth,
            textureRows,
            0,
            gl.RGBA,
            gl.FLOAT,
            null
        );
    }

    // ========================================
    // Vertex Shader
    //
    // 重力点なし：
    // 累積減衰係数から位置を計算して描画
    // GPUバッファへの状態書き込みなし
    //
    // 重力点あり：
    // 物理演算と描画を同時に実行
    // Transform Feedbackで状態を保存
    // ========================================

    function vertexSource(integrate) {

        return `#version 300 es

${integrate ? "#define INTEGRATE 1" : ""}

precision highp float;
precision highp int;
precision highp sampler2D;

layout(location = 0) in vec4 aState;
layout(location = 1) in uint aBatch;

uniform sampler2D uBatchData;

uniform vec2 uResolution;
uniform float uMargin;

#ifdef INTEGRATE

uniform vec4 uGravity[${GRAVITY_MAX_POINTS}];

uniform int uGravityCount;
uniform float uDt;

out vec4 nextState;

#endif

flat out vec4 vColor;

void hideParticle() {

    gl_Position = vec4(
        2.0,
        2.0,
        0.0,
        1.0
    );

    gl_PointSize = 1.0;

    vColor = vec4(0.0);
}

void main() {

    int id = int(aBatch);

    ivec2 uv = ivec2(
        (id % ${slotsPerRow}) * 2,
        id / ${slotsPerRow}
    );

    // motion.x = 累積移動係数
    // motion.y = 累積速度減衰係数
    // motion.z = 粒子の直径
    // motion.w = 今回の速度減衰係数

    vec4 motion = texelFetch(
        uBatchData,
        uv,
        0
    );

#ifdef INTEGRATE

    nextState = aState;

#endif

    // 消滅済み粒子を除外

    if (motion.y < 0.0) {

        hideParticle();

        return;
    }

    // 重力点がなかった期間の移動を
    // 累積係数から一括で算出

    vec2 pos =
        aState.xy +
        aState.zw * motion.x;

#ifdef INTEGRATE

    vec2 vel =
        aState.zw * motion.y;

    // 新規生成された粒子には
    // 生成フレームの物理演算を適用しない

    if (motion.w >= 0.0) {

        vec2 acceleration = vec2(0.0);

        for (
            int i = 0;
            i < uGravityCount;
            ++i
        ) {

            vec4 g = uGravity[i];

            vec2 delta =
                g.xy - pos;

            float radius =
                max(g.z, 0.0001);

            float d2 =
                dot(delta, delta);

            // 重力範囲外は平方根計算を省略

            if (d2 >= radius * radius) {
                continue;
            }

            float d = sqrt(d2);

            float t = clamp(
                1.0 - d / radius,
                0.0,
                1.0
            );

            float falloff =
                t * t * (3.0 - 2.0 * t);

            acceleration +=
                delta /
                max(d, 0.001) *
                g.w *
                falloff;
        }

        vel =
            vel * motion.w +
            acceleration * uDt;

        pos += vel * uDt;
    }

    // 描画と同時に更新後の状態を保存

    nextState = vec4(pos, vel);

#endif

    // 画面外の粒子は描画演算を省略
    // 重力による物理演算は維持

    if (
        motion.z <= 0.0 ||

        any(
            lessThan(
                pos,
                vec2(-uMargin)
            )
        ) ||

        any(
            greaterThan(
                pos,
                uResolution + vec2(uMargin)
            )
        )
    ) {

        hideParticle();

        return;
    }

    // 色・透明度は同時生成粒子で共有
    // シェーダー内でpowやexpを計算しない

    vColor = texelFetch(
        uBatchData,
        uv + ivec2(1, 0),
        0
    );

    if (vColor.a <= 0.0) {

        hideParticle();

        return;
    }

    gl_Position = vec4(
        pos.x * 2.0 / uResolution.x - 1.0,
        1.0 - pos.y * 2.0 / uResolution.y,
        0.0,
        1.0
    );

    gl_PointSize = max(
        1.0,
        motion.z
    );
}
`;
    }

    // ========================================
    // Fragment Shader
    //
    // 円形の判定と色の出力のみ
    // ========================================

    const fragmentSource = `#version 300 es

precision highp float;

flat in vec4 vColor;

out vec4 fragColor;

void main() {

    vec2 uv =
        gl_PointCoord -
        vec2(0.5);

    if (dot(uv, uv) > 0.25) {
        discard;
    }

    fragColor = vColor;
}
`;

    // ========================================
    // Shader / Program
    // ========================================

    function compile(type, source) {

        const shader =
            gl.createShader(type);

        gl.shaderSource(shader, source);

        gl.compileShader(shader);

        if (
            !gl.getShaderParameter(
                shader,
                gl.COMPILE_STATUS
            )
        ) {

            const message =
                gl.getShaderInfoLog(shader);

            gl.deleteShader(shader);

            throw new Error(
                message || "Shader compile error."
            );
        }

        return shader;
    }

    function makeProgram(integrate) {

        const vs = compile(
            gl.VERTEX_SHADER,
            vertexSource(integrate)
        );

        const fs = compile(
            gl.FRAGMENT_SHADER,
            fragmentSource
        );

        const program =
            gl.createProgram();

        gl.attachShader(program, vs);

        gl.attachShader(program, fs);

        if (integrate) {

            gl.transformFeedbackVaryings(
                program,
                ["nextState"],
                gl.INTERLEAVED_ATTRIBS
            );
        }

        gl.linkProgram(program);

        gl.deleteShader(vs);

        gl.deleteShader(fs);

        if (
            !gl.getProgramParameter(
                program,
                gl.LINK_STATUS
            )
        ) {

            const message =
                gl.getProgramInfoLog(program);

            gl.deleteProgram(program);

            throw new Error(
                message || "Program link error."
            );
        }

        const uniform = name =>
            gl.getUniformLocation(
                program,
                name
            );

        gl.useProgram(program);

        gl.uniform1i(
            uniform("uBatchData"),
            0
        );

        return {

            program,

            resolution:
                uniform("uResolution"),

            margin:
                uniform("uMargin"),

            gravity:
                uniform("uGravity[0]"),

            count:
                uniform("uGravityCount"),

            dt:
                uniform("uDt")
        };
    }

    // 重力点がない場合の専用プログラム

    const freeProgram =
        makeProgram(false);

    // 重力点がある場合の統合プログラム

    const gravityProgram =
        makeProgram(true);

    // ========================================
    // 固定描画設定
    // ========================================

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

    gl.disable(
        gl.RASTERIZER_DISCARD
    );

    // ========================================
    // GPUパーティクルバッファ
    //
    // State:
    // x, y, velocityX, velocityY
    // 16 bytes
    //
    // Batch ID:
    // 4 bytes
    // ========================================

    const STATE_BYTES = 16;
    const ID_BYTES = 4;

    // 画面幅、通常粒子の寿命、想定FPSから
    // 初期バッファ容量を計算する

    let capacity = Math.min(

        MAX_PARTICLES,

        INITIAL_MAX_CAPACITY,

        Math.max(

            INITIAL_MIN_CAPACITY,

            Math.ceil(

                Math.ceil(
                    width / PARTICLE_SPACING
                ) *

                INITIAL_ESTIMATED_FPS *

                normalLife *

                1.1
            )
        )
    );

    function makeBuffer(size, usage) {

        const buffer =
            gl.createBuffer();

        if (!buffer) {

            throw new Error(
                "GPU buffer allocation failed."
            );
        }

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            buffer
        );

        gl.bufferData(
            gl.ARRAY_BUFFER,
            size,
            usage
        );

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            null
        );

        const err = gl.getError();

        if (err !== gl.NO_ERROR) {

            gl.deleteBuffer(buffer);

            throw new Error(
                `GPU buffer allocation failed: ${err}`
            );
        }

        return buffer;
    }

    // 最初は状態バッファを1つだけ確保
    // 重力演算などが必要になったときに
    // 2つ目を確保する

    let states = [

        makeBuffer(
            capacity * STATE_BYTES,
            gl.DYNAMIC_COPY
        ),

        null
    ];

    let ids = makeBuffer(
        capacity * ID_BYTES,
        gl.DYNAMIC_DRAW
    );

    let scratchIds = null;

    let current = 0;

    let vaos = [null, null];

    // ========================================
    // VAO
    // ========================================

    function makeVAO(buffer) {

        const vao =
            gl.createVertexArray();

        gl.bindVertexArray(vao);

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            buffer
        );

        gl.enableVertexAttribArray(0);

        gl.vertexAttribPointer(
            0,
            4,
            gl.FLOAT,
            false,
            STATE_BYTES,
            0
        );

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            ids
        );

        gl.enableVertexAttribArray(1);

        gl.vertexAttribIPointer(
            1,
            1,
            gl.UNSIGNED_INT,
            ID_BYTES,
            0
        );

        gl.bindVertexArray(null);

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            null
        );

        return vao;
    }

    function rebuildVAOs() {

        for (const vao of vaos) {

            if (vao) {
                gl.deleteVertexArray(vao);
            }
        }

        vaos = states.map(
            buffer =>
                buffer
                    ? makeVAO(buffer)
                    : null
        );
    }

    function ensureAlternate() {

        const target = 1 - current;

        if (!states[target]) {

            states[target] = makeBuffer(
                capacity * STATE_BYTES,
                gl.DYNAMIC_COPY
            );

            vaos[target] =
                makeVAO(states[target]);
        }

        return target;
    }

    rebuildVAOs();

    const feedback =
        gl.createTransformFeedback();

    // ========================================
    // パーティクル管理
    //
    // 同一フレームで生成された粒子を
    // バッチ単位で管理する
    // ========================================

    const batches = [];

    let liveCount = 0;

    let serial = 0;

    let writeIndex = 0;

    let lastCompact = -Infinity;

    let stagingState =
        new Float32Array(0);

    let stagingIds =
        new Uint32Array(0);

    // ========================================
    // バッチIDの再利用
    // ========================================

    function releaseSlot(batch) {

        freeSlots.push(
            batch.slot
        );
    }

    function refreshTail() {

        const last =
            batches[batches.length - 1];

        writeIndex = last

            ? (
                last.start +
                last.count
            ) % capacity

            : 0;
    }

    function usedCount() {

        if (!batches.length) {
            return 0;
        }

        return (

            writeIndex -
            batches[0].start +
            capacity

        ) % capacity || capacity;
    }

    // ========================================
    // バッファの前後にある消滅済み粒子を除去
    // ========================================

    function pruneEnds() {

        let n = 0;

        while (
            n < batches.length &&
            batches[n].dead
        ) {

            releaseSlot(
                batches[n++]
            );
        }

        if (n) {

            batches.splice(0, n);
        }

        while (
            batches.length &&
            batches[batches.length - 1].dead
        ) {

            releaseSlot(
                batches.pop()
            );
        }

        refreshTail();
    }

    // ========================================
    // 消滅済み粒子の管理
    // ========================================

    function expireParticles(now) {

        for (const b of batches) {

            if (
                !b.dead &&
                b.expiry <= now
            ) {

                b.dead = true;

                liveCount -= b.count;
            }
        }

        pruneEnds();
    }

    // ========================================
    // 最大粒子数制限
    //
    // 元の生成順と上書きルールを維持
    // ========================================

    function trimLogicalCapacity(count) {

        const cutoff =
            serial +
            count -
            MAX_PARTICLES;

        let n = 0;

        while (n < batches.length) {

            const b = batches[n];

            const drop = Math.min(

                b.count,

                Math.max(
                    0,
                    cutoff - b.serial
                )
            );

            if (!drop) {
                break;
            }

            if (!b.dead) {

                liveCount -= drop;
            }

            if (drop === b.count) {

                releaseSlot(b);

                n++;

            } else {

                b.start = (
                    b.start + drop
                ) % capacity;

                b.serial += drop;

                b.count -= drop;

                break;
            }
        }

        if (n) {

            batches.splice(0, n);
        }

        pruneEnds();
    }

    // ========================================
    // GPUバッファ整理・拡張
    //
    // 生存粒子を生成順に詰め直す
    // CPUへの読み戻しは行わない
    // ========================================

    function compact(newCapacity, now) {

        const oldCapacity = capacity;

        const growing =
            newCapacity !== oldCapacity;

        const oldStates = states;

        const oldIds = ids;

        const oldScratch = scratchIds;

        const source =
            states[current];

        let target;

        let targetIds;

        if (growing) {

            target = makeBuffer(
                newCapacity * STATE_BYTES,
                gl.DYNAMIC_COPY
            );

            targetIds = makeBuffer(
                newCapacity * ID_BYTES,
                gl.DYNAMIC_DRAW
            );

            states = [
                target,
                null
            ];

            current = 0;

            scratchIds = null;

        } else {

            current =
                ensureAlternate();

            target =
                states[current];

            targetIds =
                scratchIds ||

                makeBuffer(
                    capacity * ID_BYTES,
                    gl.DYNAMIC_COPY
                );

            scratchIds = oldIds;
        }

        const ranges = [];

        let dest = 0;

        let kept = 0;

        // 連続したGPUコピー範囲を結合

        function addRange(src, count) {

            if (!count) {
                return;
            }

            const prev =
                ranges[ranges.length - 1];

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

        for (const b of batches) {

            if (b.dead) {

                releaseSlot(b);

                continue;
            }

            const start = b.start;

            const first = Math.min(
                b.count,
                oldCapacity - start
            );

            b.start = dest;

            addRange(
                start,
                first
            );

            addRange(
                0,
                b.count - first
            );

            batches[kept++] = b;
        }

        batches.length = kept;

        function copyRanges(src, dst, bytes) {

            if (!ranges.length) {
                return;
            }

            gl.bindBuffer(
                gl.COPY_READ_BUFFER,
                src
            );

            gl.bindBuffer(
                gl.COPY_WRITE_BUFFER,
                dst
            );

            for (const r of ranges) {

                gl.copyBufferSubData(
                    gl.COPY_READ_BUFFER,
                    gl.COPY_WRITE_BUFFER,
                    r.src * bytes,
                    r.dst * bytes,
                    r.count * bytes
                );
            }
        }

        copyRanges(
            source,
            target,
            STATE_BYTES
        );

        copyRanges(
            oldIds,
            targetIds,
            ID_BYTES
        );

        gl.bindBuffer(
            gl.COPY_READ_BUFFER,
            null
        );

        gl.bindBuffer(
            gl.COPY_WRITE_BUFFER,
            null
        );

        ids = targetIds;

        capacity = newCapacity;

        writeIndex =
            dest % capacity;

        lastCompact = now;

        rebuildVAOs();

        if (growing) {

            for (const b of oldStates) {

                if (b) {

                    gl.deleteBuffer(b);
                }
            }

            gl.deleteBuffer(oldIds);

            if (oldScratch) {

                gl.deleteBuffer(oldScratch);
            }
        }
    }

    // ========================================
    // バッファ容量の自動管理
    // ========================================

    function ensureCapacity(count, now) {

        const used = usedCount();

        if (used + count <= capacity) {

            const dead =
                used - liveCount;

            if (

                dead >= COMPACT_MIN_DEAD &&

                dead / used >= COMPACT_DEAD_RATIO &&

                now - lastCompact >= COMPACT_INTERVAL

            ) {

                compact(
                    capacity,
                    now
                );
            }

            return;
        }

        const need =
            liveCount + count;

        const next =

            need <= capacity

                ? capacity

                : Math.min(

                    MAX_PARTICLES,

                    Math.max(

                        need,

                        Math.ceil(
                            capacity *
                            PARTICLE_BUFFER_GROWTH
                        )
                    )
                );

        compact(
            next,
            now
        );
    }

    // ========================================
    // 時間管理
    // ========================================

    const startTime =
        performance.now();

    const getTime = () =>
        (
            performance.now() -
            startTime
        ) / 1000;

    let previousTime =
        getTime();

    let previousAttack = false;

    // ========================================
    // Color LFO
    // ========================================

    let colorLfoPhase =
        COLOR_LFO_PHASE_OFFSET;

    let colorLfoValue = (
        Math.sin(colorLfoPhase) + 1
    ) * 0.5;

    function updateColorLfo(now, dt) {

        if (!COLOR_LFO_ENABLED) {

            colorLfoValue = 1;

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

            2 *

            Math.PI *

            frequency *

            dt

        ) % (2 * Math.PI);

        colorLfoValue = (

            Math.sin(colorLfoPhase) + 1

        ) * 0.5;
    }

    // ========================================
    // 重力点管理
    // ========================================

    const gravityPoints = [];

    const gravityData =
        new Float32Array(
            GRAVITY_MAX_POINTS * 4
        );

    // ========================================
    // 音量による重力強度の変化
    // ========================================

    function volumeFactor(waveform) {

        if (

            GRAVITY_VOLUME_INFLUENCE === 0 ||

            !waveform?.length

        ) {

            return 1;
        }

        let sum = 0;

        for (
            let i = 0;
            i < waveform.length;
            i++
        ) {

            sum +=
                waveform[i] *
                waveform[i];
        }

        const volume = clamp(

            Math.sqrt(
                sum / waveform.length
            ) / GRAVITY_VOLUME_REFERENCE,

            0,

            1
        );

        return Math.max(

            0,

            1 +

            GRAVITY_VOLUME_INFLUENCE *

            (volume * 2 - 1)
        );
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

        const axisX =
            Math.random() < 0.5;

        const direction =
            Math.random() < 0.5
                ? -1
                : 1;

        const speed = stationary

            ? 0

            : randomBetween(
                GRAVITY_SPEED_MIN,
                GRAVITY_SPEED_MAX
            );

        const volume =
            volumeFactor(waveform);

        const strength = randomBetween(

            GRAVITY_STRENGTH_MIN,

            GRAVITY_STRENGTH_MAX

        ) * volume;

        // 上限を超えたら最古の重力点を削除

        if (
            gravityPoints.length >=
            GRAVITY_MAX_POINTS
        ) {

            gravityPoints
                .shift()
                ?.marker
                ?.remove();
        }

        let marker = null;

        if (GRAVITY_SHOW_MARKERS) {

            marker =
                document.createElement("div");

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

                ? speed / 100 * direction

                : 0,

            vy: axisX

                ? 0

                : speed / 100 * direction,

            born: now,

            marker
        });
    }

    // ========================================
    // 重力点更新
    // ========================================

    function updateGravity(now) {

        let count = 0;

        const base =
            Math.min(width, height);

        for (const p of gravityPoints) {

            const age = Math.max(
                0,
                now - p.born
            );

            const strength =

                p.strength *

                Math.exp(

                    -Math.pow(
                        age * GRAVITY_DECAY_RATE,
                        GRAVITY_DECAY_CURVE
                    )
                );

            if (
                strength <=
                GRAVITY_ZERO_THRESHOLD
            ) {

                p.marker?.remove();

                continue;
            }

            const x = (

                p.x +
                p.vx * age

            ) * width;

            const y = (

                p.y +
                p.vy * age

            ) * height;

            const i = count * 4;

            gravityData[i] = x;

            gravityData[i + 1] = y;

            gravityData[i + 2] =
                p.radius / 100 * base;

            gravityData[i + 3] =
                strength / 100 * height;

            if (p.marker) {

                p.marker.style.left = `${x}px`;

                p.marker.style.top = `${y}px`;

                p.marker.style.opacity =

                    p.strength > 0

                        ? `${strength / p.strength}`

                        : "0";
            }

            gravityPoints[count++] = p;
        }

        gravityPoints.length = count;

        return count;
    }

    // ========================================
    // 新規パーティクル生成
    // ========================================

    function spawnParticles(
        waveform,
        attack,
        now
    ) {

        if (
            !waveform ||
            waveform.length < 2
        ) {

            ensureCapacity(0, now);

            return null;
        }

        const count = Math.min(

            MAX_PARTICLES,

            Math.ceil(
                width / PARTICLE_SPACING
            )
        );

        trimLogicalCapacity(count);

        ensureCapacity(
            count,
            now
        );

        // バッチIDを再利用する

        const slot = freeSlots.length

            ? freeSlots.pop()

            : nextSlot++;

        if (
            slot >=
            slotsPerRow * textureLimit
        ) {

            throw new Error(
                "Batch slot limit exceeded."
            );
        }

        // 一時配列を再利用

        if (
            stagingState.length <
            count * 4
        ) {

            stagingState =
                new Float32Array(count * 4);
        }

        if (
            stagingIds.length <
            count
        ) {

            stagingIds =
                new Uint32Array(count);
        }

        // 同じフレームで生成された粒子は
        // すべて同じバッチIDを持つ

        stagingIds.fill(
            slot,
            0,
            count
        );

        const cy =
            height * 0.5;

        for (
            let i = 0;
            i < count;
            i++
        ) {

            const xr = Math.min(

                1,

                i *
                PARTICLE_SPACING /
                width
            );

            const idx = Math.min(

                waveform.length - 1,

                Math.floor(
                    xr * waveform.length
                )
            );

            const sample = clamp(

                waveform[idx] || 0,

                -1,

                1
            );

            const j = i * 4;

            stagingState[j] =
                xr * width;

            stagingState[j + 1] =
                cy;

            stagingState[j + 2] =
                0;

            stagingState[j + 3] =

                sample /

                SPEED_DIVISOR *

                SPEED_MULTIPLIER *

                60;
        }

        const first = Math.min(

            count,

            capacity - writeIndex
        );

        const rest =
            count - first;

        // ====================================
        // 座標・速度データ転送
        // ====================================

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            states[current]
        );

        gl.bufferSubData(
            gl.ARRAY_BUFFER,
            writeIndex * STATE_BYTES,
            stagingState,
            0,
            first * 4
        );

        if (rest) {

            gl.bufferSubData(
                gl.ARRAY_BUFFER,
                0,
                stagingState,
                first * 4,
                rest * 4
            );
        }

        // ====================================
        // バッチID転送
        // ====================================

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            ids
        );

        gl.bufferSubData(
            gl.ARRAY_BUFFER,
            writeIndex * ID_BYTES,
            stagingIds,
            0,
            first
        );

        if (rest) {

            gl.bufferSubData(
                gl.ARRAY_BUFFER,
                0,
                stagingIds,
                first,
                rest
            );
        }

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            null
        );

        // ====================================
        // バッチ情報
        // ====================================

        const batch = {

            slot,

            start: writeIndex,

            count,

            serial,

            born: now,

            attack,

            target: colorLfoValue,

            expiry: now + (

                attack

                    ? attackLife

                    : normalLife
            ),

            // 重力点がない期間の累積係数

            distance: 0,

            damping: 1,

            dead: false
        };

        batches.push(batch);

        serial += count;

        liveCount += count;

        writeIndex = (

            writeIndex + count

        ) % capacity;

        return batch;
    }

    // ========================================
    // バッチ共通データの計算
    //
    // 同時生成された粒子について
    // 以下の演算を1回だけ実行する
    //
    // ・透明度
    // ・サイズ
    // ・サイズ変化曲線
    // ・色
    // ・速度減衰
    // ・累積移動量
    // ========================================

    function prepareBatches(
        now,
        dt,
        integrate,
        newborn
    ) {

        const rows = Math.max(

            1,

            Math.ceil(
                nextSlot / slotsPerRow
            )
        );

        ensureTexture(rows);

        // 速度減衰係数は1フレーム2回だけ計算

        const dn =
            Math.exp(normalRate * dt);

        const da =
            Math.exp(attackRate * dt);

        for (const b of batches) {

            const j =
                b.slot * 8;

            // 消滅済みバッチ

            if (b.dead) {

                batchPixels[j + 1] = -1;

                continue;
            }

            const a = b.attack;

            const damping =
                a ? da : dn;

            // =================================
            // 重力点が存在しない場合
            //
            // 元の離散時間の減衰・移動計算を
            // バッチ共通の累積係数にまとめる
            //
            // GPUバッファの座標・速度は
            // 毎フレーム更新しない
            // =================================

            if (
                !integrate &&
                b !== newborn
            ) {

                b.damping *= damping;

                b.distance +=
                    b.damping * dt;
            }

            // =================================
            // 年齢・透明度
            // =================================

            const age = Math.max(
                0,
                now - b.born
            );

            const alpha = (

                a

                    ? ATTACK_INITIAL_ALPHA

                    : NORMAL_INITIAL_ALPHA

            ) * Math.pow(

                a

                    ? ATTACK_ALPHA_DECAY

                    : NORMAL_ALPHA_DECAY,

                age * 60
            );

            // =================================
            // サイズ計算
            // =================================

            const life =

                a

                    ? attackLife

                    : normalLife;

            const startSize =

                a

                    ? ATTACK_INITIAL_SIZE

                    : NORMAL_INITIAL_SIZE;

            const endSize =

                a

                    ? ATTACK_FINAL_SIZE

                    : NORMAL_FINAL_SIZE;

            let size = startSize;

            // サイズが一定なら曲線計算を省略

            if (startSize !== endSize) {

                let p =

                    Number.isFinite(life) &&
                    life > 0

                        ? clamp(
                            age / life,
                            0,
                            1
                        )

                        : 0;

                const curve =

                    a

                        ? ATTACK_SIZE_CURVE

                        : NORMAL_SIZE_CURVE;

                if (curve >= 0.0001) {

                    p =

                        -Math.expm1(-curve * p) *

                        (
                            a

                                ? attackCurveFactor

                                : normalCurveFactor
                        );
                }

                size +=

                    (endSize - startSize) *

                    p;
            }

            const diameter = Math.max(

                0,

                size * dpr
            );

            // =================================
            // 色計算
            //
            // 通常：赤 → 白 → シアン
            // アタック：赤固定
            // =================================

            const w =

                a

                    ? 0

                    : (

                        1 -
                        Math.exp(colorRate * age)

                    ) * clamp(
                        b.target,
                        0,
                        1
                    );

            const r =

                w < 0.5

                    ? 1

                    : 2 - 2 * w;

            const gb =

                w < 0.5

                    ? 2 * w

                    : 1;

            // =================================
            // 1テクセル目：移動・サイズ
            // =================================

            batchPixels[j] =
                b.distance;

            batchPixels[j + 1] =
                b.damping;

            batchPixels[j + 2] =
                diameter;

            batchPixels[j + 3] =

                integrate &&
                b !== newborn

                    ? damping

                    : -1;

            // =================================
            // 2テクセル目：色・透明度
            // =================================

            batchPixels[j + 4] = r;

            batchPixels[j + 5] = gb;

            batchPixels[j + 6] = gb;

            batchPixels[j + 7] =

                alpha > PARTICLE_MIN_ALPHA

                    ? alpha *
                        Math.min(
                            1,
                            diameter * diameter
                        )

                    : 0;

            // 重力演算がある場合は
            // GPU側で現在位置と速度を保存するため
            // 累積係数をリセット

            if (integrate) {

                b.distance = 0;

                b.damping = 1;
            }
        }

        // バッチ共通情報をGPUへ一括転送

        gl.activeTexture(gl.TEXTURE0);

        gl.bindTexture(
            gl.TEXTURE_2D,
            batchTexture
        );

        gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            0,
            rowWidth,
            rows,
            gl.RGBA,
            gl.FLOAT,
            batchPixels
        );
    }

    // ========================================
    // GPU描画・物理演算
    //
    // 重力なし：
    // 描画のみ
    //
    // 重力あり：
    // 物理演算と描画を同時実行
    // ========================================

    function render(
        gravityCount,
        dt,
        integrate
    ) {

        gl.clear(
            gl.COLOR_BUFFER_BIT
        );

        const used = usedCount();

        if (!used) {
            return;
        }

        const p =

            integrate

                ? gravityProgram

                : freeProgram;

        const target =

            integrate

                ? ensureAlternate()

                : current;

        gl.useProgram(
            p.program
        );

        if (integrate) {

            gl.uniform1i(
                p.count,
                gravityCount
            );

            gl.uniform1f(
                p.dt,
                dt
            );

            gl.uniform4fv(
                p.gravity,
                gravityData,
                0,
                gravityCount * 4
            );

            gl.bindTransformFeedback(
                gl.TRANSFORM_FEEDBACK,
                feedback
            );
        }

        gl.bindVertexArray(
            vaos[current]
        );

        // ====================================
        // 描画・Transform Feedback統合処理
        // ====================================

        function run(start, count) {

            if (integrate) {

                gl.bindBufferRange(
                    gl.TRANSFORM_FEEDBACK_BUFFER,
                    0,
                    states[target],
                    start * STATE_BYTES,
                    count * STATE_BYTES
                );

                gl.beginTransformFeedback(
                    gl.POINTS
                );
            }

            // RASTERIZER_DISCARDを使用せず
            // 物理演算と描画を同時に行う

            gl.drawArrays(
                gl.POINTS,
                start,
                count
            );

            if (integrate) {

                gl.endTransformFeedback();
            }
        }

        const head =
            batches[0].start;

        const first = Math.min(

            used,

            capacity - head
        );

        // 描画順序を維持

        run(
            head,
            first
        );

        if (used > first) {

            run(
                0,
                used - first
            );
        }

        if (integrate) {

            gl.bindBufferBase(
                gl.TRANSFORM_FEEDBACK_BUFFER,
                0,
                null
            );

            gl.bindTransformFeedback(
                gl.TRANSFORM_FEEDBACK,
                null
            );

            current = target;
        }

        gl.bindVertexArray(null);
    }

    // ========================================
    // リサイズ
    // ========================================

    function resize() {

        const bounds =
            mount.getBoundingClientRect();

        width = Math.max(
            1,
            bounds.width
        );

        height = Math.max(
            1,
            bounds.height
        );

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

        // サイズ変更が必要な場合のみ更新

        if (canvas.width !== w) {

            canvas.width = w;
        }

        if (canvas.height !== h) {

            canvas.height = h;
        }

        gl.viewport(
            0,
            0,
            w,
            h
        );

        const margin = Math.max(

            1 / dpr,

            NORMAL_INITIAL_SIZE,

            NORMAL_FINAL_SIZE,

            ATTACK_INITIAL_SIZE,

            ATTACK_FINAL_SIZE

        ) + 2;

        // 両方の描画プログラムに
        // 同じ解像度を設定する

        for (const p of [
            freeProgram,
            gravityProgram
        ]) {

            gl.useProgram(
                p.program
            );

            gl.uniform2f(
                p.resolution,
                width,
                height
            );

            gl.uniform1f(
                p.margin,
                margin
            );
        }
    }

    const observer =
        new ResizeObserver(resize);

    observer.observe(mount);

    resize();

    // ========================================
    // メインループ
    // ========================================

    return {

        update(audio, dt) {

            if (gl.isContextLost()) {
                return;
            }

            const now = getTime();

            const elapsed = Math.max(

                0,

                now - previousTime
            );

            // 元の物理演算ステップを維持

            const step = Math.min(

                elapsed,

                1 / 30
            );

            previousTime = now;

            // =================================
            // Color LFO
            // =================================

            updateColorLfo(
                now,
                elapsed
            );

            // =================================
            // アタック検出
            // =================================

            const attack = Boolean(
                audio?.attackTriggered
            );

            if (
                attack &&
                !previousAttack
            ) {

                spawnGravity(
                    now,
                    audio?.waveform
                );
            }

            previousAttack = attack;

            // =================================
            // 重力点更新
            // =================================

            const gravityCount =
                updateGravity(now);

            // =================================
            // 消滅済み粒子の除外
            // =================================

            expireParticles(now);

            // =================================
            // 新規パーティクル生成
            // =================================

            const newborn = spawnParticles(

                audio?.waveform,

                attack,

                now
            );

            // =================================
            // 重力演算の必要性を判定
            // =================================

            const integrate =

                gravityCount > 0 &&

                step > 0;

            // =================================
            // バッチ共通データを準備
            // =================================

            if (batches.length) {

                prepareBatches(
                    now,
                    step,
                    integrate,
                    newborn
                );
            }

            // =================================
            // GPU描画
            //
            // 必要な場合のみ
            // 同時に物理演算を実行する
            // =================================

            render(
                gravityCount,
                step,
                integrate
            );
        },

        // ====================================
        // 終了処理
        // ====================================

        dispose() {

            observer.disconnect();

            for (
                const p of gravityPoints
            ) {

                p.marker?.remove();
            }

            gravityPoints.length = 0;

            batches.length = 0;

            freeSlots.length = 0;

            gl.deleteTransformFeedback(
                feedback
            );

            for (const vao of vaos) {

                if (vao) {

                    gl.deleteVertexArray(vao);
                }
            }

            for (const b of states) {

                if (b) {

                    gl.deleteBuffer(b);
                }
            }

            gl.deleteBuffer(ids);

            if (scratchIds) {

                gl.deleteBuffer(
                    scratchIds
                );
            }

            gl.deleteTexture(
                batchTexture
            );

            gl.deleteProgram(
                freeProgram.program
            );

            gl.deleteProgram(
                gravityProgram.program
            );

            markerLayer.remove();

            centerLine.remove();

            canvas.remove();

            if (changedPosition) {

                mount.style.position =
                    originalPosition;
            }
        }
    };
}