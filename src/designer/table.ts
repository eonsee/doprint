import type {
  TableAlign,
  TableCell,
  TableConfig,
  TableMerge,
  TableVAlign,
} from './types'
import { DEFAULT_FONT_PX, PX_TO_MM, clamp, round } from './units'

export const TABLE_LIMITS = {
  minRows: 1,
  maxRows: 50,
  minCols: 1,
  maxCols: 20,
}

export const DEFAULT_TABLE = {
  rows: 3,
  cols: 3,
  rowHeight: 9,
  colWidth: 35,
  fontSize: DEFAULT_FONT_PX * PX_TO_MM,
  fontFamily: 'SimSun',
  color: '#111827',
  borderColor: '#4b5563',
  borderWidth: 0.2,
  padding: 1.5,
  background: '#ffffff',
  headerFill: '#f3f4f6',
}

export interface TableRange {
  row: number
  col: number
  endRow: number
  endCol: number
}

export interface TableRegion extends TableMerge {
  x: number
  y: number
  width: number
  height: number
}

function clampRows(value: unknown): number {
  return clamp(
    Math.round(Number(value) || DEFAULT_TABLE.rows),
    TABLE_LIMITS.minRows,
    TABLE_LIMITS.maxRows,
  )
}

function clampCols(value: unknown): number {
  return clamp(
    Math.round(Number(value) || DEFAULT_TABLE.cols),
    TABLE_LIMITS.minCols,
    TABLE_LIMITS.maxCols,
  )
}

export function defaultCell(row = 1): TableCell {
  if (row === 0) {
    return {
      text: '',
      align: 'center',
      valign: 'middle',
      bold: true,
      fill: DEFAULT_TABLE.headerFill,
    }
  }
  return { text: '', align: 'left', valign: 'middle' }
}

export function sanitizeCell(input: unknown, row = 1): TableCell {
  const raw = (input && typeof input === 'object' ? input : {}) as TableCell
  const cell: TableCell = {}
  if (typeof raw.text === 'string') cell.text = raw.text
  if (raw.align === 'left' || raw.align === 'center' || raw.align === 'right') {
    cell.align = raw.align
  }
  if (
    raw.valign === 'top' ||
    raw.valign === 'middle' ||
    raw.valign === 'bottom'
  ) {
    cell.valign = raw.valign
  }
  if (raw.bold === true) cell.bold = true
  if (typeof raw.fill === 'string' && raw.fill) cell.fill = raw.fill
  if (typeof raw.color === 'string' && raw.color) cell.color = raw.color
  // Store only hidden sides: a missing flag means the border is visible.
  if (raw.borderTop === false) cell.borderTop = false
  if (raw.borderRight === false) cell.borderRight = false
  if (raw.borderBottom === false) cell.borderBottom = false
  if (raw.borderLeft === false) cell.borderLeft = false
  // Normalise an entirely empty cell to a fresh default.
  if (!Object.keys(cell).length) {
    return row === 0
      ? { align: 'center', valign: 'middle', bold: true, fill: DEFAULT_TABLE.headerFill }
      : { align: 'left', valign: 'middle' }
  }
  return cell
}

function cloneCell(cell: TableCell | undefined, row: number): TableCell {
  return sanitizeCell(cell ? { ...cell } : defaultCell(row), row) as TableCell
}

export function cloneTableConfig(config: TableConfig): TableConfig {
  return JSON.parse(JSON.stringify(config)) as TableConfig
}

export function createTableConfig(
  rows = DEFAULT_TABLE.rows,
  cols = DEFAULT_TABLE.cols,
  width?: number,
  height?: number,
): TableConfig {
  const rowCount = clampRows(rows)
  const colCount = clampCols(cols)
  const rowHeight = height
    ? Math.max(1, round(height / rowCount, 2))
    : DEFAULT_TABLE.rowHeight
  const colWidth = width
    ? Math.max(2, round(width / colCount, 2))
    : DEFAULT_TABLE.colWidth
  return {
    rows: rowCount,
    cols: colCount,
    rowHeights: Array.from({ length: rowCount }, () => rowHeight),
    colWidths: Array.from({ length: colCount }, () => colWidth),
    cells: Array.from({ length: rowCount }, (_, row) =>
      Array.from({ length: colCount }, () => cloneCell(defaultCell(row), row)),
    ),
    merges: [],
    fontSize: DEFAULT_TABLE.fontSize,
    fontFamily: DEFAULT_TABLE.fontFamily,
    color: DEFAULT_TABLE.color,
    borderColor: DEFAULT_TABLE.borderColor,
    borderWidth: DEFAULT_TABLE.borderWidth,
    padding: DEFAULT_TABLE.padding,
    background: DEFAULT_TABLE.background,
  }
}

