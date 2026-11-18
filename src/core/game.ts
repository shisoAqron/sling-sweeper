import { computeCounts, neighborIndices, placeMines } from './board';
import {
  ALGORITHM_VERSION,
  DIFFICULTIES,
  SHOT_MULTIPLIER_RANGE,
  type Difficulty,
} from './constants';
import { createRng } from './rng';
import { cellIndexAt, computeShot, isShot, type Pull, type Vec2 } from './shot';

export type GameMode = 'normal' | 'daily';

export interface GameConfig {
  readonly mode: GameMode;
  readonly difficulty: Difficulty;
  readonly cols: number;
  readonly rows: number;
  readonly mines: number;
  /** 盤面・倍率の生成元となるシード文字列。同じ文字列なら同じ盤面・倍率。 */
  readonly seed: string;
  /** 発射特性。同一ゲーム内では一定（開発用UIで上書きする場合を除く）。 */
  readonly shotMultiplier: number;
  readonly algorithmVersion: number;
  /** 日替わりの日付（JST, YYYY-MM-DD）。 */
  readonly dailyDate?: string;
}

export type ShotOutcome =
  /** 盤面外に停止（マスは開かない） */
  | 'outside'
  /** 未開封の安全マスを開いた */
  | 'safe-opened'
  /** 開封済みの安全マスに再着地 */
  | 'safe-already-open'
  /** 未発見の爆弾に着地（ミス） */
  | 'mine'
  /** 既に見えている爆弾に再着地（暫定仕様: これもミス） */
  | 'mine-again';

export interface LastShot {
  readonly pullPoint: Vec2;
  readonly direction: Vec2;
  readonly pullLength: number;
  readonly landing: Vec2;
  /** 停止したセル。盤面外は null。 */
  readonly cell: number | null;
  readonly outcome: ShotOutcome;
}

export interface GameState {
  readonly config: GameConfig;
  readonly mines: readonly boolean[];
  readonly counts: readonly number[];
  /** 開いたマス。安全マスは数字が、爆弾マスは発見済みとして見え続ける。 */
  readonly revealed: readonly boolean[];
  readonly shots: number;
  readonly misses: number;
  readonly openedSafe: number;
  readonly safeTotal: number;
  readonly status: 'playing' | 'cleared';
  readonly lastShot: LastShot | null;
}

/** シードから GameConfig を作る。倍率は盤面とは独立した乱数列から決める。 */
export function createConfig(params: {
  mode: GameMode;
  difficulty: Difficulty;
  seed: string;
  dailyDate?: string;
}): GameConfig {
  const spec = DIFFICULTIES[params.difficulty];
  const rng = createRng(`${params.seed}|multiplier`);
  const { min, max } = SHOT_MULTIPLIER_RANGE;
  return {
    mode: params.mode,
    difficulty: params.difficulty,
    cols: spec.size,
    rows: spec.size,
    mines: spec.mines,
    seed: params.seed,
    shotMultiplier: min + rng() * (max - min),
    algorithmVersion: ALGORITHM_VERSION,
    ...(params.dailyDate !== undefined ? { dailyDate: params.dailyDate } : {}),
  };
}

export function createGame(config: GameConfig): GameState {
  const mines = placeMines(config.cols, config.rows, config.mines, createRng(`${config.seed}|mines`));
  const mineTotal = mines.filter(Boolean).length;
  return {
    config,
    mines,
    counts: computeCounts(mines, config.cols, config.rows),
    revealed: new Array<boolean>(mines.length).fill(false),
    shots: 0,
    misses: 0,
    openedSafe: 0,
    safeTotal: mines.length - mineTotal,
    status: 'playing',
    lastShot: null,
  };
}

export type FireResult =
  | { kind: 'cancel'; reason: Pull['status'] | 'finished' }
  | { kind: 'shot'; next: GameState; shot: LastShot };

/**
 * 射出を適用した次の状態を返す（純粋関数）。停止位置は入力と発射倍率だけで決まる。
 * キャンセル（短すぎる／後方）の場合は状態を変えず、投数も加算しない。
 */
export function fireShot(state: GameState, pullVector: Vec2): FireResult {
  if (state.status !== 'playing') return { kind: 'cancel', reason: 'finished' };

  const computed = computeShot(pullVector, state.config.shotMultiplier);
  if (!isShot(computed)) return { kind: 'cancel', reason: computed.status };

  const { cols, rows } = state.config;
  const cell = cellIndexAt(computed.landing, cols, rows);
  const revealed = state.revealed.slice();
  let misses = state.misses;
  let openedSafe = state.openedSafe;
  let outcome: ShotOutcome;

  if (cell === null) {
    outcome = 'outside';
  } else if (state.mines[cell]) {
    outcome = revealed[cell] ? 'mine-again' : 'mine';
    revealed[cell] = true;
    misses += 1;
  } else if (revealed[cell]) {
    outcome = 'safe-already-open';
  } else {
    outcome = 'safe-opened';
    openedSafe += openSafeRegion(cell, state, revealed);
  }

  const shot: LastShot = {
    pullPoint: computed.pullPoint,
    direction: computed.direction,
    pullLength: computed.pullLength,
    landing: computed.landing,
    cell,
    outcome,
  };
  const next: GameState = {
    ...state,
    revealed,
    shots: state.shots + 1,
    misses,
    openedSafe,
    status: openedSafe >= state.safeTotal ? 'cleared' : 'playing',
    lastShot: shot,
  };
  return { kind: 'shot', next, shot };
}

/** 安全マスを開き、数字0なら隣接する安全マスへ連鎖する。新たに開いた個数を返す。 */
function openSafeRegion(start: number, state: GameState, revealed: boolean[]): number {
  const { cols, rows } = state.config;
  let opened = 0;
  const stack = [start];
  while (stack.length > 0) {
    const index = stack.pop() as number;
    if (revealed[index] || state.mines[index]) continue;
    revealed[index] = true;
    opened += 1;
    if (state.counts[index] === 0) {
      for (const n of neighborIndices(index, cols, rows)) {
        if (!revealed[n] && !state.mines[n]) stack.push(n);
      }
    }
  }
  return opened;
}

/** 開発用: 発射倍率を差し替えた状態を返す。 */
export function withShotMultiplier(state: GameState, shotMultiplier: number): GameState {
  return { ...state, config: { ...state.config, shotMultiplier } };
}
