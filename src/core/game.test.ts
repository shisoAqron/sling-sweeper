import { describe, expect, it } from 'vitest';
import { LAUNCHER } from './constants';
import { createConfig, createGame, fireShot, type GameConfig, type GameState } from './game';
import { cellCenter, type Vec2 } from './shot';

/** 指定した盤面を直接組み立てる（'*' が地雷、'.' が安全）。 */
function makeState(rows: string[], shotMultiplier = 4): GameState {
  const size = rows.length;
  const mines = rows.join('').split('').map((ch) => ch === '*');
  const base = createGame(
    createConfig({ mode: 'normal', difficulty: 'easy', seed: 'test' }),
  );
  const config: GameConfig = { ...base.config, cols: size, rows: size, mines: mines.filter(Boolean).length, shotMultiplier };
  // counts は game 側の関数で計算した値を使うため、一度 createGame と同じ形に揃える
  return { ...createGameFromMines(config, mines) };
}

import { computeCounts } from './board';
function createGameFromMines(config: GameConfig, mines: boolean[]): GameState {
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

/** 指定セルの中心に着地させる pullVector（倍率ぴったりで計算）。 */
function pullToLand(state: GameState, target: Vec2): Vec2 {
  const dx = target.x - LAUNCHER.x;
  const dy = target.y - LAUNCHER.y;
  const m = state.config.shotMultiplier;
  // 飛距離 = pullLength × m。pullVector（発射台 − ドラッグ終点）は飛ぶ向きと同じ向き
  return { x: dx / m, y: dy / m };
}

function shootAtCell(state: GameState, index: number) {
  const { cols, rows } = state.config;
  const result = fireShot(state, pullToLand(state, cellCenter(index, cols, rows)));
  if (result.kind !== 'shot') throw new Error(`cancelled: ${result.reason}`);
  return result;
}

describe('マインスイーパー部分', () => {
  const board = [
    '....',
    '....',
    '....',
    '...*',
  ];

  it('石の中心が止まったマスだけを開く（0の連鎖は安全マスのみ）', () => {
    const state = makeState(board);
    const { next, shot } = shootAtCell(state, 0);
    expect(shot.outcome).toBe('safe-opened');
    expect(next.shots).toBe(1);
    expect(next.misses).toBe(0);
    // 連鎖で開く範囲に地雷は含まれない
    expect(next.revealed[15]).toBe(false);
    // 連鎖が数字セル(>0)で止まる: 地雷(15)の隣接 10,11,14 は開くが 15 は開かない
    expect(next.revealed[10]).toBe(true);
    expect(next.openedSafe).toBe(15);
    expect(next.status).toBe('cleared');
  });

  it('数字セルに止まった場合は連鎖せず、そのマスだけ開く', () => {
    const state = makeState(board);
    const { next } = shootAtCell(state, 14); // 地雷(15)の隣 → 数字1
    expect(next.revealed.filter(Boolean)).toHaveLength(1);
    expect(next.revealed[14]).toBe(true);
    expect(next.status).toBe('playing');
  });

  it('爆弾に当たるとミスが増え、爆弾は見えたまま残り、ゲームは続く', () => {
    const state = makeState(board);
    const { next, shot } = shootAtCell(state, 15);
    expect(shot.outcome).toBe('mine');
    expect(next.misses).toBe(1);
    expect(next.shots).toBe(1);
    expect(next.revealed[15]).toBe(true);
    expect(next.status).toBe('playing');
  });

  it('見えている爆弾への再着地もミスを1加算する（暫定仕様）', () => {
    const state = makeState(board);
    const first = shootAtCell(state, 15).next;
    const second = shootAtCell(first, 15);
    expect(second.shot.outcome).toBe('mine-again');
    expect(second.next.misses).toBe(2);
    expect(second.next.revealed[15]).toBe(true);
  });

  it('開封済みマスへの再着地は盤面を変えず、投数だけ加算する', () => {
    const state = makeState(board);
    const first = shootAtCell(state, 14).next;
    const second = shootAtCell(first, 14);
    expect(second.shot.outcome).toBe('safe-already-open');
    expect(second.next.revealed).toEqual(first.revealed);
    expect(second.next.shots).toBe(2);
    expect(second.next.misses).toBe(0);
  });

  it('盤面外に止まったら何も開かず投数のみ加算し、着地点は記録される', () => {
    const state = makeState(board);
    // 真上に最大限飛ばす → 盤面の上へはみ出す
    const result = fireShot(state, { x: 0, y: -40 });
    if (result.kind !== 'shot') throw new Error('expected shot');
    expect(result.shot.outcome).toBe('outside');
    expect(result.shot.cell).toBeNull();
    expect(result.next.shots).toBe(1);
    expect(result.next.revealed.every((r) => !r)).toBe(true);
    expect(result.next.lastShot?.landing.y).toBeLessThan(0);
  });

  it('キャンセル入力は投数を加算しない', () => {
    const state = makeState(board);
    expect(fireShot(state, { x: 0, y: -0.5 }).kind).toBe('cancel');
    expect(fireShot(state, { x: 0, y: 20 }).kind).toBe('cancel');
  });

  it('すべての安全マスを開くとクリアになり、爆弾を開く必要はない', () => {
    const state = makeState(['*.', '..']);
    let s = state;
    for (const i of [1, 2, 3]) s = shootAtCell(s, i).next;
    expect(s.status).toBe('cleared');
    expect(s.revealed[0]).toBe(false);
    expect(s.misses).toBe(0);
  });

  it('クリア後は射出を受け付けない', () => {
    const state = makeState(['*.', '..']);
    let s = state;
    for (const i of [1, 2, 3]) s = shootAtCell(s, i).next;
    expect(fireShot(s, { x: 0, y: -10 })).toEqual({ kind: 'cancel', reason: 'finished' });
  });

  it('直前の射出の方向・引っ張り量・着地点が lastShot に残る', () => {
    const state = makeState(board);
    const { next } = shootAtCell(state, 5);
    expect(next.lastShot).not.toBeNull();
    expect(next.lastShot?.cell).toBe(5);
    expect(next.lastShot?.pullLength).toBeGreaterThan(0);
    expect(next.lastShot?.direction.y).toBeLessThan(0);
  });
});

describe('ゲーム生成', () => {
  it('同じシードなら同じ盤面と発射倍率、シードが違えば変わり得る', () => {
    const cfg = createConfig({ mode: 'normal', difficulty: 'normal', seed: 's1' });
    const a = createGame(cfg);
    const b = createGame(createConfig({ mode: 'normal', difficulty: 'normal', seed: 's1' }));
    expect(a.mines).toEqual(b.mines);
    expect(a.config.shotMultiplier).toBe(b.config.shotMultiplier);
    const other = createConfig({ mode: 'normal', difficulty: 'normal', seed: 's2' });
    expect(other.shotMultiplier).not.toBe(cfg.shotMultiplier);
  });

  it('射出しても発射倍率は変化しない', () => {
    const state = createGame(createConfig({ mode: 'normal', difficulty: 'normal', seed: 's1' }));
    const result = fireShot(state, { x: 1, y: -10 });
    if (result.kind !== 'shot') throw new Error('expected shot');
    expect(result.next.config.shotMultiplier).toBe(state.config.shotMultiplier);
  });

  it('入力をミューテートしない（元の状態は不変）', () => {
    const state = createGame(createConfig({ mode: 'normal', difficulty: 'easy', seed: 's1' }));
    const before = JSON.stringify(state);
    fireShot(state, { x: 0, y: -20 });
    expect(JSON.stringify(state)).toBe(before);
  });
});
