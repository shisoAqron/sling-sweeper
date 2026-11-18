import { BOARD_SIZE, LAUNCHER, MAX_PULL_LENGTH } from './core/constants';
import type { GameState } from './core/game';
import type { Pull, Vec2 } from './core/shot';
import type { ViewTransform } from './view';

export interface RenderParams {
  readonly state: GameState;
  readonly transform: ViewTransform;
  readonly dpr: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  /** 石の現在位置（論理座標）。 */
  readonly stone: Vec2;
  /** ドラッグ中の引っ張り。着地点につながる情報（倍率）は含まない。 */
  readonly pull: Pull | null;
}

const COLORS = {
  background: '#1b1f27',
  boardFrame: '#0f1218',
  closed: '#aab4c3',
  closedEdge: '#8a96a8',
  open: '#eef1f6',
  mine: '#f08a7e',
  grid: 'rgba(15, 18, 24, 0.35)',
  launcher: '#3b4658',
  launcherRing: '#6b7a93',
  stone: '#f4c95d',
  stoneEdge: '#8a6b16',
  ghost: 'rgba(120, 190, 255, 0.55)',
  pull: 'rgba(244, 201, 93, 0.9)',
  pullInvalid: 'rgba(200, 205, 215, 0.45)',
};

const NUMBER_COLORS = ['', '#1e6fd9', '#2e8b3d', '#d93a3a', '#6a2fb0', '#a8531a', '#127f8a', '#222', '#666'];

/** 石の半径。小さいマスでも中心位置が読み取れるよう上限を設ける。 */
export function stoneRadius(cols: number): number {
  return Math.min(2.5, (BOARD_SIZE / cols) * 0.4);
}

export function render(ctx: CanvasRenderingContext2D, params: RenderParams): void {
  const { state, transform, dpr, cssWidth, cssHeight } = params;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  // 以降は論理座標で描く。
  ctx.setTransform(dpr * transform.scale, 0, 0, dpr * transform.scale, dpr * transform.offsetX, dpr * transform.offsetY);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  drawBoard(ctx, state);
  drawLauncher(ctx);
  drawLastShot(ctx, state);
  if (params.pull) drawPull(ctx, params.pull);
  drawStone(ctx, params.stone, stoneRadius(state.config.cols));
}

