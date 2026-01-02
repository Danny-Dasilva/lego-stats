import { useState, useEffect } from 'react'
import { Grid } from '@githubocto/flat-ui'

type DataSet = 'parts' | 'colors' | 'trends'

const BASE = import.meta.env.BASE_URL

const DATA_FILES: Record<DataSet, string> = {
  parts: `${BASE}data/part-frequency.json`,
  colors: `${BASE}data/color-stats.json`,
  trends: `${BASE}data/year-trends.json`,
}

const DATASET_INFO: Record<DataSet, { title: string; description: string }> = {
  parts: {
    title: 'Most Common LEGO Parts',
    description: 'Top 100 parts by total quantity across all LEGO sets',
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

export default function App() {
  const [data, setData] = useState<any[]>([])
  const [activeDataset, setActiveDataset] = useState<DataSet>('parts')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(DATA_FILES[activeDataset])
      .then((res) => res.json())
      .then((json) => {
        setData(json)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load data:', err)
        setLoading(false)
      })
  }, [activeDataset])

  const info = DATASET_INFO[activeDataset]

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '1rem', borderBottom: '1px solid #e1e4e8' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>LEGO Statistics</h1>
        <nav style={{ display: 'flex', gap: '0.5rem' }}>
          {(['parts', 'colors', 'trends'] as DataSet[]).map((dataset) => (
            <button
              key={dataset}
              onClick={() => setActiveDataset(dataset)}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #e1e4e8',
                borderRadius: '6px',
                background: activeDataset === dataset ? '#0969da' : 'white',
                color: activeDataset === dataset ? 'white' : '#24292f',
                cursor: 'pointer',
              }}
            >
              {dataset === 'parts' ? 'Parts' : dataset === 'colors' ? 'Colors' : 'Years'}
            </button>
          ))}
        </nav>
      </header>
      <div style={{ padding: '1rem 1rem 0', borderBottom: '1px solid #e1e4e8' }}>
        <h2 style={{ fontSize: '1.25rem', margin: 0 }}>{info.title}</h2>
        <p style={{ color: '#57606a', margin: '0.25rem 0 0.75rem', fontSize: '0.875rem' }}>{info.description}</p>
      </div>
      <main style={{ flex: 1, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
        ) : (
          <Grid data={data} />
        )}
      </main>
    </div>
  )
}
