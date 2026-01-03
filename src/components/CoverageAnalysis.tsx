import { useMemo } from 'react';
import { CoverageCurve, CoveragePoint } from './charts';

// Data interfaces matching postprocess.ts output
interface CoverageThresholdItem {
  name: string;
  percent: number;
  cumulative_percent: number;
}

interface CoverageThreshold {
  count: number;
  items: CoverageThresholdItem[];  // first 10 items with details
}

interface PeriodCoverageData {
  total_unique: number;
  total_quantity: number;
  thresholds: Record<string, CoverageThreshold>;
}

// Curve point for chart rendering (sampled from full data)
interface CurvePoint {
  rank: number;
  name: string;
  quantity: number;
  cumulative_percent: number;
}

// Period data with both thresholds and curve points
interface PeriodDataWithCurves {
  parts: PeriodCoverageData;
  colors: PeriodCoverageData;
  parts_curve?: CurvePoint[];
  colors_curve?: CurvePoint[];
}

interface CoverageStats {
  parts: PeriodCoverageData;
  colors: PeriodCoverageData;
  by_period?: Record<string, PeriodDataWithCurves>;
}

type TimePeriod = 'all_time' | 'last_5_years' | 'last_10_years'
  | '2020s' | '2010s' | '2000s' | '1990s' | '1980s' | '1970s';

const PERIOD_LABELS: Record<TimePeriod, string> = {
  all_time: 'All Time',
  last_5_years: 'Last 5 Years',
  last_10_years: 'Last 10 Years',
  '2020s': '2020s',
  '2010s': '2010s',
  '2000s': '2000s',
  '1990s': '1990s',
  '1980s': '1980s',
  '1970s': '1970s',
};

// Helper to get period label, handling custom ranges
function getPeriodLabel(period: string): string {
  if (period.startsWith('custom_')) {
    const match = period.match(/^custom_(\d+)_(\d+)$/);
    if (match) {
      return `${match[1]}-${match[2]}`;
    }
  }
  return PERIOD_LABELS[period as TimePeriod] || period;
}

interface CoverageAnalysisProps {
  coverageStats: CoverageStats;
  selectedPeriod: string;  // Can be TimePeriod or custom_YYYY_YYYY format
}

// Styles
const styles = {
  container: {
    padding: '24px',
    backgroundColor: '#f6f8fa',
    minHeight: '100%',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#24292f',
    margin: 0,
  },
  // Summary cards
  cardsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid #d0d7de',
    borderRadius: '6px',
    padding: '16px',
    textAlign: 'center' as const,
  },
  cardLabel: {
    fontSize: '0.875rem',
    color: '#57606a',
    marginBottom: '8px',
  },
  cardValue: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#24292f',
    marginBottom: '4px',
  },
  cardSubValue: {
    fontSize: '0.875rem',
    color: '#57606a',
  },
  // Charts section
  chartsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: '24px',
    marginBottom: '24px',
  },
  chartCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #d0d7de',
    borderRadius: '6px',
    padding: '16px',
  },
  // Table section
  tableContainer: {
    backgroundColor: '#ffffff',
    border: '1px solid #d0d7de',
    borderRadius: '6px',
    padding: '16px',
    marginBottom: '24px',
    overflowX: 'auto' as const,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '0.875rem',
  },
  th: {
    textAlign: 'left' as const,
    padding: '12px 16px',
    borderBottom: '2px solid #d0d7de',
    backgroundColor: '#f6f8fa',
    fontWeight: 600,
    color: '#24292f',
  },
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid #e1e4e8',
    color: '#24292f',
  },
  tdEven: {
    padding: '12px 16px',
    borderBottom: '1px solid #e1e4e8',
    color: '#24292f',
    backgroundColor: '#f6f8fa',
  },
  // Insights panel
  insightsContainer: {
    backgroundColor: '#ffffff',
    border: '1px solid #d0d7de',
    borderRadius: '6px',
    padding: '16px',
  },
  insightsList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  insightItem: {
    padding: '8px 0',
    borderBottom: '1px solid #e1e4e8',
    color: '#24292f',
    fontSize: '0.875rem',
    lineHeight: 1.5,
  },
  insightItemLast: {
    padding: '8px 0',
    color: '#24292f',
    fontSize: '0.875rem',
    lineHeight: 1.5,
  },
  highlight: {
    fontWeight: 600,
    color: '#0969da',
  },
};

// Helper to format numbers with locale
function formatNumber(n: number): string {
  return n.toLocaleString();
}

// Calculate Pareto coverage (what % does top 20% cover?)
function calculateParetoCoverage(data: CoveragePoint[]): number {
  if (data.length === 0) return 0;
  const top20Index = Math.floor(data.length * 0.2);
  const top20Point = data[top20Index - 1];
  return top20Point?.cumulative_percent ?? 0;
}

// Find coverage for top N items
function findCoverageForTopN(data: CoveragePoint[], n: number): number {
  const point = data.find(d => d.rank === n);
  return point?.cumulative_percent ?? 0;
}

