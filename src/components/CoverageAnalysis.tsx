import { useState } from 'react';
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

interface CoverageStats {
  parts: PeriodCoverageData;
  colors: PeriodCoverageData;
  by_period?: {
    all_time: { parts: PeriodCoverageData; colors: PeriodCoverageData };
    last_5_years: { parts: PeriodCoverageData; colors: PeriodCoverageData };
    last_10_years: { parts: PeriodCoverageData; colors: PeriodCoverageData };
  };
}

type TimePeriod = 'all_time' | 'last_5_years' | 'last_10_years';

const PERIOD_LABELS: Record<TimePeriod, string> = {
  all_time: 'All Time',
  last_5_years: 'Last 5 Years',
  last_10_years: 'Last 10 Years',
};

interface CoverageAnalysisProps {
  coverageStats: CoverageStats;
  partData: CoveragePoint[];
  colorData: CoveragePoint[];
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
  periodSelector: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  periodLabel: {
    fontSize: '0.875rem',
    color: '#57606a',
  },
  periodButton: {
    padding: '6px 12px',
    border: '1px solid #d0d7de',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#24292f',
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  periodButtonActive: {
    padding: '6px 12px',
    border: '1px solid #0969da',
    borderRadius: '6px',
    backgroundColor: '#0969da',
    color: '#ffffff',
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontWeight: 600,
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

export function CoverageAnalysis({
  coverageStats,
  partData,
  colorData,
}: CoverageAnalysisProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('all_time');
  const thresholdKeys = ['50', '80', '90', '95', '99'];

  // Get the active coverage data based on selected period
  const activeCoverage = coverageStats.by_period
    ? coverageStats.by_period[selectedPeriod]
    : { parts: coverageStats.parts, colors: coverageStats.colors };

  // Calculate insights using active period data
  const top100PartsCoverage = findCoverageForTopN(partData, 100);
  const partsFor80Pct = activeCoverage.parts.thresholds['80']?.count || 0;
  const partoPartsPercent = calculateParetoCoverage(partData);

  // Period selector component
  const periodButtons = (Object.keys(PERIOD_LABELS) as TimePeriod[]).map((period) => (
    <button
      key={period}
      style={selectedPeriod === period ? styles.periodButtonActive : styles.periodButton}
      onClick={() => setSelectedPeriod(period)}
    >
      {PERIOD_LABELS[period]}
    </button>
  ));

  return (
    <div style={styles.container}>
      {/* Summary Cards */}
      <section>
        <div style={styles.headerRow}>
          <h2 style={styles.sectionTitle}>Coverage Summary</h2>
          {coverageStats.by_period && (
            <div style={styles.periodSelector}>
              <span style={styles.periodLabel}>Time Period:</span>
              {periodButtons}
            </div>
          )}
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
              data={partData}
              title="Parts Coverage"
              color="#0969da"
              thresholds={[50, 80, 90, 95, 99]}
            />
          </div>
          <div style={styles.chartCard}>
            <CoverageCurve
              data={colorData}
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
