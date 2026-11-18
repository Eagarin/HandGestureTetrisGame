import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FilesetResolver,
  HandLandmarker,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { CalibrationSettings, HandTrackingTelemetry } from '../types/game';
import {
  GestureFrameEvents,
  GestureStateMachine,
  ProcessedHandOutput,
} from './gestureEngine';

interface UseHandTrackerOptions {
  enabled: boolean;
  settings: CalibrationSettings;
  isHoldingBlock: boolean;
  onFrame: (output: ProcessedHandOutput) => void;
}

const INITIAL_TELEMETRY: HandTrackingTelemetry = {
  cameraStatus: 'idle',
  cameraError: null,
  modelStatus: 'loading',
  handsCount: 0,
  fps: 0,
  activeGesture: 'NONE',
  isPinching: false,
  pinchStrength: 0,
  wristAngleDeg: 0,
  rotationDeltaDeg: 0,
  cursor: null,
  pinchCalibrated: false,
  rotationTested: false,
};

function drawHandOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hands: NormalizedLandmark[][],
  isPinching: boolean,
  mirrorCamera: boolean,
  showSkeleton: boolean
) {
  if (!showSkeleton || hands.length === 0) return;

  const connections = HandLandmarker.HAND_CONNECTIONS;

  hands.forEach((landmarks, handIdx) => {
    const isPrimary = handIdx === 0;
    const strokeColor = isPrimary
      ? isPinching
        ? '#10B981'
        : '#38BDF8'
      : '#C084FC';

    ctx.save();
    // Connections
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isPrimary ? 2.6 : 2;
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 10;

    for (const conn of connections) {
      const a = landmarks[conn.start];
      const b = landmarks[conn.end];
      if (!a || !b) continue;
      const ax = (mirrorCamera ? 1 - a.x : a.x) * width;
      const ay = a.y * height;
      const bx = (mirrorCamera ? 1 - b.x : b.x) * width;
      const by = b.y * height;

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // 21 Landmarks
    landmarks.forEach((lm, idx) => {
      const x = (mirrorCamera ? 1 - lm.x : lm.x) * width;
      const y = lm.y * height;
      const isPinchFinger = idx === 4 || idx === 8;

      ctx.beginPath();
      ctx.arc(x, y, isPinchFinger && isPrimary ? 6 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = isPinchFinger && isPrimary
        ? isPinching
          ? '#34D399'
          : '#FBBF24'
        : '#F8FAFC';
      ctx.fill();
    });

    // Pinch midpoint ring on primary hand
    if (isPrimary && landmarks[4] && landmarks[8]) {
      const mx =
        (mirrorCamera
          ? 1 - (landmarks[4].x + landmarks[8].x) / 2
          : (landmarks[4].x + landmarks[8].x) / 2) * width;
      const my = ((landmarks[4].y + landmarks[8].y) / 2) * height;

      ctx.beginPath();
      ctx.arc(mx, my, isPinching ? 15 : 11, 0, Math.PI * 2);
      ctx.strokeStyle = isPinching ? '#34D399' : 'rgba(251, 191, 36, 0.85)';
      ctx.lineWidth = isPinching ? 3 : 1.75;
      ctx.stroke();
    }
    ctx.restore();
  });
}

export function useHandTracker({
  enabled,
  settings,
  isHoldingBlock,
  onFrame,
}: UseHandTrackerOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const stateMachineRef = useRef(new GestureStateMachine());

  // Latest props in refs so RAF loop stays stable without restarting camera
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const holdingRef = useRef(isHoldingBlock);
  holdingRef.current = isHoldingBlock;
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  const [telemetry, setTelemetry] = useState<HandTrackingTelemetry>(INITIAL_TELEMETRY);
  const [retryCounter, setRetryCounter] = useState(0);

  const calibratedFlagsRef = useRef({ pinch: false, rotate: false });
  const fpsCounterRef = useRef({ frames: 0, lastCheck: performance.now(), fps: 0 });
  const lastUiSyncRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);

  const retryCamera = useCallback(() => {
    setRetryCounter((c) => c + 1);
  }, []);

  const resetCalibrationProgress = useCallback(() => {
    calibratedFlagsRef.current = { pinch: false, rotate: false };
    setTelemetry((prev) => ({
      ...prev,
      pinchCalibrated: false,
      rotationTested: false,
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initMediaPipe() {
      try {
        setTelemetry((prev) => ({ ...prev, modelStatus: 'loading' }));
        let vision;
        try {
          vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        } catch {
          vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
          );
        }

        let landmarker: HandLandmarker;
        try {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/mediapipe/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.5,
          });
        } catch {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.55,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.5,
          });
        }

        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setTelemetry((prev) => ({ ...prev, modelStatus: 'ready' }));
      } catch (err) {
        console.error('MediaPipe init failed:', err);
        if (!cancelled) {
          setTelemetry((prev) => ({ ...prev, modelStatus: 'error' }));
        }
      }
    }

    initMediaPipe();

    return () => {
      cancelled = true;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      stateMachineRef.current.reset();
      setTelemetry((prev) => ({
        ...prev,
        cameraStatus: 'idle',
        handsCount: 0,
        activeGesture: 'NONE',
      }));
      return;
    }

    let cancelled = false;

    async function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setTelemetry((prev) => ({
          ...prev,
          cameraStatus: 'error',
          cameraError: 'Webcam API is not supported in this browser.',
        }));
        return;
      }

      setTelemetry((prev) => ({
        ...prev,
        cameraStatus: 'requesting',
        cameraError: null,
      }));

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }

        setTelemetry((prev) => ({
          ...prev,
          cameraStatus: 'ready',
          cameraError: null,
        }));

        const loop = () => {
          if (cancelled) return;
          const v = videoRef.current;
          const canvas = overlayCanvasRef.current;
          const landmarker = landmarkerRef.current;
          const now = performance.now();

          if (v && v.readyState >= 2 && canvas) {
            if (canvas.width !== v.videoWidth || canvas.height !== v.videoHeight) {
              canvas.width = v.videoWidth || 640;
              canvas.height = v.videoHeight || 480;
            }
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.save();
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              if (settingsRef.current.mirrorCamera) {
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
              }
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              ctx.restore();

              // Subtle dark vignette for HUD legibility
              ctx.fillStyle = 'rgba(6, 9, 19, 0.16)';
              ctx.fillRect(0, 0, canvas.width, canvas.height);

              let rawHands: NormalizedLandmark[][] = [];
              if (landmarker && v.currentTime !== lastVideoTimeRef.current) {
                lastVideoTimeRef.current = v.currentTime;
                try {
                  const res = landmarker.detectForVideo(v, now);
                  rawHands = res.landmarks ?? [];
                } catch {
                  rawHands = [];
                }
              }

              const processed = stateMachineRef.current.process(
                rawHands,
                settingsRef.current,
                now,
                holdingRef.current
              );

              drawHandOverlay(
                ctx,
                canvas.width,
                canvas.height,
                processed.smoothedHands,
                processed.isPinching,
                settingsRef.current.mirrorCamera,
                settingsRef.current.showSkeleton
              );

              if (processed.events.pinchStarted) {
                calibratedFlagsRef.current.pinch = true;
              }
              if (processed.events.rotateDirection !== null) {
                calibratedFlagsRef.current.rotate = true;
              }

              onFrameRef.current(processed);

              // FPS calculation
              fpsCounterRef.current.frames++;
              if (now - fpsCounterRef.current.lastCheck >= 500) {
                fpsCounterRef.current.fps = Math.round(
                  (fpsCounterRef.current.frames * 1000) /
                    (now - fpsCounterRef.current.lastCheck)
                );
                fpsCounterRef.current.frames = 0;
                fpsCounterRef.current.lastCheck = now;
              }

              // Throttle React state telemetry updates to ~15Hz for 60fps Canvas smoothness
              if (now - lastUiSyncRef.current > 66) {
                lastUiSyncRef.current = now;
                setTelemetry((prev) => ({
                  ...prev,
                  handsCount: processed.smoothedHands.length,
                  fps: fpsCounterRef.current.fps,
                  activeGesture: processed.gesture,
                  isPinching: processed.isPinching,
                  pinchStrength: processed.pinchStrength,
                  wristAngleDeg: Math.round(processed.wristAngleDeg),
                  rotationDeltaDeg: Math.round(processed.rotationDeltaDeg),
                  cursor: processed.cursor,
                  pinchCalibrated: calibratedFlagsRef.current.pinch,
                  rotationTested: calibratedFlagsRef.current.rotate,
                }));
              }
            }
          }

          rafRef.current = requestAnimationFrame(loop);
        };

        rafRef.current = requestAnimationFrame(loop);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera permission was denied. Please allow camera access in your browser.'
            : err instanceof DOMException && err.name === 'NotFoundError'
            ? 'No webcam device was found on this computer.'
            : 'Unable to access webcam. Check if another app is using the camera.';
        setTelemetry((prev) => ({
          ...prev,
          cameraStatus: 'error',
          cameraError: message,
        }));
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      lastVideoTimeRef.current = -1;
    };
  }, [enabled, retryCounter]);

  return {
    videoRef,
    overlayCanvasRef,
    telemetry,
    retryCamera,
    resetCalibrationProgress,
  };
}
export type { GestureFrameEvents, ProcessedHandOutput };
