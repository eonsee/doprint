import { Group, Rect, Textbox } from 'fabric'
import type { FabricObject } from 'fabric'
import type { TableConfig } from './types'
import { buildRegions, getTableHeight, getTableWidth } from './table'
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
 * Build the fabric representation of a table: a group of background, cell
 * fills, border segments and textboxes. Merged cell borders are skipped, so
 * merged regions read as one continuous cell.
 */
export function buildTableObject(config: TableConfig): Group {
  const width = getTableWidth(config)
  const height = getTableHeight(config)
  const bw = clamp(config.borderWidth, 0, Math.max(0, Math.min(width, height) / 4))
  const children: FabricObject[] = []

  // Table background (also masks anything showing through merged regions).
  children.push(
    solidRect(0, 0, width, height, config.background || '#ffffff'),
  )

  const regions = buildRegions(config)

  // Cell fills first, so borders and text sit above them.
  for (const region of regions) {
    const cell = config.cells[region.row]?.[region.col]
    if (cell?.fill) {
      children.push(
        solidRect(region.x, region.y, region.width, region.height, cell.fill),
      )
    }
  }

  // Borders are filled rectangles instead of strokes: a stroke would inflate
  // the group's bounding box and shift the element's reported position.
  if (bw > 0) {
    const color = config.borderColor || '#4b5563'
    children.push(solidRect(0, 0, width, bw, color))
    children.push(solidRect(0, height - bw, width, bw, color))
    children.push(solidRect(0, 0, bw, height, color))
    children.push(solidRect(width - bw, 0, bw, height, color))

    for (let row = 1; row < config.rows; row += 1) {
      const y = config.rowHeights
        .slice(0, row)
        .reduce((sum, value) => sum + value, 0)
      let segmentStart: number | null = null
      let segmentWidth = 0
      let x = 0
      for (let col = 0; col < config.cols; col += 1) {
        const colWidth = config.colWidths[col]
        const spanned = config.merges.some(
          (merge) =>
            merge.col <= col &&
            col < merge.col + merge.colSpan &&
            merge.row < row &&
            row < merge.row + merge.rowSpan,
        )
        if (spanned) {
          if (segmentStart !== null) {
            children.push(
              solidRect(
                segmentStart,
                y - bw / 2,
                segmentWidth,
                bw,
                color,
              ),
            )
            segmentStart = null
            segmentWidth = 0
          }
        } else {
          if (segmentStart === null) segmentStart = x
          segmentWidth += colWidth
        }
        x += colWidth
      }
      if (segmentStart !== null) {
        children.push(
          solidRect(segmentStart, y - bw / 2, segmentWidth, bw, color),
        )
      }
    }

    for (let col = 1; col < config.cols; col += 1) {
      const x = config.colWidths
        .slice(0, col)
        .reduce((sum, value) => sum + value, 0)
      let segmentStart: number | null = null
      let segmentHeight = 0
      let y = 0
      for (let row = 0; row < config.rows; row += 1) {
        const rowHeight = config.rowHeights[row]
        const spanned = config.merges.some(
          (merge) =>
            merge.row <= row &&
            row < merge.row + merge.rowSpan &&
            merge.col < col &&
            col < merge.col + merge.colSpan,
        )
        if (spanned) {
          if (segmentStart !== null) {
            children.push(
              solidRect(x - bw / 2, segmentStart, bw, segmentHeight, color),
            )
            segmentStart = null
            segmentHeight = 0
          }
        } else {
          if (segmentStart === null) segmentStart = y
          segmentHeight += rowHeight
        }
        y += rowHeight
      }
      if (segmentStart !== null) {
        children.push(
          solidRect(x - bw / 2, segmentStart, bw, segmentHeight, color),
        )
      }
    }
  }

  // Cell text, positioned according to vertical alignment.
  for (const region of regions) {
    const cell = config.cells[region.row]?.[region.col]
    if (!cell || !cell.text) continue
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
    const text = new Textbox(cell.text, {
      left: region.x + padding,
      top: region.y + padding,
      width: availableWidth,
      fontSize,
      fontFamily: config.fontFamily,
      fontWeight: cell.bold ? 'bold' : 'normal',
      fill: cell.color || config.color || '#111827',
      textAlign: cell.align || 'left',
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
    if (cell.valign === 'middle') {
      top = region.y + (region.height - textHeight) / 2
    } else if (cell.valign === 'bottom') {
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