// Parse custom range period string (e.g., "custom_1992_2003" -> { startYear: 1992, endYear: 2003 })
function parseCustomRange(period: string): { startYear: number; endYear: number } | null {
  const match = period.match(/^custom_(\d+)_(\d+)$/);
  if (match) {
    return { startYear: parseInt(match[1], 10), endYear: parseInt(match[2], 10) };
  }
  return null;
}

// Aggregate coverage data from multiple year periods
function aggregateYearData(
  coverageStats: CoverageStats,
  startYear: number,
  endYear: number
): PeriodDataWithCurves {
  const byPeriod = coverageStats.by_period;
  if (!byPeriod) {
    return { parts: coverageStats.parts, colors: coverageStats.colors };
  }

  // Collect data from each year in the range
  const partsQuantities = new Map<string, { name: string; quantity: number }>();
  const colorsQuantities = new Map<string, { name: string; quantity: number }>();
  let totalPartsQuantity = 0;
  let totalColorsQuantity = 0;

  for (let year = startYear; year <= endYear; year++) {
    const yearKey = `year_${year}`;
    const yearData = byPeriod[yearKey];
    if (!yearData) continue;

    // Aggregate parts from curve data (has full item list)
    if (yearData.parts_curve) {
      for (const item of yearData.parts_curve) {
        const existing = partsQuantities.get(item.name);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          partsQuantities.set(item.name, { name: item.name, quantity: item.quantity });
        }
        totalPartsQuantity += item.quantity;
      }
    }

    // Aggregate colors from curve data
    if (yearData.colors_curve) {
      for (const item of yearData.colors_curve) {
        const existing = colorsQuantities.get(item.name);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          colorsQuantities.set(item.name, { name: item.name, quantity: item.quantity });
        }
        totalColorsQuantity += item.quantity;
      }
    }
  }

  // Sort by quantity descending and calculate cumulative percentages
  const sortedParts = Array.from(partsQuantities.values())
    .sort((a, b) => b.quantity - a.quantity);
  const sortedColors = Array.from(colorsQuantities.values())
    .sort((a, b) => b.quantity - a.quantity);

  // Build curve data with cumulative percentages
  let partsCumulative = 0;
  const partsCurve: CurvePoint[] = sortedParts.map((item, index) => {
    partsCumulative += item.quantity;
    return {
      rank: index + 1,
      name: item.name,
      quantity: item.quantity,
      cumulative_percent: (partsCumulative / totalPartsQuantity) * 100,
    };
  });

  let colorsCumulative = 0;
  const colorsCurve: CurvePoint[] = sortedColors.map((item, index) => {
    colorsCumulative += item.quantity;
    return {
      rank: index + 1,
      name: item.name,
      quantity: item.quantity,
      cumulative_percent: (colorsCumulative / totalColorsQuantity) * 100,
    };
  });

  // Calculate thresholds
  const thresholdLevels = [50, 80, 90, 95, 99];
  const partsThresholds: Record<string, CoverageThreshold> = {};
  const colorsThresholds: Record<string, CoverageThreshold> = {};

  for (const level of thresholdLevels) {
    // Parts threshold
    const partsIndex = partsCurve.findIndex(p => p.cumulative_percent >= level);
    const partsCount = partsIndex >= 0 ? partsIndex + 1 : partsCurve.length;
    partsThresholds[String(level)] = {
      count: partsCount,
      items: partsCurve.slice(0, Math.min(10, partsCount)).map(p => ({
        name: p.name,
        percent: (p.quantity / totalPartsQuantity) * 100,
        cumulative_percent: p.cumulative_percent,
      })),
    };

    // Colors threshold
    const colorsIndex = colorsCurve.findIndex(c => c.cumulative_percent >= level);
    const colorsCount = colorsIndex >= 0 ? colorsIndex + 1 : colorsCurve.length;
    colorsThresholds[String(level)] = {
      count: colorsCount,
      items: colorsCurve.slice(0, Math.min(10, colorsCount)).map(c => ({
        name: c.name,
        percent: (c.quantity / totalColorsQuantity) * 100,
        cumulative_percent: c.cumulative_percent,
      })),
    };
  }

  return {
    parts: {
      total_unique: sortedParts.length,
      total_quantity: totalPartsQuantity,
      thresholds: partsThresholds,
    },
    colors: {
      total_unique: sortedColors.length,
      total_quantity: totalColorsQuantity,
      thresholds: colorsThresholds,
    },
    parts_curve: partsCurve,
    colors_curve: colorsCurve,
  };
}

