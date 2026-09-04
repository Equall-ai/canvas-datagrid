<!--
  CanvasDatagrid.svelte - Svelte 5 wrapper for canvas-datagrid

  Usage:
    <script>
      import CanvasDatagrid from 'canvas-datagrid/svelte';

      let grid;
      const data = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ];
      const schema = [
        { name: 'name', type: 'string', width: 200 },
        { name: 'age', type: 'number', width: 100 },
      ];
    </script>

    <CanvasDatagrid
      bind:this={grid}
      {data}
      {schema}
      editable
      style={{ cellHeight: 30 }}
      onclick={(e) => console.log('clicked', e)}
      onselectionchanged={(e) => console.log('selection', e)}
    />

    {#snippet statusRenderer(cell)}
      <select value={cell.value} onchange={(e) => updateStatus(cell, e)}>
        <option>Active</option>
        <option>Inactive</option>
      </select>
    {/snippet}

    <CanvasDatagrid {data} columnRenderers={{ Status: statusRenderer }} />

    <button onclick={() => grid.getGrid().fitColumnToValues('all')}>
      Fit Columns
    </button>

  Props:
    - data: Array of row objects
    - schema: Array of column definitions (name, type, width, etc.)
    - style: Object of grid style overrides (see lib/defaults.js styles)
    - columnRenderers: Object mapping column names to Svelte snippets
      Each snippet receives { value, row, rowIndex, columnIndex, colName }
    - Any canvas-datagrid attribute (editable, allowSorting, showFilter, etc.)
    - Any "on*" prop is forwarded as a grid event listener

  Methods (via bind:this):
    - getGrid(): Returns the raw canvas-datagrid instance
-->
<script module>
  export { default as canvasDatagrid } from '../lib/main.js';
</script>

<script>
  import { onMount, tick } from 'svelte';
  import canvasDatagrid from '../lib/main.js';

  let {
    data = $bindable([]),
    schema = $bindable(undefined),
    style: gridStyle = {},
    columnRenderers = {},
    htmlHeaders = false,
    columnHeaderRenderers = {},
    cellStyle = undefined,
    animateRows = false,
    testMode = false,
    fillHeight = false,
    extraRows = 0,
    formatters = undefined,
    sorters = undefined,
    filters = undefined,
    treeGridAttributes = undefined,
    cellGridAttributes = undefined,
    fillCellCallback = undefined,
    onRequestData = undefined,
    requestDataBuffer = 50,
    ...restProps
  } = $props();

  let container;
  let grid = $state(null);
  let eventCleanups = [];
  let rendererCleanups = [];
  let renderedCells = $state([]);
  let renderedHeaders = $state([]);
  let headerStyles = $state({});
  let testCells = $state([]);
  let frozenColumnPixel = $state(0);

  // Row animation state
  let prevIdSet = new Set();
  let prevData = []; // previous data array for removal reconstruction
  let animatingRows = new Map(); // rowIndex -> { start, duration, from, to }
  let animFrameId = null;
  let pendingRemovalData = null; // deferred data to apply after removal animation
  let skipNextAnimCheck = false;

  function getAnimConfig() {
    if (!animateRows) return null;
    if (animateRows === true) return { duration: 200, key: 'id' };
    return { duration: animateRows.duration || 200, key: animateRows.key || 'id' };
  }

  function animateDataChange(newData, oldIdSet, oldData) {
    if (!grid) return;
    const cfg = getAnimConfig();
    if (!cfg) return;

    const key = cfg.key;
    const cellHeight = grid.style.cellHeight || 25;
    const now = performance.now();

    // Build new ID set
    const newIdSet = new Set();
    for (let i = 0; i < newData.length; i++) {
      const id = newData[i][key];
      if (id != null) newIdSet.add(id);
    }

    // Find inserted IDs
    const insertedIds = new Set();
    for (let i = 0; i < newData.length; i++) {
      const id = newData[i][key];
      if (id != null && !oldIdSet.has(id)) insertedIds.add(id);
    }

    // Find removed IDs
    const removedIdSet = new Set();
    for (const id of oldIdSet) {
      if (!newIdSet.has(id)) removedIdSet.add(id);
    }

    // Clear any in-progress animations
    for (const [idx] of animatingRows) {
      delete grid.sizes.rows[idx];
    }
    animatingRows.clear();

    const hasInsertions = insertedIds.size > 0;
    const hasRemovals = removedIdSet.size > 0;
    if (!hasInsertions && !hasRemovals) return;

    if (hasRemovals) {
      // Reconstruct the old data order: keep all old rows (including removed ones)
      // but with surviving rows updated to their new values
      const newDataById = new Map();
      for (const row of newData) {
        const id = row[key];
        if (id != null) newDataById.set(id, row);
      }

      const mergedData = [];
      const removedIndices = [];
      for (const row of oldData) {
        const id = row[key];
        if (removedIdSet.has(id)) {
          removedIndices.push(mergedData.length);
          mergedData.push(row);
        } else if (newDataById.has(id)) {
          mergedData.push(newDataById.get(id));
          newDataById.delete(id);
        }
      }
      // Append any new rows (insertions) at their correct positions
      // We need to interleave them properly. For simplicity, handle
      // insertions separately after the removal animation.
      for (const row of newData) {
        const id = row[key];
        if (id != null && insertedIds.has(id)) {
          mergedData.push(row);
        }
      }

      skipNextAnimCheck = true;
      grid.data = mergedData;

      for (const idx of removedIndices) {
        grid.sizes.rows[idx] = cellHeight;
        animatingRows.set(idx, {
          start: now,
          duration: cfg.duration,
          from: cellHeight,
          to: 0,
        });
      }

      pendingRemovalData = newData;
    }

    // Handle insertions (only if no removals — otherwise handled after removal completes)
    if (hasInsertions && !hasRemovals) {
      for (let i = 0; i < newData.length; i++) {
        const id = newData[i][key];
        if (id != null && insertedIds.has(id)) {
          grid.sizes.rows[i] = 0.1;
          animatingRows.set(i, {
            start: now,
            duration: cfg.duration,
            from: 0,
            to: cellHeight,
          });
        }
      }
    }

    if (!animFrameId) {
      animFrameId = requestAnimationFrame(animationTick);
    }
  }

  function animationTick(now) {
    if (!grid || animatingRows.size === 0) {
      animFrameId = null;
      applyPendingRemoval();
      return;
    }

    let anyActive = false;
    for (const [idx, anim] of animatingRows) {
      const elapsed = now - anim.start;
      const progress = Math.min(elapsed / anim.duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentHeight = anim.from + eased * (anim.to - anim.from);

      if (progress >= 1) {
        delete grid.sizes.rows[idx];
        animatingRows.delete(idx);
      } else {
        grid.sizes.rows[idx] = Math.max(0.1, currentHeight);
        anyActive = true;
      }
    }

    grid.draw();

    if (anyActive) {
      animFrameId = requestAnimationFrame(animationTick);
    } else {
      animFrameId = null;
      applyPendingRemoval();
    }
  }

  function applyPendingRemoval() {
    if (pendingRemovalData && grid) {
      const finalData = pendingRemovalData;
      pendingRemovalData = null;
      skipNextAnimCheck = true;
      grid.data = buildPaddedData(finalData);
      grid.draw();
    }
  }

  function buildPaddedData(realData) {
    if ((!fillHeight && !extraRows) || !grid || !container) return realData;

    const emptyRow = {};
    if (schema) {
      for (const col of schema) emptyRow[col.name] = '';
    } else if (realData.length > 0) {
      for (const key of Object.keys(realData[0])) emptyRow[key] = '';
    }

    let targetRows = realData.length;

    if (fillHeight) {
      const cellHeight = grid.style.cellHeight || 24;
      const headerHeight = grid.style.columnHeaderCellHeight || 25;
      const containerHeight = container.clientHeight;
      const visibleRows = Math.ceil((containerHeight - headerHeight) / cellHeight);
      targetRows = Math.max(targetRows, visibleRows);
    }

    targetRows += extraRows || 0;

    if (realData.length >= targetRows) return realData;

    const padded = [...realData];
    for (let i = realData.length; i < targetRows; i++) {
      padded.push({ ...emptyRow, __paddingRow: true });
    }
    return padded;
  }

  export function getGrid() {
    return grid;
  }

  function partitionProps(props) {
    const events = {};
    const attrs = {};
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('on') && typeof value === 'function') {
        events[key.slice(2)] = value;
      } else {
        attrs[key] = value;
      }
    }
    return { events, attrs };
  }

  function buildConstructorArgs(attrs) {
    const args = {
      parentNode: container,
      data: data || [],
    };
    if (schema) args.schema = schema;
    if (gridStyle && typeof gridStyle === 'object') args.style = gridStyle;
    if (formatters) args.formatters = formatters;
    if (sorters) args.sorters = sorters;
    if (filters) args.filters = filters;
    if (treeGridAttributes) args.treeGridAttributes = treeGridAttributes;
    if (cellGridAttributes) args.cellGridAttributes = cellGridAttributes;
    if (fillCellCallback) args.fillCellCallback = fillCellCallback;
    Object.assign(args, attrs);
    return args;
  }

  function hasRenderers() {
    return columnRenderers && Object.keys(columnRenderers).length > 0;
  }

  const shadowPresets = {
    none: { height: 0, color: 'rgba(0,0,0,0)' },
    sm: { height: 3, color: 'rgba(0,0,0,0.08)' },
    md: { height: 6, color: 'rgba(0,0,0,0.12)' },
    lg: { height: 10, color: 'rgba(0,0,0,0.18)' },
  };

  function getCellStyleObj(cell) {
    if (!cellStyle) return null;
    return cellStyle({
      value: cell.value,
      row: cell.data,
      rowIndex: cell.rowIndex,
      columnIndex: cell.columnIndex,
      colName: cell.header?.name,
      header: cell.header,
    });
  }

  function handleRenderCell(e) {
    if (!cellStyle) return;
    const cell = e.cell;
    if (!cell || cell.isHeader || cell.isRowHeader || cell.isCorner) return;
    const s = getCellStyleObj(cell);
    if (!s) return;
    const ctx = e.ctx;
    if (s.backgroundColor) ctx.fillStyle = s.backgroundColor;
    if (s.borderColor) ctx.strokeStyle = s.borderColor;
    if (s.borderWidth != null) ctx.lineWidth = s.borderWidth;
    // Per-cell padding overrides. Values are in CSS pixels; the grid expects
    // device pixels, so multiply by scale. paddedWidth/paddedHeight are
    // derived values that must be recomputed when padding changes.
    const scale = grid?.scale || 1;
    let paddingChanged = false;
    if (s.paddingLeft != null) { cell.paddingLeft = s.paddingLeft * scale; paddingChanged = true; }
    if (s.paddingRight != null) { cell.paddingRight = s.paddingRight * scale; paddingChanged = true; }
    if (s.paddingTop != null) { cell.paddingTop = s.paddingTop * scale; paddingChanged = true; }
    if (s.paddingBottom != null) { cell.paddingBottom = s.paddingBottom * scale; paddingChanged = true; }
    if (paddingChanged) {
      cell.paddedWidth = cell.width - cell.paddingRight - cell.paddingLeft;
      cell.paddedHeight = cell.height - cell.paddingTop - cell.paddingBottom;
    }
  }

  function handleAfterRenderCell(e) {
    if (!cellStyle) return;
    const cell = e.cell;
    if (!cell || cell.isHeader || cell.isRowHeader || cell.isCorner) return;
    const s = getCellStyleObj(cell);
    if (!s) return;
    const ctx = e.ctx;
    const scale = grid?.scale || 1;
    const x = cell.offsetLeft;
    const y = cell.offsetTop;
    const w = cell.width;
    const h = cell.height;

    // Inset top shadow
    if (s.shadow && s.shadow !== 'none') {
      const preset = shadowPresets[s.shadow] || shadowPresets.none;
      if (preset.height) {
        const sh = preset.height * scale;
        const grad = ctx.createLinearGradient(0, y, 0, y + sh);
        grad.addColorStop(0, preset.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, sh);
        ctx.restore();
      }
    }

    // Per-side borders. Each side accepts either a CSS color string
    // (e.g. "#ff0000") or an object { color, width }.
    if (s.borderTop || s.borderRight || s.borderBottom || s.borderLeft) {
      ctx.save();
      drawSideBorder(ctx, s.borderTop, x, y, w, scale, 'top');
      drawSideBorder(ctx, s.borderBottom, x, y + h, w, scale, 'top');
      drawSideBorder(ctx, s.borderLeft, x, y, h, scale, 'left');
      drawSideBorder(ctx, s.borderRight, x + w, y, h, scale, 'left');
      ctx.restore();
    }
  }

  function drawSideBorder(ctx, spec, ax, ay, length, scale, axis) {
    if (!spec) return;
    const color = typeof spec === 'string' ? spec : spec.color || '#000';
    const widthPx = (typeof spec === 'object' && spec.width != null ? spec.width : 1) * scale;
    ctx.fillStyle = color;
    if (axis === 'top') {
      // horizontal stroke at (ax, ay), width=length, height=widthPx
      ctx.fillRect(ax, ay - widthPx / 2, length, widthPx);
    } else {
      // vertical stroke at (ax, ay), width=widthPx, height=length
      ctx.fillRect(ax - widthPx / 2, ay, widthPx, length);
    }
  }

  function handleRenderText(e) {
    const cell = e.cell;
    if (!cell) return;
    // Suppress header text when htmlHeaders is enabled
    if (htmlHeaders && cell.isColumnHeader && !cell.isRowHeader && !cell.isCorner) {
      e.preventDefault();
      return;
    }
    // Suppress cell text for custom column renderers
    if (hasRenderers() && !cell.isHeader && !cell.isRowHeader && !cell.isCorner) {
      const colName = cell.header?.name;
      if (colName && columnRenderers[colName]) {
        e.preventDefault();
        return;
      }
    }
    // Apply cellStyle text overrides
    if (cellStyle && !cell.isHeader && !cell.isRowHeader && !cell.isCorner) {
      const s = getCellStyleObj(cell);
      if (s) {
        const ctx = e.ctx;
        if (s.color) ctx.fillStyle = s.color;
        if (s.font) {
          ctx.font = s.font;
        } else if (s.fontWeight) {
          ctx.font = s.fontWeight + ' ' + ctx.font;
        }
        // Text decoration is drawn by drawText(), which runs after this event
        // and owns the per-line geometry (wrapping, alignment, ellipsis). We
        // only flag the cell; `strikethrough: true` is sugar for line-through.
        const deco =
          s.textDecoration || (s.strikethrough ? 'line-through' : null);
        if (deco) {
          cell.textDecoration = deco;
          if (s.textDecorationColor)
            cell.textDecorationColor = s.textDecorationColor;
          if (s.textDecorationWidth != null)
            cell.textDecorationWidth = s.textDecorationWidth;
        }
      }
    }
  }

  function getHeaderStyles() {
    if (!grid) return {};
    const s = grid.style;
    return {
      backgroundColor: s.columnHeaderCellBackgroundColor || 'rgba(240, 240, 240, 1)',
      borderColor: s.columnHeaderCellBorderColor || 'rgba(172, 172, 172, 1)',
      borderWidth: (s.columnHeaderCellBorderWidth ?? 1) + 'px',
      color: s.columnHeaderCellColor || 'rgba(50, 50, 50, 1)',
      font: s.columnHeaderCellFont || '16px sans-serif',
      paddingLeft: (s.columnHeaderCellPaddingLeft ?? 5) + 'px',
      paddingRight: (s.columnHeaderCellPaddingRight ?? 5) + 'px',
      paddingTop: (s.columnHeaderCellPaddingTop ?? 5) + 'px',
      paddingBottom: (s.columnHeaderCellPaddingBottom ?? 5) + 'px',
      textAlign: s.columnHeaderCellHorizontalAlignment || 'left',
      hoverBackgroundColor: s.columnHeaderCellHoverBackgroundColor || 'rgba(235, 235, 235, 1)',
      hoverColor: s.columnHeaderCellHoverColor || 'rgba(0, 0, 0, 1)',
    };
  }

  // Right edge of the pinned (frozen) column block in CSS px (0 when no
  // frozen columns).  Non-frozen cells scroll underneath the pinned block on
  // the canvas, so overlay divs for them must be clipped at this boundary or
  // they paint across the frozen columns.
  //
  // Read from the engine (grid.frozenColumnPixel, set by its draw pass in the
  // same coordinate space as visibleCells x values) rather than re-derived by
  // scanning visibleCells: the scan broke once scrolled because the header
  // end-cap filler cell carries columnIndex -1, which passes any
  // `columnIndex < frozenColumn` filter and pushed the boundary to the far
  // right of the container, blanking every overlay cell.
  function getFrozenRightPixel() {
    if (!grid || !(grid.frozenColumn > 0)) return 0;
    return (grid.frozenColumnPixel || 0) / (grid.scale || 1);
  }

  // Boundary for clipping overlay cells.  Hard invariant: at horizontal
  // scroll 0 nothing can be behind the pinned block, so never clip or skip.
  function getFrozenClipBoundary() {
    if (!grid || !(grid.scrollLeft > 0)) return 0;
    return getFrozenRightPixel();
  }

  function updateHeaderOverlays() {
    if (!grid || !htmlHeaders) {
      renderedHeaders = [];
      return;
    }
    const cells = grid.visibleCells;
    if (!cells) {
      renderedHeaders = [];
      return;
    }
    const scale = grid.scale || 1;
    const frozenRight = getFrozenClipBoundary();
    const newHeaders = [];
    const seenHeaders = new Set();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (!cell.isColumnHeader || cell.isRowHeader || cell.isCorner || cell.isColumnHeaderCellCap) continue;
      const colName = cell.header?.name;
      if (!colName) continue;
      const headerKey = 'h:' + cell.columnIndex;
      if (seenHeaders.has(headerKey)) continue;
      seenHeaders.add(headerKey);
      const left = cell.x / scale;
      const width = cell.width / scale;
      const frozen = grid.frozenColumn > 0 && cell.columnIndex < grid.frozenColumn;
      // Clip non-frozen headers at the frozen boundary; skip ones fully
      // behind the frozen block.
      let clipLeft = 0;
      if (!frozen && left < frozenRight) {
        clipLeft = frozenRight - left;
        if (clipLeft >= width) continue;
      }
      newHeaders.push({
        key: headerKey,
        colName,
        title: cell.header?.title || colName,
        columnIndex: cell.columnIndex,
        left,
        top: cell.y / scale,
        width,
        height: cell.height / scale,
        clipLeft,
        sortDirection: grid.orderBy === colName ? grid.orderDirection : null,
        frozen,
      });
    }
    headerStyles = getHeaderStyles();
    renderedHeaders = newHeaders;
  }

  function handleHeaderClick(header) {
    if (!grid) return;
    const currentDir = grid.orderBy === header.colName ? grid.orderDirection : null;
    grid.order(header.colName, currentDir === 'asc' ? 'desc' : 'asc');
  }

  function updateRendererOverlays() {
    if (!grid || !hasRenderers()) {
      renderedCells = [];
      return;
    }
    const cells = grid.visibleCells;
    if (!cells) {
      renderedCells = [];
      return;
    }
    const scale = grid.scale || 1;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const frozenRight = getFrozenClipBoundary();
    const newCells = [];
    const seen = new Set();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.isHeader || cell.isRowHeader || cell.isCorner) continue;
      const colName = cell.header?.name;
      if (colName && columnRenderers[colName]) {
        const cellKey = cell.rowIndex + ':' + cell.columnIndex;
        if (seen.has(cellKey)) continue;
        seen.add(cellKey);
        const left = cell.x / scale;
        const top = cell.y / scale;
        const clippedWidth = Math.min(cell.width / scale, containerWidth - left);
        const clippedHeight = Math.min(cell.height / scale, containerHeight - top);
        if (clippedWidth <= 0 || clippedHeight <= 0) continue;
        const frozen = grid.frozenColumn > 0 && cell.columnIndex < grid.frozenColumn;
        // Clip non-frozen cells at the frozen boundary; skip ones fully
        // behind the frozen block.  clip-path hides the overlapping strip
        // without shifting the cell, so its content stays aligned to its
        // own column.
        let clipLeft = 0;
        if (!frozen && left < frozenRight) {
          clipLeft = frozenRight - left;
          if (clipLeft >= clippedWidth) continue;
        }
        newCells.push({
          key: cellKey,
          colName,
          value: cell.value,
          formattedValue: cell.formattedValue,
          row: cell.data,
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex,
          left,
          top,
          width: clippedWidth,
          height: clippedHeight,
          clipLeft,
          frozen,
        });
      }
    }
    renderedCells = newCells;
  }

  function updateTestOverlays() {
    if (!grid || !testMode) {
      testCells = [];
      return;
    }
    const cells = grid.visibleCells;
    if (!cells) { testCells = []; return; }
    const scale = grid.scale || 1;
    const newTestCells = [];
    const seenTest = new Set();
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.isCorner || cell.rowIndex === undefined || cell.columnIndex === undefined) continue;
      const testKey = (cell.isColumnHeader ? 'h' : cell.isRowHeader ? 'rh' : 'c') + ':' + cell.rowIndex + ':' + cell.columnIndex;
      if (seenTest.has(testKey)) continue;
      seenTest.add(testKey);
      newTestCells.push({
        key: testKey,
        left: cell.x / scale,
        top: cell.y / scale,
        width: cell.width / scale,
        height: cell.height / scale,
        rowIndex: cell.rowIndex,
        columnIndex: cell.columnIndex,
        colName: cell.header?.name || '',
        value: cell.value != null ? String(cell.value) : '',
        isHeader: cell.isColumnHeader || false,
        isRowHeader: cell.isRowHeader || false,
      });
    }
    testCells = newTestCells;
  }

  function handleAfterDraw() {
    updateRendererOverlays();
    updateHeaderOverlays();
    updateTestOverlays();
    // The frozen shadow tracks the pinned edge itself, so it uses the
    // unconditional boundary (visible at scroll 0 too).
    frozenColumnPixel = getFrozenRightPixel();
  }

  function getCanvasEl() {
    if (!container) return null;
    return container.querySelector('canvas-datagrid')?.shadowRoot?.querySelector('canvas')
      || container.querySelector('canvas');
  }

  function forwardMouseEvent(type, e) {
    const canvas = getCanvasEl();
    if (!canvas) return;
    canvas.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      buttons: e.buttons,
    }));
  }

  function handleHeaderResizeStart(e) {
    // Synthesize a mousemove + mousedown on the canvas so the grid's
    // native column-resize drag logic takes over.
    e.preventDefault();
    e.stopPropagation();
    forwardMouseEvent('mousemove', e);
    forwardMouseEvent('mousedown', e);
  }

  function handleHeaderResizeDblClick(e, header) {
    // Fit the column to its content on double-click of the resize handle
    e.preventDefault();
    e.stopPropagation();
    if (grid && header?.colName) {
      grid.fitColumnToValues(header.colName);
    }
  }

  function preventBackGesture(e) {
    // Prevent horizontal scroll from triggering browser back/forward navigation
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
    }
  }

  function forwardWheel(e) {
    if (!grid) return;
    const canvas = container.querySelector('canvas-datagrid')?.shadowRoot?.querySelector('canvas')
      || container.querySelector('canvas');
    if (canvas) {
      canvas.dispatchEvent(new WheelEvent('wheel', e));
      e.preventDefault();
    }
  }

  onMount(() => {
    const { events, attrs } = partitionProps(restProps);

    grid = canvasDatagrid(buildConstructorArgs(attrs));

    grid.style.height = '100%';
    grid.style.width = '100%';

    // Prevent horizontal scroll from triggering browser back/forward gesture
    container.addEventListener('wheel', preventBackGesture, { passive: false });

    // Suppress the default context menu
    container.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });


    for (const [eventName, handler] of Object.entries(events)) {
      grid.addEventListener(eventName, handler);
      eventCleanups.push(() => grid.removeEventListener(eventName, handler));
    }

    if (hasRenderers() || htmlHeaders || cellStyle) {
      grid.addEventListener('rendertext', handleRenderText);
      rendererCleanups.push(
        () => grid.removeEventListener('rendertext', handleRenderText),
      );
    }

    if (hasRenderers() || htmlHeaders || testMode) {
      grid.addEventListener('afterdraw', handleAfterDraw);
      rendererCleanups.push(
        () => grid.removeEventListener('afterdraw', handleAfterDraw),
      );
    }

    if (cellStyle) {
      grid.addEventListener('rendercell', handleRenderCell);
      grid.addEventListener('afterrendercell', handleAfterRenderCell);
      rendererCleanups.push(
        () => grid.removeEventListener('rendercell', handleRenderCell),
        () => grid.removeEventListener('afterrendercell', handleAfterRenderCell),
      );
    }

    return () => {
      eventCleanups.forEach((fn) => fn());
      eventCleanups = [];
      rendererCleanups.forEach((fn) => fn());
      rendererCleanups = [];
      renderedCells = [];
      renderedHeaders = [];
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      animatingRows.clear();
      container?.removeEventListener('wheel', preventBackGesture);
      if (grid && grid.dispose) {
        grid.dispose();
      }
    };
  });

  $effect(() => {
    if (grid && data) {
      const cfg = getAnimConfig();
      const oldIdSet = prevIdSet;
      const oldDataArr = prevData;

      // Update tracking state
      if (cfg) {
        const newSet = new Set();
        for (let i = 0; i < data.length; i++) {
          const id = data[i][cfg.key];
          if (id != null) newSet.add(id);
        }
        prevIdSet = newSet;
        prevData = data;
      }

      if (skipNextAnimCheck) {
        skipNextAnimCheck = false;
        return;
      }

      grid.data = buildPaddedData(data);

      if (cfg && oldIdSet.size > 0) {
        animateDataChange(data, oldIdSet, oldDataArr);
      }
    }
  });

  $effect(() => {
    if (grid && schema) {
      grid.schema = schema;
    }
  });

  $effect(() => {
    if (grid && gridStyle && typeof gridStyle === 'object') {
      for (const [k, v] of Object.entries(gridStyle)) {
        grid.style[k] = v;
      }
    }
  });

  $effect(() => {
    if (!grid) return;
    const { attrs } = partitionProps(restProps);
    for (const [k, v] of Object.entries(attrs)) {
      // Some properties (frozenColumn, frozenRow) are top-level grid
      // properties, not attributes. Check the grid interface first.
      if (k in grid) {
        grid[k] = v;
      } else {
        grid.attributes[k] = v;
      }
    }
  });

  $effect(() => {
    if (!grid) return;
    const { events } = partitionProps(restProps);
    eventCleanups.forEach((fn) => fn());
    eventCleanups = [];
    for (const [eventName, handler] of Object.entries(events)) {
      grid.addEventListener(eventName, handler);
      eventCleanups.push(() => grid.removeEventListener(eventName, handler));
    }
  });

  $effect(() => {
    if (!grid) return;
    rendererCleanups.forEach((fn) => fn());
    rendererCleanups = [];

    if (hasRenderers() || htmlHeaders || cellStyle) {
      grid.addEventListener('rendertext', handleRenderText);
      rendererCleanups.push(
        () => grid.removeEventListener('rendertext', handleRenderText),
      );
    }

    if (hasRenderers() || htmlHeaders || testMode) {
      grid.addEventListener('afterdraw', handleAfterDraw);
      rendererCleanups.push(
        () => grid.removeEventListener('afterdraw', handleAfterDraw),
      );
      updateRendererOverlays();
      updateHeaderOverlays();
      updateTestOverlays();
      if (testMode) grid.draw();
    } else {
      renderedCells = [];
      renderedHeaders = [];
    }

    if (cellStyle) {
      grid.addEventListener('rendercell', handleRenderCell);
      grid.addEventListener('afterrendercell', handleAfterRenderCell);
      rendererCleanups.push(
        () => grid.removeEventListener('rendercell', handleRenderCell),
        () => grid.removeEventListener('afterrendercell', handleAfterRenderCell),
      );
    }
  });

  // Resize grid when container size changes.
  // Uses $effect so the observer is set up after the grid is fully initialized.
  $effect(() => {
    if (!grid || !container) return;
    const resizeObserver = new ResizeObserver(() => {
      window.dispatchEvent(new Event('resize'));
      if ((fillHeight || extraRows) && data) {
        grid.data = buildPaddedData(data);
      }
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  });

  // Infinite scroll: fire onRequestData when scrolled near the bottom.
  let _requestDataFiredForLength = -1;
  $effect(() => {
    if (!grid || !onRequestData) return;
    function onScroll() {
      const totalRows = (grid.viewData || []).length;
      const lastVisible = grid.scrollIndexRect?.bottom ?? 0;
      if (totalRows > 0 && lastVisible >= totalRows - requestDataBuffer) {
        if (_requestDataFiredForLength === totalRows) return;
        _requestDataFiredForLength = totalRows;
        onRequestData({ lastVisibleRow: lastVisible, totalRows });
      }
    }
    grid.addEventListener('scroll', onScroll);
    // Also check after draw in case initial data is short enough to trigger
    grid.addEventListener('afterdraw', onScroll);
    return () => {
      grid.removeEventListener('scroll', onScroll);
      grid.removeEventListener('afterdraw', onScroll);
    };
  });
</script>

<div bind:this={container} class="canvas-datagrid-container">
  {#if renderedCells.length > 0}
    <div class="cdg-renderer-overlay" onwheel={forwardWheel}>
      {#each renderedCells as cell (cell.key)}
        <!-- renderedCells only refreshes on the next 'afterdraw', but this
             template re-renders as soon as the columnRenderers prop changes.
             When the host removes renderers at runtime, stale cells would
             {@render undefined(cell)} for a frame, which throws and wedges
             the overlay — so guard until the next draw prunes them. -->
        {#if columnRenderers[cell.colName]}
          <div
            class="cdg-renderer-cell"
            style="left:{cell.left}px;top:{cell.top}px;width:{cell.width}px;height:{cell.height}px;{cell.frozen ? 'z-index:1;' : ''}{cell.clipLeft > 0 ? `clip-path:inset(0 0 0 ${cell.clipLeft}px);` : ''}"
          >
            {@render columnRenderers[cell.colName](cell)}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
  {#if renderedHeaders.length > 0}
    <div class="cdg-header-overlay">
      {#each renderedHeaders as header (header.key)}
        <button
          class="cdg-header-cell"
          style="left:{header.left}px;top:{header.top}px;width:{header.width}px;height:{header.height}px;background:{headerStyles.backgroundColor};color:{headerStyles.color};font:{headerStyles.font};text-align:{headerStyles.textAlign};padding:{headerStyles.paddingTop} {headerStyles.paddingRight} {headerStyles.paddingBottom} {headerStyles.paddingLeft};border:none;border-right:{headerStyles.borderWidth} solid {headerStyles.borderColor};border-bottom:{headerStyles.borderWidth} solid {headerStyles.borderColor};{header.frozen ? 'z-index:1;' : ''}{header.clipLeft > 0 ? `clip-path:inset(0 0 0 ${header.clipLeft}px);` : ''}"
          onclick={() => handleHeaderClick(header)}
        >
          {#if columnHeaderRenderers[header.colName]}
            {@render columnHeaderRenderers[header.colName](header)}
          {:else}
            <span class="cdg-header-text">{header.title}</span>
            {#if header.sortDirection}
              <span class="cdg-header-sort">{header.sortDirection === 'asc' ? '▲' : '▼'}</span>
            {/if}
          {/if}
        </button>
        {#if header.clipLeft <= header.width - 4}
          <!-- The 8px handle starts 4px left of the column edge; skip it when
               that would reach into the frozen block. -->
          <div
            class="cdg-header-resize"
            style="left:{header.left + header.width - 4}px;top:{header.top}px;height:{header.height}px;{header.frozen ? 'z-index:2;' : ''}"
            onmousedown={handleHeaderResizeStart}
            ondblclick={(e) => handleHeaderResizeDblClick(e, header)}
          ></div>
        {/if}
      {/each}
    </div>
  {/if}
  {#if testCells.length > 0}
    <div class="cdg-test-overlay" onwheel={forwardWheel}>
      {#each testCells as cell (cell.key)}
        <div
          class="cdg-test-cell"
          data-testid={cell.isHeader ? `header-${cell.colName}` : cell.isRowHeader ? `row-header-${cell.rowIndex}` : `cell-${cell.rowIndex}-${cell.columnIndex}`}
          data-row={cell.rowIndex}
          data-col={cell.columnIndex}
          data-column={cell.colName}
          data-value={cell.value}
          data-header={cell.isHeader || undefined}
          data-row-header={cell.isRowHeader || undefined}
          style="left:{cell.left}px;top:{cell.top}px;width:{cell.width}px;height:{cell.height}px;"
        >{cell.value}</div>
      {/each}
    </div>
  {/if}
  {#if frozenColumnPixel > 0}
    <div class="cdg-frozen-shadow" style="left:{frozenColumnPixel}px;"></div>
  {/if}
</div>

<style>
  .canvas-datagrid-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    overscroll-behavior-x: none;
    touch-action: none;
  }

  .cdg-renderer-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
    overflow: hidden;
  }

  .cdg-renderer-cell {
    position: absolute;
    overflow: hidden;
    pointer-events: auto;
    display: flex;
    align-items: center;
    box-sizing: border-box;
  }

  .cdg-header-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2;
    overflow: hidden;
  }

  .cdg-header-cell {
    position: absolute;
    overflow: hidden;
    pointer-events: auto;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    cursor: pointer;
    outline: none;
    margin: 0;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .cdg-header-resize {
    position: absolute;
    width: 8px;
    pointer-events: auto;
    cursor: ew-resize;
    user-select: none;
    z-index: 1;
  }

  .cdg-header-cell:hover {
    filter: brightness(0.97);
  }

  .cdg-header-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cdg-header-sort {
    margin-left: 4px;
    font-size: 0.7em;
    opacity: 0.6;
  }

  .cdg-test-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 3;
    overflow: hidden;
  }

  .cdg-test-cell {
    position: absolute;
    pointer-events: none;
    background: transparent;
    color: transparent;
    box-sizing: border-box;
    overflow: hidden;
    font-size: 0;
  }

  .cdg-frozen-shadow {
    position: absolute;
    top: 0;
    width: 6px;
    height: 100%;
    pointer-events: none;
    z-index: 3;
    background: linear-gradient(to right, rgba(0, 0, 0, 0.06), transparent);
  }
</style>
