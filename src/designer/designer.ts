/*!
 * DoPrint Designer — Copyright © 2025-2026 eonsee. Apache-2.0.
 * Origin marker: doprint-designer-f9900b51
 */
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
import { computed, reactive, ref, watch } from 'vue'
import type {
  DataField,
  ElementKind,
  GuideOrientation,
  LayerItem,
  PageBackgroundFit,
  PageBackgroundTransform,
  PageGuide,
  PageTemplate,
  PrintOffset,
  SelectionState,
  TableCell,
  TableConfig,
  TemplateElement,
  UiVisibilityConfig,
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
import {
  parseDataJson,
  resolveBindings,
  resolveCheckboxBindings,
  resolveTemplateBindings,
  sampleFieldsWithDetails,
} from './binding'
import {
  buildRegions,
  cellAtPoint,
  cloneTableConfig,
  createTableConfig,
  expandRangeToMerges,
  findMergeContaining,
  getColumnWidths,
  getRowHeights,
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
  resizeColumn,
  resizeRow,
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
import { readDataDragEnabled, writeDataDragEnabled } from './dataDrag'
import { findOfficialTemplate } from './officialTemplates'
import {
  injectSvgMetadata,
  projectMeta,
  registerHiddenProjectMarker,
  verifyProjectIntegrity,
} from './copyright'
import {
  defaultCodeText,
  renderCodeDataUrl,
  type CodeKind,
} from './codes'
// Bundled demo template: also the default document opened on first run.
import caseTemplateJson from '../../templates/note_temp.json'

const STORAGE_KEY = 'doprint.template.v1'
const LIBRARY_KEY = 'doprint.templates.v1'
const CASE_TEMPLATE_ID = 'tpl_case_billing'
/** Marks that the bundled case template has been offered on this browser. */
const CASE_TEMPLATE_SEED_KEY = 'doprint.case-template.seeded.v1'
const RULER_STORAGE_KEY = 'doprint.rulers.visible'
const SAMPLE_VALUES_STORAGE_KEY = 'doprint.show-sample-values.v1'
const THEME_STORAGE_KEY = 'doprint.theme.v1'
const UI_VISIBILITY_STORAGE_KEY = 'doprint.ui.visibility.v1'
const HISTORY_LIMIT = 50
const SNAP_STEP = 1
/** Comfortable canvas scale used by "reset zoom" and the initial fit cap. */
const DEFAULT_ZOOM_SCALE = 1.2
/** Default text size in scene millimetres (14px). */
const DEFAULT_TEXT_SIZE = DEFAULT_FONT_PX * PX_TO_MM
const DEFAULT_TEXT_FILL = '#111827'
/** Shapes default to an outline only; fill is opt-in from the inspector. */
const DEFAULT_SHAPE_FILL = 'transparent'
const DEFAULT_SHAPE_STROKE = '#374151'
const DEFAULT_FONT = 'SimSun'
const DEFAULT_WATERMARK_TEXT = 'Doprint预览版'
const WATERMARK_COLOR = '#64748b'
const WATERMARK_OPACITY = 0.1
const WATERMARK_ANGLE = -30
/**
 * Sheet underlay images are stored inline in the template (and therefore in
 * localStorage), so overweight files are downscaled on import. The limit is
 * the data-URL character count, not the decoded byte size.
 */
const BACKGROUND_MAX_DATA_URL = 1_200_000
const BACKGROUND_MAX_DIMENSION = 2400
const DEFAULT_BACKGROUND_OPACITY = 1
const DEFAULT_BACKGROUND_FIT: PageBackgroundFit = 'cover'
/** Limits for manual underlay alignment: keep the image near the page. */
const BACKGROUND_MIN_MM = 5
const BACKGROUND_MAX_SCALE = 6
/** Printer registration offset is a fine adjustment, not a layout tool. */
const PRINT_OFFSET_LIMIT = 50

// Make our element metadata survive cloning / serialization.
FabricObject.customProperties = [
  'elementId',
  'customKind',
  'name',
  'locked',
  'tableData',
  'codeText',
  'rawText',
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
  qrcode: '二维码',
  barcode: '条形码',
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

/** A smart alignment line shown while dragging an element. Scene millimetres. */
interface AlignmentGuide {
  orientation: 'vertical' | 'horizontal'
  /** x for a vertical guide, y for a horizontal guide */
  position: number
  from: number
  to: number
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
  const customKind = (obj as any).customKind
  if (isImageType(type)) {
    if (customKind === 'qrcode' || customKind === 'barcode') return customKind
    return 'image'
  }
  if (isTextType(type)) return 'text'
  if (isEllipseType(type)) return 'ellipse'
  if (isRectType(type)) return customKind === 'line' ? 'line' : 'rect'
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

async function createCodeImage(
  kind: CodeKind,
  text: string,
): Promise<FabricImage> {
  let src: string
  try {
    src = await renderCodeDataUrl(kind, text)
  } catch (err) {
    console.warn('code render failed', err)
    src = await renderCodeDataUrl(kind, defaultCodeText(kind))
  }
  const image = await FabricImage.fromURL(src)
  ;(image as any).codeText = text
  return image
}

/**
 * Fabric treats `width < naturalWidth` as cropping, so images keep their
 * natural pixel size and use scaleX / scaleY for the millimetre frame.
 */
function fitImage(
  image: FabricImage,
  width: number,
  height: number,
): FabricImage {
  image.set({
    scaleX: width / Math.max(1, image.width || 1),
    scaleY: height / Math.max(1, image.height || 1),
  } as any)
  return image
}

/** Box glyphs that can be replaced by a bound checkbox token. */
const CHECKBOX_CHARS = new Set(['□', '☐', '▢', '❑', '☑', '☒'])

/** Count box glyphs outside of existing `{{...}}` binding tokens. */
function countCheckboxChars(text: string): number {
  let count = 0
  let depth = 0
  for (const char of text) {
    if (char === '{') {
      depth += 1
      continue
    }
    if (char === '}') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth === 0 && CHECKBOX_CHARS.has(char)) count += 1
  }
  return count
}

/** Replace the first N box glyphs with the supplied tokens, in order. */
function replaceCheckboxChars(
  text: string,
  tokens: string[],
): { text: string; count: number } {
  let result = ''
  let depth = 0
  let index = 0
  for (const char of text) {
    if (char === '{') {
      depth += 1
      result += char
      continue
    }
    if (char === '}') {
      depth = Math.max(0, depth - 1)
      result += char
      continue
    }
    if (depth === 0 && CHECKBOX_CHARS.has(char) && index < tokens.length) {
      result += tokens[index]
      index += 1
      continue
    }
    result += char
  }
  return { text: result, count: index }
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = src
  })
}

/**
 * Read an underlay image and downscale it when necessary: the data URL is
 * persisted inside the template, so a multi-megabyte scan would otherwise
 * exhaust the localStorage quota and slow down every history snapshot.
 */
async function prepareBackgroundImage(file: File): Promise<string> {
  const dataUrl = await fileToDataURL(file)
  if (dataUrl.length <= BACKGROUND_MAX_DATA_URL) return dataUrl
  const image = await loadHtmlImage(dataUrl)
  const naturalWidth = image.naturalWidth || image.width || 1
  const naturalHeight = image.naturalHeight || image.height || 1
  const scale = Math.min(
    1,
    BACKGROUND_MAX_DIMENSION / Math.max(naturalWidth, naturalHeight),
  )
  const width = Math.max(1, Math.round(naturalWidth * scale))
  const height = Math.max(1, Math.round(naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return dataUrl
  // Scans are usually opaque; flatten onto white so JPEG has no black edges.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.86)
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

/**
 * Whether the design canvas shows resolved sample values instead of raw
 * `{{field}}` tokens. On by default: tokens are often much longer than real
 * data, which makes boxes wrap and look like they overlap while designing.
 */
function readShowSampleValues(): boolean {
  try {
    const saved = localStorage.getItem(SAMPLE_VALUES_STORAGE_KEY)
    return saved === null ? true : saved !== '0'
  } catch {
    return true
  }
}

function writeShowSampleValues(enabled: boolean) {
  try {
    localStorage.setItem(SAMPLE_VALUES_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // Preference persistence is best-effort.
  }
}

/** Logical binding text stored on a Fabric text object. */
function rawTextOf(obj: any): string {
  return typeof obj?.rawText === 'string' ? obj.rawText : String(obj?.text ?? '')
}

export type DesignerTheme = 'light' | 'dark'

function readTheme(): DesignerTheme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    // Storage may be disabled; fall back to the system preference.
  }
  try {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark'
    }
  } catch {
    // matchMedia is unavailable in some embedded browsers.
  }
  return 'light'
}

function applyTheme(theme: DesignerTheme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}

function defaultUiVisibility(): UiVisibilityConfig {
  return {
    tools: {
      text: true,
      table: true,
      labels: true,
      symbols: true,
      rect: true,
      ellipse: true,
      line: true,
      image: true,
      qrcode: true,
      barcode: true,
    },
    topbar: {
      page: true,
      background: true,
      globalStyle: true,
      margins: true,
    },
    inspectorTabs: {
      props: true,
      layers: true,
      data: true,
    },
    inspectorSections: {
      page: true,
      margins: true,
      background: true,
      watermark: true,
      view: true,
    },
    topbarMain: {
      template: true,
      history: true,
      autosave: true,
      preview: true,
      io: true,
    },
    topbarSelection: {
      font: true,
      textStyle: true,
      align: true,
      geometry: true,
      actions: true,
    },
    inspectorSelection: {
      align: true,
      textStyle: true,
      position: true,
      multiAdjust: true,
      appearance: true,
      code: true,
      image: true,
      text: true,
      table: true,
      arrange: true,
    },
  }
}

function readUiVisibility(): UiVisibilityConfig {
  const defaults = defaultUiVisibility()
  try {
    const raw = localStorage.getItem(UI_VISIBILITY_STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const group of Object.keys(defaults) as Array<
      keyof UiVisibilityConfig
    >) {
      const stored = parsed?.[group]
      if (!stored || typeof stored !== 'object') continue
      for (const key of Object.keys(
        defaults[group] as Record<string, boolean>,
      )) {
        const next = (stored as Record<string, unknown>)[key]
        if (typeof next === 'boolean') {
          (defaults[group] as Record<string, boolean>)[key] = next
        }
      }
    }
  } catch {
    // Ignore malformed preferences and fall back to everything visible.
  }
  return defaults
}

type MarginSide = 'top' | 'right' | 'bottom' | 'left'

function readMargin(value: unknown, max: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return clamp(round(number, 1), 0, max)
}

function readBackgroundOpacity(value: unknown): number {
  const number =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : DEFAULT_BACKGROUND_OPACITY
  return clamp(round(number, 2), 0, 1)
}

function readBackgroundFit(value: unknown): PageBackgroundFit {
  return value === 'cover' || value === 'contain' || value === 'stretch'
    ? value
    : DEFAULT_BACKGROUND_FIT
}

function readBackgroundImage(value: unknown): string {
  return typeof value === 'string' && value.startsWith('data:image/')
    ? value
    : ''
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback
}

function readBackgroundTransform(
  value: unknown,
): PageBackgroundTransform | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<PageBackgroundTransform>
  const width = finiteNumber(record.width)
  const height = finiteNumber(record.height)
  if (width <= 0 || height <= 0) return null
  // Keep imported templates from requesting absurd image dimensions.
  const limit = 10_000
  return {
    left: clamp(round(finiteNumber(record.left), 1), -limit, limit),
    top: clamp(round(finiteNumber(record.top), 1), -limit, limit),
    width: clamp(round(width, 1), 1, limit),
    height: clamp(round(height, 1), 1, limit),
  }
}

function readPrintOffset(value: unknown): PrintOffset {
  if (!value || typeof value !== 'object') return { x: 0, y: 0 }
  const record = value as Partial<PrintOffset>
  return {
    x: clamp(
      round(finiteNumber(record.x), 1),
      -PRINT_OFFSET_LIMIT,
      PRINT_OFFSET_LIMIT,
    ),
    y: clamp(
      round(finiteNumber(record.y), 1),
      -PRINT_OFFSET_LIMIT,
      PRINT_OFFSET_LIMIT,
    ),
  }
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
  // Hidden attribution: verifies the embedded marker and leaves a frozen,
  // non-enumerable global for diagnostics. Nothing is rendered in the UI.
  verifyProjectIntegrity()
  registerHiddenProjectMarker()

  const ready = ref(false)
  const templateName = ref('未命名模板')
  const page = reactive({
    ...DEFAULT_PAGE,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    marginVisible: true,
    guides: [] as PageGuide[],
    guidesVisible: true,
    watermarkVisible: true,
    watermarkText: DEFAULT_WATERMARK_TEXT,
    backgroundImage: '',
    backgroundVisible: true,
    backgroundOpacity: DEFAULT_BACKGROUND_OPACITY,
    backgroundFit: DEFAULT_BACKGROUND_FIT,
    backgroundPrint: false,
    backgroundTransform: null as PageBackgroundTransform | null,
    overprint: false,
    printOffset: { x: 0, y: 0 } as PrintOffset,
  })
  /** Intrinsic pixel size of the imported underlay, used for fit framing. */
  const backgroundNatural = reactive({ width: 0, height: 0 })
  /** Whether the stage is currently in underlay alignment mode. */
  const backgroundAligning = ref(false)
  const grid = reactive({ size: 5, visible: true, snap: true })
  const view = reactive({ zoom: 3.2 })
  const rulersVisible = ref(readRulersVisible())
  const theme = ref<DesignerTheme>(readTheme())
  applyTheme(theme.value)
  const uiVisibility = reactive<UiVisibilityConfig>(readUiVisibility())
  const templates = ref<TemplateSummary[]>([])
  const selection = reactive<SelectionState>(emptySelection())
  const layers = ref<LayerItem[]>([])
  const objectCount = ref(0)
  const canUndo = ref(false)
  const canRedo = ref(false)
  const savedAt = ref<number | null>(null)
  const notice = ref('')
  const dataFields = ref<DataField[]>([])
  /** Rendered by the designer root so the dialog is not trapped in a panel's stacking context. */
  const dataSourceOpen = ref(false)
  /** Whether sample-data fields can be dragged onto the page. */
  const dataDragEnabled = ref(readDataDragEnabled())
  /** Whether the canvas shows resolved sample values instead of raw tokens. */
  const showSampleValues = ref(readShowSampleValues())
  /** Flat + first-detail-row fields used by the design-canvas resolver. */
  const designSampleFields = computed(() =>
    sampleFieldsWithDetails(dataFields.value),
  )
  /** Special-character / bound-checkbox picker, rendered by the root. */
  const symbolPickerOpen = ref(false)
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
  /** Text of the current target: the active text element or table cell. */
  const selectedEditableContent = computed(() => {
    if (tableEditing.value && table.value) {
      return String(
        table.value.cellData[tableSelection.row]?.[tableSelection.col]?.v ??
          '',
      )
    }
    return selection.isText ? selection.text.content : ''
  })
  const selectedCheckboxCount = computed(() =>
    countCheckboxChars(selectedEditableContent.value),
  )
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
  /**
   * Active column / row border drag while editing cells. `start` is the
   * pointer position in table-local millimetres and `size` the original
   * column width or row height.
   */
  let tableDividerDrag: {
    kind: 'column' | 'row'
    index: number
    start: number
    size: number
  } | null = null

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

  /**
   * Screen pixels per physical millimetre at 100% zoom. The browser already
   * maps CSS pixels through the OS / browser scaling, so the device pixel
   * ratio is what makes "100%" mean true physical size on this display.
   */
  function displayScale(): number {
    const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
    return clamp(ratio, 0.5, 4)
  }

  const zoomPercent = computed(() =>
    Math.round((view.zoom / (PX_PER_MM * displayScale())) * 100),
  )

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
      clearAlignmentGuides()
      refreshSelection()
      refreshLayers()
      scheduleCommit()
    })

    c.on('object:scaling', (e: any) => {
      const target = e.target as FabricObject | undefined
      if (!target) return
      // Never let a resize push content outside the page margins.
      constrainToPrintable(target, true)
      if (isTableObject(target)) {
        // Keep the inspector's frame and the inline overlay in sync while the
        // Fabric controls are being dragged.
        refreshSelection()
      }
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
      const refs = alignmentReferences(target)
      constrainToPrintable(target)
      snapToAlignment(target, refs)
      // Margins win over a smart-guide snap at the very page edge.
      constrainToPrintable(target)
      computeAlignmentGuides(target, refs)
      refreshSelection()
    })

    c.on('object:rotating', (e: any) => {
      const target = e.target as FabricObject | undefined
      if (!target) return
      constrainToPrintable(target)
      refreshSelection()
    })

    c.on('text:changed', (e: any) => {
      const target = e.target as any
      // While editing, the canvas shows the raw binding; keep rawText in sync
      // so serialization and undo see the logical content.
      if (target && isTextType(typeOf(target)) && target.isEditing) {
        target.rawText = String(target.text ?? '')
      }
      refreshSelection()
      scheduleCommit()
    })

    c.on('text:editing:entered', (e: any) => {
      const target = e.target as any
      if (!target || !isTextType(typeOf(target))) return
      // Fabric may start editing before our double-click handler runs; force
      // the editor to show the binding, not the resolved sample value.
      const raw = rawTextOf(target)
      if (target.text === raw) return
      target.set('text', raw)
      const hidden = target.hiddenTextarea as HTMLTextAreaElement | undefined
      if (hidden) {
        hidden.value = raw
        const end = raw.length
        target.selectionStart = end
        target.selectionEnd = end
        hidden.selectionStart = end
        hidden.selectionEnd = end
      }
      target.setCoords()
      c.requestRenderAll()
    })

    c.on('text:editing:exited', (e: any) => {
      const target = e.target as any
      if (!target || !isTextType(typeOf(target))) return
      target.rawText = String(target.text ?? '')
      // Restore the resolved sample value now that editing has finished.
      applyTextDisplay(target)
      c.requestRenderAll()
      refreshSelection()
      scheduleCommit()
    })

    // The cell range is painted by Fabric on the lower canvas. This handler
    // only rewrites the reactive selection state.
    c.on('after:render', (event: any) => {
      if (event.ctx !== (c as any).contextContainer) return
      drawWatermark(event.ctx, view.zoom)
      drawAlignmentGuides(event.ctx, view.zoom)
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
      const target = e.target as FabricObject | undefined
      const active = c.getActiveObject() as FabricObject | null
      const isSelectedTable =
        !!target && !!active && target === active && isTableObject(target)

      if (!tableEditing.value) {
        // A selected table can resize its rows / columns without entering
        // cell editing first: dragging an internal border is enough.
        if (!isSelectedTable || !target) return
        const config = table.value ?? tableConfigOf(target)
        const point = scenePointOfEvent(e)
        if (!config || !point) return
        const local = tableLocalPoint(target, config, point.x, point.y)
        const divider = tableDividerAt(
          config,
          local.x,
          local.y,
          tableDividerTolerance(local.scaleX),
        )
        if (!divider) return
        ;(e.e as MouseEvent | undefined)?.preventDefault?.()
        beginTableDividerDrag(config, local, divider)
        return
      }

      if (!target || !isTableObject(target)) {
        // Clicking the page or another element leaves cell editing.
        endTableEdit()
        return
      }
      if (target !== active) {
        endTableEdit()
        return
      }
      // Dragging an internal column / row border resizes just that track,
      // Excel-style, instead of starting a cell selection.
      const config = table.value ?? tableConfigOf(target)
      const point = scenePointOfEvent(e)
      if (config && point) {
        const local = tableLocalPoint(target, config, point.x, point.y)
        const divider = tableDividerAt(
          config,
          local.x,
          local.y,
          tableDividerTolerance(local.scaleX),
        )
        if (divider) {
          ;(e.e as MouseEvent | undefined)?.preventDefault?.()
          beginTableDividerDrag(config, local, divider)
          return
        }
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
      const active = c.getActiveObject() as FabricObject | null
      if (!active || !isTableObject(active)) return
      const editing = tableEditing.value
      const target = e.target as FabricObject | undefined
      const config = table.value ?? tableConfigOf(active)
      const point = scenePointOfEvent(e)
      if (!config || !point) return
      const local = tableLocalPoint(active, config, point.x, point.y)
      const locked = (active as any).locked === true

      if (tableDividerDrag) {
        const position =
          tableDividerDrag.kind === 'column' ? local.x : local.y
        const size = tableDividerDrag.size + (position - tableDividerDrag.start)
        const base = table.value ?? config
        commitTableConfig(
          tableDividerDrag.kind === 'column'
            ? resizeColumn(base, tableDividerDrag.index, size)
            : resizeRow(base, tableDividerDrag.index, size),
        )
        // Rebuilding replaces the group; keep it pinned while dragging.
        const rebuilt = c.getActiveObject() as any
        rebuilt?.set?.({ lockMovementX: true, lockMovementY: true })
        return
      }

      // Outside cell-edit mode the table is only hit when the pointer is on
      // it; restore movement when the pointer leaves.
      if (!editing && target !== active) {
        ;(active as any).set({
          lockMovementX: locked,
          lockMovementY: locked,
          hoverCursor: 'move',
        })
        return
      }

      const divider = tableDividerAt(
        config,
        local.x,
        local.y,
        tableDividerTolerance(local.scaleX),
      )
      const cursor = divider
        ? divider.kind === 'column'
          ? 'col-resize'
          : 'row-resize'
        : editing
          ? 'cell'
          : 'move'
      ;(active as any).hoverCursor = cursor
      if (!editing) {
        // Lock movement while over a divider so Fabric does not drag the
        // whole table instead of resizing the track.
        ;(active as any).set({
          lockMovementX: locked || !!divider,
          lockMovementY: locked || !!divider,
        })
      }
      c.setCursor(cursor)

      if (!editing || !tablePointerSelecting) return
      const cell = cellAtPoint(config, local.x, local.y)
      if (!cell) return
      selectTableCells(cell.row, cell.col, true)
    })

    c.on('mouse:up', () => {
      tablePointerSelecting = false
      clearAlignmentGuides()
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
      // Edit the binding itself, not the resolved sample value shown on the
      // design canvas.
      const raw = rawTextOf(target)
      if (target.text !== raw) {
        target.set('text', raw)
        target.setCoords()
      }
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

  /**
   * Convert a scene point to table-local millimetres (the table's top-left
   * corner is the origin), including rotation and Fabric scaling.
   */
  function tableLocalPoint(
    obj: FabricObject,
    config: TableConfig,
    x: number,
    y: number,
  ): { x: number; y: number; scaleX: number; scaleY: number } {
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
    return {
      x: (dx * cos + dy * sin) / scaleX + getTableWidth(config) / 2,
      y: (-dx * sin + dy * cos) / scaleY + getTableHeight(config) / 2,
      scaleX,
      scaleY,
    }
  }

  /** Convert a scene point to a table cell coordinate, including rotation. */
  function tableCellAtScene(
    obj: FabricObject,
    config: TableConfig,
    x: number,
    y: number,
  ): { row: number; col: number } | null {
    const local = tableLocalPoint(obj, config, x, y)
    return cellAtPoint(config, local.x, local.y)
  }

  /**
   * Hit-test an internal column / row divider. `tolerance` is in table-local
   * millimetres, so callers divide their screen-pixel tolerance by zoom.
   */
  function tableDividerAt(
    config: TableConfig,
    localX: number,
    localY: number,
    tolerance: number,
  ): { kind: 'column' | 'row'; index: number } | null {
    const widths = getColumnWidths(config)
    const heights = getRowHeights(config)
    const totalWidth = widths.reduce((sum, value) => sum + value, 0)
    const totalHeight = heights.reduce((sum, value) => sum + value, 0)
    if (
      localX < -tolerance ||
      localY < -tolerance ||
      localX > totalWidth + tolerance ||
      localY > totalHeight + tolerance
    ) {
      return null
    }

    let best: { kind: 'column' | 'row'; index: number; distance: number } | null =
      null
    let x = 0
    for (let col = 0; col < widths.length - 1; col += 1) {
      x += widths[col]
      const distance = Math.abs(localX - x)
      if (distance <= tolerance && (!best || distance < best.distance)) {
        best = { kind: 'column', index: col, distance }
      }
    }
    let y = 0
    for (let row = 0; row < heights.length - 1; row += 1) {
      y += heights[row]
      const distance = Math.abs(localY - y)
      if (distance <= tolerance && (!best || distance < best.distance)) {
        best = { kind: 'row', index: row, distance }
      }
    }
    return best ? { kind: best.kind, index: best.index } : null
  }

  /** Screen-pixel divider tolerance expressed in table-local millimetres. */
  function tableDividerTolerance(scale = 1): number {
    return 3 / Math.max(0.01, view.zoom * Math.abs(scale || 1))
  }

  function bakeTransform(obj: FabricObject) {
    const anyObj = obj as any
    const sx = anyObj.scaleX ?? 1
    const sy = anyObj.scaleY ?? 1
    if (Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6) return

    // Images (including QR / barcode bitmaps) must keep their natural pixel
    // size: Fabric treats a width smaller than the bitmap as a source crop,
    // so folding the scale into width / height would show only a corner of the
    // image after a drag or resize. Keep using scaleX / scaleY instead.
    if (isImageType(typeOf(obj))) return

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
    const physical = PX_PER_MM * displayScale()
    const comfortable = physical * DEFAULT_ZOOM_SCALE
    const z = Math.min(
      (viewportWidth - padding * 2) / page.width,
      (viewportHeight - padding * 2) / page.height,
      comfortable,
    )
    view.zoom = clamp(round(z, 3), 0.3, comfortable)
  }

  function setZoom(zoom: number) {
    const max = Math.max(12, PX_PER_MM * displayScale() * 2)
    view.zoom = clamp(round(zoom, 3), 0.3, max)
  }

  function zoomIn() {
    setZoom(view.zoom * 1.2)
  }

  function zoomOut() {
    setZoom(view.zoom / 1.2)
  }

  function resetZoom() {
    setZoom(PX_PER_MM * displayScale() * DEFAULT_ZOOM_SCALE)
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

  /**
   * Printable area inside the page margins. Returns null when no margins are
   * configured, in which case content is not constrained.
   */
  function printableBounds(): {
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
  } | null {
    const margin = page.margin
    if (margin.top + margin.right + margin.bottom + margin.left <= 0.001) {
      return null
    }
    const left = round(margin.left, 2)
    const top = round(margin.top, 2)
    const right = round(page.width - margin.right, 2)
    const bottom = round(page.height - margin.bottom, 2)
    if (right - left < 1 || bottom - top < 1) return null
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    }
  }

  /**
   * Keep an object (or multi-selection) inside the printable area. With
   * `limitScale`, an object that is larger than the printable area is shrunk
   * to fit as well.
   */
  function constrainToPrintable(obj: FabricObject, limitScale = false) {
    const bounds = printableBounds()
    if (!bounds) return
    const anyObj = obj as any
    // Fabric only refreshes the cached coordinates after the transform action
    // handler returns, so getBoundingRect() would lag one pointer event behind
    // while moving / scaling. Refresh it before measuring.
    obj.setCoords()
    if (limitScale && Math.abs(anyObj.angle ?? 0) < 0.01) {
      const rect = obj.getBoundingRect()
      const scaleX = Math.abs(anyObj.scaleX ?? 1) || 1
      const scaleY = Math.abs(anyObj.scaleY ?? 1) || 1
      let nextScaleX = scaleX
      let nextScaleY = scaleY
      if (rect.width > bounds.width && rect.width > 0) {
        nextScaleX = scaleX * (bounds.width / rect.width)
      }
      if (rect.height > bounds.height && rect.height > 0) {
        nextScaleY = scaleY * (bounds.height / rect.height)
      }
      if (nextScaleX !== scaleX || nextScaleY !== scaleY) {
        anyObj.set({ scaleX: nextScaleX, scaleY: nextScaleY })
        obj.setCoords()
      }
    }

    const rect = obj.getBoundingRect()
    let dx = 0
    let dy = 0
    if (rect.left < bounds.left) {
      dx = bounds.left - rect.left
    } else if (rect.left + rect.width > bounds.right) {
      dx = bounds.right - (rect.left + rect.width)
    }
    if (rect.top < bounds.top) {
      dy = bounds.top - rect.top
    } else if (rect.top + rect.height > bounds.bottom) {
      dy = bounds.bottom - (rect.top + rect.height)
    }
    if (dx || dy) {
      anyObj.set({
        left: (anyObj.left ?? 0) + dx,
        top: (anyObj.top ?? 0) + dy,
      })
      obj.setCoords()
    }
  }

  // -------------------------------------------------------- alignment guides

  let alignmentGuides: AlignmentGuide[] = []

  /** Visible objects that can act as alignment references for `target`. */
  function alignmentReferences(target: FabricObject): FabricObject[] {
    if (!canvas) return []
    const excluded = new Set<FabricObject>(canvas.getActiveObjects())
    excluded.add(target)
    return canvas
      .getObjects()
      .filter((obj) => !excluded.has(obj) && obj.visible !== false)
  }

  /** The three alignment tracks (start / centre / end) of a bounding box. */
  function alignmentEdges(rect: {
    left: number
    top: number
    width: number
    height: number
  }) {
    return {
      xs: [rect.left, rect.left + rect.width / 2, rect.left + rect.width],
      ys: [rect.top, rect.top + rect.height / 2, rect.top + rect.height],
    }
  }

  /** Snap the moving object when one of its edges / centres lines up. */
  function snapToAlignment(target: FabricObject, refs: FabricObject[]) {
    if (!refs.length) {
      alignmentGuides = []
      return
    }
    target.setCoords()
    const moving = target.getBoundingRect()
    const { xs, ys } = alignmentEdges(moving)
    // Match roughly within 6 screen pixels.
    const threshold = Math.min(3, 6 / Math.max(0.01, view.zoom))
    let bestX = threshold
    let bestY = threshold
    let dx = 0
    let dy = 0

    for (const ref of refs) {
      const edges = alignmentEdges(ref.getBoundingRect())
      for (const movingX of xs) {
        for (const refX of edges.xs) {
          const delta = refX - movingX
          const distance = Math.abs(delta)
          if (distance <= bestX) {
            bestX = distance
            dx = delta
          }
        }
      }
      for (const movingY of ys) {
        for (const refY of edges.ys) {
          const delta = refY - movingY
          const distance = Math.abs(delta)
          if (distance <= bestY) {
            bestY = distance
            dy = delta
          }
        }
      }
    }

    if (dx || dy) {
      const anyObj = target as any
      target.set({
        left: (anyObj.left ?? 0) + dx,
        top: (anyObj.top ?? 0) + dy,
      })
      target.setCoords()
    }
  }

  /** Record the exact edge / centre matches for drawing reference lines. */
  function computeAlignmentGuides(
    target: FabricObject,
    refs: FabricObject[],
  ) {
    if (!refs.length) {
      alignmentGuides = []
      return
    }
    target.setCoords()
    const moving = target.getBoundingRect()
    const { xs, ys } = alignmentEdges(moving)
    const epsilon = 0.05
    const pad = 4 / Math.max(0.01, view.zoom)
    const guides: AlignmentGuide[] = []

    for (const ref of refs) {
      const rect = ref.getBoundingRect()
      const edges = alignmentEdges(rect)
      for (const movingX of xs) {
        for (const refX of edges.xs) {
          if (Math.abs(movingX - refX) > epsilon) continue
          guides.push({
            orientation: 'vertical',
            position: refX,
            from: Math.min(moving.top, rect.top) - pad,
            to:
              Math.max(moving.top + moving.height, rect.top + rect.height) +
              pad,
          })
        }
      }
      for (const movingY of ys) {
        for (const refY of edges.ys) {
          if (Math.abs(movingY - refY) > epsilon) continue
          guides.push({
            orientation: 'horizontal',
            position: refY,
            from: Math.min(moving.left, rect.left) - pad,
            to:
              Math.max(moving.left + moving.width, rect.left + rect.width) +
              pad,
          })
        }
      }
    }

    // One guide per position, spanning every aligned object.
    const merged = new Map<string, AlignmentGuide>()
    for (const guide of guides) {
      const key = `${guide.orientation}:${round(guide.position, 2)}`
      const existing = merged.get(key)
      if (existing) {
        existing.from = Math.min(existing.from, guide.from)
        existing.to = Math.max(existing.to, guide.to)
      } else {
        merged.set(key, {
          ...guide,
          position: round(guide.position, 2),
        })
      }
    }
    alignmentGuides = [...merged.values()]
  }

  function drawAlignmentGuides(
    ctx: CanvasRenderingContext2D,
    zoom: number,
  ) {
    if (!alignmentGuides.length || zoom <= 0) return
    ctx.save()
    ctx.strokeStyle = '#f43f5e'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const guide of alignmentGuides) {
      if (guide.orientation === 'vertical') {
        const x = Math.round(guide.position * zoom) + 0.5
        ctx.moveTo(x, guide.from * zoom)
        ctx.lineTo(x, guide.to * zoom)
      } else {
        const y = Math.round(guide.position * zoom) + 0.5
        ctx.moveTo(guide.from * zoom, y)
        ctx.lineTo(guide.to * zoom, y)
      }
    }
    ctx.stroke()
    ctx.restore()
  }

  function clearAlignmentGuides() {
    if (!alignmentGuides.length) return
    alignmentGuides = []
    canvas?.requestRenderAll()
  }

  // ------------------------------------------------------------- watermark

  function watermarkLabel(): string {
    return page.watermarkText.trim() || DEFAULT_WATERMARK_TEXT
  }

  function watermarkFontSize(): number {
    return clamp(round(Math.min(page.width, page.height) * 0.042, 2), 6, 16)
  }

  /** Diagonal tiles that cover the page; shared by the canvas and exports. */
  function watermarkTiles(fontSize: number): Array<{ x: number; y: number }> {
    const text = watermarkLabel()
    const textWidth = Math.max(24, text.length * fontSize * 1.05)
    const stepX = Math.max(44, textWidth * 1.35)
    const stepY = Math.max(34, fontSize * 4.2)
    const tiles: Array<{ x: number; y: number }> = []
    let row = 0
    for (let y = stepY / 2; y < page.height + stepY; y += stepY) {
      const offset = row % 2 === 0 ? 0 : stepX / 2
      for (let x = stepX / 2 - offset; x < page.width + stepX; x += stepX) {
        tiles.push({ x, y })
      }
      row += 1
    }
    return tiles
  }

  function drawWatermark(ctx: CanvasRenderingContext2D, zoom: number) {
    if (!page.watermarkVisible || zoom <= 0) return
    const text = watermarkLabel()
    const fontSize = watermarkFontSize()
    const radians = (WATERMARK_ANGLE * Math.PI) / 180
    ctx.save()
    ctx.fillStyle = WATERMARK_COLOR
    ctx.globalAlpha = WATERMARK_OPACITY
    ctx.font = `${fontSize}px "${DEFAULT_FONT}", "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const tile of watermarkTiles(fontSize)) {
      ctx.save()
      ctx.translate(tile.x * zoom, tile.y * zoom)
      ctx.rotate(radians)
      ctx.scale(zoom, zoom)
      ctx.fillText(text, 0, 0)
      ctx.restore()
    }
    ctx.restore()
  }

  /** Watermark copies added to the throwaway preview canvas for SVG / PDF. */
  function watermarkObjects(): FabricObject[] {
    if (!page.watermarkVisible) return []
    const text = watermarkLabel()
    const fontSize = watermarkFontSize()
    const width = Math.max(fontSize * 4, text.length * fontSize * 1.15)
    return watermarkTiles(fontSize).map(
      (tile) =>
        new Textbox(text, {
          left: tile.x,
          top: tile.y,
          originX: 'center',
          originY: 'center',
          angle: WATERMARK_ANGLE,
          width,
          fontSize,
          fontFamily: DEFAULT_FONT,
          fill: WATERMARK_COLOR,
          opacity: WATERMARK_OPACITY,
          textAlign: 'center',
          lineHeight: 1,
          selectable: false,
          evented: false,
          objectCaching: false,
        } as any),
    )
  }

  function setWatermarkVisible(visible: boolean) {
    page.watermarkVisible = visible
    canvas?.requestRenderAll()
    scheduleCommit()
  }

  function setWatermarkText(text: string) {
    page.watermarkText = String(text ?? '').slice(0, 60)
    canvas?.requestRenderAll()
    scheduleCommit()
  }

  // --------------------------------------------------------- sheet underlay

  async function setPageBackgroundFile(file: File) {
    if (!file.type.startsWith('image/')) {
      notify('请选择图片文件')
      return
    }
    try {
      const dataUrl = await prepareBackgroundImage(file)
      page.backgroundImage = dataUrl
      page.backgroundVisible = true
      // A new sheet image invalidates any previous manual alignment.
      page.backgroundTransform = null
      scheduleCommit()
      notify('已导入纸张底图')
    } catch (err) {
      console.warn(err)
      notify('底图加载失败')
    }
  }

  function setPageBackgroundVisible(visible: boolean) {
    page.backgroundVisible = !!visible
    if (!page.backgroundVisible) backgroundAligning.value = false
    scheduleCommit()
  }

  function setPageBackgroundOpacity(opacity: number) {
    page.backgroundOpacity = clamp(round(Number(opacity) || 0, 2), 0, 1)
    scheduleCommit()
  }

  function setPageBackgroundFit(fit: PageBackgroundFit) {
    page.backgroundFit = readBackgroundFit(fit)
    // Picking a fit mode is an explicit request to re-frame the sheet.
    page.backgroundTransform = null
    scheduleCommit()
  }

  function setPageBackgroundPrint(enabled: boolean) {
    page.backgroundPrint = !!enabled && !page.overprint
    scheduleCommit()
  }

  function removePageBackground() {
    if (!page.backgroundImage) return
    page.backgroundImage = ''
    page.backgroundPrint = false
    page.backgroundTransform = null
    backgroundAligning.value = false
    scheduleCommit()
    notify('已移除纸张底图')
  }

  /** Intrinsic size of the underlay, needed to frame it before alignment. */
  function loadBackgroundNatural() {
    const src = page.backgroundImage
    if (!src) {
      backgroundNatural.width = 0
      backgroundNatural.height = 0
      return
    }
    const image = new Image()
    image.onload = () => {
      if (page.backgroundImage !== src) return
      backgroundNatural.width = image.naturalWidth || 0
      backgroundNatural.height = image.naturalHeight || 0
    }
    image.onerror = () => {
      if (page.backgroundImage !== src) return
      backgroundNatural.width = 0
      backgroundNatural.height = 0
    }
    image.src = src
  }

  watch(() => page.backgroundImage, loadBackgroundNatural, { immediate: true })

  /** Frame the underlay inside the page for the selected fit mode. */
  function backgroundFrame(
    naturalWidth: number,
    naturalHeight: number,
  ): PageBackgroundTransform {
    if (page.backgroundTransform) return { ...page.backgroundTransform }
    const width = Math.max(1, naturalWidth)
    const height = Math.max(1, naturalHeight)
    if (page.backgroundFit === 'stretch') {
      return { left: 0, top: 0, width: page.width, height: page.height }
    }
    const ratio =
      page.backgroundFit === 'contain'
        ? Math.min(page.width / width, page.height / height)
        : Math.max(page.width / width, page.height / height)
    const drawWidth = width * ratio
    const drawHeight = height * ratio
    return {
      left: (page.width - drawWidth) / 2,
      top: (page.height - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    }
  }

  /**
   * Current underlay frame in millimetres. Shared by the DOM underlay and the
   * SVG / PDF renderers so alignment is identical everywhere.
   */
  const backgroundLayout = computed<PageBackgroundTransform | null>(() => {
    if (!page.backgroundImage) return null
    if (page.backgroundTransform) return { ...page.backgroundTransform }
    if (!backgroundNatural.width || !backgroundNatural.height) return null
    return backgroundFrame(backgroundNatural.width, backgroundNatural.height)
  })

  function clampBackgroundTransform(
    frame: PageBackgroundTransform,
  ): PageBackgroundTransform {
    const maxWidth = Math.max(page.width, page.height) * BACKGROUND_MAX_SCALE
    const maxHeight = Math.max(page.width, page.height) * BACKGROUND_MAX_SCALE
    const width = clamp(round(frame.width, 1), BACKGROUND_MIN_MM, maxWidth)
    const height = clamp(round(frame.height, 1), BACKGROUND_MIN_MM, maxHeight)
    const limitX = page.width + width
    const limitY = page.height + height
    return {
      left: clamp(round(frame.left, 1), -limitX, limitX),
      top: clamp(round(frame.top, 1), -limitY, limitY),
      width,
      height,
    }
  }

  /** Persist a manually aligned underlay frame (millimetres). */
  function setBackgroundTransform(frame: PageBackgroundTransform | null) {
    if (!frame) {
      if (!page.backgroundTransform) return
      page.backgroundTransform = null
      scheduleCommit()
      return
    }
    if (!(Number(frame.width) > 0) || !(Number(frame.height) > 0)) return
    page.backgroundTransform = clampBackgroundTransform(frame)
    scheduleCommit()
  }

  /** Fall back to the fit mode computed frame. */
  function resetBackgroundTransform() {
    if (!page.backgroundTransform) return
    page.backgroundTransform = null
    scheduleCommit()
    notify('已恢复底图填充方式')
  }

  /** Toggle interactive underlay alignment on the stage. */
  function setBackgroundAligning(enabled: boolean) {
    const next = !!enabled && !!page.backgroundImage
    if (next && !page.backgroundVisible) page.backgroundVisible = true
    backgroundAligning.value = next
    if (next) clearSelection()
  }

  /**
   * 套打 mode: the sheet image represents pre-printed paper, so it is an
   * alignment reference only and never enters SVG / PDF output.
   */
  function setOverprint(enabled: boolean) {
    page.overprint = !!enabled
    if (page.overprint) page.backgroundPrint = false
    scheduleCommit()
  }

  /** Registration offset applied to printed output, in millimetres. */
  function setPrintOffset(x: number, y: number) {
    page.printOffset.x = clamp(
      round(Number(x) || 0, 1),
      -PRINT_OFFSET_LIMIT,
      PRINT_OFFSET_LIMIT,
    )
    page.printOffset.y = clamp(
      round(Number(y) || 0, 1),
      -PRINT_OFFSET_LIMIT,
      PRINT_OFFSET_LIMIT,
    )
    scheduleCommit()
  }

  function printOffsetMm(): PrintOffset {
    // The registration offset belongs to 套打: outside that mode output must
    // stay aligned with the canvas even if a value is still stored.
    if (!page.overprint) return { x: 0, y: 0 }
    return { x: round(page.printOffset.x, 2), y: round(page.printOffset.y, 2) }
  }

  /** Underlay copy for the preview canvas; null unless it should be printed. */
  async function backgroundObject(): Promise<FabricObject | null> {
    if (
      !page.backgroundImage ||
      !page.backgroundVisible ||
      !page.backgroundPrint ||
      page.overprint
    ) {
      return null
    }
    try {
      const image = await FabricImage.fromURL(page.backgroundImage)
      const frame = backgroundFrame(image.width || 1, image.height || 1)
      image.set({
        left: frame.left,
        top: frame.top,
        originX: 'left',
        originY: 'top',
        scaleX: frame.width / Math.max(1, image.width || 1),
        scaleY: frame.height / Math.max(1, image.height || 1),
        opacity: page.backgroundOpacity,
        selectable: false,
        evented: false,
        objectCaching: false,
      } as any)
      return image
    } catch (err) {
      console.warn('background image failed to load', err)
      return null
    }
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

  function setTheme(value: DesignerTheme) {
    theme.value = value === 'dark' ? 'dark' : 'light'
    applyTheme(theme.value)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme.value)
    } catch {
      // Storage may be unavailable; the toggle still works for this session.
    }
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  function writeUiVisibility() {
    try {
      localStorage.setItem(
        UI_VISIBILITY_STORAGE_KEY,
        JSON.stringify(uiVisibility),
      )
    } catch {
      // Preferences are best-effort and may be blocked by the host.
    }
  }

  /**
   * Toggle one UI visibility flag using a `group.key` path, e.g.
   * `tools.table`, `topbar.margins` or `inspectorTabs.layers`.
   */
  function setUiVisible(path: string, visible: boolean) {
    const [group, key] = path.split('.')
    const target = (uiVisibility as Record<string, unknown>)[group]
    if (!target || typeof target !== 'object') return
    if (!(key in (target as Record<string, boolean>))) return
    ;(target as Record<string, boolean>)[key] = !!visible
    writeUiVisibility()
  }

  function resetUiVisibility() {
    const defaults = defaultUiVisibility()
    for (const group of Object.keys(defaults) as Array<
      keyof UiVisibilityConfig
    >) {
      Object.assign(uiVisibility[group], defaults[group])
    }
    writeUiVisibility()
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
    let textCount = 0
    let tableCount = 0
    for (const obj of objs) {
      if (isTextType(typeOf(obj))) textCount += 1
      else if (isTableObject(obj)) tableCount += 1
    }

    selection.count = objs.length
    selection.kind = kind
    selection.kindLabel = kind ? KIND_LABEL[kind] : `${objs.length} 个对象`
    selection.isText = kind === 'text'
    selection.isShape = kind === 'rect' || kind === 'ellipse'
    selection.isImage = kind === 'image'
    selection.isLine = kind === 'line'
    selection.isTable = kind === 'table'
    selection.isCode = kind === 'qrcode' || kind === 'barcode'
    selection.textCount = textCount
    selection.tableCount = tableCount

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

    // For a multi-selection, show the style of the first text element (or
    // table) so shared font controls display a meaningful value.
    const textSource: any = single
      ? first
      : ((objs.find((obj) => isTextType(typeOf(obj))) as any) ??
        (objs.find((obj) => isTableObject(obj)) as any) ??
        first)
    const tableSource =
      textSource && isTableObject(textSource) ? tableConfigOf(textSource) : null

    selection.code.content = single ? String(first.codeText ?? '') : ''
    selection.text.content = single
      ? isTextType(typeOf(first))
        ? rawTextOf(first)
        : String(first.text ?? '')
      : ''
    selection.text.fontSize = round(
      (tableSource ? tableSource.fontSize : (textSource.fontSize ?? 0)) *
        Math.abs(textSource.scaleY ?? 1),
      2,
    )
    selection.text.fontFamily = tableSource
      ? tableSource.fontFamily
      : textSource.fontFamily || DEFAULT_FONT
    selection.text.fontWeight = normalizeWeight(textSource.fontWeight)
    selection.text.fontStyle = textSource.fontStyle === 'italic' ? 'italic' : 'normal'
    selection.text.underline = !!textSource.underline
    selection.text.letterSpacing = round(
      ((textSource.charSpacing ?? 0) *
        (textSource.fontSize ?? 0) *
        Math.abs(textSource.scaleY ?? 1)) /
        1000,
      2,
    )
    selection.text.textAlign = textSource.textAlign || 'left'
    selection.text.lineHeight = round(textSource.lineHeight ?? 1.3, 2)
    selection.text.backgroundColor = toHexColor(textSource.backgroundColor)

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
    const bounds = printableBounds() ?? {
      left: 0,
      top: 0,
      width: page.width,
      height: page.height,
    }
    const left = bounds.left + (bounds.width - width) / 2 + offset
    const top = bounds.top + (bounds.height - height) / 2 + offset
    return {
      left: round(
        clamp(left, bounds.left, Math.max(bounds.left, bounds.left + bounds.width - width)),
        1,
      ),
      top: round(
        clamp(top, bounds.top, Math.max(bounds.top, bounds.top + bounds.height - height)),
        1,
      ),
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
    if (kind === 'line' || kind === 'qrcode' || kind === 'barcode') {
      anyObj.customKind = kind
    }
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

  function addTextWithContent(content: string) {
    if (!canvas) return
    const width = 60
    const pos = nextPosition(width, 14)
    const text = new Textbox(content, {
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
    ;(text as any).rawText = content
    applyTextDisplay(text)
    decorate(text, 'text')
    commitAdd(text)
  }

  function addText() {
    addTextWithContent('双击编辑文本')
  }

  function setDataDragEnabled(enabled: boolean) {
    dataDragEnabled.value = !!enabled
    writeDataDragEnabled(dataDragEnabled.value)
  }

  /**
   * Add a text element bound to one sample-data field. Used when a field is
   * dragged from the data panel onto the page.
   */
  function addFieldText(key: string, left?: number, top?: number) {
    if (!canvas) return
    const name = String(key ?? '').trim()
    if (!name) return
    const width = 60
    const height = round(DEFAULT_TEXT_SIZE * 1.3, 1)
    const bounds = printableBounds() ?? {
      left: 0,
      top: 0,
      width: page.width,
      height: page.height,
    }
    const maxLeft = Math.max(bounds.left, bounds.left + bounds.width - width)
    const maxTop = Math.max(bounds.top, bounds.top + bounds.height - height)
    const pos =
      left === undefined || top === undefined
        ? nextPosition(width, height)
        : {
            left: round(clamp(Number(left), bounds.left, maxLeft), 1),
            top: round(clamp(Number(top), bounds.top, maxTop), 1),
          }
    const text = new Textbox(`{{${name}}}`, {
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
    ;(text as any).rawText = `{{${name}}}`
    applyTextDisplay(text)
    decorate(text, 'text', name)
    commitAdd(text)
    notify(`已插入字段 ${name}`)
  }

  /**
   * Insert a symbol (or a bound-checkbox token) into the current editing
   * target: an editing text box at its caret, a selected table cell, or a new
   * text element when nothing suitable is selected.
   */
  function insertTextSymbol(symbol: string) {
    const value = String(symbol ?? '')
    if (!canvas || !value) return
    const active = canvas.getActiveObject() as any
    if (active && isTextType(typeOf(active))) {
      if (active.isEditing && typeof active.insertChars === 'function') {
        active.insertChars(value)
      } else {
        active.set('rawText', `${rawTextOf(active)}${value}`)
        applyTextDisplay(active)
      }
      active.setCoords()
      canvas.requestRenderAll()
      refreshSelection()
      refreshLayers()
      scheduleCommit()
      return
    }
    if (tableEditing.value && table.value) {
      const row = tableSelection.row
      const col = tableSelection.col
      const current = String(table.value.cellData[row]?.[col]?.v ?? '')
      updateSelectedCells({ text: current + value })
      return
    }
    addTextWithContent(value)
  }

  /**
   * Replace the box glyphs in the current text / table cell with checkbox
   * tokens, one token per supplied field value. Returns how many boxes were
   * bound. Existing `{{...}}` tokens are left untouched.
   */
  function bindCheckboxValues(
    field: string,
    values: string[],
    checked = '☑',
    unchecked = '□',
    labels: string[] = [],
  ): number {
    const key = field.trim()
    if (!key || !values.length) return 0
    const checkedChar = checked.trim() || '☑'
    const uncheckedChar = unchecked.trim() || '□'
    const tokens = values.map((value, index) => {
      const prefix = String(labels[index] ?? '').trim()
      return `${prefix}{{#${key}=${String(value).trim()}|${checkedChar}|${uncheckedChar}}}`
    })

    if (tableEditing.value && table.value) {
      const row = tableSelection.row
      const col = tableSelection.col
      const current = String(table.value.cellData[row]?.[col]?.v ?? '')
      const result = replaceCheckboxChars(current, tokens)
      if (result.count) updateSelectedCells({ text: result.text })
      return result.count
    }

    const active = canvas?.getActiveObject() as any
    if (active && isTextType(typeOf(active))) {
      const result = replaceCheckboxChars(rawTextOf(active), tokens)
      if (result.count) {
        active.set('rawText', result.text)
        applyTextDisplay(active)
        active.setCoords()
        canvas!.requestRenderAll()
        refreshSelection()
        refreshLayers()
        scheduleCommit()
      }
      return result.count
    }
    return 0
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

  /**
   * Checkbox bindings are meant to be seen, so the design canvas resolves
   * them against the sample data while leaving `{{field}}` tokens raw.
   */
  function displayTableText(text: string) {
    if (showSampleValues.value) {
      return resolveBindings(text, designSampleFields.value)
    }
    return resolveCheckboxBindings(text, dataFields.value)
  }

  /** Text shown on the design canvas for a raw binding string. */
  function designText(raw: string): string {
    return showSampleValues.value
      ? resolveBindings(raw, designSampleFields.value)
      : raw
  }

  /**
   * Keep `rawText` (the real binding) and `text` (what the canvas draws) in
   * sync. While a text box is being edited it must show the raw token, so the
   * user edits the binding rather than the sample value.
   */
  function applyTextDisplay(obj: any) {
    if (!obj || !isTextType(typeOf(obj))) return
    const raw = rawTextOf(obj)
    obj.rawText = raw
    if (obj.isEditing) return
    const next = designText(raw)
    if (obj.text !== next) obj.set('text', next)
    obj.setCoords()
  }

  /** Re-resolve every text element after sample data or the mode changes. */
  function refreshTextDisplays() {
    if (!canvas) return
    let changed = 0
    for (const obj of canvas.getObjects()) {
      if (!isTextType(typeOf(obj))) continue
      applyTextDisplay(obj)
      changed += 1
    }
    if (!changed) return
    canvas.requestRenderAll()
    refreshSelection()
  }

  function setShowSampleValues(enabled: boolean) {
    const next = !!enabled
    if (showSampleValues.value === next) return
    showSampleValues.value = next
    writeShowSampleValues(next)
  }

  /**
   * Rebuild tables that contain bindings so the design canvas reflects data
   * changes (checkbox symbols, and sample values when that mode is enabled).
   */
  function refreshBindingTables() {
    if (!canvas) return
    let changed = 0
    for (const obj of [...canvas.getObjects()]) {
      if (!isTableObject(obj)) continue
      const config = tableConfigOf(obj)
      if (!config) continue
      const hasBinding = Object.values(config.cellData).some((row) =>
        Object.values(row ?? {}).some(
          (cell) => typeof cell.v === 'string' && cell.v.includes('{{'),
        ),
      )
      if (!hasBinding) continue

      const anyObj = obj as any
      const group = buildTableObject(config, displayTableText)
      group.set({
        left: anyObj.left ?? 0,
        top: anyObj.top ?? 0,
        angle: anyObj.angle ?? 0,
        scaleX: anyObj.scaleX ?? 1,
        scaleY: anyObj.scaleY ?? 1,
        opacity: anyObj.opacity ?? 1,
        visible: anyObj.visible !== false,
        name: anyObj.name || KIND_LABEL.table,
        elementId: anyObj.elementId || uid(),
        locked: anyObj.locked === true,
      } as any)
      ;(group as any).customKind = 'table'
      group.set(CONTROL_STYLE as any)
      applyLock(group, anyObj.locked === true)
      const index = canvas.getObjects().indexOf(obj)
      canvas.remove(obj)
      canvas.insertAt(Math.max(0, index), group)
      group.setCoords()
      changed += 1
    }
    if (!changed) return
    canvas.requestRenderAll()
    refreshSelection()
    refreshLayers()
  }

  watch(
    dataFields,
    () => {
      if (restoring) return
      refreshBindingTables()
      refreshTextDisplays()
    },
    { deep: true },
  )

  watch(showSampleValues, () => {
    if (restoring) return
    refreshBindingTables()
    refreshTextDisplays()
    scheduleCommit()
  })

  function addTable(rows = 3, cols = 3) {
    if (!canvas) return
    const bounds = printableBounds()
    const available = bounds ? bounds.width : page.width - 30
    const width = Math.max(2, Math.min(120, available))
    const config = createTableConfig(rows, cols, width)
    const size = getTableSize(config)
    const group = buildTableObject(config, displayTableText)
    group.set(nextPosition(size.width, size.height) as any)
    decorate(group, 'table')
    applyLock(group, false)
    commitAdd(group)
  }

  /**
   * Insert a multi-up label sheet: one table grid whose cells are the labels.
   * Using the table model keeps every cell independently editable with the
   * existing inline editor, while the whole sheet moves and scales as one
   * element.
   */
  function addLabelGrid(rows = 5, cols = 3) {
    if (!canvas) return
    const bounds = printableBounds() ?? {
      left: 0,
      top: 0,
      width: page.width,
      height: page.height,
    }
    const labelWidth = Math.max(5, Math.min(45, bounds.width / cols))
    const labelHeight = Math.max(4, Math.min(25, bounds.height / rows))
    const width = labelWidth * cols
    const height = labelHeight * rows

    let config = createTableConfig(rows, cols, width, height)
    // Labels are uniform cells, not a header + body table.
    delete config.rowData[0].s
    config.padding = 1.5

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col + 1
        config = updateCells(
          config,
          { row, col, endRow: row, endCol: col },
          {
            text: `标签 ${String(index).padStart(2, '0')}`,
            align: 'center',
            valign: 'middle',
          },
        )
      }
    }

    const group = buildTableObject(config, displayTableText)
    group.set(nextPosition(width, height) as any)
    decorate(group, 'table', '多联标签')
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
      fitImage(image, width, height)
      image.set(nextPosition(width, height) as any)
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
      const displayWidth =
        (active.width || 1) * Math.abs(active.scaleX || 1)
      const displayHeight =
        (active.height || 1) * Math.abs(active.scaleY || 1)
      await active.setSrc(dataUrl)
      active.set({
        scaleX: displayWidth / Math.max(1, active.width || 1),
        scaleY: displayHeight / Math.max(1, active.height || 1),
      })
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
      fitImage(image, width, height)
      image.set(nextPosition(width, height) as any)
      decorate(image, 'image')
      commitAdd(image)
    } catch (err) {
      console.warn(err)
      notify('图片加载失败')
    }
  }

  async function addCode(kind: CodeKind) {
    if (!canvas) return
    const text = defaultCodeText(kind)
    try {
      const width = kind === 'qrcode' ? 30 : 60
      const height = kind === 'qrcode' ? 30 : 20
      const image = fitImage(
        await createCodeImage(kind, text),
        width,
        height,
      )
      image.set(nextPosition(width, height) as any)
      decorate(image, kind)
      commitAdd(image)
    } catch (err) {
      console.warn(err)
      notify(kind === 'qrcode' ? '二维码生成失败' : '条形码生成失败')
    }
  }

  function addQrCode() {
    return addCode('qrcode')
  }

  function addBarcode() {
    return addCode('barcode')
  }

  /** Re-encode the selected QR / barcode after its content changes. */
  async function updateCodeContent(content: string) {
    if (!canvas) return
    const active = canvas.getActiveObject() as any
    if (!active) return
    const kind = kindOf(active)
    if (kind !== 'qrcode' && kind !== 'barcode') return
    const text = content.trim() ? content : defaultCodeText(kind)
    if (String(active.codeText ?? '') === text) return
    try {
      const src = await renderCodeDataUrl(kind, text)
      // Keep the frame the user has already positioned / scaled. The natural
      // pixel size changes with the barcode payload, so recompute the scale.
      const displayWidth =
        (active.width || 1) * Math.abs(active.scaleX || 1)
      const displayHeight =
        (active.height || 1) * Math.abs(active.scaleY || 1)
      await active.setSrc(src)
      active.set({
        scaleX: displayWidth / Math.max(1, active.width || 1),
        scaleY: displayHeight / Math.max(1, active.height || 1),
        codeText: text,
      })
      active.setCoords()
      canvas.requestRenderAll()
      refreshSelection()
      scheduleCommit()
    } catch (err) {
      console.warn(err)
      notify(
        kind === 'qrcode'
          ? '二维码内容生成失败'
          : '条形码内容生成失败，请检查内容是否符合 Code128 规范',
      )
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
        constrainToPrintable(clone)
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
    constrainToPrintable(active)
    canvas.requestRenderAll()
    refreshSelection()
    scheduleCommit()
  }

  function applyWidth(obj: any, value: number) {
    const bounds = printableBounds()
    const v = Math.max(0.2, bounds ? Math.min(value, bounds.width) : value)
    const sx = Math.abs(obj.scaleX || 1)
    if (isImageType(typeOf(obj))) {
      // Images keep natural pixel dimensions; scaling is what changes mm size.
      obj.set({ scaleX: v / Math.max(1, obj.width || 1) })
    } else if (isEllipseType(typeOf(obj))) {
      obj.set({ rx: v / 2 / sx })
    } else {
      obj.set({ width: v / sx })
    }
  }

  function applyHeight(obj: any, value: number) {
    const bounds = printableBounds()
    const v = Math.max(0.05, bounds ? Math.min(value, bounds.height) : value)
    const sy = Math.abs(obj.scaleY || 1)
    if (isImageType(typeOf(obj))) {
      obj.set({ scaleY: v / Math.max(1, obj.height || 1) })
    } else if (isEllipseType(typeOf(obj))) {
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
        if (patch.fill !== undefined) {
          obj.set('fill', patch.fill || 'transparent')
        }
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
        if (patch.text !== undefined) {
          obj.set('rawText', patch.text)
          applyTextDisplay(obj)
        }
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
      if (
        single &&
        (patch.left !== undefined ||
          patch.top !== undefined ||
          patch.width !== undefined ||
          patch.height !== undefined ||
          patch.angle !== undefined)
      ) {
        constrainToPrintable(obj)
      }
    }

    canvas.requestRenderAll()
    refreshSelection()
    refreshLayers()
    scheduleCommit()
  }

  /**
   * Apply font options to every selected text element and table. Used when
   * several objects are selected together; tables are rebuilt in place and
   * the multi-selection is restored afterwards.
   */
  function updateSelectedTextStyle(patch: {
    fontFamily?: string
    fontSize?: number
    fontWeight?: 'normal' | 'bold'
    fontStyle?: 'normal' | 'italic'
    underline?: boolean
  }) {
    if (!canvas) return
    const objs = canvas.getActiveObjects() as any[]
    if (!objs.length) return
    const nextObjs: FabricObject[] = []
    const replaced: Array<{ old: FabricObject; next: FabricObject }> = []

    for (const obj of objs) {
      if (isTextType(typeOf(obj))) {
        if (patch.fontFamily !== undefined) {
          obj.set('fontFamily', patch.fontFamily)
        }
        if (patch.fontSize !== undefined) {
          obj.set(
            'fontSize',
            Math.max(0.5, patch.fontSize / Math.abs(obj.scaleY || 1)),
          )
        }
        if (patch.fontWeight !== undefined) {
          obj.set('fontWeight', patch.fontWeight)
        }
        if (patch.fontStyle !== undefined) {
          obj.set('fontStyle', patch.fontStyle)
        }
        if (patch.underline !== undefined) obj.set('underline', patch.underline)
        obj.setCoords()
        nextObjs.push(obj)
        continue
      }

      if (!isTableObject(obj)) {
        nextObjs.push(obj)
        continue
      }
      let config = tableConfigOf(obj)
      if (!config) {
        nextObjs.push(obj)
        continue
      }
      // Bake any pending Fabric scale so the rebuilt table keeps its size.
      const sx = Math.abs(obj.scaleX ?? 1)
      const sy = Math.abs(obj.scaleY ?? 1)
      if (Math.abs(sx - 1) > 1e-6 || Math.abs(sy - 1) > 1e-6) {
        config = setTableHeight(
          setTableWidth(config, round(getTableWidth(config) * sx, 2)),
          round(getTableHeight(config) * sy, 2),
        )
      }
      if (patch.fontFamily !== undefined) config.fontFamily = patch.fontFamily
      if (patch.fontSize !== undefined) config.fontSize = patch.fontSize
      // `left` / `top` are relative to the active selection, so capture the
      // absolute centre and total angle before the group is dissolved.
      const center = obj.getCenterPoint()
      const totalAngle = obj.getTotalAngle()
      const normalized = normalizeTableConfig(config)
      const group = buildTableObject(normalized, displayTableText)
      group.set({
        angle: totalAngle,
        scaleX: 1,
        scaleY: 1,
        opacity: obj.opacity ?? 1,
        visible: obj.visible !== false,
        name: obj.name || KIND_LABEL.table,
        elementId: obj.elementId || uid(),
        locked: obj.locked === true,
      } as any)
      group.setPositionByOrigin(center, 'center', 'center')
      ;(group as any).customKind = 'table'
      group.set(CONTROL_STYLE as any)
      applyLock(group, obj.locked === true)
      replaced.push({ old: obj, next: group })
      nextObjs.push(group)
    }

    if (replaced.length) {
      canvas.discardActiveObject()
      for (const { old, next } of replaced) {
        const index = canvas.getObjects().indexOf(old)
        canvas.remove(old)
        canvas.insertAt(Math.max(0, index), next)
        next.setCoords()
      }
      selectObjects(nextObjs)
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
      // A global font change is meant to win over per-cell overrides.
      for (const style of Object.values(config.styles)) {
        if (patch.fontFamily !== undefined) delete style.fontFamily
        if (fontSize !== undefined) delete style.fontSize
      }
      const next = normalizeTableConfig(config)
      const group = buildTableObject(next, displayTableText)
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
    const group = buildTableObject(normalized, displayTableText)
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
      obj.set({ hasBorders: true, hoverCursor: 'move' } as any)
    }
    obj.setCoords()
  }

  /** Start dragging one internal column / row border. */
  function beginTableDividerDrag(
    config: TableConfig,
    local: { x: number; y: number },
    divider: { kind: 'column' | 'row'; index: number },
  ) {
    const sizes =
      divider.kind === 'column'
        ? getColumnWidths(config)
        : getRowHeights(config)
    tableDividerDrag = {
      kind: divider.kind,
      index: divider.index,
      start: divider.kind === 'column' ? local.x : local.y,
      size: sizes[divider.index],
    }
    const active = canvas?.getActiveObject() as any
    active?.set?.({ lockMovementX: true, lockMovementY: true })
    const stop = () => {
      tableDividerDrag = null
      window.removeEventListener('pointerup', stop)
      if (!canvas) return
      if (tableEditing.value) {
        canvas.setCursor('cell')
      } else {
        const current = canvas.getActiveObject() as any
        current?.set?.({
          lockMovementX: current.locked === true,
          lockMovementY: current.locked === true,
          hoverCursor: 'move',
        })
        canvas.setCursor('move')
      }
    }
    window.addEventListener('pointerup', stop)
  }

  /** Enter direct cell editing: Fabric owns hit-testing and the range overlay. */
  function beginTableEdit() {
    if (!canvas || !table.value) return
    const active = canvas.getActiveObject() as FabricObject | null
    if (!active || !isTableObject(active)) return
    tableEditing.value = true
    // The range is painted by Fabric, so its normal border would double up.
    setTableControlsEditing(active, true)
    canvas.setCursor('cell')
    canvas.requestRenderAll()
  }

  /** Leave direct cell editing and restore the normal Fabric selection. */
  function endTableEdit() {
    if (!tableEditing.value && !requestedCellEdit.value) return
    const editedId = tableElementId
    tableEditing.value = false
    requestedCellEdit.value = null
    tablePointerSelecting = false
    tableDividerDrag = null
    if (!canvas) return
    canvas.setCursor('default')
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

  /**
   * Mark the selected row as the repeating detail row. The row is repeated
   * once per item of the chosen detail collection when previewing / printing.
   */
  function setTableRepeatRow(source: string, row?: number) {
    if (!table.value) return
    const key = String(source ?? '').trim()
    if (!key) {
      clearTableRepeatRow()
      return
    }
    const target = clamp(
      Math.floor(Number(row ?? tableSelection.row)),
      0,
      table.value.rowCount - 1,
    )
    updateTableStyle({ repeat: { row: target, source: key } })
    notify(`第 ${target + 1} 行已设为明细行，将按「${key}」的数据行数重复`)
  }

  function clearTableRepeatRow() {
    if (!table.value?.repeat) return
    updateTableStyle({ repeat: undefined })
    notify('已取消明细行绑定')
  }

  /** Replace a detail collection's rows (used by host integrations). */
  function setDetailRows(
    key: string,
    rows: Record<string, string>[],
  ) {
    const name = String(key ?? '').trim()
    if (!name) return
    const clean = (Array.isArray(rows) ? rows : []).map((row) => {
      const out: Record<string, string> = {}
      for (const [column, value] of Object.entries(row ?? {})) {
        out[column] = String(value ?? '')
      }
      return out
    })
    const index = dataFields.value.findIndex((field) => field.key === name)
    if (index >= 0) {
      dataFields.value = dataFields.value.map((field, i) =>
        i === index ? { ...field, value: '', rows: clean } : field,
      )
    } else {
      dataFields.value = [...dataFields.value, { key: name, value: '', rows: clean }]
    }
    scheduleCommit()
  }

  /** Move the selected table back inside the margins after a size change. */
  function settleTablePosition() {
    if (!canvas) return
    const active = canvas.getActiveObject()
    if (!active || !isTableObject(active)) return
    constrainToPrintable(active)
    active.setCoords()
    canvas.requestRenderAll()
    refreshSelection()
  }

  function setTableSize(rows: number, cols: number) {
    if (!table.value) return
    let next = resizeTable(table.value, rows, cols)
    const bounds = printableBounds()
    if (bounds) {
      next = setTableWidth(
        next,
        Math.min(getTableWidth(next), bounds.width),
      )
      next = setTableHeight(
        next,
        Math.min(getTableHeight(next), bounds.height),
      )
    }
    commitTableConfig(next)
    settleTablePosition()
  }

  function setTableWidthValue(width: number) {
    if (!table.value) return
    const bounds = printableBounds()
    commitTableConfig(
      setTableWidth(table.value, bounds ? Math.min(width, bounds.width) : width),
    )
    settleTablePosition()
  }

  function setTableHeightValue(height: number) {
    if (!table.value) return
    const bounds = printableBounds()
    commitTableConfig(
      setTableHeight(
        table.value,
        bounds ? Math.min(height, bounds.height) : height,
      ),
    )
    settleTablePosition()
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
      .map((field: any) => {
        const out: DataField = {
          key: String(field.key),
          value:
            field.value === undefined || field.value === null
              ? ''
              : String(field.value),
        }
        if (Array.isArray(field.rows)) {
          const rows = field.rows
            .filter((row: any) => row && typeof row === 'object')
            .map((row: any) => {
              const clean: Record<string, string> = {}
              for (const [key, value] of Object.entries(row)) {
                clean[key] =
                  value === undefined || value === null ? '' : String(value)
              }
              return clean
            })
          if (rows.length) out.rows = rows
        }
        return out
      })
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
      meta: projectMeta(),
      page: {
        width: DEFAULT_PAGE.width,
        height: DEFAULT_PAGE.height,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        marginVisible: true,
        guides: [],
        guidesVisible: true,
        watermarkVisible: true,
        watermarkText: DEFAULT_WATERMARK_TEXT,
        overprint: false,
        printOffset: { x: 0, y: 0 },
      },
      grid: { size: 5, visible: true, snap: true },
      data: [],
      elements: [],
    }
  }

  /** Deep-cloned copy so edits never mutate the bundled JSON module. */
  function cloneCaseTemplate(): PageTemplate {
    return JSON.parse(JSON.stringify(caseTemplateJson)) as PageTemplate
  }

  function caseTemplateRecord(): StoredTemplate {
    const now = Date.now()
    return {
      id: CASE_TEMPLATE_ID,
      template: cloneCaseTemplate(),
      createdAt: now,
      updatedAt: now,
    }
  }

  function hasSeededCaseTemplate(): boolean {
    try {
      return localStorage.getItem(CASE_TEMPLATE_SEED_KEY) === '1'
    } catch {
      return false
    }
  }

  function markCaseTemplateSeeded() {
    try {
      localStorage.setItem(CASE_TEMPLATE_SEED_KEY, '1')
    } catch {
      // Best-effort: without the marker the case template is shown again.
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
      watermarkVisible: page.watermarkVisible,
      watermarkText: page.watermarkText,
      backgroundImage: page.backgroundImage,
      backgroundVisible: page.backgroundVisible,
      backgroundOpacity: round(page.backgroundOpacity, 2),
      backgroundFit: page.backgroundFit,
      backgroundPrint: page.backgroundPrint,
      backgroundTransform: page.backgroundTransform
        ? { ...page.backgroundTransform }
        : null,
      overprint: page.overprint,
      printOffset: { ...page.printOffset },
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
      meta: projectMeta(),
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
    else if (
      type === 'image' &&
      (o.customKind === 'qrcode' || o.customKind === 'barcode')
    ) {
      kind = o.customKind
    } else if (type === 'image') kind = 'image'
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
      element.text = rawTextOf(o)
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

    if (kind === 'qrcode' || kind === 'barcode') {
      element.codeText = String(o.codeText || '')
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
        meta: projectMeta(),
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
      'rawText',
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
      const now = Date.now()
      if (legacy) {
        // Keep an old single-template draft around as its own record.
        activeTemplateId = templateId()
        templateRecords = [
          {
            id: activeTemplateId,
            template: legacy,
            createdAt: now,
            updatedAt: now,
          },
        ]
      } else {
        // Fresh browser: open the bundled case template by default.
        activeTemplateId = CASE_TEMPLATE_ID
        templateRecords = [caseTemplateRecord()]
      }
    }

    // Offer the bundled case template once on browsers that already have saved
    // templates, so updating the project shows it without discarding drafts.
    if (!hasSeededCaseTemplate()) {
      let record = templateRecords.find((item) => item.id === CASE_TEMPLATE_ID)
      if (!record) {
        record = caseTemplateRecord()
        templateRecords.unshift(record)
      }
      activeTemplateId = record.id
      markCaseTemplateSeeded()
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
      if (
        el.kind === 'line' ||
        el.kind === 'qrcode' ||
        el.kind === 'barcode'
      ) {
        ;(obj as any).customKind = el.kind
      }
      obj.set(CONTROL_STYLE as any)
      applyLock(obj, el.locked === true)
      return obj
    }

    if (el.kind === 'table') {
      const config = normalizeTableConfig(el.table ?? createTableConfig())
      const group = buildTableObject(config, displayTableText)
      // Rotation is stored on the Fabric group; cell hit-testing and the range
      // overlay both transform through that angle.
      group.set({ ...common, scaleX: 1, scaleY: 1 } as any)
      ;(group as any).tableData = JSON.stringify(config)
      return Promise.resolve(finish(group))
    }

    if (el.kind === 'text') {
      const fontSize = Math.max(0.5, el.fontSize || DEFAULT_TEXT_SIZE)
      const raw = el.text ?? ''
      const obj = new Textbox(designText(raw), {
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
      ;(obj as any).rawText = raw
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

    if (el.kind === 'qrcode' || el.kind === 'barcode') {
      const defaultWidth = el.kind === 'qrcode' ? 30 : 60
      const defaultHeight = el.kind === 'qrcode' ? 30 : 20
      return createCodeImage(el.kind, el.codeText || defaultCodeText(el.kind))
        .then((image) => {
          fitImage(
            image,
            Math.max(4, el.width || defaultWidth),
            Math.max(4, el.height || defaultHeight),
          )
          image.set(common as any)
          return finish(image)
        })
        .catch((err) => {
          console.warn('code element failed to load', err)
          return null
        })
    }

    if (el.kind === 'image') {
      if (!el.src) return Promise.resolve(null)
      return FabricImage.fromURL(el.src)
        .then((image) => {
          fitImage(
            image,
            Math.max(1, el.width || 40),
            Math.max(1, el.height || 40),
          )
          image.set(common as any)
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

  async function loadTemplate(
    template: PageTemplate,
    options: { keepView?: boolean } = {},
  ) {
    if (!canvas) return
    const token = ++loadToken
    backgroundAligning.value = false
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
      page.watermarkVisible = template.page?.watermarkVisible !== false
      page.watermarkText =
        typeof template.page?.watermarkText === 'string' &&
        template.page.watermarkText.trim()
          ? template.page.watermarkText
          : DEFAULT_WATERMARK_TEXT
      page.backgroundImage = readBackgroundImage(template.page?.backgroundImage)
      page.backgroundVisible = template.page?.backgroundVisible !== false
      page.backgroundOpacity = readBackgroundOpacity(
        template.page?.backgroundOpacity,
      )
      page.backgroundFit = readBackgroundFit(template.page?.backgroundFit)
      page.backgroundPrint = template.page?.backgroundPrint === true
      page.backgroundTransform = readBackgroundTransform(
        template.page?.backgroundTransform,
      )
      page.overprint = template.page?.overprint === true
      if (page.overprint) page.backgroundPrint = false
      page.printOffset = readPrintOffset(template.page?.printOffset)
      if (!page.backgroundImage) {
        page.backgroundTransform = null
        backgroundAligning.value = false
      }
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
      // Undo / redo restore the document, not the viewport: refitting here
      // made the canvas jump back to 100% (or "fit") on every history step.
      if (!options.keepView) fitToViewport()
    } finally {
      if (token === loadToken) restoring = false
    }
  }

  async function applyHistory() {
    const snapshot = history[historyIndex]
    if (!snapshot) return
    await loadTemplate(JSON.parse(snapshot) as PageTemplate, { keepView: true })
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

  function uniqueTemplateName(base: string): string {
    const wanted = String(base ?? '').trim() || '未命名模板'
    const names = new Set(
      templateRecords.map((record) => record.template.name || '未命名模板'),
    )
    if (!names.has(wanted)) return wanted
    let index = 2
    while (names.has(`${wanted} ${index}`)) index += 1
    return `${wanted} ${index}`
  }

  /**
   * Clone an official sample from the template center into the local library
   * and open it. The official template itself is never mutated.
   */
  async function useOfficialTemplate(id: string) {
    const official = findOfficialTemplate(id)
    if (!official) return
    cancelPendingCommit()
    commitNow()
    const now = Date.now()
    const template = JSON.parse(
      JSON.stringify(official.template),
    ) as PageTemplate
    template.name = uniqueTemplateName(official.name)
    activeTemplateId = templateId()
    templateRecords.push({
      id: activeTemplateId,
      template,
      createdAt: now,
      updatedAt: now,
    })
    await loadTemplate(template)
    resetHistory()
    notify(`已使用官方模板「${official.name}」`)
  }

  /**
   * Render a template into a PNG thumbnail for the template center. Element
   * bindings are resolved with the template's own sample data.
   */
  async function renderTemplateThumbnail(
    template: PageTemplate,
    maxWidth = 520,
    maxHeight = 520,
  ): Promise<string> {
    const width = clamp(
      Number(template.page?.width) || DEFAULT_PAGE.width,
      20,
      1000,
    )
    const height = clamp(
      Number(template.page?.height) || DEFAULT_PAGE.height,
      20,
      1000,
    )
    const resolved = resolveTemplateBindings(template, template.data ?? [])
    const objects = (
      await Promise.all(
        (resolved.elements ?? []).map((element) => elementToObject(element)),
      )
    ).filter((object): object is FabricObject => !!object)

    const temp = new StaticCanvas(undefined, {
      width,
      height,
      enableRetinaScaling: false,
      backgroundColor: '#ffffff',
    } as any)
    try {
      if (objects.length) temp.add(...objects)
      const scale = Math.min(4, maxWidth / width, maxHeight / height)
      return temp.toDataURL({
        format: 'png',
        multiplier: Math.max(0.5, scale),
        enableRetinaScaling: false,
      })
    } finally {
      temp.destroy()
    }
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
    const background = await backgroundObject()
    if (background) temp.add(background)
    const valid = objects.filter(Boolean) as FabricObject[]
    if (valid.length) temp.add(...valid)
    const watermark = watermarkObjects()
    if (watermark.length) temp.add(...watermark)
    return temp
  }

  async function generateSVG(): Promise<string> {
    if (!canvas) return ''
    const temp = await buildPreviewCanvas()
    const offset = printOffsetMm()
    try {
      const svg = temp.toSVG({
        width: `${round(page.width, 2)}mm`,
        height: `${round(page.height, 2)}mm`,
        // A registration offset shifts the printed content inside the fixed
        // page box without touching any element coordinates.
        viewBox: {
          x: -offset.x,
          y: -offset.y,
          width: page.width,
          height: page.height,
        },
        suppressPreamble: true,
      })
      // Hidden origin marker: ignored by renderers, kept in downloaded files.
      return injectSvgMetadata(svg, templateName.value)
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
        printOffsetMm(),
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
    dataSourceOpen,
    dataDragEnabled,
    setDataDragEnabled,
    showSampleValues,
    setShowSampleValues,
    addFieldText,
    symbolPickerOpen,
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
    setWatermarkVisible,
    setWatermarkText,
    setPageBackgroundFile,
    setPageBackgroundVisible,
    setPageBackgroundOpacity,
    setPageBackgroundFit,
    setPageBackgroundPrint,
    removePageBackground,
    backgroundLayout,
    backgroundAligning,
    setBackgroundAligning,
    setBackgroundTransform,
    resetBackgroundTransform,
    setOverprint,
    setPrintOffset,
    setGuidesVisible,
    addGuide,
    moveGuide,
    commitGuides,
    removeGuide,
    clearGuides,
    setPreset,
    setTemplateName,
    setRulersVisible,
    theme,
    setTheme,
    toggleTheme,
    uiVisibility,
    setUiVisible,
    resetUiVisibility,
    setGridSize,
    setGridVisible,
    setGridSnap,
    // creation
    addText,
    addTextWithContent,
    insertTextSymbol,
    bindCheckboxValues,
    selectedEditableContent,
    selectedCheckboxCount,
    addRect,
    addEllipse,
    addLine,
    addTable,
    addLabelGrid,
    addImageFile,
    addImageFromSrc,
    addQrCode,
    addBarcode,
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
    setTableRepeatRow,
    clearTableRepeatRow,
    setDetailRows,
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
    updateSelectedTextStyle,
    updateCodeContent,
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
    useOfficialTemplate,
    renderTemplateThumbnail,
    generateSVG,
    generatePDF,
  }
}

export type Designer = ReturnType<typeof createDesigner>
