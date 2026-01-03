import { useState, useRef, useEffect, ReactNode } from 'react';

interface ChartContainerProps {
  children: (dimensions: { width: number; height: number }) => ReactNode;
  aspectRatio?: number;
  minHeight?: number;
  maxHeight?: number;
}

export function ChartContainer({
  children,
  aspectRatio = 16 / 9,
  minHeight = 300,
  maxHeight = 500,
}: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const calculateHeight = (width: number) => {
      const aspectHeight = width / aspectRatio;
      // Clamp height between minHeight and maxHeight
      return Math.min(Math.max(aspectHeight, minHeight), maxHeight);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const height = calculateHeight(width);
        setDimensions({ width, height });
      }
    });

    resizeObserver.observe(container);

    // Initial measurement
    const width = container.clientWidth;
    const height = calculateHeight(width);
    setDimensions({ width, height });

    return () => {
      resizeObserver.disconnect();
    };
  }, [aspectRatio, minHeight, maxHeight]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: dimensions.height > 0 ? `${dimensions.height}px` : `${minHeight}px`,
        minHeight: `${minHeight}px`,
        maxHeight: `${maxHeight}px`,
        position: 'relative',
      }}
    >
      {dimensions.width > 0 && children(dimensions)}
    </div>
  );
}
