import { cloneTableConfig, getRowHeights } from './table'
import type {
  DataField,
  PageTemplate,
  TableCellData,
  TableConfig,
  TableRowData,
} from './types'

/** Matches `{{ field }}` placeholders. Field names may contain any character except braces. */
const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

const TRUTHY_VALUES = new Set([
  '1',
  'true',
  'yes',
  'y',
  'on',
  'checked',
  '是',
  '√',
  '✓',
  '✔',
])

const FALSY_VALUES = new Set([
  '0',
  'false',
  'no',
  'n',
  'off',
  'null',
  'undefined',
  '否',
  '×',
  '✗',
  '✘',
])

function isTruthyValue(value: string): boolean {
  const text = value.trim().toLowerCase()
  if (!text) return false
  if (TRUTHY_VALUES.has(text)) return true
  if (FALSY_VALUES.has(text)) return false
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text) !== 0
  return true
}

/**
 * Resolve a checked/unchecked symbol token:
 *
 * - `{{#field}}`            → field is truthy / non-empty
 * - `{{#field=普}}`          → field value equals "普"
 * - `{{#field|☑|□}}`        → custom checked / unchecked symbols
 * - `{{#field=普|☑|□}}`     → custom symbols + equality
 *
 * Unknown fields keep the raw token so the binding stays visible for editing.
 */
function resolveCheckboxToken(
  raw: string,
  body: string,
  map: Map<string, string>,
): string {
  const [conditionPart, checkedPart, uncheckedPart] = body.split('|')
  const checked = checkedPart?.trim() || '☑'
  const unchecked = uncheckedPart?.trim() || '□'

  let condition = conditionPart.trim()
  let expected: string | null = null
  const eq = condition.indexOf('=')
  if (eq >= 0) {
    expected = condition.slice(eq + 1).trim()
    condition = condition.slice(0, eq).trim()
  }
  if (!condition || !map.has(condition)) return raw

  const value = String(map.get(condition) ?? '').trim()
  if (value === checked) return checked
  if (value === unchecked) return unchecked
  if (expected !== null) return value === expected ? checked : unchecked
  return isTruthyValue(value) ? checked : unchecked
}

function fieldsToMap(fields: DataField[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const field of fields) {
    if (field.key) map.set(field.key, field.value)
  }
  return map
}

/**
 * Replace `{{key}}` tokens with sample values. Unknown keys are left untouched
 * so the missing binding stays visible on the printed output.
 */
export function resolveBindings(text: string, fields: DataField[]): string {
  if (!text || !text.includes('{{')) return text
  const map = fieldsToMap(fields)
  return text.replace(TOKEN_RE, (match, rawKey: string) => {
    const key = rawKey.trim()
    if (key.startsWith('#')) {
      return resolveCheckboxToken(match, key.slice(1), map)
    }
    return map.has(key) ? String(map.get(key)) : match
  })
}

/**
 * Resolve only checkbox tokens (`{{#...}}`) and leave normal `{{field}}`
 * placeholders untouched. Used by the design canvas so bound cells show the
 * actual box symbol while ordinary field bindings remain editable.
 */
export function resolveCheckboxBindings(
  text: string,
  fields: DataField[],
): string {
  if (!text || !text.includes('{{#')) return text
  const map = fieldsToMap(fields)
  return text.replace(TOKEN_RE, (match, rawKey: string) => {
    const key = rawKey.trim()
    if (!key.startsWith('#')) return match
    return resolveCheckboxToken(match, key.slice(1), map)
  })
}

export function hasBinding(text: string): boolean {
  return typeof text === 'string' && /\{\{\s*[^{}]+?\s*\}\}/.test(text)
}

function flattenValue(value: unknown, key: string, out: DataField[]) {
  if (value === null || value === undefined) {
    if (key) out.push({ key, value: '' })
    return
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      if (!key) return
      // An array of objects is master-detail data: keep each item as one
      // child row so tables can repeat a row per item.
      const objects = value.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === 'object' && !Array.isArray(item),
      )
      if (objects.length && objects.length === value.length) {
        const rows = objects.map((item) => {
          const row: Record<string, string> = {}
          for (const child of flattenData(item)) {
            row[child.key] = child.value
          }
          return row
        })
        out.push({ key, value: '', rows })
        return
      }
      out.push({
        key,
        value: value
          .map((item) =>
            item !== null && typeof item === 'object'
              ? JSON.stringify(item)
              : String(item ?? ''),
          )
          .join(', '),
      })
      return
    }
    for (const [childKey, childValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      flattenValue(childValue, key ? `${key}.${childKey}` : childKey, out)
    }
    return
  }
  if (key) out.push({ key, value: String(value) })
}

/** Flatten a nested JSON object into dotted data fields. */
export function flattenData(input: unknown, prefix = ''): DataField[] {
  const out: DataField[] = []
  flattenValue(input, prefix, out)
  return out
}

export function parseDataJson(text: string): DataField[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('JSON 格式不正确')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON 根节点必须是对象')
  }
  const fields = flattenData(parsed)
  if (!fields.length) throw new Error('JSON 中没有可用的字段')
  return fields
}

/** Rows of a detail collection; empty when the field is not a collection. */
export function detailRowsOf(
  fields: DataField[],
  source: string,
): Record<string, string>[] {
  const field = fields.find((item) => item.key === source)
  return Array.isArray(field?.rows) ? field!.rows! : []
}

