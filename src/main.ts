import './style.css';
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  LAUNCHER,
  MAX_PULL_LENGTH,
  SHOT_MULTIPLIER_RANGE,
  difficultyLabel,
  isDifficulty,
  type Difficulty,
} from './core/constants';
import { createDailyConfig, createNormalConfig, getJstDateString } from './core/daily';
import { createGame, fireShot, withShotMultiplier, type GameConfig, type GameMode, type GameState } from './core/game';
import { randomSeedToken } from './core/rng';
import { buildShareText, buildTweetUrl } from './core/share';
import { cellCenter, resolvePull, type Pull, type Vec2 } from './core/shot';
import { render } from './render';
import {
  defaultStorage,
  getDailyRecord,
  loadSave,
  recordClear,
  writeSave,
  type SaveData,
} from './storage';
import { fitView, toLogical, type ViewTransform } from './view';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} not found`);
  return node as T;
}

const canvas = el<HTMLCanvasElement>('board');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D is not available');

const storage = defaultStorage();
let save: SaveData = loadSave(storage);

const isDev = new URLSearchParams(location.search).has('dev');

// ---- ゲーム状態 ----------------------------------------------------------

interface Flight {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly startedAt: number;
  readonly duration: number;
  readonly next: GameState;
}

interface Drag {
  readonly pointerId: number;
  readonly start: Vec2;
  current: Vec2;
}

let state: GameState | null = null;
let flight: Flight | null = null;
let drag: Drag | null = null;
/** 開発用UIで倍率を触ったゲームは記録を保存しない。 */
let devTainted = false;
let transform: ViewTransform = fitView(1, 1);
let cssWidth = 1;
let cssHeight = 1;
let dpr = 1;
let frameRequested = false;

// ---- 描画 ----------------------------------------------------------------

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function currentPull(): Pull | null {
  if (!drag) return null;
  return resolvePull({ x: drag.start.x - drag.current.x, y: drag.start.y - drag.current.y });
}

function currentStone(now: number): Vec2 {
  if (flight) {
    const t = Math.min(1, Math.max(0, (now - flight.startedAt) / flight.duration));
    const e = easeOutCubic(t);
    return {
      x: flight.from.x + (flight.to.x - flight.from.x) * e,
      y: flight.from.y + (flight.to.y - flight.from.y) * e,
    };
  }
  const pull = currentPull();
  return pull ? pull.pullPoint : { x: LAUNCHER.x, y: LAUNCHER.y };
}

function draw(now: number): void {
  if (!state || !ctx) return;
  render(ctx, { state, transform, dpr, cssWidth, cssHeight, stone: currentStone(now), pull: currentPull() });
}

function frame(now: number): void {
  frameRequested = false;
  if (flight && now - flight.startedAt >= flight.duration) {
    landFlight();
  }
  draw(now);
  if (flight) requestFrame();
}

function requestFrame(): void {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(frame);
}

function resize(): void {
  const stage = canvas.parentElement as HTMLElement;
  const rect = stage.getBoundingClientRect();
  cssWidth = Math.max(1, Math.floor(rect.width));
  cssHeight = Math.max(1, Math.floor(rect.height));
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  transform = fitView(cssWidth, cssHeight);
  requestFrame();
}

new ResizeObserver(resize).observe(canvas.parentElement as HTMLElement);

// ---- 入力 ----------------------------------------------------------------

function pointerToLogical(e: PointerEvent): Vec2 {
  const rect = canvas.getBoundingClientRect();
  return toLogical(transform, e.clientX - rect.left, e.clientY - rect.top);
}

canvas.addEventListener('pointerdown', (e) => {
  if (!state || state.status !== 'playing' || flight || drag) return;
  if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  const p = pointerToLogical(e);
  drag = { pointerId: e.pointerId, start: p, current: p };
  requestFrame();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  e.preventDefault();
  drag.current = pointerToLogical(e);
  requestFrame();
});

canvas.addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.pointerId || !state) return;
  e.preventDefault();
  drag.current = pointerToLogical(e);
  // ドラッグ開始点を基準にした相対量で引く（盤面のどこからでも操作できる）。
  const pullVector = { x: drag.start.x - drag.current.x, y: drag.start.y - drag.current.y };
  drag = null;

  const result = fireShot(state, pullVector);
  if (result.kind === 'cancel') {
    requestFrame();
    return;
  }
  const travel = Math.hypot(result.shot.landing.x - LAUNCHER.x, result.shot.landing.y - LAUNCHER.y);
  flight = {
    from: { x: result.shot.pullPoint.x, y: result.shot.pullPoint.y },
    to: result.shot.landing,
    startedAt: performance.now(),
    // 演出時間は見た目だけの値。判定は fireShot で確定済みで、フレームレートに依存しない。
    duration: Math.min(1100, 450 + travel * 4),
    next: result.next,
  };
  requestFrame();
});

canvas.addEventListener('pointercancel', (e) => {
  if (drag && e.pointerId === drag.pointerId) {
    drag = null;
    requestFrame();
  }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function landFlight(): void {
  if (!flight) return;
  state = flight.next;
  flight = null;
  updateHud();
  if (state.status === 'cleared') showResult(state);
}

// ---- HUD / メニュー ------------------------------------------------------

const hud = {
  shots: el('stat-shots'),
  misses: el('stat-misses'),
  remaining: el('stat-remaining'),
  mode: el('mode-label'),
};

function modeText(config: GameConfig): string {
  const base = difficultyLabel(config.difficulty);
  return config.mode === 'daily' && config.dailyDate ? `Daily ${config.dailyDate} · ${base}` : `通常 · ${base}`;
}

function updateHud(): void {
  if (!state) return;
  hud.shots.textContent = String(state.shots);
  hud.misses.textContent = String(state.misses);
  hud.remaining.textContent = String(state.safeTotal - state.openedSafe);
  hud.mode.textContent = modeText(state.config) + (devTainted ? ' · DEV（記録なし）' : '');
}

const menu = el('menu');
const result = el('result');
const difficultySelect = el<HTMLSelectElement>('difficulty');
const menuInfo = el('menu-info');

for (const id of DIFFICULTY_ORDER) {
  const spec = DIFFICULTIES[id];
  const option = document.createElement('option');
  option.value = id;
  option.textContent = `${spec.label} ${spec.size}×${spec.size}（地雷${spec.mines}）`;
  difficultySelect.append(option);
}
difficultySelect.value = DEFAULT_DIFFICULTY;

function selectedMode(): GameMode {
  const checked = document.querySelector<HTMLInputElement>('input[name="mode"]:checked');
  return checked?.value === 'daily' ? 'daily' : 'normal';
}

function selectedDifficulty(): Difficulty {
  return isDifficulty(difficultySelect.value) ? difficultySelect.value : DEFAULT_DIFFICULTY;
}

function formatRecord(r: { shots: number; misses: number }): string {
  return `${r.shots}投 / ミス${r.misses}`;
}

function updateMenuInfo(): void {
  const difficulty = selectedDifficulty();
  if (selectedMode() === 'daily') {
    const date = getJstDateString();
    const config = createDailyConfig(date, difficulty);
    const record = getDailyRecord(save, date, difficulty, config.algorithmVersion);
    menuInfo.textContent = record
      ? `${date}（JST）｜初回 ${formatRecord(record.first)}｜ベスト ${formatRecord(record.best)}`
      : `${date}（JST）｜まだ挑戦していません`;
  } else {
    const best = save.normalBest[difficulty];
    menuInfo.textContent = best ? `この難易度のベスト: ${formatRecord(best)}` : 'この難易度はまだクリアしていません';
  }
}

document.querySelectorAll('input[name="mode"]').forEach((n) => n.addEventListener('change', updateMenuInfo));
difficultySelect.addEventListener('change', updateMenuInfo);

function startGame(config: GameConfig): void {
  state = createGame(config);
  flight = null;
  drag = null;
  devTainted = false;
  menu.hidden = true;
  result.hidden = true;
  syncDevPanel();
  updateHud();
  requestFrame();
}

function startFromMenu(): void {
  const difficulty = selectedDifficulty();
  if (selectedMode() === 'daily') {
    // 新規開始のときだけ当日の盤面を使う。プレイ中に日付が変わっても差し替えない。
    startGame(createDailyConfig(getJstDateString(), difficulty));
  } else {
    startGame(createNormalConfig(difficulty, randomSeedToken()));
  }
}

/** やり直し: 通常は新しい盤面・倍率、日替わりは同じ盤面でリトライ。 */
function restart(): void {
  if (!state) return;
  const { config } = state;
  startGame(config.mode === 'daily' ? config : createNormalConfig(config.difficulty, randomSeedToken()));
}

function openMenu(): void {
  drag = null;
  updateMenuInfo();
  menu.hidden = false;
  result.hidden = true;
}

el('btn-start').addEventListener('click', startFromMenu);
el('btn-restart').addEventListener('click', restart);
el('btn-menu').addEventListener('click', openMenu);
el('btn-retry').addEventListener('click', restart);
el('btn-result-menu').addEventListener('click', openMenu);

// ---- 結果 / 共有 ---------------------------------------------------------

function showResult(finished: GameState): void {
  const { config } = finished;
  let outcome = null;
  if (!devTainted) {
    outcome = recordClear(save, config, { shots: finished.shots, misses: finished.misses });
    save = outcome.data;
    writeSave(storage, save);
  }

  el('res-shots').textContent = `${finished.shots}投`;
  el('res-misses').textContent = `${finished.misses}回`;
  el('res-mode').textContent = config.mode === 'daily' ? `日替わり · ${difficultyLabel(config.difficulty)}` : `通常 · ${difficultyLabel(config.difficulty)}`;
  el('res-id-label').textContent = config.mode === 'daily' ? '日付' : 'ID';
  el('res-id').textContent = config.mode === 'daily' ? (config.dailyDate ?? '') : config.seed.split('|').pop()?.slice(0, 8) ?? '';

  const lines: string[] = [];
  if (devTainted) {
    lines.push('開発用の倍率変更を使ったため、記録は保存していません。');
  } else if (outcome) {
    if (config.mode === 'daily') {
      lines.push(outcome.isFirst ? '今日の初回クリア！（初回記録として保存）' : 'リトライの結果です（初回記録は変わりません）。');
    }
    if (outcome.isBest) {
      lines.push(outcome.previousBest ? `自己ベスト更新！（前回 ${formatRecord(outcome.previousBest)}）` : '自己ベストを記録しました。');
    } else if (outcome.previousBest) {
      lines.push(`自己ベスト: ${formatRecord(outcome.previousBest)}`);
    }
  }
  el('res-records').textContent = lines.join('\n');
  el('res-records').style.whiteSpace = 'pre-line';

  const text = buildShareText({ config, shots: finished.shots, misses: finished.misses });
  el('res-share').textContent = text;
  const pageUrl = `${location.origin}${location.pathname}`;
  el<HTMLAnchorElement>('btn-tweet').href = buildTweetUrl(text, pageUrl);
  copyButton.textContent = '結果をコピー';
  copyButton.dataset.text = `${text}\n${pageUrl}`;
  result.hidden = false;
}

const copyButton = el<HTMLButtonElement>('btn-copy');
copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(copyButton.dataset.text ?? '');
    copyButton.textContent = 'コピーしました';
  } catch {
    copyButton.textContent = 'コピーできませんでした';
  }
});

// ---- 開発用UI（?dev で表示）---------------------------------------------

const devPanel = el('dev-panel');
const devSlider = el<HTMLInputElement>('dev-multiplier');
const devOut = el('dev-multiplier-out');
const devInfo = el('dev-info');
let originalMultiplier: number = SHOT_MULTIPLIER_RANGE.min;

function syncDevPanel(): void {
  if (!isDev || !state) return;
  devPanel.hidden = false;
  originalMultiplier = state.config.shotMultiplier;
  devSlider.value = String(state.config.shotMultiplier);
  devOut.textContent = state.config.shotMultiplier.toFixed(2);
  updateDevInfo();
}

function updateDevInfo(): void {
  if (!state) return;
  const { cols, rows, shotMultiplier } = state.config;
  let far = 0;
  let near = Infinity;
  for (let i = 0; i < cols * rows; i++) {
    const c = cellCenter(i, cols, rows);
    const d = Math.hypot(c.x - LAUNCHER.x, c.y - LAUNCHER.y);
    far = Math.max(far, d);
    near = Math.min(near, d);
  }
  devInfo.textContent =
    `最遠セル中心 ${far.toFixed(1)} / 最近 ${near.toFixed(1)}｜この倍率の最大飛距離 ${(shotMultiplier * MAX_PULL_LENGTH).toFixed(1)}` +
    `（${shotMultiplier * MAX_PULL_LENGTH >= far ? '全マス中心に届く' : '最遠マスに届かない'}）`;
}

devSlider.addEventListener('input', () => {
  if (!state) return;
  devTainted = true;
  state = withShotMultiplier(state, Number(devSlider.value));
  devOut.textContent = Number(devSlider.value).toFixed(2);
  updateHud();
  updateDevInfo();
});

el('dev-reset').addEventListener('click', () => {
  if (!state) return;
  state = withShotMultiplier(state, originalMultiplier);
  devSlider.value = String(originalMultiplier);
  devOut.textContent = originalMultiplier.toFixed(2);
  updateDevInfo();
});

// ---- 起動 ----------------------------------------------------------------

// メニュー背後に表示する盤面（操作はメニューが覆うので不可）。
state = createGame(createNormalConfig(DEFAULT_DIFFICULTY, randomSeedToken()));
updateHud();
updateMenuInfo();
resize();
