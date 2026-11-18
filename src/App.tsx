import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActiveClassicPiece,
  BoardGrid,
  CalibrationSettings,
  FloatingText,
  GameMode,
  GameState,
  GrabbedPieceState,
  Particle,
  Point2D,
  TetrominoType,
  TrayPiece,
} from './types/game';
import {
  BOARD_COLS,
  BOARD_ROWS,
  calculateClearScore,
  canPlaceClassicPiece,
  canPlaceMatrix,
  clearCompletedRows,
  computeClassicGhostY,
  createChallengeBoard,
  createEmptyBoard,
  createTrayPiece,
  findCompletedRows,
  getChallengeStage,
  getDropIntervalMs,
  hasAnyValidTrayMove,
  lockMatrixToBoard,
  spawnClassicPiece,
  tryRotateClassicPiece,
} from './game/tetrisEngine';
import {
  BagRandomizer,
  getMatrixBounds,
  rotateMatrixCCW,
  rotateMatrixCW,
  TETROMINO_MATRICES,
  TETROMINO_STYLES,
} from './game/tetrominoes';
import { soundEngine } from './audio/soundEngine';
import { ProcessedHandOutput, useHandTracker } from './vision/useHandTracker';
import { TetrisCanvas } from './components/TetrisCanvas';
import { TrayPanel } from './components/TrayPanel';
import { WebcamHud } from './components/WebcamHud';
import { CalibrationModal } from './components/CalibrationModal';
import { GestureGuideBar } from './components/GestureGuideBar';
import {
  Pause,
  Play,
  RotateCcw,
  Settings,
  Volume2,
  VolumeX,
} from 'lucide-react';

const HIGH_SCORE_KEY = 'hand_gesture_tetris_high_score_v1';

const DEFAULT_SETTINGS: CalibrationSettings = {
  pinchSensitivity: 0.4,
  smoothness: 0.48,
  mirrorCamera: true,
  showSkeleton: true,
};

function spawnRowParticles(
  particlesRef: React.MutableRefObject<Particle[]>,
  rows: number[],
  board: BoardGrid
) {
  const cellSize = 28;
  for (const r of rows) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const cell = board[r][c];
      const color = cell ? TETROMINO_STYLES[cell].border : '#38BDF8';
      const baseX = c * cellSize + cellSize / 2;
      const baseY = r * cellSize + cellSize / 2;
      for (let i = 0; i < 4; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.4 + Math.random() * 4.2;
        particlesRef.current.push({
          x: baseX,
          y: baseY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5,
          size: 2.5 + Math.random() * 3.5,
          color,
          alpha: 1,
          life: 0,
          maxLife: 480 + Math.random() * 280,
        });
      }
    }
  }
}

