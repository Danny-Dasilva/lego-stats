# Research Report: GitHub Flat UI Viewer Customization

Generated: 2026-01-02

## Executive Summary

The `@githubocto/flat-ui` library is a **React + TypeScript** component with pluggable cell renderers via a `cellTypeMap` registry. Custom SVG/image cell rendering is achievable by forking flat-ui and adding a new cell type following the existing patterns (e.g., `ColorCell`). The `flat-viewer` app at flatgithub.com uses flat-ui and can be forked/self-hosted under MIT license.

## Research Questions Answered

### 1. What is @githubocto/flat-ui built with?

**Technology Stack:**
- **Framework:** React (with TypeScript - 92.2% of codebase)
- **Styling:** Tailwind CSS + twin.macro (CSS-in-JS)
- **Virtualization:** react-window + react-virtualized-auto-sizer
- **State Management:** Zustand + Immer
- **Build Tool:** TSDX
- **Data Processing:** D3, lodash, date-fns

**Source:** https://github.com/githubocto/flat-ui

### 2. How is flat-viewer (flatgithub.com) structured?

**Architecture:**
```
flat-viewer/
├── src/
│   ├── api/              # GitHub API integration via @octokit/rest
│   ├── components/       # React components (13 files)
│   │   ├── repo-detail.tsx
│   │   ├── json-detail-container.tsx  # <-- Uses @githubocto/flat-ui Grid
│   │   └── ...
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utility functions
│   ├── App.tsx           # Router: /, /:org/, /:owner/:name
│   └── types.ts
├── package.json          # Uses @githubocto/flat-ui ^0.13.5
└── vite.config.ts        # Vite build
```

**Key Integration Point:** `json-detail-container.tsx` renders the Grid:
```tsx
import { Grid } from "@githubocto/flat-ui";

<Grid
  data={tabData.value}
  diffData={tabDiffData.value}
  defaultSort={query.sort?.split(",")}
  defaultStickyColumnName={query.stickyColumnName}
  defaultFilters={decodedFilterString}
  downloadFilename={downloadFilename}
  onChange={onGridChange}
/>
```

### 3. Where is the cell rendering code?

**Cell Rendering Architecture in flat-ui:**

```
src/
├── store.ts              # cellTypeMap registry (key extension point!)
├── components/
│   ├── cell.tsx          # Main Cell wrapper, routes to type-specific renderer
│   ├── editable-cell.tsx # Edit mode wrapper
│   ├── grid.tsx          # Main grid, uses react-window VariableSizeGrid
│   ├── sticky-grid.tsx   # Handles sticky columns
│   └── cells/            # Type-specific renderers:
│       ├── string.tsx    # Text cells
│       ├── number.tsx    # Numeric cells
│       ├── date.tsx      # Date formatting
│       ├── time.tsx      # Datetime formatting
│       ├── color.tsx     # Color swatch + text (visual element example!)
│       ├── category.tsx  # Badge-style categorical data
│       ├── raw-number.tsx
│       └── ...
```

**cellTypeMap Structure (from store.ts):**
```typescript
export const cellTypeMap = {
  "string": {
    cell: StringCell,           // React component
    filter: StringFilter,       // Filter component
    format: (value, raw) => {}, // Display formatter
    shortFormat: () => {},      // Abbreviated format
    parseValueFunction: fn,     // Data transformation
    sortValueType: "string",    // "string" | "number"
    minWidth: 100,              // Optional
    hasScale: false,            // Optional: show scale bar
  },
  "color": { ... },
  "number": { ... },
  // ... 12 total types
}
```

**Supported Cell Types (12 total):**
1. string
2. color
3. object
4. array
5. short-array
6. category
7. number
8. year
9. short-range-date
10. date
11. time

### 4. How could we add custom cell rendering for SVG/images?

**Strategy: Fork flat-ui and add an "image" cell type**

