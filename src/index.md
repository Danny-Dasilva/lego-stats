---
title: LEGO Statistics Dashboard
---

# LEGO Statistics Dashboard

This dashboard displays statistics from the [Rebrickable](https://rebrickable.com/) LEGO database, updated weekly via GitHub Flat Data.

```js
const colorStats = FileAttachment("data/color-stats.json").json();
const partFrequency = FileAttachment("data/part-frequency.json").json();
const yearTrends = FileAttachment("data/year-trends.json").json();
```

## Top 100 Parts by Frequency

The most common LEGO parts across all sets. Click column headers to sort.

```js
Inputs.table(partFrequency, {
  columns: ["part_num", "name", "quantity", "svg"],
  header: {
    part_num: "Part #",
    name: "Name",
    quantity: "Total Count",
    svg: "Preview"
  },
  format: {
    quantity: (d) => d.toLocaleString(),
    svg: (_, i, data) => htl.html`<img
      src="./part-svgs/${data[i].part_num}.svg"
      width="50"
      height="50"
      style="background: #f5f5f5; border-radius: 4px;"
      onerror="this.style.display='none'"
      alt="${data[i].name}"
    >`
  },
  sort: "quantity",
  reverse: true,
  rows: 20,
  maxWidth: 1000
})
```

## Color Distribution

Distribution of LEGO piece colors. Colors with less than 1% are grouped into "Other".

```js
Plot.plot({
  title: "LEGO Color Distribution",
  subtitle: "Percentage of total pieces by color",
  marginLeft: 120,
  marginRight: 40,
  width: 900,
  height: 500,
  x: {
    label: "Percentage of pieces",
    domain: [0, Math.max(...colorStats.map(d => d.percent)) * 1.1]
  },
  y: {
    label: null
  },
  marks: [
    Plot.barX(colorStats, {
      y: "name",
      x: "percent",
      fill: d => d.rgb === "cccccc" ? "#cccccc" : `#${d.rgb}`,
      stroke: "#333",
      strokeWidth: 0.5,
      sort: {y: "-x"},
      tip: true,
      title: d => `${d.name}\n${d.percent}% (${d.quantity.toLocaleString()} pieces)`
    }),
    Plot.text(colorStats, {
      y: "name",
      x: "percent",
      text: d => `${d.percent}%`,
      dx: 5,
      textAnchor: "start",
      fill: "#333",
      fontSize: 11
    }),
    Plot.ruleX([0])
  ]
})
```

## Summary Statistics

```js
const summaryCards = htl.html`<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0;">
  <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 8px; text-align: center;">
    <div style="font-size: 2rem; font-weight: bold; color: #e63946;">${yearTrends.totalPieces?.toLocaleString() || "N/A"}</div>
    <div style="color: #666; margin-top: 0.5rem;">Total Pieces</div>
  </div>
  <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 8px; text-align: center;">
    <div style="font-size: 2rem; font-weight: bold; color: #457b9d;">${yearTrends.colorCount || "N/A"}</div>
    <div style="color: #666; margin-top: 0.5rem;">Distinct Colors</div>
  </div>
  <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 8px; text-align: center;">
    <div style="font-size: 2rem; font-weight: bold; color: #2a9d8f;">${partFrequency.length}</div>
    <div style="color: #666; margin-top: 0.5rem;">Top Parts Tracked</div>
  </div>
</div>`;

display(summaryCards);
```

## Top 10 Colors

```js
const top10Colors = colorStats.filter(d => d.name !== "Other (less than 1%)").slice(0, 10);

Plot.plot({
  title: "Top 10 LEGO Colors",
  width: 600,
  height: 400,
  marginBottom: 80,
  x: {
    label: null,
    tickRotate: -45
  },
  y: {
    label: "Percentage",
    grid: true
  },
  marks: [
    Plot.barY(top10Colors, {
      x: "name",
      y: "percent",
      fill: d => `#${d.rgb}`,
      stroke: "#333",
      strokeWidth: 0.5,
      tip: true,
      title: d => `${d.name}: ${d.percent}%`
    }),
    Plot.ruleY([0])
  ]
})
```

## Top 10 Parts

```js
const top10Parts = partFrequency.slice(0, 10);

Plot.plot({
  title: "Top 10 Most Common Parts",
  subtitle: "Total count across all LEGO sets",
  width: 800,
  height: 400,
  marginLeft: 200,
  x: {
    label: "Total Count",
    grid: true
  },
  y: {
    label: null
  },
  marks: [
    Plot.barX(top10Parts, {
      y: "name",
      x: "quantity",
      fill: "#e63946",
      sort: {y: "-x"},
      tip: true,
      title: d => `${d.name}\nPart #${d.part_num}\n${d.quantity.toLocaleString()} pieces`
    }),
    Plot.text(top10Parts, {
      y: "name",
      x: "quantity",
      text: d => d.quantity.toLocaleString(),
      dx: 5,
      textAnchor: "start",
      fill: "#333",
      fontSize: 11
    }),
    Plot.ruleX([0])
  ]
})
```

---

## Data Sources

- **Colors**: [Rebrickable Colors CSV](https://cdn.rebrickable.com/media/downloads/colors.csv)
- **Parts**: [Rebrickable Parts CSV](https://cdn.rebrickable.com/media/downloads/parts.csv)
- **Inventory Parts**: [Rebrickable Inventory Parts CSV](https://cdn.rebrickable.com/media/downloads/inventory_parts.csv.gz)

Data is fetched weekly via [GitHub Flat Data](https://githubnext.com/projects/flat-data/) and processed with a Deno postprocessing script.

<div style="margin-top: 2rem; padding: 1rem; background: #f0f0f0; border-radius: 8px; font-size: 0.9rem; color: #666;">
  <strong>Note:</strong> Part SVG previews are generated separately and may not be available for all parts. Parts without SVGs will show a blank cell.
</div>
