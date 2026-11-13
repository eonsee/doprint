import type {
  TableAlign,
  TableCell,
  TableCellData,
  TableCellStyle,
  TableColumnData,
  TableConfig,
  TableMergeData,
  TableRowData,
  TableVAlign,
} from './types'
import { DEFAULT_FONT_PX, PX_TO_MM, clamp, round } from './units'

/**
 * Table model and commands.
 *
 * The snapshot mirrors Univer's worksheet data model: row / column metadata
 * are separate maps, cell data is sparse and keyed by row/column, merges are
 * inclusive ranges, and cell styles are interned in a registry. Everything in
 * this file is pure (apart from creating objects / arrays) and has no Fabric
 * dependency, so rendering and canvas interaction can be replaced without
 * touching table logic.
 */

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

export interface TableRegion {
  row: number
  col: number
  rowSpan: number
  colSpan: number
  x: number
  y: number
  width: number
  height: number
}

export const TABLE_VERSION = 2 as const

const DEFAULT_STYLE_ID = 'default'
const HEADER_STYLE_ID = 'header'
const DEFAULT_CELL_STYLE: TableCellStyle = { align: 'left', valign: 'middle' }
const HEADER_CELL_STYLE: TableCellStyle = {
  align: 'center',
  valign: 'middle',
  bold: true,
  fill: DEFAULT_TABLE.headerFill,
}

const STYLE_KEYS = [
  'align',
  'valign',
  'bold',
  'italic',
  'underline',
  'fill',
  'color',
  'fontSize',
  'fontFamily',
  'borderTop',
  'borderRight',
  'borderBottom',
  'borderLeft',
] as const

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

function readDimension(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const number = Number(value)
  return Number.isFinite(number) && number > 0
    ? round(clamp(number, min, max), 2)
    : fallback
}

function cleanStyle(input: unknown): TableCellStyle {
  const raw = (input && typeof input === 'object' ? input : {}) as TableCellStyle
  const style: TableCellStyle = {}
  if (raw.align === 'left' || raw.align === 'center' || raw.align === 'right') {
    style.align = raw.align
  }
  if (
    raw.valign === 'top' ||
    raw.valign === 'middle' ||
    raw.valign === 'bottom'
  ) {
    style.valign = raw.valign
  }
  // `false` is meaningful for bold and the border flags: it overrides a style
  // inherited from the row (for example, un-bolding one header cell).
  if (raw.bold === true || raw.bold === false) style.bold = raw.bold
  if (raw.italic === true || raw.italic === false) style.italic = raw.italic
  if (raw.underline === true || raw.underline === false) {
    style.underline = raw.underline
  }
  if (typeof raw.fill === 'string') style.fill = raw.fill
  if (typeof raw.color === 'string') style.color = raw.color
  if (typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize)) {
    style.fontSize = round(clamp(raw.fontSize, 0.5, 300 * PX_TO_MM), 2)
  }
  if (typeof raw.fontFamily === 'string' && raw.fontFamily.trim()) {
    style.fontFamily = raw.fontFamily.trim()
  }
  if (raw.borderTop === true || raw.borderTop === false) {
    style.borderTop = raw.borderTop
  }
  if (raw.borderRight === true || raw.borderRight === false) {
    style.borderRight = raw.borderRight
  }
  if (raw.borderBottom === true || raw.borderBottom === false) {
    style.borderBottom = raw.borderBottom
  }
  if (raw.borderLeft === true || raw.borderLeft === false) {
    style.borderLeft = raw.borderLeft
  }
  return style
}

function styleEquals(
  a: TableCellStyle | undefined,
  b: TableCellStyle | undefined,
): boolean {
  return STYLE_KEYS.every(
    (key) => (a?.[key] ?? undefined) === (b?.[key] ?? undefined),
  )
}

function mergeStyles(
  ...styles: Array<TableCellStyle | undefined>
): TableCellStyle {
  const merged: TableCellStyle = {}
  for (const style of styles) {
    if (style) Object.assign(merged, style)
  }
  return merged
}

/** Find an existing style id with the same properties, or register a new one. */
function ensureStyleId(
  styles: Record<string, TableCellStyle>,
  style: TableCellStyle,
): string {
  const cleaned = cleanStyle(style)
  for (const [id, existing] of Object.entries(styles)) {
    if (styleEquals(existing, cleaned)) return id
  }
  let index = 1
  while (styles[`s${index}`] !== undefined) index += 1
  const id = `s${index}`
  styles[id] = cleaned
  return id
}

function rowBaseStyle(
  styles: Record<string, TableCellStyle>,
  defaultStyle: string,
  rowData: Record<number, TableRowData>,
  row: number,
): TableCellStyle {
  const base = styles[defaultStyle] ?? DEFAULT_CELL_STYLE
  const rowStyleId = rowData[row]?.s
  return mergeStyles(base, rowStyleId ? styles[rowStyleId] : undefined)
}

