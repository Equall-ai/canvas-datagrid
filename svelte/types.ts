import type { Snippet } from 'svelte';

// ─── Cell ────────────────────────────────────────────────────────────────────

/** A column definition in the grid schema. */
export interface ColumnSchema {
  /** Column identifier, matches keys in row data objects. */
  name: string;
  /** Data type for formatting and sorting. */
  type?: string;
  /** Column width in pixels. */
  width?: number;
  /** Display title (defaults to `name` if omitted). */
  title?: string;
  /** Whether the column is hidden. */
  hidden?: boolean;
  /** Default value for new rows. */
  defaultValue?: any;
}

/** A cell object as provided by the grid's rendering pipeline. */
export interface Cell {
  /** Data type of the column (from schema) or `'canvas-datagrid-cell'` for grids. */
  type: string;
  /** Style category (e.g. `'cell'`, `'activeCell'`, `'columnHeaderCell'`). */
  style: string;
  /** Always `'canvas-datagrid-cell'`. */
  nodeType: string;
  /** X position in canvas pixels. */
  x: number;
  /** Y position in canvas pixels. */
  y: number;
  /** Cell width in canvas pixels. */
  width: number;
  /** Cell height in canvas pixels. */
  height: number;
  /** Font height in canvas pixels. */
  fontHeight: number;
  /** Horizontal text alignment. */
  horizontalAlignment: string;
  /** Vertical text alignment. */
  verticalAlignment: string;
  /** Padding values in canvas pixels. */
  paddingLeft: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  /** CSS white-space value. */
  whiteSpace: string;
  /** Line height multiplier. */
  lineHeight: number;
  /** Line spacing in pixels. */
  lineSpacing: number;
  /** Offset from canvas top. */
  offsetTop: number;
  /** Offset from canvas left. */
  offsetLeft: number;
  /** Current scroll position. */
  scrollTop: number;
  scrollLeft: number;
  /** Whether this cell is the active (focused) cell. */
  active: boolean;
  /** Whether the mouse is hovering over this cell. */
  hovered: boolean;
  /** Whether this cell is selected. */
  selected: boolean;
  offsetWidth: number;
  offsetHeight: number;
  /** The row's data object. */
  data: Record<string, any>;
  /** Whether this is the corner cell. */
  isCorner: boolean;
  /** Whether this is a header cell (column or row). */
  isHeader: boolean;
  /** Whether this is a column header cell. */
  isColumnHeader: boolean;
  /** Whether this is a column header cap cell. */
  isColumnHeaderCellCap: boolean;
  /** Whether this is a row header cell. */
  isRowHeader: boolean;
  /** Whether this column is filterable. */
  isFilterable: boolean;
  /** Whether the filter dropdown is open for this column. */
  openedFilter: boolean;
  /** Whether the row is expanded (tree/detail view). */
  rowOpen: boolean;
  /** The column schema definition for this cell. */
  header: ColumnSchema;
  /** Column index in the current view order. */
  columnIndex: number;
  /** Row index in the current view order. */
  rowIndex: number;
  /** Alias for columnIndex. */
  viewColumnIndex: number;
  /** Alias for rowIndex. */
  viewRowIndex: number;
  /** Row index in the bound (original) data. */
  boundRowIndex: number;
  /** Column index in the bound (original) data. */
  boundColumnIndex: number;
  /** Column index in sort order. */
  sortColumnIndex: number;
  /** Row index in sort order. */
  sortRowIndex: number;
  /** Whether this cell contains a child grid. */
  isGrid: boolean;
  /** Whether this is a normal data cell (not header/corner/grid). */
  isNormal: boolean;
  /** Unique identifier for child grids. */
  gridId: string;
  /** Reference to the parent grid element. */
  parentGrid: HTMLElement;
  /** HTML content to render instead of text. */
  innerHTML: string;
  /** Active header style identifier. */
  activeHeader: string | false;
  /** The cell's display value. */
  value: any;
  /** The formatted display string. */
  formattedValue?: string;
  /** Wrapped text object (after formatting). */
  text?: { height: number; lines: string[] };
}

// ─── Renderer Cell ───────────────────────────────────────────────────────────