/** Validate a table config coming from storage / import and fill defaults. */
export function normalizeTableConfig(input: unknown): TableConfig {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<TableConfig>
  const rows = clampRows(raw.rows)
  const cols = clampCols(raw.cols)

  const rowHeights = Array.from({ length: rows }, (_, index) => {
    const value = Number(raw.rowHeights?.[index])
    return Number.isFinite(value) && value > 0
      ? round(clamp(value, 0.5, 500), 2)
      : DEFAULT_TABLE.rowHeight
  })
  const colWidths = Array.from({ length: cols }, (_, index) => {
    const value = Number(raw.colWidths?.[index])
    return Number.isFinite(value) && value > 0
      ? round(clamp(value, 0.5, 1000), 2)
      : DEFAULT_TABLE.colWidth
  })

  const cells = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) =>
      cloneCell(raw.cells?.[row]?.[col] as TableCell | undefined, row),
    ),
  )

  // Reject merges that are out of bounds or overlap an already accepted merge.
  const merges: TableMerge[] = []
  const seen = new Set<string>()
  for (const candidate of raw.merges ?? []) {
    if (!candidate) continue
    const row = Math.round(Number(candidate.row))
    const col = Math.round(Number(candidate.col))
    const rowSpan = Math.round(Number(candidate.rowSpan))
    const colSpan = Math.round(Number(candidate.colSpan))
    if (
      !Number.isFinite(row) ||
      !Number.isFinite(col) ||
      !Number.isFinite(rowSpan) ||
      !Number.isFinite(colSpan)
    ) {
      continue
    }
    if (row < 0 || col < 0) continue
    if (rowSpan < 1 || colSpan < 1) continue
    if (row + rowSpan > rows || col + colSpan > cols) continue
    if (rowSpan === 1 && colSpan === 1) continue
    let overlaps = false
    for (let r = row; r < row + rowSpan && !overlaps; r += 1) {
      for (let c = col; c < col + colSpan; c += 1) {
        if (seen.has(`${r},${c}`)) {
          overlaps = true
          break
        }
      }
    }
    if (overlaps) continue
    for (let r = row; r < row + rowSpan; r += 1) {
      for (let c = col; c < col + colSpan; c += 1) seen.add(`${r},${c}`)
    }
    merges.push({ row, col, rowSpan, colSpan })
  }
  merges.sort((a, b) => a.row - b.row || a.col - b.col)

  return {
    rows,
    cols,
    rowHeights,
    colWidths,
    cells,
    merges,
    fontSize: Number.isFinite(Number(raw.fontSize))
      ? round(clamp(Number(raw.fontSize), 0.5, 300 * PX_TO_MM), 2)
      : DEFAULT_TABLE.fontSize,
    fontFamily:
      typeof raw.fontFamily === 'string' && raw.fontFamily
        ? raw.fontFamily
        : DEFAULT_TABLE.fontFamily,
    color:
      typeof raw.color === 'string' && raw.color
        ? raw.color
        : DEFAULT_TABLE.color,
    borderColor:
      typeof raw.borderColor === 'string' && raw.borderColor
        ? raw.borderColor
        : DEFAULT_TABLE.borderColor,
    borderWidth: Number.isFinite(Number(raw.borderWidth))
      ? round(clamp(Number(raw.borderWidth), 0, 5), 2)
      : DEFAULT_TABLE.borderWidth,
    padding: Number.isFinite(Number(raw.padding))
      ? round(clamp(Number(raw.padding), 0, 20), 2)
      : DEFAULT_TABLE.padding,
    background:
      typeof raw.background === 'string' && raw.background
        ? raw.background
        : DEFAULT_TABLE.background,
  }
}

