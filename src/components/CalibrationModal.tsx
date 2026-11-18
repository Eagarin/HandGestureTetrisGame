import React from 'react';
import {
  CalibrationSettings,
  GameMode,
  HandTrackingTelemetry,
} from '../types/game';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  FlipHorizontal2,
  Gamepad2,
  MousePointerClick,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface CalibrationModalProps {
  telemetry: HandTrackingTelemetry;
  settings: CalibrationSettings;
  selectedMode: GameMode;
  pointerFallbackEnabled: boolean;
  muted: boolean;
  hasStartedOnce: boolean;
  onSelectMode: (mode: GameMode) => void;
  onUpdateSettings: (next: Partial<CalibrationSettings>) => void;
  onRetryCamera: () => void;
  onTogglePointerFallback: () => void;
  onToggleMute: () => void;
  onStartOrReturn: () => void;
  onStartFreshGame: () => void;
}

const MODES: { id: GameMode; name: string; desc: string }[] = [
  {
    id: 'classic',
    name: 'Classic Arcade',
    desc: 'Falling Tetrominoes with rising speed. Pinch to steer, twist wrist to rotate 90°, release to lock.',
  },
  {
    id: 'challenge',
    name: 'Challenge Sectors',
    desc: 'Pick blocks from the tray and place on the 10×20 grid to clear target lines before time runs out.',
  },
];

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  telemetry,
  settings,
  selectedMode,
  pointerFallbackEnabled,
  muted,
  hasStartedOnce,
  onSelectMode,
  onUpdateSettings,
  onRetryCamera,
  onTogglePointerFallback,
  onToggleMute,
  onStartOrReturn,
  onStartFreshGame,
}) => {
  const cameraReady =
    telemetry.cameraStatus === 'ready' && telemetry.modelStatus === 'ready';
  const handDetected = telemetry.handsCount > 0;

  return (
    <div className="neon-panel rounded-xl p-5 max-w-4xl w-full mx-auto max-h-full flex flex-col justify-between overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal className="w-5 h-5 text-cyan-400" />
          <div>
            <h2 className="font-display text-lg font-bold text-white leading-tight">
              Settings & Hand Calibration
            </h2>
            <p className="text-xs text-slate-400">
              Tune MediaPipe tracking, camera options, audio, and game mode
            </p>
          </div>
        </div>
        {hasStartedOnce && (
          <button
            onClick={onStartOrReturn}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Game
          </button>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4 min-h-0">
        {/* Left: Live Calibration & Sliders */}
        <div className="space-y-3">
          {/* 3-Step Live Calibration Checklist */}
          <div className="grid grid-cols-3 gap-2">
            <div
              className={`rounded-lg p-2.5 border ${
                cameraReady
                  ? 'bg-emerald-950/30 border-emerald-500/40'
                  : 'bg-slate-900/70 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                {cameraReady ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                )}
                <span className="text-[11px] font-semibold text-slate-100">
                  Camera
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                {cameraReady ? 'Online' : telemetry.cameraStatus === 'error' ? 'Error' : 'Loading'}
              </p>
            </div>

            <div
              className={`rounded-lg p-2.5 border ${
                handDetected
                  ? 'bg-emerald-950/30 border-emerald-500/40'
                  : 'bg-slate-900/70 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                {handDetected ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                )}
                <span className="text-[11px] font-semibold text-slate-100">
                  Hand
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                {handDetected ? `${telemetry.handsCount} Tracked` : 'Show Hand'}
              </p>
            </div>

            <div
              className={`rounded-lg p-2.5 border ${
                telemetry.pinchCalibrated
                  ? 'bg-emerald-950/30 border-emerald-500/40'
                  : 'bg-slate-900/70 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                {telemetry.pinchCalibrated ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                )}
                <span className="text-[11px] font-semibold text-slate-100">
                  Pinch
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                {telemetry.pinchCalibrated ? 'Verified' : 'Test Pinch'}
              </p>
            </div>
          </div>

          {/* Live Pinch Test + Sliders */}
          <div className="rounded-lg bg-slate-900/70 border border-slate-800/90 p-3.5 space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-300 font-medium">
                  Live Pinch Test Gauge
                </span>
                <span
                  className={`font-mono-tabular font-semibold ${
                    telemetry.isPinching ? 'text-emerald-400' : 'text-cyan-300'
                  }`}
                >
                  {telemetry.isPinching
                    ? 'GRAB LOCKED'
                    : `${Math.round(telemetry.pinchStrength * 100)}%`}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-75 rounded-full ${
                    telemetry.isPinching ? 'bg-emerald-400' : 'bg-cyan-500'
                  }`}
                  style={{ width: `${Math.round(telemetry.pinchStrength * 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                <span>Pinch Sensitivity</span>
                <span className="font-mono-tabular text-cyan-300">
                  {Math.round(((settings.pinchSensitivity - 0.2) / 0.45) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.22}
                max={0.62}
                step={0.02}
                value={settings.pinchSensitivity}
                onChange={(e) =>
                  onUpdateSettings({ pinchSensitivity: parseFloat(e.target.value) })
                }
                className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                <span>Tracking Smoothness</span>
                <span className="font-mono-tabular text-purple-300">
                  {Math.round((1 - settings.smoothness) * 100)}% Smooth
                </span>
              </div>
              <input
                type="range"
                min={0.18}
                max={0.85}
                step={0.03}
                value={settings.smoothness}
                onChange={(e) =>
                  onUpdateSettings({ smoothness: parseFloat(e.target.value) })
                }
                className="w-full accent-purple-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>
          </div>

          {/* Toggles Grid */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onUpdateSettings({ mirrorCamera: !settings.mirrorCamera })}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                settings.mirrorCamera
                  ? 'bg-cyan-950/40 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-900/75 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <FlipHorizontal2 className="w-3.5 h-3.5" />
              Mirror: {settings.mirrorCamera ? 'On' : 'Off'}
            </button>

            <button
              onClick={() => onUpdateSettings({ showSkeleton: !settings.showSkeleton })}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                settings.showSkeleton
                  ? 'bg-purple-950/40 text-purple-300 border-purple-500/40'
                  : 'bg-slate-900/75 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              {settings.showSkeleton ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" />
              )}
              Skeleton: {settings.showSkeleton ? 'On' : 'Off'}
            </button>

            <button
              onClick={onToggleMute}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                !muted
                  ? 'bg-slate-800/80 text-slate-200 border-slate-700'
                  : 'bg-slate-900/75 text-slate-400 border-slate-800'
              }`}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              Sound: {muted ? 'Muted' : 'On'}
            </button>

            <button
              onClick={onTogglePointerFallback}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                pointerFallbackEnabled
                  ? 'bg-purple-950/50 border-purple-400/60 text-purple-200'
                  : 'bg-slate-900/75 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              Mouse Assist: {pointerFallbackEnabled ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        {/* Right: Mode Selection */}
        <div className="flex flex-col justify-between space-y-2.5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-2">
              <Gamepad2 className="w-4 h-4 text-purple-400" />
              Select Game Mode
            </div>
            <div className="space-y-2">
              {MODES.map((m) => {
                const active = selectedMode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => onSelectMode(m.id)}
                    className={`w-full text-left rounded-lg p-3 border transition-all cursor-pointer ${
                      active
                        ? 'bg-cyan-950/45 border-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.18)]'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`font-display text-sm font-semibold mb-0.5 ${
                        active ? 'text-cyan-300' : 'text-slate-100'
                      }`}
                    >
                      {m.name}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      {m.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {telemetry.cameraStatus === 'error' && (
            <button
              onClick={onRetryCamera}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Camera Permission
            </button>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/80 shrink-0">
        {hasStartedOnce && (
          <button
            onClick={onStartFreshGame}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            New Game
          </button>
        )}
        <button
          onClick={onStartOrReturn}
          className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.35)] whitespace-nowrap"
        >
          <Play className="w-4 h-4" />
          {hasStartedOnce ? 'Resume Game' : 'Start Playing'}
        </button>
      </div>
    </div>
  );
};