/** Cell data passed to column renderer snippets. */
export interface RendererCell {
  /** Unique key for the cell (`"rowIndex:columnIndex"`). */
  key: string;
  /** Column name from the schema. */
  colName: string;
  /** The cell's current value. */
  value: any;
  /** Formatted display value. */
  formattedValue: string;
  /** The full row data object. */
  row: Record<string, any>;
  /** Row index in the data array. */
  rowIndex: number;
  /** Column index. */
  columnIndex: number;
  /** CSS left position in pixels. */
  left: number;
  /** CSS top position in pixels. */
  top: number;
  /** CSS width in pixels. */
  width: number;
  /** CSS height in pixels. */
  height: number;
}

// ─── Grid Events ─────────────────────────────────────────────────────────────

/** Base event object for all grid events. */
export interface GridEvent {
  /** The cell associated with this event (if any). */
  cell?: Cell;
  /** Prevent default grid behavior. */
  preventDefault: () => void;
  /** Stop event propagation. */
  stopPropagation: () => void;
}

/** Event for cell rendering hooks (beforerendercell, rendercell, afterrendercell). */
export interface RenderCellEvent extends GridEvent {
  /** The cell being rendered. */
  cell: Cell;
  /** The canvas 2D rendering context. */
  ctx: CanvasRenderingContext2D;
}

/** Event for text rendering (rendertext, formattext). */
export interface RenderTextEvent extends GridEvent {
  /** The cell whose text is being rendered. */
  cell: Cell;
  /** The canvas 2D rendering context. */
  ctx: CanvasRenderingContext2D;
}

/** Event for cell editing (beginedit, endedit, beforebeginedit, beforeendedit). */
export interface EditEvent extends GridEvent {
  /** The cell being edited. */
  cell: Cell;
  /** The current value. */
  value: any;
  /** The new value (for endedit/beforeendedit). */
  newValue?: any;
  /** The input element used for editing. */
  input?: HTMLInputElement;
}

/** Event for click/mouse interactions. */
export interface CellMouseEvent extends GridEvent {
  /** The cell that was interacted with. */
  cell: Cell;
  /** The original DOM MouseEvent. */
  NativeEvent?: MouseEvent;
}

/** Event for selection changes. */
export interface SelectionChangedEvent extends GridEvent {
  /** Array of selected cell ranges. */
  selections: Array<{
    type: number;
    startRow?: number;
    startColumn?: number;
    endRow?: number;
    endColumn?: number;
  }>;
  /** Map of selected row indices. */
  selectedRows: Record<number, boolean>;
}

/** Event for scroll. */
export interface ScrollEvent extends GridEvent {
  /** Current scroll top position. */
  scrollTop: number;
  /** Current scroll left position. */
  scrollLeft: number;
}

/** Event for column/row resize. */
export interface ResizeEvent extends GridEvent {
  /** The cell/header being resized. */
  cell: Cell;
}

/** Event for data changes. */
export interface DataChangedEvent extends GridEvent {
  /** The data array after the change. */
  data: Record<string, any>[];
}

/** Event for schema changes. */
export interface SchemaChangedEvent extends GridEvent {
  /** The schema array after the change. */
  schema: ColumnSchema[];
}

// ─── Event Handler Map ───────────────────────────────────────────────────────

/** Map of all grid event names to their handler signatures. */
export interface GridEventHandlers {
  onclick?: (e: CellMouseEvent) => void;
  ondblclick?: (e: CellMouseEvent) => void;
  onmousedown?: (e: CellMouseEvent) => void;
  onmouseup?: (e: CellMouseEvent) => void;
  onmousemove?: (e: CellMouseEvent) => void;
  oncontextmenu?: (e: CellMouseEvent) => void;
  oncellmouseover?: (e: CellMouseEvent) => void;
  oncellmouseout?: (e: CellMouseEvent) => void;
  onkeydown?: (e: GridEvent & { NativeEvent?: KeyboardEvent }) => void;
  onkeypress?: (e: GridEvent & { NativeEvent?: KeyboardEvent }) => void;
  onkeyup?: (e: GridEvent & { NativeEvent?: KeyboardEvent }) => void;
  onselectionchanged?: (e: SelectionChangedEvent) => void;
  onscroll?: (e: ScrollEvent) => void;
  onresize?: (e: GridEvent) => void;
  onresizecolumn?: (e: ResizeEvent) => void;
  onresizerow?: (e: ResizeEvent) => void;
  onbeforebeginedit?: (e: EditEvent) => void;
  onbeginedit?: (e: EditEvent) => void;
  onbeforeendedit?: (e: EditEvent) => void;
  onendedit?: (e: EditEvent) => void;
  onbeforerendercell?: (e: RenderCellEvent) => void;
  onrendercell?: (e: RenderCellEvent) => void;
  onafterrendercell?: (e: RenderCellEvent) => void;
  onrendertext?: (e: RenderTextEvent) => void;
  onbeforedraw?: (e: GridEvent) => void;
  onafterdraw?: (e: GridEvent) => void;
  ondatachanged?: (e: DataChangedEvent) => void;
  onschemachanged?: (e: SchemaChangedEvent) => void;
  onordercolumn?: (e: GridEvent & { columnName: string }) => void;
  onreorder?: (e: GridEvent) => void;
  onreordering?: (e: GridEvent) => void;
  oncopy?: (e: GridEvent) => void;
  onnewrow?: (e: GridEvent) => void;
  onwheel?: (e: GridEvent & { NativeEvent?: WheelEvent }) => void;
  ontouchstart?: (e: GridEvent) => void;
  ontouchend?: (e: GridEvent) => void;
  ontouchmove?: (e: GridEvent) => void;
  ontouchcancel?: (e: GridEvent) => void;
  oncollapsetree?: (e: GridEvent) => void;
  onexpandtree?: (e: GridEvent) => void;
  oncolumnhide?: (e: GridEvent) => void;
  oncolumnunhide?: (e: GridEvent) => void;
  onstylechanged?: (e: GridEvent) => void;
  onattributechanged?: (e: GridEvent) => void;
}

