import {
  ActiveSelection,
  Canvas,
  Color,
  Ellipse,
  FabricImage,
  FabricObject,
  Point,
  Rect,
  StaticCanvas,
  Textbox,
} from 'fabric'
import { computed, reactive, ref } from 'vue'
import type {
  DataField,
  ElementKind,
  GuideOrientation,
  LayerItem,
  PageGuide,
  PageTemplate,
  SelectionState,
  TableCell,
  TableConfig,
  TemplateElement,
  UpdatePatch,
} from './types'
import { emptySelection } from './types'
import {
  DEFAULT_FONT_PX,
  DEFAULT_PAGE,
  PAGE_PRESETS,
  PX_PER_MM,
  PX_TO_MM,
  clamp,
  round,
} from './units'
import { parseDataJson, resolveTemplateBindings } from './binding'
import {
  buildRegions,
  cellAtPoint,
  cloneTableConfig,
  createTableConfig,
  expandRangeToMerges,
  findMergeContaining,
  getTableHeight,
  getTableSize,
  getTableWidth,
  hasMergeInRange,
  mergeRegion,
  mergeToRange,
  normalizeTableConfig,
  rangeBorderState,
  rangeCellCount,
  rangeLabel,
  regionAtCell,
  resizeTable,
  setRangeBorder,
  setTableHeight,
  setTableWidth,
  splitRegion,
  updateCells,
  type TableBorderSide,
  type TableRange,
} from './table'
import { buildTableObject } from './tableFabric'
import { drawTableSelection } from './tableOverlay'
import { createPdfFromImage, previewPixelRatio } from './pdf'

const STORAGE_KEY = 'doprint.template.v1'
const LIBRARY_KEY = 'doprint.templates.v1'
const RULER_STORAGE_KEY = 'doprint.rulers.visible'
const HISTORY_LIMIT = 50
const SNAP_STEP = 1
/** Default text size in scene millimetres (14px). */
const DEFAULT_TEXT_SIZE = DEFAULT_FONT_PX * PX_TO_MM
const DEFAULT_TEXT_FILL = '#111827'
const DEFAULT_SHAPE_FILL = '#f3f4f6'
const DEFAULT_SHAPE_STROKE = '#374151'
const DEFAULT_FONT = 'SimSun'

// Make our element metadata survive cloning / serialization.
FabricObject.customProperties = [
  'elementId',
  'customKind',
  'name',
  'locked',
  'tableData',
]

let seq = 0
function uid(): string {
  seq += 1
  return `el_${Date.now().toString(36)}_${seq.toString(36)}`
}

function guideId(): string {
  seq += 1
  return `guide_${Date.now().toString(36)}_${seq.toString(36)}`
}

function templateId(): string {
  seq += 1
  return `tpl_${Date.now().toString(36)}_${seq.toString(36)}`
}

/** A stored template as shown in the template switcher. */
export interface TemplateSummary {
  id: string
  name: string
  /** millimetres */
  width: number
  /** millimetres */
  height: number
  createdAt: number
  updatedAt: number
  active: boolean
}

interface StoredTemplate {
  id: string
  template: PageTemplate
  createdAt: number
  updatedAt: number
}

interface TemplateLibrary {
  version: 1
  activeId: string
  items: StoredTemplate[]
}

export const KIND_LABEL: Record<ElementKind, string> = {
  text: '文本',
  rect: '矩形',
  ellipse: '椭圆',
  line: '线条',
  image: '图片',
  table: '表格',
}

export type LayerAction = 'up' | 'down' | 'top' | 'bottom'
export type AlignAction = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type DistributeAction = 'horizontal' | 'vertical'

// Fabric v6 reports `obj.type` in lower case (e.g. 'textbox', 'rect').
function typeOf(obj: FabricObject): string {
  return String(obj.type ?? '').toLowerCase()
}

function isTextType(type: string): boolean {
  const t = type.toLowerCase()
  return t === 'textbox' || t === 'text' || t === 'itext' || t === 'i-text'
}

function isEllipseType(type: string): boolean {
  return type.toLowerCase() === 'ellipse'
}

function isImageType(type: string): boolean {
  return type.toLowerCase() === 'image'
}

function isRectType(type: string): boolean {
  return type.toLowerCase() === 'rect'
}

function isActiveSelectionType(type: string): boolean {
  return type.toLowerCase() === 'activeselection'
}

function isTableObject(obj: FabricObject): boolean {
  const anyObj = obj as any
  return (
    anyObj.customKind === 'table' ||
    typeof anyObj.tableData === 'string'
  )
}

function kindOf(obj: FabricObject): ElementKind {
  if (isTableObject(obj)) return 'table'
  const type = typeOf(obj)
  if (isTextType(type)) return 'text'
  if (isEllipseType(type)) return 'ellipse'
  if (isImageType(type)) return 'image'
  if (isRectType(type)) return (obj as any).customKind === 'line' ? 'line' : 'rect'
  return 'rect'
}

function effectiveWidth(obj: FabricObject): number {
  return Math.abs(((obj as any).width ?? 0) * ((obj as any).scaleX ?? 1))
}

function effectiveHeight(obj: FabricObject): number {
  return Math.abs(((obj as any).height ?? 0) * ((obj as any).scaleY ?? 1))
}

function toHexColor(value: unknown): string {
  if (typeof value !== 'string' || !value || value === 'transparent') return ''
  try {
    // Fabric's Color#toHex returns the six digits without a leading "#" in v6.
    const hex = new Color(value).toHex().replace('#', '').slice(0, 6)
    return `#${hex.toLowerCase()}`
  } catch {
    return ''
  }
}

function normalizeWeight(value: unknown): 'normal' | 'bold' {
  if (typeof value === 'number') return value >= 600 ? 'bold' : 'normal'
  const s = String(value ?? '').toLowerCase()
  return s.includes('bold') || s === '600' || s === '700' || s === '800' || s === '900'
    ? 'bold'
    : 'normal'
}

function dashArrayOf(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
    .map((n) => round(n, 2))
}

/**
 * A line's thickness is a property, not a vertical scale. Keep only the two
 * length handles (plus rotation) so dragging can never make it thicker; the
 * inspector changes the height / thickness numerically.
 */
function configureLineHandles(obj: FabricObject, locked: boolean) {
  const anyObj = obj as any
  anyObj.set({ lockScalingY: true })
  anyObj.setControlsVisibility?.({
    mt: false,
    mb: false,
    tl: false,
    tr: false,
    bl: false,
    br: false,
    ml: !locked,
    mr: !locked,
    mtr: !locked,
  })
}

