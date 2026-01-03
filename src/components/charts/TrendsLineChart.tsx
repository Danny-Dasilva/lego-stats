import { useMemo, useState, useCallback, useRef } from 'react';
import { scaleLinear, scaleBand } from 'd3-scale';
import { line, curveMonotoneX } from 'd3-shape';
import { max } from 'd3-array';
import { ChartContainer } from './ChartContainer';
import { Tooltip } from './Tooltip';

export interface YearTrend {
  year: number;
  total_pieces: number;
  total_sets: number;
  avg_pieces_per_set: number;
  unique_colors: number | null;
  unique_parts: number | null;
  top_color: string | null;
  top_color_hex: string | null;
  top_part: string | null;
  top_part_name: string | null;
  data_source?: 'inventory' | 'sets_only';
}

interface TrendsLineChartProps {
  data: YearTrend[];
  title?: string;
}

const MARGIN = { top: 40, right: 80, bottom: 50, left: 60 };

// Colors matching the spec
const COLORS = {
  bars: '#d0d7de',
  barsLimited: '#e8eaed',
  lineAvgPieces: '#0969da',
  lineUniqueParts: '#cf222e',
};

export function TrendsLineChart({
  data,
  title = 'LEGO Historical Trends',
}: TrendsLineChartProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    visible: boolean;
    content: YearTrend | null;
  }>({
    x: 0,
    y: 0,
    visible: false,
    content: null,
  });

  const svgRef = useRef<SVGSVGElement>(null);

  // Sort data by year ascending
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => a.year - b.year);
  }, [data]);

  // Find data points that have valid unique_parts values (for the red line)
  const dataWithUniqueParts = useMemo(() => {
    return sortedData.filter((d) => d.unique_parts !== null);
  }, [sortedData]);

  const handleMouseMove = useCallback(
    (
      event: React.MouseEvent<SVGRectElement>,
      xScale: ReturnType<typeof scaleBand<number>>
    ) => {
      if (sortedData.length === 0) return;

      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;

      const mouseX = event.clientX - svgRect.left - MARGIN.left;

      // Find closest year based on mouse position
      const step = xScale.step();
      let closestIndex = Math.floor(mouseX / step);
      closestIndex = Math.max(0, Math.min(closestIndex, sortedData.length - 1));

      const closest = sortedData[closestIndex];

      if (closest) {
        setTooltip({
          x: event.clientX - svgRect.left,
          y: event.clientY - svgRect.top,
          visible: true,
          content: closest,
        });
      }
    },
    [sortedData]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  if (sortedData.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#57606a' }}>
        No trend data available
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <h3
        style={{
          margin: '0 0 1rem 0',
          fontSize: '1rem',
          fontWeight: 600,
          color: '#24292f',
        }}
      >
        {title}
      </h3>
      <ChartContainer aspectRatio={2.5} minHeight={350} maxHeight={450}>
        {({ width, height }) => {
          const innerWidth = width - MARGIN.left - MARGIN.right;
          const innerHeight = height - MARGIN.top - MARGIN.bottom;

          if (innerWidth <= 0 || innerHeight <= 0) return null;

          // X scale (years as bands for bars)
          const years = sortedData.map((d) => d.year);
          const xScale = scaleBand<number>()
            .domain(years)
            .range([0, innerWidth])
            .padding(0.2);

          // Left Y scale (sets count - for bars)
          const maxSets = max(sortedData, (d) => d.total_sets) || 0;
          const yScaleSets = scaleLinear()
            .domain([0, maxSets * 1.1])
            .range([innerHeight, 0])
            .nice();

          // Right Y scale (pieces - for lines)
          const maxAvgPieces = max(sortedData, (d) => d.avg_pieces_per_set) || 0;
          const maxUniqueParts = max(dataWithUniqueParts, (d) => d.unique_parts || 0) || 0;
          const maxPiecesValue = Math.max(maxAvgPieces, maxUniqueParts / 10); // Scale unique_parts down
          const yScalePieces = scaleLinear()
            .domain([0, maxPiecesValue * 1.1])
            .range([innerHeight, 0])
            .nice();

          // Line generators
          const avgPiecesLine = line<YearTrend>()
            .x((d) => (xScale(d.year) || 0) + xScale.bandwidth() / 2)
            .y((d) => yScalePieces(d.avg_pieces_per_set))
            .curve(curveMonotoneX);

          // For unique_parts line, we need to handle nulls
          // We'll draw segments only between non-null points
          const uniquePartsLine = line<YearTrend>()
            .defined((d) => d.unique_parts !== null)
            .x((d) => (xScale(d.year) || 0) + xScale.bandwidth() / 2)
            .y((d) => yScalePieces((d.unique_parts || 0) / 10)) // Scale down to fit
            .curve(curveMonotoneX);

          // Generate axis ticks
          const yTicksSets = yScaleSets.ticks(5);
          const yTicksPieces = yScalePieces.ticks(5);

          // Determine which years to show on x-axis (avoid overcrowding)
          const xTickInterval = Math.ceil(years.length / 15);
          const xTicks = years.filter((_, i) => i % xTickInterval === 0);

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
                  {yTicksSets.map((tick) => (
                    <line
                      key={`grid-y-${tick}`}
                      x1={0}
                      x2={innerWidth}
                      y1={yScaleSets(tick)}
                      y2={yScaleSets(tick)}
                      stroke="#e1e4e8"
                      strokeWidth={1}
                    />
                  ))}

                  {/* Bars (sets per year) */}
                  {sortedData.map((d) => {
                    const isLimitedData = d.data_source === 'sets_only' || d.year < 2010;
                    return (
                      <rect
                        key={`bar-${d.year}`}
                        x={xScale(d.year)}
                        y={yScaleSets(d.total_sets)}
                        width={xScale.bandwidth()}
                        height={innerHeight - yScaleSets(d.total_sets)}
                        fill={isLimitedData ? COLORS.barsLimited : COLORS.bars}
                        rx={2}
                      />
                    );
                  })}

                  {/* Line: Average pieces per set (blue) */}
                  <path
                    d={avgPiecesLine(sortedData) || ''}
                    fill="none"
                    stroke={COLORS.lineAvgPieces}
                    strokeWidth={2.5}
                  />

                  {/* Line: Unique parts (red) - scaled down */}
                  <path
                    d={uniquePartsLine(sortedData) || ''}
                    fill="none"
                    stroke={COLORS.lineUniqueParts}
                    strokeWidth={2.5}
                  />

                  {/* Data points for avg pieces */}
                  {sortedData.map((d) => (
                    <circle
                      key={`point-avg-${d.year}`}
                      cx={(xScale(d.year) || 0) + xScale.bandwidth() / 2}
                      cy={yScalePieces(d.avg_pieces_per_set)}
                      r={3}
                      fill={COLORS.lineAvgPieces}
                    />
                  ))}

                  {/* Data points for unique parts */}
                  {sortedData
                    .filter((d) => d.unique_parts !== null)
                    .map((d) => (
                      <circle
                        key={`point-parts-${d.year}`}
                        cx={(xScale(d.year) || 0) + xScale.bandwidth() / 2}
                        cy={yScalePieces((d.unique_parts || 0) / 10)}
                        r={3}
                        fill={COLORS.lineUniqueParts}
                      />
                    ))}

                  {/* X axis */}
                  <g transform={`translate(0, ${innerHeight})`}>
                    <line x1={0} x2={innerWidth} y1={0} y2={0} stroke="#d0d7de" />
                    {xTicks.map((year) => (
                      <g
                        key={`x-${year}`}
                        transform={`translate(${(xScale(year) || 0) + xScale.bandwidth() / 2}, 0)`}
                      >
                        <line y1={0} y2={6} stroke="#d0d7de" />
                        <text
                          y={20}
                          textAnchor="middle"
                          fontSize={11}
                          fill="#57606a"
                        >
                          {year}
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
                      Year
                    </text>
                  </g>

                  {/* Left Y axis (Sets) */}
                  <g>
                    <line x1={0} x2={0} y1={0} y2={innerHeight} stroke="#d0d7de" />
                    {yTicksSets.map((tick) => (
                      <g
                        key={`y-sets-${tick}`}
                        transform={`translate(0, ${yScaleSets(tick)})`}
                      >
                        <line x1={-6} x2={0} stroke="#d0d7de" />
                        <text
                          x={-10}
                          textAnchor="end"
                          fontSize={11}
                          fill="#57606a"
                          dominantBaseline="middle"
                        >
                          {tick.toLocaleString()}
                        </text>
                      </g>
                    ))}
                    <text
                      transform={`translate(-45, ${innerHeight / 2}) rotate(-90)`}
                      textAnchor="middle"
                      fontSize={12}
                      fill="#57606a"
                      fontWeight={500}
                    >
                      Sets Released
                    </text>
                  </g>

                  {/* Right Y axis (Pieces) */}
                  <g transform={`translate(${innerWidth}, 0)`}>
                    <line x1={0} x2={0} y1={0} y2={innerHeight} stroke="#d0d7de" />
                    {yTicksPieces.map((tick) => (
                      <g
                        key={`y-pieces-${tick}`}
                        transform={`translate(0, ${yScalePieces(tick)})`}
                      >
                        <line x1={0} x2={6} stroke="#d0d7de" />
                        <text
                          x={10}
                          textAnchor="start"
                          fontSize={11}
                          fill="#57606a"
                          dominantBaseline="middle"
                        >
                          {tick.toLocaleString()}
                        </text>
                      </g>
                    ))}
                    <text
                      transform={`translate(55, ${innerHeight / 2}) rotate(90)`}
                      textAnchor="middle"
                      fontSize={12}
                      fill="#57606a"
                      fontWeight={500}
                    >
                      Avg Pieces / Set
                    </text>
                  </g>

                  {/* Legend */}
                  <g transform={`translate(${innerWidth - 180}, -25)`}>
                    {/* Bars legend */}
                    <rect x={0} y={0} width={12} height={12} fill={COLORS.bars} rx={2} />
                    <text x={18} y={10} fontSize={11} fill="#57606a">
                      Sets Released
                    </text>

                    {/* Blue line legend */}
                    <line
                      x1={80}
                      x2={92}
                      y1={6}
                      y2={6}
                      stroke={COLORS.lineAvgPieces}
                      strokeWidth={2.5}
                    />
                    <text x={98} y={10} fontSize={11} fill="#57606a">
                      Avg Pieces
                    </text>

                    {/* Red line legend */}
                    <line
                      x1={160}
                      x2={172}
                      y1={6}
                      y2={6}
                      stroke={COLORS.lineUniqueParts}
                      strokeWidth={2.5}
                    />
                    <text x={178} y={10} fontSize={11} fill="#57606a">
                      Parts /10
                    </text>
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
                    <div style={{ fontWeight: 600, marginBottom: '6px' }}>
                      Year: {tooltip.content.year}
                    </div>
                    <div style={{ marginBottom: '2px' }}>
                      Sets: {tooltip.content.total_sets.toLocaleString()}
                    </div>
                    <div style={{ marginBottom: '2px' }}>
                      Avg pieces: {tooltip.content.avg_pieces_per_set.toLocaleString()}
                    </div>
                    {tooltip.content.unique_parts !== null && (
                      <div style={{ marginBottom: '2px' }}>
                        Unique parts: {tooltip.content.unique_parts.toLocaleString()}
                      </div>
                    )}
                    {tooltip.content.unique_colors !== null && (
                      <div style={{ marginBottom: '2px' }}>
                        Unique colors: {tooltip.content.unique_colors}
                      </div>
                    )}
                    {tooltip.content.data_source === 'sets_only' && (
                      <div
                        style={{
                          color: '#8b949e',
                          fontSize: '0.8rem',
                          marginTop: '4px',
                        }}
                      >
                        (Limited data - sets only)
                      </div>
                    )}
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