// ─── Grid Attributes ─────────────────────────────────────────────────────────

/** Common grid attribute overrides. */
export interface GridAttributes {
  /** Allow cells to be edited. */
  editable?: boolean;
  /** Allow columns to be sorted by clicking headers. */
  allowSorting?: boolean;
  /** Show column filter UI. */
  showFilter?: boolean;
  /** Show row numbers in the row header. */
  showRowNumbers?: boolean;
  /** Show column headers. */
  showColumnHeaders?: boolean;
  /** Show row headers. */
  showRowHeaders?: boolean;
  /** Allow column reordering via drag. */
  allowColumnReordering?: boolean;
  /** Allow column resizing. */
  allowColumnResizing?: boolean;
  /** Allow row resizing. */
  allowRowResizing?: boolean;
  /** Allow multiple cell selection. */
  multiSelect?: boolean;
  /** Enable animated DOM-based cell selection overlay. */
  animatedCellSelection?: boolean;
  /** Animation duration for cell selection transitions (ms). */
  animatedCellSelectionDuration?: number;
  /** Border radius for animated selection overlay (px). */
  animatedCellSelectionBorderRadius?: number;
  /** Selection follows the active cell. */
  selectionFollowsActiveCell?: boolean;
  /** Grid name (used for localStorage persistence). */
  name?: string;
  /** Enable tree/hierarchical grid mode. */
  tree?: boolean;
  /** Save appearance preferences to localStorage. */
  saveAppearance?: boolean;
  /** Additional attributes (pass-through). */
  [key: string]: any;
}

// ─── Cell Style ──────────────────────────────────────────────────────────────

/** Declarative style object returned by the cellStyle function. */
export interface CellStyle {
  /** Cell background color (CSS color string). */
  backgroundColor?: string;
  /** Text color (CSS color string). */
  color?: string;
  /** Full CSS font string (e.g. "bold 14px sans-serif"). Overrides fontWeight. */
  font?: string;
  /** Font weight (e.g. "bold", "600"). Applied as prefix to the existing font. */
  fontWeight?: string;
  /** Line drawn through or under the cell text. Not applied to columns using a custom `columnRenderers` snippet — style those with CSS. */
  textDecoration?: 'none' | 'line-through' | 'underline';
  /** Shorthand for `textDecoration: 'line-through'`. Ignored when `textDecoration` is set. */
  strikethrough?: boolean;
  /** Color of the decoration line (CSS color string). Defaults to the cell's text color. */
  textDecorationColor?: string;
  /** Thickness of the decoration line in CSS pixels. Defaults to a proportion of the font size. */
  textDecorationWidth?: number;
  /** Inset top shadow preset. Creates depth effect where the row above appears to float over this cell. */
  shadow?: 'none' | 'sm' | 'md' | 'lg';
  /** Cell border color (CSS color string). */
  borderColor?: string;
  /** Cell border width in pixels. */
  borderWidth?: number;
  /** Top border. CSS color string or `{ color, width }` object (width in CSS pixels). */
  borderTop?: string | { color?: string; width?: number };
  /** Right border. CSS color string or `{ color, width }` object (width in CSS pixels). */
  borderRight?: string | { color?: string; width?: number };
  /** Bottom border. CSS color string or `{ color, width }` object (width in CSS pixels). */
  borderBottom?: string | { color?: string; width?: number };
  /** Left border. CSS color string or `{ color, width }` object (width in CSS pixels). */
  borderLeft?: string | { color?: string; width?: number };
  /** Left padding in CSS pixels (overrides the grid-wide `cellPaddingLeft` style). */
  paddingLeft?: number;
  /** Right padding in CSS pixels (overrides the grid-wide `cellPaddingRight` style). */
  paddingRight?: number;
  /** Top padding in CSS pixels (overrides the grid-wide `cellPaddingTop` style). */
  paddingTop?: number;
  /** Bottom padding in CSS pixels (overrides the grid-wide `cellPaddingBottom` style). */
  paddingBottom?: number;
}