function removeCellIfEmpty(
  cellData: Record<number, Record<number, TableCellData>>,
  row: number,
  col: number,
) {
  const cell = cellData[row]?.[col]
  if (!cell || cell.v || cell.s) return
  delete cellData[row][col]
  if (!Object.keys(cellData[row]).length) delete cellData[row]
}

function setCellValue(
  config: TableConfig,
  row: number,
  col: number,
  value: string,
) {
  const existing = config.cellData[row]?.[col]
  if (!value) {
    if (!existing) return
    delete existing.v
    removeCellIfEmpty(config.cellData, row, col)
    return
  }
  if (!config.cellData[row]) config.cellData[row] = {}
  if (!config.cellData[row][col]) config.cellData[row][col] = {}
  config.cellData[row][col].v = value
}

function setCellStyle(
  config: TableConfig,
  row: number,
  col: number,
  style: TableCellStyle,
) {
  const base = rowBaseStyle(
    config.styles,
    config.defaultStyle,
    config.rowData,
    row,
  )
  if (styleEquals(style, base)) {
    const existing = config.cellData[row]?.[col]
    if (!existing) return
    delete existing.s
    removeCellIfEmpty(config.cellData, row, col)
    return
  }
  const styleId = ensureStyleId(config.styles, style)
  if (!config.cellData[row]) config.cellData[row] = {}
  if (!config.cellData[row][col]) config.cellData[row][col] = {}
  config.cellData[row][col].s = styleId
}

/** Drop style entries that no row or cell references any more. */
function pruneStyles(config: TableConfig) {
  const used = new Set<string>([
    DEFAULT_STYLE_ID,
    HEADER_STYLE_ID,
    config.defaultStyle,
  ])

  for (const row of Object.values(config.rowData)) {
    if (!row.s) continue
    if (config.styles[row.s]) used.add(row.s)
    else delete row.s
  }

  for (const [rowKey, row] of Object.entries(config.cellData)) {
    const rowIndex = Number(rowKey)
    for (const [colKey, cell] of Object.entries(row ?? {})) {
      if (!cell.s) continue
      if (config.styles[cell.s]) used.add(cell.s)
      else delete cell.s
      if (!cell.v && !cell.s) {
        delete config.cellData[rowIndex][Number(colKey)]
      }
    }
    if (!Object.keys(config.cellData[rowIndex] ?? {}).length) {
      delete config.cellData[rowIndex]
    }
  }

  for (const id of Object.keys(config.styles)) {
    if (!used.has(id)) delete config.styles[id]
  }
  if (!config.styles[DEFAULT_STYLE_ID]) {
    config.styles[DEFAULT_STYLE_ID] = { ...DEFAULT_CELL_STYLE }
  }
  if (!config.styles[HEADER_STYLE_ID]) {
    config.styles[HEADER_STYLE_ID] = { ...HEADER_CELL_STYLE }
  }
  if (!config.styles[config.defaultStyle]) {
    config.defaultStyle = DEFAULT_STYLE_ID
  }
}

function normalizeMerges(
  input: unknown,
  rows: number,
  cols: number,
): TableMergeData[] {
  if (!Array.isArray(input)) return []
  const merges: TableMergeData[] = []
  const seen = new Set<string>()

  for (const candidate of input) {
    if (!candidate || typeof candidate !== 'object') continue
    const raw = candidate as Record<string, unknown>
    let startRow: number
    let endRow: number
    let startColumn: number
    let endColumn: number

    if ('startRow' in raw || 'startColumn' in raw) {
      startRow = Math.round(Number(raw.startRow))
      endRow = Math.round(Number(raw.endRow))
      startColumn = Math.round(Number(raw.startColumn))
      endColumn = Math.round(Number(raw.endColumn))
    } else {
      // Version 1 shape: anchor plus rowSpan / colSpan.
      const row = Math.round(Number(raw.row))
      const col = Math.round(Number(raw.col))
      const rowSpan = Math.round(Number(raw.rowSpan))
      const colSpan = Math.round(Number(raw.colSpan))
      startRow = row
      startColumn = col
      endRow = row + rowSpan - 1
      endColumn = col + colSpan - 1
    }

    if (
      !Number.isFinite(startRow) ||
      !Number.isFinite(endRow) ||
      !Number.isFinite(startColumn) ||
      !Number.isFinite(endColumn)
    ) {
      continue
    }

    const top = Math.min(startRow, endRow)
    const bottom = Math.max(startRow, endRow)
    const left = Math.min(startColumn, endColumn)
    const right = Math.max(startColumn, endColumn)
    if (top < 0 || left < 0) continue
    if (bottom >= rows || right >= cols) continue
    if (top === bottom && left === right) continue

    let overlaps = false
    for (let row = top; row <= bottom && !overlaps; row += 1) {
      for (let col = left; col <= right; col += 1) {
        if (seen.has(`${row},${col}`)) {
          overlaps = true
          break
        }
      }
    }
    if (overlaps) continue

    for (let row = top; row <= bottom; row += 1) {
      for (let col = left; col <= right; col += 1) seen.add(`${row},${col}`)
    }
    merges.push({
      startRow: top,
      endRow: bottom,
      startColumn: left,
      endColumn: right,
    })
  }

  merges.sort(
    (a, b) =>
      a.startRow - b.startRow || a.startColumn - b.startColumn,
  )
  return merges
}

