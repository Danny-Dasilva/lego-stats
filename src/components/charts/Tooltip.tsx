import { ReactNode } from 'react';

interface TooltipProps {
  x: number;
  y: number;
  visible: boolean;
  children: ReactNode;
}

export function Tooltip({ x, y, visible, children }: TooltipProps) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: x + 10,
        top: y + 10,
        background: '#24292f',
        color: '#ffffff',
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '0.875rem',
        lineHeight: 1.4,
        pointerEvents: 'none',
        zIndex: 1000,
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        transform: 'translateZ(0)',
      }}
    >
      {children}
    </div>
  );
}
