# LEGO Statistics Dashboard

Interactive dashboard displaying LEGO part and color statistics from the [Rebrickable](https://rebrickable.com/) database.

## Features

- **Top 100 Parts Table**: Most common LEGO parts with SVG previews
- **Color Distribution Chart**: Breakdown of piece colors with actual RGB colors
- **Summary Statistics**: Total pieces, distinct colors, and parts tracked
- **Auto-updating**: Data refreshed weekly via GitHub Flat Data

## Tech Stack

- **[Observable Framework](https://observablehq.com/framework/)**: Static site generator for data apps
- **[GitHub Flat Data](https://githubnext.com/projects/flat-data/)**: Automated data fetching
- **[Rebrickable API](https://rebrickable.com/api/)**: LEGO database source

## Data Pipeline

```
Rebrickable CDN → Flat Data Action → postprocess.ts → Observable Dashboard
     (weekly)        (GitHub)           (Deno)           (Static HTML)
```

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Data Sources

| File | Source |
|------|--------|
| `colors.csv` | [Rebrickable Colors](https://cdn.rebrickable.com/media/downloads/colors.csv) |
| `parts.csv` | [Rebrickable Parts](https://cdn.rebrickable.com/media/downloads/parts.csv) |
| `inventory_parts.csv.gz` | [Rebrickable Inventory Parts](https://cdn.rebrickable.com/media/downloads/inventory_parts.csv.gz) |

## Deployment

The site auto-deploys to GitHub Pages when the `flat.yml` workflow runs (every Sunday) or via manual trigger.

## Related

- [Lego_Gen](https://github.com/Danny-Dasilva/Lego_Gen) - Parent project for LEGO part classification