function readTableFields(raw: any, config: TableConfig): TableConfig {
  config.fontSize = Number.isFinite(Number(raw.fontSize))
    ? round(clamp(Number(raw.fontSize), 0.5, 300 * PX_TO_MM), 2)
    : DEFAULT_TABLE.fontSize
  config.fontFamily =
    typeof raw.fontFamily === 'string' && raw.fontFamily
      ? raw.fontFamily
      : DEFAULT_TABLE.fontFamily
  config.color =
    typeof raw.color === 'string' && raw.color
      ? raw.color
      : DEFAULT_TABLE.color
  config.borderColor =
    typeof raw.borderColor === 'string' && raw.borderColor
      ? raw.borderColor
      : DEFAULT_TABLE.borderColor
  config.borderWidth = Number.isFinite(Number(raw.borderWidth))
    ? round(clamp(Number(raw.borderWidth), 0, 5), 2)
    : DEFAULT_TABLE.borderWidth
  config.padding = Number.isFinite(Number(raw.padding))
    ? round(clamp(Number(raw.padding), 0, 20), 2)
    : DEFAULT_TABLE.padding
  config.background =
    typeof raw.background === 'string' && raw.background
      ? raw.background
      : DEFAULT_TABLE.background
  return config
}

function normalizeV2(raw: any): TableConfig {
  const rows = clampRows(raw.rowCount)
  const cols = clampCols(raw.columnCount)

  const styles: Record<string, TableCellStyle> = {}
  if (raw.styles && typeof raw.styles === 'object') {
    for (const [id, style] of Object.entries(raw.styles)) {
      if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) continue
      styles[id] = cleanStyle(style)
    }
  }
  if (!styles[DEFAULT_STYLE_ID]) {
    styles[DEFAULT_STYLE_ID] = { ...DEFAULT_CELL_STYLE }
  }
  if (!styles[HEADER_STYLE_ID]) {
    styles[HEADER_STYLE_ID] = { ...HEADER_CELL_STYLE }
  }
  const defaultStyle =
    typeof raw.defaultStyle === 'string' && styles[raw.defaultStyle]
      ? raw.defaultStyle
      : DEFAULT_STYLE_ID

  const rowData: Record<number, TableRowData> = {}
  for (let row = 0; row < rows; row += 1) {
    const source = raw.rowData?.[row]
    const height = readDimension(
      source?.h ?? raw.rowHeights?.[row],
      0.5,
      500,
      DEFAULT_TABLE.rowHeight,
    )
    const styleId =
      typeof source?.s === 'string' && styles[source.s] ? source.s : ''
    rowData[row] = styleId ? { h: height, s: styleId } : { h: height }
  }

  const columnData: Record<number, TableColumnData> = {}
  for (let col = 0; col < cols; col += 1) {
    columnData[col] = {
      w: readDimension(
        raw.columnData?.[col]?.w ?? raw.colWidths?.[col],
        0.5,
        1000,
        DEFAULT_TABLE.colWidth,
      ),
    }
  }

  const cellData: Record<number, Record<number, TableCellData>> = {}
  for (let row = 0; row < rows; row += 1) {
    const rowSource = raw.cellData?.[row]
    if (!rowSource || typeof rowSource !== 'object') continue
    const base = rowBaseStyle(styles, defaultStyle, rowData, row)
    for (let col = 0; col < cols; col += 1) {
      const source = rowSource[col]
      if (!source || typeof source !== 'object') continue
      const value =
        typeof source.v === 'string'
          ? source.v
          : typeof source.text === 'string'
            ? source.text
            : ''
      let styleId =
        typeof source.s === 'string' && styles[source.s] ? source.s : ''
      if (styleId && styleEquals(styles[styleId], base)) styleId = ''
      if (!value && !styleId) continue
      if (!cellData[row]) cellData[row] = {}
      const cell: TableCellData = {}
      if (value) cell.v = value
      if (styleId) cell.s = styleId
      cellData[row][col] = cell
    }
  }

  const config: TableConfig = {
    version: TABLE_VERSION,
    rowCount: rows,
    columnCount: cols,
    rowData,
    columnData,
    cellData,
    mergeData: normalizeMerges(raw.mergeData ?? raw.merges, rows, cols),
    styles,
    defaultStyle,
    fontSize: DEFAULT_TABLE.fontSize,
    fontFamily: DEFAULT_TABLE.fontFamily,
    color: DEFAULT_TABLE.color,
    borderColor: DEFAULT_TABLE.borderColor,
    borderWidth: DEFAULT_TABLE.borderWidth,
    padding: DEFAULT_TABLE.padding,
    background: DEFAULT_TABLE.background,
  }
  readTableFields(raw, config)
  pruneStyles(config)
  return config
}