export function hasDetailRows(fields: DataField[]): boolean {
  return fields.some((field) => Array.isArray(field.rows) && field.rows.length > 0)
}

/**
 * Flatten the first row of every detail collection into `source.column`
 * fields. Used by the design canvas and by text boxes outside repeat tables so
 * detail bindings still show a representative value.
 */
export function sampleFieldsWithDetails(fields: DataField[]): DataField[] {
  const out = [...fields]
  for (const field of fields) {
    const first = field.rows?.[0]
    if (!first) continue
    for (const [column, value] of Object.entries(first)) {
      out.push({
        key: `${field.key}.${column}`,
        value: String(value ?? ''),
      })
    }
  }
  return out
}

function detailRowFields(
  source: string,
  row: Record<string, string>,
): DataField[] {
  return Object.entries(row).map(([column, value]) => ({
    key: `${source}.${column}`,
    value: String(value ?? ''),
  }))
}

/**
 * Expand a table's repeating row once per detail item and resolve the cells in
 * those rows against the item. Master fields remain available inside the row.
 * Merged cells fully inside the repeating row are replicated; merges that span
 * the repeating row and other rows are dropped in the output.
 */
export function expandRepeatTable(
  config: TableConfig,
  fields: DataField[],
): TableConfig {
  const repeat = config.repeat
  if (!repeat) return config
  const items = detailRowsOf(fields, repeat.source)
  const next = cloneTableConfig(config)
  delete next.repeat
  if (!items.length) return next

  const templateRow = Math.max(
    0,
    Math.min(config.rowCount - 1, Math.floor(repeat.row)),
  )
  const templateCells = config.cellData[templateRow] ?? {}

  const resolveRowCells = (item?: Record<string, string>) => {
    const context = item ? [...fields, ...detailRowFields(repeat.source, item)] : fields
    const result: Record<number, TableCellData> = {}
    for (const [colKey, cell] of Object.entries(templateCells)) {
      const copy: TableCellData = { ...cell }
      if (typeof copy.v === 'string') {
        copy.v = resolveBindings(copy.v, context)
      }
      result[Number(colKey)] = copy
    }
    return result
  }

  const extra = items.length - 1
  if (extra <= 0) {
    next.cellData[templateRow] = resolveRowCells(items[0])
    return next
  }

  const templateHeight = getRowHeights(config)[templateRow]
  const rowData: Record<number, TableRowData> = {}
  for (let row = 0; row < config.rowCount; row += 1) {
    if (row < templateRow) {
      rowData[row] = { ...config.rowData[row] }
    } else if (row > templateRow) {
      rowData[row + extra] = { ...config.rowData[row] }
    }
  }
  for (let index = 0; index < items.length; index += 1) {
    rowData[templateRow + index] = {
      ...(config.rowData[templateRow] ?? {}),
      h: templateHeight,
    }
  }

  const cellData: Record<number, Record<number, TableCellData>> = {}
  for (const [rowKey, rowCells] of Object.entries(config.cellData)) {
    const row = Number(rowKey)
    if (row < templateRow) cellData[row] = rowCells
    else if (row > templateRow) cellData[row + extra] = rowCells
  }
  for (let index = 0; index < items.length; index += 1) {
    cellData[templateRow + index] = resolveRowCells(items[index])
  }

  const mergeData = []
  for (const merge of config.mergeData) {
    if (merge.endRow < templateRow) {
      mergeData.push({ ...merge })
    } else if (merge.startRow > templateRow) {
      mergeData.push({
        ...merge,
        startRow: merge.startRow + extra,
        endRow: merge.endRow + extra,
      })
    } else if (
      merge.startRow === templateRow &&
      merge.endRow === templateRow
    ) {
      for (let index = 0; index < items.length; index += 1) {
        mergeData.push({
          ...merge,
          startRow: templateRow + index,
          endRow: templateRow + index,
        })
      }
    }
  }

  return {
    ...next,
    rowCount: config.rowCount + extra,
    rowData,
    cellData,
    mergeData,
  }
}

/** Deep-clone a template and resolve text / table-cell bindings. */
export function resolveTemplateBindings(
  template: PageTemplate,
  fields: DataField[],
): PageTemplate {
  const clone = JSON.parse(JSON.stringify(template)) as PageTemplate
  const sampleFields = sampleFieldsWithDetails(fields)
  for (const element of clone.elements ?? []) {
    if (typeof element.text === 'string') {
      element.text = resolveBindings(element.text, sampleFields)
    }
    if (
      (element.kind === 'qrcode' || element.kind === 'barcode') &&
      typeof element.codeText === 'string'
    ) {
      element.codeText = resolveBindings(element.codeText, sampleFields)
    }
    if (element.table) {
      if (element.table.repeat) {
        element.table = expandRepeatTable(element.table, fields)
      }
      // Cells are sparse (row -> column -> { v, s }), so only non-empty
      // values are visited.
      for (const row of Object.values(element.table.cellData ?? {})) {
        for (const cell of Object.values(row ?? {})) {
          if (typeof cell.v === 'string') {
            cell.v = resolveBindings(cell.v, sampleFields)
          }
        }
      }
    }
  }
  return clone
}