export function getTableWidth(config: TableConfig): number {
  return round(
    config.colWidths.reduce((sum, value) => sum + value, 0),
    2,
  )
}

export function getTableHeight(config: TableConfig): number {
  return round(
    config.rowHeights.reduce((sum, value) => sum + value, 0),
    2,
  )
}

export function getTableSize(config: TableConfig): { width: number; height: number } {
  return { width: getTableWidth(config), height: getTableHeight(config) }
}

function axisOffsets(sizes: number[]): number[] {
  const offsets = [0]
  for (let index = 0; index < sizes.length; index += 1) {
    offsets.push(round(offsets[index] + sizes[index], 4))
  }
  return offsets
}

/** All visible regions, including merged cells at their anchor position. */
export function buildRegions(config: TableConfig): TableRegion[] {
  const xs = axisOffsets(config.colWidths)
  const ys = axisOffsets(config.rowHeights)
  const mergeAt = new Map<string, TableMerge>()
  for (const merge of config.merges) {
    for (let row = merge.row; row < merge.row + merge.rowSpan; row += 1) {
      for (let col = merge.col; col < merge.col + merge.colSpan; col += 1) {
        mergeAt.set(`${row},${col}`, merge)
      }
    }
  }

  const regions: TableRegion[] = []
  for (let row = 0; row < config.rows; row += 1) {
    for (let col = 0; col < config.cols; col += 1) {
      const merge = mergeAt.get(`${row},${col}`)
      if (merge && (merge.row !== row || merge.col !== col)) continue
      const rowSpan = merge?.rowSpan ?? 1
      const colSpan = merge?.colSpan ?? 1
      regions.push({
        row,
        col,
        rowSpan,
        colSpan,
        x: xs[col],
        y: ys[row],
        width: round(xs[col + colSpan] - xs[col], 4),
        height: round(ys[row + rowSpan] - ys[row], 4),
      })
    }
  }
  return regions
}

export function normalizeRange(range: TableRange): TableRange {
  return {
    row: Math.min(range.row, range.endRow),
    col: Math.min(range.col, range.endCol),
    endRow: Math.max(range.row, range.endRow),
    endCol: Math.max(range.col, range.endCol),
  }
}

export function rangeCellCount(range: TableRange): number {
  const normalized = normalizeRange(range)
  return (
    (normalized.endRow - normalized.row + 1) *
    (normalized.endCol - normalized.col + 1)
  )
}

export function mergeIntersectsRange(merge: TableMerge, range: TableRange): boolean {
  const normalized = normalizeRange(range)
  return !(
    merge.row + merge.rowSpan - 1 < normalized.row ||
    merge.row > normalized.endRow ||
    merge.col + merge.colSpan - 1 < normalized.col ||
    merge.col > normalized.endCol
  )
}

/** Grow a selection until it fully contains every merged region it touches. */
export function expandRangeToMerges(
  config: TableConfig,
  range: TableRange,
): TableRange {
  const normalized = normalizeRange(range)
  let { row, col, endRow, endCol } = normalized
  let changed = true
  while (changed) {
    changed = false
    for (const merge of config.merges) {
      if (
        !mergeIntersectsRange(merge, { row, col, endRow, endCol })
      ) {
        continue
      }
      const nextRow = Math.min(row, merge.row)
      const nextCol = Math.min(col, merge.col)
      const nextEndRow = Math.max(endRow, merge.row + merge.rowSpan - 1)
      const nextEndCol = Math.max(endCol, merge.col + merge.colSpan - 1)
      if (
        nextRow !== row ||
        nextCol !== col ||
        nextEndRow !== endRow ||
        nextEndCol !== endCol
      ) {
        row = nextRow
        col = nextCol
        endRow = nextEndRow
        endCol = nextEndCol
        changed = true
      }
    }
  }
  return { row, col, endRow, endCol }
}