/** Migrate the version 1 dense table shape to the sparse snapshot. */
function normalizeV1(raw: any): TableConfig {
  const rows = clampRows(raw.rows)
  const cols = clampCols(raw.cols)
  const styles: Record<string, TableCellStyle> = {
    [DEFAULT_STYLE_ID]: { ...DEFAULT_CELL_STYLE },
    [HEADER_STYLE_ID]: { ...HEADER_CELL_STYLE },
  }
  const rowData: Record<number, TableRowData> = {}
  for (let row = 0; row < rows; row += 1) {
    rowData[row] = {
      h: readDimension(
        raw.rowHeights?.[row],
        0.5,
        500,
        DEFAULT_TABLE.rowHeight,
      ),
    }
  }
  const columnData: Record<number, TableColumnData> = {}
  for (let col = 0; col < cols; col += 1) {
    columnData[col] = {
      w: readDimension(
        raw.colWidths?.[col],
        0.5,
        1000,
        DEFAULT_TABLE.colWidth,
      ),
    }
  }

  const cellData: Record<number, Record<number, TableCellData>> = {}
  for (let row = 0; row < rows; row += 1) {
    const sourceRow = raw.cells?.[row]
    if (!Array.isArray(sourceRow)) continue
    const base = rowBaseStyle(styles, DEFAULT_STYLE_ID, rowData, row)
    for (let col = 0; col < cols; col += 1) {
      const cell = sourceRow[col]
      if (!cell || typeof cell !== 'object') continue
      const style = cleanStyle({
        align: cell.align,
        valign: cell.valign,
        bold: cell.bold === true ? true : undefined,
        fill: typeof cell.fill === 'string' ? cell.fill : undefined,
        color: typeof cell.color === 'string' ? cell.color : undefined,
        borderTop: cell.borderTop === false ? false : undefined,
        borderRight: cell.borderRight === false ? false : undefined,
        borderBottom: cell.borderBottom === false ? false : undefined,
        borderLeft: cell.borderLeft === false ? false : undefined,
      })
      const value = typeof cell.text === 'string' ? cell.text : ''
      let styleId =
        Object.keys(style).length && !styleEquals(style, base)
          ? ensureStyleId(styles, style)
          : ''
      if (styleId && styleEquals(styles[styleId], base)) styleId = ''
      if (!value && !styleId) continue
      if (!cellData[row]) cellData[row] = {}
      const stored: TableCellData = {}
      if (value) stored.v = value
      if (styleId) stored.s = styleId
      cellData[row][col] = stored
    }
  }

  const config: TableConfig = {
    version: TABLE_VERSION,
    rowCount: rows,
    columnCount: cols,
    rowData,
    columnData,
    cellData,
    mergeData: normalizeMerges(raw.merges, rows, cols),
    styles,
    defaultStyle: DEFAULT_STYLE_ID,
    fontSize: DEFAULT_TABLE.fontSize,
    fontFamily: DEFAULT_TABLE.fontFamily,
    color: DEFAULT_TABLE.color,
    borderColor: DEFAULT_TABLE.borderColor,
    borderWidth: DEFAULT_TABLE.borderWidth,
    padding: DEFAULT_TABLE.padding,
    background: DEFAULT_TABLE.background,
  }
  readTableFields(raw, config)
  pruneStyles(config)
  return config
}

function isVersion1(raw: any): boolean {
  if (!raw || typeof raw !== 'object') return false
  if (raw.version === TABLE_VERSION) return false
  return (
    Array.isArray(raw.cells) ||
    Array.isArray(raw.rowHeights) ||
    Array.isArray(raw.colWidths) ||
    Array.isArray(raw.merges)
  )
}

export function defaultCell(row = 1): TableCell {
  return row === 0
    ? { text: '', ...HEADER_CELL_STYLE }
    : { text: '', ...DEFAULT_CELL_STYLE }
}

