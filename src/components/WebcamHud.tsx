import React from 'react';
import { GestureType, HandTrackingTelemetry } from '../types/game';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  Hand,
  RefreshCw,
} from 'lucide-react';

interface WebcamHudProps {
  telemetry: HandTrackingTelemetry;
  onRetryCamera: () => void;
  pointerFallbackEnabled: boolean;
  onTogglePointerFallback: () => void;
}

const GESTURE_LABELS: Record<GestureType, { label: string; tone: string }> = {
  NONE: { label: 'Tracking Ready', tone: 'text-slate-300' },
  PINCH: { label: 'Pinch Grab', tone: 'text-emerald-400' },
  ROTATE_CW: { label: 'Rotate +90°', tone: 'text-purple-300' },
  ROTATE_CCW: { label: 'Rotate -90°', tone: 'text-purple-300' },
};

export const WebcamHud: React.FC<WebcamHudProps> = ({
  telemetry,
  onRetryCamera,
  pointerFallbackEnabled,
  onTogglePointerFallback,
}) => {
  const gestureInfo = GESTURE_LABELS[telemetry.activeGesture];
  const noHandsVisible =
    telemetry.cameraStatus === 'ready' && telemetry.handsCount === 0;

  return (
    <aside className="neon-panel rounded-xl p-3 flex flex-col justify-between h-full min-h-0">
      <div className="space-y-2.5 min-h-0">
        {/* Panel Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
            <h2 className="font-display text-xs font-semibold tracking-wide text-slate-100">
              Tracking Status
            </h2>
          </div>
          <span className="font-mono-tabular text-[11px] text-cyan-300">
            {telemetry.cameraStatus === 'ready'
              ? `${telemetry.handsCount}H · ${telemetry.fps} FPS`
              : telemetry.cameraStatus === 'requesting'
              ? 'Init...'
              : 'Offline'}
          </span>
        </div>

        {/* Status Alerts */}
        {(telemetry.cameraStatus === 'requesting' ||
          (telemetry.cameraStatus === 'ready' && telemetry.modelStatus === 'loading')) && (
          <div className="rounded-lg bg-slate-900/75 border border-cyan-500/30 p-2.5 flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <p className="text-[11px] text-slate-200">
              {telemetry.cameraStatus === 'requesting'
                ? 'Starting camera...'
                : 'Loading AI model...'}
            </p>
          </div>
        )}

        {telemetry.cameraStatus === 'error' && (
          <div className="rounded-lg bg-rose-950/45 border border-rose-500/40 p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <CameraOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span className="text-[11px] font-semibold text-rose-200">
                Camera Unavailable
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug mb-2">
              {telemetry.cameraError}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={onRetryCamera}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[11px] font-semibold cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
              <button
                onClick={onTogglePointerFallback}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] border border-slate-700 cursor-pointer"
              >
                {pointerFallbackEnabled ? 'Mouse On' : 'Mouse Assist'}
              </button>
            </div>
          </div>
        )}

        {noHandsVisible && (
          <div className="rounded-lg bg-amber-950/45 border border-amber-500/40 p-2 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] text-amber-200 font-medium leading-tight">
              Show hand in frame
            </span>
          </div>
        )}

        {telemetry.cameraStatus === 'ready' && telemetry.handsCount > 0 && (
          <div className="rounded-lg bg-cyan-950/30 border border-cyan-500/30 p-2 flex items-center gap-2">
            <Hand className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-[11px] text-cyan-100 font-medium leading-tight">
              AR Hand Active
            </span>
          </div>
        )}

        {/* Live Gesture & Pinch Readout */}
        <div className="rounded-lg bg-slate-900/60 border border-slate-800/90 p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Gesture</span>
            <span className={`font-semibold ${gestureInfo.tone}`}>
              {gestureInfo.label}
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
              <span>Pinch</span>
              <span className="font-mono-tabular text-slate-200">
                {Math.round(telemetry.pinchStrength * 100)}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-75 rounded-full ${
                  telemetry.isPinching ? 'bg-emerald-400' : 'bg-cyan-500'
                }`}
                style={{ width: `${Math.round(telemetry.pinchStrength * 100)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Wrist Tilt</span>
            <span className="font-mono-tabular text-slate-200">
              {telemetry.wristAngleDeg > 0 ? `+${telemetry.wristAngleDeg}°` : `${telemetry.wristAngleDeg}°`}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
