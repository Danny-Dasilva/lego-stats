import { useState, useCallback, useMemo } from 'react';

export interface YearRange {
  startYear: number;
  endYear: number;
}

type PresetOption = 'last5' | 'last10' | 'allTime' | 'custom';

interface DateRangeFilterProps {
  /** Minimum year available in the data */
  minYear?: number;
  /** Maximum year available in the data */
  maxYear?: number;
  /** Initial year range selection */
  initialRange?: YearRange;
  /** Callback when the year range changes */
  onChange: (range: YearRange) => void;
}

// Styles matching the app's design system
const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#57606a',
    marginRight: '4px',
  },
  presetButton: {
    padding: '4px 10px',
    fontSize: '0.75rem',
    border: '1px solid #d0d7de',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontWeight: 400,
  },
  presetButtonActive: {
    background: '#0969da',
    color: 'white',
    borderColor: '#0969da',
    fontWeight: 500,
  },
  presetButtonInactive: {
    background: 'white',
    color: '#24292f',
  },
  customContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginLeft: '4px',
  },
  select: {
    padding: '4px 8px',
    fontSize: '0.75rem',
    border: '1px solid #d0d7de',
    borderRadius: '4px',
    background: 'white',
    color: '#24292f',
    cursor: 'pointer',
    minWidth: '70px',
  },
  selectLabel: {
    fontSize: '0.75rem',
    color: '#57606a',
  },
};

export function DateRangeFilter({
  minYear = 1949,
  maxYear = 2026,
  initialRange,
  onChange,
}: DateRangeFilterProps) {
  const currentYear = new Date().getFullYear();

  // Determine initial preset based on initialRange
  const getInitialPreset = (): PresetOption => {
    if (!initialRange) return 'allTime';
    if (initialRange.startYear === minYear && initialRange.endYear === maxYear) return 'allTime';
    if (initialRange.startYear === currentYear - 5 && initialRange.endYear === maxYear) return 'last5';
    if (initialRange.startYear === currentYear - 10 && initialRange.endYear === maxYear) return 'last10';
    return 'custom';
  };

  const [activePreset, setActivePreset] = useState<PresetOption>(getInitialPreset);
  const [customStart, setCustomStart] = useState<number>(initialRange?.startYear ?? minYear);
  const [customEnd, setCustomEnd] = useState<number>(initialRange?.endYear ?? maxYear);

  // Generate year options for dropdowns
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = maxYear; y >= minYear; y--) {
      years.push(y);
    }
    return years;
  }, [minYear, maxYear]);

  const handlePresetClick = useCallback((preset: PresetOption) => {
    setActivePreset(preset);

    let range: YearRange;
    switch (preset) {
      case 'last5':
        range = { startYear: currentYear - 5, endYear: maxYear };
        break;
      case 'last10':
        range = { startYear: currentYear - 10, endYear: maxYear };
        break;
      case 'allTime':
        range = { startYear: minYear, endYear: maxYear };
        break;
      case 'custom':
        range = { startYear: customStart, endYear: customEnd };
        break;
    }

    onChange(range);
  }, [currentYear, maxYear, minYear, customStart, customEnd, onChange]);

  const handleCustomStartChange = useCallback((year: number) => {
    setCustomStart(year);
    setActivePreset('custom');
    // Ensure end is not before start
    const effectiveEnd = Math.max(year, customEnd);
    setCustomEnd(effectiveEnd);
    onChange({ startYear: year, endYear: effectiveEnd });
  }, [customEnd, onChange]);

  const handleCustomEndChange = useCallback((year: number) => {
    setCustomEnd(year);
    setActivePreset('custom');
    // Ensure start is not after end
    const effectiveStart = Math.min(customStart, year);
    setCustomStart(effectiveStart);
    onChange({ startYear: effectiveStart, endYear: year });
  }, [customStart, onChange]);

  const getButtonStyle = (preset: PresetOption) => ({
    ...styles.presetButton,
    ...(activePreset === preset ? styles.presetButtonActive : styles.presetButtonInactive),
  });

  return (
    <div style={styles.container}>
      <span style={styles.label}>Filter:</span>

      <button
        onClick={() => handlePresetClick('last5')}
        style={getButtonStyle('last5')}
      >
        Last 5 Years
      </button>

      <button
        onClick={() => handlePresetClick('last10')}
        style={getButtonStyle('last10')}
      >
        Last 10 Years
      </button>

      <button
        onClick={() => handlePresetClick('allTime')}
        style={getButtonStyle('allTime')}
      >
        All Time
      </button>

      <div style={styles.customContainer}>
        <span style={styles.selectLabel}>From:</span>
        <select
          value={customStart}
          onChange={(e) => handleCustomStartChange(Number(e.target.value))}
          style={styles.select}
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>

        <span style={styles.selectLabel}>To:</span>
        <select
          value={customEnd}
          onChange={(e) => handleCustomEndChange(Number(e.target.value))}
          style={styles.select}
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export type { DateRangeFilterProps };