/** Effective cell used by the inspector; kept for compatibility with v1 data. */
export function sanitizeCell(input: unknown, row = 1): TableCell {
  const raw = (input && typeof input === 'object' ? input : {}) as TableCell
  const text = typeof raw.text === 'string' ? raw.text : ''
  const style = cleanStyle(raw)
  if (!Object.keys(style).length) return defaultCell(row)
  return { text, ...style }
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

  const rowData: Record<number, TableRowData> = {}
  for (let row = 0; row < rowCount; row += 1) {
    rowData[row] =
      row === 0
        ? { h: rowHeight, s: HEADER_STYLE_ID }
        : { h: rowHeight }
  }
  const columnData: Record<number, TableColumnData> = {}
  for (let col = 0; col < colCount; col += 1) {
    columnData[col] = { w: colWidth }
  }

  return {
    version: TABLE_VERSION,
    rowCount,
    columnCount: colCount,
    rowData,
    columnData,
    cellData: {},
    mergeData: [],
    styles: {
      [DEFAULT_STYLE_ID]: { ...DEFAULT_CELL_STYLE },
      [HEADER_STYLE_ID]: { ...HEADER_CELL_STYLE },
    },
    defaultStyle: DEFAULT_STYLE_ID,
    fontSize: DEFAULT_TABLE.fontSize,
    fontFamily: DEFAULT_TABLE.fontFamily,
    color: DEFAULT_TABLE.color,
    borderColor: DEFAULT_TABLE.borderColor,
    borderWidth: DEFAULT_TABLE.borderWidth,
    padding: DEFAULT_TABLE.padding,
    background: DEFAULT_TABLE.background,
  }
}

/** Validate a table snapshot from storage / import and migrate v1 tables. */
export function normalizeTableConfig(input: unknown): TableConfig {
  const raw = (input && typeof input === 'object' ? input : {}) as any
  return isVersion1(raw) ? normalizeV1(raw) : normalizeV2(raw)
}

export function getRowHeight(config: TableConfig, row: number): number {
  return readDimension(
    config.rowData[row]?.h,
    0.5,
    500,
    DEFAULT_TABLE.rowHeight,
  )
}

export function getColumnWidth(config: TableConfig, col: number): number {
  return readDimension(
    config.columnData[col]?.w,
    0.5,
    1000,
    DEFAULT_TABLE.colWidth,
  )
}

export function getRowHeights(config: TableConfig): number[] {
  return Array.from({ length: config.rowCount }, (_, row) =>
    getRowHeight(config, row),
  )
}

export function getColumnWidths(config: TableConfig): number[] {
  return Array.from({ length: config.columnCount }, (_, col) =>
    getColumnWidth(config, col),
  )
}

export function getTableWidth(config: TableConfig): number {
  return round(
    getColumnWidths(config).reduce((sum, value) => sum + value, 0),
    2,
  )
}

export function getTableHeight(config: TableConfig): number {
  return round(
    getRowHeights(config).reduce((sum, value) => sum + value, 0),
    2,
  )
}

export function getTableSize(config: TableConfig): {
  width: number
  height: number
} {
  return { width: getTableWidth(config), height: getTableHeight(config) }
}

/** Style inherited from the base style and the row default, without the cell. */
export function getRowBaseStyle(
  config: TableConfig,
  row: number,
): TableCellStyle {
  return rowBaseStyle(
    config.styles,
    config.defaultStyle,
    config.rowData,
    row,
  )
}

export function getCellStyle(
  config: TableConfig,
  row: number,
  col: number,
): TableCellStyle {
  const base = getRowBaseStyle(config, row)
  const styleId = config.cellData[row]?.[col]?.s
  return mergeStyles(base, styleId ? config.styles[styleId] : undefined)
}

