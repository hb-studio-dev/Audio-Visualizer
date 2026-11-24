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
    const GRAVITY_SPEED_MAX = 2;
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
    // GPUバッファ最適化設定
    // ========================================

    // 1ページあたりの粒子数
    // 最大粒子数を制限するものではない
    const PAGE_PARTICLES = 262144;

    // 初期容量を計算するための想定FPS
    const INITIAL_ESTIMATED_FPS = 60;

    const INITIAL_MIN_CAPACITY = 262144;
    const INITIAL_MAX_CAPACITY = 1500000;

    // バッチテクスチャを3枚交互に使用
    const BATCH_TEXTURE_COUNT = 3;

    // 初期バッチ情報確保数
    const INITIAL_BATCH_SLOTS = 16384;

    // ========================================
    // フレーム時間安定化設定
    // ========================================

    const FRAME_SMOOTHING_ENABLED = true;

    // フレーム時間の中央値を求めるサンプル数
    const FRAME_HISTORY_SIZE = 9;

    // 通常フレーム時間に対する最大倍率
    const FRAME_SPIKE_RATIO = 1.35;

    // 1フレームあたりの最大進行時間
    const MAX_VISUAL_STEP = 1 / 30;

    // この秒数以上停止した場合は
    // 停止期間の時間経過を無視する
    const PAUSE_GAP = 0.25;

    // ========================================
    // パフォーマンス診断
    // ========================================

    const DEBUG_PERFORMANCE = false;
    const DEBUG_INTERVAL = 2;

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

        !Number.isSafeInteger(PAGE_PARTICLES) ||
        PAGE_PARTICLES < 1 ||

        INITIAL_ESTIMATED_FPS <= 0 ||
        INITIAL_MIN_CAPACITY < 1 ||
        INITIAL_MAX_CAPACITY < INITIAL_MIN_CAPACITY ||

        !Number.isSafeInteger(BATCH_TEXTURE_COUNT) ||
        BATCH_TEXTURE_COUNT < 2 ||

        INITIAL_BATCH_SLOTS < 1 ||

        !Number.isSafeInteger(FRAME_HISTORY_SIZE) ||
        FRAME_HISTORY_SIZE < 1 ||

        FRAME_SPIKE_RATIO < 1 ||
        MAX_VISUAL_STEP <= 0 ||
        PAUSE_GAP <= MAX_VISUAL_STEP ||

        DEBUG_INTERVAL <= 0
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

    const curveFactor = c =>
        c < 0.0001
            ? 1
            : 1 / (-Math.expm1(-c));

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

    const markerLayer = document.createElement("div");

    Object.assign(markerLayer.style, {
        position: "absolute",
        inset: "0",
        overflow: "hidden",
        pointerEvents: "none"
    });

    mount.appendChild(markerLayer);

    const bounds = mount.getBoundingClientRect();

    let width = Math.max(1, bounds.width);
    let height = Math.max(1, bounds.height);
    let dpr = 1;

    // ========================================
    // バッチテクスチャ
    //
    // 同一テクスチャへの連続書き込みによる
    // GPU待ち時間を軽減するため、
    // 複数のテクスチャを交互に使用する
    // ========================================

    const textureLimit =
        gl.getParameter(gl.MAX_TEXTURE_SIZE);

    const slotsPerRow = Math.floor(
        Math.min(1024, textureLimit) / 2
    );

    const rowWidth = slotsPerRow * 2;

    const batchTextures = [];

    let textureRows = 0;
    let textureIndex = -1;

    let batchPixels = new Float32Array(0);

    let nextSlot = 0;

    // バッチ管理オブジェクトを再利用
    const recycledBatches = [];

    gl.activeTexture(gl.TEXTURE0);

    for (let i = 0; i < BATCH_TEXTURE_COUNT; i++) {

        const tex = gl.createTexture();

        gl.bindTexture(gl.TEXTURE_2D, tex);

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

        batchTextures.push(tex);
    }

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
                textureRows * 2,
                1
            )
        );

        batchPixels = new Float32Array(
            rowWidth * textureRows * 4
        );

        for (const tex of batchTextures) {

            gl.bindTexture(
                gl.TEXTURE_2D,
                tex
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
    }

    ensureTexture(
        Math.min(
            textureLimit,
            Math.ceil(
                INITIAL_BATCH_SLOTS /
                slotsPerRow
            )
        )
    );

    // ========================================
    // Vertex Shader
    //
    // 重力点なし：
    // 累積移動量から位置を計算
    //
    // 重力点あり：
    // 物理演算と描画を統合
    // ========================================

    function vertexSource(integrate) {

        return `#version 300 es

${integrate ? "#define INTEGRATE 1" : ""}

precision highp float;
precision highp int;
precision highp sampler2D;

layout(location=0) in vec4 aState;
layout(location=1) in uint aBatch;

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

    // motion.x = 累積移動量
    // motion.y = 累積速度減衰
    // motion.z = 粒子の直径
    // motion.w = 現在の速度減衰係数

    vec4 motion = texelFetch(
        uBatchData,
        uv,
        0
    );

#ifdef INTEGRATE

    nextState = aState;

#endif

    // 消滅済み粒子は処理を省略

    if (motion.y < 0.0) {

        hideParticle();

        return;
    }

    vec2 pos =
        aState.xy +
        aState.zw * motion.x;

#ifdef INTEGRATE

    vec2 vel =
        aState.zw * motion.y;

    // 新規粒子には生成フレームの
    // 重力演算を適用しない

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

            // 重力範囲外の平方根計算を省略

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

    nextState = vec4(pos, vel);

#endif

    // 画面外の粒子は描画処理を省略
    // 物理演算は維持する

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

        const shader = gl.createShader(type);

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

        const program = gl.createProgram();

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
            gl.getUniformLocation(program, name);

        gl.useProgram(program);

        gl.uniform1i(
            uniform("uBatchData"),
            0
        );

        return {
            program,
            resolution: uniform("uResolution"),
            margin: uniform("uMargin"),
            gravity: uniform("uGravity[0]"),
            count: uniform("uGravityCount"),
            dt: uniform("uDt")
        };
    }

    const freeProgram = makeProgram(false);

    const gravityProgram = makeProgram(true);

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

    gl.disable(gl.RASTERIZER_DISCARD);

    const feedback =
        gl.createTransformFeedback();

    // ========================================
    // 固定サイズGPUページ
    //
    // 従来の巨大なリングバッファを廃止し、
    // 固定サイズの複数バッファに分割する
    //
    // バッファ拡張時に全粒子をコピーしない
    // ========================================

    const PAGE_SIZE = Math.min(
        PAGE_PARTICLES,
        MAX_PARTICLES
    );

    const STATE_BYTES = 16;
    const ID_BYTES = 4;

    const activePages = [];
    const freePages = [];
    const allPages = [];

    let current = 0;
    let serial = 0;
    let liveCount = 0;
    let frameNumber = 0;

    let stagingState = new Float32Array(0);
    let stagingIds = new Uint32Array(0);

    let pageAllocations = 0;
    let drawCalls = 0;
    let submittedParticles = 0;

    // ========================================
    // GPUバッファ生成
    // ========================================

    function makeBuffer(size, usage) {

        const b = gl.createBuffer();

        if (!b) {

            throw new Error(
                "GPU buffer allocation failed."
            );
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, b);

        gl.bufferData(
            gl.ARRAY_BUFFER,
            size,
            usage
        );

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            null
        );

        return b;
    }

    // ========================================
    // VAO生成
    // ========================================

    function makeVAO(state, ids) {

        const vao = gl.createVertexArray();

        gl.bindVertexArray(vao);

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            state
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

    // ========================================
    // GPUページ生成
    // ========================================

    function allocatePage() {

        const states = [

            makeBuffer(
                PAGE_SIZE * STATE_BYTES,
                gl.DYNAMIC_COPY
            ),

            makeBuffer(
                PAGE_SIZE * STATE_BYTES,
                gl.DYNAMIC_COPY
            )
        ];

        const ids = makeBuffer(
            PAGE_SIZE * ID_BYTES,
            gl.DYNAMIC_DRAW
        );

        const page = {
            states,
            ids,

            vaos: [
                makeVAO(states[0], ids),
                makeVAO(states[1], ids)
            ],

            batches: [],
            head: 0,
            end: 0
        };

        allPages.push(page);

        pageAllocations++;

        return page;
    }

    // ========================================
    // 初期ページの事前確保
    // ========================================

    const initialTarget = Math.min(

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

    for (
        let i = 0;
        i < Math.ceil(initialTarget / PAGE_SIZE);
        i++
    ) {

        freePages.push(
            allocatePage()
        );
    }

    // ========================================
    // GPUページの取得・再利用
    // ========================================

    function acquirePage() {

        const page =
            freePages.pop() ||
            allocatePage();

        activePages.push(page);

        return page;
    }

    function recyclePage(page) {

        page.batches.length = 0;

        page.head = 0;
        page.end = 0;

        freePages.push(page);
    }

    // ========================================
    // バッチ管理オブジェクトの再利用
    // ========================================

    function releaseBatch(b) {

        recycledBatches.push(b);
    }

    function acquireBatch() {

        if (recycledBatches.length) {

            return recycledBatches.pop();
        }

        if (
            nextSlot >=
            slotsPerRow * textureLimit
        ) {

            throw new Error(
                "Batch slot limit exceeded."
            );
        }

        return {
            slot: nextSlot++
        };
    }

    // ========================================
    // 消滅済み粒子の管理
    //
    // GPUバッファの再配置やコピーは行わない
    // ========================================

    function expireParticles(now, newCount) {

        const cutoff =
            serial +
            newCount -
            MAX_PARTICLES;

        let kept = 0;

        for (
            let i = 0;
            i < activePages.length;
            i++
        ) {

            const p = activePages[i];

            const list = p.batches;

            for (
                let j = p.head;
                j < list.length;
                j++
            ) {

                const b = list[j];

                // 寿命による消滅

                if (
                    !b.dead &&
                    b.expiry <= now
                ) {

                    b.dead = true;

                    liveCount -= b.count;
                }

                // 最大粒子数を超えた場合は
                // 古い粒子から除外

                const drop = Math.min(

                    b.count,

                    Math.max(
                        0,
                        cutoff - b.serial
                    )
                );

                if (drop > 0) {

                    if (!b.dead) {

                        liveCount -= drop;
                    }

                    b.start += drop;
                    b.serial += drop;
                    b.count -= drop;

                    if (!b.count) {

                        b.dead = true;
                    }
                }
            }

            // ページ先頭の消滅済みバッチを除外

            while (
                p.head < list.length &&
                list[p.head].dead
            ) {

                releaseBatch(
                    list[p.head]
                );

                list[p.head++] = null;
            }

            // ページ末尾の消滅済みバッチを除外

            while (
                list.length > p.head &&
                list[list.length - 1].dead
            ) {

                releaseBatch(
                    list.pop()
                );
            }

            // 生存粒子が存在しないページは再利用

            if (p.head === list.length) {

                recyclePage(p);

                continue;
            }

            const last =
                list[list.length - 1];

            p.end =
                last.start + last.count;

            // CPU側の小さな管理情報だけを整理
            // GPUの粒子データはコピーしない

            if (
                p.head >= 1024 &&
                p.head * 2 >= list.length
            ) {

                list.copyWithin(0, p.head);

                list.length -= p.head;

                p.head = 0;
            }

            activePages[kept++] = p;
        }

        activePages.length = kept;
    }

    // ========================================
    // フレーム時間管理
    //
    // 実時間と映像内時間を分離する
    //
    // 直近のフレーム時間の中央値を求め、
    // 突発的に長いフレームの影響を抑える
    // ========================================

    let previousWall = performance.now();

    let visualTime = 0;

    let historyCount = 0;
    let historyIndex = 0;

    const history = new Float64Array(
        FRAME_HISTORY_SIZE
    );

    const sorted = new Float64Array(
        FRAME_HISTORY_SIZE
    );

    function frameStep(raw) {

        if (raw <= 0) {

            return 0;
        }

        // タブ切り替えなどで長時間停止した場合
        // 停止期間を一気に進めない

        if (raw > PAUSE_GAP) {

            historyCount = 0;
            historyIndex = 0;

            return 0;
        }

        if (!FRAME_SMOOTHING_ENABLED) {

            return Math.min(
                raw,
                MAX_VISUAL_STEP
            );
        }

        // 直近のフレーム時間を記録

        history[historyIndex] = raw;

        historyIndex = (
            historyIndex + 1
        ) % FRAME_HISTORY_SIZE;

        historyCount = Math.min(
            historyCount + 1,
            FRAME_HISTORY_SIZE
        );

        // 一時配列を新規生成せず
        // 挿入ソートで中央値を計算

        for (
            let i = 0;
            i < historyCount;
            i++
        ) {

            const v = history[i];

            let j = i - 1;

            while (
                j >= 0 &&
                sorted[j] > v
            ) {

                sorted[j + 1] = sorted[j];

                j--;
            }

            sorted[j + 1] = v;
        }

        const typical =
            sorted[
                Math.floor(historyCount / 2)
            ];

        // 一時的なフレーム詰まりによって
        // 移動量が極端に増えないよう制限

        return Math.min(

            raw,

            typical * FRAME_SPIKE_RATIO,

            MAX_VISUAL_STEP
        );
    }

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

        const mod = (

            Math.sin(

                2 *
                Math.PI *
                COLOR_LFO_FREQ_DRIFT *
                now

            ) + 1

        ) * 0.5;

        const freq =

            COLOR_LFO_FREQ_MIN +

            (
                COLOR_LFO_FREQ_MAX -
                COLOR_LFO_FREQ_MIN
            ) * mod;

        colorLfoPhase = (

            colorLfoPhase +

            2 *
            Math.PI *
            freq *
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

    const gravityData = new Float32Array(
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

        const strength = randomBetween(

            GRAVITY_STRENGTH_MIN,

            GRAVITY_STRENGTH_MAX

        ) * volumeFactor(waveform);

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

            const j = count * 4;

            gravityData[j] = x;

            gravityData[j + 1] = y;

            gravityData[j + 2] =
                p.radius / 100 * base;

            gravityData[j + 3] =
                strength / 100 * height;

            if (p.marker) {

                p.marker.style.left =
                    `${x}px`;

                p.marker.style.top =
                    `${y}px`;

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
    //
    // 固定サイズページの末尾に追加する
    // ページをまたぐ場合は分割する
    // ========================================

    function spawnParticles(
        waveform,
        attack,
        now,
        count
    ) {

        if (!count) {

            return;
        }

        if (stagingState.length < count * 4) {

            stagingState =
                new Float32Array(count * 4);
        }

        if (stagingIds.length < count) {

            stagingIds =
                new Uint32Array(count);
        }

        const cy = height * 0.5;

        // 粒子の初期座標・速度を生成

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

            stagingState[j + 2] = 0;

            stagingState[j + 3] =

                sample /

                SPEED_DIVISOR *

                SPEED_MULTIPLIER *

                60;
        }

        let offset = 0;

        while (offset < count) {

            let p =
                activePages[
                    activePages.length - 1
                ];

            if (!p || p.end === PAGE_SIZE) {

                p = acquirePage();
            }

            const n = Math.min(

                count - offset,

                PAGE_SIZE - p.end
            );

            const b = acquireBatch();

            b.start = p.end;
            b.count = n;
            b.serial = serial;

            b.born = now;
            b.frame = frameNumber;

            b.attack = attack;
            b.target = colorLfoValue;

            b.expiry = now + (

                attack

                    ? attackLife

                    : normalLife
            );

            b.distance = 0;
            b.damping = 1;
            b.dead = false;

            stagingIds.fill(
                b.slot,
                0,
                n
            );

            // 座標・速度データ転送

            gl.bindBuffer(
                gl.ARRAY_BUFFER,
                p.states[current]
            );

            gl.bufferSubData(
                gl.ARRAY_BUFFER,
                p.end * STATE_BYTES,
                stagingState,
                offset * 4,
                n * 4
            );

            // バッチID転送

            gl.bindBuffer(
                gl.ARRAY_BUFFER,
                p.ids
            );

            gl.bufferSubData(
                gl.ARRAY_BUFFER,
                p.end * ID_BYTES,
                stagingIds,
                0,
                n
            );

            p.batches.push(b);

            p.end += n;

            serial += n;

            liveCount += n;

            offset += n;
        }

        gl.bindBuffer(
            gl.ARRAY_BUFFER,
            null
        );
    }

    // ========================================
    // バッチ共通演算
    //
    // 同時に生成された粒子の
    // 色・透明度・サイズなどを共有する
    //
    // GPU転送先テクスチャを毎フレーム変更
    // ========================================

    function prepareBatches(
        now,
        dt,
        integrate
    ) {

        const rows = Math.max(

            1,

            Math.ceil(
                nextSlot / slotsPerRow
            )
        );

        ensureTexture(rows);

        const dn =
            Math.exp(normalRate * dt);

        const da =
            Math.exp(attackRate * dt);

        for (const p of activePages) {

            for (
                let i = p.head;
                i < p.batches.length;
                i++
            ) {

                const b = p.batches[i];

                const j = b.slot * 8;

                // 消滅済みバッチ

                if (b.dead) {

                    batchPixels[j + 1] = -1;

                    continue;
                }

                const a = b.attack;

                const newborn =
                    b.frame === frameNumber;

                const damping =
                    a ? da : dn;

                // =================================
                // 重力点が存在しない場合
                // =================================

                if (!integrate && !newborn) {

                    b.damping *= damping;

                    b.distance +=
                        b.damping * dt;
                }

                // =================================
                // 透明度
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
                // サイズ
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

                // サイズが一定の場合は
                // サイズ変化の計算を省略

                if (startSize !== endSize) {

                    let progress =

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

                        progress =

                            -Math.expm1(
                                -curve * progress
                            ) *

                            (
                                a

                                    ? attackCurveFactor

                                    : normalCurveFactor
                            );
                    }

                    size +=

                        (endSize - startSize) *

                        progress;
                }

                const diameter = Math.max(
                    0,
                    size * dpr
                );

                // =================================
                // 色
                // 通常：赤 → 白 → シアン
                // アタック：赤固定
                // =================================

                const w =

                    a

                        ? 0

                        : (

                            1 -

                            Math.exp(
                                colorRate * age
                            )

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
                // テクセル1：移動・サイズ
                // =================================

                batchPixels[j] =
                    b.distance;

                batchPixels[j + 1] =
                    b.damping;

                batchPixels[j + 2] =
                    diameter;

                batchPixels[j + 3] =

                    integrate && !newborn

                        ? damping

                        : -1;

                // =================================
                // テクセル2：色・透明度
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

                // 重力演算時は状態をGPUに保存するため
                // 累積係数をリセット

                if (integrate) {

                    b.distance = 0;

                    b.damping = 1;
                }
            }
        }

        // ====================================
        // テクスチャをローテーション
        // ====================================

        textureIndex = (

            textureIndex + 1

        ) % BATCH_TEXTURE_COUNT;

        gl.activeTexture(gl.TEXTURE0);

        gl.bindTexture(

            gl.TEXTURE_2D,

            batchTextures[textureIndex]
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
    // GPU描画
    //
    // 重力なし：描画のみ
    // 重力あり：物理演算と描画を統合
    // ========================================

    function render(
        gravityCount,
        dt,
        integrate
    ) {

        gl.clear(
            gl.COLOR_BUFFER_BIT
        );

        drawCalls = 0;
        submittedParticles = 0;

        if (!activePages.length) {

            return;
        }

        const p =

            integrate

                ? gravityProgram

                : freeProgram;

        const target =
            1 - current;

        gl.useProgram(p.program);

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

        // ====================================
        // ページ単位で描画
        // 生成順・透過合成順を維持
        // ====================================

        for (const page of activePages) {

            const start =
                page.batches[page.head].start;

            const count =
                page.end - start;

            if (!count) {

                continue;
            }

            gl.bindVertexArray(
                page.vaos[current]
            );

            if (integrate) {

                gl.bindBufferRange(

                    gl.TRANSFORM_FEEDBACK_BUFFER,

                    0,

                    page.states[target],

                    start * STATE_BYTES,

                    count * STATE_BYTES
                );

                gl.beginTransformFeedback(
                    gl.POINTS
                );
            }

            gl.drawArrays(

                gl.POINTS,

                start,

                count
            );

            if (integrate) {

                gl.endTransformFeedback();
            }

            drawCalls++;

            submittedParticles += count;
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

        const b =
            mount.getBoundingClientRect();

        width = Math.max(
            1,
            b.width
        );

        height = Math.max(
            1,
            b.height
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

        for (const p of [
            freeProgram,
            gravityProgram
        ]) {

            gl.useProgram(p.program);

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
    // パフォーマンス診断
    //
    // DEBUG_PERFORMANCE = true の場合のみ
    // 診断情報をコンソールに出力する
    //
    // 対応GPUでは非同期GPU時間計測も行う
    // ========================================

    const timerExt =

        DEBUG_PERFORMANCE

            ? gl.getExtension(
                "EXT_disjoint_timer_query_webgl2"
            )

            : null;

    let pendingQuery = null;

    let gpuMs = null;

    let reportAt = performance.now();

    let reportFrames = 0;

    let sumFrame = 0;
    let maxFrame = 0;
    let sumCPU = 0;

    let slowFrames = 0;

    let lastAllocations =
        pageAllocations;

    // ========================================
    // GPU処理時間計測
    // ========================================

    function beginTimer() {

        if (!timerExt) {

            return false;
        }

        if (
            pendingQuery &&

            gl.getQueryParameter(
                pendingQuery,
                gl.QUERY_RESULT_AVAILABLE
            )
        ) {

            if (
                !gl.getParameter(
                    timerExt.GPU_DISJOINT_EXT
                )
            ) {

                gpuMs =

                    gl.getQueryParameter(
                        pendingQuery,
                        gl.QUERY_RESULT
                    ) / 1e6;

            } else {

                gpuMs = null;
            }

            gl.deleteQuery(
                pendingQuery
            );

            pendingQuery = null;
        }

        // 計測負荷を抑えるため
        // 30フレームにつき1回だけ計測

        if (
            pendingQuery ||
            frameNumber % 30 !== 0
        ) {

            return false;
        }

        pendingQuery =
            gl.createQuery();

        if (!pendingQuery) {

            return false;
        }

        gl.beginQuery(
            timerExt.TIME_ELAPSED_EXT,
            pendingQuery
        );

        return true;
    }

    // ========================================
    // 診断結果の出力
    // ========================================

    function report(raw, cpu) {

        if (!DEBUG_PERFORMANCE) {

            return;
        }

        reportFrames++;

        sumFrame += raw * 1000;

        maxFrame = Math.max(
            maxFrame,
            raw * 1000
        );

        sumCPU += cpu;

        if (raw > 1 / 30) {

            slowFrames++;
        }

        const t = performance.now();

        if (
            t - reportAt <
            DEBUG_INTERVAL * 1000
        ) {

            return;
        }

        console.log(
            "[Particle Visualizer]",
            {

                fps: Math.round(

                    1000 *
                    reportFrames /

                    Math.max(
                        sumFrame,
                        0.001
                    )
                ),

                averageFrameMs: +(
                    sumFrame / reportFrames
                ).toFixed(2),

                maxFrameMs:
                    +maxFrame.toFixed(2),

                slowFrames,

                averageCPUMs: +(
                    sumCPU / reportFrames
                ).toFixed(2),

                gpuDrawMs:

                    gpuMs === null

                        ? null

                        : +gpuMs.toFixed(2),

                liveParticles:
                    liveCount,

                submittedParticles,

                gravityPoints:
                    gravityPoints.length,

                drawCalls,

                allocatedPages:
                    allPages.length,

                newPages:

                    pageAllocations -

                    lastAllocations,

                bufferCopies: 0
            }
        );

        reportAt = t;

        reportFrames = 0;

        sumFrame = 0;
        maxFrame = 0;
        sumCPU = 0;

        slowFrames = 0;

        lastAllocations =
            pageAllocations;
    }

    // 初期化処理の時間を
    // 最初のフレームに含めない

    previousWall = performance.now();

    // ========================================
    // メインループ
    // ========================================

    return {

        update(audio, dt) {

            if (gl.isContextLost()) {

                return;
            }

            // =================================
            // フレーム時間の取得
            // =================================

            const wall =
                performance.now();

            const raw = Math.max(

                0,

                (wall - previousWall) / 1000
            );

            previousWall = wall;

            frameNumber++;

            // =================================
            // フレーム時間の安定化
            // =================================

            const step =
                frameStep(raw);

            visualTime += step;

            // すべての映像内時間を統一

            const now = visualTime;

            // =================================
            // Color LFO
            // =================================

            updateColorLfo(
                now,
                step
            );

            // =================================
            // アタック検出
            // =================================

            const attack = Boolean(
                audio?.attackTriggered
            );

            const waveform =
                audio?.waveform;

            if (
                attack &&
                !previousAttack
            ) {

                spawnGravity(
                    now,
                    waveform
                );
            }

            previousAttack = attack;

            // =================================
            // 重力点更新
            // =================================

            const gravityCount =
                updateGravity(now);

            // =================================
            // 新規生成粒子数
            // =================================

            const count =

                waveform &&
                waveform.length >= 2

                    ? Math.min(

                        MAX_PARTICLES,

                        Math.ceil(
                            width / PARTICLE_SPACING
                        )
                    )

                    : 0;

            // =================================
            // 消滅済み粒子の除外
            // =================================

            expireParticles(
                now,
                count
            );

            // =================================
            // 新規粒子生成
            // =================================

            spawnParticles(
                waveform,
                attack,
                now,
                count
            );

            // =================================
            // 重力演算の必要性を判定
            // =================================

            const integrate =

                gravityCount > 0 &&

                step > 0;

            // =================================
            // バッチ共通データ準備
            // =================================

            if (activePages.length) {

                prepareBatches(
                    now,
                    step,
                    integrate
                );
            }

            // =================================
            // GPU描画
            // =================================

            const timing =
                beginTimer();

            render(
                gravityCount,
                step,
                integrate
            );

            if (timing) {

                gl.endQuery(
                    timerExt.TIME_ELAPSED_EXT
                );
            }

            // =================================
            // パフォーマンス診断
            // =================================

            if (DEBUG_PERFORMANCE) {

                report(

                    raw,

                    performance.now() - wall
                );
            }
        },

        // ====================================
        // 終了処理
        // ====================================

        dispose() {

            observer.disconnect();

            for (const p of gravityPoints) {

                p.marker?.remove();
            }

            gravityPoints.length = 0;

            if (pendingQuery) {

                gl.deleteQuery(
                    pendingQuery
                );
            }

            gl.deleteTransformFeedback(
                feedback
            );

            // すべてのGPUページを解放

            for (const p of allPages) {

                for (const vao of p.vaos) {

                    gl.deleteVertexArray(vao);
                }

                for (const b of p.states) {

                    gl.deleteBuffer(b);
                }

                gl.deleteBuffer(p.ids);
            }

            // すべてのバッチテクスチャを解放

            for (const t of batchTextures) {

                gl.deleteTexture(t);
            }

            gl.deleteProgram(
                freeProgram.program
            );

            gl.deleteProgram(
                gravityProgram.program
            );

            activePages.length = 0;
            freePages.length = 0;
            allPages.length = 0;

            recycledBatches.length = 0;

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