/** Lock movement / scaling / rotation while keeping the object selectable. */
function applyLock(obj: FabricObject, locked: boolean) {
  const anyObj = obj as any
  const table = isTableObject(obj)
  const line = kindOf(obj) === 'line'
  anyObj.locked = locked
  obj.set({
    lockMovementX: locked,
    lockMovementY: locked,
    // Every element, including tables, can be rotated. Table scaling is baked
    // into row heights / column widths on release so rotation stays clean.
    lockRotation: locked,
    lockScalingX: locked,
    lockScalingY: line ? true : locked,
    lockScalingFlip: table || line,
    hasControls: !locked,
    hasBorders: true,
    hoverCursor: locked ? 'default' : 'move',
  } as any)
  if (line) configureLineHandles(obj, locked)
  if (table) {
    // Older tables may still carry a hidden rotation handle in memory.
    anyObj.setControlsVisibility?.({ mtr: !locked })
  }
  if (isTextType(typeOf(obj))) anyObj.set('editable', !locked)
  obj.setCoords()
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

function sanitizeFilename(name: string): string {
  return (name || 'template').replace(/[\\/:*?"<>|]/g, '_').trim() || 'template'
}

function readRulersVisible(): boolean {
  try {
    const saved = localStorage.getItem(RULER_STORAGE_KEY)
    return saved === null ? true : saved !== '0'
  } catch {
    return true
  }
}

type MarginSide = 'top' | 'right' | 'bottom' | 'left'

function readMargin(value: unknown, max: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return clamp(round(number, 1), 0, max)
}

function readGuides(value: unknown, width: number, height: number): PageGuide[] {
  if (!Array.isArray(value)) return []
  const guides: PageGuide[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const record = raw as Partial<PageGuide>
    if (
      record.orientation !== 'horizontal' &&
      record.orientation !== 'vertical'
    ) {
      continue
    }
    const max = record.orientation === 'horizontal' ? height : width
    const position =
      typeof record.position === 'number' && Number.isFinite(record.position)
        ? record.position
        : 0
    guides.push({
      id: typeof record.id === 'string' && record.id ? record.id : guideId(),
      orientation: record.orientation,
      position: clamp(round(position, 1), 0, round(max, 1)),
    })
  }
  return guides
}

export function createDesigner() {
  const ready = ref(false)
  const templateName = ref('未命名模板')
  const page = reactive({
    ...DEFAULT_PAGE,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    marginVisible: true,
    guides: [] as PageGuide[],
    guidesVisible: true,
  })
  const grid = reactive({ size: 5, visible: true, snap: true })
  const view = reactive({ zoom: 3.2 })
  const rulersVisible = ref(readRulersVisible())
  const templates = ref<TemplateSummary[]>([])
  const selection = reactive<SelectionState>(emptySelection())
  const layers = ref<LayerItem[]>([])
  const objectCount = ref(0)
  const canUndo = ref(false)
  const canRedo = ref(false)
  const savedAt = ref<number | null>(null)
  const notice = ref('')
  const dataFields = ref<DataField[]>([])
  /** Editable copy of the selected table's configuration. */
  const table = ref<TableConfig | null>(null)
  const tableSelection = reactive<TableRange>({
    row: 0,
    col: 0,
    endRow: 0,
    endCol: 0,
  })
  /** Whether cells are currently being edited directly on the canvas. */
  const tableEditing = ref(false)
  /** A request from the canvas double-click handler to open a cell editor. */
  const requestedCellEdit = ref<{
    row: number
    col: number
    selectAll: boolean
  } | null>(null)
  /** Scene frame of the selected table in millimetres. */
  const tableFrame = reactive({
    left: 0,
    top: 0,
    centerX: 0,
    centerY: 0,
    width: 0,
    height: 0,
    angle: 0,
  })
  let tableElementId = ''
  let rebuildingTable = false
  /** True while dragging a cell range on the Fabric canvas. */
  let tablePointerSelecting = false

  let canvas: Canvas | null = null
  let viewportWidth = 0
  let viewportHeight = 0
  let didInitialFit = false
  let restoring = false
  let loadToken = 0
  let commitTimer: ReturnType<typeof setTimeout> | undefined
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  let history: string[] = []
  let historyIndex = -1
  let templateRecords: StoredTemplate[] = []
  let activeTemplateId = ''

  const pagePreset = computed(() => {
    const preset = PAGE_PRESETS.find(
      (p) => p.width === page.width && p.height === page.height,
    )
    return preset?.key ?? 'custom'
  })

  const zoomPercent = computed(() => Math.round((view.zoom / PX_PER_MM) * 100))

  function notify(message: string) {
    notice.value = message
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => {
      notice.value = ''
      noticeTimer = undefined
    }, 3200)
  }

  // ---------------------------------------------------------------- canvas

  function mount(el: HTMLCanvasElement) {
    if (canvas) return
    canvas = new Canvas(el, {
      width: Math.max(1, page.width * view.zoom),
      height: Math.max(1, page.height * view.zoom),
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
      selectionColor: 'rgba(37, 99, 235, 0.08)',
      selectionBorderColor: 'rgba(37, 99, 235, 0.5)',
      selectionLineWidth: 1,
      uniformScaling: false,
    })
    canvas.setZoom(view.zoom)
    bindCanvasEvents(canvas)
    ready.value = true
    void restore()
  }

  function bindCanvasEvents(c: Canvas) {
    const refresh = () => {
      refreshSelection()
      refreshLayers()
    }

    c.on('selection:created', refresh)
    c.on('selection:updated', refresh)
    c.on('selection:cleared', refresh)

    c.on('object:added', () => {
      if (restoring) return
      objectCount.value = c.getObjects().length
      refreshLayers()
      scheduleCommit()
    })

    c.on('object:removed', () => {
      if (restoring) return
      objectCount.value = c.getObjects().length
      refreshLayers()
      scheduleCommit()
    })

    c.on('object:modified', (e: any) => {
      if (restoring) return
      const target = e.target as FabricObject | undefined
      if (target && !isActiveSelectionType(typeOf(target))) {
        if (isTableObject(target)) {
          // Fabric's scaling handles stretch the rendered group. On release,
          // bake that stretch into the table snapshot and rebuild cleanly.
          resizeTableObject(target, e)
        } else {
          bakeTransform(target)
        }
      }
      refreshSelection()
      refreshLayers()
      scheduleCommit()
    })

    c.on('object:scaling', (e: any) => {
      const target = e.target as FabricObject | undefined
      if (!target || !isTableObject(target)) return
      // Keep the inspector's frame and the inline overlay in sync while the
      // Fabric controls are being dragged.
      refreshSelection()
    })

    c.on('object:moving', (e: any) => {
      const target = e.target as FabricObject | undefined
      if (!target) return
      if (grid.snap && !isActiveSelectionType(typeOf(target))) {
        target.set({
          left: Math.round(target.left / SNAP_STEP) * SNAP_STEP,
          top: Math.round(target.top / SNAP_STEP) * SNAP_STEP,
        })
      }
      refreshSelection()
    })

    c.on('text:changed', () => {
      refreshSelection()
      scheduleCommit()
    })

    // The cell range is painted by Fabric on the lower canvas. This handler
    // only rewrites the reactive selection state.
    c.on('after:render', (event: any) => {
      if (event.ctx !== (c as any).contextContainer) return
      if (!tableEditing.value || !table.value) return
      const active = c.getActiveObject()
      if (!active || !isTableObject(active)) return
      drawTableSelection(
        event.ctx,
        table.value,
        tableSelection,
        view.zoom,
        (active as any).left ?? 0,
        (active as any).top ?? 0,
        (active as any).angle ?? 0,
      )
    })

    c.on('mouse:down', (e: any) => {
      if (!tableEditing.value) return
      const target = e.target as FabricObject | undefined
      if (!target || !isTableObject(target)) {
        // Clicking the page or another element leaves cell editing.
        endTableEdit()
        return
      }
      if (target !== c.getActiveObject()) {
        endTableEdit()
        return
      }
      const cell = tableCellAtEvent(target, e)
      if (!cell) return
      ;(e.e as MouseEvent | undefined)?.preventDefault?.()
      tablePointerSelecting = true
      selectTableCells(
        cell.row,
        cell.col,
        !!(e.e as MouseEvent | undefined)?.shiftKey,
      )
      const stop = () => {
        tablePointerSelecting = false
        window.removeEventListener('pointerup', stop)
      }
      window.addEventListener('pointerup', stop)
    })

    c.on('mouse:move', (e: any) => {
      if (!tablePointerSelecting || !tableEditing.value) return
      const target = e.target as FabricObject | undefined
      if (!target || !isTableObject(target)) return
      const cell = tableCellAtEvent(target, e)
      if (!cell) return
      selectTableCells(cell.row, cell.col, true)
    })

    c.on('mouse:up', () => {
      tablePointerSelecting = false
    })

    // Fabric's built-in "click again to edit" can be blocked by resize
    // controls on short text objects (their hit area covers the whole box at
    // low zoom). Entering edit mode from the double-click event keeps editing
    // available at any zoom level.
    c.on('mouse:dblclick', (e: any) => {
      const target = e.target
      if (target && isTableObject(target)) {
        if (!tableEditing.value || c.getActiveObject() !== target) {
          c.setActiveObject(target)
          tableElementId = String((target as any).elementId ?? '')
          table.value = cloneTableConfig(tableConfigOf(target) ?? createTableConfig())
          refreshSelection()
          beginTableEdit()
        }
        const config = table.value ?? tableConfigOf(target)
        const cell = config ? tableCellAtEvent(target, e) : null
        if (config && cell) requestTableCellEdit(cell.row, cell.col, true)
        return
      }
      if (!target || !isTextType(typeOf(target)) || target.isEditing) return
      if (target.editable === false) return
      c.setActiveObject(target)
      target.enterEditing(e.e)
      c.requestRenderAll()
    })
  }

  /** Read the scene point attached to a Fabric pointer event. */
  function scenePointOfEvent(event: any): { x: number; y: number } | null {
    if (event?.scenePoint) return event.scenePoint
    const native = event?.e
    if (!canvas || !native) return null
    return canvas.getScenePoint(native)
  }

  function tableCellAtEvent(
    obj: FabricObject,
    event: any,
  ): { row: number; col: number } | null {
    const config = tableConfigOf(obj)
    const point = scenePointOfEvent(event)
    if (!config || !point) return null
    return tableCellAtScene(obj, config, point.x, point.y)
  }

  /** Convert a scene point to a table cell coordinate, including rotation. */
  function tableCellAtScene(
    obj: FabricObject,
    config: TableConfig,
    x: number,
    y: number,
  ): { row: number; col: number } | null {
    const anyObj = obj as any
    const scaleX = Math.abs(anyObj.scaleX ?? 1) || 1
    const scaleY = Math.abs(anyObj.scaleY ?? 1) || 1
    const width = getTableWidth(config) * scaleX
    const height = getTableHeight(config) * scaleY
    const angle = ((anyObj.angle ?? 0) * Math.PI) / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    // Fabric's left/top is the rotated local origin; the rotation happens
    // around the local box centre.
    const centerX = (anyObj.left ?? 0) + (cos * width) / 2 - (sin * height) / 2
    const centerY = (anyObj.top ?? 0) + (sin * width) / 2 + (cos * height) / 2
    const dx = x - centerX
    const dy = y - centerY
    const localX = (dx * cos + dy * sin) / scaleX + getTableWidth(config) / 2
    const localY = (-dx * sin + dy * cos) / scaleY + getTableHeight(config) / 2
    return cellAtPoint(config, localX, localY)
  }

  function bakeTransform(obj: FabricObject) {
    const anyObj = obj as any
    const sx = anyObj.scaleX ?? 1
    const sy = anyObj.scaleY ?? 1
    if (Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6) return

    if (isTextType(typeOf(obj))) {
      anyObj.set({
        width: Math.max(1, anyObj.width * sx),
        fontSize: Math.max(0.1, anyObj.fontSize * sy),
        scaleX: 1,
        scaleY: 1,
      })
    } else if (isEllipseType(typeOf(obj))) {
      anyObj.set({
        rx: Math.max(0.05, anyObj.rx * sx),
        ry: Math.max(0.05, anyObj.ry * sy),
        scaleX: 1,
        scaleY: 1,
      })
    } else {
      anyObj.set({
        width: Math.max(0.1, anyObj.width * sx),
        height: Math.max(0.05, anyObj.height * sy),
        scaleX: 1,
        scaleY: 1,
      })
    }
    obj.setCoords()
  }

  /**
   * Convert a Fabric scale transform on a table group into table model sizes.
   * Fabric keeps the transform origin (the corner / edge opposite the dragged
   * control) fixed in scene space; recording that same point before the rebuild
   * keeps rotated tables anchored correctly.
   */
  function resizeTableObject(obj: FabricObject, event?: any) {
    const config = tableConfigOf(obj)
    if (!config) return
    const anyObj = obj as any
    const sx = Math.abs(anyObj.scaleX ?? 1)
    const sy = Math.abs(anyObj.scaleY ?? 1)
    if (Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6) return

    const originX = event?.transform?.originX ?? 'left'
    const originY = event?.transform?.originY ?? 'top'
    const anchor = obj.getPointByOrigin(originX, originY)
    const width = Math.max(2, round(getTableWidth(config) * sx, 2))
    const height = Math.max(1, round(getTableHeight(config) * sy, 2))
    const next = setTableHeight(setTableWidth(config, width), height)
    const placement = {
      anchor,
      originX,
      originY,
      angle: round(anyObj.angle ?? 0, 2),
    }
    // This runs inside Fabric's object:modified listener, while the canvas
    // still holds the finished transform. Rebuilding the group discards the
    // active object, which finalizes that same transform and fires
    // object:modified again — recursively. Defer the rebuild until Fabric has
    // cleared the transform.
    setTimeout(() => {
      if (!canvas || canvas.getActiveObject() !== obj) return
      commitTableConfig(next, placement)
    }, 0)
  }

  function syncViewport() {
    if (!canvas) return
    const width = Math.max(1, page.width * view.zoom)
    const height = Math.max(1, page.height * view.zoom)
    canvas.setDimensions({ width, height })
    canvas.setZoom(view.zoom)
    canvas.requestRenderAll()
  }

  function setViewportSize(width: number, height: number) {
    viewportWidth = width
    viewportHeight = height
    if (!ready.value || didInitialFit) return
    didInitialFit = true
    fitToViewport()
  }

  function fitToViewport() {
    if (!viewportWidth || !viewportHeight) return
    const padding = 56
    const z = Math.min(
      (viewportWidth - padding * 2) / page.width,
      (viewportHeight - padding * 2) / page.height,
      PX_PER_MM,
    )
    view.zoom = clamp(round(z, 3), 0.3, PX_PER_MM)
  }

  function setZoom(zoom: number) {
    view.zoom = clamp(round(zoom, 3), 0.3, 12)
  }

  function zoomIn() {
    setZoom(view.zoom * 1.2)
  }

  function zoomOut() {
    setZoom(view.zoom / 1.2)
  }

  function resetZoom() {
    setZoom(PX_PER_MM)
  }

  function setPageSize(width: number, height: number) {
    page.width = clamp(round(width, 1), 20, 1000)
    page.height = clamp(round(height, 1), 20, 1000)
    clampPageMargins()
    clampPageGuides()
    fitToViewport()
    scheduleCommit()
  }

  function clampPageMargins() {
    const maxX = round(page.width / 2, 1)
    const maxY = round(page.height / 2, 1)
    page.margin.left = clamp(round(page.margin.left, 1), 0, maxX)
    page.margin.right = clamp(round(page.margin.right, 1), 0, maxX)
    page.margin.top = clamp(round(page.margin.top, 1), 0, maxY)
    page.margin.bottom = clamp(round(page.margin.bottom, 1), 0, maxY)
  }

  function setPageMargin(side: MarginSide, value: number) {
    const horizontal = side === 'left' || side === 'right'
    const max = round((horizontal ? page.width : page.height) / 2, 1)
    const next = Number.isFinite(value) ? value : 0
    page.margin[side] = clamp(round(next, 1), 0, max)
    scheduleCommit()
  }

  function setPageMarginVisible(visible: boolean) {
    page.marginVisible = visible
    scheduleCommit()
  }

  function clampGuidePosition(
    orientation: GuideOrientation,
    position: number,
  ): number {
    const max = orientation === 'horizontal' ? page.height : page.width
    const value = Number.isFinite(position) ? position : 0
    return clamp(round(value, 1), 0, round(max, 1))
  }

  function clampPageGuides() {
    for (const guide of page.guides) {
      guide.position = clampGuidePosition(guide.orientation, guide.position)
    }
  }

  function addGuide(orientation: GuideOrientation, position: number) {
    page.guides.push({
      id: guideId(),
      orientation,
      position: clampGuidePosition(orientation, position),
    })
    scheduleCommit()
  }

  /** Move a guide while dragging; call commitGuides() when the drag ends. */
  function moveGuide(id: string, position: number) {
    const guide = page.guides.find((item) => item.id === id)
    if (!guide) return
    guide.position = clampGuidePosition(guide.orientation, position)
  }

  function commitGuides() {
    scheduleCommit()
  }

  function removeGuide(id: string) {
    const index = page.guides.findIndex((item) => item.id === id)
    if (index < 0) return
    page.guides.splice(index, 1)
    scheduleCommit()
  }

  function clearGuides() {
    if (!page.guides.length) return
    page.guides.splice(0, page.guides.length)
    scheduleCommit()
  }

  function setGuidesVisible(visible: boolean) {
    page.guidesVisible = visible
    scheduleCommit()
  }

  function setRulersVisible(visible: boolean) {
    rulersVisible.value = visible
    try {
      localStorage.setItem(RULER_STORAGE_KEY, visible ? '1' : '0')
    } catch {
      // Storage may be unavailable; the toggle still works for this session.
    }
  }

  function setPreset(key: string) {
    const preset = PAGE_PRESETS.find((p) => p.key === key)
    if (!preset || preset.key === 'custom') return
    setPageSize(preset.width, preset.height)
  }

  function setTemplateName(name: string) {
    templateName.value = name
    const record = templateRecords.find(
      (item) => item.id === activeTemplateId,
    )
    if (record) {
      record.template.name = name
      record.updatedAt = Date.now()
      refreshTemplates()
      writeLibrary()
    }
    scheduleCommit()
  }

  function setGridSize(size: number) {
    grid.size = [1, 5, 10].includes(size) ? size : 5
    scheduleCommit()
  }

  function setGridVisible(visible: boolean) {
    grid.visible = visible
    scheduleCommit()
  }

  function setGridSnap(snap: boolean) {
    grid.snap = snap
    scheduleCommit()
  }

  // ------------------------------------------------------------- selection

  function tableConfigOf(obj: FabricObject): TableConfig | null {
    const raw = (obj as any).tableData
    if (typeof raw !== 'string' || !raw) return null
    try {
      return normalizeTableConfig(JSON.parse(raw))
    } catch {
      return null
    }
  }

  function sinkTableSelection() {
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    const single = objs.length === 1
    const config = single && kindOf(objs[0]) === 'table'
      ? tableConfigOf(objs[0])
      : null
    if (!config) {
      // Rebuilding the table briefly clears the active object; only leave
      // cell edit mode when the selection really moved away from it.
      if (!rebuildingTable) endTableEdit()
      table.value = null
      tableElementId = ''
      tableFrame.left = 0
      tableFrame.top = 0
      tableFrame.centerX = 0
      tableFrame.centerY = 0
      tableFrame.width = 0
      tableFrame.height = 0
      tableFrame.angle = 0
      return
    }
    table.value = cloneTableConfig(config)
    const id = String((objs[0] as any).elementId ?? '')
    if (id !== tableElementId) {
      // Selecting another table (usually from the layers panel) ends direct
      // editing for the previous one and restores its selection border.
      if (!rebuildingTable) endTableEdit()
      tableElementId = id
      tableSelection.row = 0
      tableSelection.col = 0
      tableSelection.endRow = 0
      tableSelection.endCol = 0
    }
    clampTableSelection(config)
  }

  function refreshSelection() {
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    if (!objs.length) {
      Object.assign(selection, emptySelection())
      if (!rebuildingTable) endTableEdit()
      table.value = null
      tableElementId = ''
      tableFrame.left = 0
      tableFrame.top = 0
      tableFrame.centerX = 0
      tableFrame.centerY = 0
      tableFrame.width = 0
      tableFrame.height = 0
      tableFrame.angle = 0
      return
    }

    const first = objs[0] as any
    const single = objs.length === 1
    const kind = single ? kindOf(objs[0]) : null

    selection.count = objs.length
    selection.kind = kind
    selection.kindLabel = kind ? KIND_LABEL[kind] : `${objs.length} 个对象`
    selection.isText = kind === 'text'
    selection.isShape = kind === 'rect' || kind === 'ellipse'
    selection.isImage = kind === 'image'
    selection.isLine = kind === 'line'
    selection.isTable = kind === 'table'

    if (single) {
      selection.layout.left = round(first.left ?? 0, 1)
      selection.layout.top = round(first.top ?? 0, 1)
      selection.layout.width = round(effectiveWidth(objs[0]), 1)
      selection.layout.height = round(effectiveHeight(objs[0]), 1)
      selection.layout.angle = round(first.angle ?? 0, 1)
      selection.layout.opacity = first.opacity ?? 1
    } else {
      selection.layout.left = 0
      selection.layout.top = 0
      selection.layout.width = 0
      selection.layout.height = 0
      selection.layout.angle = 0
      selection.layout.opacity = first.opacity ?? 1
    }
    selection.layout.locked = !!first.locked

    selection.style.fill = toHexColor(first.fill)
    selection.style.stroke = toHexColor(first.stroke)
    selection.style.strokeWidth = round(first.strokeWidth ?? 0, 2)
    selection.style.strokeDash = dashArrayOf(first.strokeDashArray)
    selection.style.radius = round(
      (first.rx ?? 0) *
        ((Math.abs(first.scaleX ?? 1) + Math.abs(first.scaleY ?? 1)) / 2),
      2,
    )
    selection.style.name = first.name || (kind ? KIND_LABEL[kind] : '')
    selection.style.visible = first.visible !== false

    selection.text.content = first.text ?? ''
    selection.text.fontSize = round((first.fontSize ?? 0) * Math.abs(first.scaleY ?? 1), 2)
    selection.text.fontFamily = first.fontFamily || DEFAULT_FONT
    selection.text.fontWeight = normalizeWeight(first.fontWeight)
    selection.text.fontStyle = first.fontStyle === 'italic' ? 'italic' : 'normal'
    selection.text.underline = !!first.underline
    selection.text.letterSpacing = round(
      ((first.charSpacing ?? 0) *
        (first.fontSize ?? 0) *
        Math.abs(first.scaleY ?? 1)) /
        1000,
      2,
    )
    selection.text.textAlign = first.textAlign || 'left'
    selection.text.lineHeight = round(first.lineHeight ?? 1.3, 2)
    selection.text.backgroundColor = toHexColor(first.backgroundColor)

    sinkTableSelection()

    if (single && kind === 'table' && table.value) {
      const scaleX = Math.abs(first.scaleX ?? 1) || 1
      const scaleY = Math.abs(first.scaleY ?? 1) || 1
      const center = objs[0].getCenterPoint()
      tableFrame.left = first.left ?? 0
      tableFrame.top = first.top ?? 0
      tableFrame.centerX = center.x
      tableFrame.centerY = center.y
      tableFrame.width = getTableWidth(table.value) * scaleX
      tableFrame.height = getTableHeight(table.value) * scaleY
      tableFrame.angle = first.angle ?? 0
    } else {
      tableFrame.left = 0
      tableFrame.top = 0
      tableFrame.centerX = 0
      tableFrame.centerY = 0
      tableFrame.width = 0
      tableFrame.height = 0
      tableFrame.angle = 0
    }
  }

  /**
   * Shared font / size of the template, shown by the top bar's global controls.
   * `layers` is read to re-evaluate after canvas mutations, which are not
   * reactive on their own.
   */
  const globalTextStyle = computed(() => {
    void layers.value
    const objects = canvas ? canvas.getObjects() : []
    let fontFamily = DEFAULT_FONT
    let fontSize = DEFAULT_TEXT_SIZE
    let count = 0
    for (const obj of objects) {
      if (isTextType(typeOf(obj))) {
        const anyObj = obj as any
        if (!count) {
          fontFamily = anyObj.fontFamily || DEFAULT_FONT
          fontSize =
            (anyObj.fontSize ?? DEFAULT_TEXT_SIZE) * Math.abs(anyObj.scaleY ?? 1)
        }
        count += 1
      } else if (isTableObject(obj)) {
        const config = tableConfigOf(obj)
        if (config) {
          if (!count) {
            fontFamily = config.fontFamily
            fontSize = config.fontSize
          }
          count += 1
        }
      }
    }
    return {
      fontFamily,
      fontSizePx: round(fontSize * PX_PER_MM, 1),
      count,
    }
  })

  function refreshLayers() {
    if (!canvas) return
    const activeIds = new Set(
      canvas
        .getActiveObjects()
        .map((o) => String((o as any).elementId ?? '')),
    )
    layers.value = canvas
      .getObjects()
      .slice()
      .reverse()
      .map((obj) => {
        const kind = kindOf(obj)
        const id = String((obj as any).elementId ?? '')
        return {
          id,
          name: (obj as any).name || KIND_LABEL[kind],
          kind,
          visible: obj.visible !== false,
          locked: (obj as any).locked === true,
          active: activeIds.has(id),
        }
      })
  }

  function selectById(id: string, additive = false) {
    if (!canvas) return
    const obj = canvas.getObjects().find((o) => String((o as any).elementId) === id)
    if (!obj || obj.visible === false) return
    if (!additive) {
      canvas.setActiveObject(obj)
    } else {
      const current = canvas.getActiveObjects()
      const next = current.includes(obj)
        ? current.filter((item) => item !== obj)
        : [...current, obj]
      canvas.discardActiveObject()
      if (next.length) {
        selectObjects(next)
      } else {
        canvas.requestRenderAll()
        refreshSelection()
        refreshLayers()
      }
      return
    }
    canvas.requestRenderAll()
    refreshSelection()
    refreshLayers()
  }

  function toggleVisible(id: string) {
    if (!canvas) return
    const obj = canvas.getObjects().find((o) => String((o as any).elementId) === id)
    if (!obj) return
    if (obj.visible !== false && canvas.getActiveObjects().includes(obj)) {
      canvas.discardActiveObject()
    }
    obj.set('visible', obj.visible === false)
    obj.setCoords()
    canvas.requestRenderAll()
    refreshSelection()
    refreshLayers()
    scheduleCommit()
  }

  function clearSelection() {
    if (!canvas) return
    if (tableEditing.value) endTableEdit()
    canvas.discardActiveObject()
    canvas.requestRenderAll()
    refreshSelection()
    refreshLayers()
  }

  function exitTextEditing() {
    const active = canvas?.getActiveObject() as any
    if (active && active.isEditing) active.exitEditing()
  }

  function selectObjects(objs: FabricObject[]) {
    if (!canvas || !objs.length) return
    if (objs.length === 1) {
      canvas.setActiveObject(objs[0])
    } else {
      const group = new ActiveSelection(objs, { canvas })
      canvas.setActiveObject(group)
    }
    canvas.requestRenderAll()
    refreshSelection()
    refreshLayers()
  }

  // ---------------------------------------------------------------- adding

  function nextPosition(width: number, height: number) {
    const count = canvas?.getObjects().length ?? 0
    const offset = (count % 10) * 3
    return {
      left: Math.max(0, round(page.width / 2 - width / 2 + offset, 1)),
      top: Math.max(0, round(page.height / 2 - height / 2 + offset, 1)),
    }
  }

  function nextName(kind: ElementKind) {
    const count =
      canvas?.getObjects().filter((o) => kindOf(o) === kind).length ?? 0
    return `${KIND_LABEL[kind]} ${count + 1}`
  }

  const CONTROL_STYLE = {
    objectCaching: false,
    cornerColor: '#ffffff',
    cornerStrokeColor: '#2563eb',
    cornerStyle: 'circle',
    transparentCorners: false,
    borderColor: 'rgba(37, 99, 235, 0.6)',
    borderScaleFactor: 1.2,
  }

  function decorate(obj: FabricObject, kind: ElementKind, name?: string) {
    const anyObj = obj as any
    anyObj.elementId = uid()
    if (kind === 'line') anyObj.customKind = 'line'
    anyObj.name = name || nextName(kind)
    obj.set(CONTROL_STYLE as any)
    if (kind === 'line') configureLineHandles(obj, false)
    return obj
  }

  function commitAdd(obj: FabricObject) {
    if (!canvas) return
    canvas.add(obj)
    obj.setCoords()
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
    refreshSelection()
    refreshLayers()
    scheduleCommit()
  }

  function addText() {
    if (!canvas) return
    const width = 60
    const pos = nextPosition(width, 14)
    const text = new Textbox('双击编辑文本', {
      ...pos,
      width,
      fontSize: DEFAULT_TEXT_SIZE,
      fontFamily: DEFAULT_FONT,
      fontWeight: 'normal',
      fill: DEFAULT_TEXT_FILL,
      textAlign: 'left',
      lineHeight: 1.3,
      splitByGrapheme: true,
      editable: true,
    } as any)
    decorate(text, 'text')
    commitAdd(text)
  }

  function addRect() {
    if (!canvas) return
    const width = 40
    const height = 25
    const rect = new Rect({
      ...nextPosition(width, height),
      width,
      height,
      fill: DEFAULT_SHAPE_FILL,
      stroke: DEFAULT_SHAPE_STROKE,
      strokeWidth: 0.2,
      strokeUniform: true,
      rx: 0,
      ry: 0,
    } as any)
    decorate(rect, 'rect')
    commitAdd(rect)
  }

  function addEllipse() {
    if (!canvas) return
    const width = 30
    const height = 20
    const ellipse = new Ellipse({
      ...nextPosition(width, height),
      rx: width / 2,
      ry: height / 2,
      fill: DEFAULT_SHAPE_FILL,
      stroke: DEFAULT_SHAPE_STROKE,
      strokeWidth: 0.2,
      strokeUniform: true,
    } as any)
    decorate(ellipse, 'ellipse')
    commitAdd(ellipse)
  }

  function addLine() {
    if (!canvas) return
    const width = 60
    const height = 0.4
    const line = new Rect({
      ...nextPosition(width, height),
      width,
      height,
      fill: DEFAULT_TEXT_FILL,
      stroke: '',
      strokeWidth: 0,
      strokeUniform: true,
      padding: 1.5,
    } as any)
    decorate(line, 'line')
    commitAdd(line)
  }

  function addTable(rows = 3, cols = 3) {
    if (!canvas) return
    const width = Math.min(120, Math.max(20, page.width - 30))
    const config = createTableConfig(rows, cols, width)
    const size = getTableSize(config)
    const group = buildTableObject(config)
    group.set(nextPosition(size.width, size.height) as any)
    decorate(group, 'table')
    applyLock(group, false)
    commitAdd(group)
  }

  async function addImageFile(file: File) {
    if (!canvas) return
    if (!file.type.startsWith('image/')) {
      notify('请选择图片文件')
      return
    }
    try {
      const dataUrl = await fileToDataURL(file)
      const image = await FabricImage.fromURL(dataUrl)
      const naturalWidth = image.width || 1
      const naturalHeight = image.height || 1
      const aspect = naturalWidth / naturalHeight
      let width = Math.min(80, page.width * 0.6)
      let height = width / aspect
      if (height > 80) {
        height = 80
        width = height * aspect
      }
      image.set({
        ...nextPosition(width, height),
        width: Math.max(1, round(width, 1)),
        height: Math.max(1, round(height, 1)),
        scaleX: 1,
        scaleY: 1,
      } as any)
      decorate(image, 'image')
      commitAdd(image)
    } catch (err) {
      console.warn(err)
      notify('图片加载失败')
    }
  }

  async function replaceSelectedImage(file: File) {
    if (!canvas) return
    const active = canvas.getActiveObject() as any
    if (!active || !isImageType(typeOf(active))) return
    if (!file.type.startsWith('image/')) {
      notify('请选择图片文件')
      return
    }
    try {
      const dataUrl = await fileToDataURL(file)
      await active.setSrc(dataUrl)
      active.setCoords()
      canvas.requestRenderAll()
      refreshSelection()
      refreshLayers()
      scheduleCommit()
    } catch (err) {
      console.warn(err)
      notify('图片替换失败')
    }
  }

  async function addImageFromSrc(src: string) {
    if (!canvas || !src) return
    try {
      const image = await FabricImage.fromURL(src)
      const naturalWidth = image.width || 1
      const naturalHeight = image.height || 1
      const aspect = naturalWidth / naturalHeight
      let width = Math.min(80, page.width * 0.6)
      let height = width / aspect
      if (height > 80) {
        height = 80
        width = height * aspect
      }
      image.set({
        ...nextPosition(width, height),
        width: Math.max(1, round(width, 1)),
        height: Math.max(1, round(height, 1)),
        scaleX: 1,
        scaleY: 1,
      } as any)
      decorate(image, 'image')
      commitAdd(image)
    } catch (err) {
      console.warn(err)
      notify('图片加载失败')
    }
  }

  // --------------------------------------------------------------- actions

  function deleteSelected() {
    if (!canvas) return
    exitTextEditing()
    const objs = canvas.getActiveObjects()
    if (!objs.length) return
    canvas.discardActiveObject()
    canvas.remove(...objs)
    canvas.requestRenderAll()
    refreshSelection()
    refreshLayers()
    scheduleCommit()
  }

  async function duplicateSelected() {
    if (!canvas) return
    exitTextEditing()
    const objs = canvas.getActiveObjects()
    if (!objs.length) return
    canvas.discardActiveObject()
    const clones: FabricObject[] = []
    try {
      for (const obj of objs) {
        const clone = await obj.clone()
        const kind = kindOf(clone)
        decorate(clone, kind)
        applyLock(clone, (clone as any).locked === true)
        clone.set({
          left: (clone.left ?? 0) + 2,
          top: (clone.top ?? 0) + 2,
          visible: true,
        })
        clone.setCoords()
        canvas.add(clone)
        clones.push(clone)
      }
      selectObjects(clones)
      canvas.requestRenderAll()
      scheduleCommit()
    } catch (err) {
      console.warn(err)
      notify('复制失败')
    }
  }

  function moveSelected(action: LayerAction) {
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    if (!objs.length) return
    const topDown = action === 'up' || action === 'top'
    const ordered = topDown ? [...objs].reverse() : objs
    for (const obj of ordered) {
      if (action === 'up') canvas.bringObjectForward(obj)
      else if (action === 'down') canvas.sendObjectBackwards(obj)
      else if (action === 'top') canvas.bringObjectToFront(obj)
      else canvas.sendObjectToBack(obj)
    }
    canvas.requestRenderAll()
    refreshLayers()
    scheduleCommit()
  }

  function toggleLocked() {
    if (!canvas) return
    exitTextEditing()
    const objs = canvas.getActiveObjects()
    if (!objs.length) return
    const lock = !(objs[0] as any).locked
    for (const obj of objs) applyLock(obj, lock)
    canvas.requestRenderAll()
    refreshSelection()
    refreshLayers()
    scheduleCommit()
  }

  /**
   * Run a mutation with the selection temporarily dissolved, so every object
   * uses absolute page coordinates and can safely be reselected afterwards.
   */
  function mutateSelection(objs: FabricObject[], mutate: (objs: FabricObject[]) => void) {
    if (!canvas) return
    canvas.discardActiveObject()
    for (const obj of objs) obj.setCoords()
    mutate(objs)
    for (const obj of objs) obj.setCoords()
    selectObjects(objs)
    canvas.requestRenderAll()
    refreshSelection()
    refreshLayers()
    scheduleCommit()
  }

  function alignSelected(action: AlignAction) {
    if (!canvas) return
    const all = canvas.getActiveObjects()
    const movable = all.filter((o) => !(o as any).locked)
    if (movable.length < 2) return
    mutateSelection(all, () => {
      // Bounds only consider unlocked objects: a locked item acts as an
      // anchor and must never be moved by an alignment command.
      const rects = movable.map((o) => ({ o, r: o.getBoundingRect() }))
      const left = Math.min(...rects.map((x) => x.r.left))
      const right = Math.max(...rects.map((x) => x.r.left + x.r.width))
      const top = Math.min(...rects.map((x) => x.r.top))
      const bottom = Math.max(...rects.map((x) => x.r.top + x.r.height))
      for (const { o, r } of rects) {
        let dx = 0
        let dy = 0
        if (action === 'left') dx = left - r.left
        else if (action === 'center') {
          dx = (left + right) / 2 - (r.left + r.width / 2)
        } else if (action === 'right') dx = right - (r.left + r.width)
        else if (action === 'top') dy = top - r.top
        else if (action === 'middle') {
          dy = (top + bottom) / 2 - (r.top + r.height / 2)
        } else dy = bottom - (r.top + r.height)
        const anyObj = o as any
        anyObj.set({
          left: (anyObj.left ?? 0) + dx,
          top: (anyObj.top ?? 0) + dy,
        })
      }
    })
  }

  function distributeSelected(axis: DistributeAction) {
    if (!canvas) return
    const all = canvas.getActiveObjects()
    const movable = all.filter((o) => !(o as any).locked)
    if (movable.length < 3) return
    mutateSelection(all, () => {
      const rects = movable.map((o) => ({ o, r: o.getBoundingRect() }))
      const center = (r: { left: number; top: number; width: number; height: number }) =>
        axis === 'horizontal' ? r.left + r.width / 2 : r.top + r.height / 2
      rects.sort((a, b) => center(a.r) - center(b.r))
      const from = center(rects[0].r)
      const to = center(rects[rects.length - 1].r)
      const step = (to - from) / (rects.length - 1)
      for (let i = 1; i < rects.length - 1; i += 1) {
        const delta = from + step * i - center(rects[i].r)
        const anyObj = rects[i].o as any
        if (axis === 'horizontal') anyObj.set('left', (anyObj.left ?? 0) + delta)
        else anyObj.set('top', (anyObj.top ?? 0) + delta)
      }
    })
  }

  function nudge(dx: number, dy: number) {
    if (!canvas) return
    let active = canvas.getActiveObject()
    if (!active) return
    if (isActiveSelectionType(typeOf(active))) {
      const objs = canvas.getActiveObjects()
      const movable = objs.filter((o) => !(o as any).locked)
      if (!movable.length) return
      if (movable.length !== objs.length) {
        // Locked children must stay put; nudge only the unlocked ones.
        canvas.discardActiveObject()
        selectObjects(movable)
        active = canvas.getActiveObject()
        if (!active) return
      }
    } else if ((active as any).locked) {
      return
    }
    active.set({
      left: (active.left ?? 0) + dx,
      top: (active.top ?? 0) + dy,
    })
    active.setCoords()
    canvas.requestRenderAll()
    refreshSelection()
    scheduleCommit()
  }

  function applyWidth(obj: any, value: number) {
    const v = Math.max(0.2, value)
    const sx = Math.abs(obj.scaleX || 1)
    if (isEllipseType(typeOf(obj))) {
      obj.set({ rx: v / 2 / sx })
    } else {
      obj.set({ width: v / sx })
    }
  }

  function applyHeight(obj: any, value: number) {
    const v = Math.max(0.05, value)
    const sy = Math.abs(obj.scaleY || 1)
    if (isEllipseType(typeOf(obj))) {
      obj.set({ ry: v / 2 / sy })
    } else if (isTextType(typeOf(obj))) {
      // text height is derived from wrapping / font size
    } else {
      obj.set({ height: v / sy })
    }
  }

  function updateSelected(patch: UpdatePatch) {
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    if (!objs.length) return
    const single = objs.length === 1

    for (const obj of objs as any[]) {
      const tableObj = isTableObject(obj)
      if (single) {
        if (patch.left !== undefined) obj.set('left', patch.left)
        if (patch.top !== undefined) obj.set('top', patch.top)
        if (!tableObj) {
          if (patch.width !== undefined) applyWidth(obj, patch.width)
          if (patch.height !== undefined) applyHeight(obj, patch.height)
        }
        // `rotate` (unlike set('angle')) keeps the element's centre fixed, so
        // typing an angle behaves like dragging the rotation handle.
        if (patch.angle !== undefined) obj.rotate(patch.angle)
        if (patch.name !== undefined) obj.set('name', patch.name)
      }

      if (patch.locked !== undefined) applyLock(obj, patch.locked)
      if (patch.opacity !== undefined) obj.set('opacity', clamp(patch.opacity, 0, 1))
      if (patch.visible !== undefined) obj.set('visible', patch.visible)

      if (!tableObj) {
        if (patch.fill !== undefined) obj.set('fill', patch.fill || '')
        if (patch.stroke !== undefined) obj.set('stroke', patch.stroke || '')
        if (patch.strokeWidth !== undefined) {
          obj.set('strokeWidth', Math.max(0, patch.strokeWidth))
        }
        if (patch.strokeDash !== undefined) {
          obj.set(
            'strokeDashArray',
            patch.strokeDash.length ? patch.strokeDash : null,
          )
        }
        if (patch.radius !== undefined && isRectType(typeOf(obj))) {
          const scale =
            (Math.abs(obj.scaleX || 1) + Math.abs(obj.scaleY || 1)) / 2
          const radius = Math.max(0, patch.radius) / Math.max(0.0001, scale)
          obj.set({ rx: radius, ry: radius })
        }
      }

      if (!tableObj && isTextType(typeOf(obj))) {
        if (patch.text !== undefined) obj.set('text', patch.text)
        if (patch.fontSize !== undefined) {
          const sy = Math.abs(obj.scaleY || 1)
          obj.set('fontSize', Math.max(0.5, patch.fontSize / sy))
        }
        if (patch.fontFamily !== undefined) obj.set('fontFamily', patch.fontFamily)
        if (patch.fontWeight !== undefined) obj.set('fontWeight', patch.fontWeight)
        if (patch.fontStyle !== undefined) obj.set('fontStyle', patch.fontStyle)
        if (patch.underline !== undefined) obj.set('underline', patch.underline)
        if (patch.textBackground !== undefined) {
          obj.set('backgroundColor', patch.textBackground || '')
        }
        if (patch.letterSpacing !== undefined) {
          const fontSize = Math.max(
            0.1,
            (obj.fontSize || 1) * Math.abs(obj.scaleY || 1),
          )
          obj.set(
            'charSpacing',
            Math.max(-1000, Math.min(5000, (patch.letterSpacing / fontSize) * 1000)),
          )
        }
        if (patch.textAlign !== undefined) obj.set('textAlign', patch.textAlign)
        if (patch.lineHeight !== undefined) {
          obj.set('lineHeight', Math.max(0.5, patch.lineHeight))
        }
      }

      obj.setCoords()
    }

    canvas.requestRenderAll()
    refreshSelection()
    refreshLayers()
    scheduleCommit()
  }

  /**
   * Apply a font family / size to every text element and table at once. The
   * top bar's global controls use this; the whole change is one undo step.
   */
  function applyGlobalTextStyle(patch: {
    fontFamily?: string
    fontSizePx?: number
  }) {
    if (!canvas) return
    const fontSize =
      patch.fontSizePx === undefined
        ? undefined
        : clamp(patch.fontSizePx, 4, 300) * PX_TO_MM
    const objects = canvas.getObjects()
    let changed = 0

    canvas.discardActiveObject()

    for (const obj of objects) {
      const anyObj = obj as any
      if (isTextType(typeOf(obj))) {
        if (patch.fontFamily !== undefined) {
          anyObj.set('fontFamily', patch.fontFamily)
        }
        if (fontSize !== undefined) {
          anyObj.set(
            'fontSize',
            Math.max(0.5, fontSize / Math.abs(anyObj.scaleY || 1)),
          )
        }
        obj.setCoords()
        changed += 1
        continue
      }
      if (!isTableObject(obj)) continue
      const config = tableConfigOf(obj)
      if (!config) continue
      if (patch.fontFamily !== undefined) config.fontFamily = patch.fontFamily
      if (fontSize !== undefined) config.fontSize = fontSize
      const next = normalizeTableConfig(config)
      const group = buildTableObject(next)
      const index = canvas.getObjects().indexOf(obj)
      group.set({
        left: anyObj.left ?? 0,
        top: anyObj.top ?? 0,
        angle: anyObj.angle ?? 0,
        scaleX: 1,
        scaleY: 1,
        opacity: anyObj.opacity ?? 1,
        visible: anyObj.visible !== false,
        name: anyObj.name || KIND_LABEL.table,
        elementId: anyObj.elementId || uid(),
        locked: anyObj.locked === true,
      } as any)
      ;(group as any).customKind = 'table'
      group.set(CONTROL_STYLE as any)
      applyLock(group, anyObj.locked === true)
      canvas.remove(obj)
      canvas.insertAt(index, group)
      changed += 1
    }

    if (!changed) return
    canvas.requestRenderAll()
    refreshSelection()
    refreshLayers()
    scheduleCommit()
  }

  // ------------------------------------------------------------------ table

  const tableSize = computed(() =>
    table.value ? getTableSize(table.value) : { width: 0, height: 0 },
  )

  const tableExpandedRange = computed<TableRange | null>(() =>
    table.value ? expandRangeToMerges(table.value, tableSelection) : null,
  )

  const tableRangeLabel = computed(() =>
    table.value ? rangeLabel(tableSelection) : '',
  )

  const tableSelectionCount = computed(() =>
    tableExpandedRange.value
      ? rangeCellCount(tableExpandedRange.value)
      : 0,
  )

  const tableCanMerge = computed(() => {
    if (!table.value || !tableExpandedRange.value) return false
    if (tableSelectionCount.value <= 1) return false
    const expanded = tableExpandedRange.value
    return !table.value.mergeData.some(
      (merge) =>
        merge.startRow === expanded.row &&
        merge.endRow === expanded.endRow &&
        merge.startColumn === expanded.col &&
        merge.endColumn === expanded.endCol,
    )
  })

  const tableCanSplit = computed(() => {
    if (!table.value || !tableExpandedRange.value) return false
    return hasMergeInRange(table.value, tableExpandedRange.value)
  })

  const tableBorderState = computed(() =>
    table.value
      ? rangeBorderState(table.value, tableSelection)
      : { top: true, right: true, bottom: true, left: true },
  )

  function clampTableSelection(config: TableConfig) {
    // Anchor and end may be in any order: a shift-click can select upwards or
    // leftwards, so each coordinate is clamped independently.
    tableSelection.row = clamp(tableSelection.row, 0, config.rowCount - 1)
    tableSelection.col = clamp(tableSelection.col, 0, config.columnCount - 1)
    tableSelection.endRow = clamp(
      tableSelection.endRow,
      0,
      config.rowCount - 1,
    )
    tableSelection.endCol = clamp(
      tableSelection.endCol,
      0,
      config.columnCount - 1,
    )
  }

  function commitTableConfig(
    next: TableConfig,
    placement?: {
      left?: number
      top?: number
      anchor?: { x: number; y: number }
      originX?: string
      originY?: string
      angle?: number
    },
  ) {
    if (!canvas) return
    const active = canvas.getActiveObject() as FabricObject | null
    if (!active || !isTableObject(active)) return
    const normalized = normalizeTableConfig(next)
    const group = buildTableObject(normalized)
    const old = active as any
    const preservedId = String(old.elementId || (group as any).elementId || '')
    const index = canvas.getObjects().indexOf(active)
    group.set({
      left: placement?.left ?? old.left ?? 0,
      top: placement?.top ?? old.top ?? 0,
      angle: placement?.angle ?? old.angle ?? 0,
      scaleX: 1,
      scaleY: 1,
      opacity: old.opacity ?? 1,
      visible: old.visible !== false,
      name: old.name || KIND_LABEL.table,
      elementId: old.elementId || uid(),
      locked: old.locked === true,
    } as any)
    ;(group as any).customKind = 'table'
    group.set(CONTROL_STYLE as any)
    applyLock(group, old.locked === true)
    if (tableEditing.value) setTableControlsEditing(group, true)
    if (placement?.anchor) {
      // Keep the same scene anchor Fabric used while scaling, so a rotated
      // table does not jump when its new dimensions replace the scale.
      group.setPositionByOrigin(
        new Point(placement.anchor.x, placement.anchor.y),
        (placement.originX ?? 'left') as any,
        (placement.originY ?? 'top') as any,
      )
    }
    rebuildingTable = true
    try {
      canvas.discardActiveObject()
      canvas.remove(active)
      canvas.insertAt(index, group)
      group.setCoords()
      // discardActiveObject clears the tracked id; restore it so the cell
      // selection survives a style / resize rebuild instead of jumping to R1C1.
      tableElementId = preservedId
      canvas.setActiveObject(group)
    } finally {
      rebuildingTable = false
    }
    canvas.requestRenderAll()
    table.value = cloneTableConfig(normalized)
    clampTableSelection(normalized)
    refreshSelection()
    refreshLayers()
    scheduleCommit()
  }

  /**
   * While cells are being edited the table should not move or show scaling
   * controls; the same group remains the pointer target for cell hit-testing.
   */
  function setTableControlsEditing(obj: FabricObject, editing: boolean) {
    if (editing) {
      obj.set({
        hasBorders: false,
        hasControls: false,
        lockMovementX: true,
        lockMovementY: true,
        hoverCursor: 'cell',
      } as any)
    } else {
      applyLock(obj, (obj as any).locked === true)
      obj.set({ hasBorders: true } as any)
    }
    obj.setCoords()
  }

  /** Enter direct cell editing: Fabric owns hit-testing and the range overlay. */
  function beginTableEdit() {
    if (!canvas || !table.value) return
    const active = canvas.getActiveObject() as FabricObject | null
    if (!active || !isTableObject(active)) return
    tableEditing.value = true
    // The range is painted by Fabric, so its normal border would double up.
    setTableControlsEditing(active, true)
    canvas.requestRenderAll()
  }

  /** Leave direct cell editing and restore the normal Fabric selection. */
  function endTableEdit() {
    if (!tableEditing.value && !requestedCellEdit.value) return
    const editedId = tableElementId
    tableEditing.value = false
    requestedCellEdit.value = null
    tablePointerSelecting = false
    if (!canvas) return
    // The selection may already have moved to another object (e.g. via the
    // layers panel), so find the edited table by id rather than by selection.
    const target = canvas
      .getObjects()
      .find((obj) => String((obj as any).elementId ?? '') === editedId)
    if (target && isTableObject(target)) {
      setTableControlsEditing(target, false)
    } else {
      const active = canvas.getActiveObject() as FabricObject | null
      if (active && isTableObject(active)) {
        setTableControlsEditing(active, false)
      }
    }
    canvas.requestRenderAll()
  }

  /**
   * Ask the canvas overlay to open the inline editor for one cell. A fresh
   * object is used every time so re-requesting the same cell still opens it.
   */
  function requestTableCellEdit(
    row: number,
    col: number,
    selectAll = true,
  ) {
    if (!table.value) return
    const region = regionAtCell(table.value, row, col)
    if (!region) return
    selectTableCells(region.row, region.col)
    requestedCellEdit.value = { row: region.row, col: region.col, selectAll }
  }

  /** Called by the overlay once it has opened the requested editor. */
  function consumeCellEditRequest() {
    requestedCellEdit.value = null
  }

  function setTableCellText(row: number, col: number, text: string) {
    if (!table.value) return
    const region = regionAtCell(table.value, row, col)
    if (!region) return
    const anchor = {
      row: region.row,
      col: region.col,
      endRow: region.row,
      endCol: region.col,
    }
    commitTableConfig(updateCells(table.value, anchor, { text }))
  }

  /** Clear text in every cell covered by the current selection. */
  function clearTableCellText() {
    if (!table.value) return
    const range = expandRangeToMerges(table.value, tableSelection)
    commitTableConfig(updateCells(table.value, range, { text: '' }))
  }

  function selectAllTableCells() {
    if (!table.value) return
    tableSelection.row = 0
    tableSelection.col = 0
    tableSelection.endRow = table.value.rowCount - 1
    tableSelection.endCol = table.value.columnCount - 1
    canvas?.requestRenderAll()
  }

  function selectTableCells(row: number, col: number, extend = false) {
    if (!table.value) return
    const config = table.value
    const merge = findMergeContaining(config, row, col)
    const range = merge ? mergeToRange(merge) : {
      row,
      col,
      endRow: row,
      endCol: col,
    }
    if (!extend) {
      tableSelection.row = range.row
      tableSelection.col = range.col
      tableSelection.endRow = range.endRow
      tableSelection.endCol = range.endCol
    } else {
      tableSelection.endRow = range.endRow
      tableSelection.endCol = range.endCol
    }
    clampTableSelection(config)
    canvas?.requestRenderAll()
  }

  function mergeTableCells() {
    if (!table.value || !tableCanMerge.value) return
    commitTableConfig(mergeRegion(table.value, tableSelection))
  }

  function splitTableCells() {
    if (!table.value || !tableCanSplit.value) return
    commitTableConfig(splitRegion(table.value, tableSelection))
  }

  function updateSelectedCells(patch: Partial<TableCell>) {
    if (!table.value) return
    let next = table.value
    if (patch.text !== undefined) {
      // Text belongs on the anchor cell only; applying it to every cell would
      // duplicate content when a merged region is split again.
      const expanded = expandRangeToMerges(next, tableSelection)
      next = updateCells(
        next,
        {
          row: expanded.row,
          col: expanded.col,
          endRow: expanded.row,
          endCol: expanded.col,
        },
        { text: patch.text },
      )
      const { text: _text, ...rest } = patch
      if (Object.keys(rest).length) {
        next = updateCells(next, tableSelection, rest)
      }
    } else {
      next = updateCells(next, tableSelection, patch)
    }
    commitTableConfig(next)
  }

  function updateTableStyle(patch: Partial<TableConfig>) {
    if (!table.value) return
    commitTableConfig(normalizeTableConfig({ ...table.value, ...patch }))
  }

  function setTableSize(rows: number, cols: number) {
    if (!table.value) return
    commitTableConfig(resizeTable(table.value, rows, cols))
  }

  function setTableWidthValue(width: number) {
    if (!table.value) return
    commitTableConfig(setTableWidth(table.value, width))
  }

  function setTableHeightValue(height: number) {
    if (!table.value) return
    commitTableConfig(setTableHeight(table.value, height))
  }

  function toggleTableBorder(side: TableBorderSide) {
    if (!table.value) return
    commitTableConfig(
      setRangeBorder(
        table.value,
        tableSelection,
        side,
        !tableBorderState.value[side],
      ),
    )
  }

  // ------------------------------------------------------------------- data

  function addDataField(key = '', value = '') {
    const base = key.trim() || `field${dataFields.value.length + 1}`
    let candidate = base
    let suffix = 2
    while (dataFields.value.some((field) => field.key === candidate)) {
      candidate = `${base}${suffix}`
      suffix += 1
    }
    dataFields.value = [...dataFields.value, { key: candidate, value }]
    scheduleCommit()
  }

  function updateDataField(index: number, patch: Partial<DataField>) {
    const field = dataFields.value[index]
    if (!field) return
    if (patch.key !== undefined) {
      const key = patch.key.trim()
      if (!key) {
        notify('字段名不能为空')
        return
      }
      if (dataFields.value.some((item, i) => i !== index && item.key === key)) {
        notify('字段名已存在')
        return
      }
      patch = { ...patch, key }
    }
    dataFields.value = dataFields.value.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    )
    scheduleCommit()
  }

  function removeDataField(index: number) {
    dataFields.value = dataFields.value.filter((_, i) => i !== index)
    scheduleCommit()
  }

  function importDataJson(text: string) {
    try {
      const fields = parseDataJson(text)
      const merged = new Map(dataFields.value.map((field) => [field.key, field]))
      for (const field of fields) merged.set(field.key, field)
      dataFields.value = [...merged.values()]
      scheduleCommit()
      notify(`已导入 ${fields.length} 个字段`)
    } catch (err: any) {
      notify(`导入失败：${err?.message || 'JSON 格式不正确'}`)
    }
  }

  function importDataFields(fields: DataField[]) {
    const incoming = fields.filter((field) => field && field.key)
    if (!incoming.length) return
    const merged = new Map(dataFields.value.map((field) => [field.key, field]))
    for (const field of incoming) {
      merged.set(field.key, {
        key: field.key,
        value: String(field.value ?? ''),
      })
    }
    dataFields.value = [...merged.values()]
    scheduleCommit()
    notify(`已导入 ${incoming.length} 个字段`)
  }

  function readDataFields(input: unknown): DataField[] {
    if (!Array.isArray(input)) return []
    return input
      .filter((field: any) => field && typeof field.key === 'string' && field.key)
      .map((field: any) => ({
        key: String(field.key),
        value: field.value === undefined || field.value === null
          ? ''
          : String(field.value),
      }))
  }

  // ---------------------------------------------------------- persistence

  function refreshTemplates() {
    templates.value = [...templateRecords]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((record) => ({
        id: record.id,
        name: record.template.name || '未命名模板',
        width: record.template.page?.width ?? DEFAULT_PAGE.width,
        height: record.template.page?.height ?? DEFAULT_PAGE.height,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        active: record.id === activeTemplateId,
      }))
  }

  function writeLibrary() {
    try {
      localStorage.setItem(
        LIBRARY_KEY,
        JSON.stringify({
          version: 1,
          activeId: activeTemplateId,
          items: templateRecords,
        }),
      )
    } catch {
      // Storage may be full or disabled; autosave is best-effort.
    }
  }

  function readLibrary(): TemplateLibrary | null {
    try {
      const raw = localStorage.getItem(LIBRARY_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<TemplateLibrary>
      if (!parsed || !Array.isArray(parsed.items)) return null
      const items: StoredTemplate[] = []
      for (const rawItem of parsed.items) {
        const item = rawItem as Partial<StoredTemplate>
        if (!item || typeof item.id !== 'string' || !item.template) continue
        if (!Array.isArray(item.template.elements)) continue
        const now = Date.now()
        items.push({
          id: item.id,
          template: item.template,
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
          updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : now,
        })
      }
      if (!items.length) return null
      return {
        version: 1,
        activeId:
          typeof parsed.activeId === 'string' ? parsed.activeId : items[0].id,
        items,
      }
    } catch {
      return null
    }
  }

  function updateActiveRecord(template: PageTemplate) {
    const now = Date.now()
    const index = templateRecords.findIndex(
      (record) => record.id === activeTemplateId,
    )
    if (index >= 0) {
      templateRecords[index] = {
        ...templateRecords[index],
        template,
        updatedAt: now,
      }
    } else {
      if (!activeTemplateId) activeTemplateId = templateId()
      templateRecords.push({
        id: activeTemplateId,
        template,
        createdAt: now,
        updatedAt: now,
      })
    }
    refreshTemplates()
    writeLibrary()
  }

  function createBlankTemplate(name: string): PageTemplate {
    return {
      version: 1,
      name,
      page: {
        width: DEFAULT_PAGE.width,
        height: DEFAULT_PAGE.height,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        marginVisible: true,
        guides: [],
        guidesVisible: true,
      },
      grid: { size: 5, visible: true, snap: true },
      data: [],
      elements: [],
    }
  }

  function nextTemplateName(): string {
    const names = new Set(
      templateRecords.map((record) => record.template.name || '未命名模板'),
    )
    if (!names.has('未命名模板')) return '未命名模板'
    let index = 2
    while (names.has(`未命名模板 ${index}`)) index += 1
    return `未命名模板 ${index}`
  }

  function pageSnapshot(): PageTemplate['page'] {
    return {
      width: round(page.width, 1),
      height: round(page.height, 1),
      margin: {
        top: round(page.margin.top, 1),
        right: round(page.margin.right, 1),
        bottom: round(page.margin.bottom, 1),
        left: round(page.margin.left, 1),
      },
      marginVisible: page.marginVisible,
      guides: page.guides.map((guide) => ({
        id: guide.id,
        orientation: guide.orientation,
        position: round(guide.position, 1),
      })),
      guidesVisible: page.guidesVisible,
    }
  }

  function toTemplateFromFabric(json: any): PageTemplate {
    const elements: TemplateElement[] = []
    for (const raw of json.objects ?? []) {
      const el = mapFabricObject(raw)
      if (el) elements.push(el)
    }
    return {
      version: 1,
      name: templateName.value,
      page: pageSnapshot(),
      grid: { size: grid.size, visible: grid.visible, snap: grid.snap },
      data: dataFields.value.map((field) => ({ ...field })),
      elements,
    }
  }

  function mapFabricObject(o: any): TemplateElement | null {
    const type = String(o.type ?? '').toLowerCase()
    const isTable =
      o.customKind === 'table' || typeof o.tableData === 'string'
    let kind: ElementKind
    if (isTable) kind = 'table'
    else if (type === 'textbox' || type === 'text' || type === 'itext') kind = 'text'
    else if (type === 'ellipse') kind = 'ellipse'
    else if (type === 'image') kind = 'image'
    else if (type === 'rect') kind = o.customKind === 'line' ? 'line' : 'rect'
    else return null

    let tableConfig: TableConfig | undefined
    if (kind === 'table') {
      try {
        tableConfig = normalizeTableConfig(JSON.parse(String(o.tableData)))
      } catch {
        return null
      }
    }

    const sx = Math.abs(o.scaleX ?? 1)
    const sy = Math.abs(o.scaleY ?? 1)
    const element: TemplateElement = {
      id: String(o.elementId || uid()),
      kind,
      name: String(o.name || (kind === 'table' ? KIND_LABEL.table : '')),
      left: round(o.left ?? 0, 2),
      top: round(o.top ?? 0, 2),
      width: tableConfig
        ? getTableWidth(tableConfig)
        : round((o.width ?? 0) * sx, 2),
      height: tableConfig
        ? getTableHeight(tableConfig)
        : round((o.height ?? 0) * sy, 2),
      angle: round(o.angle ?? 0, 1),
      opacity: round(o.opacity ?? 1, 2),
      visible: o.visible !== false,
      fill: typeof o.fill === 'string' ? o.fill : '',
      stroke: typeof o.stroke === 'string' ? o.stroke : '',
      strokeWidth: round(o.strokeWidth ?? 0, 2),
    }

    if (o.locked === true) element.locked = true
    const dash = dashArrayOf(o.strokeDashArray)
    if (dash.length) element.strokeDash = dash

    if (kind === 'text') {
      element.text = String(o.text ?? '')
      element.fontSize = round((o.fontSize ?? 0) * sy, 2)
      element.fontFamily = String(o.fontFamily || DEFAULT_FONT)
      element.fontWeight = normalizeWeight(o.fontWeight)
      if (o.fontStyle === 'italic') element.fontStyle = 'italic'
      if (o.underline) element.underline = true
      const letterSpacing =
        ((o.charSpacing ?? 0) * (o.fontSize ?? 0) * sy) / 1000
      if (Math.abs(letterSpacing) > 0.001) {
        element.letterSpacing = round(letterSpacing, 2)
      }
      element.textAlign = String(o.textAlign || 'left')
      element.lineHeight = round(o.lineHeight ?? 1.3, 2)
      if (typeof o.backgroundColor === 'string' && o.backgroundColor) {
        element.textBackground = o.backgroundColor
      }
    }

    if (kind === 'rect') {
      element.radius = round((o.rx ?? 0) * ((sx + sy) / 2), 2)
    }

    if (kind === 'image') {
      element.src = String(o.src || '')
    }

    if (kind === 'table' && tableConfig) {
      element.table = tableConfig
    }

    return element
  }

  function serialize(): PageTemplate {
    if (!canvas) {
      return {
        version: 1,
        name: templateName.value,
        page: pageSnapshot(),
        grid: { size: grid.size, visible: grid.visible, snap: grid.snap },
        data: dataFields.value.map((field) => ({ ...field })),
        elements: [],
      }
    }
    const json = canvas.toObject([
      'elementId',
      'customKind',
      'name',
      'locked',
      'tableData',
    ]) as any
    return toTemplateFromFabric(json)
  }

  function scheduleCommit() {
    if (restoring) return
    if (commitTimer) clearTimeout(commitTimer)
    commitTimer = setTimeout(() => {
      commitTimer = undefined
      commitNow()
    }, 300)
  }

  function cancelPendingCommit() {
    if (commitTimer) {
      clearTimeout(commitTimer)
      commitTimer = undefined
    }
  }

  function commitNow() {
    if (!canvas) return
    const json = JSON.stringify(serialize())
    if (history[historyIndex] !== json) {
      history = history.slice(0, historyIndex + 1)
      history.push(json)
      if (history.length > HISTORY_LIMIT) history.shift()
      historyIndex = history.length - 1
    }
    canUndo.value = historyIndex > 0
    canRedo.value = historyIndex < history.length - 1
    saveLocal(json)
  }

  function saveLocal(json: string) {
    try {
      localStorage.setItem(STORAGE_KEY, json)
      try {
        updateActiveRecord(JSON.parse(json) as PageTemplate)
      } catch {
        // Keep the single-template copy even if the library update fails.
      }
      savedAt.value = Date.now()
    } catch {
      // storage might be full or disabled; autosave is best-effort
    }
  }

  function resetHistory() {
    cancelPendingCommit()
    history = []
    historyIndex = -1
    canUndo.value = false
    canRedo.value = false
    commitNow()
  }

  async function restore() {
    const library = readLibrary()
    if (library) {
      templateRecords = library.items
      activeTemplateId = library.items.some(
        (item) => item.id === library.activeId,
      )
        ? library.activeId
        : library.items[0].id
    } else {
      let legacy: PageTemplate | null = null
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as PageTemplate
          if (
            parsed &&
            parsed.version === 1 &&
            Array.isArray(parsed.elements)
          ) {
            legacy = parsed
          }
        }
      } catch {
        legacy = null
      }
      const template = legacy ?? createBlankTemplate('未命名模板')
      const now = Date.now()
      activeTemplateId = templateId()
      templateRecords = [
        {
          id: activeTemplateId,
          template,
          createdAt: now,
          updatedAt: now,
        },
      ]
    }

    const active =
      templateRecords.find((record) => record.id === activeTemplateId) ??
      templateRecords[0]
    activeTemplateId = active.id
    await loadTemplate(active.template)
    refreshTemplates()
    commitNow()
    canUndo.value = false
    canRedo.value = false
  }

  function elementToObject(el: TemplateElement): Promise<FabricObject | null> {
    const common = {
      left: el.left ?? 0,
      top: el.top ?? 0,
      angle: el.angle ?? 0,
      opacity: el.opacity ?? 1,
      visible: el.visible !== false,
      name: el.name || KIND_LABEL[el.kind],
      objectCaching: false,
      strokeUniform: true,
    }

    const finish = (obj: FabricObject) => {
      ;(obj as any).elementId = el.id || uid()
      if (el.kind === 'line') (obj as any).customKind = 'line'
      obj.set(CONTROL_STYLE as any)
      applyLock(obj, el.locked === true)
      return obj
    }

    if (el.kind === 'table') {
      const config = normalizeTableConfig(el.table ?? createTableConfig())
      const group = buildTableObject(config)
      // Rotation is stored on the Fabric group; cell hit-testing and the range
      // overlay both transform through that angle.
      group.set({ ...common, scaleX: 1, scaleY: 1 } as any)
      ;(group as any).tableData = JSON.stringify(config)
      return Promise.resolve(finish(group))
    }

    if (el.kind === 'text') {
      const fontSize = Math.max(0.5, el.fontSize || DEFAULT_TEXT_SIZE)
      const obj = new Textbox(el.text ?? '', {
        ...common,
        width: Math.max(2, el.width || 60),
        fontSize,
        fontFamily: el.fontFamily || DEFAULT_FONT,
        fontWeight: el.fontWeight || 'normal',
        fontStyle: el.fontStyle || 'normal',
        underline: el.underline === true,
        charSpacing:
          el.letterSpacing && fontSize
            ? Math.max(-1000, Math.min(5000, (el.letterSpacing / fontSize) * 1000))
            : 0,
        textAlign: el.textAlign || 'left',
        lineHeight: el.lineHeight ?? 1.3,
        fill: el.fill || DEFAULT_TEXT_FILL,
        backgroundColor: el.textBackground || '',
        splitByGrapheme: true,
        editable: true,
      } as any)
      return Promise.resolve(finish(obj))
    }

    if (el.kind === 'ellipse') {
      const obj = new Ellipse({
        ...common,
        rx: Math.max(0.5, (el.width || 30) / 2),
        ry: Math.max(0.5, (el.height || 20) / 2),
        fill: el.fill || DEFAULT_SHAPE_FILL,
        stroke: el.stroke || '',
        strokeWidth: el.strokeWidth ?? 0,
        strokeDashArray: el.strokeDash?.length ? el.strokeDash : null,
      } as any)
      return Promise.resolve(finish(obj))
    }

    if (el.kind === 'image') {
      if (!el.src) return Promise.resolve(null)
      return FabricImage.fromURL(el.src)
        .then((image) => {
          image.set({
            ...common,
            width: Math.max(1, el.width || 40),
            height: Math.max(1, el.height || 40),
            scaleX: 1,
            scaleY: 1,
          } as any)
          return finish(image)
        })
        .catch((err) => {
          console.warn('image element failed to load', err)
          return null
        })
    }

    const isLine = el.kind === 'line'
    const obj = new Rect({
      ...common,
      width: Math.max(0.1, el.width || 40),
      height: Math.max(0.05, el.height || (isLine ? 0.4 : 25)),
      fill: el.fill || (isLine ? DEFAULT_TEXT_FILL : DEFAULT_SHAPE_FILL),
      stroke: isLine ? '' : el.stroke || DEFAULT_SHAPE_STROKE,
      strokeWidth: isLine ? 0 : el.strokeWidth ?? 0.2,
      strokeDashArray: el.strokeDash?.length ? el.strokeDash : null,
      rx: isLine ? 0 : el.radius ?? 0,
      ry: isLine ? 0 : el.radius ?? 0,
      padding: isLine ? 1.5 : 0,
    } as any)
    return Promise.resolve(finish(obj))
  }

  async function loadTemplate(template: PageTemplate) {
    if (!canvas) return
    const token = ++loadToken
    restoring = true
    try {
      canvas.discardActiveObject()
      canvas.remove(...canvas.getObjects())
      templateName.value = template.name || '未命名模板'
      page.width = clamp(template.page?.width ?? DEFAULT_PAGE.width, 20, 1000)
      page.height = clamp(template.page?.height ?? DEFAULT_PAGE.height, 20, 1000)
      const margin = template.page?.margin
      page.margin.top = readMargin(margin?.top, round(page.height / 2, 1))
      page.margin.right = readMargin(margin?.right, round(page.width / 2, 1))
      page.margin.bottom = readMargin(margin?.bottom, round(page.height / 2, 1))
      page.margin.left = readMargin(margin?.left, round(page.width / 2, 1))
      page.marginVisible = template.page?.marginVisible !== false
      page.guides = readGuides(template.page?.guides, page.width, page.height)
      page.guidesVisible = template.page?.guidesVisible !== false
      grid.size = template.grid?.size ?? 5
      grid.visible = template.grid?.visible ?? true
      grid.snap = template.grid?.snap ?? true
      dataFields.value = readDataFields(template.data)

      const objects = await Promise.all(
        (template.elements ?? []).map((el) => elementToObject(el)),
      )
      if (token !== loadToken || !canvas) return
      const valid = objects.filter(Boolean) as FabricObject[]
      canvas.add(...valid)
      valid.forEach((o) => o.setCoords())
      canvas.requestRenderAll()
      objectCount.value = valid.length
      refreshSelection()
      refreshLayers()
      fitToViewport()
    } finally {
      if (token === loadToken) restoring = false
    }
  }

  async function applyHistory() {
    const snapshot = history[historyIndex]
    if (!snapshot) return
    await loadTemplate(JSON.parse(snapshot) as PageTemplate)
    canUndo.value = historyIndex > 0
    canRedo.value = historyIndex < history.length - 1
    saveLocal(snapshot)
  }

  async function undo() {
    cancelPendingCommit()
    if (historyIndex <= 0) return
    historyIndex -= 1
    await applyHistory()
  }

  async function redo() {
    cancelPendingCommit()
    if (historyIndex >= history.length - 1) return
    historyIndex += 1
    await applyHistory()
  }

  function downloadTemplate() {
    const template = serialize()
    download(
      `${sanitizeFilename(template.name)}.json`,
      JSON.stringify(template, null, 2),
      'application/json',
    )
  }

  async function importTemplate(text: string) {
    try {
      const template = JSON.parse(text) as PageTemplate
      if (!template || !Array.isArray(template.elements)) {
        throw new Error('模板结构不正确')
      }
      await loadTemplate(template)
      commitNow()
    } catch (err: any) {
      notify(`导入失败：${err?.message || '文件格式不正确'}`)
    }
  }

  async function newTemplate() {
    cancelPendingCommit()
    commitNow()
    const now = Date.now()
    activeTemplateId = templateId()
    const template = createBlankTemplate(nextTemplateName())
    templateRecords.push({
      id: activeTemplateId,
      template,
      createdAt: now,
      updatedAt: now,
    })
    await loadTemplate(template)
    resetHistory()
    notify('已新建空白模板')
  }

  async function openTemplate(id: string) {
    if (id === activeTemplateId) return
    const record = templateRecords.find((item) => item.id === id)
    if (!record) return
    cancelPendingCommit()
    commitNow()
    activeTemplateId = id
    await loadTemplate(record.template)
    resetHistory()
  }

  /**
   * Build a throwaway canvas from the template rather than the live canvas so
   * sample data can replace `{{field}}` placeholders in text and table cells.
   */
  async function buildPreviewCanvas(): Promise<StaticCanvas> {
    const template = resolveTemplateBindings(serialize(), dataFields.value)
    const objects = await Promise.all(
      template.elements.map((element) => elementToObject(element)),
    )
    const temp = new StaticCanvas(undefined, {
      width: page.width,
      height: page.height,
      enableRetinaScaling: false,
    })
    const valid = objects.filter(Boolean) as FabricObject[]
    if (valid.length) temp.add(...valid)
    return temp
  }

  async function generateSVG(): Promise<string> {
    if (!canvas) return ''
    const temp = await buildPreviewCanvas()
    try {
      return temp.toSVG({
        width: `${round(page.width, 2)}mm`,
        height: `${round(page.height, 2)}mm`,
        viewBox: { x: 0, y: 0, width: page.width, height: page.height },
        suppressPreamble: true,
      })
    } finally {
      temp.destroy()
    }
  }

  /** Render the resolved template into a single-page PDF for the preview. */
  async function generatePDF(): Promise<Uint8Array> {
    if (!canvas) return new Uint8Array()
    const temp = await buildPreviewCanvas()
    try {
      const dataUrl = temp.toDataURL({
        format: 'png',
        multiplier: previewPixelRatio(page.width, page.height),
        enableRetinaScaling: false,
      })
      return await createPdfFromImage(
        dataUrl,
        page.width,
        page.height,
        templateName.value,
      )
    } finally {
      temp.destroy()
    }
  }

  function destroy() {
    cancelPendingCommit()
    canvas?.dispose()
    canvas = null
  }

  return {
    // state
    ready,
    templateName,
    templates,
    page,
    grid,
    view,
    rulersVisible,
    selection,
    layers,
    objectCount,
    canUndo,
    canRedo,
    savedAt,
    notice,
    pagePreset,
    zoomPercent,
    dataFields,
    table,
    tableSelection,
    tableEditing,
    requestedCellEdit,
    tableFrame,
    tableSize,
    tableRangeLabel,
    tableSelectionCount,
    tableCanMerge,
    tableCanSplit,
    tableBorderState,
    globalTextStyle,
    // canvas lifecycle
    mount,
    destroy,
    syncViewport,
    setViewportSize,
    fitToViewport,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    // page
    setPageSize,
    setPageMargin,
    setPageMarginVisible,
    setGuidesVisible,
    addGuide,
    moveGuide,
    commitGuides,
    removeGuide,
    clearGuides,
    setPreset,
    setTemplateName,
    setRulersVisible,
    setGridSize,
    setGridVisible,
    setGridSnap,
    // creation
    addText,
    addRect,
    addEllipse,
    addLine,
    addTable,
    addImageFile,
    addImageFromSrc,
    replaceSelectedImage,
    // table
    beginTableEdit,
    endTableEdit,
    requestTableCellEdit,
    consumeCellEditRequest,
    setTableCellText,
    clearTableCellText,
    selectAllTableCells,
    selectTableCells,
    mergeTableCells,
    splitTableCells,
    updateSelectedCells,
    updateTableStyle,
    setTableSize,
    setTableWidthValue,
    setTableHeightValue,
    toggleTableBorder,
    // data bindings
    addDataField,
    updateDataField,
    removeDataField,
    importDataJson,
    importDataFields,
    // editing
    updateSelected,
    applyGlobalTextStyle,
    deleteSelected,
    duplicateSelected,
    moveSelected,
    nudge,
    clearSelection,
    selectById,
    toggleVisible,
    toggleLocked,
    alignSelected,
    distributeSelected,
    // persistence
    undo,
    redo,
    serialize,
    downloadTemplate,
    importTemplate,
    newTemplate,
    openTemplate,
    generateSVG,
    generatePDF,
  }
}

export type Designer = ReturnType<typeof createDesigner>
