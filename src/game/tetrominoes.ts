import { Matrix, TetrominoType } from '../types/game';

export interface TetrominoStyle {
  name: string;
  fill: string;
  border: string;
  glow: string;
  highlight: string;
}

export const TETROMINO_STYLES: Record<TetrominoType | 'OBSTACLE', TetrominoStyle> = {
  I: {
    name: 'Cyan Beam',
    fill: '#06B6D4',
    border: '#67E8F9',
    glow: 'rgba(6, 182, 212, 0.65)',
    highlight: '#CFFAFE',
  },
  O: {
    name: 'Solar Amber',
    fill: '#F59E0B',
    border: '#FCD34D',
    glow: 'rgba(245, 158, 11, 0.6)',
    highlight: '#FEF3C7',
  },
  T: {
    name: 'Neon Violet',
    fill: '#A855F7',
    border: '#D8B4FE',
    glow: 'rgba(168, 85, 247, 0.65)',
    highlight: '#F3E8FF',
  },
  S: {
    name: 'Cyber Mint',
    fill: '#10B981',
    border: '#6EE7B7',
    glow: 'rgba(16, 185, 129, 0.6)',
    highlight: '#D1FAE5',
  },
  Z: {
    name: 'Laser Crimson',
    fill: '#F43F5E',
    border: '#FDA4AF',
    glow: 'rgba(244, 63, 94, 0.6)',
    highlight: '#FFE4E6',
  },
  J: {
    name: 'Cobalt Pulse',
    fill: '#3B82F6',
    border: '#93C5FD',
    glow: 'rgba(59, 130, 246, 0.65)',
    highlight: '#DBEAFE',
  },
  L: {
    name: 'Plasma Orange',
    fill: '#F97316',
    border: '#FDBA74',
    glow: 'rgba(249, 115, 22, 0.6)',
    highlight: '#FFEDD5',
  },
  OBSTACLE: {
    name: 'Titan Debris',
    fill: '#334155',
    border: '#64748B',
    glow: 'rgba(100, 116, 139, 0.35)',
    highlight: '#94A3B8',
  },
};

export const TETROMINO_MATRICES: Record<TetrominoType, Matrix> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

export const ALL_TETROMINO_TYPES: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export function cloneMatrix(matrix: Matrix): Matrix {
  return matrix.map((row) => [...row]);
}

export function rotateMatrixCW(matrix: Matrix): Matrix {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result: Matrix = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      result[c][rows - 1 - r] = matrix[r][c];
    }
  }
  return result;
}

export function rotateMatrixCCW(matrix: Matrix): Matrix {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const result: Matrix = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      result[cols - 1 - c][r] = matrix[r][c];
    }
  }
  return result;
}

/**
 * Returns tight bounding box of filled cells within a Tetromino matrix
 * so drag-and-drop centering feels crisp and accurate under the user's hand.
 */
export function getMatrixBounds(matrix: Matrix): {
  minR: number;
  maxR: number;
  minC: number;
  maxC: number;
  width: number;
  height: number;
} {
  let minR = matrix.length;
  let maxR = -1;
  let minC = matrix[0].length;
  let maxC = -1;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR === -1) {
    return { minR: 0, maxR: 0, minC: 0, maxC: 0, width: 1, height: 1 };
  }
  return {
    minR,
    maxR,
    minC,
    maxC,
    width: maxC - minC + 1,
    height: maxR - minR + 1,
  };
}

export class BagRandomizer {
  private bag: TetrominoType[] = [];

  private refill() {
    const items = [...ALL_TETROMINO_TYPES];
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    this.bag.push(...items);
  }

  public next(): TetrominoType {
    if (this.bag.length === 0) {
      this.refill();
    }
    return this.bag.shift()!;
  }

  public reset() {
    this.bag = [];
  }
}