**Step 1:** Create `src/components/cells/image.tsx`:
```typescript
import "twin.macro";
import DOMPurify from "dompurify";

interface ImageCellProps {
  value: string;          // URL or base64 data
  formattedValue: string; // Display text (filename, etc.)
  rawValue: string;       // Original value for tooltip
}

export function ImageCell(props: ImageCellProps) {
  const isUrl = props.value?.startsWith("http") || props.value?.startsWith("data:");

  return (
    <div tw="flex items-center gap-2 h-full">
      {isUrl ? (
        <img
          src={props.value}
          alt={props.rawValue}
          tw="h-8 w-8 object-contain"
          onError={(e) => e.currentTarget.style.display = 'none'}
        />
      ) : (
        // For inline SVG content
        <div
          tw="h-8 w-8"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(props.value, {
              USE_PROFILES: { svg: true },
              ADD_TAGS: ['svg', 'path', 'rect', 'circle', 'polygon'],
            })
          }}
        />
      )}
      <span tw="truncate" title={props.rawValue}>
        {props.formattedValue}
      </span>
    </div>
  );
}
```

**Step 2:** Register in `store.ts`:
```typescript
import { ImageCell } from "./components/cells/image";

export const cellTypeMap = {
  // ... existing types
  "image": {
    cell: ImageCell,
    filter: StringFilter,  // Reuse string filter
    format: (value: string) => value,
    shortFormat: (value: string) => value?.split('/').pop() || value,
    parseValueFunction: (d: string) => d,
    sortValueType: "string",
    minWidth: 120,
    hasScale: false,
  },
};
```

**Step 3:** Update type detection logic in `grid.tsx` to recognize image columns:
```typescript
// In the column type inference logic, add:
const isImageColumn = (values: string[]) => {
  return values.some(v =>
    v?.startsWith("http") && /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(v) ||
    v?.startsWith("data:image/") ||
    v?.startsWith("<svg")
  );
};
```

**Alternative: For SVG brick patterns specifically:**
- If SVG is generated per-row, add a `renderCell` prop to Grid
- Or use the `metadata` prop to mark columns as image type

### 5. Can we fork flat-viewer and host our own version?

**Yes, absolutely.** Both repositories use **MIT License**.

**Self-Hosting Steps:**

1. **Fork both repositories:**
   ```bash
   # Fork flat-ui (for custom cell types)
   git clone https://github.com/githubocto/flat-ui
   cd flat-ui && yarn && yarn build

   # Fork flat-viewer
   git clone https://github.com/githubocto/flat-viewer
   ```

2. **Link custom flat-ui:**
   ```bash
   # In flat-ui
   yarn link

   # In flat-viewer
   yarn link @githubocto/flat-ui
   ```

   Or update `package.json` to point to your fork:
   ```json
   {
     "dependencies": {
       "@githubocto/flat-ui": "github:your-org/flat-ui#main"
     }
   }
   ```

3. **Local Development:**
   ```bash
   cd flat-viewer
   yarn install
   yarn dev  # Vite dev server
   ```

4. **Build for Production:**
   ```bash
   yarn build  # Creates dist/
   ```

5. **Deployment Options:**
   - **Vercel:** Auto-deploys from GitHub, zero config for Vite
   - **Netlify:** Same, just connect repo
   - **GitHub Pages:** Add `base` to vite.config.ts
   - **Static hosting:** Upload `dist/` anywhere

**Key Consideration:** flat-viewer uses `@octokit/rest` for GitHub API. For private repos, you'll need to add authentication.

### 6. Source Code Repository Analysis

#### @githubocto/flat-ui
- **URL:** https://github.com/githubocto/flat-ui
- **Stars:** ~200
- **License:** MIT
- **Last updated:** Active (check GitHub for recent commits)
- **npm:** `@githubocto/flat-ui`
- **Key files for customization:**
  - `/src/store.ts` - cellTypeMap registry
  - `/src/components/cells/*` - Cell type implementations
  - `/src/components/cell.tsx` - Cell wrapper routing

