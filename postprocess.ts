/**
 * postprocess.ts - Aggregates LEGO data from Rebrickable CSVs
 *
 * Ported from charts_lego.ipynb pandas logic to Deno/TypeScript
 *
 * Input files:
 *   - src/data/colors.csv
 *   - src/data/parts.csv
 *   - src/data/inventory_parts.csv.gz (decompressed automatically by Flat)
 *
 * Output files:
 *   - src/data/color-stats.json
 *   - src/data/part-frequency.json
 *   - src/data/year-trends.json
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
  rgb: string;
  quantity: number;
  percent: number;
}

interface PartFrequency {
  part_num: string;
  name: string;
  quantity: number;
}

// Main postprocess function
async function main() {
  const filename = Deno.args[0]; // The downloaded file passed by Flat
  console.log(`Postprocessing triggered by: ${filename}`);

  // Read all CSV files
  console.log("Reading colors.csv...");
  const colors = await readCSV("src/data/colors.csv") as Color[];

  console.log("Reading parts.csv...");
  const parts = await readCSV("src/data/parts.csv") as Part[];

  // For inventory_parts, we need to handle the gzip
  // Flat automatically decompresses .gz files, so we read the decompressed version
  console.log("Reading inventory_parts.csv...");
  const inventoryPartsPath = filename.endsWith(".gz")
    ? filename.replace(".gz", "")
    : filename;

  // If file is still gzipped, decompress it
  let inventoryParts: InventoryPart[];
  try {
    inventoryParts = await readCSV(inventoryPartsPath) as InventoryPart[];
  } catch {
    // Try reading the .gz file and decompress
    const gzData = await Deno.readFile(filename);
    const decompressed = new DecompressionStream("gzip");
    const stream = new Response(gzData).body!.pipeThrough(decompressed);
    const text = await new Response(stream).text();

    // Parse CSV manually
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",");
    inventoryParts = lines.slice(1).map(line => {
      const values = line.split(",");
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => obj[h.trim()] = values[i]?.trim() || "");
      return obj as unknown as InventoryPart;
    });

    // Write decompressed CSV for future use
    await Deno.writeTextFile(inventoryPartsPath, text);
  }

  console.log(`Loaded ${colors.length} colors, ${parts.length} parts, ${inventoryParts.length} inventory parts`);

  // Create lookup maps
  const colorMap = new Map<string, Color>();
  for (const c of colors) {
    colorMap.set(c.id, c);
  }

  const partMap = new Map<string, Part>();
  for (const p of parts) {
    partMap.set(p.part_num, p);
  }

  // ===== Color Stats =====
  // Aggregate quantity by color (rgb, name)
  console.log("Computing color stats...");
  const colorAgg = new Map<string, { name: string; rgb: string; quantity: number }>();

  for (const ip of inventoryParts) {
    const qty = parseInt(ip.quantity) || 0;
    const color = colorMap.get(ip.color_id);
    if (!color) continue;

    const key = `${color.rgb}-${color.name}`;
    const existing = colorAgg.get(key);
    if (existing) {
      existing.quantity += qty;
    } else {
      colorAgg.set(key, { name: color.name, rgb: color.rgb, quantity: qty });
    }
  }

  // Convert to array and compute percentages
  const totalPieces = Array.from(colorAgg.values()).reduce((sum, c) => sum + c.quantity, 0);

  let colorStats: ColorStat[] = Array.from(colorAgg.values())
    .map(c => ({
      name: c.name,
      rgb: c.rgb,
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
      { name: "Other (less than 1%)", rgb: "cccccc", quantity: otherQuantity, percent: otherPercent },
      ...majorColors
    ].sort((a, b) => a.name === "Other (less than 1%)" ? -1 : b.quantity - a.quantity);
  }

  // ===== Part Frequency =====
  // Aggregate quantity by part_num
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

  // Sort by quantity descending and take top 100
  const partFrequency: PartFrequency[] = Array.from(partAgg.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 100)
    .map(p => {
      const part = partMap.get(p.part_num);
      return {
        part_num: p.part_num,
        name: part?.name || "Unknown",
        quantity: p.quantity
      };
    });

  // ===== Year Trends =====
  // Without sets.csv, we'll create a simplified version based on color distribution
  // In a full implementation, you'd join with sets.csv to get year data
  console.log("Computing year trends...");

  // For now, output the overall color distribution as year trends placeholder
  // This would need sets.csv and inventories.csv to properly compute trends by year
  const yearTrends = {
    note: "Year trends require sets.csv to join inventory data with set years",
    totalPieces,
    colorCount: colorStats.length,
    partCount: partFrequency.length,
    topColors: colorStats.slice(0, 10).map(c => ({ name: c.name, percent: c.percent })),
    topParts: partFrequency.slice(0, 10).map(p => ({ part_num: p.part_num, name: p.name }))
  };

  // Write output files
  console.log("Writing output files...");
  await writeJSON("src/data/color-stats.json", colorStats);
  await writeJSON("src/data/part-frequency.json", partFrequency);
  await writeJSON("src/data/year-trends.json", yearTrends);

  console.log("Postprocessing complete!");
  console.log(`  - color-stats.json: ${colorStats.length} colors`);
  console.log(`  - part-frequency.json: ${partFrequency.length} parts`);
  console.log(`  - year-trends.json: summary data`);
}

main().catch(console.error);
