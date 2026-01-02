/**
 * postprocess.ts - Aggregates LEGO data from Rebrickable CSVs
 *
 * Ported from charts_lego.ipynb pandas logic to Deno/TypeScript
 *
 * Input files:
 *   - data/colors.csv
 *   - data/parts.csv
 *   - data/sets.csv.gz (for year data)
 *   - data/inventories.csv.gz (links sets to inventories)
 *   - data/inventory_parts.csv.gz (decompressed automatically by Flat)
 *
 * Output files:
 *   - public/data/color-stats.json
 *   - public/data/part-frequency.json
 *   - public/data/year-trends.json
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
}

interface PartFrequency {
  part_num: string;
  name: string;
  quantity: number;
  image: string;
}

interface YearTrend {
  year: number;
  total_pieces: number;
  total_sets: number;
  avg_pieces_per_set: number;
  unique_colors: number;
  unique_parts: number;
  top_color: string;
  top_color_hex: string;
  top_part: string;
  top_part_name: string;
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

  // Read all CSV files
  console.log("Reading colors.csv...");
  const colors = await readCSV("data/colors.csv") as Color[];

  console.log("Reading parts.csv...");
  const parts = await readCSV("data/parts.csv") as Part[];

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

  let colorStats: ColorStat[] = Array.from(colorAgg.values())
    .map(c => ({
      name: c.name,
      color: c.color,
      quantity: c.quantity,
      percent: parseFloat(((c.quantity / totalPieces) * 100).toFixed(2))
    }))
    .sort((a, b) => b.quantity - a.quantity);

  // Group colors with less than 1% into "Other"
  const threshold = 1.0;
  const majorColors = colorStats.filter(c => c.percent >= threshold);
  const minorColors = colorStats.filter(c => c.percent < threshold);

  if (minorColors.length > 0) {
    const otherQuantity = minorColors.reduce((sum, c) => sum + c.quantity, 0);
    const otherPercent = parseFloat(((otherQuantity / totalPieces) * 100).toFixed(2));

    colorStats = [
      { name: "Other (less than 1%)", color: "#CCCCCC", quantity: otherQuantity, percent: otherPercent },
      ...majorColors
    ].sort((a, b) => a.name === "Other (less than 1%)" ? -1 : b.quantity - a.quantity);
  }

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

  const partFrequency: PartFrequency[] = Array.from(partAgg.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 100)
    .map(p => {
      const part = partMap.get(p.part_num);
      return {
        part_num: p.part_num,
        name: part?.name || "Unknown",
        quantity: p.quantity,
        image: `https://cdn.rebrickable.com/media/parts/ldraw/0/${p.part_num}.png`
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

  // Convert to array format
  const yearTrends: YearTrend[] = Array.from(yearAgg.entries())
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
        top_part_name: topPart?.name || "Unknown"
      };
    })
    .sort((a, b) => b.year - a.year); // Most recent first

  // Write output files
  console.log("Writing output files...");
  await writeJSON("public/data/color-stats.json", colorStats);
  await writeJSON("public/data/part-frequency.json", partFrequency);
  await writeJSON("public/data/year-trends.json", yearTrends);

  console.log("Postprocessing complete!");
  console.log(`  - color-stats.json: ${colorStats.length} colors`);
  console.log(`  - part-frequency.json: ${partFrequency.length} parts`);
  console.log(`  - year-trends.json: ${yearTrends.length} years`);
}

main().catch(console.error);
