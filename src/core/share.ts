import { DIFFICULTIES } from './constants';
import type { GameConfig } from './game';

export interface ShareInput {
  readonly config: GameConfig;
  readonly shots: number;
  readonly misses: number;
}

/** 共有文。爆弾配置や解答につながる情報は含めない。 */
export function buildShareText({ config, shots, misses }: ShareInput): string {
  const spec = DIFFICULTIES[config.difficulty];
  const size = `${spec.size}×${spec.size}`;
  const modeLine =
    config.mode === 'daily' && config.dailyDate
      ? `📅 Daily ${config.dailyDate} [${size}]`
      : `🎮 Normal [${size}]`;
  return [
    '🪨 スリングスイーパー',
    modeLine,
    `🎯 ${shots}投でクリア！`,
    `💣 ミス ${misses}回`,
    '#スリングスイーパー',
  ].join('\n');
}

export function buildTweetUrl(text: string, url: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
