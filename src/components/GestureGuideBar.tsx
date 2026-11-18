import React from 'react';
import { GestureType } from '../types/game';
import {
  ArrowDownToLine,
  Minimize2,
  Move,
  RotateCcw,
  RotateCw,
} from 'lucide-react';

interface GestureGuideBarProps {
  activeGesture: GestureType;
  isPinching: boolean;
}

interface GuideItem {
  id: string;
  gesture: string;
  action: string;
  match: GestureType[];
  icon: React.ReactNode;
}

const GUIDE_ITEMS: GuideItem[] = [
  {
    id: 'pinch',
    gesture: 'Pinch',
    action: 'Grab',
    match: ['PINCH'],
    icon: <Minimize2 className="w-3 h-3" />,
  },
  {
    id: 'move',
    gesture: 'Pinch + Move',
    action: 'Drag',
    match: ['PINCH'],
    icon: <Move className="w-3 h-3" />,
  },
  {
    id: 'cw',
    gesture: 'Twist CW',
    action: '+90°',
    match: ['ROTATE_CW'],
    icon: <RotateCw className="w-3 h-3" />,
  },
  {
    id: 'ccw',
    gesture: 'Twist CCW',
    action: '-90°',
    match: ['ROTATE_CCW'],
    icon: <RotateCcw className="w-3 h-3" />,
  },
  {
    id: 'release',
    gesture: 'Release',
    action: 'Place',
    match: [],
    icon: <ArrowDownToLine className="w-3 h-3" />,
  },
];

export const GestureGuideBar: React.FC<GestureGuideBarProps> = ({
  activeGesture,
}) => {
  return (
    <footer className="neon-panel rounded-lg px-2.5 py-1.5 shrink-0">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {GUIDE_ITEMS.map((item) => {
          const active = item.match.includes(activeGesture);
          return (
            <div
              key={item.id}
              className={`rounded-md px-2.5 py-1 border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                active
                  ? 'bg-cyan-950/50 border-cyan-400/80 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                  : 'bg-slate-900/55 border-slate-800/80 text-slate-300'
              }`}
            >
              <span className={active ? 'text-cyan-300' : 'text-slate-400'}>
                {item.icon}
              </span>
              <span className="text-[11px] font-medium">{item.gesture}</span>
              <span className="text-[10px] text-slate-500">·</span>
              <span
                className={`text-[11px] font-semibold ${
                  active ? 'text-cyan-300' : 'text-slate-400'
                }`}
              >
                {item.action}
              </span>
            </div>
          );
        })}
      </div>
    </footer>
  );
};
