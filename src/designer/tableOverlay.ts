import type { TableConfig } from './types'
import {
  buildRegions,
  expandRangeToMerges,
  getTableHeight,
  getTableWidth,
  normalizeRange,
  type TableRange,
} from './table'

function rangeIntersectsRegion(
  range: TableRange,
  region: { row: number; col: number; rowSpan: number; colSpan: number },
): boolean {
  return !(
    region.row + region.rowSpan - 1 < range.row ||
    region.row > range.endRow ||
    region.col + region.colSpan - 1 < range.col ||
    region.col > range.endCol
  )
}

/**
 * Paint the active cell range on the lower Fabric canvas. This runs in
 * `after:render`, so the selection is owned by Fabric rather than an absolutely
 * positioned HTML grid, and never becomes part of the serialized template.
 */
export function drawTableSelection(
  ctx: CanvasRenderingContext2D,
  config: TableConfig,
  range: TableRange,
  zoom: number,
  left: number,
  top: number,
  angle = 0,
) {
  if (zoom <= 0) return
  const width = getTableWidth(config)
  const height = getTableHeight(config)
  const normalized = normalizeRange(range)
  const expanded = expandRangeToMerges(config, normalized)
  const px = 1 / zoom
  const radians = (angle * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  // Fabric stores left/top as the rotated local origin and rotates around the
  // box centre, so reconstruct that centre before painting in table-local mm.
  const centerX = left + (cos * width) / 2 - (sin * height) / 2
  const centerY = top + (sin * width) / 2 + (cos * height) / 2

  ctx.save()
  ctx.translate(centerX * zoom, centerY * zoom)
  ctx.rotate(radians)
  ctx.scale(zoom, zoom)
  ctx.translate(-width / 2, -height / 2)

  // Editing frame around the whole table.
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.55)'
  ctx.lineWidth = px
  ctx.strokeRect(px / 2, px / 2, Math.max(0, width - px), Math.max(0, height - px))

  const regions = buildRegions(config).filter((region) =>
    rangeIntersectsRegion(expanded, region),
  )

  ctx.fillStyle = 'rgba(37, 99, 235, 0.14)'
  for (const region of regions) {
    ctx.fillRect(region.x, region.y, region.width, region.height)
  }

  for (const region of regions) {
    const anchor =
      region.row === expanded.row && region.col === expanded.col
    const lineWidth = anchor ? 2 * px : px
    const inset = lineWidth / 2
    ctx.strokeStyle = anchor
      ? 'rgba(37, 99, 235, 0.95)'
      : 'rgba(37, 99, 235, 0.55)'
    ctx.lineWidth = lineWidth
    ctx.strokeRect(
      region.x + inset,
      region.y + inset,
      Math.max(0, region.width - lineWidth),
      Math.max(0, region.height - lineWidth),
    )
  }

  ctx.restore()
}
