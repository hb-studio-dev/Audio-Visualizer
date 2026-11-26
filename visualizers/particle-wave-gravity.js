export function createVisualizer(mount) {

    // ========================================
    // パーティクル設定
    // ========================================

    // 粒子の生成間隔（px）
    // 増加：粒子の密度が下がり、処理が軽くなる
    // 減少：粒子の密度が上がり、処理が重くなる
    // 範囲：0より大きい数値
    const PARTICLE_SPACING = 1;


    // 通常粒子の生成時の直径（px）
    // 増加：生成直後の粒子が大きくなる
    // 減少：生成直後の粒子が小さくなる
    // 範囲：0以上を推奨（0で非表示、上限はGPU依存）
    const NORMAL_INITIAL_SIZE = 1.5;

    // 通常粒子の寿命末期の直径（px）
    // 増加：消滅直前の粒子が大きくなる
    // 減少：消滅直前の粒子が小さくなる
    // 範囲：0以上を推奨（0で非表示、上限はGPU依存）
    const NORMAL_FINAL_SIZE = 1.5;

    // 通常粒子のサイズ変化のカーブ
    // 増加：生成直後から急速に最終サイズへ近づく
    // 減少：寿命全体を使って直線的にサイズが変化する
    // 0：直線的な変化
    // 範囲：0以上を推奨
    // INITIAL_SIZEとFINAL_SIZEが同じ場合は効果なし
    const NORMAL_SIZE_CURVE = 3.0;


    // アタック粒子の生成時の直径（px）
    // 増加：生成直後の粒子が大きくなる
    // 減少：生成直後の粒子が小さくなる
    // 範囲：0以上を推奨（0で非表示、上限はGPU依存）
    const ATTACK_INITIAL_SIZE = 3.0;

    // アタック粒子の寿命末期の直径（px）
    // 増加：消滅直前の粒子が大きくなる
    // 減少：消滅直前の粒子が小さくなる
    // 範囲：0以上を推奨（0で非表示、上限はGPU依存）
    const ATTACK_FINAL_SIZE = 3;

    // アタック粒子のサイズ変化のカーブ
    // 増加：生成直後から急速に最終サイズへ近づく
    // 減少：寿命全体を使って直線的にサイズが変化する
    // 0：直線的な変化
    // 範囲：0以上を推奨
    // INITIAL_SIZEとFINAL_SIZEが同じ場合は効果なし
    const ATTACK_SIZE_CURVE = 50.0;


    // 通常粒子の初期不透明度
    // 増加：粒子が濃くなり、寿命も長くなる
    // 減少：粒子が薄くなり、寿命も短くなる
    // 0：完全透明
    // 1：完全不透明
    // 範囲：0〜1を推奨
    const NORMAL_INITIAL_ALPHA = 0.5;

    // アタック粒子の初期不透明度
    // 増加：粒子が濃くなり、寿命も長くなる
    // 減少：粒子が薄くなり、寿命も短くなる
    // 0：完全透明
    // 1：完全不透明
    // 範囲：0〜1を推奨
    const ATTACK_INITIAL_ALPHA = 1.0;


    // 通常粒子の不透明度の残存率
    // 描画内時間の1/60秒ごとに適用される倍率
    // 増加：透明になるまでの時間が長くなる
    // 減少：透明になるまでの時間が短くなる
    // 1：時間経過による透明度の減衰なし
    // 範囲：0より大きく、1以下
    // 1に近づけるほど粒子数が増え、負荷も増えやすい
    const NORMAL_ALPHA_DECAY = 0.998;

    // アタック粒子の不透明度の残存率
    // 描画内時間の1/60秒ごとに適用される倍率
    // 増加：透明になるまでの時間が長くなる
    // 減少：透明になるまでの時間が短くなる
    // 1：時間経過による透明度の減衰なし
    // 範囲：0より大きく、1以下
    const ATTACK_ALPHA_DECAY = 0.999;

    // 粒子が消滅する不透明度のしきい値
    // 増加：早く消滅し、処理が軽くなる
    // 減少：薄くなった粒子も長時間残る
    // 範囲：0より大きく、1未満
    // 初期不透明度より小さくする必要がある
    const PARTICLE_MIN_ALPHA = 0.001;


    // 通常粒子の速度の半減期（秒）
    // 増加：速度が維持され、慣性が長く残る
    // 減少：速度が急速に減衰し、早く停止に近づく
    // 10：10秒経過すると速度が半分になる
    // 範囲：0より大きい数値
    // 内部計算上の最小値は0.0001秒
    const NORMAL_SPEED_HALF_LIFE = 10.0;

    // アタック粒子の速度の半減期（秒）
    // 増加：速度が維持され、慣性が長く残る
    // 減少：速度が急速に減衰し、早く停止に近づく
    // 5：5秒経過すると速度が半分になる
    // 範囲：0より大きい数値
    // 内部計算上の最小値は0.0001秒
    const ATTACK_SPEED_HALF_LIFE = 5.0;


    // 通常粒子の色変化の半減期（秒）
    // 目標色までの残りの変化量が半分になる時間
    // 増加：赤から目標色への変化がゆっくりになる
    // 減少：赤から目標色への変化が速くなる
    // 範囲：0より大きい数値
    // 内部計算上の最小値は0.0001秒
    const NORMAL_COLOR_HALF_LIFE = 2.0;


    // ========================================
    // Color LFO
    // ========================================

    // 通常粒子の目標色を周期的に変化させる機能
    // true：赤〜白〜シアンの間で目標色が変化する
    // false：目標色をシアンに固定する
    // 範囲：true / false
    // アタック粒子は常に赤
    const COLOR_LFO_ENABLED = true;

    // Color LFOの最低周波数（Hz）
    // 増加：最も遅いときの色の周期変化が速くなる
    // 減少：最も遅いときの色の周期変化が遅くなる
    // 0.001Hz：1周期1000秒
    // 範囲：0以上、COLOR_LFO_FREQ_MAX以下
    const COLOR_LFO_FREQ_MIN = 0.001;

    // Color LFOの最高周波数（Hz）
    // 増加：最も速いときの色の周期変化が速くなる
    // 減少：最も速いときの色の周期変化が遅くなる
    // 0.01Hz：1周期100秒
    // 範囲：COLOR_LFO_FREQ_MIN以上
    const COLOR_LFO_FREQ_MAX = 0.01;

    // Color LFOの周波数自体を変化させる周波数（Hz）
    // 増加：最低周波数と最高周波数の間を速く往復する
    // 減少：最低周波数と最高周波数の間をゆっくり往復する
    // 0：最低周波数と最高周波数の中間値に固定
    // 範囲：0以上
    const COLOR_LFO_FREQ_DRIFT = 0.001;

    // Color LFOの初期位相（ラジアン）
    // 増減：色の周期変化の開始位置が変わる
    // 0：白（シアン方向へ変化）
    // Math.PI / 2：シアン
    // Math.PI：白（赤方向へ変化）
    // Math.PI * 1.5：赤
    // 範囲：任意の有限数値
    // 通常は0〜Math.PI * 2
    const COLOR_LFO_PHASE_OFFSET = 0;


    // 波形から粒子の初期速度を求める際の除数
    // 増加：粒子の初期速度が遅くなる
    // 減少：粒子の初期速度が速くなる
    // 負数：上下の移動方向が反転する
    // 範囲：0以外の有限数値
    // 通常は正数を推奨
    const SPEED_DIVISOR = 0.05;

    // 粒子の初期速度に対する倍率
    // 増加：粒子の初期速度が速くなる
    // 減少：粒子の初期速度が遅くなる
    // 0：波形による初期速度なし
    // 1：等倍
    // 負数：上下の移動方向が反転する
    // 範囲：0以上を推奨（負数も指定可能）
    // 注意：速度の減衰率ではない
    const SPEED_MULTIPLIER = 0.99;


    // ========================================
    // 重力点設定
    // ========================================

    // 全帯域のアタックによる重力点生成機能
    // true：有効
    // false：無効
    // 範囲：true / false
    const GRAVITY_ENABLED = true;

    // 同時に存在できる重力点の最大数
    // 増加：複数の重力が重なり、動きが複雑になる
    // 減少：重力の重なりが減り、処理が軽くなりやすい
    // 上限に達すると最も古い重力点が削除される
    // 範囲：1以上の整数
    // 上限はGPUの頂点シェーダーのuniform容量に依存
    const GRAVITY_MAX_POINTS = 16;


    // 全帯域アタック時の重力点生成・上書き確率
    // 増加：重力点が頻繁に生成される
    // 減少：重力点が生成されにくくなる
    // 0.0：0%
    // 0.5：50%
    // 1.0：100%
    // 範囲：0〜1
    const GRAVITY_SPAWN_PROBABILITY = 1;


    // 移動する重力点の最低速度
    // 単位：移動方向の画面寸法に対する%/秒
    // 増加：遅い重力点も速く移動するようになる
    // 減少：ゆっくり移動する重力点が生成されやすい
    // 範囲：0以上、GRAVITY_SPEED_MAX以下
    const GRAVITY_SPEED_MIN = 0;

    // 移動する重力点の最高速度
    // 単位：移動方向の画面寸法に対する%/秒
    // 増加：速く移動する重力点が生成されやすい
    // 減少：重力点の移動が全体的に遅くなる
    // 範囲：GRAVITY_SPEED_MIN以上
    const GRAVITY_SPEED_MAX = 2;

    // 重力点が静止状態で生成される確率
    // 増加：静止する重力点が増える
    // 減少：移動する重力点が増える
    // 0：すべて移動扱い
    // 1：すべて静止
    // 範囲：0〜1
    const GRAVITY_STATIONARY_PROBABILITY = 0.5;


    // 重力点の最低加速度（音量補正前）
    // 単位：画面高さに対する%/秒²
    // 増加：弱い重力点でも強く引き寄せる
    // 減少：弱い重力点が生成されやすくなる
    // 範囲：0以上、GRAVITY_STRENGTH_MAX_MIN以下
    const GRAVITY_STRENGTH_MIN = 1;

    // 重力点の最高加速度がLFOで変化する際の最小値（音量補正前）
    // 単位：画面高さに対する%/秒²
    // 増加：LFOが最も弱いときも強い重力点が生成されやすくなる
    // 減少：LFOが最も弱いときの重力点の強さの上限が下がる
    // 範囲：GRAVITY_STRENGTH_MIN以上、GRAVITY_STRENGTH_MAX_MAX以下
    const GRAVITY_STRENGTH_MAX_MIN = 3;

    // 重力点の最高加速度がLFOで変化する際の最大値（音量補正前）
    // 単位：画面高さに対する%/秒²
    // 増加：LFOが最も強いときにより強い重力点が生成されやすくなる
    // 減少：LFOが最も強いときの重力点の強さの上限が下がる
    // 範囲：GRAVITY_STRENGTH_MAX_MIN以上
    // 実際の強さは音量・距離・時間経過でも変化する
    const GRAVITY_STRENGTH_MAX_MAX = 30;

    // 重力強度LFOの最低周波数（Hz）
    // 増加：最も遅いときの周期が短くなる
    // 減少：最も遅いときの周期が長くなる
    // 範囲：0以上、GRAVITY_STRENGTH_LFO_FREQ_MAX以下
    const GRAVITY_STRENGTH_LFO_FREQ_MIN = 0.002;

    // 重力強度LFOの最高周波数（Hz）
    // 増加：最も速いときの周期が短くなる
    // 減少：最も速いときの周期が長くなる
    // 範囲：GRAVITY_STRENGTH_LFO_FREQ_MIN以上
    const GRAVITY_STRENGTH_LFO_FREQ_MAX = 0.01;

    // 重力強度LFOの周波数自体を変化させる周波数（Hz）
    // 増加：最低周波数と最高周波数の間を速く往復する
    // 減少：最低周波数と最高周波数の間をゆっくり往復する
    // 0：最低周波数と最高周波数の中間値に固定
    // 範囲：0以上
    const GRAVITY_STRENGTH_LFO_FREQ_DRIFT = 0.001;


    // アタック音量が重力の強さに与える影響度
    // 増加：小さい音と大きい音で重力の強さに差が出る
    // 減少：音量に関係なく一定の強さに近づく
    // 0：音量による補正なし（1倍）
    // 0.5：基準の0.5〜1.5倍
    // 0.8：基準の0.2〜1.8倍
    // 1：基準の0〜2倍
    // 範囲：0〜1
    const GRAVITY_VOLUME_INFLUENCE = 0.8;

    // 重力の音量補正が最大になる基準音量（RMS）
    // 増加：同じ音量でも重力が弱くなる
    // 減少：小さい音量でも重力が強くなりやすい
    // この値以上の音量は補正が最大値で固定される
    // 範囲：0より大きい数値
    // 通常は1以下を目安とする
    const GRAVITY_VOLUME_REFERENCE = 0.25;


    // 重力が作用する最小半径
    // 単位：画面の短辺に対する%
    // 増加：小さい重力点も広範囲に作用する
    // 減少：局所的に作用する重力点が生成されやすい
    // 100：画面の短辺と同じ長さの半径
    // 範囲：0より大きく、GRAVITY_RADIUS_MAX以下
    // 100以上も指定可能
    const GRAVITY_RADIUS_MIN = 70;

    // 重力が作用する最大半径
    // 単位：画面の短辺に対する%
    // 増加：より広範囲の粒子に影響する
    // 減少：重力の影響範囲が狭くなる
    // 範囲：GRAVITY_RADIUS_MIN以上
    // 100以上も指定可能
    // 半径の外側にある粒子には重力が作用しない
    const GRAVITY_RADIUS_MAX = 200;


    // 重力の時間減衰率（1/秒）
    // 増加：重力が早く弱まり、早く消滅する
    // 減少：重力が長時間維持される
    // 1 / この値：強度が初期値の約36.8%になる秒数
    // 範囲：0より大きい数値
    const GRAVITY_DECAY_RATE = 0.07;

    // 重力の時間減衰カーブ
    // 増加：初期の減衰が緩やかになり、後半で急速に弱まる
    // 減少：初期に急速に弱まり、後半は緩やかに弱まる
    // 1：通常の指数関数的減衰
    // 1未満：初期の減衰が急になる
    // 1より大きい：初期の減衰が緩やかになる
    // 範囲：0より大きい数値
    // 1 / GRAVITY_DECAY_RATE 秒を境に増減の効果が逆転
    const GRAVITY_DECAY_CURVE = 1.8;

    // 重力点が消滅する強度のしきい値
    // 増加：重力点が早く消滅する
    // 減少：弱くなった重力点も長く残る
    // 範囲：0より大きい数値
    // 生成時の強度以上にすると即座に消滅する
    const GRAVITY_ZERO_THRESHOLD = 0.001;


    // 重力点の中心を示すマーカーの表示
    // true：重力点の位置を表示する
    // false：重力点の位置を表示しない
    // 範囲：true / false
    // 重力の物理演算自体には影響しない
    const GRAVITY_SHOW_MARKERS = false;

    // 重力点マーカーの直径（px）
    // 増加：マーカーが大きくなる
    // 減少：マーカーが小さくなる
    // 範囲：0以上を推奨
    // GRAVITY_SHOW_MARKERSがtrueの場合のみ有効
    const GRAVITY_MARKER_SIZE = 3;

    // 重力点マーカーの色
    // 色指定を変更することでマーカーの色が変わる
    // 範囲：有効なCSSカラー
    // 例："#ff0000"、"#ffffff"、"red"
    const GRAVITY_MARKER_COLOR = "#ff4545";


    // ========================================
    // Low Attackによる上下左右スライス
    // ========================================

    // 低域アタックによるスライス機能
    // true：有効
    // false：無効
    // 範囲：true / false
    // 重力点の生成機能とは独立している
    const ATTACK_SHIFT_ENABLED = true;


    // 低域アタック時のスライス発生確率
    // 増加：スライスが頻繁に発生する
    // 減少：スライスが発生しにくくなる
    // 0.0：0%
    // 0.5：50%
    // 1.0：100%（抽選に毎回成功）
    // 範囲：0〜1
    const ATTACK_SHIFT_PROBABILITY = 1;


    // 左右に移動する横帯の最小高さ
    // 単位：画面高さに対する%
    // 増加：細いスライスも太くなる
    // 減少：細いスライスが発生しやすくなる
    // 範囲：0より大きく、ATTACK_SHIFT_MAX_HEIGHT以下
    const ATTACK_SHIFT_MIN_HEIGHT = 3;

    // 左右に移動する横帯の最大高さ
    // 単位：画面高さに対する%
    // 増加：太いスライスが発生しやすくなる
    // 減少：スライスが全体的に細くなる
    // 範囲：ATTACK_SHIFT_MIN_HEIGHT以上、100以下
    const ATTACK_SHIFT_MAX_HEIGHT = 10;


    // 上下に移動する縦帯の最小幅
    // 単位：画面幅に対する%
    // 増加：細いスライスも太くなる
    // 減少：細いスライスが発生しやすくなる
    // 範囲：0より大きく、ATTACK_SHIFT_MAX_WIDTH以下
    const ATTACK_SHIFT_MIN_WIDTH = 3;

    // 上下に移動する縦帯の最大幅
    // 単位：画面幅に対する%
    // 増加：太いスライスが発生しやすくなる
    // 減少：スライスが全体的に細くなる
    // 範囲：ATTACK_SHIFT_MIN_WIDTH以上、100以下
    const ATTACK_SHIFT_MAX_WIDTH = 10;


    // ========================================
    // X軸：左右方向へのスライス
    // ========================================

    // 左右スライスが最大になる基準音量（RMS）
    // 位置のズレと慣性の両方に影響する
    // 増加：同じ音量でもスライスが弱くなる
    // 減少：小さい音量でも強いスライスが発生する
    // この値以上の音量では効果が最大になる
    // 範囲：0より大きい有限数値
    // 通常は1以下を目安とする
    const ATTACK_SHIFT_X_VOLUME_REFERENCE = 0.1;

    // 左右方向への瞬間的な位置ズレの最大量
    // 単位：画面幅に対する%
    // 増加：瞬間的に大きく左右へズレる
    // 減少：位置のズレが小さくなる
    // 0：位置のズレのみ無効（慣性は維持）
    // 範囲：0以上の有限数値
    // 100以上も指定可能
    const ATTACK_SHIFT_X_MAX_DISTANCE = 2;

    // 左右方向の位置ズレに対する音量カーブ
    // 増加：小〜中音量で位置がズレにくくなる
    // 減少：小さい音量でも位置がズレやすくなる
    // 1未満：小さい音量を強調
    // 1：音量に比例
    // 1より大きい：大きい音量を選択的に強調
    // 範囲：0より大きい有限数値
    // 基準音量以上ではカーブの値による違いはない
    const ATTACK_SHIFT_X_VOLUME_CURVE = 0.5;

    // 左右方向に追加される慣性速度の最大値
    // 単位：画面幅に対する%/秒
    // 増加：スライス後の左右方向への移動が強くなる
    // 減少：スライス後の左右方向への移動が弱くなる
    // 0：慣性の追加のみ無効（位置のズレは維持）
    // 範囲：0以上の有限数値
    const ATTACK_SHIFT_X_MAX_INERTIA_SPEED = 30;

    // 左右方向の慣性速度に対する音量カーブ
    // 増加：小〜中音量で慣性が発生しにくくなる
    // 減少：小さい音量でも強い慣性が発生する
    // 1未満：小さい音量を強調
    // 1：音量に比例
    // 1より大きい：大きい音量を選択的に強調
    // 範囲：0より大きい有限数値
    // 基準音量以上ではカーブの値による違いはない
    const ATTACK_SHIFT_X_INERTIA_VOLUME_CURVE = 5.0;


    // ========================================
    // Y軸：上下方向へのスライス
    // ========================================

    // 上下スライスが最大になる基準音量（RMS）
    // 位置のズレと慣性の両方に影響する
    // 増加：同じ音量でもスライスが弱くなる
    // 減少：小さい音量でも強いスライスが発生する
    // この値以上の音量では効果が最大になる
    // 範囲：0より大きい有限数値
    // 通常は1以下を目安とする
    const ATTACK_SHIFT_Y_VOLUME_REFERENCE = 0.1;

    // 上下方向への瞬間的な位置ズレの最大量
    // 単位：画面高さに対する%
    // 増加：瞬間的に大きく上下へズレる
    // 減少：位置のズレが小さくなる
    // 0：位置のズレのみ無効（慣性は維持）
    // 範囲：0以上の有限数値
    // 100以上も指定可能
    const ATTACK_SHIFT_Y_MAX_DISTANCE = 2;

    // 上下方向の位置ズレに対する音量カーブ
    // 増加：小〜中音量で位置がズレにくくなる
    // 減少：小さい音量でも位置がズレやすくなる
    // 1未満：小さい音量を強調
    // 1：音量に比例
    // 1より大きい：大きい音量を選択的に強調
    // 範囲：0より大きい有限数値
    // 基準音量以上ではカーブの値による違いはない
    const ATTACK_SHIFT_Y_VOLUME_CURVE = 0.3;

    // 上下方向に追加される慣性速度の最大値
    // 単位：画面高さに対する%/秒
    // 増加：スライス後の上下方向への移動が強くなる
    // 減少：スライス後の上下方向への移動が弱くなる
    // 0：慣性の追加のみ無効（位置のズレは維持）
    // 範囲：0以上の有限数値
    const ATTACK_SHIFT_Y_MAX_INERTIA_SPEED = 30;

    // 上下方向の慣性速度に対する音量カーブ
    // 増加：小〜中音量で慣性が発生しにくくなる
    // 減少：小さい音量でも強い慣性が発生する
    // 1未満：小さい音量を強調
    // 1：音量に比例
    // 1より大きい：大きい音量を選択的に強調
    // 範囲：0より大きい有限数値
    // 基準音量以上ではカーブの値による違いはない
    const ATTACK_SHIFT_Y_INERTIA_VOLUME_CURVE = 5.0;


    // ========================================
    // 描画設定
    // ========================================

    // 同時に管理するパーティクル数の上限
    // 増加：より多くの粒子を保持できるが、負荷が増え得る
    // 減少：古い粒子が早く削除され、負荷が軽くなり得る
    // 上限に達した場合は古い粒子から削除する
    // 範囲：1〜2147483647の整数
    // 実用的な上限はGPU性能・メモリ容量に依存する
    // この数まで強制的に粒子を生成するわけではない
    const MAX_PARTICLES = 10000000;

    // Canvasの描画解像度倍率の上限
    // 増加：高DPI端末で描画が鮮明になるが、負荷が増える
    // 減少：描画が粗くなるが、負荷が軽くなる
    // 1：CSSピクセルと同じ解像度
    // 2：縦横それぞれ最大2倍の解像度
    // 範囲：0より大きい数値
    // 通常は1以上を推奨
    // 端末のdevicePixelRatio以上にしても効果なし
    const MAX_PIXEL_RATIO = 1.5;


    // 画面中央の水平線の色
    // 色指定を変更することで中央線の色が変わる
    // 範囲：有効なCSSカラー
    // "transparent"で透明にできる
    const CENTER_LINE_COLOR = "#ff0000";

    // 画面中央の水平線の太さ（px）
    // 増加：中央線が太くなる
    // 減少：中央線が細くなる
    // 0：中央線を非表示にする
    // 範囲：0以上を推奨（小数指定可能）
    const CENTER_LINE_WIDTH = 0.1;


    // 背景色（RGB）
    // [赤, 緑, 青]の順で指定する
    // 増加：対応する色成分が明るくなる
    // 減少：対応する色成分が暗くなる
    // [0, 0, 0]：黒
    // [255, 255, 255]：白
    // 範囲：各成分0〜255を推奨
    const BACKGROUND_COLOR = [9, 11, 18];


    // ========================================
    // GPUバッファ最適化設定
    // ========================================

    // GPUバッファ1ページあたりの粒子容量
    // 増加：ページ数・描画呼び出し回数が減りやすい
    //       ただし、一度に確保するメモリ量が増える
    // 減少：メモリ確保の単位が小さくなる
    //       ただし、ページ数・描画呼び出し回数が増えやすい
    // 範囲：1以上の安全な整数
    // 実際にはMAX_PARTICLES以下に制限される
    // 上限はGPU性能・メモリ容量に依存する
    const PAGE_PARTICLES = 262144;


    // 初期GPUバッファ容量を計算するための想定FPS
    // 増加：初期状態で確保するバッファが増えやすい
    // 減少：初期状態で確保するバッファが減りやすい
    // 範囲：0より大きい数値
    // 実際のフレームレートを変更する設定ではない
    const INITIAL_ESTIMATED_FPS = 60;

    // 起動時に事前確保する粒子容量の下限
    // 増加：起動時のメモリ使用量が増えやすい
    //       動作中の追加確保が減る可能性がある
    // 減少：起動時のメモリ使用量が減りやすい
    // 範囲：1以上、INITIAL_MAX_CAPACITY以下
    // 整数を推奨
    // 実際の確保容量はページ単位で切り上げられる
    const INITIAL_MIN_CAPACITY = 262144;

    // 起動時に事前確保する粒子容量の上限
    // 増加：起動時のメモリ確保量が増える可能性がある
    // 減少：動作中の追加メモリ確保が増える可能性がある
    // 範囲：INITIAL_MIN_CAPACITY以上
    // 整数を推奨
    // MAX_PARTICLESで制限後、ページ単位で切り上げられる
    // 動作中の粒子数そのものの上限ではない
    const INITIAL_MAX_CAPACITY = 1500000;


    // バッチ情報を保持するGPUテクスチャの枚数
    // 複数のテクスチャを順番に使用して同期待ちを抑える
    // 増加：GPUの同期待ちが減る可能性がある
    //       ただし、メモリ使用量が増える
    // 減少：メモリ使用量が減る
    //       ただし、GPUの同期待ちが増える可能性がある
    // 範囲：2以上の安全な整数
    // 上限はGPU性能・メモリ容量に依存する
    const BATCH_TEXTURE_COUNT = 3;

    // バッチ情報用テクスチャの初期スロット数
    // 増加：起動時のメモリ確保量が増えやすい
    //       動作中のテクスチャ拡張が減る可能性がある
    // 減少：起動時のメモリ確保量が減りやすい
    //       動作中のテクスチャ拡張が増える可能性がある
    // 範囲：1以上の整数を推奨
    // 実際の容量はGPUのテクスチャ上限に依存する
    const INITIAL_BATCH_SLOTS = 16384;


    // ========================================
    // フレーム時間安定化設定
    // ========================================

    // 過去のフレーム時間を利用した時間スパイク抑制
    // true：急激な時間変化を抑制する
    // false：中央値を使った補正を行わない
    // 範囲：true / false
    // 実際のFPSを固定する機能ではない
    // falseでもMAX_VISUAL_STEPとPAUSE_GAPは有効
    const FRAME_SMOOTHING_ENABLED = true;


    // フレーム時間の中央値を計算するための履歴数
    // 増加：一時的なフレーム時間の変化に影響されにくい
    //       継続的なFPS変化への追従は遅くなる
    // 減少：継続的なFPS変化への追従が速くなる
    //       一時的なフレーム時間の変化に影響されやすい
    // 範囲：1以上の安全な整数
    // 通常は3以上の奇数を推奨
    const FRAME_HISTORY_SIZE = 9;

    // フレーム時間の中央値に対する許容倍率
    // 増加：フレーム時間の急激な変化を許容する
    // 減少：フレーム時間の急激な変化を厳しく抑制する
    // 1：中央値を超える時間進行を許容しない
    // 1.35：中央値の135%まで許容する
    // 範囲：1以上
    // FRAME_SMOOTHING_ENABLEDがtrueの場合のみ有効
    const FRAME_SPIKE_RATIO = 1.35;


    // 1フレームで進める描画内時間の最大値（秒）
    // 増加：低FPSでも実時間に近い速度で動く
    //       ただし、位置が急激に変化する可能性がある
    // 減少：急激な動きを抑制できる
    //       ただし、低FPS時にスローモーションになりやすい
    // 1 / 60：約16.7ms
    // 1 / 30：約33.3ms
    // 1 / 15：約66.7ms
    // 範囲：0より大きく、PAUSE_GAP未満
    const MAX_VISUAL_STEP = 1 / 30;

    // 長時間停止したと判断するフレーム間隔（秒）
    // この値を超えた経過時間は無視し、履歴をリセットする
    // 増加：長時間のフレーム停止を無視しにくくなる
    // 減少：短時間のフレーム停止でも無視されやすくなる
    // 0.25：250msを超えた停止時間を無視する
    // 範囲：MAX_VISUAL_STEPより大きい数値
    const PAUSE_GAP = 0.25;


    // ========================================
    // パフォーマンス診断
    // ========================================

    // パフォーマンス診断機能
    // true：ブラウザのコンソールに診断情報を出力する
    // false：診断情報を出力しない
    // FPS、CPU処理時間、GPU描画時間、粒子数などを確認可能
    // GPU描画時間の取得には対応する拡張機能が必要
    // 範囲：true / false
    // 通常使用時はfalseを推奨
    const DEBUG_PERFORMANCE = false;

    // パフォーマンス診断の出力間隔（秒）
    // 増加：診断情報の出力頻度が下がる
    // 減少：診断情報の出力頻度が上がる
    // 1：およそ1秒ごとに出力
    // 2：およそ2秒ごとに出力
    // 範囲：0より大きい数値
    // DEBUG_PERFORMANCEがtrueの場合のみ有効
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

        !Number.isFinite(GRAVITY_SPAWN_PROBABILITY) ||
        GRAVITY_SPAWN_PROBABILITY < 0 ||
        GRAVITY_SPAWN_PROBABILITY > 1 ||

        !Number.isFinite(ATTACK_SHIFT_PROBABILITY) ||
        ATTACK_SHIFT_PROBABILITY < 0 ||
        ATTACK_SHIFT_PROBABILITY > 1 ||

        GRAVITY_DECAY_RATE <= 0 ||
        GRAVITY_DECAY_CURVE <= 0 ||
        GRAVITY_ZERO_THRESHOLD <= 0 ||

        GRAVITY_RADIUS_MIN <= 0 ||
        GRAVITY_RADIUS_MAX < GRAVITY_RADIUS_MIN ||

        !Number.isFinite(GRAVITY_STRENGTH_MIN) ||
        !Number.isFinite(GRAVITY_STRENGTH_MAX_MIN) ||
        !Number.isFinite(GRAVITY_STRENGTH_MAX_MAX) ||
        GRAVITY_STRENGTH_MIN < 0 ||
        GRAVITY_STRENGTH_MAX_MIN < GRAVITY_STRENGTH_MIN ||
        GRAVITY_STRENGTH_MAX_MAX < GRAVITY_STRENGTH_MAX_MIN ||

        !Number.isFinite(GRAVITY_STRENGTH_LFO_FREQ_MIN) ||
        !Number.isFinite(GRAVITY_STRENGTH_LFO_FREQ_MAX) ||
        !Number.isFinite(GRAVITY_STRENGTH_LFO_FREQ_DRIFT) ||
        GRAVITY_STRENGTH_LFO_FREQ_MIN < 0 ||
        GRAVITY_STRENGTH_LFO_FREQ_MAX < GRAVITY_STRENGTH_LFO_FREQ_MIN ||
        GRAVITY_STRENGTH_LFO_FREQ_DRIFT < 0 ||

        GRAVITY_SPEED_MIN < 0 ||
        GRAVITY_SPEED_MAX < GRAVITY_SPEED_MIN ||

        GRAVITY_STATIONARY_PROBABILITY < 0 ||
        GRAVITY_STATIONARY_PROBABILITY > 1 ||

        GRAVITY_VOLUME_INFLUENCE < 0 ||
        GRAVITY_VOLUME_INFLUENCE > 1 ||
        GRAVITY_VOLUME_REFERENCE <= 0 ||

        !Number.isFinite(ATTACK_SHIFT_MIN_HEIGHT) ||
        !Number.isFinite(ATTACK_SHIFT_MAX_HEIGHT) ||
        ATTACK_SHIFT_MIN_HEIGHT <= 0 ||
        ATTACK_SHIFT_MAX_HEIGHT < ATTACK_SHIFT_MIN_HEIGHT ||
        ATTACK_SHIFT_MAX_HEIGHT > 100 ||

        !Number.isFinite(ATTACK_SHIFT_MIN_WIDTH) ||
        !Number.isFinite(ATTACK_SHIFT_MAX_WIDTH) ||
        ATTACK_SHIFT_MIN_WIDTH <= 0 ||
        ATTACK_SHIFT_MAX_WIDTH < ATTACK_SHIFT_MIN_WIDTH ||
        ATTACK_SHIFT_MAX_WIDTH > 100 ||

        !Number.isFinite(ATTACK_SHIFT_X_MAX_DISTANCE) ||
        ATTACK_SHIFT_X_MAX_DISTANCE < 0 ||

        !Number.isFinite(ATTACK_SHIFT_X_VOLUME_REFERENCE) ||
        ATTACK_SHIFT_X_VOLUME_REFERENCE <= 0 ||

        !Number.isFinite(ATTACK_SHIFT_X_VOLUME_CURVE) ||
        ATTACK_SHIFT_X_VOLUME_CURVE <= 0 ||

        !Number.isFinite(ATTACK_SHIFT_X_MAX_INERTIA_SPEED) ||
        ATTACK_SHIFT_X_MAX_INERTIA_SPEED < 0 ||

        !Number.isFinite(ATTACK_SHIFT_X_INERTIA_VOLUME_CURVE) ||
        ATTACK_SHIFT_X_INERTIA_VOLUME_CURVE <= 0 ||

        !Number.isFinite(ATTACK_SHIFT_Y_MAX_DISTANCE) ||
        ATTACK_SHIFT_Y_MAX_DISTANCE < 0 ||

        !Number.isFinite(ATTACK_SHIFT_Y_VOLUME_REFERENCE) ||
        ATTACK_SHIFT_Y_VOLUME_REFERENCE <= 0 ||

        !Number.isFinite(ATTACK_SHIFT_Y_VOLUME_CURVE) ||
        ATTACK_SHIFT_Y_VOLUME_CURVE <= 0 ||

        !Number.isFinite(ATTACK_SHIFT_Y_MAX_INERTIA_SPEED) ||
        ATTACK_SHIFT_Y_MAX_INERTIA_SPEED < 0 ||

        !Number.isFinite(ATTACK_SHIFT_Y_INERTIA_VOLUME_CURVE) ||
        ATTACK_SHIFT_Y_INERTIA_VOLUME_CURVE <= 0 ||

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
    // 共通関数
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
            Math.log(decay) / 60
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
        -Math.LN2 / Math.max(NORMAL_SPEED_HALF_LIFE, 0.0001);

    const attackRate =
        -Math.LN2 / Math.max(ATTACK_SPEED_HALF_LIFE, 0.0001);

    const colorRate =
        -Math.LN2 / Math.max(NORMAL_COLOR_HALF_LIFE, 0.0001);

    const curveFactor = c =>
        c < 0.0001 ? 1 : 1 / (-Math.expm1(-c));

    const normalCurveFactor = curveFactor(NORMAL_SIZE_CURVE);
    const attackCurveFactor = curveFactor(ATTACK_SIZE_CURVE);

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

    if (
        !gl ||
        GRAVITY_MAX_POINTS + 10 >
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
    // ========================================

    const textureLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    const slotsPerRow = Math.floor(
        Math.min(1024, textureLimit) / 2
    );

    const rowWidth = slotsPerRow * 2;

    const batchTextures = [];

    let textureRows = 0;
    let textureIndex = -1;

    let batchPixels = new Float32Array(0);
    let nextSlot = 0;

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
            throw new Error("Batch texture capacity exceeded.");
        }

        textureRows = Math.min(
            textureLimit,
            Math.max(rows, textureRows * 2, 1)
        );

        batchPixels = new Float32Array(
            rowWidth * textureRows * 4
        );

        for (const tex of batchTextures) {

            gl.bindTexture(gl.TEXTURE_2D, tex);

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
            Math.ceil(INITIAL_BATCH_SLOTS / slotsPerRow)
        )
    );

    // ========================================
    // Vertex Shader
    // ========================================

    function vertexSource(integrate) {

        return `#version 300 es

${integrate ? "#define INTEGRATE 1" : ""}

precision highp float;
precision highp int;
precision highp sampler2D;

// aState.xy = 座標
// aState.zw = 速度ベクトル

layout(location=0) in vec4 aState;
layout(location=1) in uint aBatch;

uniform sampler2D uBatchData;

uniform vec2 uResolution;
uniform float uMargin;

#ifdef INTEGRATE

uniform vec4 uGravity[${GRAVITY_MAX_POINTS}];

uniform int uGravityCount;
uniform float uDt;

// x = 対象範囲の開始座標
// y = 対象範囲の終了座標
// z = 符号付き移動量
// w = 符号付き追加速度

uniform vec4 uAttackShift;

// 0 = 左右方向へのスライス
// 1 = 上下方向へのスライス

uniform int uAttackShiftAxis;

out vec4 nextState;

#endif

flat out vec4 vColor;

void hideParticle() {

    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
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

    vec4 motion = texelFetch(uBatchData, uv, 0);

#ifdef INTEGRATE

    nextState = aState;

#endif

    // 消滅済み粒子の処理を省略

    if (motion.y < 0.0) {
        hideParticle();
        return;
    }

    vec2 pos = aState.xy + aState.zw * motion.x;

#ifdef INTEGRATE

    vec2 vel = aState.zw * motion.y;

    // ====================================
    // Low Attackによる上下左右スライス
    // ====================================

    if (
        uAttackShift.z != 0.0 ||
        uAttackShift.w != 0.0
    ) {

        if (uAttackShiftAxis == 0) {

            // ==============================
            // 左右方向へのスライス
            //
            // Y座標によって対象範囲を判定
            // X座標とX方向速度を変更
            // ==============================

            if (
                pos.y >= uAttackShift.x &&
                pos.y <= uAttackShift.y
            ) {
                pos.x += uAttackShift.z;
                vel.x += uAttackShift.w;
            }

        } else {

            // ==============================
            // 上下方向へのスライス
            //
            // X座標によって対象範囲を判定
            // Y座標とY方向速度を変更
            // ==============================

            if (
                pos.x >= uAttackShift.x &&
                pos.x <= uAttackShift.y
            ) {
                pos.y += uAttackShift.z;
                vel.y += uAttackShift.w;
            }
        }
    }

    // ====================================
    // 重力演算
    // ====================================

    if (motion.w >= 0.0) {

        vec2 acceleration = vec2(0.0);

        for (int i = 0; i < uGravityCount; ++i) {

            vec4 g = uGravity[i];

            vec2 delta = g.xy - pos;

            float radius = max(g.z, 0.0001);
            float d2 = dot(delta, delta);

            // 重力範囲外の計算を省略

            if (d2 >= radius * radius) {
                continue;
            }

            float d = sqrt(d2);

            float t = clamp(
                1.0 - d / radius,
                0.0,
                1.0
            );

            float falloff = t * t * (3.0 - 2.0 * t);

            acceleration +=
                delta / max(d, 0.001) *
                g.w * falloff;
        }

        // 水平・垂直方向ともに速度減衰を適用
        // 重力による加速度を加算

        vel =
            vel * motion.w +
            acceleration * uDt;

        pos += vel * uDt;
    }

    // 更新された座標・速度をGPUに保存

    nextState = vec4(pos, vel);

#endif

    // ====================================
    // 画面外の粒子は描画処理を省略
    // 物理演算は維持
    // ====================================

    if (
        motion.z <= 0.0 ||
        any(lessThan(pos, vec2(-uMargin))) ||
        any(greaterThan(pos, uResolution + vec2(uMargin)))
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

    gl_PointSize = max(1.0, motion.z);
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

    vec2 uv = gl_PointCoord - vec2(0.5);

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

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {

            const message = gl.getShaderInfoLog(shader);

            gl.deleteShader(shader);

            throw new Error(message || "Shader compile error.");
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

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {

            const message = gl.getProgramInfoLog(program);

            gl.deleteProgram(program);

            throw new Error(message || "Program link error.");
        }

        const uniform = name =>
            gl.getUniformLocation(program, name);

        gl.useProgram(program);
        gl.uniform1i(uniform("uBatchData"), 0);

        return {
            program,
            resolution: uniform("uResolution"),
            margin: uniform("uMargin"),
            gravity: uniform("uGravity[0]"),
            count: uniform("uGravityCount"),
            dt: uniform("uDt"),
            attackShift: uniform("uAttackShift"),
            attackShiftAxis: uniform("uAttackShiftAxis")
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

    const feedback = gl.createTransformFeedback();

    // ========================================
    // 固定サイズGPUページ
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
            throw new Error("GPU buffer allocation failed.");
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, size, usage);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        return b;
    }

    // ========================================
    // VAO生成
    // ========================================

    function makeVAO(state, ids) {

        const vao = gl.createVertexArray();

        gl.bindVertexArray(vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, state);

        gl.enableVertexAttribArray(0);

        gl.vertexAttribPointer(
            0, 4, gl.FLOAT, false, STATE_BYTES, 0
        );

        gl.bindBuffer(gl.ARRAY_BUFFER, ids);

        gl.enableVertexAttribArray(1);

        gl.vertexAttribIPointer(
            1, 1, gl.UNSIGNED_INT, ID_BYTES, 0
        );

        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

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
                Math.ceil(width / PARTICLE_SPACING) *
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
        freePages.push(allocatePage());
    }

    // ========================================
    // GPUページの取得・再利用
    // ========================================

    function acquirePage() {

        const page = freePages.pop() || allocatePage();

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
    // バッチ管理
    // ========================================

    function releaseBatch(b) {
        recycledBatches.push(b);
    }

    function acquireBatch() {

        if (recycledBatches.length) {
            return recycledBatches.pop();
        }

        if (nextSlot >= slotsPerRow * textureLimit) {
            throw new Error("Batch slot limit exceeded.");
        }

        return {
            slot: nextSlot++
        };
    }

    // ========================================
    // 消滅済み粒子の管理
    // ========================================

    function expireParticles(now, newCount) {

        const cutoff = serial + newCount - MAX_PARTICLES;

        let kept = 0;

        for (let i = 0; i < activePages.length; i++) {

            const p = activePages[i];
            const list = p.batches;

            for (let j = p.head; j < list.length; j++) {

                const b = list[j];

                // 寿命による消滅

                if (!b.dead && b.expiry <= now) {
                    b.dead = true;
                    liveCount -= b.count;
                }

                // 最大粒子数を超えた場合は古い粒子から除外

                const drop = Math.min(
                    b.count,
                    Math.max(0, cutoff - b.serial)
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

            while (p.head < list.length && list[p.head].dead) {

                releaseBatch(list[p.head]);
                list[p.head++] = null;
            }

            // ページ末尾の消滅済みバッチを除外

            while (
                list.length > p.head &&
                list[list.length - 1].dead
            ) {
                releaseBatch(list.pop());
            }

            // 生存粒子がないページは再利用

            if (p.head === list.length) {
                recyclePage(p);
                continue;
            }

            const last = list[list.length - 1];

            p.end = last.start + last.count;

            // CPU側の管理情報のみ整理

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
    // ========================================

    let previousWall = performance.now();
    let visualTime = 0;

    let historyCount = 0;
    let historyIndex = 0;

    const history = new Float64Array(FRAME_HISTORY_SIZE);
    const sorted = new Float64Array(FRAME_HISTORY_SIZE);

    function frameStep(raw) {

        if (raw <= 0) {
            return 0;
        }

        // 長時間停止した場合は経過時間を無視

        if (raw > PAUSE_GAP) {
            historyCount = 0;
            historyIndex = 0;
            return 0;
        }

        if (!FRAME_SMOOTHING_ENABLED) {
            return Math.min(raw, MAX_VISUAL_STEP);
        }

        history[historyIndex] = raw;

        historyIndex =
            (historyIndex + 1) % FRAME_HISTORY_SIZE;

        historyCount = Math.min(
            historyCount + 1,
            FRAME_HISTORY_SIZE
        );

        // 挿入ソートによる中央値計算

        for (let i = 0; i < historyCount; i++) {

            const v = history[i];

            let j = i - 1;

            while (j >= 0 && sorted[j] > v) {
                sorted[j + 1] = sorted[j];
                j--;
            }

            sorted[j + 1] = v;
        }

        const typical = sorted[Math.floor(historyCount / 2)];

        return Math.min(
            raw,
            typical * FRAME_SPIKE_RATIO,
            MAX_VISUAL_STEP
        );
    }

    // ========================================
    // アタック状態管理
    // ========================================

    let previousAttack = false;
    let previousLowAttack = false;

    // ========================================
    // Color LFO
    // ========================================

    let colorLfoPhase = COLOR_LFO_PHASE_OFFSET;

    let colorLfoValue =
        (Math.sin(colorLfoPhase) + 1) * 0.5;

    function updateColorLfo(now, dt) {

        if (!COLOR_LFO_ENABLED) {
            colorLfoValue = 1;
            return;
        }

        const mod = (
            Math.sin(
                2 * Math.PI * COLOR_LFO_FREQ_DRIFT * now
            ) + 1
        ) * 0.5;

        const freq =
            COLOR_LFO_FREQ_MIN +
            (COLOR_LFO_FREQ_MAX - COLOR_LFO_FREQ_MIN) * mod;

        colorLfoPhase = (
            colorLfoPhase +
            2 * Math.PI * freq * dt
        ) % (2 * Math.PI);

        colorLfoValue =
            (Math.sin(colorLfoPhase) + 1) * 0.5;
    }

    // ========================================
    // 重力強度LFO
    // ========================================

    let gravityStrengthLfoPhase = 0;

    let gravityStrengthMax =
        GRAVITY_STRENGTH_MAX_MIN +
        (GRAVITY_STRENGTH_MAX_MAX - GRAVITY_STRENGTH_MAX_MIN) * 0.5;

    function updateGravityStrengthLfo(now, dt) {

        const mod = (
            Math.sin(
                2 * Math.PI * GRAVITY_STRENGTH_LFO_FREQ_DRIFT * now
            ) + 1
        ) * 0.5;

        const freq =
            GRAVITY_STRENGTH_LFO_FREQ_MIN +
            (GRAVITY_STRENGTH_LFO_FREQ_MAX - GRAVITY_STRENGTH_LFO_FREQ_MIN) * mod;

        gravityStrengthLfoPhase = (
            gravityStrengthLfoPhase +
            2 * Math.PI * freq * dt
        ) % (2 * Math.PI);

        const value =
            (Math.sin(gravityStrengthLfoPhase) + 1) * 0.5;

        gravityStrengthMax =
            GRAVITY_STRENGTH_MAX_MIN +
            (GRAVITY_STRENGTH_MAX_MAX - GRAVITY_STRENGTH_MAX_MIN) * value;
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

    function volumeFactor(waveform, fastVolume) {

        if (
            GRAVITY_VOLUME_INFLUENCE === 0 ||
            !waveform?.length
        ) {
            return 1;
        }

        const rms = Number.isFinite(fastVolume)
            ? fastVolume
            : waveformRms(waveform);

        const volume = clamp(
            rms / GRAVITY_VOLUME_REFERENCE,
            0,
            1
        );

        return Math.max(
            0,
            1 + GRAVITY_VOLUME_INFLUENCE * (volume * 2 - 1)
        );
    }

    // ========================================
    // RMS計算
    // ========================================

    function waveformRms(waveform) {

        let sum = 0;

        for (let i = 0; i < waveform.length; i++) {
            sum += waveform[i] * waveform[i];
        }

        return Math.sqrt(sum / waveform.length);
    }

    // ========================================
    // Low Attackによる上下左右スライス生成
    // ========================================

    function createAttackShift(waveform, fastVolume) {

        if (!ATTACK_SHIFT_ENABLED || !waveform?.length) {
            return null;
        }

        // ====================================
        // スライス発生確率の判定
        //
        // Low Attackごとに1回抽選する
        // 抽選に外れた場合はスライスしない
        // ====================================

        if (Math.random() >= ATTACK_SHIFT_PROBABILITY) {
            return null;
        }

        // アタック検出時点の短いRMS窓を優先
        // 旧解析器にも対応

        const rms = Number.isFinite(fastVolume)
            ? fastVolume
            : waveformRms(waveform);

        if (!Number.isFinite(rms) || rms <= 0) {
            return null;
        }

        // 左右・上下を各50%、符号を各50%で選択

        const axis = Math.random() < 0.5 ? 0 : 1;
        const direction = Math.random() < 0.5 ? -1 : 1;
        const horizontal = axis === 0;

        // 選ばれた移動軸の設定だけを使用

        const reference = horizontal
            ? ATTACK_SHIFT_X_VOLUME_REFERENCE
            : ATTACK_SHIFT_Y_VOLUME_REFERENCE;

        const maxDistance = horizontal
            ? ATTACK_SHIFT_X_MAX_DISTANCE
            : ATTACK_SHIFT_Y_MAX_DISTANCE;

        const distanceCurve = horizontal
            ? ATTACK_SHIFT_X_VOLUME_CURVE
            : ATTACK_SHIFT_Y_VOLUME_CURVE;

        const maxInertia = horizontal
            ? ATTACK_SHIFT_X_MAX_INERTIA_SPEED
            : ATTACK_SHIFT_Y_MAX_INERTIA_SPEED;

        const inertiaCurve = horizontal
            ? ATTACK_SHIFT_X_INERTIA_VOLUME_CURVE
            : ATTACK_SHIFT_Y_INERTIA_VOLUME_CURVE;

        // 選択された軸の移動・慣性が両方0なら
        // スライスしない

        if (maxDistance === 0 && maxInertia === 0) {
            return null;
        }

        const bandDimension = horizontal ? height : width;
        const moveDimension = horizontal ? width : height;

        const center = Math.random() * bandDimension;

        const bandSize = randomBetween(
            horizontal
                ? ATTACK_SHIFT_MIN_HEIGHT
                : ATTACK_SHIFT_MIN_WIDTH,
            horizontal
                ? ATTACK_SHIFT_MAX_HEIGHT
                : ATTACK_SHIFT_MAX_WIDTH
        ) / 100 * bandDimension;

        const volume = clamp(rms / reference, 0, 1);

        // 位置のズレと慣性は独立して算出

        const distance =
            Math.pow(volume, distanceCurve) *
            maxDistance / 100 * moveDimension;

        const inertiaSpeed =
            Math.pow(volume, inertiaCurve) *
            maxInertia / 100 * moveDimension;

        return {
            axis,
            start: center - bandSize * 0.5,
            end: center + bandSize * 0.5,
            offset: distance * direction,
            impulse: inertiaSpeed * direction
        };
    }

    // ========================================
    // 重力点生成
    // ========================================

    function spawnGravity(now, waveform, fastVolume) {

        if (!GRAVITY_ENABLED) {
            return;
        }

        // ====================================
        // 重力点の生成・上書き確率の判定
        //
        // 全帯域のAttackごとに1回抽選する
        // 抽選に外れた場合は既存の重力点を維持
        // ====================================

        if (Math.random() >= GRAVITY_SPAWN_PROBABILITY) {
            return;
        }

        const stationary =
            Math.random() < GRAVITY_STATIONARY_PROBABILITY;

        const axisX = Math.random() < 0.5;
        const direction = Math.random() < 0.5 ? -1 : 1;

        const speed = stationary
            ? 0
            : randomBetween(
                GRAVITY_SPEED_MIN,
                GRAVITY_SPEED_MAX
            );

        const strength = randomBetween(
            GRAVITY_STRENGTH_MIN,
            gravityStrengthMax
        ) * volumeFactor(waveform, fastVolume);

        // 最大数に達している場合は
        // 最も古い重力点を削除する
        //
        // 確率判定に成功した場合のみ実行される

        if (gravityPoints.length >= GRAVITY_MAX_POINTS) {
            gravityPoints.shift()?.marker?.remove();
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

        const base = Math.min(width, height);

        for (const p of gravityPoints) {

            const age = Math.max(0, now - p.born);

            const strength =
                p.strength *
                Math.exp(
                    -Math.pow(
                        age * GRAVITY_DECAY_RATE,
                        GRAVITY_DECAY_CURVE
                    )
                );

            if (strength <= GRAVITY_ZERO_THRESHOLD) {
                p.marker?.remove();
                continue;
            }

            const x = (p.x + p.vx * age) * width;
            const y = (p.y + p.vy * age) * height;

            const j = count * 4;

            gravityData[j] = x;
            gravityData[j + 1] = y;

            gravityData[j + 2] =
                p.radius / 100 * base;

            gravityData[j + 3] =
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

    function spawnParticles(waveform, attack, now, count) {

        if (!count) {
            return;
        }

        if (stagingState.length < count * 4) {
            stagingState = new Float32Array(count * 4);
        }

        if (stagingIds.length < count) {
            stagingIds = new Uint32Array(count);
        }

        const cy = height * 0.5;

        // 粒子の初期座標と初期速度

        for (let i = 0; i < count; i++) {

            const xr = Math.min(
                1,
                i * PARTICLE_SPACING / width
            );

            const idx = Math.min(
                waveform.length - 1,
                Math.floor(xr * waveform.length)
            );

            const sample = clamp(
                waveform[idx] || 0,
                -1,
                1
            );

            const j = i * 4;

            // X座標

            stagingState[j] = xr * width;

            // Y座標

            stagingState[j + 1] = cy;

            // X方向初期速度

            stagingState[j + 2] = 0;

            // Y方向初期速度

            stagingState[j + 3] =
                sample /
                SPEED_DIVISOR *
                SPEED_MULTIPLIER *
                60;
        }

        let offset = 0;

        while (offset < count) {

            let p = activePages[activePages.length - 1];

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
                attack ? attackLife : normalLife
            );

            b.distance = 0;
            b.damping = 1;
            b.dead = false;

            stagingIds.fill(b.slot, 0, n);

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

        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    // ========================================
    // バッチ共通演算
    // ========================================

    function prepareBatches(now, dt, integrate) {

        const rows = Math.max(
            1,
            Math.ceil(nextSlot / slotsPerRow)
        );

        ensureTexture(rows);

        const dn = Math.exp(normalRate * dt);
        const da = Math.exp(attackRate * dt);

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

                const damping = a ? da : dn;

                // =================================
                // 重力・スライスがない場合
                // =================================

                if (!integrate && !newborn) {

                    b.damping *= damping;
                    b.distance += b.damping * dt;
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

                const life = a ? attackLife : normalLife;

                const startSize = a
                    ? ATTACK_INITIAL_SIZE
                    : NORMAL_INITIAL_SIZE;

                const endSize = a
                    ? ATTACK_FINAL_SIZE
                    : NORMAL_FINAL_SIZE;

                let size = startSize;

                if (startSize !== endSize) {

                    let progress =
                        Number.isFinite(life) && life > 0
                            ? clamp(age / life, 0, 1)
                            : 0;

                    const curve = a
                        ? ATTACK_SIZE_CURVE
                        : NORMAL_SIZE_CURVE;

                    if (curve >= 0.0001) {

                        progress =
                            -Math.expm1(-curve * progress) *
                            (
                                a
                                    ? attackCurveFactor
                                    : normalCurveFactor
                            );
                    }

                    size +=
                        (endSize - startSize) * progress;
                }

                const diameter = Math.max(0, size * dpr);

                // =================================
                // 色
                //
                // 通常：赤 → 白 → シアン
                // アタック：赤固定
                // =================================

                const w = a
                    ? 0
                    : (
                        1 - Math.exp(colorRate * age)
                    ) * clamp(b.target, 0, 1);

                const r = w < 0.5
                    ? 1
                    : 2 - 2 * w;

                const gb = w < 0.5
                    ? 2 * w
                    : 1;

                // =================================
                // テクセル1：移動・サイズ
                // =================================

                batchPixels[j] = b.distance;

                batchPixels[j + 1] = b.damping;

                batchPixels[j + 2] = diameter;

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
                        ? alpha * Math.min(1, diameter * diameter)
                        : 0;

                // =================================
                // 統合演算時は状態をGPUに保存
                // =================================

                if (integrate) {
                    b.distance = 0;
                    b.damping = 1;
                }
            }
        }

        // ====================================
        // テクスチャローテーション
        // ====================================

        textureIndex =
            (textureIndex + 1) % BATCH_TEXTURE_COUNT;

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
    // ========================================

    function render(gravityCount, dt, integrate, attackShift) {

        gl.clear(gl.COLOR_BUFFER_BIT);

        drawCalls = 0;
        submittedParticles = 0;

        if (!activePages.length) {
            return;
        }

        const p = integrate
            ? gravityProgram
            : freeProgram;

        const target = 1 - current;

        gl.useProgram(p.program);

        if (integrate) {

            gl.uniform1i(p.count, gravityCount);
            gl.uniform1f(p.dt, dt);

            if (gravityCount > 0) {

                gl.uniform4fv(
                    p.gravity,
                    gravityData,
                    0,
                    gravityCount * 4
                );
            }

            // =================================
            // スライス情報をGPUに転送
            //
            // スライスが発生しなかった場合は
            // 移動量と追加速度を0に戻す
            // =================================

            gl.uniform4f(
                p.attackShift,

                attackShift?.start ?? 0,
                attackShift?.end ?? 0,
                attackShift?.offset ?? 0,
                attackShift?.impulse ?? 0
            );

            // 移動軸
            // 0 = 左右
            // 1 = 上下

            gl.uniform1i(
                p.attackShiftAxis,
                attackShift?.axis ?? 0
            );

            gl.bindTransformFeedback(
                gl.TRANSFORM_FEEDBACK,
                feedback
            );
        }

        // ====================================
        // ページ単位で描画
        // ====================================

        for (const page of activePages) {

            const start = page.batches[page.head].start;
            const count = page.end - start;

            if (!count) {
                continue;
            }

            gl.bindVertexArray(page.vaos[current]);

            if (integrate) {

                gl.bindBufferRange(
                    gl.TRANSFORM_FEEDBACK_BUFFER,
                    0,
                    page.states[target],
                    start * STATE_BYTES,
                    count * STATE_BYTES
                );

                gl.beginTransformFeedback(gl.POINTS);
            }

            gl.drawArrays(gl.POINTS, start, count);

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

        const b = mount.getBoundingClientRect();

        width = Math.max(1, b.width);
        height = Math.max(1, b.height);

        dpr = Math.min(
            window.devicePixelRatio || 1,
            MAX_PIXEL_RATIO
        );

        const w = Math.max(1, Math.round(width * dpr));
        const h = Math.max(1, Math.round(height * dpr));

        if (canvas.width !== w) {
            canvas.width = w;
        }

        if (canvas.height !== h) {
            canvas.height = h;
        }

        gl.viewport(0, 0, w, h);

        const margin = Math.max(
            1 / dpr,
            NORMAL_INITIAL_SIZE,
            NORMAL_FINAL_SIZE,
            ATTACK_INITIAL_SIZE,
            ATTACK_FINAL_SIZE
        ) + 2;

        for (const p of [freeProgram, gravityProgram]) {

            gl.useProgram(p.program);

            gl.uniform2f(
                p.resolution,
                width,
                height
            );

            gl.uniform1f(p.margin, margin);
        }
    }

    const observer = new ResizeObserver(resize);

    observer.observe(mount);

    resize();

    // ========================================
    // パフォーマンス診断
    // ========================================

    const timerExt = DEBUG_PERFORMANCE
        ? gl.getExtension("EXT_disjoint_timer_query_webgl2")
        : null;

    let pendingQuery = null;
    let gpuMs = null;

    let reportAt = performance.now();

    let reportFrames = 0;

    let sumFrame = 0;
    let maxFrame = 0;
    let sumCPU = 0;

    let slowFrames = 0;
    let lastAllocations = pageAllocations;

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

            if (!gl.getParameter(timerExt.GPU_DISJOINT_EXT)) {

                gpuMs = gl.getQueryParameter(
                    pendingQuery,
                    gl.QUERY_RESULT
                ) / 1e6;

            } else {
                gpuMs = null;
            }

            gl.deleteQuery(pendingQuery);
            pendingQuery = null;
        }

        if (pendingQuery || frameNumber % 30 !== 0) {
            return false;
        }

        pendingQuery = gl.createQuery();

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
        maxFrame = Math.max(maxFrame, raw * 1000);

        sumCPU += cpu;

        if (raw > 1 / 30) {
            slowFrames++;
        }

        const t = performance.now();

        if (t - reportAt < DEBUG_INTERVAL * 1000) {
            return;
        }

        console.log(
            "[Particle Visualizer]",
            {
                fps: Math.round(
                    1000 * reportFrames /
                    Math.max(sumFrame, 0.001)
                ),

                averageFrameMs:
                    +(sumFrame / reportFrames).toFixed(2),

                maxFrameMs:
                    +maxFrame.toFixed(2),

                slowFrames,

                averageCPUMs:
                    +(sumCPU / reportFrames).toFixed(2),

                gpuDrawMs:
                    gpuMs === null
                        ? null
                        : +gpuMs.toFixed(2),

                liveParticles: liveCount,

                submittedParticles,

                gravityPoints: gravityPoints.length,

                drawCalls,

                allocatedPages: allPages.length,

                newPages: pageAllocations - lastAllocations,

                bufferCopies: 0
            }
        );

        reportAt = t;

        reportFrames = 0;

        sumFrame = 0;
        maxFrame = 0;
        sumCPU = 0;

        slowFrames = 0;

        lastAllocations = pageAllocations;
    }

    // 初期化処理の時間を最初のフレームに含めない

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
            // フレーム時間取得
            // =================================

            const wall = performance.now();

            const raw = Math.max(
                0,
                (wall - previousWall) / 1000
            );

            previousWall = wall;

            frameNumber++;

            // =================================
            // フレーム時間安定化
            // =================================

            const step = frameStep(raw);

            visualTime += step;

            const now = visualTime;

            // =================================
            // Color LFO
            // =================================

            updateColorLfo(now, step);

            // =================================
            // 重力強度LFO
            // =================================

            updateGravityStrengthLfo(now, step);

            // =================================
            // アタック検出
            // =================================

            // 全帯域のアタック

            const attack = Boolean(
                audio?.attackTriggered
            );

            // 低域のアタック

            const lowAttack = Boolean(
                audio?.lowAttackTriggered
            );

            // 全帯域波形

            const waveform = audio?.waveform;

            // スライス情報は毎フレーム初期化

            let attackShift = null;

            // =================================
            // 全帯域のアタック
            //
            // 重力点を確率的に生成・上書きする
            // =================================

            if (
                attack &&
                (audio?.attackEventMode || !previousAttack)
            ) {

                spawnGravity(
                    now,
                    waveform,
                    audio?.attackVolume
                );
            }

            // =================================
            // Low Attack
            //
            // 確率的に上下左右のいずれかにスライス
            // 同方向に慣性を加算
            // =================================

            if (
                lowAttack &&
                (audio?.attackEventMode || !previousLowAttack)
            ) {

                attackShift = createAttackShift(
                    waveform,
                    audio?.lowAttackVolume
                );
            }

            // アタック状態の保存

            previousAttack = attack;
            previousLowAttack = lowAttack;

            // =================================
            // 重力点更新
            // =================================

            const gravityCount = updateGravity(now);

            // =================================
            // 新規生成粒子数
            // =================================

            const count =
                waveform && waveform.length >= 2
                    ? Math.min(
                        MAX_PARTICLES,
                        Math.ceil(width / PARTICLE_SPACING)
                    )
                    : 0;

            // =================================
            // 消滅済み粒子の除外
            // =================================

            expireParticles(now, count);

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
            // GPU統合演算の判定
            //
            // 重力点が存在する場合
            // または
            // スライス・慣性が発生した場合
            // =================================

            const integrate =

                (gravityCount > 0 && step > 0) ||

                (
                    attackShift !== null &&
                    (
                        attackShift.offset !== 0 ||
                        attackShift.impulse !== 0
                    )
                );

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

            const timing = beginTimer();

            render(
                gravityCount,
                step,
                integrate,
                attackShift
            );

            if (timing) {
                gl.endQuery(timerExt.TIME_ELAPSED_EXT);
            }

            // =================================
            // パフォーマンス診断
            // =================================

            if (DEBUG_PERFORMANCE) {
                report(raw, performance.now() - wall);
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
                gl.deleteQuery(pendingQuery);
            }

            gl.deleteTransformFeedback(feedback);

            // GPUページ解放

            for (const p of allPages) {

                for (const vao of p.vaos) {
                    gl.deleteVertexArray(vao);
                }

                for (const b of p.states) {
                    gl.deleteBuffer(b);
                }

                gl.deleteBuffer(p.ids);
            }

            // バッチテクスチャ解放

            for (const t of batchTextures) {
                gl.deleteTexture(t);
            }

            gl.deleteProgram(freeProgram.program);
            gl.deleteProgram(gravityProgram.program);

            activePages.length = 0;
            freePages.length = 0;
            allPages.length = 0;

            recycledBatches.length = 0;

            markerLayer.remove();
            centerLine.remove();
            canvas.remove();

            if (changedPosition) {
                mount.style.position = originalPosition;
            }
        }
    };
}