export function CoverageAnalysis({
  coverageStats,
  selectedPeriod,
}: CoverageAnalysisProps) {
  const thresholdKeys = ['50', '80', '90', '95', '99'];

  // Check if this is a custom range
  const customRange = useMemo(() => parseCustomRange(selectedPeriod), [selectedPeriod]);

  // Get the active coverage data based on selected period
  const activeCoverage = useMemo((): PeriodDataWithCurves => {
    // Handle custom year ranges by aggregating per-year data
    if (customRange) {
      return aggregateYearData(coverageStats, customRange.startYear, customRange.endYear);
    }

    // Standard period lookup
    if (coverageStats.by_period?.[selectedPeriod]) {
      return coverageStats.by_period[selectedPeriod];
    }

    return { parts: coverageStats.parts, colors: coverageStats.colors };
  }, [coverageStats, selectedPeriod, customRange]);

  // Extract curve data from the active coverage
  const partCurveData = useMemo((): CoveragePoint[] => {
    if (activeCoverage.parts_curve) {
      return activeCoverage.parts_curve.map(p => ({
        rank: p.rank,
        name: p.name,
        quantity: p.quantity,
        cumulative_percent: p.cumulative_percent
      }));
    }
    return [];
  }, [activeCoverage]);

  const colorCurveData = useMemo((): CoveragePoint[] => {
    if (activeCoverage.colors_curve) {
      return activeCoverage.colors_curve.map(c => ({
        rank: c.rank,
        name: c.name,
        quantity: c.quantity,
        cumulative_percent: c.cumulative_percent
      }));
    }
    return [];
  }, [activeCoverage]);

  // Calculate insights using active period data
  const top100PartsCoverage = findCoverageForTopN(partCurveData, 100);
  const partsFor80Pct = activeCoverage.parts.thresholds['80']?.count || 0;
  const partoPartsPercent = calculateParetoCoverage(partCurveData);

  return (
    <div style={styles.container}>
      {/* Summary Cards */}
      <section>
        <div style={styles.headerRow}>
          <h2 style={styles.sectionTitle}>Coverage Summary ({getPeriodLabel(selectedPeriod)})</h2>
        </div>
        <div style={styles.cardsContainer}>
          <div style={styles.card}>
            <div style={styles.cardLabel}>80% Coverage</div>
            <div style={styles.cardValue}>
              {formatNumber(activeCoverage.parts.thresholds['80']?.count || 0)} parts
            </div>
            <div style={styles.cardSubValue}>
              {formatNumber(activeCoverage.colors.thresholds['80']?.count || 0)} colors
            </div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardLabel}>95% Coverage</div>
            <div style={styles.cardValue}>
              {formatNumber(activeCoverage.parts.thresholds['95']?.count || 0)} parts
            </div>
            <div style={styles.cardSubValue}>
              {formatNumber(activeCoverage.colors.thresholds['95']?.count || 0)} colors
            </div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardLabel}>Total Unique Items</div>
            <div style={styles.cardValue}>
              {formatNumber(activeCoverage.parts.total_unique)} parts
            </div>
            <div style={styles.cardSubValue}>
              {formatNumber(activeCoverage.colors.total_unique)} colors
            </div>
          </div>
        </div>
      </section>

      {/* Coverage Curves */}
      <section>
        <h2 style={styles.sectionTitle}>Coverage Curves</h2>
        <div style={styles.chartsContainer}>
          <div style={styles.chartCard}>
            <CoverageCurve
              data={partCurveData}
              title="Parts Coverage"
              color="#0969da"
              thresholds={[50, 80, 90, 95, 99]}
            />
          </div>
          <div style={styles.chartCard}>
            <CoverageCurve
              data={colorCurveData}
              title="Colors Coverage"
              color="#2da44e"
              thresholds={[50, 80, 90, 95, 99]}
            />
          </div>
        </div>
      </section>

      {/* Threshold Table */}
      <section>
        <h2 style={styles.sectionTitle}>Coverage Thresholds</h2>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Coverage Level</th>
                <th style={styles.th}>Parts Needed</th>
                <th style={styles.th}>Colors Needed</th>
              </tr>
            </thead>
            <tbody>
              {thresholdKeys.map((key, index) => {
                const isEven = index % 2 === 1;
                const cellStyle = isEven ? styles.tdEven : styles.td;
                return (
                  <tr key={key}>
                    <td style={cellStyle}>{key}%</td>
                    <td style={cellStyle}>
                      {formatNumber(activeCoverage.parts.thresholds[key]?.count || 0)}
                    </td>
                    <td style={cellStyle}>
                      {formatNumber(activeCoverage.colors.thresholds[key]?.count || 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Key Insights Panel */}
      <section>
        <h2 style={styles.sectionTitle}>Key Insights</h2>
        <div style={styles.insightsContainer}>
          <ul style={styles.insightsList}>
            <li style={styles.insightItem}>
              The <span style={styles.highlight}>top 100 parts</span> cover{' '}
              <span style={styles.highlight}>{top100PartsCoverage.toFixed(1)}%</span>{' '}
              of all pieces used in LEGO sets.
            </li>
            <li style={styles.insightItem}>
              For <span style={styles.highlight}>80% coverage</span>, you need only{' '}
              <span style={styles.highlight}>{formatNumber(partsFor80Pct)}</span> of{' '}
              {formatNumber(activeCoverage.parts.total_unique)} unique parts.
            </li>
            <li style={styles.insightItemLast}>
              <span style={styles.highlight}>Pareto insight:</span> The top 20% of parts
              cover <span style={styles.highlight}>{partoPartsPercent.toFixed(1)}%</span>{' '}
              of all pieces.
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

export type { CoverageStats, CoverageThreshold, CoverageAnalysisProps, PeriodCoverageData, TimePeriod };
