import React, { useEffect, useRef } from 'react';
import {
  ActiveClassicPiece,
  BoardGrid,
  FloatingText,
  GameMode,
  GameState,
  GrabbedPieceState,
  Particle,
  Point2D,
} from '../types/game';
import { BOARD_COLS, BOARD_ROWS, canPlaceClassicPiece, computeClassicGhostY } from '../game/tetrisEngine';
import { TETROMINO_STYLES } from '../game/tetrominoes';
import { Play, RotateCcw, Trophy } from 'lucide-react';

interface TetrisCanvasProps {
  board: BoardGrid;
  mode: GameMode;
  gameState: GameState;
  classicPiece: ActiveClassicPiece | null;
  grabbedPiece: GrabbedPieceState | null;
  handCursor: Point2D | null; // Normalized 0..1 across unified workspace (0..0.72 = board)
  isPinching: boolean;
  particlesRef: React.MutableRefObject<Particle[]>;
  floatingTextsRef: React.MutableRefObject<FloatingText[]>;
  flashRowsRef: React.MutableRefObject<{ rows: number[]; until: number }>;
  score: number;
  lines: number;
  stageNumber: number;
  pointerFallbackEnabled: boolean;
  onPointerMoveWorkspace?: (pt: Point2D) => void;
  onPointerDownWorkspace?: (pt: Point2D) => void;
  onPointerUpWorkspace?: () => void;
  onRestart: () => void;
  onResume: () => void;
  onNextStage: () => void;
}

const CELL_SIZE = 28;
const CANVAS_W = BOARD_COLS * CELL_SIZE; // 280
const CANVAS_H = BOARD_ROWS * CELL_SIZE; // 560

function drawRoundedCell(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  fill: string,
  border: string,
  highlight: string,
  glow: string,
  alpha: number = 1
) {
  const pad = 1.5;
  const x = px + pad;
  const y = py + pad;
  const s = size - pad * 2;
  const r = 4;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = glow;
  ctx.shadowBlur = alpha > 0.7 ? 10 : 4;

  // Base rounded square
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, r);
  ctx.fillStyle = fill;
  ctx.fill();

  // Inner top-left bevel highlight
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(x + 2, y + s - 3);
  ctx.lineTo(x + 2, y + 2);
  ctx.lineTo(x + s - 3, y + 2);
  ctx.strokeStyle = highlight;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = alpha * 0.55;
  ctx.stroke();

  // Outer crisp neon border
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, r);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.25;
  ctx.stroke();

  ctx.restore();
}

