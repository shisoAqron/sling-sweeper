/**
 * ゲーム全体の定数。距離はすべて「論理座標」（盤面の一辺 = BOARD_SIZE）で表す。
 * 画面ピクセルには依存しない。
 */

/** 盤面生成アルゴリズムのバージョン。日替わりの種・保存データに含める。生成ロジックを変えたら上げる。 */
export const ALGORITHM_VERSION = 1;

/** セーブデータのスキーマバージョン。 */
export const SAVE_SCHEMA_VERSION = 1;

/** 盤面（正方形）の一辺の論理長。難易度はこの領域を何分割するかで決まる。 */
export const BOARD_SIZE = 100;

/** 発射台の位置（盤面の下側中央、盤面の外）。 */
export const LAUNCHER = { x: BOARD_SIZE / 2, y: BOARD_SIZE + 12 } as const;

/** 引っ張り量の上限（論理長）。 */
export const MAX_PULL_LENGTH = 40;

/** これ未満の引っ張りは射出ではなくキャンセル扱い（投数を加算しない）。 */
export const MIN_PULL_LENGTH = 2;

/**
 * 発射倍率（飛距離 = 引っ張り量 × 倍率）の乱数範囲。暫定値。
 * - 最小倍率でも最遠マスの中心に届く（MAX_PULL_LENGTH × min >= 最遠距離）
 * - 最大倍率でも最近マスを MIN_PULL_LENGTH 以上の引っ張りで狙える
 * は tests で全難易度について検証している。
 */
export const SHOT_MULTIPLIER_RANGE = { min: 3.2, max: 4.4 } as const;

export type Difficulty = 'easy' | 'proto' | 'normal' | 'hard';

export interface DifficultySpec {
  readonly label: string;
  readonly size: number;
  readonly mines: number;
}

/** 盤面サイズ・地雷数は暫定値（AGENTS.md「未決定事項」3）。 */
export const DIFFICULTIES: Readonly<Record<Difficulty, DifficultySpec>> = {
  easy: { label: 'Easy', size: 6, mines: 5 },
  proto: { label: 'Standard', size: 8, mines: 10 },
  normal: { label: 'Normal', size: 10, mines: 15 },
  hard: { label: 'Hard', size: 16, mines: 40 },
};

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'proto', 'normal', 'hard'];

export const DEFAULT_DIFFICULTY: Difficulty = 'proto';

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && value in DIFFICULTIES;
}

export function difficultyLabel(difficulty: Difficulty): string {
  const spec = DIFFICULTIES[difficulty];
  return `${spec.label} ${spec.size}×${spec.size}`;
}
