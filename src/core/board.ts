/** 地雷配置・数字計算。DOM/Canvas 非依存の純粋関数。 */

export function neighborIndices(index: number, cols: number, rows: number): number[] {
  const col = index % cols;
  const row = Math.floor(index / cols);
  const result: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      result.push(r * cols + c);
    }
  }
  return result;
}

/** 指定個数の地雷を配置する（部分 Fisher–Yates）。安全マスが最低1つ残るよう個数を丸める。 */
export function placeMines(cols: number, rows: number, mineCount: number, rng: () => number): boolean[] {
  const total = cols * rows;
  const count = Math.max(0, Math.min(Math.floor(mineCount), total - 1));
  const order = Array.from({ length: total }, (_, i) => i);
  const mines = new Array<boolean>(total).fill(false);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (total - i));
    const picked = order[j] as number;
    order[j] = order[i] as number;
    order[i] = picked;
    mines[picked] = true;
  }
  return mines;
}

/** 各マスの周囲8マスの地雷数。 */
export function computeCounts(mines: readonly boolean[], cols: number, rows: number): number[] {
  return mines.map((_, index) => neighborIndices(index, cols, rows).filter((n) => mines[n]).length);
}
