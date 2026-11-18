import { describe, expect, it } from 'vitest';
import { createDailyConfig, createNormalConfig } from './daily';
import { createGame } from './game';
import { buildShareText, buildTweetUrl } from './share';

describe('共有文', () => {
  it('日替わり: 日付・投数・ミス数を含み、盤面情報を含まない', () => {
    const config = createDailyConfig('2026-11-18', 'proto');
    const text = buildShareText({ config, shots: 42, misses: 3 });
    expect(text).toContain('📅 Daily 2026-11-18');
    expect(text).toContain('🎯 42投でクリア！');
    expect(text).toContain('💣 ミス 3回');
    expect(text).toContain('#スリングスイーパー');
    expect(text).not.toContain(config.seed);
    const mineIndex = createGame(config).mines.indexOf(true);
    expect(text).not.toContain(`${mineIndex},`);
  });

  it('通常モード: 日付行の代わりにモードを表示', () => {
    const text = buildShareText({ config: createNormalConfig('hard', 'abc'), shots: 80, misses: 10 });
    expect(text).toContain('Normal');
    expect(text).not.toContain('abc');
  });

  it('X 投稿URLはエンコードされる', () => {
    const url = buildTweetUrl('a b\n#x', 'https://example.com/sling-sweeper/');
    expect(url.startsWith('https://twitter.com/intent/tweet?text=')).toBe(true);
    expect(url).toContain('text=a%20b%0A%23x');
    expect(url).toContain('&url=https%3A%2F%2Fexample.com%2Fsling-sweeper%2F');
  });
});
