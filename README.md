# @equall/canvas-table

A high-performance canvas-based data grid with first-class Svelte 5 support. Renders millions of rows on a single `<canvas>` element with sortable columns, inline editing, filtering, keyboard navigation, and custom column renderers via Svelte snippets.

Based on [canvas-datagrid](https://github.com/TonyGermaneri/canvas-datagrid).

## Installation

```bash
npm install @equall/canvas-table
```

## Svelte 5 Component

```svelte
<script>
  import CanvasDatagrid from '@equall/canvas-table/svelte';

  const data = [
    { name: 'Alice', age: 30, city: 'New York' },
    { name: 'Bob', age: 25, city: 'London' },
  ];
</script>

<CanvasDatagrid {data} editable allowSorting showFilter />
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `data` | `Array<object>` | Array of row objects (bindable) |
| `schema` | `Array<object>` | Column definitions (`{ name, type, width }`) (bindable) |
| `style` | `object` | Grid style overrides (see [style properties](#style-properties)) |
| `columnRenderers` | `object` | Map of column names to Svelte snippets |
| `cellStyle` | `function` | Declarative cell styling — `(context) => CellStyle \| null` |
| `animateRows` | `boolean \| object` | Animate row insert/remove — `true` or `{ duration, key }` |
| `htmlHeaders` | `boolean` | Render column headers as HTML DOM elements |
| `columnHeaderRenderers` | `object` | Map of column names to header Svelte snippets (requires `htmlHeaders`) |
| `testMode` | `boolean` | Render transparent DOM elements over cells for e2e testing |
| `onRequestData` | `function` | Callback for infinite scroll — fires when scrolled near the bottom |
| `requestDataBuffer` | `number` | Rows from bottom to trigger `onRequestData` (default `50`) |
| `formatters` | `object` | Custom cell formatters |
| `sorters` | `object` | Custom sort functions |
| `filters` | `object` | Custom filter functions |
| `on*` | `function` | Any `on`-prefixed prop is forwarded as a grid event listener |
| *any other* | `any` | Passed as a grid attribute or property (e.g. `editable`, `frozenColumn`) |

### Events

Pass event handlers as `on*` props:

```svelte
<CanvasDatagrid
  {data}
  onclick={(e) => console.log('clicked', e.cell)}
  onselectionchanged={(e) => console.log('selection changed')}
  onafterrendercell={(e) => { /* custom cell rendering */ }}
/>
```

Common events: `click`, `dblclick`, `selectionchanged`, `beforerendercell`, `rendercell`, `afterrendercell`, `afterdraw`, `contextmenu`, `keydown`, `scroll`.

### Schema

Define column types, widths, and display names:

```svelte
<script>
  const schema = [
    { name: 'name', type: 'string', width: 200 },
    { name: 'age', type: 'number', width: 100 },
    { name: 'email', type: 'string', width: 250 },
  ];
</script>

<CanvasDatagrid {data} {schema} />
```

If no schema is provided, columns are auto-detected from the data.

### Accessing the Grid Instance

Use `bind:this` and `getGrid()` for escape-hatch access to the underlying canvas-datagrid API:

```svelte
<script>
  let gridComponent;

  function fitColumns() {
    gridComponent.getGrid().fitColumnToValues('all');
  }
</script>

<CanvasDatagrid bind:this={gridComponent} {data} />
<button onclick={fitColumns}>Fit Columns</button>
```

### Animated Cell Selection

Enable a smooth DOM-based selection overlay that animates between cells:

```svelte
<CanvasDatagrid
  {data}
  animatedCellSelection={true}
  animatedCellSelectionDuration={150}
  animatedCellSelectionBorderRadius={5}
/>
```

| Attribute | Default | Description |
|-----------|---------|-------------|
| `animatedCellSelection` | `false` | Enable DOM-based selection overlay |
| `animatedCellSelectionDuration` | `150` | Transition duration in ms |
| `animatedCellSelectionBorderRadius` | `5` | Border radius of selection box in px |

### Column Renderers

Overlay Svelte snippets on specific columns to replace the default canvas-drawn text with interactive DOM elements:

```svelte
<script>
  import CanvasDatagrid from '@equall/canvas-table/svelte';

  let data = $state([
    { name: 'Alice', status: 'Active' },
    { name: 'Bob', status: 'On Leave' },
  ]);

  const statusColors = {
    'Active': '#dcfce7',
    'On Leave': '#fef9c3',
  };

  function updateStatus(cell, e) {
    data[cell.rowIndex].status = e.target.value;
    data = [...data];
  }
</script>

{#snippet statusRenderer(cell)}
  <div style="background:{statusColors[cell.value]};padding:2px 8px;border-radius:9999px;">
    <select value={cell.value} onchange={(e) => updateStatus(cell, e)}>
      <option>Active</option>
      <option>On Leave</option>
    </select>
  </div>
{/snippet}

<CanvasDatagrid
  {data}
  columnRenderers={{ status: statusRenderer }}
/>
```

Each snippet receives a cell object with:

| Property | Type | Description |
|----------|------|-------------|
| `value` | `any` | The cell's current value |
| `row` | `object` | The full row data object |
| `rowIndex` | `number` | Row index in the data array |
| `columnIndex` | `number` | Column index |
| `colName` | `string` | Column name |
| `formattedValue` | `string` | Formatted display value |

Renderer overlays are positioned absolutely over the canvas cells, updated on every draw cycle, and automatically recycled as rows scroll in and out of view.

### Cell Style

Apply declarative styles to cells without writing `rendercell` handlers:

```svelte
<CanvasDatagrid
  {data}
  cellStyle={({ colName, value }) => {
    if (colName === 'Salary' && value >= 150000)
      return { backgroundColor: '#dcfce7', color: '#166534', fontWeight: 'bold' };
    if (colName === 'Rating' && parseFloat(value) < 2)
      return { backgroundColor: '#fecaca', color: '#991b1b', shadow: 'md' };
  }}
/>
```

| Property | Type | Description |
|----------|------|-------------|
| `backgroundColor` | `string` | Cell background color |
| `color` | `string` | Text color |
| `font` | `string` | Full CSS font string (e.g. `"bold 14px sans-serif"`) |
| `fontWeight` | `string` | Font weight (e.g. `"bold"`) — applied as prefix to existing font |
| `textDecoration` | `'none' \| 'line-through' \| 'underline'` | Line drawn through or under the cell text |
| `strikethrough` | `boolean` | Shorthand for `textDecoration: 'line-through'` — ignored when `textDecoration` is set |
| `textDecorationColor` | `string` | Decoration line color — defaults to the cell's text color |
| `textDecorationWidth` | `number` | Decoration line thickness in CSS pixels — defaults to a proportion of the font size |
| `shadow` | `'none' \| 'sm' \| 'md' \| 'lg'` | Inset top shadow for row depth effect |
| `borderColor` | `string` | Cell border color |
| `borderWidth` | `number` | Cell border width in pixels |
| `borderTop` / `borderRight` / `borderBottom` / `borderLeft` | `string \| { color, width }` | Per-side border. CSS color string (e.g. `"#ff0000"`) or `{ color, width }` object |
| `paddingLeft` / `paddingRight` / `paddingTop` / `paddingBottom` | `number` | Per-cell padding in CSS pixels (overrides the grid-wide `cellPadding*` style) |

Per-side borders example:

```svelte
<CanvasDatagrid
  {data}
  cellStyle={({ colName, value, rowIndex, row }) => {
    if (colName === 'Total') {
      // thick green left border for emphasis
      return { borderLeft: { color: '#10b981', width: 3 } };
    }
    if (rowIndex > 0 && row.group !== prevRow.group) {
      // group separator
      return { borderTop: '#94a3b8' };
    }
  }}
/>
```

Text decoration example:

```svelte
<CanvasDatagrid
  {data}
  cellStyle={({ colName, row }) => {
    // strike out every cell of a cancelled row
    if (row.status === 'cancelled')
      return { strikethrough: true, color: '#9ca3af', textDecorationColor: '#ef4444' };
    if (colName === 'Email')
      return { textDecoration: 'underline', color: '#2563eb' };
  }}
/>
```

> Text decoration is not applied to columns that use a `columnRenderers`
> snippet — those replace the canvas text with an HTML overlay, so style them
> with CSS instead.

### Animated Row Transitions

Animate row insertions and removals when data changes:

```svelte
<CanvasDatagrid
  {data}
  animateRows={{ key: 'id', duration: 250 }}
/>
```

Rows are identified by a unique key field. New rows slide in (height 0 → full), removed rows collapse out (full → 0). Pass `true` for defaults (200ms, key `'id'`).

### HTML Headers

Render column headers as HTML DOM elements instead of canvas text:

```svelte
<CanvasDatagrid {data} htmlHeaders />
```

Headers match the canvas header styling by default and support click-to-sort. For custom header content, use `columnHeaderRenderers`:

```svelte
{#snippet nameHeader(header)}
  <span>📛 {header.title} {header.sortDirection === 'asc' ? '▲' : '▼'}</span>
{/snippet}

<CanvasDatagrid {data} htmlHeaders columnHeaderRenderers={{ Name: nameHeader }} />
```

### Test Mode (E2E Testing)

Renders transparent DOM elements over each visible cell for e2e test frameworks:

```svelte
<CanvasDatagrid {data} testMode={true} />
```

Each cell gets a positioned `<div>` with data attributes:

| Attribute | Example | Description |
|-----------|---------|-------------|
| `data-testid` | `cell-0-2`, `header-Name` | Unique test selector |
| `data-row` | `0` | Row index |
| `data-col` | `2` | Column index |
| `data-column` | `Name` | Column name |
| `data-value` | `Alice` | Cell value as string |
| `data-header` | `true` | Present on column header cells |

```js
// Playwright examples
await page.click('[data-testid="cell-0-2"]');
await page.click('[data-testid="header-Name"]');
const value = await page.getAttribute('[data-testid="cell-3-1"]', 'data-value');
await page.locator('[data-column="Status"]').count();
```

### Infinite Scroll / Pagination

Load data on demand as the user scrolls near the bottom of the grid:

```svelte
<script>
  import CanvasDatagrid from '@equall/canvas-table/svelte';

  let data = $state(initialBatch);
  let loading = false;

  async function handleRequestData({ lastVisibleRow, totalRows }) {
    if (loading) return;
    loading = true;
    const nextBatch = await fetchRows(totalRows, 100);
    data = [...data, ...nextBatch];
    loading = false;
  }
</script>

<CanvasDatagrid
  {data}
  onRequestData={handleRequestData}
  requestDataBuffer={50}
/>
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onRequestData` | `(info) => void` | `undefined` | Called when the user scrolls within the buffer zone |
| `requestDataBuffer` | `number` | `50` | Number of rows from the bottom at which the callback fires |

The callback receives `{ lastVisibleRow, totalRows }`. It fires once per data length — after you append rows (changing `data`), it re-arms automatically.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Arrow keys | Navigate between cells |
| Shift + Arrow | Extend selection |
| Cmd/Ctrl + Arrow | Jump to edge of data |
| Enter | Begin editing / confirm edit |
| Escape | Cancel editing |
| Tab | Move to next cell |

## Vanilla JavaScript

```js
import canvasDatagrid from '@equall/canvas-table';

const grid = canvasDatagrid({
  parentNode: document.getElementById('grid'),
  data: [
    { col1: 'row 1 column 1', col2: 'row 1 column 2' },
    { col1: 'row 2 column 1', col2: 'row 2 column 2' },
  ],
});
```

## Web Component

```html
<canvas-datagrid data='[{"col1": "value1", "col2": "value2"}]'></canvas-datagrid>
```

## Style Properties

Pass style overrides via the `style` prop:

```svelte
<CanvasDatagrid
  {data}
  style={{
    cellHeight: 30,
    cellFont: '14px sans-serif',
    activeCellOverlayBorderColor: '#1a73e8',
    activeCellOverlayBorderWidth: 2,
  }}
/>
```

See the [full style reference](https://canvas-datagrid.js.org/) for all available properties.

## Building & Testing

```bash
npm install
npm run build
npm test
```

## License

BSD-3-Clause
