import { describe, expect, it } from 'vitest';
import { fitView, toLogical, toScreen, VIEW_RECT } from './view';
import { createConfig, createGame, fireShot } from './core/game';

describe('画面座標 ⇔ 論理座標', () => {
  it('往復変換で元の座標に戻る', () => {
    for (const [w, h] of [[360, 640], [1280, 720], [820, 1180]] as const) {
      const t = fitView(w, h);
      const p = toLogical(t, 123, 45);
      const back = toScreen(t, p);
      expect(back.x).toBeCloseTo(123);
      expect(back.y).toBeCloseTo(45);
    }
  });

  it('表示領域が画面内に収まる', () => {
    const t = fitView(360, 640);
    const topLeft = toScreen(t, { x: VIEW_RECT.x, y: VIEW_RECT.y });
    const bottomRight = toScreen(t, { x: VIEW_RECT.x + VIEW_RECT.width, y: VIEW_RECT.y + VIEW_RECT.height });
    expect(topLeft.x).toBeGreaterThanOrEqual(-1e-6);
    expect(topLeft.y).toBeGreaterThanOrEqual(-1e-6);
    expect(bottomRight.x).toBeLessThanOrEqual(360 + 1e-6);
    expect(bottomRight.y).toBeLessThanOrEqual(640 + 1e-6);
  });

  it('端末サイズが違っても、同じ論理入力なら同じ停止セルになる', () => {
    const state = createGame(createConfig({ mode: 'normal', difficulty: 'normal', seed: 'device' }));
    const logicalDragStart = { x: 50, y: 112 };
    const logicalDragEnd = { x: 44, y: 130 };
    const outcomes = [[360, 640], [768, 1024], [1920, 1080]].map(([w, h]) => {
      const t = fitView(w as number, h as number);
      // 論理 → 画面 → 論理（実際の入力経路）を通しても同じ論理入力が得られる
      const s = toLogical(t, toScreen(t, logicalDragStart).x, toScreen(t, logicalDragStart).y);
      const e = toLogical(t, toScreen(t, logicalDragEnd).x, toScreen(t, logicalDragEnd).y);
      const r = fireShot(state, { x: s.x - e.x, y: s.y - e.y });
      if (r.kind !== 'shot') throw new Error('expected shot');
      return r.shot.cell;
    });
    expect(new Set(outcomes).size).toBe(1);
  });
});
