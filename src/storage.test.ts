import { describe, expect, it } from 'vitest';
import { createDailyConfig, createNormalConfig } from './core/daily';
import { STORAGE_KEY, emptySave, getDailyRecord, loadSave, parseSave, recordClear, writeSave, type StorageLike } from './storage';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('保存データ', () => {
  const daily = createDailyConfig('2026-11-18', 'proto');

  it('日替わり: 初回記録は上書きせず、ベストだけ更新する', () => {
    const t0 = new Date('2026-11-18T01:00:00Z');
    const first = recordClear(emptySave(), daily, { shots: 50, misses: 5 }, t0);
    expect(first.isFirst).toBe(true);
    expect(first.isBest).toBe(true);

    const better = recordClear(first.data, daily, { shots: 40, misses: 9 }, new Date('2026-11-18T02:00:00Z'));
    expect(better.isFirst).toBe(false);
    expect(better.isBest).toBe(true);

    const worse = recordClear(better.data, daily, { shots: 60, misses: 0 }, new Date('2026-11-18T03:00:00Z'));
    const rec = getDailyRecord(worse.data, '2026-11-18', 'proto', daily.algorithmVersion);
    expect(rec?.first.shots).toBe(50);
    expect(rec?.best.shots).toBe(40);
    expect(rec?.clears).toBe(3);
  });

  it('同じ投数ならミスが少ない方がベスト', () => {
    const a = recordClear(emptySave(), daily, { shots: 40, misses: 5 });
    const b = recordClear(a.data, daily, { shots: 40, misses: 3 });
    expect(b.isBest).toBe(true);
    expect(getDailyRecord(b.data, '2026-11-18', 'proto', daily.algorithmVersion)?.best.misses).toBe(3);
  });

  it('通常モードは難易度別にベストを保存する', () => {
    const normal = createNormalConfig('hard', 'tok');
    const a = recordClear(emptySave(), normal, { shots: 100, misses: 10 });
    const b = recordClear(a.data, normal, { shots: 120, misses: 0 });
    expect(b.isBest).toBe(false);
    expect(b.data.normalBest.hard?.shots).toBe(100);
  });

  it('保存→読込で内容が保たれる。スキーマバージョンを持つ', () => {
    const storage = memoryStorage();
    const { data } = recordClear(emptySave(), daily, { shots: 10, misses: 1 });
    writeSave(storage, data);
    expect(JSON.parse(storage.data[STORAGE_KEY] as string).schemaVersion).toBe(1);
    expect(loadSave(storage)).toEqual(data);
  });

  it('解釈できない／未知バージョンのデータは消さずに退避して空で始める', () => {
    const raw = JSON.stringify({ schemaVersion: 999, daily: {} });
    const storage = memoryStorage({ [STORAGE_KEY]: raw });
    expect(loadSave(storage)).toEqual(emptySave());
    expect(Object.entries(storage.data).some(([k, v]) => k.includes('backup') && v === raw)).toBe(true);
    expect(parseSave('not json')).toBeNull();
  });

  it('localStorage が使えなくても落ちない', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadSave(broken)).toEqual(emptySave());
    expect(() => writeSave(broken, emptySave())).not.toThrow();
    expect(loadSave(null)).toEqual(emptySave());
  });
});
