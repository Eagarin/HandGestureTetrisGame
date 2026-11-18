import {
  ActiveClassicPiece,
  BoardGrid,
  ChallengeStage,
  Matrix,
  TetrominoType,
  TrayPiece,
} from '../types/game';
import {
  BagRandomizer,
  cloneMatrix,
  rotateMatrixCCW,
  rotateMatrixCW,
  TETROMINO_MATRICES,
} from './tetrominoes';

export const BOARD_COLS = 10;
export const BOARD_ROWS = 20;

export const CHALLENGE_STAGES: ChallengeStage[] = [
  { stage: 1, title: 'Sector 01 · Ignition', targetLines: 3, timeLimitSec: 90, obstacleRows: 0 },
  { stage: 2, title: 'Sector 02 · Grid Lock', targetLines: 5, timeLimitSec: 95, obstacleRows: 2 },
  { stage: 3, title: 'Sector 03 · Neon Surge', targetLines: 7, timeLimitSec: 100, obstacleRows: 3 },
  { stage: 4, title: 'Sector 04 · Hypercore', targetLines: 9, timeLimitSec: 105, obstacleRows: 4 },
  { stage: 5, title: 'Sector 05 · Apex Protocol', targetLines: 12, timeLimitSec: 115, obstacleRows: 5 },
];

export function getChallengeStage(stageNum: number): ChallengeStage {
  if (stageNum <= CHALLENGE_STAGES.length) {
    return CHALLENGE_STAGES[stageNum - 1];
  }
  const extra = stageNum - CHALLENGE_STAGES.length;
  return {
    stage: stageNum,
    title: `Sector 0${stageNum} · Overdrive`,
    targetLines: 12 + extra * 3,
    timeLimitSec: Math.max(85, 115 - extra * 5),
    obstacleRows: Math.min(7, 5 + Math.floor(extra / 2)),
  };
}

export function createEmptyBoard(): BoardGrid {
  return Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null));
}

export function createChallengeBoard(obstacleRows: number): BoardGrid {
  const board = createEmptyBoard();
  for (let r = BOARD_ROWS - obstacleRows; r < BOARD_ROWS; r++) {
    // Ensure at least 2-3 open gaps per obstacle row so it is solvable
    const gapCount = 2 + Math.floor(Math.random() * 2);
    const gaps = new Set<number>();
    while (gaps.size < gapCount) {
      gaps.add(Math.floor(Math.random() * BOARD_COLS));
    }
    for (let c = 0; c < BOARD_COLS; c++) {
      if (!gaps.has(c)) {
        board[r][c] = 'OBSTACLE';
      }
    }
  }
  return board;
}

export function canPlaceMatrix(
  board: BoardGrid,
  matrix: Matrix,
  gridX: number,
  gridY: number
): boolean {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const bx = gridX + c;
      const by = gridY + r;
      if (bx < 0 || bx >= BOARD_COLS || by < 0 || by >= BOARD_ROWS) {
        return false;
      }
      if (board[by][bx] !== null) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Standard Classic mode collision allows pieces to start slightly above top (by < 0)
 * while checking bottom, left, right, and occupied cells.
 */
export function canPlaceClassicPiece(
  board: BoardGrid,
  matrix: Matrix,
  gridX: number,
  gridY: number
): boolean {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const bx = gridX + c;
      const by = gridY + r;
      if (bx < 0 || bx >= BOARD_COLS || by >= BOARD_ROWS) {
        return false;
      }
      if (by >= 0 && board[by][bx] !== null) {
        return false;
      }
    }
  }
  return true;
}

export function lockMatrixToBoard(
  board: BoardGrid,
  matrix: Matrix,
  gridX: number,
  gridY: number,
  type: TetrominoType
): BoardGrid {
  const next = board.map((row) => [...row]);
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const bx = gridX + c;
      const by = gridY + r;
      if (by >= 0 && by < BOARD_ROWS && bx >= 0 && bx < BOARD_COLS) {
        next[by][bx] = type;
      }
    }
  }
  return next;
}

export function findCompletedRows(board: BoardGrid): number[] {
  const completed: number[] = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    if (board[r].every((cell) => cell !== null)) {
      completed.push(r);
    }
  }
  return completed;
}

export function clearCompletedRows(board: BoardGrid, rowsToClear: number[]): BoardGrid {
  if (rowsToClear.length === 0) return board;
  const clearSet = new Set(rowsToClear);
  const remaining = board.filter((_, idx) => !clearSet.has(idx));
  const emptyNewRows = Array.from({ length: rowsToClear.length }, () =>
    Array(BOARD_COLS).fill(null)
  );
  return [...emptyNewRows, ...remaining];
}

export function computeClassicGhostY(
  board: BoardGrid,
  matrix: Matrix,
  gridX: number,
  startY: number
): number {
  let y = startY;
  while (canPlaceClassicPiece(board, matrix, gridX, y + 1)) {
    y++;
  }
  return y;
}

export function tryRotateClassicPiece(
  board: BoardGrid,
  piece: ActiveClassicPiece,
  direction: 'CW' | 'CCW'
): ActiveClassicPiece | null {
  const rotatedMatrix =
    direction === 'CW' ? rotateMatrixCW(piece.matrix) : rotateMatrixCCW(piece.matrix);
  const nextRotation =
    direction === 'CW' ? (piece.rotation + 1) % 4 : (piece.rotation + 3) % 4;
  // Wall kick offsets
  const kicks = [0, -1, 1, -2, 2];
  for (const dx of kicks) {
    if (canPlaceClassicPiece(board, rotatedMatrix, piece.x + dx, piece.y)) {
      return {
        ...piece,
        matrix: rotatedMatrix,
        x: piece.x + dx,
        rotation: nextRotation,
      };
    }
  }
  return null;
}

export function calculateClearScore(
  linesCleared: number,
  level: number,
  combo: number
): number {
  const baseByLines: Record<number, number> = {
    1: 100,
    2: 300,
    3: 500,
    4: 800,
  };
  const base = baseByLines[linesCleared] ?? linesCleared * 250;
  const comboMultiplier = 1 + Math.max(0, combo - 1) * 0.5;
  return Math.round(base * level * comboMultiplier);
}

export function createTrayPiece(randomizer: BagRandomizer): TrayPiece {
  const type = randomizer.next();
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    matrix: cloneMatrix(TETROMINO_MATRICES[type]),
    rotation: 0,
  };
}

export function spawnClassicPiece(randomizer: BagRandomizer): ActiveClassicPiece {
  const type = randomizer.next();
  const matrix = cloneMatrix(TETROMINO_MATRICES[type]);
  const spawnX = Math.floor((BOARD_COLS - matrix[0].length) / 2);
  return {
    type,
    matrix,
    x: spawnX,
    y: 0,
    rotation: 0,
  };
}

/**
 * Checks whether at least one piece in the tray can fit on the board
 * in ANY of its 4 rotations (used to detect Game Over in Free/Challenge mode).
 */
export function hasAnyValidTrayMove(board: BoardGrid, tray: (TrayPiece | null)[]): boolean {
  for (const item of tray) {
    if (!item) continue;
    let m = item.matrix;
    for (let rot = 0; rot < 4; rot++) {
      for (let y = 0; y < BOARD_ROWS; y++) {
        for (let x = 0; x < BOARD_COLS; x++) {
          if (canPlaceMatrix(board, m, x, y)) {
            return true;
          }
        }
      }
      m = rotateMatrixCW(m);
    }
  }
  return false;
}

export function getDropIntervalMs(level: number): number {
  return Math.max(140, 950 - (level - 1) * 85);
}
