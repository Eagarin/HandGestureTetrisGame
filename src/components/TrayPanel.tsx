import React from 'react';
import {
  GameMode,
  GrabbedPieceState,
  Matrix,
  Point2D,
  TetrominoType,
  TrayPiece,
} from '../types/game';
import { getMatrixBounds, TETROMINO_STYLES } from '../game/tetrominoes';

interface TrayPanelProps {
  mode: GameMode;
  tray: (TrayPiece | null)[];
  classicQueue: TetrominoType[];
  classicMatrices: Record<TetrominoType, Matrix>;
  grabbedPiece: GrabbedPieceState | null;
  hoveredSlotIndex: number | null;
  handCursor: Point2D | null;
  isPinching: boolean;
  pointerFallbackEnabled: boolean;
  onPointerHoverSlot?: (slotIdx: number) => void;
  onPointerGrabSlot?: (slotIdx: number) => void;
  onPointerRelease?: () => void;
}

const MiniTetromino: React.FC<{
  matrix: Matrix;
  type: TetrominoType;
  dimmed?: boolean;
}> = ({ matrix, type, dimmed }) => {
  const style = TETROMINO_STYLES[type];
  const bounds = getMatrixBounds(matrix);
  const cell = 16;
  const rows = bounds.height;
  const cols = bounds.width;

  return (
    <div
      className={`transition-opacity duration-150 ${dimmed ? 'opacity-25' : 'opacity-100'}`}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
        gridTemplateRows: `repeat(${rows}, ${cell}px)`,
        gap: '2px',
      }}
    >
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((__, c) => {
          const filled = matrix[bounds.minR + r]?.[bounds.minC + c] === 1;
          return (
            <div
              key={`${r}-${c}`}
              className="rounded-[3px]"
              style={
                filled
                  ? {
                      backgroundColor: style.fill,
                      border: `1px solid ${style.border}`,
                      boxShadow: `0 0 8px ${style.glow}`,
                    }
                  : { backgroundColor: 'transparent' }
              }
            />
          );
        })
      )}
    </div>
  );
};

export const TrayPanel: React.FC<TrayPanelProps> = ({
  mode,
  tray,
  classicQueue,
  classicMatrices,
  grabbedPiece,
  hoveredSlotIndex,
  handCursor,
  isPinching,
  pointerFallbackEnabled,
  onPointerHoverSlot,
  onPointerGrabSlot,
  onPointerRelease,
}) => {
  const cursorInTray = handCursor !== null && handCursor.x > 0.72;
  const trayCursorX = cursorInTray
    ? Math.max(0, Math.min(1, (handCursor.x - 0.72) / 0.28)) * 100
    : 50;
  const trayCursorY = handCursor ? handCursor.y * 100 : 50;

  return (
    <aside className="neon-panel rounded-xl p-3 flex flex-col h-full min-h-0 relative overflow-hidden">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800/80 shrink-0">
        <h2 className="font-display text-sm font-semibold tracking-wide text-slate-100">
          {mode === 'classic' ? 'Next Pieces' : 'Available Blocks'}
        </h2>
        <span className="text-[11px] text-cyan-400 font-medium">
          {mode === 'classic' ? 'Queue' : 'Pinch to Grab'}
        </span>
      </div>

      {mode === 'classic' ? (
        <div className="flex flex-col gap-2.5 flex-1 min-h-0">
          {classicQueue.slice(0, 3).map((type, idx) => (
            <div
              key={`${type}-${idx}`}
              className="flex-1 min-h-0 rounded-lg bg-slate-900/50 border border-slate-800/85 flex flex-col items-center justify-center relative"
            >
              <span className="absolute top-1.5 left-2 text-[10px] font-mono-tabular text-slate-500">
                0{idx + 1}
              </span>
              <MiniTetromino matrix={classicMatrices[type]} type={type} />
            </div>
          ))}
        </div>
      ) : (
        <div className="relative flex flex-col gap-2.5 flex-1 min-h-0">
          {tray.map((piece, idx) => {
            const isGrabbed =
              grabbedPiece !== null && grabbedPiece.sourceSlotIndex === idx;
            const isHovered = hoveredSlotIndex === idx && !grabbedPiece;

            return (
              <div
                key={piece ? piece.id : `empty-${idx}`}
                onMouseEnter={() => {
                  if (pointerFallbackEnabled && onPointerHoverSlot) {
                    onPointerHoverSlot(idx);
                  }
                }}
                onMouseDown={() => {
                  if (pointerFallbackEnabled && onPointerGrabSlot && piece) {
                    onPointerGrabSlot(idx);
                  }
                }}
                onMouseUp={() => {
                  if (pointerFallbackEnabled && onPointerRelease) {
                    onPointerRelease();
                  }
                }}
                className={`flex-1 min-h-0 rounded-lg flex flex-col items-center justify-center relative transition-all duration-150 select-none ${
                  isGrabbed
                    ? 'bg-cyan-950/45 border-2 border-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.28)]'
                    : isHovered
                    ? 'bg-slate-800/55 border-2 border-sky-400/90 shadow-[0_0_16px_rgba(56,189,248,0.22)]'
                    : 'bg-slate-900/45 border border-slate-700/70'
                } ${pointerFallbackEnabled ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                <span className="absolute top-1.5 left-2 text-[10px] font-mono-tabular text-slate-500">
                  Slot {idx + 1}
                </span>

                {isHovered && piece && (
                  <span className="absolute top-1.5 right-2 text-[10px] font-medium text-sky-300">
                    Pinch
                  </span>
                )}
                {isGrabbed && (
                  <span className="absolute top-1.5 right-2 text-[10px] font-medium text-cyan-300">
                    Grabbed
                  </span>
                )}

                {piece ? (
                  <MiniTetromino
                    matrix={piece.matrix}
                    type={piece.type}
                    dimmed={isGrabbed}
                  />
                ) : (
                  <span className="text-xs text-slate-600">Refilling...</span>
                )}
              </div>
            );
          })}

          {/* Virtual Hand Cursor inside Tray */}
          {cursorInTray && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 z-20 transition-transform duration-75"
              style={{
                left: `${trayCursorX}%`,
                top: `${trayCursorY}%`,
              }}
            >
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  isPinching
                    ? 'border-emerald-400 bg-emerald-400/20 scale-90 shadow-[0_0_12px_rgba(16,185,129,0.6)]'
                    : 'border-sky-400 bg-sky-400/15 shadow-[0_0_10px_rgba(56,189,248,0.5)]'
                }`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    isPinching ? 'bg-emerald-300' : 'bg-sky-200'
                  }`}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