export function rangeToMerge(range: TableRange): TableMerge {
  const normalized = normalizeRange(range)
  return {
    row: normalized.row,
    col: normalized.col,
    rowSpan: normalized.endRow - normalized.row + 1,
    colSpan: normalized.endCol - normalized.col + 1,
  }
}

export function mergeRegion(config: TableConfig, range: TableRange): TableConfig {
  const expanded = expandRangeToMerges(config, range)
  if (rangeCellCount(expanded) <= 1) return cloneTableConfig(config)
  const next = cloneTableConfig(config)
  next.merges = next.merges.filter(
    (merge) => !mergeIntersectsRange(merge, expanded),
  )
  next.merges.push(rangeToMerge(expanded))
  next.merges.sort((a, b) => a.row - b.row || a.col - b.col)
  for (let row = expanded.row; row <= expanded.endRow; row += 1) {
    for (let col = expanded.col; col <= expanded.endCol; col += 1) {
      if (row === expanded.row && col === expanded.col) continue
      // Keep the covered cell's styles but hide its content; splitting the
      // region later brings the styled cells back without duplicate text.
      next.cells[row][col] = sanitizeCell(
        { ...next.cells[row][col], text: '' },
        row,
      )
    }
  }
  return next
}

export function hasMergeInRange(config: TableConfig, range: TableRange): boolean {
  return config.merges.some((merge) => mergeIntersectsRange(merge, range))
}

export function splitRegion(config: TableConfig, range: TableRange): TableConfig {
  const expanded = expandRangeToMerges(config, range)
  const next = cloneTableConfig(config)
  next.merges = next.merges.filter(
    (merge) => !mergeIntersectsRange(merge, expanded),
  )
  return next
}

export function updateCells(
  config: TableConfig,
  range: TableRange,
  patch: Partial<TableCell>,
): TableConfig {
  const next = cloneTableConfig(config)
  const normalized = normalizeRange(range)
  for (let row = normalized.row; row <= normalized.endRow; row += 1) {
    for (let col = normalized.col; col <= normalized.endCol; col += 1) {
      const existing = next.cells[row]?.[col]
      if (!existing) continue
      const merged = { ...existing, ...patch }
      if (!('text' in patch) && typeof existing.text === 'string') {
        merged.text = existing.text
      }
      next.cells[row][col] = sanitizeCell(merged, row)
    }
  }
  return next
}

export type TableBorderSide = 'top' | 'right' | 'bottom' | 'left'

const BORDER_FLAG: Record<
  TableBorderSide,
  'borderTop' | 'borderRight' | 'borderBottom' | 'borderLeft'
> = {
  top: 'borderTop',
  right: 'borderRight',
  bottom: 'borderBottom',
  left: 'borderLeft',
}

const OPPOSITE_SIDE: Record<TableBorderSide, TableBorderSide> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
}

export function cellBorderVisible(
  cell: TableCell | undefined,
  side: TableBorderSide,
): boolean {
  return cell?.[BORDER_FLAG[side]] !== false
}

/** Map every grid coordinate to the visible region that owns it. */
function regionLookup(config: TableConfig): Map<string, TableRegion> {
  const lookup = new Map<string, TableRegion>()
  for (const region of buildRegions(config)) {
    for (let row = region.row; row < region.row + region.rowSpan; row += 1) {
      for (let col = region.col; col < region.col + region.colSpan; col += 1) {
        lookup.set(`${row},${col}`, region)
      }
    }
  }
  return lookup
}

function regionCell(
  config: TableConfig,
  region: TableRegion,
): TableCell | undefined {
  return config.cells[region.row]?.[region.col]
}

/**
 * Whether each side of the selected range is fully visible. Shared internal
 * edges count as visible only when both neighbouring cells show their side.
 */
