import { ALGORITHM_VERSION, type Difficulty } from './constants';
import { createConfig, type GameConfig } from './game';

/** 日本時間（Asia/Tokyo）の日付を YYYY-MM-DD で返す。 */
export function getJstDateString(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const pick = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/** 日付・難易度・生成アルゴリズムのバージョンから決まる種。 */
export function dailySeed(date: string, difficulty: Difficulty, algorithmVersion = ALGORITHM_VERSION): string {
  return `sling-sweeper|v${algorithmVersion}|daily|${date}|${difficulty}`;
}

export function createDailyConfig(date: string, difficulty: Difficulty): GameConfig {
  return createConfig({ mode: 'daily', difficulty, seed: dailySeed(date, difficulty), dailyDate: date });
}

export function createNormalConfig(difficulty: Difficulty, token: string): GameConfig {
  return createConfig({
    mode: 'normal',
    difficulty,
    seed: `sling-sweeper|v${ALGORITHM_VERSION}|normal|${token}`,
  });
}
