/**
 * postprocess.ts - Aggregates LEGO data from Rebrickable CSVs
 *
 * Ported from charts_lego.ipynb pandas logic to Deno/TypeScript
 *
 * Input files:
 *   - data/colors.csv.gz
 *   - data/parts.csv.gz
 *   - data/sets.csv.gz (for year data)
 *   - data/inventories.csv.gz (links sets to inventories)
 *   - data/inventory_parts.csv.gz (decompressed automatically by Flat)
 *
 * Output files:
 *   - public/data/color-stats.json     - All colors with rank + cumulative coverage
 *   - public/data/part-frequency.json  - All parts with rank + cumulative coverage
 *   - public/data/year-trends.json     - Year data (inventory + sets-only for pre-2010)
 *   - public/data/coverage-stats.json  - Coverage thresholds (50%, 80%, 90%, 95%, 99%)
 *   - public/data/decade-colors.json   - Top 10 colors per decade for stacked charts
 */

import { readCSV, writeJSON } from "https://deno.land/x/flat@0.0.15/mod.ts";

interface Color {
  id: string;
  name: string;
  rgb: string;
  is_trans: string;
}

interface Part {
  part_num: string;
  name: string;
  part_cat_id: string;
  part_material: string;
}

interface Set {
  set_num: string;
  name: string;
  year: string;
  theme_id: string;
  num_parts: string;
}

interface Inventory {
  id: string;
  version: string;
  set_num: string;
}

interface InventoryPart {
  inventory_id: string;
  part_num: string;
  color_id: string;
  quantity: string;
  is_spare: string;
  img_url?: string;
}

interface ColorStat {
  name: string;
  color: string;  // "#RRGGBB" format for ColorCell
  quantity: number;
  percent: number;
  rank: number;              // Position in sorted list (1-based)
  cumulative_percent: number; // Running total percentage
}

interface PartFrequency {
  part_num: string;
  name: string;
  quantity: number;
  image: string;
  rank: number;              // Position in sorted list (1-based)
  percent: number;           // This part's % of total
  cumulative_percent: number; // Running total percentage
}

interface YearTrend {
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
  data_source: 'inventory' | 'sets_only'; // inventory = full data, sets_only = pre-2010
}

interface CoverageThreshold {
  count: number;
  items: Array<{ name: string; percent: number; cumulative_percent: number }>;
}

interface CoverageStats {
  parts: {
    total_unique: number;
    total_quantity: number;
    thresholds: {
      "50": CoverageThreshold;
      "80": CoverageThreshold;
      "90": CoverageThreshold;
      "95": CoverageThreshold;
      "99": CoverageThreshold;
    };
  };
  colors: {
    total_unique: number;
    total_quantity: number;
    thresholds: {
      "50": CoverageThreshold;
      "80": CoverageThreshold;
      "90": CoverageThreshold;
      "95": CoverageThreshold;
      "99": CoverageThreshold;
    };
  };
}

interface DecadeColor {
  name: string;
  color: string;
  percent: number;
}

interface DecadeColors {
  decade: string;
  colors: DecadeColor[];
}

// Helper to decompress gzip files
async function readGzippedCSV<T>(path: string): Promise<T[]> {
  try {
    // Try reading decompressed version first
    const csvPath = path.replace(".gz", "");
    return await readCSV(csvPath) as T[];
  } catch {
    // Decompress and parse
    const gzData = await Deno.readFile(path);
    const decompressed = new DecompressionStream("gzip");
    const stream = new Response(gzData).body!.pipeThrough(decompressed);
    const text = await new Response(stream).text();

    // Parse CSV manually
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",");
    const data = lines.slice(1).map(line => {
      const values = line.split(",");
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => obj[h.trim()] = values[i]?.trim() || "");
      return obj as unknown as T;
    });

    // Write decompressed CSV for future use
    await Deno.writeTextFile(path.replace(".gz", ""), text);
    return data;
  }
}

