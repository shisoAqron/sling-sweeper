import { describe, expect, it } from 'vitest';
import { computeCounts, neighborIndices, placeMines } from './board';
import { createRng } from './rng';

describe('地雷配置', () => {
  it('指定個数ちょうどの地雷を置き、同じシードなら同じ配置', () => {
    const a = placeMines(10, 10, 15, createRng('seed-a'));
    const b = placeMines(10, 10, 15, createRng('seed-a'));
    const c = placeMines(10, 10, 15, createRng('seed-b'));
    expect(a.filter(Boolean)).toHaveLength(15);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('安全マスが最低1つ残る', () => {
    const mines = placeMines(3, 3, 100, createRng('x'));
    expect(mines.filter((m) => !m).length).toBeGreaterThanOrEqual(1);
  });
});

describe('数字計算', () => {
  it('隣接8マスの地雷数を数える（角・辺でも範囲外を数えない）', () => {
    // 3x3 の中央だけが地雷（地雷マス自身の数字は0）
    const mines = [false, false, false, false, true, false, false, false, false];
    expect(computeCounts(mines, 3, 3)).toEqual([1, 1, 1, 1, 0, 1, 1, 1, 1]);
    expect(neighborIndices(0, 3, 3).sort()).toEqual([1, 3, 4]);
    expect(neighborIndices(4, 3, 3)).toHaveLength(8);
  });
});