export function getCellValue(
  config: TableConfig,
  row: number,
  col: number,
): string {
  return config.cellData[row]?.[col]?.v ?? ''
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
  const sizes = getColumnWidths(config)
  const rowSizes = getRowHeights(config)
  const xs = axisOffsets(sizes)
  const ys = axisOffsets(rowSizes)
  const mergeAt = new Map<string, TableMergeData>()
  for (const merge of config.mergeData) {
    for (let row = merge.startRow; row <= merge.endRow; row += 1) {
      for (let col = merge.startColumn; col <= merge.endColumn; col += 1) {
        mergeAt.set(`${row},${col}`, merge)
      }
    }
  }

  const regions: TableRegion[] = []
  for (let row = 0; row < config.rowCount; row += 1) {
    for (let col = 0; col < config.columnCount; col += 1) {
      const merge = mergeAt.get(`${row},${col}`)
      if (merge && (merge.startRow !== row || merge.startColumn !== col)) {
        continue
      }
      const rowSpan = merge ? merge.endRow - merge.startRow + 1 : 1
      const colSpan = merge ? merge.endColumn - merge.startColumn + 1 : 1
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

export function mergeToRange(merge: TableMergeData): TableRange {
  return {
    row: merge.startRow,
    col: merge.startColumn,
    endRow: merge.endRow,
    endCol: merge.endColumn,
  }
}

export function mergeIntersectsRange(
  merge: TableMergeData,
  range: TableRange,
): boolean {
  const normalized = normalizeRange(range)
  return !(
    merge.endRow < normalized.row ||
    merge.startRow > normalized.endRow ||
    merge.endColumn < normalized.col ||
    merge.startColumn > normalized.endCol
  )
}

export function findMergeContaining(
  config: TableConfig,
  row: number,
  col: number,
): TableMergeData | null {
  return (
    config.mergeData.find(
      (merge) =>
        row >= merge.startRow &&
        row <= merge.endRow &&
        col >= merge.startColumn &&
        col <= merge.endColumn,
    ) ?? null
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
    for (const merge of config.mergeData) {
      if (!mergeIntersectsRange(merge, { row, col, endRow, endCol })) {
        continue
      }
      const nextRow = Math.min(row, merge.startRow)
      const nextCol = Math.min(col, merge.startColumn)
      const nextEndRow = Math.max(endRow, merge.endRow)
      const nextEndCol = Math.max(endCol, merge.endColumn)
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

export function rangeToMerge(range: TableRange): TableMergeData {
  const normalized = normalizeRange(range)
  return {
    startRow: normalized.row,
    endRow: normalized.endRow,
    startColumn: normalized.col,
    endColumn: normalized.endCol,
  }
}

export function mergeRegion(
  config: TableConfig,
  range: TableRange,
): TableConfig {
  const expanded = expandRangeToMerges(config, range)
  if (rangeCellCount(expanded) <= 1) return cloneTableConfig(config)
  const next = cloneTableConfig(config)
  next.mergeData = next.mergeData.filter(
    (merge) => !mergeIntersectsRange(merge, expanded),
  )
  next.mergeData.push(rangeToMerge(expanded))
  next.mergeData.sort(
    (a, b) => a.startRow - b.startRow || a.startColumn - b.startColumn,
  )
  for (let row = expanded.row; row <= expanded.endRow; row += 1) {
    for (let col = expanded.col; col <= expanded.endCol; col += 1) {
      if (row === expanded.row && col === expanded.col) continue
      // Keep the covered cell's style but hide its content; splitting the
      // region brings the styled cells back without duplicate text.
      setCellValue(next, row, col, '')
    }
  }
  pruneStyles(next)
  return next
}

export function hasMergeInRange(
  config: TableConfig,
  range: TableRange,
): boolean {
  return config.mergeData.some((merge) =>
    mergeIntersectsRange(merge, range),
  )
}

export function splitRegion(
  config: TableConfig,
  range: TableRange,
): TableConfig {
  const expanded = expandRangeToMerges(config, range)
  const next = cloneTableConfig(config)
  next.mergeData = next.mergeData.filter(
    (merge) => !mergeIntersectsRange(merge, expanded),
  )
  pruneStyles(next)
  return next
}

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

function stylePatchOf(patch: Partial<TableCell>): TableCellStyle {
  const style: TableCellStyle = {}
  if (patch.align !== undefined) style.align = patch.align
  if (patch.valign !== undefined) style.valign = patch.valign
  if (patch.bold !== undefined) style.bold = patch.bold
  if (patch.italic !== undefined) style.italic = patch.italic
  if (patch.underline !== undefined) style.underline = patch.underline
  if (patch.fill !== undefined) style.fill = patch.fill
  if (patch.color !== undefined) style.color = patch.color
  if (patch.fontSize !== undefined) style.fontSize = patch.fontSize
  if (patch.fontFamily !== undefined) style.fontFamily = patch.fontFamily
  if (patch.borderTop !== undefined) style.borderTop = patch.borderTop
  if (patch.borderRight !== undefined) style.borderRight = patch.borderRight
  if (patch.borderBottom !== undefined) {
    style.borderBottom = patch.borderBottom
  }
  if (patch.borderLeft !== undefined) style.borderLeft = patch.borderLeft
  return style
}

/**
 * Update text and/or style for every visible region overlapped by `range`.
 * Covered cells of a merge are skipped; the merge anchor receives the change.
 */
export function updateCells(
  config: TableConfig,
  range: TableRange,
  patch: Partial<TableCell>,
): TableConfig {
  const next = cloneTableConfig(config)
  const normalized = normalizeRange(range)
  const hasText = patch.text !== undefined
  const stylePatch = stylePatchOf(patch)
  const hasStyle = Object.keys(stylePatch).length > 0
  if (!hasText && !hasStyle) return next

  const top = clamp(normalized.row, 0, next.rowCount - 1)
  const bottom = clamp(normalized.endRow, 0, next.rowCount - 1)
  const left = clamp(normalized.col, 0, next.columnCount - 1)
  const right = clamp(normalized.endCol, 0, next.columnCount - 1)
  const lookup = regionLookup(next)
  const anchors = new Map<string, TableRegion>()
  for (let row = top; row <= bottom; row += 1) {
    for (let col = left; col <= right; col += 1) {
      const region = lookup.get(`${row},${col}`)
      if (region) anchors.set(`${region.row},${region.col}`, region)
    }
  }

  for (const region of anchors.values()) {
    if (hasText) setCellValue(next, region.row, region.col, patch.text ?? '')
    if (hasStyle) {
      const style = mergeStyles(
        getCellStyle(next, region.row, region.col),
        stylePatch,
      )
      setCellStyle(next, region.row, region.col, style)
    }
  }
  pruneStyles(next)
  return next
}

export type TableBorderSide = 'top' | 'right' | 'bottom' | 'left'

const BORDER_FLAG: Record<TableBorderSide, keyof TableCellStyle> = {
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
  cell: TableCell | TableCellStyle | undefined,
  side: TableBorderSide,
): boolean {
  return cell?.[BORDER_FLAG[side]] !== false
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
    !region ||
    cellBorderVisible(
      getCellStyle(config, region.row, region.col),
      side,
    )

  for (let row = expanded.row; row <= expanded.endRow; row += 1) {
    const leftInside = lookup.get(`${row},${expanded.col}`)
    const leftOutside =
      expanded.col > 0 ? lookup.get(`${row},${expanded.col - 1}`) : undefined
    if (!sideOn(leftInside, 'left') || !sideOn(leftOutside, 'right')) {
      state.left = false
    }

    const rightInside = lookup.get(`${row},${expanded.endCol}`)
    const rightOutside =
      expanded.endCol < config.columnCount - 1
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
      expanded.endRow < config.rowCount - 1
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
    const style: TableCellStyle = {
      ...getCellStyle(next, region.row, region.col),
      [BORDER_FLAG[target]]: on,
    }
    setCellStyle(next, region.row, region.col, style)
  }

  if (side === 'top' || side === 'bottom') {
    const insideRow = side === 'top' ? expanded.row : expanded.endRow
    const outsideRow = side === 'top' ? expanded.row - 1 : expanded.endRow + 1
    const hasOutside = outsideRow >= 0 && outsideRow < next.rowCount
    for (let col = expanded.col; col <= expanded.endCol; col += 1) {
      apply(lookup.get(`${insideRow},${col}`), side, visible)
      if (visible && hasOutside) {
        apply(lookup.get(`${outsideRow},${col}`), opposite, true)
      }
    }
  } else {
    const insideCol = side === 'left' ? expanded.col : expanded.endCol
    const outsideCol = side === 'left' ? expanded.col - 1 : expanded.endCol + 1
    const hasOutside = outsideCol >= 0 && outsideCol < next.columnCount
    for (let row = expanded.row; row <= expanded.endRow; row += 1) {
      apply(lookup.get(`${row},${insideCol}`), side, visible)
      if (visible && hasOutside) {
        apply(lookup.get(`${row},${outsideCol}`), opposite, true)
      }
    }
  }

  pruneStyles(next)
  return next
}

export function resizeTable(
  config: TableConfig,
  rows: number,
  cols: number,
): TableConfig {
  const nextRows = clampRows(rows)
  const nextCols = clampCols(cols)
  if (nextRows === config.rowCount && nextCols === config.columnCount) {
    return cloneTableConfig(config)
  }

  const rowHeights = getRowHeights(config)
  const columnWidths = getColumnWidths(config)
  const avgRowHeight =
    rowHeights.reduce((sum, value) => sum + value, 0) /
    Math.max(1, rowHeights.length)
  const avgColWidth =
    columnWidths.reduce((sum, value) => sum + value, 0) /
    Math.max(1, columnWidths.length)

  const next = cloneTableConfig(config)
  const rowData: Record<number, TableRowData> = {}
  for (let row = 0; row < nextRows; row += 1) {
    const existing = config.rowData[row]
    rowData[row] = existing?.s
      ? { h: existing.h ?? round(avgRowHeight, 2), s: existing.s }
      : { h: existing?.h ?? round(avgRowHeight, 2) }
  }
  const columnData: Record<number, TableColumnData> = {}
  for (let col = 0; col < nextCols; col += 1) {
    columnData[col] = {
      w: config.columnData[col]?.w ?? round(avgColWidth, 2),
    }
  }

  for (const rowKey of Object.keys(next.cellData)) {
    const row = Number(rowKey)
    if (row >= nextRows) {
      delete next.cellData[row]
      continue
    }
    for (const colKey of Object.keys(next.cellData[row] ?? {})) {
      if (Number(colKey) >= nextCols) delete next.cellData[row][Number(colKey)]
    }
    if (!Object.keys(next.cellData[row] ?? {}).length) delete next.cellData[row]
  }

  next.rowCount = nextRows
  next.columnCount = nextCols
  next.rowData = rowData
  next.columnData = columnData
  next.mergeData = config.mergeData.filter(
    (merge) => merge.endRow < nextRows && merge.endColumn < nextCols,
  )
  pruneStyles(next)
  return next
}

const MIN_TRACK_SIZE = 0.5

/**
 * Drag-resize a row by moving its bottom border. The next row absorbs the
 * delta, so the table keeps its overall height and only the two adjacent
 * rows change size.
 */
export function resizeRow(
  config: TableConfig,
  row: number,
  height: number,
): TableConfig {
  if (row < 0 || row >= config.rowCount - 1) return cloneTableConfig(config)
  const current = getRowHeight(config, row)
  const neighbour = getRowHeight(config, row + 1)
  const min = MIN_TRACK_SIZE
  const max = Math.max(min, current + neighbour - min)
  const value = round(clamp(height, min, max), 2)
  const rest = round(current + neighbour - value, 2)
  const next = cloneTableConfig(config)
  const styleId = next.rowData[row]?.s
  const neighbourStyleId = next.rowData[row + 1]?.s
  next.rowData[row] = styleId ? { h: value, s: styleId } : { h: value }
  next.rowData[row + 1] = neighbourStyleId
    ? { h: rest, s: neighbourStyleId }
    : { h: rest }
  return next
}

/**
 * Drag-resize a column by moving its right border. The next column absorbs
 * the delta, so the table's width and position stay fixed.
 */
export function resizeColumn(
  config: TableConfig,
  col: number,
  width: number,
): TableConfig {
  if (col < 0 || col >= config.columnCount - 1) return cloneTableConfig(config)
  const current = getColumnWidth(config, col)
  const neighbour = getColumnWidth(config, col + 1)
  const min = MIN_TRACK_SIZE
  const max = Math.max(min, current + neighbour - min)
  const value = round(clamp(width, min, max), 2)
  const rest = round(current + neighbour - value, 2)
  const next = cloneTableConfig(config)
  next.columnData[col] = { w: value }
  next.columnData[col + 1] = { w: rest }
  return next
}

export function setTableWidth(
  config: TableConfig,
  width: number,
): TableConfig {
  const current = getTableWidth(config)
  const target = Math.max(2, width)
  if (current <= 0) return cloneTableConfig(config)
  const factor = target / current
  const widths = getColumnWidths(config).map((value) =>
    Math.max(0.5, round(value * factor, 2)),
  )
  const drift = round(
    target - widths.reduce((sum, value) => sum + value, 0),
    2,
  )
  const last = widths.length - 1
  if (last >= 0) {
    widths[last] = round(Math.max(0.5, widths[last] + drift), 2)
  }
  const next = cloneTableConfig(config)
  next.columnData = {}
  widths.forEach((value, col) => {
    next.columnData[col] = { w: value }
  })
  return next
}

export function setTableHeight(
  config: TableConfig,
  height: number,
): TableConfig {
  const current = getTableHeight(config)
  const target = Math.max(1, height)
  if (current <= 0) return cloneTableConfig(config)
  const factor = target / current
  const heights = getRowHeights(config).map((value) =>
    Math.max(0.5, round(value * factor, 2)),
  )
  const drift = round(
    target - heights.reduce((sum, value) => sum + value, 0),
    2,
  )
  const last = heights.length - 1
  if (last >= 0) {
    heights[last] = round(Math.max(0.5, heights[last] + drift), 2)
  }
  const next = cloneTableConfig(config)
  next.rowData = {}
  heights.forEach((value, row) => {
    const styleId = config.rowData[row]?.s
    next.rowData[row] = styleId ? { h: value, s: styleId } : { h: value }
  })
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
  return (
    normalized.row === normalized.endRow && normalized.col === normalized.endCol
  )
}

/** The cell shown for a given coordinate, even when it is covered by a merge. */
export function cellAt(
  config: TableConfig,
  row: number,
  col: number,
): TableCell {
  return {
    text: getCellValue(config, row, col),
    ...getCellStyle(config, row, col),
  }
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

  const widths = getColumnWidths(config)
  const heights = getRowHeights(config)
  let col = config.columnCount - 1
  let cursor = 0
  for (let index = 0; index < config.columnCount; index += 1) {
    cursor += widths[index]
    if (x < cursor) {
      col = index
      break
    }
  }

  let row = config.rowCount - 1
  cursor = 0
  for (let index = 0; index < config.rowCount; index += 1) {
    cursor += heights[index]
    if (y < cursor) {
      row = index
      break
    }
  }

  return { row, col }
}

export type { TableAlign, TableCell, TableVAlign }
