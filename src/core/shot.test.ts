import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, DIFFICULTIES, DIFFICULTY_ORDER, LAUNCHER, MAX_PULL_LENGTH, MIN_PULL_LENGTH, SHOT_MULTIPLIER_RANGE } from './constants';
import { cellCenter, cellIndexAt, computeShot, isShot, resolvePull } from './shot';

describe('射出計算', () => {
  it('ドラッグ方向の逆向きへ石が飛ぶ', () => {
    // 真下に引く → 真上に飛ぶ
    const down = computeShot({ x: 0, y: -10 }, 4);
    expect(isShot(down)).toBe(true);
    if (!isShot(down)) return;
    expect(down.landing.x).toBeCloseTo(LAUNCHER.x);
    expect(down.landing.y).toBeCloseTo(LAUNCHER.y - 40);

    // 左下に引く（pullVector は右上向き）→ 右上に飛ぶ
    const diag = computeShot({ x: 5, y: -5 }, 4);
    if (!isShot(diag)) throw new Error('expected shot');
    expect(diag.landing.x).toBeGreaterThan(LAUNCHER.x);
    expect(diag.landing.y).toBeLessThan(LAUNCHER.y);
  });

  it('飛距離 = 引っ張り量 × 倍率、引っ張り量は上限でクランプされる', () => {
    const shot = computeShot({ x: 0, y: -1000 }, 3);
    if (!isShot(shot)) throw new Error('expected shot');
    expect(shot.pullLength).toBe(MAX_PULL_LENGTH);
    expect(LAUNCHER.y - shot.landing.y).toBeCloseTo(MAX_PULL_LENGTH * 3);
  });

  it('同じ入力＋同じ倍率なら毎回同じ着地点', () => {
    const a = computeShot({ x: 3.3, y: -17.9 }, 3.77);
    const b = computeShot({ x: 3.3, y: -17.9 }, 3.77);
    expect(a).toEqual(b);
  });

  it('短すぎる引っ張りと後方への射出はキャンセル', () => {
    expect(isShot(computeShot({ x: 0, y: -(MIN_PULL_LENGTH - 0.01) }, 4))).toBe(false);
    expect(computeShot({ x: 0, y: 10 }, 4)).toMatchObject({ status: 'backward' });
    expect(computeShot({ x: 10, y: 0 }, 4)).toMatchObject({ status: 'backward' });
    expect(computeShot({ x: NaN, y: -10 }, 4)).toMatchObject({ status: 'invalid' });
    expect(computeShot({ x: 0, y: 0 }, 4)).toMatchObject({ status: 'too-short' });
  });

  it('ドラッグ中のプレビュー（resolvePull）は着地点を含まない', () => {
    expect(resolvePull({ x: 0, y: -10 })).not.toHaveProperty('landing');
  });
});

describe('停止セルの判定', () => {
  it('セル境界上の点も常に一意のセルに属する', () => {
    for (const size of [6, 8, 10, 16]) {
      for (let k = 0; k <= size; k++) {
        const edge = (k * BOARD_SIZE) / size;
        for (const dx of [-1e-9, 0, 1e-9]) {
          const idx = cellIndexAt({ x: edge + dx, y: edge + dx }, size, size);
          if (edge + dx < 0 || edge + dx >= BOARD_SIZE) {
            expect(idx).toBeNull();
          } else {
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(idx).toBeLessThan(size * size);
          }
        }
      }
    }
  });

  it('盤面の端: 0 は盤面内、BOARD_SIZE ちょうどは盤面外（半開区間）', () => {
    expect(cellIndexAt({ x: 0, y: 0 }, 10, 10)).toBe(0);
    expect(cellIndexAt({ x: BOARD_SIZE, y: 0 }, 10, 10)).toBeNull();
    expect(cellIndexAt({ x: BOARD_SIZE - 1e-12, y: BOARD_SIZE - 1e-12 }, 10, 10)).toBe(99);
    expect(cellIndexAt({ x: -0.0001, y: 5 }, 10, 10)).toBeNull();
    expect(cellIndexAt({ x: NaN, y: 5 }, 10, 10)).toBeNull();
  });

  it('セル中心はそのセルに属する', () => {
    for (const size of [6, 8, 10, 16]) {
      for (let i = 0; i < size * size; i++) {
        expect(cellIndexAt(cellCenter(i, size, size), size, size)).toBe(i);
      }
    }
  });
});

describe('発射倍率の範囲（全難易度）', () => {
  it('最小倍率・最大引っ張りで最遠マスの中心に届く', () => {
    for (const id of DIFFICULTY_ORDER) {
      const size = DIFFICULTIES[id].size;
      let farthest = 0;
      for (let i = 0; i < size * size; i++) {
        const c = cellCenter(i, size, size);
        farthest = Math.max(farthest, Math.hypot(c.x - LAUNCHER.x, c.y - LAUNCHER.y));
      }
      expect(MAX_PULL_LENGTH * SHOT_MULTIPLIER_RANGE.min).toBeGreaterThanOrEqual(farthest);
    }
  });

  it('最大倍率でも最近マスの中心を、最小引っ張り量より余裕を持って狙える', () => {
    for (const id of DIFFICULTY_ORDER) {
      const size = DIFFICULTIES[id].size;
      let nearest = Infinity;
      for (let i = 0; i < size * size; i++) {
        const c = cellCenter(i, size, size);
        nearest = Math.min(nearest, Math.hypot(c.x - LAUNCHER.x, c.y - LAUNCHER.y));
      }
      expect(nearest / SHOT_MULTIPLIER_RANGE.max).toBeGreaterThan(MIN_PULL_LENGTH * 1.5);
    }
  });
});
