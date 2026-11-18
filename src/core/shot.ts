import { BOARD_SIZE, LAUNCHER, MAX_PULL_LENGTH, MIN_PULL_LENGTH } from './constants';

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export type PullStatus = 'ok' | 'too-short' | 'backward' | 'invalid';

export interface Pull {
  readonly status: PullStatus;
  /** 発射方向（引っ張りの逆向きの単位ベクトル）。status が ok のときのみ意味を持つ。 */
  readonly direction: Vec2;
  /** 上限でクランプ済みの引っ張り量。 */
  readonly length: number;
  /** 弓を引いた状態の石の位置（発射台 − direction × length）。表示用。 */
  readonly pullPoint: Vec2;
}

export interface Shot {
  readonly direction: Vec2;
  readonly pullLength: number;
  readonly pullPoint: Vec2;
  readonly landing: Vec2;
}

/**
 * 引っ張りベクトル（pullVector = 発射台 − ドラッグ終点）を検証して正規化する。
 * 倍率に依存しないので、ドラッグ中のプレビュー（着地点を含まない）にも使える。
 * 発射方向は盤面側の半平面（y が負の向き）に制限し、後方はキャンセル。
 */
export function resolvePull(pullVector: Vec2): Pull {
  const rawLength = Math.hypot(pullVector.x, pullVector.y);
  const none = (status: PullStatus, length: number): Pull => ({
    status,
    direction: { x: 0, y: -1 },
    length,
    pullPoint: { x: LAUNCHER.x, y: LAUNCHER.y },
  });
  if (!Number.isFinite(rawLength)) return none('invalid', 0);

  const direction = rawLength > 0 ? { x: pullVector.x / rawLength, y: pullVector.y / rawLength } : { x: 0, y: -1 };
  const length = Math.min(rawLength, MAX_PULL_LENGTH);
  const pullPoint = { x: LAUNCHER.x - direction.x * length, y: LAUNCHER.y - direction.y * length };
  const base = { direction, length, pullPoint };

  if (rawLength < MIN_PULL_LENGTH) return { status: 'too-short', ...base };
  if (direction.y >= 0) return { status: 'backward', ...base };
  return { status: 'ok', ...base };
}

/**
 * 射出計算（純粋関数）。入力は論理座標のみ。フレームレートや画面サイズに依存しない。
 * キャンセル扱いの入力は Pull を返す（射出なし）。
 */
export function computeShot(pullVector: Vec2, shotMultiplier: number): Shot | Pull {
  const pull = resolvePull(pullVector);
  if (pull.status !== 'ok') return pull;
  const travel = pull.length * shotMultiplier;
  return {
    direction: pull.direction,
    pullLength: pull.length,
    pullPoint: pull.pullPoint,
    landing: {
      x: LAUNCHER.x + pull.direction.x * travel,
      y: LAUNCHER.y + pull.direction.y * travel,
    },
  };
}

export function isShot(result: Shot | Pull): result is Shot {
  return 'landing' in result;
}

/**
 * 論理座標の点が属するセルのインデックス（row * cols + col）。盤面外は null。
 * 境界は半開区間 [start, end) で判定するので、境界上の点も常に一意のセルに属する。
 */
export function cellIndexAt(point: Vec2, cols: number, rows: number): number | null {
  const { x, y } = point;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return null;
  const col = Math.min(cols - 1, Math.floor((x * cols) / BOARD_SIZE));
  const row = Math.min(rows - 1, Math.floor((y * rows) / BOARD_SIZE));
  return row * cols + col;
}

/** セル中心の論理座標。 */
export function cellCenter(index: number, cols: number, rows: number): Vec2 {
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: ((col + 0.5) * BOARD_SIZE) / cols, y: ((row + 0.5) * BOARD_SIZE) / rows };
}
