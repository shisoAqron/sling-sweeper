import { SAVE_SCHEMA_VERSION, isDifficulty, type Difficulty } from './core/constants';
import type { GameConfig } from './core/game';

export interface ResultRecord {
  readonly shots: number;
  readonly misses: number;
  /** ISO 8601 */
  readonly at: string;
}

export interface DailyRecord {
  /** その日・難易度で最初にクリアした結果（公式記録候補）。上書きしない。 */
  readonly first: ResultRecord;
  /** リトライを含む自己ベスト。 */
  readonly best: ResultRecord;
  readonly clears: number;
}

export interface SaveData {
  readonly schemaVersion: number;
  /** キー: dailyRecordKey() */
  readonly daily: Readonly<Record<string, DailyRecord>>;
  /** 通常モードの難易度別ベスト */
  readonly normalBest: Readonly<Partial<Record<Difficulty, ResultRecord>>>;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const STORAGE_KEY = 'sling-sweeper:save';

export function emptySave(): SaveData {
  return { schemaVersion: SAVE_SCHEMA_VERSION, daily: {}, normalBest: {} };
}

/** 日替わり記録のキー。生成アルゴリズムのバージョンを含めるので、盤面が変わっても記録が混ざらない。 */
export function dailyRecordKey(date: string, difficulty: Difficulty, algorithmVersion: number): string {
  return `v${algorithmVersion}|${date}|${difficulty}`;
}

/** 少ない投数が良く、同数ならミスが少ない方が良い。 */
export function isBetter(a: ResultRecord, b: ResultRecord): boolean {
  return a.shots < b.shots || (a.shots === b.shots && a.misses < b.misses);
}

function isResultRecord(value: unknown): value is ResultRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.shots === 'number' && typeof v.misses === 'number' && typeof v.at === 'string';
}

/** 保存内容を検証して SaveData にする。解釈できなければ null。将来のスキーマ移行はここで行う。 */
export function parseSave(raw: string): SaveData | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null) return null;
  const obj = json as Record<string, unknown>;
  if (obj.schemaVersion !== SAVE_SCHEMA_VERSION) return null;

  const daily: Record<string, DailyRecord> = {};
  if (typeof obj.daily === 'object' && obj.daily !== null) {
    for (const [key, entry] of Object.entries(obj.daily)) {
      const e = entry as Record<string, unknown> | null;
      if (e && isResultRecord(e.first) && isResultRecord(e.best) && typeof e.clears === 'number') {
        daily[key] = { first: e.first, best: e.best, clears: e.clears };
      }
    }
  }
  const normalBest: Partial<Record<Difficulty, ResultRecord>> = {};
  if (typeof obj.normalBest === 'object' && obj.normalBest !== null) {
    for (const [key, entry] of Object.entries(obj.normalBest)) {
      if (isDifficulty(key) && isResultRecord(entry)) normalBest[key] = entry;
    }
  }
  return { schemaVersion: SAVE_SCHEMA_VERSION, daily, normalBest };
}

export function loadSave(storage: StorageLike | null): SaveData {
  if (!storage) return emptySave();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return emptySave();
    const parsed = parseSave(raw);
    if (parsed) return parsed;
    // 解釈できないデータは消さずに退避してから空で始める（将来バージョンのデータを壊さないため）。
    storage.setItem(`${STORAGE_KEY}:backup:${Date.now()}`, raw);
  } catch {
    // localStorage が使えない環境（プライベートモード等）ではメモリ上のみで動かす。
  }
  return emptySave();
}

export function writeSave(storage: StorageLike | null, data: SaveData): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 保存失敗はゲーム進行を止めない。
  }
}

export interface RecordOutcome {
  readonly data: SaveData;
  /** その日・難易度の初回クリアか（通常モードでは常に false）。 */
  readonly isFirst: boolean;
  /** 自己ベスト更新か（初回も含む）。 */
  readonly isBest: boolean;
  readonly previousBest: ResultRecord | null;
}

/** クリア結果を記録に反映した新しい SaveData を返す（純粋関数）。 */
export function recordClear(
  data: SaveData,
  config: GameConfig,
  result: { shots: number; misses: number },
  now: Date = new Date(),
): RecordOutcome {
  const record: ResultRecord = { shots: result.shots, misses: result.misses, at: now.toISOString() };

  if (config.mode === 'daily' && config.dailyDate) {
    const key = dailyRecordKey(config.dailyDate, config.difficulty, config.algorithmVersion);
    const existing = data.daily[key];
    const entry: DailyRecord = existing
      ? {
          first: existing.first,
          best: isBetter(record, existing.best) ? record : existing.best,
          clears: existing.clears + 1,
        }
      : { first: record, best: record, clears: 1 };
    return {
      data: { ...data, daily: { ...data.daily, [key]: entry } },
      isFirst: !existing,
      isBest: !existing || entry.best === record,
      previousBest: existing?.best ?? null,
    };
  }

  const previous = data.normalBest[config.difficulty] ?? null;
  const isBest = previous === null || isBetter(record, previous);
  return {
    data: isBest ? { ...data, normalBest: { ...data.normalBest, [config.difficulty]: record } } : data,
    isFirst: false,
    isBest,
    previousBest: previous,
  };
}

export function getDailyRecord(data: SaveData, date: string, difficulty: Difficulty, algorithmVersion: number): DailyRecord | null {
  return data.daily[dailyRecordKey(date, difficulty, algorithmVersion)] ?? null;
}

export function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
