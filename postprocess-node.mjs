#!/usr/bin/env node
/**
 * postprocess-node.mjs - Node.js version of postprocess.ts
 *
 * Aggregates LEGO data from Rebrickable CSVs
 *
 * Usage: node postprocess-node.mjs <data_directory>
 * Example: node postprocess-node.mjs /tmp/rebrickable-data
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createGunzip } from "zlib";
import { pipeline } from "stream/promises";
import { createReadStream, createWriteStream } from "fs";

// Get data directory from args
const dataDir = process.argv[2] || "data";
const outputDir = process.argv[3] || "public/data";

console.log(`Data directory: ${dataDir}`);
console.log(`Output directory: ${outputDir}`);

// Ensure output directory exists
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// Simple CSV parser
function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length === 0) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);

  // Parse data rows
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = values[i]?.trim() || "";
    });
    return obj;
  });
}

// Handle quoted CSV values properly
function parseCSVLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

// Read CSV file (handles both .csv and .csv.gz)
async function readCSVFile(basePath) {
  const csvPath = basePath.replace(".gz", "");
  const gzPath = basePath.endsWith(".gz") ? basePath : `${basePath}.gz`;

  // Try reading decompressed version first
  if (existsSync(csvPath)) {
    console.log(`  Reading ${csvPath}...`);
    const content = readFileSync(csvPath, "utf-8");
    return parseCSV(content);
  }

  // Try reading gzipped version
  if (existsSync(gzPath)) {
    console.log(`  Decompressing and reading ${gzPath}...`);
    // Decompress in memory
    const chunks = [];
    await pipeline(
      createReadStream(gzPath),
      createGunzip(),
      async function* (source) {
        for await (const chunk of source) {
          chunks.push(chunk);
        }
      }
    );
    const content = Buffer.concat(chunks).toString("utf-8");

    // Write decompressed version for future use
    writeFileSync(csvPath, content);
    console.log(`  Saved decompressed ${csvPath}`);

    return parseCSV(content);
  }

  throw new Error(`File not found: ${csvPath} or ${gzPath}`);
}

// Write JSON file
function writeJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`  Wrote ${path}`);
}

// Main processing function
async function main() {
  console.log("\n=== Reading CSV files ===");

  // Read colors
  const colors = await readCSVFile(join(dataDir, "colors.csv"));
  console.log(`  Loaded ${colors.length} colors`);

  // Read parts
  const parts = await readCSVFile(join(dataDir, "parts.csv"));
  console.log(`  Loaded ${parts.length} parts`);

  // Read sets
  const sets = await readCSVFile(join(dataDir, "sets.csv"));
  console.log(`  Loaded ${sets.length} sets`);

  // Read inventories
  const inventories = await readCSVFile(join(dataDir, "inventories.csv"));
  console.log(`  Loaded ${inventories.length} inventories`);

  // Read inventory_parts
  const inventoryParts = await readCSVFile(join(dataDir, "inventory_parts.csv"));
  console.log(`  Loaded ${inventoryParts.length} inventory parts`);

  // Create lookup maps
  console.log("\n=== Creating lookup maps ===");

  const colorMap = new Map();
  for (const c of colors) {
    colorMap.set(c.id, c);
  }

  const partMap = new Map();
  for (const p of parts) {
    partMap.set(p.part_num, p);
  }

  const setMap = new Map();
  for (const s of sets) {
    setMap.set(s.set_num, s);
  }

  // Map inventory_id -> set_num (use first/primary inventory)
  const inventoryToSetMap = new Map();
  for (const inv of inventories) {
    if (!inventoryToSetMap.has(inv.id)) {
      inventoryToSetMap.set(inv.id, inv.set_num);
    }
  }

  // ===== Color Stats =====
  console.log("\n=== Computing color stats ===");
  const colorAgg = new Map();

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

  const totalPieces = Array.from(colorAgg.values()).reduce(
    (sum, c) => sum + c.quantity,
    0
  );
  console.log(`  Total pieces: ${totalPieces.toLocaleString()}`);

  // Sort by quantity descending and add rank + cumulative percent
  const sortedColors = Array.from(colorAgg.values()).sort(
    (a, b) => b.quantity - a.quantity
  );

  let colorCumulativeSum = 0;
  const colorStats = sortedColors.map((c, index) => {
    const percent = parseFloat(((c.quantity / totalPieces) * 100).toFixed(4));
    colorCumulativeSum += c.quantity;
    const cumulative_percent = parseFloat(
      ((colorCumulativeSum / totalPieces) * 100).toFixed(4)
    );
    return {
      name: c.name,
      color: c.color,
      quantity: c.quantity,
      percent,
      rank: index + 1,
      cumulative_percent,
    };
  });
  console.log(`  Unique colors: ${colorStats.length}`);

  // ===== Part Frequency =====
  console.log("\n=== Computing part frequency ===");
  const partAgg = new Map();

  for (const ip of inventoryParts) {
    const qty = parseInt(ip.quantity) || 0;
    const existing = partAgg.get(ip.part_num);
    if (existing) {
      existing.quantity += qty;
      // Use img_url from CSV if available and we don't have one yet
      if (ip.img_url && !existing.img_url) {
        existing.img_url = ip.img_url;
      }
    } else {
      partAgg.set(ip.part_num, { part_num: ip.part_num, quantity: qty, img_url: ip.img_url || '' });
    }
  }

  // Sort by quantity descending and compute totals
  const sortedParts = Array.from(partAgg.values()).sort(
    (a, b) => b.quantity - a.quantity
  );

  const totalPartsQuantity = sortedParts.reduce((sum, p) => sum + p.quantity, 0);
  console.log(`  Total part instances: ${totalPartsQuantity.toLocaleString()}`);

  // Add rank, percent, and cumulative percent
  let partCumulativeSum = 0;
  const partFrequency = sortedParts.map((p, index) => {
    const part = partMap.get(p.part_num);
    const percent = parseFloat(((p.quantity / totalPartsQuantity) * 100).toFixed(4));
    partCumulativeSum += p.quantity;
    const cumulative_percent = parseFloat(
      ((partCumulativeSum / totalPartsQuantity) * 100).toFixed(4)
    );
    return {
      part_num: p.part_num,
      name: part?.name || "Unknown",
      quantity: p.quantity,
      // Use img_url from inventory_parts.csv if available, otherwise empty string (handled by frontend)
      image: p.img_url || '',
      rank: index + 1,
      percent,
      cumulative_percent,
    };
  });
  console.log(`  Unique parts: ${partFrequency.length}`);

  // ===== Year Trends =====
  console.log("\n=== Computing year trends ===");

  // Aggregate by year
  const yearAgg = new Map();

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
        sets: new Set(),
        colors: new Map(),
        parts: new Map(),
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
  const inventoryYearTrends = Array.from(yearAgg.entries()).map(([year, data]) => {
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
      data_source: "inventory",
    };
  });

  // ===== Pre-2010 Sets-Only Data =====
  console.log("  Computing pre-2010 sets-only data...");
  const inventoryYears = new Set(inventoryYearTrends.map((t) => t.year));

  // Aggregate sets by year from sets.csv
  const setsOnlyYearAgg = new Map();
  for (const set of sets) {
    const year = parseInt(set.year);
    if (isNaN(year) || year < 1949) continue;
    if (inventoryYears.has(year)) continue; // Skip years we have inventory data for

    let yearData = setsOnlyYearAgg.get(year);
    if (!yearData) {
      yearData = { sets: new Set(), totalPieces: 0 };
      setsOnlyYearAgg.set(year, yearData);
    }
    yearData.sets.add(set.set_num);
    yearData.totalPieces += parseInt(set.num_parts) || 0;
  }

  // Convert sets-only data to YearTrend format
  const setsOnlyYearTrends = Array.from(setsOnlyYearAgg.entries()).map(
    ([year, data]) => ({
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
      data_source: "sets_only",
    })
  );

  // Combine and sort all year trends
  const yearTrends = [...inventoryYearTrends, ...setsOnlyYearTrends].sort(
    (a, b) => b.year - a.year
  ); // Most recent first
  console.log(
    `  Years: ${yearTrends.length} total (${inventoryYearTrends.length} inventory, ${setsOnlyYearTrends.length} sets-only)`
  );

  // ===== Coverage Stats =====
  console.log("\n=== Computing coverage stats ===");

  // Helper to find threshold index
  function findThresholdIndex(items, threshold) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].cumulative_percent >= threshold) {
        return i + 1; // 1-based count
      }
    }
    return items.length;
  }

  // Helper to get threshold items
  function getThresholdItems(items, threshold) {
    const count = findThresholdIndex(items, threshold);
    return {
      count,
      items: items.slice(0, Math.min(count, 10)).map((item) => ({
        name: item.name,
        percent: item.percent,
        cumulative_percent: item.cumulative_percent,
      })),
    };
  }

  const coverageStats = {
    parts: {
      total_unique: partFrequency.length,
      total_quantity: totalPartsQuantity,
      thresholds: {
        "50": getThresholdItems(partFrequency, 50),
        "80": getThresholdItems(partFrequency, 80),
        "90": getThresholdItems(partFrequency, 90),
        "95": getThresholdItems(partFrequency, 95),
        "99": getThresholdItems(partFrequency, 99),
      },
    },
    colors: {
      total_unique: colorStats.length,
      total_quantity: totalPieces,
      thresholds: {
        "50": getThresholdItems(colorStats, 50),
        "80": getThresholdItems(colorStats, 80),
        "90": getThresholdItems(colorStats, 90),
        "95": getThresholdItems(colorStats, 95),
        "99": getThresholdItems(colorStats, 99),
      },
    },
  };

  // ===== Decade Colors =====
  console.log("\n=== Computing decade colors ===");

  // Map decade string to start year
  const decades = [
    { decade: "1950s", startYear: 1950, endYear: 1959 },
    { decade: "1960s", startYear: 1960, endYear: 1969 },
    { decade: "1970s", startYear: 1970, endYear: 1979 },
    { decade: "1980s", startYear: 1980, endYear: 1989 },
    { decade: "1990s", startYear: 1990, endYear: 1999 },
    { decade: "2000s", startYear: 2000, endYear: 2009 },
    { decade: "2010s", startYear: 2010, endYear: 2019 },
    { decade: "2020s", startYear: 2020, endYear: 2029 },
  ];

  // Aggregate colors by decade
  const decadeColorAgg = new Map();
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
    const decadeInfo = decades.find((d) => year >= d.startYear && year <= d.endYear);
    if (!decadeInfo) continue;

    const color = colorMap.get(ip.color_id);
    if (!color) continue;

    const decadeColors = decadeColorAgg.get(decadeInfo.decade);
    const key = `${color.rgb}-${color.name}`;
    const existing = decadeColors.get(key);
    if (existing) {
      existing.quantity += qty;
    } else {
      decadeColors.set(key, { name: color.name, color: `#${color.rgb}`, quantity: qty });
    }
  }

  // Convert to output format with top 10 colors per decade
  const decadeColors = decades
    .map((d) => {
      const colorData = decadeColorAgg.get(d.decade);
      const colorsList = Array.from(colorData.values());
      const total = colorsList.reduce((sum, c) => sum + c.quantity, 0);

      if (total === 0) {
        return { decade: d.decade, colors: [] };
      }

      const topColors = colorsList
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10)
        .map((c) => ({
          name: c.name,
          color: c.color,
          percent: parseFloat(((c.quantity / total) * 100).toFixed(2)),
        }));

      return { decade: d.decade, colors: topColors };
    })
    .filter((d) => d.colors.length > 0); // Only include decades with data
  console.log(`  Decades with data: ${decadeColors.length}`);

  // Write output files
  console.log("\n=== Writing output files ===");
  writeJSON(join(outputDir, "color-stats.json"), colorStats);
  writeJSON(join(outputDir, "part-frequency.json"), partFrequency);
  writeJSON(join(outputDir, "year-trends.json"), yearTrends);
  writeJSON(join(outputDir, "coverage-stats.json"), coverageStats);
  writeJSON(join(outputDir, "decade-colors.json"), decadeColors);

  console.log("\n=== Postprocessing complete! ===");
  console.log(`  - color-stats.json: ${colorStats.length} colors`);
  console.log(`  - part-frequency.json: ${partFrequency.length} parts`);
  console.log(
    `  - year-trends.json: ${yearTrends.length} years (${inventoryYearTrends.length} with inventory, ${setsOnlyYearTrends.length} sets-only)`
  );
  console.log(`  - coverage-stats.json: thresholds at 50%, 80%, 90%, 95%, 99%`);
  console.log(`  - decade-colors.json: ${decadeColors.length} decades with top 10 colors each`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