export const TetrisCanvas: React.FC<TetrisCanvasProps> = ({
  board,
  mode,
  gameState,
  classicPiece,
  grabbedPiece,
  handCursor,
  isPinching,
  particlesRef,
  floatingTextsRef,
  flashRowsRef,
  score,
  lines,
  stageNumber,
  pointerFallbackEnabled,
  onPointerMoveWorkspace,
  onPointerDownWorkspace,
  onPointerUpWorkspace,
  onRestart,
  onResume,
  onNextStage,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Store latest render props in a ref so a single 60fps RAF loop draws everything smoothly
  const renderStateRef = useRef({
    board,
    mode,
    gameState,
    classicPiece,
    grabbedPiece,
    handCursor,
    isPinching,
  });
  renderStateRef.current = {
    board,
    mode,
    gameState,
    classicPiece,
    grabbedPiece,
    handCursor,
    isPinching,
  };

  useEffect(() => {
    let rafId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        const targetW = CANVAS_W * dpr;
        const targetH = CANVAS_H * dpr;
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          const {
            board: b,
            mode: m,
            gameState: gs,
            classicPiece: cp,
            grabbedPiece: gp,
            handCursor: cursor,
            isPinching: pinching,
          } = renderStateRef.current;

          const now = performance.now();

          // 1. Translucent Background so live camera & hand skeleton shine through
          ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
          ctx.fillStyle = 'rgba(6, 10, 22, 0.34)';
          ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

          // 2. Subtle Grid lines & intersections
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
          ctx.lineWidth = 1;
          for (let c = 1; c < BOARD_COLS; c++) {
            ctx.beginPath();
            ctx.moveTo(c * CELL_SIZE + 0.5, 0);
            ctx.lineTo(c * CELL_SIZE + 0.5, CANVAS_H);
            ctx.stroke();
          }
          for (let r = 1; r < BOARD_ROWS; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * CELL_SIZE + 0.5);
            ctx.lineTo(CANVAS_W, r * CELL_SIZE + 0.5);
            ctx.stroke();
          }

          // Intersection dots
          ctx.fillStyle = 'rgba(56, 189, 248, 0.32)';
          for (let r = 1; r < BOARD_ROWS; r++) {
            for (let c = 1; c < BOARD_COLS; c++) {
              ctx.fillRect(c * CELL_SIZE - 0.5, r * CELL_SIZE - 0.5, 2, 2);
            }
          }

          // 3. Locked board cells
          for (let r = 0; r < BOARD_ROWS; r++) {
            for (let c = 0; c < BOARD_COLS; c++) {
              const cell = b[r][c];
              if (cell) {
                const style = TETROMINO_STYLES[cell];
                drawRoundedCell(
                  ctx,
                  c * CELL_SIZE,
                  r * CELL_SIZE,
                  CELL_SIZE,
                  style.fill,
                  style.border,
                  style.highlight,
                  style.glow,
                  1
                );
              }
            }
          }

          // 4. Line clear row flash
          if (flashRowsRef.current.rows.length > 0 && now < flashRowsRef.current.until) {
            const progress = (flashRowsRef.current.until - now) / 260;
            for (const rowIdx of flashRowsRef.current.rows) {
              ctx.fillStyle = `rgba(103, 232, 249, ${0.55 * progress})`;
              ctx.fillRect(0, rowIdx * CELL_SIZE, CANVAS_W, CELL_SIZE);
            }
          }

          // 5. Classic Mode: Ghost + Falling Piece
          if (m === 'classic' && cp && gs === 'PLAYING') {
            const style = TETROMINO_STYLES[cp.type];
            const ghostY = computeClassicGhostY(b, cp.matrix, cp.x, cp.y);

            // Ghost drop outline
            for (let r = 0; r < cp.matrix.length; r++) {
              for (let c = 0; c < cp.matrix[r].length; c++) {
                if (!cp.matrix[r][c]) continue;
                const gx = (cp.x + c) * CELL_SIZE;
                const gy = (ghostY + r) * CELL_SIZE;
                if (ghostY + r >= 0) {
                  ctx.save();
                  ctx.strokeStyle = style.border;
                  ctx.lineWidth = 1.5;
                  ctx.setLineDash([4, 3]);
                  ctx.globalAlpha = 0.45;
                  ctx.strokeRect(gx + 3, gy + 3, CELL_SIZE - 6, CELL_SIZE - 6);
                  ctx.restore();
                }
              }
            }

            // Active falling piece
            for (let r = 0; r < cp.matrix.length; r++) {
              for (let c = 0; c < cp.matrix[r].length; c++) {
                if (!cp.matrix[r][c]) continue;
                const by = cp.y + r;
                if (by < 0) continue;
                drawRoundedCell(
                  ctx,
                  (cp.x + c) * CELL_SIZE,
                  by * CELL_SIZE,
                  CELL_SIZE,
                  style.fill,
                  pinching ? '#FFFFFF' : style.border,
                  style.highlight,
                  pinching ? '#22D3EE' : style.glow,
                  1
                );
              }
            }
          }

          // 6. Challenge Mode: Ghost Preview & Held Floating Block
          if (m === 'challenge' && gp && gs === 'PLAYING') {
            const style = TETROMINO_STYLES[gp.type];

            if (gp.isOverBoard) {
              const pulse = 0.72 + 0.25 * Math.sin(now * 0.012);

              for (let r = 0; r < gp.matrix.length; r++) {
                for (let c = 0; c < gp.matrix[r].length; c++) {
                  if (!gp.matrix[r][c]) continue;
                  const gx = gp.boardX + c;
                  const gy = gp.boardY + r;
                  const px = gx * CELL_SIZE;
                  const py = gy * CELL_SIZE;

                  if (gx < 0 || gx >= BOARD_COLS || gy < 0 || gy >= BOARD_ROWS) {
                    continue;
                  }

                  const cellOccupied = b[gy][gx] !== null;

                  if (gp.isValid) {
                    drawRoundedCell(
                      ctx,
                      px,
                      py,
                      CELL_SIZE,
                      style.fill,
                      '#67E8F9',
                      style.highlight,
                      'rgba(34, 211, 238, 0.8)',
                      0.42
                    );
                  } else {
                    ctx.save();
                    ctx.fillStyle = `rgba(244, 63, 94, ${0.35 * pulse})`;
                    ctx.fillRect(px + 2, py + 2, CELL_SIZE - 4, CELL_SIZE - 4);
                    ctx.strokeStyle = '#FB7185';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(px + 2, py + 2, CELL_SIZE - 4, CELL_SIZE - 4);

                    if (cellOccupied) {
                      ctx.beginPath();
                      ctx.moveTo(px + 6, py + 6);
                      ctx.lineTo(px + CELL_SIZE - 6, py + CELL_SIZE - 6);
                      ctx.moveTo(px + CELL_SIZE - 6, py + 6);
                      ctx.lineTo(px + 6, py + CELL_SIZE - 6);
                      ctx.strokeStyle = '#FECDD3';
                      ctx.lineWidth = 2;
                      ctx.stroke();
                    }
                    ctx.restore();
                  }
                }
              }
            }

            // Floating held block following the hand cursor inside the board
            if (cursor && cursor.x <= 0.76) {
              const boardNormX = Math.max(0, Math.min(1, cursor.x / 0.72));
              const cursorPxX = boardNormX * CANVAS_W;
              const cursorPxY = cursor.y * CANVAS_H;

              const matH = gp.matrix.length * CELL_SIZE;
              const matW = gp.matrix[0].length * CELL_SIZE;
              const offsetX = cursorPxX - matW / 2;
              const offsetY = cursorPxY - matH / 2;

              // Subtle tether line to snapped target
              if (gp.isOverBoard) {
                const targetCx = (gp.boardX + gp.matrix[0].length / 2) * CELL_SIZE;
                const targetCy = (gp.boardY + gp.matrix.length / 2) * CELL_SIZE;
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(cursorPxX, cursorPxY);
                ctx.lineTo(targetCx, targetCy);
                ctx.strokeStyle = gp.isValid
                  ? 'rgba(34, 211, 238, 0.5)'
                  : 'rgba(244, 63, 94, 0.55)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 3]);
                ctx.stroke();
                ctx.restore();
              }

              for (let r = 0; r < gp.matrix.length; r++) {
                for (let c = 0; c < gp.matrix[r].length; c++) {
                  if (!gp.matrix[r][c]) continue;
                  drawRoundedCell(
                    ctx,
                    offsetX + c * CELL_SIZE,
                    offsetY + r * CELL_SIZE,
                    CELL_SIZE,
                    style.fill,
                    gp.isValid || !gp.isOverBoard ? '#FFFFFF' : '#FB7185',
                    style.highlight,
                    gp.isValid || !gp.isOverBoard ? style.glow : 'rgba(244,63,94,0.8)',
                    0.92
                  );
                }
              }
            }
          }

          // 7. Virtual Hand Cursor when over the board (0..0.72)
          if (cursor && cursor.x <= 0.73 && gs === 'PLAYING') {
            const cx = Math.max(0, Math.min(1, cursor.x / 0.72)) * CANVAS_W;
            const cy = cursor.y * CANVAS_H;

            ctx.save();
            const radius = pinching ? 10 : 14;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.strokeStyle = pinching ? '#10B981' : '#38BDF8';
            ctx.lineWidth = pinching ? 2.5 : 1.75;
            ctx.shadowColor = pinching ? '#10B981' : '#38BDF8';
            ctx.shadowBlur = 10;
            ctx.stroke();

            // Center pinpoint dot
            ctx.beginPath();
            ctx.arc(cx, cy, pinching ? 3.5 : 2.5, 0, Math.PI * 2);
            ctx.fillStyle = pinching ? '#6EE7B7' : '#BAE6FD';
            ctx.fill();
            ctx.restore();
          }

          // 8. Particle Effects
          const particles = particlesRef.current;
          for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.14; // gravity
            p.vx *= 0.985;
            p.life += 16.6;
            const ratio = Math.max(0, 1 - p.life / p.maxLife);
            if (ratio <= 0) {
              particles.splice(i, 1);
              continue;
            }
            ctx.save();
            ctx.globalAlpha = ratio;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 8;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            ctx.restore();
          }

          // 9. Floating score/combo texts
          const texts = floatingTextsRef.current;
          for (let i = texts.length - 1; i >= 0; i--) {
            const ft = texts[i];
            ft.y -= 0.75;
            ft.life += 16.6;
            const ratio = Math.max(0, 1 - ft.life / ft.maxLife);
            if (ratio <= 0) {
              texts.splice(i, 1);
              continue;
            }
            ctx.save();
            ctx.globalAlpha = ratio;
            ctx.font = '700 18px Outfit, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = ft.color;
            ctx.shadowColor = 'rgba(0,0,0,0.85)';
            ctx.shadowBlur = 6;
            ctx.fillText(ft.text, ft.x, ft.y);
            if (ft.subtext) {
              ctx.font = '600 12px "JetBrains Mono", monospace';
              ctx.fillStyle = '#E2E8F0';
              ctx.fillText(ft.subtext, ft.x, ft.y + 16);
            }
            ctx.restore();
          }

          ctx.restore();
        }
      }
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [particlesRef, floatingTextsRef, flashRowsRef]);

  const toWorkspacePoint = (e: React.MouseEvent<HTMLCanvasElement>): Point2D | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x: nx * 0.72, y: ny };
  };

  return (
    <div className="relative h-full w-full min-h-0 flex items-center justify-center">
      <div className="neon-board-frame relative rounded-xl p-1.5 h-full max-h-[590px] aspect-[1/2] flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="block rounded-lg w-full h-full"
          onMouseMove={(e) => {
            if (!pointerFallbackEnabled || !onPointerMoveWorkspace) return;
            const pt = toWorkspacePoint(e);
            if (pt) onPointerMoveWorkspace(pt);
          }}
          onMouseDown={(e) => {
            if (!pointerFallbackEnabled || !onPointerDownWorkspace) return;
            const pt = toWorkspacePoint(e);
            if (pt) onPointerDownWorkspace(pt);
          }}
          onMouseUp={() => {
            if (!pointerFallbackEnabled || !onPointerUpWorkspace) return;
            onPointerUpWorkspace();
          }}
        />

        {/* Paused Overlay */}
        {gameState === 'PAUSED' && (
          <div className="absolute inset-2 rounded-lg bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10">
            <p className="text-xs font-medium tracking-widest uppercase text-cyan-400 mb-1">
              System Standby
            </p>
            <h2 className="font-display text-3xl font-bold text-white mb-2">
              Game Paused
            </h2>
            <p className="text-sm text-slate-300 max-w-[230px] mb-6 leading-relaxed">
              Game is paused. Press Resume below to continue playing.
            </p>
            <div className="flex flex-col gap-2.5 w-full max-w-[200px]">
              <button
                onClick={onResume}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-4 h-4" />
                Resume Game
              </button>
              <button
                onClick={onRestart}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm border border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" />
                Restart
              </button>
            </div>
          </div>
        )}

        {/* Stage Clear Overlay */}
        {gameState === 'STAGE_CLEAR' && (
          <div className="absolute inset-2 rounded-lg bg-slate-950/88 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10">
            <Trophy className="w-10 h-10 text-amber-400 mb-3" />
            <h2 className="font-display text-2xl font-bold text-white mb-1">
              Sector {stageNumber} Cleared
            </h2>
            <p className="text-sm text-slate-300 mb-5">
              Target reached! Ready for the next grid sector.
            </p>
            <div className="grid grid-cols-2 gap-3 w-full max-w-[210px] mb-6 text-left bg-slate-900/90 border border-slate-800 rounded-lg p-3">
              <div>
                <div className="text-[11px] text-slate-400">Score</div>
                <div className="font-mono-tabular text-base font-bold text-cyan-300">
                  {score.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Lines</div>
                <div className="font-mono-tabular text-base font-bold text-emerald-300">
                  {lines}
                </div>
              </div>
            </div>
            <button
              onClick={onNextStage}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              Next Sector
            </button>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameState === 'GAME_OVER' && (
          <div className="absolute inset-2 rounded-lg bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10">
            <p className="text-xs font-medium tracking-widest uppercase text-rose-400 mb-1">
              Grid Saturated
            </p>
            <h2 className="font-display text-3xl font-bold text-white mb-4">
              Game Over
            </h2>
            <div className="grid grid-cols-2 gap-3 w-full max-w-[220px] mb-6 text-left bg-slate-900/90 border border-slate-800 rounded-lg p-3">
              <div>
                <div className="text-[11px] text-slate-400">Final Score</div>
                <div className="font-mono-tabular text-lg font-bold text-cyan-300">
                  {score.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Lines Cleared</div>
                <div className="font-mono-tabular text-lg font-bold text-purple-300">
                  {lines}
                </div>
              </div>
            </div>
            <button
              onClick={onRestart}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              Play Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