/** Context object passed to the cellStyle function. */
export interface CellStyleContext {
  /** The cell's current value. */
  value: any;
  /** The full row data object. */
  row: Record<string, any>;
  /** Row index in the data array. */
  rowIndex: number;
  /** Column index. */
  columnIndex: number;
  /** Column name from the schema. */
  colName: string;
  /** The column schema definition. */
  header: ColumnSchema;
}

// ─── Header Renderer Cell ────────────────────────────────────────────────────

/** Cell data passed to column header renderer snippets. */
export interface HeaderRendererCell {
  /** Unique key for the header cell. */
  key: string;
  /** Column name from the schema. */
  colName: string;
  /** Display title for the column. */
  title: string;
  /** Column index. */
  columnIndex: number;
  /** CSS left position in pixels. */
  left: number;
  /** CSS top position in pixels. */
  top: number;
  /** CSS width in pixels. */
  width: number;
  /** CSS height in pixels. */
  height: number;
  /** Current sort direction for this column, or null if not sorted. */
  sortDirection: 'asc' | 'desc' | null;
}

// ─── Component Props ─────────────────────────────────────────────────────────

/** Props for the CanvasDatagrid Svelte component. */
export interface CanvasDatagridProps extends GridAttributes, GridEventHandlers {
  /** Array of row data objects. */
  data?: Record<string, any>[];
  /** Column schema definitions. */
  schema?: ColumnSchema[];
  /** Grid style overrides. */
  style?: Record<string, any>;
  /** Map of column names to Svelte snippet renderers. */
  columnRenderers?: Record<string, Snippet<[RendererCell]>>;
  /** Declarative cell styling function. Receives cell context, returns style overrides. */
  cellStyle?: (context: CellStyleContext) => CellStyle | null | undefined;
  /**
   * Animate rows when data changes (insertions slide in).
   * Pass `true` for defaults (200ms, key='id'), or an object for custom config.
   */
  animateRows?: boolean | { duration?: number; key?: string };
  /**
   * Enable DOM testing mode. Renders transparent DOM elements over each
   * visible cell with data attributes for e2e test selectors:
   * data-testid, data-row, data-col, data-column, data-value, data-header
   */
  testMode?: boolean;
  /** Fill the container height with empty rows when data doesn't fill it. */
  fillHeight?: boolean;
  /** Always append this many extra empty rows after the data (even if data exceeds container). */
  extraRows?: number;
  /** Render column headers as HTML DOM elements instead of canvas-drawn text. */
  htmlHeaders?: boolean;
  /** Map of column names to custom header renderer snippets (requires htmlHeaders). */
  columnHeaderRenderers?: Record<string, Snippet<[HeaderRendererCell]>>;
  /** Custom cell value formatters. */
  formatters?: Record<string, (e: { cell: Cell }) => string>;
  /** Custom column sort functions. */
  sorters?: Record<string, (a: any, b: any) => number>;
  /** Custom column filter functions. */
  filters?: Record<string, (value: any, filterText: string) => boolean>;
  /** Attributes for tree child grids. */
  treeGridAttributes?: Record<string, any>;
  /** Attributes for cell child grids. */
  cellGridAttributes?: Record<string, any>;
  /** Callback for filling new cells. */
  fillCellCallback?: (cell: Cell) => any;
  /**
   * Called when the user scrolls near the bottom of the data.
   * Use this to load the next page / batch of rows for infinite scrolling.
   */
  onRequestData?: (info: { lastVisibleRow: number; totalRows: number }) => void;
  /**
   * Number of rows from the bottom at which `onRequestData` fires.
   * @default 50
   */
  requestDataBuffer?: number;
}