export function rangeBorderState(
  config: TableConfig,
  range: TableRange,
): Record<TableBorderSide, boolean> {
  const expanded = expandRangeToMerges(config, range)
  const lookup = regionLookup(config)
  const state: Record<TableBorderSide, boolean> = {
    top: true,
    right: true,
    bottom: true,
    left: true,
  }
  const sideOn = (region: TableRegion | undefined, side: TableBorderSide) =>
    !region || cellBorderVisible(regionCell(config, region), side)

  for (let row = expanded.row; row <= expanded.endRow; row += 1) {
    const leftInside = lookup.get(`${row},${expanded.col}`)
    const leftOutside =
      expanded.col > 0 ? lookup.get(`${row},${expanded.col - 1}`) : undefined
    if (!sideOn(leftInside, 'left') || !sideOn(leftOutside, 'right')) {
      state.left = false
    }

    const rightInside = lookup.get(`${row},${expanded.endCol}`)
    const rightOutside =
      expanded.endCol < config.cols - 1
        ? lookup.get(`${row},${expanded.endCol + 1}`)
        : undefined
    if (!sideOn(rightInside, 'right') || !sideOn(rightOutside, 'left')) {
      state.right = false
    }
  }

  for (let col = expanded.col; col <= expanded.endCol; col += 1) {
    const topInside = lookup.get(`${expanded.row},${col}`)
    const topOutside =
      expanded.row > 0 ? lookup.get(`${expanded.row - 1},${col}`) : undefined
    if (!sideOn(topInside, 'top') || !sideOn(topOutside, 'bottom')) {
      state.top = false
    }

    const bottomInside = lookup.get(`${expanded.endRow},${col}`)
    const bottomOutside =
      expanded.endRow < config.rows - 1
        ? lookup.get(`${expanded.endRow + 1},${col}`)
        : undefined
    if (!sideOn(bottomInside, 'bottom') || !sideOn(bottomOutside, 'top')) {
      state.bottom = false
    }
  }

  return state
}

/**
 * Show or hide one outer side of a selected range. Hiding marks the selected
 * cells only; showing also clears the opposite flag on the neighbouring cells
 * outside the range so the shared edge reappears.
 */
export function setRangeBorder(
  config: TableConfig,
  range: TableRange,
  side: TableBorderSide,
  visible: boolean,
): TableConfig {
  const expanded = expandRangeToMerges(config, range)
  const next = cloneTableConfig(config)
  const lookup = regionLookup(next)
  const opposite = OPPOSITE_SIDE[side]

  const apply = (
    region: TableRegion | undefined,
    target: TableBorderSide,
    on: boolean,
  ) => {
    if (!region) return
    const cell = next.cells[region.row]?.[region.col]
    if (!cell) return
    const flag = BORDER_FLAG[target]
    if (on) delete cell[flag]
    else cell[flag] = false
  }

  if (side === 'top' || side === 'bottom') {
    const insideRow = side === 'top' ? expanded.row : expanded.endRow
    const outsideRow = side === 'top' ? expanded.row - 1 : expanded.endRow + 1
    const hasOutside = outsideRow >= 0 && outsideRow < next.rows
    for (let col = expanded.col; col <= expanded.endCol; col += 1) {
      apply(lookup.get(`${insideRow},${col}`), side, visible)
      if (visible && hasOutside) {
        apply(lookup.get(`${outsideRow},${col}`), opposite, true)
      }
    }
  } else {
    const insideCol = side === 'left' ? expanded.col : expanded.endCol
    const outsideCol = side === 'left' ? expanded.col - 1 : expanded.endCol + 1
    const hasOutside = outsideCol >= 0 && outsideCol < next.cols
    for (let row = expanded.row; row <= expanded.endRow; row += 1) {
      apply(lookup.get(`${row},${insideCol}`), side, visible)
      if (visible && hasOutside) {
        apply(lookup.get(`${row},${outsideCol}`), opposite, true)
      }
    }
  }

  return next
}

