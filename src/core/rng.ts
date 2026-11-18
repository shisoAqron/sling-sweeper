/** シード付き疑似乱数。生成処理で Math.random() は使わない。 */

/** 文字列を 32bit 符号なし整数にハッシュする（xmur3 相当）。 */
export function hashSeed(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32。[0, 1) の乱数列を返す関数を作る。 */
export function createRng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 通常モード用のシード文字列の素。乱数源は crypto（生成処理そのものは seed のみに依存する）。 */
export function randomSeedToken(): string {
  const buf = new Uint32Array(2);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (n) => n.toString(16).padStart(8, '0')).join('');
}
