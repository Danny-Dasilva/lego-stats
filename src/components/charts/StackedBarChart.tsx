import { useMemo, useState, useCallback, useRef } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import { stack, stackOrderNone, stackOffsetNone } from 'd3-shape';
import { ChartContainer } from './ChartContainer';
import { Tooltip } from './Tooltip';

interface ColorData {
  name: string;
  color: string;
  percent: number;
}

export interface DecadeColorData {
  decade: string;
  colors: ColorData[];
}

interface StackedBarChartProps {
  data: DecadeColorData[];
  title?: string;
}

const MARGIN = { top: 40, right: 20, bottom: 50, left: 60 };

export function StackedBarChart({
  data,
  title = 'Color Distribution by Decade',
}: StackedBarChartProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    visible: boolean;
    content: { name: string; percent: number; color: string } | null;
  }>({
    x: 0,
    y: 0,
    visible: false,
    content: null,
  });

  const svgRef = useRef<SVGSVGElement>(null);

  // Extract all unique color names across decades
  const colorNames = useMemo(() => {
    const names = new Set<string>();
    data.forEach((decade) => {
      decade.colors.forEach((c) => names.add(c.name));
    });
    return Array.from(names);
  }, [data]);

  // Create a color mapping from name to hex
  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    data.forEach((decade) => {
      decade.colors.forEach((c) => {
        if (!map[c.name]) {
          map[c.name] = c.color;
        }
      });
    });
    return map;
  }, [data]);

  // Keep decade labels separate from numeric data for D3 stack
  const decades = useMemo(() => data.map((d) => d.decade), [data]);

  // Transform data for D3 stack - numeric values only
  const stackData = useMemo(() => {
    return data.map((decade) => {
      const row: Record<string, number> = {};
      colorNames.forEach((name) => {
        const colorEntry = decade.colors.find((c) => c.name === name);
        row[name] = colorEntry ? colorEntry.percent : 0;
      });
      return row;
    });
  }, [data, colorNames]);

  // Create D3 stack generator
  const stackedSeries = useMemo(() => {
    const stackGenerator = stack<Record<string, number>>()
      .keys(colorNames)
      .order(stackOrderNone)
      .offset(stackOffsetNone);

    return stackGenerator(stackData);
  }, [stackData, colorNames]);

  const handleMouseMove = useCallback(
    (
      event: React.MouseEvent<SVGRectElement>,
      colorName: string,
      percent: number,
      color: string
    ) => {
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return;

      setTooltip({
        x: event.clientX - svgRect.left,
        y: event.clientY - svgRect.top,
        visible: true,
        content: { name: colorName, percent, color },
      });
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  if (data.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#57606a' }}>
        No color data available
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
      <ChartContainer aspectRatio={2} minHeight={350} maxHeight={450}>
        {({ width, height }) => {
          const innerWidth = width - MARGIN.left - MARGIN.right;
          const innerHeight = height - MARGIN.top - MARGIN.bottom;

          if (innerWidth <= 0 || innerHeight <= 0) return null;

          // Scales
          const xScale = scaleBand<string>()
            .domain(data.map((d) => d.decade))
            .range([0, innerWidth])
            .padding(0.2);

          const yScale = scaleLinear()
            .domain([0, 100])
            .range([innerHeight, 0]);

          // Y-axis ticks
          const yTicks = yScale.ticks(5);

          return (
            <>
              <svg
                ref={svgRef}
                width={width}
                height={height}
                style={{ display: 'block', background: '#f6f8fa' }}
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

                  {/* Stacked bars */}
                  {stackedSeries.map((series) => {
                    const colorName = series.key;
                    const hexColor = colorMap[colorName] || '#cccccc';

                    return (
                      <g key={colorName}>
                        {series.map((segment, i) => {
                          const decade = decades[i];
                          const y0 = segment[0];
                          const y1 = segment[1];
                          const barHeight = yScale(y0) - yScale(y1);
                          const percent = y1 - y0;

                          if (barHeight <= 0) return null;

                          return (
                            <rect
                              key={`${colorName}-${decade}`}
                              x={xScale(decade)}
                              y={yScale(y1)}
                              width={xScale.bandwidth()}
                              height={barHeight}
                              fill={hexColor}
                              stroke={hexColor === '#FFFFFF' ? '#d0d7de' : 'none'}
                              strokeWidth={hexColor === '#FFFFFF' ? 1 : 0}
                              style={{ cursor: 'pointer' }}
                              onMouseMove={(e) =>
                                handleMouseMove(e, colorName, percent, hexColor)
                              }
                              onMouseLeave={handleMouseLeave}
                            />
                          );
                        })}
                      </g>
                    );
                  })}

                  {/* X axis */}
                  <g transform={`translate(0, ${innerHeight})`}>
                    <line x1={0} x2={innerWidth} y1={0} y2={0} stroke="#d0d7de" />
                    {data.map((d) => {
                      const x = (xScale(d.decade) ?? 0) + xScale.bandwidth() / 2;
                      return (
                        <g key={`x-${d.decade}`} transform={`translate(${x}, 0)`}>
                          <line y1={0} y2={6} stroke="#d0d7de" />
                          <text
                            y={20}
                            textAnchor="middle"
                            fontSize={12}
                            fill="#57606a"
                          >
                            {d.decade}
                          </text>
                        </g>
                      );
                    })}
                    <text
                      x={innerWidth / 2}
                      y={40}
                      textAnchor="middle"
                      fontSize={12}
                      fill="#24292f"
                      fontWeight={500}
                    >
                      Decade
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
                      Percent of Pieces
                    </text>
                  </g>
                </g>
              </svg>
              <Tooltip x={tooltip.x} y={tooltip.y} visible={tooltip.visible}>
                {tooltip.content && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        backgroundColor: tooltip.content.color,
                        border:
                          tooltip.content.color === '#FFFFFF'
                            ? '1px solid #d0d7de'
                            : 'none',
                        borderRadius: '2px',
                        flexShrink: 0,
                      }}
                    />
                    <span>
                      {tooltip.content.name}: {tooltip.content.percent.toFixed(1)}%
                    </span>
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