export function resizeTable(
  config: TableConfig,
  rows: number,
  cols: number,
): TableConfig {
  const nextRows = clampRows(rows)
  const nextCols = clampCols(cols)
  if (nextRows === config.rows && nextCols === config.cols) {
    return cloneTableConfig(config)
  }
  const next = cloneTableConfig(config)
  const avgRowHeight =
    config.rowHeights.reduce((sum, value) => sum + value, 0) /
    Math.max(1, config.rowHeights.length)
  const avgColWidth =
    config.colWidths.reduce((sum, value) => sum + value, 0) /
    Math.max(1, config.colWidths.length)

  next.rowHeights = Array.from(
    { length: nextRows },
    (_, index) => config.rowHeights[index] ?? round(avgRowHeight, 2),
  )
  next.colWidths = Array.from(
    { length: nextCols },
    (_, index) => config.colWidths[index] ?? round(avgColWidth, 2),
  )
  next.cells = Array.from({ length: nextRows }, (_, row) =>
    Array.from({ length: nextCols }, (_, col) =>
      cloneCell(config.cells[row]?.[col], row),
    ),
  )
  next.rows = nextRows
  next.cols = nextCols
  next.merges = config.merges.filter(
    (merge) =>
      merge.row + merge.rowSpan <= nextRows &&
      merge.col + merge.colSpan <= nextCols,
  )
  return next
}

export function setTableWidth(config: TableConfig, width: number): TableConfig {
  const current = getTableWidth(config)
  const target = Math.max(2, width)
  if (current <= 0) return cloneTableConfig(config)
  const factor = target / current
  const next = cloneTableConfig(config)
  next.colWidths = next.colWidths.map((value) =>
    Math.max(0.5, round(value * factor, 2)),
  )
  // Absorb rounding drift into the last column so the table width matches.
  const drift = round(
    target - next.colWidths.reduce((sum, value) => sum + value, 0),
    2,
  )
  const last = next.colWidths.length - 1
  if (last >= 0) {
    next.colWidths[last] = round(
      Math.max(0.5, next.colWidths[last] + drift),
      2,
    )
  }
  return next
}

export function setTableHeight(config: TableConfig, height: number): TableConfig {
  const current = getTableHeight(config)
  const target = Math.max(1, height)
  if (current <= 0) return cloneTableConfig(config)
  const factor = target / current
  const next = cloneTableConfig(config)
  next.rowHeights = next.rowHeights.map((value) =>
    Math.max(0.5, round(value * factor, 2)),
  )
  const drift = round(
    target - next.rowHeights.reduce((sum, value) => sum + value, 0),
    2,
  )
  const last = next.rowHeights.length - 1
  if (last >= 0) {
    next.rowHeights[last] = round(
      Math.max(0.5, next.rowHeights[last] + drift),
      2,
    )
  }
  return next
}

export function rangeLabel(range: TableRange): string {
  const normalized = normalizeRange(range)
  const start = `R${normalized.row + 1}C${normalized.col + 1}`
  const end = `R${normalized.endRow + 1}C${normalized.endCol + 1}`
  return start === end ? start : `${start} - ${end}`
}

export function isRangeSingleCell(range: TableRange): boolean {
  const normalized = normalizeRange(range)
  return normalized.row === normalized.endRow && normalized.col === normalized.endCol
}

/** The cell shown for a given coordinate, even when it is covered by a merge. */
export function cellAt(config: TableConfig, row: number, col: number): TableCell {
  return config.cells[row]?.[col] ?? { align: 'left', valign: 'middle' }
}

/** The visible region containing a coordinate (a merged region or a cell). */
export function regionAtCell(
  config: TableConfig,
  row: number,
  col: number,
): TableRegion | null {
  return (
    buildRegions(config).find(
      (region) =>
        row >= region.row &&
        row < region.row + region.rowSpan &&
        col >= region.col &&
        col < region.col + region.colSpan,
    ) ?? null
  )
}

/** Map a point in table-local millimetres to a cell coordinate. */
export function cellAtPoint(
  config: TableConfig,
  x: number,
  y: number,
): { row: number; col: number } | null {
  const width = getTableWidth(config)
  const height = getTableHeight(config)
  if (x < 0 || y < 0 || x > width || y > height) return null

  let col = config.cols - 1
  let cursor = 0
  for (let index = 0; index < config.cols; index += 1) {
    cursor += config.colWidths[index]
    if (x < cursor) {
      col = index
      break
    }
  }

  let row = config.rows - 1
  cursor = 0
  for (let index = 0; index < config.rows; index += 1) {
    cursor += config.rowHeights[index]
    if (y < cursor) {
      row = index
      break
    }
  }

  return { row, col }
}

export type { TableAlign, TableVAlign }
