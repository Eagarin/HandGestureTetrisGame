export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export type CellValue = TetrominoType | 'OBSTACLE' | null;

export type BoardGrid = CellValue[][];

export type Matrix = number[][];

export type GameMode = 'classic' | 'challenge';

export type GameState =
  | 'CALIBRATING'
  | 'SETTINGS'
  | 'PLAYING'
  | 'PAUSED'
  | 'STAGE_CLEAR'
  | 'GAME_OVER';

export type GestureType =
  | 'NONE'
  | 'PINCH'
  | 'ROTATE_CW'
  | 'ROTATE_CCW';

export interface Point2D {
  x: number;
  y: number;
}

export interface TrayPiece {
  id: string;
  type: TetrominoType;
  matrix: Matrix;
  rotation: number; // 0..3
}

export interface ActiveClassicPiece {
  type: TetrominoType;
  matrix: Matrix;
  x: number;
  y: number;
  rotation: number;
}

export interface GrabbedPieceState {
  sourceSlotIndex: number; // 0..2 for Free/Challenge, -1 for Classic
  type: TetrominoType;
  matrix: Matrix;
  rotation: number;
  /** Target board grid top-left cell */
  boardX: number;
  boardY: number;
  isValid: boolean;
  /** Whether the hand cursor is currently over the board area */
  isOverBoard: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  subtext?: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface CalibrationSettings {
  /** Normalized pinch distance threshold (0.22 - 0.65). Higher = easier to pinch. */
  pinchSensitivity: number;
  /** EMA smoothing factor (0.15 = super smooth/slower, 0.85 = instant/raw). */
  smoothness: number;
  /** Mirror camera horizontally for natural selfie interaction. */
  mirrorCamera: boolean;
  /** Render 21-landmark skeleton on webcam feed. */
  showSkeleton: boolean;
}

export interface HandTrackingTelemetry {
  cameraStatus: 'idle' | 'requesting' | 'ready' | 'error';
  cameraError: string | null;
  modelStatus: 'loading' | 'ready' | 'error';
  handsCount: number;
  fps: number;
  activeGesture: GestureType;
  isPinching: boolean;
  pinchStrength: number; // 0..1 (1 = tight pinch)
  wristAngleDeg: number; // Current wrist angle in degrees
  rotationDeltaDeg: number; // Relative angle since pinch start
  /** Normalized workspace cursor (0..1 across Board+Tray, 0..1 vertical) */
  cursor: Point2D | null;
  /** Calibration progress flags */
  pinchCalibrated: boolean;
  rotationTested: boolean;
}

export interface ChallengeStage {
  stage: number;
  title: string;
  targetLines: number;
  timeLimitSec: number;
  obstacleRows: number;
}
