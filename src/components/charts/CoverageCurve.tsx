import { useMemo, useState, useCallback, useRef } from 'react';
import { scaleLog, scaleLinear } from 'd3-scale';
import { line, area, curveMonotoneX } from 'd3-shape';
import { bisector } from 'd3-array';
import { ChartContainer } from './ChartContainer';
import { Tooltip } from './Tooltip';

export interface CoveragePoint {
  rank: number;
  name: string;
  quantity: number;
  cumulative_percent: number;
}

interface CoverageCurveProps {
  data: CoveragePoint[];
  title: string;
  thresholds?: number[];
  color?: string;
}

const MARGIN = { top: 40, right: 120, bottom: 50, left: 60 };

export function CoverageCurve({
  data,
  title,
  thresholds = [50, 80, 90, 95, 99],
  color = '#0969da',
}: CoverageCurveProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    visible: boolean;
    content: { rank: number; name: string; cumulative: number } | null;
  }>({
    x: 0,
    y: 0,
    visible: false,
    content: null,
  });

  const svgRef = useRef<SVGSVGElement>(null);

  // Calculate threshold crossing points
  const thresholdPoints = useMemo(() => {
    if (data.length === 0) return [];

    return thresholds.map((threshold) => {
      // Find first point that crosses threshold
      const crossingIndex = data.findIndex((d) => d.cumulative_percent >= threshold);
      if (crossingIndex === -1) return null;

      const point = data[crossingIndex];
      return {
        threshold,
        rank: point.rank,
        name: point.name,
        cumulative: point.cumulative_percent,
      };
    }).filter(Boolean) as Array<{
      threshold: number;
      rank: number;
      name: string;
      cumulative: number;
    }>;
  }, [data, thresholds]);

  const bisect = useMemo(() => bisector<CoveragePoint, number>((d) => d.rank).left, []);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>, xScale: ReturnType<typeof scaleLog>) => {
      if (data.length === 0) return;

      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;

      const mouseX = event.clientX - svgRect.left - MARGIN.left;
      const rank = xScale.invert(mouseX);

      // Find closest data point
      const index = bisect(data, rank);
      const d0 = data[index - 1];
      const d1 = data[index];

      let closest: CoveragePoint;
      if (!d0) {
        closest = d1;
      } else if (!d1) {
        closest = d0;
      } else {
        closest = rank - d0.rank < d1.rank - rank ? d0 : d1;
      }

      if (closest) {
        setTooltip({
          x: event.clientX - svgRect.left,
          y: event.clientY - svgRect.top,
          visible: true,
          content: {
            rank: closest.rank,
            name: closest.name,
            cumulative: closest.cumulative_percent,
          },
        });
      }
    },
    [data, bisect]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  if (data.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#57606a' }}>
        No coverage data available
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <h3 style={{
        margin: '0 0 1rem 0',
        fontSize: '1rem',
        fontWeight: 600,
        color: '#24292f'
      }}>
        {title}
      </h3>
      <ChartContainer aspectRatio={2} minHeight={300} maxHeight={400}>
        {({ width, height }) => {
          const innerWidth = width - MARGIN.left - MARGIN.right;
          const innerHeight = height - MARGIN.top - MARGIN.bottom;

          if (innerWidth <= 0 || innerHeight <= 0) return null;

          // Scales
          const xScale = scaleLog()
            .domain([1, data.length])
            .range([0, innerWidth])
            .nice();

          const yScale = scaleLinear()
            .domain([0, 100])
            .range([innerHeight, 0]);

          // Line and area generators
          const lineGenerator = line<CoveragePoint>()
            .x((d) => xScale(d.rank))
            .y((d) => yScale(d.cumulative_percent))
            .curve(curveMonotoneX);

          const areaGenerator = area<CoveragePoint>()
            .x((d) => xScale(d.rank))
            .y0(innerHeight)
            .y1((d) => yScale(d.cumulative_percent))
            .curve(curveMonotoneX);

          const linePath = lineGenerator(data);
          const areaPath = areaGenerator(data);

          // Generate axis ticks
          const xTicks = xScale.ticks(5).filter((t) => t >= 1);
          const yTicks = yScale.ticks(5);

          return (
            <>
              <svg
                ref={svgRef}
                width={width}
                height={height}
                style={{ display: 'block' }}
              >
                <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
                  {/* Grid lines */}
                  {yTicks.map((tick) => (
                    <line
                      key={`grid-y-${tick}`}
                      x1={0}
                      x2={innerWidth}
                      y1={yScale(tick)}
                      y2={yScale(tick)}
                      stroke="#e1e4e8"
                      strokeWidth={1}
                    />
                  ))}

                  {/* Area fill */}
                  {areaPath && (
                    <path
                      d={areaPath}
                      fill={color}
                      fillOpacity={0.1}
                    />
                  )}

                  {/* Threshold reference lines */}
                  {thresholdPoints.map((tp) => {
                    const x = xScale(tp.rank);
                    const y = yScale(tp.cumulative);
                    return (
                      <g key={`threshold-${tp.threshold}`}>
                        {/* Horizontal dashed line from left to curve */}
                        <line
                          x1={0}
                          x2={x}
                          y1={y}
                          y2={y}
                          stroke="#57606a"
                          strokeWidth={1}
                          strokeDasharray="4,4"
                        />
                        {/* Vertical dashed line from curve to x-axis */}
                        <line
                          x1={x}
                          x2={x}
                          y1={y}
                          y2={innerHeight}
                          stroke="#57606a"
                          strokeWidth={1}
                          strokeDasharray="4,4"
                        />
                        {/* Threshold marker point */}
                        <circle
                          cx={x}
                          cy={y}
                          r={4}
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                      </g>
                    );
                  })}

                  {/* Main curve line */}
                  {linePath && (
                    <path
                      d={linePath}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                    />
                  )}

                  {/* X axis */}
                  <g transform={`translate(0, ${innerHeight})`}>
                    <line x1={0} x2={innerWidth} y1={0} y2={0} stroke="#d0d7de" />
                    {xTicks.map((tick) => (
                      <g key={`x-${tick}`} transform={`translate(${xScale(tick)}, 0)`}>
                        <line y1={0} y2={6} stroke="#d0d7de" />
                        <text
                          y={20}
                          textAnchor="middle"
                          fontSize={12}
                          fill="#57606a"
                        >
                          {tick.toLocaleString()}
                        </text>
                      </g>
                    ))}
                    <text
                      x={innerWidth / 2}
                      y={40}
                      textAnchor="middle"
                      fontSize={12}
                      fill="#24292f"
                      fontWeight={500}
                    >
                      Rank (log scale)
                    </text>
                  </g>

                  {/* Y axis */}
                  <g>
                    <line x1={0} x2={0} y1={0} y2={innerHeight} stroke="#d0d7de" />
                    {yTicks.map((tick) => (
                      <g key={`y-${tick}`} transform={`translate(0, ${yScale(tick)})`}>
                        <line x1={-6} x2={0} stroke="#d0d7de" />
                        <text
                          x={-10}
                          textAnchor="end"
                          fontSize={12}
                          fill="#57606a"
                          dominantBaseline="middle"
                        >
                          {tick}%
                        </text>
                      </g>
                    ))}
                    <text
                      transform={`translate(-45, ${innerHeight / 2}) rotate(-90)`}
                      textAnchor="middle"
                      fontSize={12}
                      fill="#24292f"
                      fontWeight={500}
                    >
                      Cumulative Coverage
                    </text>
                  </g>

                  {/* Threshold labels on right side */}
                  <g transform={`translate(${innerWidth + 10}, 0)`}>
                    {thresholdPoints.map((tp) => (
                      <text
                        key={`label-${tp.threshold}`}
                        y={yScale(tp.cumulative)}
                        fontSize={11}
                        fill="#24292f"
                        dominantBaseline="middle"
                      >
                        {tp.threshold}%: {tp.rank.toLocaleString()} items
                      </text>
                    ))}
                  </g>

                  {/* Invisible rect for mouse tracking */}
                  <rect
                    x={0}
                    y={0}
                    width={innerWidth}
                    height={innerHeight}
                    fill="transparent"
                    onMouseMove={(e) => handleMouseMove(e, xScale)}
                    onMouseLeave={handleMouseLeave}
                    style={{ cursor: 'crosshair' }}
                  />
                </g>
              </svg>
              <Tooltip x={tooltip.x} y={tooltip.y} visible={tooltip.visible}>
                {tooltip.content && (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                      Rank #{(tooltip.content.rank ?? 0).toLocaleString()}
                    </div>
                    <div style={{ marginBottom: '2px' }}>{tooltip.content.name ?? 'Unknown'}</div>
                    <div style={{ color: '#8b949e' }}>
                      {(tooltip.content.cumulative ?? 0).toFixed(2)}% cumulative
                    </div>
                  </div>
                )}
              </Tooltip>
            </>
          );
        }}
      </ChartContainer>
    </div>
  );
}