// Main postprocess function
async function main() {
  const filename = Deno.args[0]; // The downloaded file passed by Flat
  console.log(`Postprocessing triggered by: ${filename}`);

  // Read all CSV files (all now gzipped from Rebrickable)
  console.log("Reading colors.csv.gz...");
  const colors = await readGzippedCSV<Color>("data/colors.csv.gz");

  console.log("Reading parts.csv.gz...");
  const parts = await readGzippedCSV<Part>("data/parts.csv.gz");

  console.log("Reading sets.csv...");
  let sets: Set[] = [];
  try {
    sets = await readGzippedCSV<Set>("data/sets.csv.gz");
  } catch (e) {
    console.warn("Could not read sets.csv:", e);
  }

  console.log("Reading inventories.csv...");
  let inventories: Inventory[] = [];
  try {
    inventories = await readGzippedCSV<Inventory>("data/inventories.csv.gz");
  } catch (e) {
    console.warn("Could not read inventories.csv:", e);
  }

  console.log("Reading inventory_parts.csv...");
  const inventoryPartsPath = filename.endsWith(".gz")
    ? filename.replace(".gz", "")
    : filename;

  let inventoryParts: InventoryPart[];
  try {
    inventoryParts = await readCSV(inventoryPartsPath) as InventoryPart[];
  } catch {
    inventoryParts = await readGzippedCSV<InventoryPart>(filename);
  }

  console.log(`Loaded ${colors.length} colors, ${parts.length} parts, ${sets.length} sets, ${inventories.length} inventories, ${inventoryParts.length} inventory parts`);

  // Create lookup maps
  const colorMap = new Map<string, Color>();
  for (const c of colors) {
    colorMap.set(c.id, c);
  }

  const partMap = new Map<string, Part>();
  for (const p of parts) {
    partMap.set(p.part_num, p);
  }

  const setMap = new Map<string, Set>();
  for (const s of sets) {
    setMap.set(s.set_num, s);
  }

  // Map inventory_id -> set_num (use first/primary inventory)
  const inventoryToSetMap = new Map<string, string>();
  for (const inv of inventories) {
    if (!inventoryToSetMap.has(inv.id)) {
      inventoryToSetMap.set(inv.id, inv.set_num);
    }
  }

  // ===== Color Stats =====
  console.log("Computing color stats...");
  const colorAgg = new Map<string, { name: string; color: string; quantity: number }>();

  for (const ip of inventoryParts) {
    const qty = parseInt(ip.quantity) || 0;
    const color = colorMap.get(ip.color_id);
    if (!color) continue;

    const key = `${color.rgb}-${color.name}`;
    const existing = colorAgg.get(key);
    if (existing) {
      existing.quantity += qty;
    } else {
      colorAgg.set(key, { name: color.name, color: `#${color.rgb}`, quantity: qty });
    }
  }

  const totalPieces = Array.from(colorAgg.values()).reduce((sum, c) => sum + c.quantity, 0);

  // Sort by quantity descending and add rank + cumulative percent
  const sortedColors = Array.from(colorAgg.values())
    .sort((a, b) => b.quantity - a.quantity);

  let colorCumulativeSum = 0;
  const colorStats: ColorStat[] = sortedColors.map((c, index) => {
    const percent = parseFloat(((c.quantity / totalPieces) * 100).toFixed(4));
    colorCumulativeSum += c.quantity;
    const cumulative_percent = parseFloat(((colorCumulativeSum / totalPieces) * 100).toFixed(4));
    return {
      name: c.name,
      color: c.color,
      quantity: c.quantity,
      percent,
      rank: index + 1,
      cumulative_percent
    };
  });

  // ===== Part Frequency =====
  console.log("Computing part frequency...");
  const partAgg = new Map<string, { part_num: string; quantity: number }>();

  for (const ip of inventoryParts) {
    const qty = parseInt(ip.quantity) || 0;
    const existing = partAgg.get(ip.part_num);
    if (existing) {
      existing.quantity += qty;
    } else {
      partAgg.set(ip.part_num, { part_num: ip.part_num, quantity: qty });
    }
  }

  // Sort by quantity descending and compute totals
  const sortedParts = Array.from(partAgg.values())
    .sort((a, b) => b.quantity - a.quantity);

  const totalPartsQuantity = sortedParts.reduce((sum, p) => sum + p.quantity, 0);

  // Add rank, percent, and cumulative percent
  let partCumulativeSum = 0;
  const partFrequency: PartFrequency[] = sortedParts.map((p, index) => {
    const part = partMap.get(p.part_num);
    const percent = parseFloat(((p.quantity / totalPartsQuantity) * 100).toFixed(4));
    partCumulativeSum += p.quantity;
    const cumulative_percent = parseFloat(((partCumulativeSum / totalPartsQuantity) * 100).toFixed(4));
    return {
      part_num: p.part_num,
      name: part?.name || "Unknown",
      quantity: p.quantity,
      image: `https://cdn.rebrickable.com/media/parts/ldraw/0/${p.part_num}.png`,
      rank: index + 1,
      percent,
      cumulative_percent
    };
  });

  // ===== Year Trends =====
  console.log("Computing year trends...");

  // Aggregate by year
  const yearAgg = new Map<number, {
    pieces: number;
    sets: Set<string>;
    colors: Map<string, number>;
    parts: Map<string, number>;
  }>();

  for (const ip of inventoryParts) {
    const qty = parseInt(ip.quantity) || 0;
    const setNum = inventoryToSetMap.get(ip.inventory_id);
    if (!setNum) continue;

    const set = setMap.get(setNum);
    if (!set) continue;

    const year = parseInt(set.year);
    if (isNaN(year) || year < 1949) continue; // LEGO started in 1949

    let yearData = yearAgg.get(year);
    if (!yearData) {
      yearData = {
        pieces: 0,
        sets: new Set<string>(),
        colors: new Map<string, number>(),
        parts: new Map<string, number>()
      };
      yearAgg.set(year, yearData);
    }

    yearData.pieces += qty;
    yearData.sets.add(setNum);

    // Track color quantities
    const color = colorMap.get(ip.color_id);
    if (color) {
      yearData.colors.set(color.id, (yearData.colors.get(color.id) || 0) + qty);
    }

    // Track part quantities
    yearData.parts.set(ip.part_num, (yearData.parts.get(ip.part_num) || 0) + qty);
  }

  // Convert inventory-based year data to array format
  const inventoryYearTrends: YearTrend[] = Array.from(yearAgg.entries())
    .map(([year, data]) => {
      // Find top color
      let topColorId = "";
      let topColorQty = 0;
      for (const [colorId, qty] of data.colors) {
        if (qty > topColorQty) {
          topColorId = colorId;
          topColorQty = qty;
        }
      }
      const topColor = colorMap.get(topColorId);

      // Find top part
      let topPartNum = "";
      let topPartQty = 0;
      for (const [partNum, qty] of data.parts) {
        if (qty > topPartQty) {
          topPartNum = partNum;
          topPartQty = qty;
        }
      }
      const topPart = partMap.get(topPartNum);

      return {
        year,
        total_pieces: data.pieces,
        total_sets: data.sets.size,
        avg_pieces_per_set: Math.round(data.pieces / data.sets.size) || 0,
        unique_colors: data.colors.size,
        unique_parts: data.parts.size,
        top_color: topColor?.name || "Unknown",
        top_color_hex: topColor ? `#${topColor.rgb}` : "#000000",
        top_part: topPartNum,
        top_part_name: topPart?.name || "Unknown",
        data_source: 'inventory' as const
      };
    });

  // ===== Pre-2010 Sets-Only Data =====
  console.log("Computing pre-2010 sets-only data...");
  const inventoryYears = new Set(inventoryYearTrends.map(t => t.year));

  // Aggregate sets by year from sets.csv
  const setsOnlyYearAgg = new Map<number, { sets: Set<string>; totalPieces: number }>();
  for (const set of sets) {
    const year = parseInt(set.year);
    if (isNaN(year) || year < 1949) continue;
    if (inventoryYears.has(year)) continue; // Skip years we have inventory data for

    let yearData = setsOnlyYearAgg.get(year);
    if (!yearData) {
      yearData = { sets: new Set<string>(), totalPieces: 0 };
      setsOnlyYearAgg.set(year, yearData);
    }
    yearData.sets.add(set.set_num);
    yearData.totalPieces += parseInt(set.num_parts) || 0;
  }

  // Convert sets-only data to YearTrend format
  const setsOnlyYearTrends: YearTrend[] = Array.from(setsOnlyYearAgg.entries())
    .map(([year, data]) => ({
      year,
      total_pieces: data.totalPieces,
      total_sets: data.sets.size,
      avg_pieces_per_set: Math.round(data.totalPieces / data.sets.size) || 0,
      unique_colors: null,
      unique_parts: null,
      top_color: null,
      top_color_hex: null,
      top_part: null,
      top_part_name: null,
      data_source: 'sets_only' as const
    }));

  // Combine and sort all year trends
  const yearTrends: YearTrend[] = [...inventoryYearTrends, ...setsOnlyYearTrends]
    .sort((a, b) => b.year - a.year); // Most recent first

  // ===== Coverage Stats =====
  console.log("Computing coverage stats...");

  // Helper to find threshold index
  function findThresholdIndex(items: Array<{ cumulative_percent: number }>, threshold: number): number {
    for (let i = 0; i < items.length; i++) {
      if (items[i].cumulative_percent >= threshold) {
        return i + 1; // 1-based count
      }
    }
    return items.length;
  }

  // Helper to get threshold items
  function getThresholdItems<T extends { name: string; percent: number; cumulative_percent: number }>(
    items: T[],
    threshold: number
  ): CoverageThreshold {
    const count = findThresholdIndex(items, threshold);
    return {
      count,
      items: items.slice(0, Math.min(count, 10)).map(item => ({
        name: item.name,
        percent: item.percent,
        cumulative_percent: item.cumulative_percent
      }))
    };
  }

  const coverageStats: CoverageStats = {
    parts: {
      total_unique: partFrequency.length,
      total_quantity: totalPartsQuantity,
      thresholds: {
        "50": getThresholdItems(partFrequency, 50),
        "80": getThresholdItems(partFrequency, 80),
        "90": getThresholdItems(partFrequency, 90),
        "95": getThresholdItems(partFrequency, 95),
        "99": getThresholdItems(partFrequency, 99)
      }
    },
    colors: {
      total_unique: colorStats.length,
      total_quantity: totalPieces,
      thresholds: {
        "50": getThresholdItems(colorStats, 50),
        "80": getThresholdItems(colorStats, 80),
        "90": getThresholdItems(colorStats, 90),
        "95": getThresholdItems(colorStats, 95),
        "99": getThresholdItems(colorStats, 99)
      }
    }
  };

  // ===== Decade Colors =====
  console.log("Computing decade colors...");

  // Map decade string to start year
  const decades = [
    { decade: "1950s", startYear: 1950, endYear: 1959 },
    { decade: "1960s", startYear: 1960, endYear: 1969 },
    { decade: "1970s", startYear: 1970, endYear: 1979 },
    { decade: "1980s", startYear: 1980, endYear: 1989 },
    { decade: "1990s", startYear: 1990, endYear: 1999 },
    { decade: "2000s", startYear: 2000, endYear: 2009 },
    { decade: "2010s", startYear: 2010, endYear: 2019 },
    { decade: "2020s", startYear: 2020, endYear: 2029 }
  ];

  // Aggregate colors by decade
  const decadeColorAgg = new Map<string, Map<string, { name: string; color: string; quantity: number }>>();
  for (const d of decades) {
    decadeColorAgg.set(d.decade, new Map());
  }

  for (const ip of inventoryParts) {
    const qty = parseInt(ip.quantity) || 0;
    const setNum = inventoryToSetMap.get(ip.inventory_id);
    if (!setNum) continue;

    const set = setMap.get(setNum);
    if (!set) continue;

    const year = parseInt(set.year);
    if (isNaN(year)) continue;

    // Find which decade this year belongs to
    const decadeInfo = decades.find(d => year >= d.startYear && year <= d.endYear);
    if (!decadeInfo) continue;

    const color = colorMap.get(ip.color_id);
    if (!color) continue;

    const decadeColors = decadeColorAgg.get(decadeInfo.decade)!;
    const key = `${color.rgb}-${color.name}`;
    const existing = decadeColors.get(key);
    if (existing) {
      existing.quantity += qty;
    } else {
      decadeColors.set(key, { name: color.name, color: `#${color.rgb}`, quantity: qty });
    }
  }

  // Convert to output format with top 10 colors per decade
  const decadeColors: DecadeColors[] = decades.map(d => {
    const colorMap = decadeColorAgg.get(d.decade)!;
    const colors = Array.from(colorMap.values());
    const total = colors.reduce((sum, c) => sum + c.quantity, 0);

    if (total === 0) {
      return { decade: d.decade, colors: [] };
    }

    const topColors = colors
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)
      .map(c => ({
        name: c.name,
        color: c.color,
        percent: parseFloat(((c.quantity / total) * 100).toFixed(2))
      }));

    return { decade: d.decade, colors: topColors };
  }).filter(d => d.colors.length > 0); // Only include decades with data

  // Write output files
  console.log("Writing output files...");
  await writeJSON("public/data/color-stats.json", colorStats);
  await writeJSON("public/data/part-frequency.json", partFrequency);
  await writeJSON("public/data/year-trends.json", yearTrends);
  await writeJSON("public/data/coverage-stats.json", coverageStats);
  await writeJSON("public/data/decade-colors.json", decadeColors);

  console.log("Postprocessing complete!");
  console.log(`  - color-stats.json: ${colorStats.length} colors`);
  console.log(`  - part-frequency.json: ${partFrequency.length} parts`);
  console.log(`  - year-trends.json: ${yearTrends.length} years (${inventoryYearTrends.length} with inventory, ${setsOnlyYearTrends.length} sets-only)`);
  console.log(`  - coverage-stats.json: thresholds at 50%, 80%, 90%, 95%, 99%`);
  console.log(`  - decade-colors.json: ${decadeColors.length} decades with top 10 colors each`);
}

main().catch(console.error);