export default function App() {
  const randomizerRef = useRef(new BagRandomizer());
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const flashRowsRef = useRef<{ rows: number[]; until: number }>({
    rows: [],
    until: 0,
  });

  const [mode, setMode] = useState<GameMode>('classic');
  const [gameState, setGameState] = useState<GameState>('CALIBRATING');
  const [board, setBoard] = useState<BoardGrid>(() => createEmptyBoard());
  const [tray, setTray] = useState<(TrayPiece | null)[]>(() => [
    createTrayPiece(randomizerRef.current),
    createTrayPiece(randomizerRef.current),
    createTrayPiece(randomizerRef.current),
  ]);
  const [classicPiece, setClassicPiece] = useState<ActiveClassicPiece | null>(null);
  const [classicQueue, setClassicQueue] = useState<TetrominoType[]>([]);
  const [grabbedPiece, setGrabbedPiece] = useState<GrabbedPieceState | null>(null);
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);

  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(HIGH_SCORE_KEY);
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [combo, setCombo] = useState(0);

  // Challenge Mode state
  const [stageNumber, setStageNumber] = useState(1);
  const [stageLines, setStageLines] = useState(0);
  const [timeLeftSec, setTimeLeftSec] = useState(90);

  // Controls & Calibration
  const [settings, setSettings] = useState<CalibrationSettings>(DEFAULT_SETTINGS);
  const [muted, setMuted] = useState(false);
  const [pointerFallbackEnabled, setPointerFallbackEnabled] = useState(false);
  const [hasStartedOnce, setHasStartedOnce] = useState(false);
  const modeBeforeSettingsRef = useRef<GameMode>('classic');

  // Live cursor ref + state for smooth pointer/hand rendering
  const [handCursor, setHandCursor] = useState<Point2D | null>(null);
  const [pointerPinching, setPointerPinching] = useState(false);
  const classicPinchStartAtRef = useRef<number>(0);
  const classicPinchingRef = useRef<boolean>(false);

  // Keep latest state in a ref for zero-stale-closure 60Hz hand tracking handler
  const stateRef = useRef({
    mode,
    gameState,
    board,
    tray,
    classicPiece,
    classicQueue,
    grabbedPiece,
    score,
    highScore,
    lines,
    level,
    combo,
    stageNumber,
    stageLines,
  });
  stateRef.current = {
    mode,
    gameState,
    board,
    tray,
    classicPiece,
    classicQueue,
    grabbedPiece,
    score,
    highScore,
    lines,
    level,
    combo,
    stageNumber,
    stageLines,
  };

  const updateHighScore = useCallback((newScore: number) => {
    setHighScore((prev) => {
      if (newScore > prev) {
        try {
          localStorage.setItem(HIGH_SCORE_KEY, String(newScore));
        } catch {
          // ignore storage quota errors
        }
        return newScore;
      }
      return prev;
    });
  }, []);

  const startNewGame = useCallback(
    (targetMode: GameMode, targetStage: number = 1, enterPlay: boolean = true) => {
      randomizerRef.current.reset();
      particlesRef.current = [];
      floatingTextsRef.current = [];
      flashRowsRef.current = { rows: [], until: 0 };
      setGrabbedPiece(null);
      setHoveredSlotIndex(null);
      classicPinchingRef.current = false;

      if (targetStage === 1) {
        setScore(0);
        setLines(0);
        setLevel(1);
        setCombo(0);
      }

      if (targetMode === 'classic') {
        const empty = createEmptyBoard();
        setBoard(empty);
        const first = spawnClassicPiece(randomizerRef.current);
        setClassicPiece(first);
        setClassicQueue([
          randomizerRef.current.next(),
          randomizerRef.current.next(),
          randomizerRef.current.next(),
        ]);
        setTray([null, null, null]);
      } else {
        const cfg = getChallengeStage(targetStage);
        setStageNumber(targetStage);
        setStageLines(0);
        setTimeLeftSec(cfg.timeLimitSec);
        setBoard(createChallengeBoard(cfg.obstacleRows));
        setClassicPiece(null);
        setTray([
          createTrayPiece(randomizerRef.current),
          createTrayPiece(randomizerRef.current),
          createTrayPiece(randomizerRef.current),
        ]);
      }

      if (enterPlay) {
        setHasStartedOnce(true);
        setGameState('PLAYING');
      }
    },
    []
  );

  const openSettingsPage = useCallback(() => {
    modeBeforeSettingsRef.current = mode;
    setGrabbedPiece(null);
    classicPinchingRef.current = false;
    resetCalibrationProgress();
    setGameState('SETTINGS');
  }, [mode]);

  const handleSettingsStartOrReturn = useCallback(() => {
    if (!hasStartedOnce || modeBeforeSettingsRef.current !== mode) {
      startNewGame(mode, 1, true);
    } else {
      setGameState('PLAYING');
    }
  }, [hasStartedOnce, mode, startNewGame]);

  const applyBoardLockAndClear = useCallback(
    (
      nextBoard: BoardGrid,
      placedX: number,
      placedY: number,
      placedCols: number,
      placedRows: number,
      slotIndexToRefill: number | null
    ) => {
      const completedRows = findCompletedRows(nextBoard);
      const s = stateRef.current;

      if (completedRows.length > 0) {
        spawnRowParticles(particlesRef, completedRows, nextBoard);
        flashRowsRef.current = {
          rows: completedRows,
          until: performance.now() + 260,
        };
      }

      const clearedBoard = clearCompletedRows(nextBoard, completedRows);
      setBoard(clearedBoard);

      const newCombo = completedRows.length > 0 ? s.combo + 1 : 0;
      const clearPts =
        completedRows.length > 0
          ? calculateClearScore(completedRows.length, s.level, newCombo)
          : 0;
      const placementPts = 15 * s.level;
      const updatedScore = s.score + placementPts + clearPts;
      const updatedLines = s.lines + completedRows.length;
      const updatedLevel = Math.max(1, 1 + Math.floor(updatedLines / 6));

      setScore(updatedScore);
      updateHighScore(updatedScore);
      setLines(updatedLines);
      setLevel(updatedLevel);
      setCombo(newCombo);

      if (completedRows.length > 0) {
        soundEngine.playLineClear(completedRows.length, newCombo);
        const fx = ((placedX + placedCols / 2) / BOARD_COLS) * 280;
        const fy = Math.max(40, ((placedY + placedRows / 2) / BOARD_ROWS) * 560);
        floatingTextsRef.current.push({
          id: `${Date.now()}-${Math.random()}`,
          x: Math.max(60, Math.min(220, fx)),
          y: fy,
          text: `+${clearPts}`,
          subtext:
            newCombo > 1
              ? `${completedRows.length} LINE${completedRows.length > 1 ? 'S' : ''} · COMBO x${newCombo}`
              : `${completedRows.length} LINE${completedRows.length > 1 ? 'S' : ''}`,
          color: newCombo > 1 ? '#FDE047' : '#67E8F9',
          life: 0,
          maxLife: 1050,
        });
      } else {
        soundEngine.playPlace();
      }

      // Challenge mode stage clear check
      if (s.mode === 'challenge') {
        const nextStageLines = s.stageLines + completedRows.length;
        setStageLines(nextStageLines);
        const cfg = getChallengeStage(s.stageNumber);
        if (nextStageLines >= cfg.targetLines) {
          soundEngine.playStageClear();
          setGameState('STAGE_CLEAR');
          return clearedBoard;
        }
      }

      // Challenge Tray refill + Game Over check
      if (slotIndexToRefill !== null) {
        const nextTray = s.tray.map((item, idx) =>
          idx === slotIndexToRefill ? createTrayPiece(randomizerRef.current) : item
        );
        setTray(nextTray);
        if (!hasAnyValidTrayMove(clearedBoard, nextTray)) {
          soundEngine.playGameOver();
          setGameState('GAME_OVER');
        }
      }
      return clearedBoard;
    },
    [updateHighScore]
  );

  // Classic Mode gravity loop
  useEffect(() => {
    if (mode !== 'classic' || gameState !== 'PLAYING') return;

    const intervalMs = getDropIntervalMs(level);
    const timer = window.setInterval(() => {
      const s = stateRef.current;
      if (!s.classicPiece || s.gameState !== 'PLAYING') return;

      if (
        canPlaceClassicPiece(
          s.board,
          s.classicPiece.matrix,
          s.classicPiece.x,
          s.classicPiece.y + 1
        )
      ) {
        setClassicPiece({ ...s.classicPiece, y: s.classicPiece.y + 1 });
      } else {
        // Lock classic piece
        if (s.classicPiece.y < 0) {
          soundEngine.playGameOver();
          setGameState('GAME_OVER');
          return;
        }
        const locked = lockMatrixToBoard(
          s.board,
          s.classicPiece.matrix,
          s.classicPiece.x,
          s.classicPiece.y,
          s.classicPiece.type
        );
        const clearedBoard = applyBoardLockAndClear(
          locked,
          s.classicPiece.x,
          s.classicPiece.y,
          s.classicPiece.matrix[0].length,
          s.classicPiece.matrix.length,
          null
        );

        // Spawn next from queue
        const [nextType, ...restQueue] = s.classicQueue;
        const spawnType = nextType ?? randomizerRef.current.next();
        const matrix = TETROMINO_MATRICES[spawnType];
        const spawnX = Math.floor((BOARD_COLS - matrix[0].length) / 2);
        const nextPiece: ActiveClassicPiece = {
          type: spawnType,
          matrix,
          x: spawnX,
          y: 0,
          rotation: 0,
        };
        if (!canPlaceClassicPiece(clearedBoard, nextPiece.matrix, nextPiece.x, nextPiece.y)) {
          soundEngine.playGameOver();
          setGameState('GAME_OVER');
          setClassicPiece(null);
        } else {
          setClassicPiece(nextPiece);
          setClassicQueue([...restQueue, randomizerRef.current.next()]);
        }
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [mode, gameState, level, applyBoardLockAndClear]);

  // Challenge Mode countdown timer
  useEffect(() => {
    if (mode !== 'challenge' || gameState !== 'PLAYING') return;
    const timer = window.setInterval(() => {
      setTimeLeftSec((prev) => {
        if (prev <= 1) {
          soundEngine.playGameOver();
          setGameState('GAME_OVER');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [mode, gameState]);

  /**
   * Computes snapped grid placement and validity for a grabbed piece at a workspace cursor.
   */
  const computePlacementForCursor = useCallback(
    (
      boardGrid: BoardGrid,
      matrix: number[][],
      cursor: Point2D
    ): { boardX: number; boardY: number; isOverBoard: boolean; isValid: boolean } => {
      const isOverBoard = cursor.x <= 0.72;
      if (!isOverBoard) {
        return { boardX: 0, boardY: 0, isOverBoard: false, isValid: false };
      }
      const boardNormX = Math.max(0, Math.min(1, cursor.x / 0.72));
      const centerCol = boardNormX * BOARD_COLS;
      const centerRow = cursor.y * BOARD_ROWS;

      const bounds = getMatrixBounds(matrix);
      let bx = Math.round(centerCol - (bounds.minC + bounds.width / 2));
      let by = Math.round(centerRow - (bounds.minR + bounds.height / 2));

      // Clamp piece inside the 10x20 grid bounds for crisp magnetic wall placement
      bx = Math.max(-bounds.minC, Math.min(BOARD_COLS - 1 - bounds.maxC, bx));
      by = Math.max(-bounds.minR, Math.min(BOARD_ROWS - 1 - bounds.maxR, by));

      const isValid = canPlaceMatrix(boardGrid, matrix, bx, by);
      return { boardX: bx, boardY: by, isOverBoard: true, isValid };
    },
    []
  );

  // Unified Gesture Frame Handler (drives Free, Classic, and Challenge modes)
  const handleHandFrame = useCallback(
    (output: ProcessedHandOutput) => {
      const s = stateRef.current;
      const now = performance.now();

      if (output.cursor) {
        setHandCursor(output.cursor);
      }

      // Calibration audio feedback on first verified pinch
      if (s.gameState === 'CALIBRATING') {
        if (output.events.pinchStarted) {
          soundEngine.playCalibrationSuccess();
        }
        return;
      }

      if (s.gameState !== 'PLAYING') return;

      const cursor = output.cursor;

      // ---- CLASSIC MODE HAND CONTROLS ----
      if (s.mode === 'classic' && s.classicPiece) {
        if (output.events.pinchStarted) {
          classicPinchingRef.current = true;
          classicPinchStartAtRef.current = now;
          soundEngine.playPickup();
        }

        if (output.events.rotateDirection) {
          const rotated = tryRotateClassicPiece(
            s.board,
            s.classicPiece,
            output.events.rotateDirection
          );
          if (rotated) {
            soundEngine.playRotate();
            setClassicPiece(rotated);
          }
        }

        if (classicPinchingRef.current && output.isPinching && cursor) {
          const boardNormX = Math.max(0, Math.min(1, cursor.x / 0.72));
          const bounds = getMatrixBounds(s.classicPiece.matrix);
          const targetCenterCol = boardNormX * BOARD_COLS;
          const desiredX = Math.round(
            targetCenterCol - (bounds.minC + bounds.width / 2)
          );
          const clampedX = Math.max(
            -bounds.minC,
            Math.min(BOARD_COLS - 1 - bounds.maxC, desiredX)
          );

          if (clampedX !== s.classicPiece.x) {
            const step = clampedX > s.classicPiece.x ? 1 : -1;
            if (
              canPlaceClassicPiece(
                s.board,
                s.classicPiece.matrix,
                s.classicPiece.x + step,
                s.classicPiece.y
              )
            ) {
              soundEngine.playMove();
              setClassicPiece({ ...s.classicPiece, x: s.classicPiece.x + step });
            }
          }
        }

        if (output.events.pinchReleased && classicPinchingRef.current) {
          classicPinchingRef.current = false;
          // Drop piece to Ghost Y when released after intentional pinch hold
          if (now - classicPinchStartAtRef.current > 140) {
            const dropY = computeClassicGhostY(
              s.board,
              s.classicPiece.matrix,
              s.classicPiece.x,
              s.classicPiece.y
            );
            if (dropY >= 0) {
              const locked = lockMatrixToBoard(
                s.board,
                s.classicPiece.matrix,
                s.classicPiece.x,
                dropY,
                s.classicPiece.type
              );
              const clearedBoard = applyBoardLockAndClear(
                locked,
                s.classicPiece.x,
                dropY,
                s.classicPiece.matrix[0].length,
                s.classicPiece.matrix.length,
                null
              );
              const [nextType, ...restQueue] = s.classicQueue;
              const spawnType = nextType ?? randomizerRef.current.next();
              const matrix = TETROMINO_MATRICES[spawnType];
              const spawnX = Math.floor((BOARD_COLS - matrix[0].length) / 2);
              const nextPiece: ActiveClassicPiece = {
                type: spawnType,
                matrix,
                x: spawnX,
                y: 0,
                rotation: 0,
              };
              if (!canPlaceClassicPiece(clearedBoard, nextPiece.matrix, nextPiece.x, nextPiece.y)) {
                soundEngine.playGameOver();
                setGameState('GAME_OVER');
                setClassicPiece(null);
              } else {
                setClassicPiece(nextPiece);
                setClassicQueue([...restQueue, randomizerRef.current.next()]);
              }
            }
          }
        }
        return;
      }

      // ---- CHALLENGE MODE HAND CONTROLS ----
      if (!cursor) return;

      const inTray = cursor.x > 0.72;
      const slotIdx = inTray
        ? cursor.y < 0.333
          ? 0
          : cursor.y < 0.666
          ? 1
          : 2
        : null;

      if (!s.grabbedPiece) {
        setHoveredSlotIndex(slotIdx);

        // Start Grab on Pinch inside Tray
        if (output.events.pinchStarted && slotIdx !== null) {
          const piece = s.tray[slotIdx];
          if (piece) {
            soundEngine.playPickup();
            setGrabbedPiece({
              sourceSlotIndex: slotIdx,
              type: piece.type,
              matrix: piece.matrix,
              rotation: piece.rotation,
              boardX: 0,
              boardY: 0,
              isOverBoard: false,
              isValid: false,
            });
          }
        }
      } else {
        // Currently holding a piece
        let currentMatrix = s.grabbedPiece.matrix;
        let currentRotation = s.grabbedPiece.rotation;

        if (output.events.rotateDirection) {
          currentMatrix =
            output.events.rotateDirection === 'CW'
              ? rotateMatrixCW(currentMatrix)
              : rotateMatrixCCW(currentMatrix);
          currentRotation =
            output.events.rotateDirection === 'CW'
              ? (currentRotation + 1) % 4
              : (currentRotation + 3) % 4;
          soundEngine.playRotate();
        }

        const placement = computePlacementForCursor(s.board, currentMatrix, cursor);

        if (output.events.pinchReleased) {
          if (placement.isOverBoard && placement.isValid) {
            const nextBoard = lockMatrixToBoard(
              s.board,
              currentMatrix,
              placement.boardX,
              placement.boardY,
              s.grabbedPiece.type
            );
            applyBoardLockAndClear(
              nextBoard,
              placement.boardX,
              placement.boardY,
              currentMatrix[0].length,
              currentMatrix.length,
              s.grabbedPiece.sourceSlotIndex
            );
          } else {
            if (placement.isOverBoard && !placement.isValid) {
              soundEngine.playInvalid();
            } else {
              soundEngine.playCancel();
            }
          }
          setGrabbedPiece(null);
          return;
        }

        setGrabbedPiece({
          ...s.grabbedPiece,
          matrix: currentMatrix,
          rotation: currentRotation,
          boardX: placement.boardX,
          boardY: placement.boardY,
          isOverBoard: placement.isOverBoard,
          isValid: placement.isValid,
        });
      }
    },
    [applyBoardLockAndClear, computePlacementForCursor]
  );

  const {
    videoRef,
    overlayCanvasRef,
    telemetry,
    retryCamera,
    resetCalibrationProgress,
  } = useHandTracker({
    enabled: true,
    settings,
    isHoldingBlock: grabbedPiece !== null || classicPinchingRef.current,
    onFrame: handleHandFrame,
  });

  // Pointer Assist fallback handlers (optional if user has no camera)
  const handlePointerMoveWorkspace = useCallback(
    (pt: Point2D) => {
      if (!pointerFallbackEnabled) return;
      setHandCursor(pt);
      const s = stateRef.current;
      if (s.gameState !== 'PLAYING') return;

      if (s.mode === 'classic' && s.classicPiece && pointerPinching) {
        const boardNormX = Math.max(0, Math.min(1, pt.x / 0.72));
        const bounds = getMatrixBounds(s.classicPiece.matrix);
        const desiredX = Math.round(
          boardNormX * BOARD_COLS - (bounds.minC + bounds.width / 2)
        );
        const clampedX = Math.max(
          -bounds.minC,
          Math.min(BOARD_COLS - 1 - bounds.maxC, desiredX)
        );
        if (
          clampedX !== s.classicPiece.x &&
          canPlaceClassicPiece(
            s.board,
            s.classicPiece.matrix,
            clampedX,
            s.classicPiece.y
          )
        ) {
          setClassicPiece({ ...s.classicPiece, x: clampedX });
        }
        return;
      }

      if (!s.grabbedPiece) return;
      const placement = computePlacementForCursor(s.board, s.grabbedPiece.matrix, pt);
      setGrabbedPiece({
        ...s.grabbedPiece,
        ...placement,
      });
    },
    [pointerFallbackEnabled, pointerPinching, computePlacementForCursor]
  );

  const handlePointerDownWorkspace = useCallback(
    (pt: Point2D) => {
      if (!pointerFallbackEnabled) return;
      setHandCursor(pt);
      const s = stateRef.current;
      if (s.gameState !== 'PLAYING') return;
      if (s.mode === 'classic' && s.classicPiece) {
        setPointerPinching(true);
        classicPinchStartAtRef.current = performance.now();
        soundEngine.playPickup();
      }
    },
    [pointerFallbackEnabled]
  );

  const handlePointerGrabSlot = useCallback(
    (slotIdx: number) => {
      if (!pointerFallbackEnabled) return;
      const s = stateRef.current;
      if (s.gameState !== 'PLAYING' || s.mode === 'classic') return;
      const piece = s.tray[slotIdx];
      if (!piece) return;
      setPointerPinching(true);
      soundEngine.playPickup();
      setGrabbedPiece({
        sourceSlotIndex: slotIdx,
        type: piece.type,
        matrix: piece.matrix,
        rotation: piece.rotation,
        boardX: 0,
        boardY: 0,
        isOverBoard: false,
        isValid: false,
      });
    },
    [pointerFallbackEnabled]
  );

  const handlePointerRelease = useCallback(() => {
    if (!pointerFallbackEnabled) return;
    setPointerPinching(false);
    const s = stateRef.current;
    if (s.mode === 'classic' && s.classicPiece && s.gameState === 'PLAYING') {
      const dropY = computeClassicGhostY(
        s.board,
        s.classicPiece.matrix,
        s.classicPiece.x,
        s.classicPiece.y
      );
      if (dropY >= 0) {
        const locked = lockMatrixToBoard(
          s.board,
          s.classicPiece.matrix,
          s.classicPiece.x,
          dropY,
          s.classicPiece.type
        );
        const clearedBoard = applyBoardLockAndClear(
          locked,
          s.classicPiece.x,
          dropY,
          s.classicPiece.matrix[0].length,
          s.classicPiece.matrix.length,
          null
        );
        const [nextType, ...restQueue] = s.classicQueue;
        const spawnType = nextType ?? randomizerRef.current.next();
        const matrix = TETROMINO_MATRICES[spawnType];
        const spawnX = Math.floor((BOARD_COLS - matrix[0].length) / 2);
        const nextPiece: ActiveClassicPiece = {
          type: spawnType,
          matrix,
          x: spawnX,
          y: 0,
          rotation: 0,
        };
        if (!canPlaceClassicPiece(clearedBoard, nextPiece.matrix, nextPiece.x, nextPiece.y)) {
          soundEngine.playGameOver();
          setGameState('GAME_OVER');
          setClassicPiece(null);
        } else {
          setClassicPiece(nextPiece);
          setClassicQueue([...restQueue, randomizerRef.current.next()]);
        }
      }
      return;
    }

    if (!s.grabbedPiece) return;
    if (s.grabbedPiece.isOverBoard && s.grabbedPiece.isValid) {
      const nextBoard = lockMatrixToBoard(
        s.board,
        s.grabbedPiece.matrix,
        s.grabbedPiece.boardX,
        s.grabbedPiece.boardY,
        s.grabbedPiece.type
      );
      applyBoardLockAndClear(
        nextBoard,
        s.grabbedPiece.boardX,
        s.grabbedPiece.boardY,
        s.grabbedPiece.matrix[0].length,
        s.grabbedPiece.matrix.length,
        s.grabbedPiece.sourceSlotIndex
      );
    } else {
      if (s.grabbedPiece.isOverBoard) soundEngine.playInvalid();
      else soundEngine.playCancel();
    }
    setGrabbedPiece(null);
  }, [pointerFallbackEnabled, applyBoardLockAndClear]);

  // Global mouseup & right-click rotate support ONLY when Pointer Assist is explicitly enabled
  useEffect(() => {
    if (!pointerFallbackEnabled) return;
    const onWinUp = () => {
      if (stateRef.current.grabbedPiece) {
        handlePointerRelease();
      }
      setPointerPinching(false);
    };
    const onWinContext = (e: MouseEvent) => {
      const s = stateRef.current;
      if (s.gameState !== 'PLAYING') return;
      if (s.mode === 'classic' && s.classicPiece) {
        e.preventDefault();
        const rotated = tryRotateClassicPiece(s.board, s.classicPiece, 'CW');
        if (rotated) {
          soundEngine.playRotate();
          setClassicPiece(rotated);
        }
        return;
      }
      if (s.grabbedPiece) {
        e.preventDefault();
        const rotated = rotateMatrixCW(s.grabbedPiece.matrix);
        soundEngine.playRotate();
        const placement = handCursor
          ? computePlacementForCursor(s.board, rotated, handCursor)
          : {
              boardX: s.grabbedPiece.boardX,
              boardY: s.grabbedPiece.boardY,
              isOverBoard: s.grabbedPiece.isOverBoard,
              isValid: false,
            };
        setGrabbedPiece({
          ...s.grabbedPiece,
          matrix: rotated,
          rotation: (s.grabbedPiece.rotation + 1) % 4,
          ...placement,
        });
      }
    };
    window.addEventListener('mouseup', onWinUp);
    window.addEventListener('contextmenu', onWinContext);
    return () => {
      window.removeEventListener('mouseup', onWinUp);
      window.removeEventListener('contextmenu', onWinContext);
    };
  }, [pointerFallbackEnabled, handlePointerRelease, computePlacementForCursor, handCursor]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
  };

  const stageCfg = getChallengeStage(stageNumber);

  const isSettingsView = gameState === 'CALIBRATING' || gameState === 'SETTINGS';

  return (
    <div className="arcade-grid-bg relative h-screen w-screen overflow-hidden flex flex-col">
      {/* Full-Screen AR Webcam + 21-Landmark Background Layer */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <video ref={videoRef} playsInline muted className="hidden" />
        <canvas
          ref={overlayCanvasRef}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            telemetry.cameraStatus === 'ready' ? 'opacity-85' : 'opacity-0'
          }`}
        />
        {/* Subtle contrast vignette so neon grid & HUD remain crisp */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/25 to-slate-950/65" />
      </div>

      <div className="relative z-10 flex flex-col justify-between h-full min-h-0 px-3 py-2.5 lg:px-5 lg:py-3 max-w-[1440px] w-full mx-auto gap-2.5 overflow-hidden">
        {/* Compact Single-Row Top Bar */}
        <header className="neon-panel rounded-xl px-3.5 py-2 flex items-center justify-between gap-3 shrink-0">
          {/* Zone 1: Brand + Active Mode Label */}
          <div className="flex items-center gap-2.5 shrink-0">
            <h1 className="font-display text-base lg:text-lg font-bold tracking-tight text-white whitespace-nowrap">
              Hand Gesture Tetris
            </h1>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="text-xs font-medium text-cyan-300 whitespace-nowrap">
              {mode === 'classic' ? 'Classic' : 'Challenge'}
            </span>
          </div>

          {/* Live Telemetry Metrics Strip */}
          {!isSettingsView && (
            <div className="flex items-center gap-4 text-xs shrink-0">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Score
                </div>
                <div className="font-mono-tabular text-sm font-bold text-cyan-300">
                  {score.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Lvl
                </div>
                <div className="font-mono-tabular text-sm font-bold text-purple-300">
                  {level}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Lines
                </div>
                <div className="font-mono-tabular text-sm font-bold text-emerald-300">
                  {mode === 'challenge'
                    ? `${stageLines}/${stageCfg.targetLines}`
                    : lines}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Combo
                </div>
                <div className="font-mono-tabular text-sm font-bold text-amber-300">
                  {combo > 0 ? `x${combo}` : '—'}
                </div>
              </div>
              {mode === 'challenge' && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Timer
                  </div>
                  <div
                    className={`font-mono-tabular text-sm font-bold ${
                      timeLeftSec <= 15 ? 'text-rose-400' : 'text-slate-100'
                    }`}
                  >
                    {timeLeftSec}s
                  </div>
                </div>
              )}
              <div className="hidden sm:block">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Best
                </div>
                <div className="font-mono-tabular text-sm font-bold text-slate-200">
                  {highScore.toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Zone 3: Primary Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={toggleMute}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {!isSettingsView && (
              <>
                <button
                  onClick={openSettingsPage}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Settings className="w-3.5 h-3.5 text-cyan-400" />
                  Settings
                </button>

                <button
                  onClick={() => {
                    if (gameState === 'PLAYING') {
                      soundEngine.playPause();
                      setGameState('PAUSED');
                    } else if (gameState === 'PAUSED') {
                      soundEngine.playResume();
                      setGameState('PLAYING');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  {gameState === 'PAUSED' ? (
                    <>
                      <Play className="w-3.5 h-3.5 text-cyan-400" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5 text-amber-400" />
                      Pause
                    </>
                  )}
                </button>

                <button
                  onClick={() => startNewGame(mode, 1, true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restart
                </button>
              </>
            )}
          </div>
        </header>

        {/* Main Content Area: Either Dedicated Settings Page OR Single-Screen Game Arena */}
        {isSettingsView ? (
          <main className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
            <CalibrationModal
              telemetry={telemetry}
              settings={settings}
              selectedMode={mode}
              pointerFallbackEnabled={pointerFallbackEnabled}
              muted={muted}
              hasStartedOnce={hasStartedOnce}
              onSelectMode={(m) => setMode(m)}
              onUpdateSettings={(next) =>
                setSettings((prev) => ({ ...prev, ...next }))
              }
              onRetryCamera={retryCamera}
              onTogglePointerFallback={() => setPointerFallbackEnabled((v) => !v)}
              onToggleMute={toggleMute}
              onStartOrReturn={handleSettingsStartOrReturn}
              onStartFreshGame={() => startNewGame(mode, 1, true)}
            />
          </main>
        ) : (
          <main className="grid grid-cols-[190px_minmax(240px,1fr)_215px] gap-3 items-stretch flex-1 min-h-0 overflow-hidden">
            {/* Left: Compact Live Tracking Status HUD */}
            <WebcamHud
              telemetry={telemetry}
              onRetryCamera={retryCamera}
              pointerFallbackEnabled={pointerFallbackEnabled}
              onTogglePointerFallback={() => setPointerFallbackEnabled((v) => !v)}
            />

            {/* Center: 10x20 Tetris Game Board */}
            <section className="flex flex-col items-center justify-center h-full min-h-0 overflow-hidden">
              {mode === 'challenge' && (
                <div className="mb-1 text-[11px] font-medium text-purple-300 tracking-wide shrink-0">
                  {stageCfg.title} · Target {stageCfg.targetLines} lines
                </div>
              )}
              <TetrisCanvas
                board={board}
                mode={mode}
                gameState={gameState}
                classicPiece={classicPiece}
                grabbedPiece={grabbedPiece}
                handCursor={handCursor}
                isPinching={telemetry.isPinching || pointerPinching}
                particlesRef={particlesRef}
                floatingTextsRef={floatingTextsRef}
                flashRowsRef={flashRowsRef}
                score={score}
                lines={lines}
                stageNumber={stageNumber}
                pointerFallbackEnabled={pointerFallbackEnabled}
                onPointerMoveWorkspace={handlePointerMoveWorkspace}
                onPointerDownWorkspace={handlePointerDownWorkspace}
                onPointerUpWorkspace={handlePointerRelease}
                onRestart={() => startNewGame(mode, 1, true)}
                onResume={() => {
                  soundEngine.playResume();
                  setGameState('PLAYING');
                }}
                onNextStage={() => startNewGame('challenge', stageNumber + 1, true)}
              />
            </section>

            {/* Right: Available Blocks / Next Pieces */}
            <TrayPanel
              mode={mode}
              tray={tray}
              classicQueue={classicQueue}
              classicMatrices={TETROMINO_MATRICES}
              grabbedPiece={grabbedPiece}
              hoveredSlotIndex={hoveredSlotIndex}
              handCursor={handCursor}
              isPinching={telemetry.isPinching || pointerPinching}
              pointerFallbackEnabled={pointerFallbackEnabled}
              onPointerHoverSlot={(idx) => setHoveredSlotIndex(idx)}
              onPointerGrabSlot={handlePointerGrabSlot}
              onPointerRelease={handlePointerRelease}
            />
          </main>
        )}

        {/* Bottom: Compact Small Gesture Control Guide */}
        {!isSettingsView && (
          <GestureGuideBar
            activeGesture={telemetry.activeGesture}
            isPinching={telemetry.isPinching}
          />
        )}
      </div>
    </div>
  );
}
