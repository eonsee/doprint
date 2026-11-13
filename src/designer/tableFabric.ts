import { Group, Rect, Textbox } from 'fabric'
import type { FabricObject } from 'fabric'
import type { TableConfig } from './types'
import {
  buildRegions,
  cellBorderVisible,
  getCellStyle,
  getCellValue,
  getColumnWidths,
  getRowHeights,
  getTableHeight,
  getTableWidth,
  type TableBorderSide,
} from './table'
import { clamp } from './units'

function solidRect(
  left: number,
  top: number,
  width: number,
  height: number,
  fill: string,
): Rect {
  return new Rect({
    left,
    top,
    width,
    height,
    fill,
    stroke: '',
    strokeWidth: 0,
    objectCaching: false,
    selectable: false,
    evented: false,
  } as any)
}

/**
 * Render a table snapshot with Fabric. The model is the source of truth: this
 * function only walks its sparse cell data / style registry and emits a group
 * of background, fills, border segments and text boxes. Selection and scaling
 * are handled by Fabric on the group, not by any HTML overlay.
 */
export function buildTableObject(config: TableConfig): Group {
  const width = getTableWidth(config)
  const height = getTableHeight(config)
  const colWidths = getColumnWidths(config)
  const rowHeights = getRowHeights(config)
  const bw = clamp(config.borderWidth, 0, Math.max(0, Math.min(width, height) / 4))
  const children: FabricObject[] = []

  // Table background (also masks anything showing through merged regions).
  children.push(
    solidRect(0, 0, width, height, config.background || '#ffffff'),
  )

  const regions = buildRegions(config)

  // Cell fills first, so borders and text sit above them.
  for (const region of regions) {
    const style = getCellStyle(config, region.row, region.col)
    if (style.fill) {
      children.push(
        solidRect(region.x, region.y, region.width, region.height, style.fill),
      )
    }
  }

  // Borders are filled rectangles instead of strokes: a stroke would inflate
  // the group's bounding box and shift the element's reported position.
  if (bw > 0) {
    const color = config.borderColor || '#4b5563'
    // Every grid coordinate points at its visible region so merged cells can
    // share one set of border flags on their anchor cell.
    const regionAt = new Map<string, (typeof regions)[number]>()
    for (const region of regions) {
      for (let row = region.row; row < region.row + region.rowSpan; row += 1) {
        for (let col = region.col; col < region.col + region.colSpan; col += 1) {
          regionAt.set(`${row},${col}`, region)
        }
      }
    }
    const styleOf = (region: (typeof regions)[number]) =>
      getCellStyle(config, region.row, region.col)
    const sideOn = (
      region: (typeof regions)[number] | undefined,
      side: TableBorderSide,
    ) => !region || cellBorderVisible(styleOf(region), side)

    // Outer edges are drawn per region so each side can be hidden on its own.
    for (const region of regions) {
      if (region.row === 0 && sideOn(region, 'top')) {
        children.push(solidRect(region.x, 0, region.width, bw, color))
      }
      if (
        region.row + region.rowSpan === config.rowCount &&
        sideOn(region, 'bottom')
      ) {
        children.push(
          solidRect(region.x, height - bw, region.width, bw, color),
        )
      }
      if (region.col === 0 && sideOn(region, 'left')) {
        children.push(solidRect(0, region.y, bw, region.height, color))
      }
      if (
        region.col + region.colSpan === config.columnCount &&
        sideOn(region, 'right')
      ) {
        children.push(
          solidRect(width - bw, region.y, bw, region.height, color),
        )
      }
    }

    const xs = [0]
    for (const colWidth of colWidths) {
      xs.push(xs[xs.length - 1] + colWidth)
    }
    const ys = [0]
    for (const rowHeight of rowHeights) {
      ys.push(ys[ys.length - 1] + rowHeight)
    }

    // Internal edges show only when both neighbouring cells show their side.
    for (let row = 1; row < config.rowCount; row += 1) {
      for (let col = 0; col < config.columnCount; col += 1) {
        const above = regionAt.get(`${row - 1},${col}`)
        const below = regionAt.get(`${row},${col}`)
        if (!above || !below || above === below) continue
        if (!sideOn(above, 'bottom') || !sideOn(below, 'top')) continue
        children.push(
          solidRect(
            xs[col],
            ys[row] - bw / 2,
            colWidths[col],
            bw,
            color,
          ),
        )
      }
    }

    for (let col = 1; col < config.columnCount; col += 1) {
      for (let row = 0; row < config.rowCount; row += 1) {
        const left = regionAt.get(`${row},${col - 1}`)
        const right = regionAt.get(`${row},${col}`)
        if (!left || !right || left === right) continue
        if (!sideOn(left, 'right') || !sideOn(right, 'left')) continue
        children.push(
          solidRect(
            xs[col] - bw / 2,
            ys[row],
            bw,
            rowHeights[row],
            color,
          ),
        )
      }
    }
  }

  // Cell text, positioned according to vertical alignment.
  for (const region of regions) {
    const value = getCellValue(config, region.row, region.col)
    if (!value) continue
    const style = getCellStyle(config, region.row, region.col)
    const padding = Math.min(
      config.padding,
      Math.max(0, region.width / 3),
      Math.max(0, region.height / 3),
    )
    const availableWidth = Math.max(0.5, region.width - padding * 2)
    const availableHeight = Math.max(0.5, region.height - padding * 2)
    const fontSize = Math.max(
      0.5,
      Math.min(config.fontSize, availableHeight * 1.25),
    )
    const text = new Textbox(value, {
      left: region.x + padding,
      top: region.y + padding,
      width: availableWidth,
      fontSize,
      fontFamily: config.fontFamily,
      fontWeight: style.bold ? 'bold' : 'normal',
      fill: style.color || config.color || '#111827',
      textAlign: style.align || 'left',
      lineHeight: 1.15,
      splitByGrapheme: true,
      strokeWidth: 0,
      objectCaching: false,
      selectable: false,
      evented: false,
    } as any)
    ;(text as any).initDimensions?.()
    const textHeight = Math.min(
      Math.max(0, (text as any).height ?? 0),
      availableHeight,
    )
    let top = region.y + padding
    if (style.valign === 'middle') {
      top = region.y + (region.height - textHeight) / 2
    } else if (style.valign === 'bottom') {
      top = region.y + region.height - padding - textHeight
    }
    text.set({ top, left: region.x + padding })
    children.push(text)
  }

  const group = new Group(children, {
    left: 0,
    top: 0,
    objectCaching: false,
    subTargetCheck: false,
    interactive: false,
    strokeWidth: 0,
  } as any)
  group.set({
    left: 0,
    top: 0,
    width,
    height,
    strokeWidth: 0,
    objectCaching: false,
  } as any)
  ;(group as any).tableData = JSON.stringify(config)
  ;(group as any).customKind = 'table'
  return group
}
