import { useState, useEffect, useMemo } from 'react'
import { Grid } from '@githubocto/flat-ui'
import { CoverageAnalysis, CoverageStats, TimePeriod } from './components/CoverageAnalysis'
import { StackedBarChart, TrendsLineChart, DecadeColorData, YearTrend } from './components/charts'
import { DateRangeFilter, YearRange } from './components/DateRangeFilter'

type ViewMode = 'tables' | 'charts'
type TableDataSet = 'parts' | 'colors' | 'trends'
type ChartDataSet = 'coverage' | 'colorTrends' | 'historical'

const BASE = import.meta.env.BASE_URL

const TABLE_DATA_FILES: Record<TableDataSet, string> = {
  parts: `${BASE}data/part-frequency.json`,
  colors: `${BASE}data/color-stats.json`,
  trends: `${BASE}data/year-trends.json`,
}

const CHART_DATA_FILES = {
  coverage: `${BASE}data/coverage-stats.json`,
  decadeColors: `${BASE}data/decade-colors.json`,
  partFrequency: `${BASE}data/part-frequency.json`,
  colorStats: `${BASE}data/color-stats.json`,
  yearTrends: `${BASE}data/year-trends.json`,
}

const TABLE_DATASET_INFO: Record<TableDataSet, { title: string; description: string }> = {
  parts: {
    title: 'Most Common LEGO Parts',
    description: 'Parts ranked by total quantity across all LEGO sets',
  },
  colors: {
    title: 'LEGO Color Distribution',
    description: 'Breakdown of piece colors by quantity and percentage',
  },
  trends: {
    title: 'LEGO Production by Year',
    description: 'Historical trends showing sets, pieces, and popular parts/colors per year',
  },
}

const CHART_DATASET_INFO: Record<ChartDataSet, { title: string; description: string }> = {
  coverage: {
    title: 'Coverage Analysis',
    description: 'How many parts/colors needed for X% coverage in object detection',
  },
  colorTrends: {
    title: 'Color Distribution by Decade',
    description: 'How LEGO color palette has evolved over time',
  },
  historical: {
    title: 'Historical Trends',
    description: 'Sets released, average pieces, and unique parts over time',
  },
}

// Helper to map yearRange to TimePeriod for coverage data
function yearRangeToTimePeriod(yearRange: YearRange, currentYear: number): TimePeriod {
  const yearsBack = currentYear - yearRange.startYear
  if (yearsBack <= 5) return 'last_5_years'
  if (yearsBack <= 10) return 'last_10_years'
  return 'all_time'
}

// Button style helper
const getButtonStyle = (isActive: boolean, variant: 'primary' | 'secondary' = 'primary') => ({
  padding: '0.5rem 1rem',
  border: '1px solid #e1e4e8',
  borderRadius: '6px',
  background: isActive
    ? variant === 'primary' ? '#0969da' : '#24292f'
    : 'white',
  color: isActive ? 'white' : '#24292f',
  cursor: 'pointer',
  fontWeight: isActive ? 600 : 400,
})

