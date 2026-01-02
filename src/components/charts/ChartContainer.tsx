import { useState, useRef, useEffect, ReactNode } from 'react';

interface ChartContainerProps {
  children: (dimensions: { width: number; height: number }) => ReactNode;
  aspectRatio?: number;
  minHeight?: number;
}

export function ChartContainer({
  children,
  aspectRatio = 16 / 9,
  minHeight = 300,
}: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const height = Math.max(width / aspectRatio, minHeight);
        setDimensions({ width, height });
      }
    });

    resizeObserver.observe(container);

    // Initial measurement
    const width = container.clientWidth;
    const height = Math.max(width / aspectRatio, minHeight);
    setDimensions({ width, height });

    return () => {
      resizeObserver.disconnect();
    };
  }, [aspectRatio, minHeight]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        minHeight: `${minHeight}px`,
        position: 'relative',
      }}
    >
      {dimensions.width > 0 && children(dimensions)}
    </div>
  );
}
