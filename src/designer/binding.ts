import type { DataField, PageTemplate } from './types'

/** Matches `{{ field }}` placeholders. Field names may contain any character except braces. */
const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

/**
 * Replace `{{key}}` tokens with sample values. Unknown keys are left untouched
 * so the missing binding stays visible on the printed output.
 */
export function resolveBindings(text: string, fields: DataField[]): string {
  if (!text || !text.includes('{{')) return text
  const map = new Map<string, string>()
  for (const field of fields) {
    if (field.key) map.set(field.key, field.value)
  }
  return text.replace(TOKEN_RE, (match, rawKey: string) => {
    const key = rawKey.trim()
    return map.has(key) ? String(map.get(key)) : match
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
      if (key) {
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
      }
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

/** Deep-clone a template and resolve text / table-cell bindings. */
export function resolveTemplateBindings(
  template: PageTemplate,
  fields: DataField[],
): PageTemplate {
  const clone = JSON.parse(JSON.stringify(template)) as PageTemplate
  for (const element of clone.elements ?? []) {
    if (typeof element.text === 'string') {
      element.text = resolveBindings(element.text, fields)
    }
    if (
      (element.kind === 'qrcode' || element.kind === 'barcode') &&
      typeof element.codeText === 'string'
    ) {
      element.codeText = resolveBindings(element.codeText, fields)
    }
    if (element.table) {
      // Cells are sparse (row -> column -> { v, s }), so only non-empty
      // values are visited.
      for (const row of Object.values(element.table.cellData ?? {})) {
        for (const cell of Object.values(row ?? {})) {
          if (typeof cell.v === 'string') {
            cell.v = resolveBindings(cell.v, fields)
          }
        }
      }
    }
  }
  return clone
}
