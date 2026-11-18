import { describe, expect, it } from 'vitest';
import { createDailyConfig, getJstDateString } from './daily';
import { createGame } from './game';
import { SHOT_MULTIPLIER_RANGE } from './constants';

describe('日替わり', () => {
  it('日本時間で日付を区切る', () => {
    // UTC 14:59 = JST 23:59、UTC 15:00 = JST 翌0:00
    expect(getJstDateString(new Date('2026-11-18T14:59:59Z'))).toBe('2026-11-18');
    expect(getJstDateString(new Date('2026-11-18T15:00:00Z'))).toBe('2026-11-19');
    expect(getJstDateString(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
  });

  it('同じ日付・難易度なら同じ盤面と発射特性（リロード相当）', () => {
    const a = createDailyConfig('2026-11-18', 'normal');
    const b = createDailyConfig('2026-11-18', 'normal');
    expect(a).toEqual(b);
    expect(createGame(a).mines).toEqual(createGame(b).mines);
  });

  it('日付や難易度が違えば別の盤面になる', () => {
    const a = createGame(createDailyConfig('2026-11-18', 'normal'));
    const b = createGame(createDailyConfig('2026-11-19', 'normal'));
    expect(a.mines).not.toEqual(b.mines);
    expect(createDailyConfig('2026-11-18', 'hard').cols).toBe(16);
  });

  it('発射倍率が許容範囲内に収まる', () => {
    for (let d = 1; d <= 28; d++) {
      const date = `2026-11-${String(d).padStart(2, '0')}`;
      const { shotMultiplier } = createDailyConfig(date, 'normal');
      expect(shotMultiplier).toBeGreaterThanOrEqual(SHOT_MULTIPLIER_RANGE.min);
      expect(shotMultiplier).toBeLessThanOrEqual(SHOT_MULTIPLIER_RANGE.max);
    }
  });

  it('日替わりの配置は固定: アルゴリズム変更の検知用スナップショット', () => {
    const state = createGame(createDailyConfig('2026-11-18', 'easy'));
    const positions = state.mines.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
    expect(positions).toMatchInlineSnapshot(`
      [
        3,
        7,
        27,
        28,
        31,
      ]
    `);
  });
});