#### @githubocto/flat-viewer
- **URL:** https://github.com/githubocto/flat-viewer
- **Stars:** ~300
- **License:** MIT
- **Hosted at:** flatgithub.com
- **Dependencies:** Uses flat-ui ^0.13.5
- **Key files:**
  - `/src/components/json-detail-container.tsx` - Grid integration
  - `/src/api/` - GitHub data fetching

## Architecture Diagram

```
flat-viewer (app)                    flat-ui (library)
-----------------                    -----------------

App.tsx
  |-- RepoDetail
        |-- JSONDetailContainer
              |-- Grid -------------> GridWrapper
                                        |-- StoreWrapper (Zustand)
                                              |-- StickyGrid
                                                    |-- VariableSizeGrid (react-window)
                                                          |-- Cell
                                                                |-- cellTypeMap[type].cell
                                                                      |-- StringCell
                                                                      |-- NumberCell
                                                                      |-- ColorCell
                                                                      |-- DateCell
                                                                      |-- ... (12 types)
```

## Cell Renderer Interface

All cell renderers receive these props:

```typescript
interface CellProps {
  value: string;          // Processed value
  formattedValue: string; // HTML-formatted display value
  rawValue: string;       // Original unprocessed value
  categoryColor?: string; // For category type only
}
```

**Example - StringCell implementation:**
```typescript
export function StringCell(props: StringCellProps) {
  return (
    <div
      tw="truncate"
      title={props.rawValue}
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(props.formattedValue),
      }}
    />
  );
}
```

**Example - ColorCell implementation (visual element pattern):**
```typescript
export function ColorCell(props: ColorCellProps) {
  return (
    <Fragment>
      <div tw="absolute top-0 bottom-0 left-0 w-[0.9em]" style={{
        background: props.value,
      }} />
      <div
        tw="truncate"
        title={props.rawValue}
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(props.formattedValue),
        }}
      />
    </Fragment>
  );
}
```

## Sources

- [flat-ui GitHub Repository](https://github.com/githubocto/flat-ui)
- [flat-viewer GitHub Repository](https://github.com/githubocto/flat-viewer)
- [flat-ui README](https://github.com/githubocto/flat-ui/blob/main/README.md)
- [flat-viewer README](https://github.com/githubocto/flat-viewer/blob/main/README.md)
- [flat-ui package.json](https://github.com/githubocto/flat-ui/blob/main/package.json)
- [flat-ui store.ts (cellTypeMap)](https://github.com/githubocto/flat-ui/blob/main/src/store.ts)
- [flat-ui cells directory](https://github.com/githubocto/flat-ui/tree/main/src/components/cells)

## Recommendations

1. **For Quick Wins:** Use the existing `color` cell type as a template - it already renders visual elements (color swatches) alongside text.

2. **For Full Control:** Fork flat-ui, add an `image` cell type, and point your flat-viewer fork to your custom flat-ui.

3. **For Lego Brick Visualization:** Consider:
   - Adding a `brick` cell type that renders inline SVG
   - Using DOMPurify with SVG profile for security
   - Setting appropriate `minWidth` and row height

4. **Deployment:** Vercel is the easiest option for hosting your forked flat-viewer.

## Open Questions

1. **Type Detection:** How does flat-ui auto-detect cell types? The logic in `grid.tsx` samples column values - you may need to add image detection heuristics.

2. **Row Height:** Default row height may be too small for images. Check if Grid supports variable row heights or if this needs modification.

3. **Performance:** For many image cells, consider lazy loading or placeholder patterns to avoid blocking render.

4. **GitHub API Rate Limits:** flat-viewer uses unauthenticated GitHub API calls. For heavy usage, you'll hit rate limits (60 req/hour). Consider adding auth for your fork.