function drawBoard(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { cols, rows } = state.config;
  const cw = BOARD_SIZE / cols;
  const ch = BOARD_SIZE / rows;
  const showAllMines = state.status === 'cleared';

  ctx.fillStyle = COLORS.boardFrame;
  ctx.fillRect(-1, -1, BOARD_SIZE + 2, BOARD_SIZE + 2);

  ctx.font = `700 ${Math.min(cw, ch) * 0.62}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let index = 0; index < cols * rows; index++) {
    const x = (index % cols) * cw;
    const y = Math.floor(index / cols) * ch;
    const revealed = state.revealed[index] === true;
    const isMine = state.mines[index] === true;

    ctx.fillStyle = revealed ? (isMine ? COLORS.mine : COLORS.open) : COLORS.closed;
    ctx.fillRect(x, y, cw, ch);
    if (!revealed) {
      ctx.fillStyle = COLORS.closedEdge;
      ctx.fillRect(x, y + ch * 0.88, cw, ch * 0.12);
    }

    if (revealed && isMine) {
      drawMine(ctx, x + cw / 2, y + ch / 2, Math.min(cw, ch) * 0.28, '#1b1f27');
    } else if (revealed) {
      const count = state.counts[index] ?? 0;
      if (count > 0) {
        ctx.fillStyle = NUMBER_COLORS[count] ?? '#222';
        ctx.fillText(String(count), x + cw / 2, y + ch / 2 + ch * 0.04);
      }
    } else if (showAllMines && isMine) {
      drawMine(ctx, x + cw / 2, y + ch / 2, Math.min(cw, ch) * 0.2, 'rgba(27, 31, 39, 0.45)');
    }
  }

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 0.25;
  ctx.beginPath();
  for (let c = 0; c <= cols; c++) {
    ctx.moveTo(c * cw, 0);
    ctx.lineTo(c * cw, BOARD_SIZE);
  }
  for (let r = 0; r <= rows; r++) {
    ctx.moveTo(0, r * ch);
    ctx.lineTo(BOARD_SIZE, r * ch);
  }
  ctx.stroke();
}

function drawMine(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = r * 0.28;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 4) * i;
    ctx.moveTo(cx - Math.cos(a) * r * 1.5, cy - Math.sin(a) * r * 1.5);
    ctx.lineTo(cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r * 1.5);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawLauncher(ctx: CanvasRenderingContext2D): void {
  // 引っ張り上限の目安（薄い円弧）
  ctx.strokeStyle = 'rgba(107, 122, 147, 0.25)';
  ctx.lineWidth = 0.4;
  ctx.setLineDash([1.2, 1.6]);
  ctx.beginPath();
  ctx.arc(LAUNCHER.x, LAUNCHER.y, MAX_PULL_LENGTH, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = COLORS.launcher;
  ctx.strokeStyle = COLORS.launcherRing;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(LAUNCHER.x, LAUNCHER.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** 直前の1投: 半透明の引っ張り（方向・量）と実際の停止位置。盤面外でも表示する。 */
function drawLastShot(ctx: CanvasRenderingContext2D, state: GameState): void {
  const shot = state.lastShot;
  if (!shot) return;

  ctx.strokeStyle = COLORS.ghost;
  ctx.fillStyle = COLORS.ghost;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(LAUNCHER.x, LAUNCHER.y);
  ctx.lineTo(shot.pullPoint.x, shot.pullPoint.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(shot.pullPoint.x, shot.pullPoint.y, stoneRadius(state.config.cols), 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 0.5;
  ctx.setLineDash([1, 1.4]);
  ctx.beginPath();
  ctx.moveTo(LAUNCHER.x, LAUNCHER.y);
  ctx.lineTo(shot.landing.x, shot.landing.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const r = stoneRadius(state.config.cols);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(shot.landing.x, shot.landing.y, r * 1.5, 0, Math.PI * 2);
  ctx.moveTo(shot.landing.x - r * 2.2, shot.landing.y);
  ctx.lineTo(shot.landing.x + r * 2.2, shot.landing.y);
  ctx.moveTo(shot.landing.x, shot.landing.y - r * 2.2);
  ctx.lineTo(shot.landing.x, shot.landing.y + r * 2.2);
  ctx.stroke();
}

/** ドラッグ中の表示。方向は固定長の矢印で示し、着地点の予測は出さない。 */
function drawPull(ctx: CanvasRenderingContext2D, pull: Pull): void {
  const valid = pull.status === 'ok';
  ctx.strokeStyle = valid ? COLORS.pull : COLORS.pullInvalid;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(LAUNCHER.x, LAUNCHER.y);
  ctx.lineTo(pull.pullPoint.x, pull.pullPoint.y);
  ctx.stroke();

  if (!valid) return;
  const tipLen = 9;
  const start = 8;
  const dx = pull.direction.x;
  const dy = pull.direction.y;
  const sx = LAUNCHER.x + dx * start;
  const sy = LAUNCHER.y + dy * start;
  const ex = LAUNCHER.x + dx * (start + tipLen);
  const ey = LAUNCHER.y + dy * (start + tipLen);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - dx * 2.2 + dy * 1.4, ey - dy * 2.2 - dx * 1.4);
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - dx * 2.2 - dy * 1.4, ey - dy * 2.2 + dx * 1.4);
  ctx.stroke();
}

function drawStone(ctx: CanvasRenderingContext2D, p: Vec2, radius: number): void {
  ctx.fillStyle = COLORS.stone;
  ctx.strokeStyle = COLORS.stoneEdge;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 判定に使われる「中心」を示す点
  ctx.fillStyle = COLORS.stoneEdge;
  ctx.beginPath();
  ctx.arc(p.x, p.y, Math.max(0.35, radius * 0.16), 0, Math.PI * 2);
  ctx.fill();
}