export default function App() {
  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('tables')
  const [activeTableDataset, setActiveTableDataset] = useState<TableDataSet>('parts')
  const [activeChartDataset, setActiveChartDataset] = useState<ChartDataSet>('coverage')

  // Table data
  const [tableData, setTableData] = useState<any[]>([])

  // Chart data
  const [coverageStats, setCoverageStats] = useState<CoverageStats | null>(null)
  const [decadeColorsData, setDecadeColorsData] = useState<DecadeColorData[]>([])
  const [yearTrendsData, setYearTrendsData] = useState<YearTrend[]>([])

  const [loading, setLoading] = useState(true)

  // Date range filter state
  const currentYear = new Date().getFullYear()
  const [yearRange, setYearRange] = useState<YearRange>({ startYear: 1949, endYear: currentYear })

  // Map yearRange to TimePeriod for coverage data filtering
  const selectedPeriod = useMemo(() => yearRangeToTimePeriod(yearRange, currentYear), [yearRange, currentYear])

  // Load table data
  useEffect(() => {
    if (viewMode !== 'tables') return

    setLoading(true)
    fetch(TABLE_DATA_FILES[activeTableDataset])
      .then((res) => res.json())
      .then((json) => {
        // For parts data, only remove empty image URLs
        // Valid Rebrickable CDN URLs (cdn.rebrickable.com) should be kept
        if (activeTableDataset === 'parts') {
          const processedData = json.map((item: any) => {
            // Remove the image field only if it's empty
            if (!item.image || item.image === '') {
              const { image, ...rest } = item
              return rest
            }
            return item
          })
          setTableData(processedData)
        } else {
          setTableData(json)
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load table data:', err)
        setLoading(false)
      })
  }, [viewMode, activeTableDataset])

  // Load chart data
  useEffect(() => {
    if (viewMode !== 'charts') return

    setLoading(true)

    if (activeChartDataset === 'coverage') {
      // Load coverage stats (includes curve data per period)
      fetch(CHART_DATA_FILES.coverage)
        .then((res) => res.json())
        .then((coverage) => {
          setCoverageStats(coverage)
          setLoading(false)
        })
        .catch((err) => {
          console.error('Failed to load coverage data:', err)
          setLoading(false)
        })
    } else if (activeChartDataset === 'colorTrends') {
      fetch(CHART_DATA_FILES.decadeColors)
        .then((res) => res.json())
        .then((json) => {
          setDecadeColorsData(json)
          setLoading(false)
        })
        .catch((err) => {
          console.error('Failed to load decade colors data:', err)
          setLoading(false)
        })
    } else if (activeChartDataset === 'historical') {
      fetch(CHART_DATA_FILES.yearTrends)
        .then((res) => res.json())
        .then((json) => {
          setYearTrendsData(json)
          setLoading(false)
        })
        .catch((err) => {
          console.error('Failed to load year trends data:', err)
          setLoading(false)
        })
    }
  }, [viewMode, activeChartDataset])

  const currentInfo =
    viewMode === 'tables'
      ? TABLE_DATASET_INFO[activeTableDataset]
      : CHART_DATASET_INFO[activeChartDataset]

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e1e4e8' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          {/* Left: Title and current view info */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.25rem', margin: 0, whiteSpace: 'nowrap' }}>LEGO Statistics</h1>
            <span style={{ color: '#57606a', fontSize: '0.875rem' }}>
              {currentInfo.title} - {currentInfo.description}
            </span>
          </div>

          {/* Right: Navigation */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* View Mode Toggle */}
            <div style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem', background: '#f6f8fa', borderRadius: '6px' }}>
              <button
                onClick={() => setViewMode('tables')}
                style={{
                  ...getButtonStyle(viewMode === 'tables', 'secondary'),
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.875rem',
                  border: viewMode === 'tables' ? '1px solid #e1e4e8' : '1px solid transparent',
                }}
              >
                Tables
              </button>
              <button
                onClick={() => setViewMode('charts')}
                style={{
                  ...getButtonStyle(viewMode === 'charts', 'secondary'),
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.875rem',
                  border: viewMode === 'charts' ? '1px solid #e1e4e8' : '1px solid transparent',
                }}
              >
                Charts
              </button>
            </div>

            <span style={{ color: '#d0d7de', margin: '0 0.25rem' }}>|</span>

            {/* Dataset Navigation */}
            {viewMode === 'tables' ? (
              <>
                {(['parts', 'colors', 'trends'] as TableDataSet[]).map((dataset) => (
                  <button
                    key={dataset}
                    onClick={() => setActiveTableDataset(dataset)}
                    style={{ ...getButtonStyle(activeTableDataset === dataset), padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                  >
                    {dataset === 'parts' ? 'Parts' : dataset === 'colors' ? 'Colors' : 'Years'}
                  </button>
                ))}
              </>
            ) : (
              <>
                {(['coverage', 'colorTrends', 'historical'] as ChartDataSet[]).map((dataset) => (
                  <button
                    key={dataset}
                    onClick={() => setActiveChartDataset(dataset)}
                    style={{ ...getButtonStyle(activeChartDataset === dataset), padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                  >
                    {dataset === 'coverage'
                      ? 'Coverage'
                      : dataset === 'colorTrends'
                      ? 'Color Trends'
                      : 'Historical'}
                  </button>
                ))}
              </>
            )}

            <span style={{ color: '#d0d7de', margin: '0 0.25rem' }}>|</span>

            {/* Date Range Filter */}
            <DateRangeFilter
              minYear={1949}
              maxYear={currentYear}
              initialRange={yearRange}
              onChange={setYearRange}
            />
          </nav>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          overflow: 'auto',
          backgroundColor: viewMode === 'charts' ? '#f6f8fa' : 'white',
        }}
      >
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
        ) : viewMode === 'tables' ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {yearRange.startYear !== 1949 && (
              <div style={{
                padding: '0.5rem 1rem',
                background: '#fff8e1',
                borderBottom: '1px solid #ffe082',
                fontSize: '0.875rem',
                color: '#5d4037'
              }}>
                Note: Tables show all-time data. Use Charts → Coverage for date-filtered analysis.
              </div>
            )}
            <div style={{ flex: 1 }}>
              <Grid data={tableData} />
            </div>
          </div>
        ) : activeChartDataset === 'coverage' ? (
          coverageStats ? (
            <CoverageAnalysis
              coverageStats={coverageStats}
              selectedPeriod={selectedPeriod}
            />
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#57606a' }}>
              Loading coverage data...
            </div>
          )
        ) : activeChartDataset === 'colorTrends' ? (
          <div style={{ padding: '24px' }}>
            <StackedBarChart data={decadeColorsData} />
          </div>
        ) : activeChartDataset === 'historical' ? (
          <div style={{ padding: '24px' }}>
            <TrendsLineChart data={yearTrendsData} />
          </div>
        ) : null}
      </main>
    </div>
  )
}
