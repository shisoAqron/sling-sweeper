import type { Vec2 } from './core/shot';

/**
 * 画面（CSSピクセル）と論理座標の変換。入力・描画はこの変換を通すので、
 * 画面サイズ・DPR が違っても同じ論理入力が同じ結果になる。
 */

/** 表示する論理領域。盤面 [0,100] と、その下の発射台・引っ張り範囲を含む。 */
export const VIEW_RECT = { x: -10, y: -4, width: 120, height: 160 } as const;

export interface ViewTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** 表示領域が収まる最大スケールで中央に配置する。 */
export function fitView(cssWidth: number, cssHeight: number): ViewTransform {
  const scale = Math.max(0.0001, Math.min(cssWidth / VIEW_RECT.width, cssHeight / VIEW_RECT.height));
  return {
    scale,
    offsetX: (cssWidth - VIEW_RECT.width * scale) / 2 - VIEW_RECT.x * scale,
    offsetY: (cssHeight - VIEW_RECT.height * scale) / 2 - VIEW_RECT.y * scale,
  };
}

export function toLogical(t: ViewTransform, px: number, py: number): Vec2 {
  return { x: (px - t.offsetX) / t.scale, y: (py - t.offsetY) / t.scale };
}

export function toScreen(t: ViewTransform, p: Vec2): Vec2 {
  return { x: p.x * t.scale + t.offsetX, y: p.y * t.scale + t.offsetY };
}
