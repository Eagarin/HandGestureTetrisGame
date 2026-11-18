import { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { CalibrationSettings, GestureType, Point2D } from '../types/game';

export interface GestureFrameEvents {
  pinchStarted: boolean;
  pinchReleased: boolean;
  rotateDirection: 'CW' | 'CCW' | null;
}

export interface ProcessedHandOutput {
  smoothedHands: NormalizedLandmark[][];
  gesture: GestureType;
  isPinching: boolean;
  pinchStrength: number;
  wristAngleDeg: number;
  rotationDeltaDeg: number;
  cursor: Point2D | null;
  events: GestureFrameEvents;
}

function dist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normalizeErgonomicCoord(val: number, margin: number): number {
  return clamp01((val - margin) / (1 - margin * 2));
}

function normalizeAngleDelta(deg: number): number {
  let d = deg;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export class GestureStateMachine {
  private prevHands: NormalizedLandmark[][] = [];
  private smoothedCursor: Point2D | null = null;
  private isPinching = false;
  private refWristAngleDeg: number | null = null;
  private lastRotateAt = 0;
  private activeRotateFlashUntil = 0;
  private activeRotateFlashDir: 'ROTATE_CW' | 'ROTATE_CCW' | null = null;

  public reset() {
    this.prevHands = [];
    this.smoothedCursor = null;
    this.isPinching = false;
    this.refWristAngleDeg = null;
    this.lastRotateAt = 0;
    this.activeRotateFlashUntil = 0;
    this.activeRotateFlashDir = null;
  }

  public process(
    rawHands: NormalizedLandmark[][],
    settings: CalibrationSettings,
    nowMs: number,
    _isHoldingBlock: boolean
  ): ProcessedHandOutput {
    const events: GestureFrameEvents = {
      pinchStarted: false,
      pinchReleased: false,
      rotateDirection: null,
    };

    if (!rawHands || rawHands.length === 0) {
      if (this.isPinching) {
        this.isPinching = false;
        events.pinchReleased = true;
      }
      this.prevHands = [];
      this.refWristAngleDeg = null;

      return {
        smoothedHands: [],
        gesture: 'NONE',
        isPinching: false,
        pinchStrength: 0,
        wristAngleDeg: 0,
        rotationDeltaDeg: 0,
        cursor: this.smoothedCursor,
        events,
      };
    }

    // Smooth all detected hands using EMA
    const alpha = Math.max(0.12, Math.min(0.92, settings.smoothness));
    const smoothedHands: NormalizedLandmark[][] = rawHands.map((hand, hIdx) => {
      const prev = this.prevHands[hIdx];
      if (!prev || prev.length !== hand.length) {
        return hand.map((lm) => ({ ...lm }));
      }
      return hand.map((lm, i) => ({
        x: prev[i].x + alpha * (lm.x - prev[i].x),
        y: prev[i].y + alpha * (lm.y - prev[i].y),
        z: prev[i].z + alpha * (lm.z - prev[i].z),
        visibility: lm.visibility,
      }));
    });
    this.prevHands = smoothedHands;

    // Primary hand is hand 0
    const primary = smoothedHands[0];
    const wrist = primary[0];
    const thumbTip = primary[4];
    const indexTip = primary[8];
    const middleMcp = primary[9];

    // Palm scale reference (wrist -> middle MCP)
    const palmScale = Math.max(0.04, dist2D(wrist, middleMcp));
    const pinchDist = dist2D(thumbTip, indexTip);
    const pinchRatio = pinchDist / palmScale;

    // Hysteresis prevents flicker at pinch boundary
    const enterThreshold = settings.pinchSensitivity;
    const exitThreshold = enterThreshold * 1.38;

    const wasPinching = this.isPinching;
    if (!wasPinching && pinchRatio < enterThreshold) {
      this.isPinching = true;
      events.pinchStarted = true;
    } else if (wasPinching && pinchRatio > exitThreshold) {
      this.isPinching = false;
      events.pinchReleased = true;
    }

    const pinchStrength = clamp01(1 - (pinchRatio - 0.16) / (exitThreshold - 0.16));

    // Cursor point: blend index tip & thumb tip (mirrored in X if mirrorCamera)
    // Map [0.22..0.88] horizontally so the hand visually aligns with Center Board (0..0.72) & Right Tray (0.72..1.0)
    const rawCursorX = indexTip.x * 0.6 + thumbTip.x * 0.4;
    const rawCursorY = indexTip.y * 0.6 + thumbTip.y * 0.4;
    const orientedX = settings.mirrorCamera ? 1 - rawCursorX : rawCursorX;

    const mappedCursor: Point2D = {
      x: clamp01((orientedX - 0.22) / (0.88 - 0.22)),
      y: normalizeErgonomicCoord(rawCursorY, 0.12),
    };

    if (!this.smoothedCursor) {
      this.smoothedCursor = mappedCursor;
    } else {
      const cursorAlpha = Math.max(0.15, Math.min(0.88, alpha));
      this.smoothedCursor = {
        x: this.smoothedCursor.x + cursorAlpha * (mappedCursor.x - this.smoothedCursor.x),
        y: this.smoothedCursor.y + cursorAlpha * (mappedCursor.y - this.smoothedCursor.y),
      };
    }

    // Wrist orientation angle in degrees (0 = hand upright, + = clockwise tilt, - = CCW tilt)
    const wristX = settings.mirrorCamera ? 1 - wrist.x : wrist.x;
    const midX = settings.mirrorCamera ? 1 - middleMcp.x : middleMcp.x;
    const dx = midX - wristX;
    const dy = -(middleMcp.y - wrist.y); // positive upward
    const wristAngleDeg = (Math.atan2(dx, Math.max(0.01, dy)) * 180) / Math.PI;

    // Rotation detection with reference angle + cooldown debounce (400ms)
    let rotationDeltaDeg = 0;
    if (this.isPinching) {
      if (this.refWristAngleDeg === null || events.pinchStarted) {
        this.refWristAngleDeg = wristAngleDeg;
      } else {
        rotationDeltaDeg = normalizeAngleDelta(wristAngleDeg - this.refWristAngleDeg);
        const ROTATE_TRIGGER_DEG = 28;
        const ROTATE_COOLDOWN_MS = 400;

        if (nowMs - this.lastRotateAt > ROTATE_COOLDOWN_MS) {
          if (rotationDeltaDeg >= ROTATE_TRIGGER_DEG) {
            events.rotateDirection = 'CW';
            this.lastRotateAt = nowMs;
            this.refWristAngleDeg = wristAngleDeg;
            this.activeRotateFlashDir = 'ROTATE_CW';
            this.activeRotateFlashUntil = nowMs + 420;
          } else if (rotationDeltaDeg <= -ROTATE_TRIGGER_DEG) {
            events.rotateDirection = 'CCW';
            this.lastRotateAt = nowMs;
            this.refWristAngleDeg = wristAngleDeg;
            this.activeRotateFlashDir = 'ROTATE_CCW';
            this.activeRotateFlashUntil = nowMs + 420;
          }
        }
      }
    } else {
      this.refWristAngleDeg = null;
    }

    // Determine primary gesture label for HUD
    let gesture: GestureType = 'NONE';
    if (this.activeRotateFlashDir && nowMs < this.activeRotateFlashUntil) {
      gesture = this.activeRotateFlashDir;
    } else if (this.isPinching) {
      gesture = 'PINCH';
    }

    return {
      smoothedHands,
      gesture,
      isPinching: this.isPinching,
      pinchStrength,
      wristAngleDeg,
      rotationDeltaDeg,
      cursor: this.smoothedCursor,
      events,
    };
  }
}
