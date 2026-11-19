import type { ProjectMeta } from './copyright'

export type ElementKind =
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'image'
  | 'table'
  | 'qrcode'
  | 'barcode'

export type TableAlign = 'left' | 'center' | 'right'
export type TableVAlign = 'top' | 'middle' | 'bottom'

/**
 * Effective cell view used by the inspector and the inline editor. The stored
 * table model keeps values and styles separately (see TableCellData).
 */
export interface TableCell {
  /** may contain {{dataField}} placeholders */
  text?: string
  align?: TableAlign
  valign?: TableVAlign
  bold?: boolean
  /** cell background colour; an empty string explicitly clears it */
  fill?: string
  /** cell text colour; an empty string falls back to the table colour */
  color?: string
  /** cell font size in millimetres; omitted means the table default */
  fontSize?: number
  /** cell font family; omitted means the table default */
  fontFamily?: string
  italic?: boolean
  underline?: boolean
  /** per-side border visibility; `false` hides that side (default visible) */
  borderTop?: boolean
  borderRight?: boolean
  borderBottom?: boolean
  borderLeft?: boolean
}

/**
 * A cell style stored in the table's style registry. Cell data references a
 * style id, so repeated formatting is only stored once (the same idea as
 * Univer's workbook `styles` map).
 */
export type TableCellStyle = Omit<TableCell, 'text'>

/**
 * Sparse cell data. A missing cell means "empty text with the row style".
 * `v` is the value and `s` references `TableConfig.styles`.
 */
export interface TableCellData {
  v?: string
  s?: string
}

/** Univer-style row metadata: height plus an optional row default style. */
export interface TableRowData {
  /** row height in millimetres */
  h: number
  /** style id applied to every cell in the row unless the cell overrides it */
  s?: string
}

/** Univer-style column metadata. */
export interface TableColumnData {
  /** column width in millimetres */
  w: number
}

/** Inclusive cell range, matching Univer's `IRange` conventions. */
export interface TableMergeData {
  startRow: number
  endRow: number
  startColumn: number
  endColumn: number
}

/**
 * Table snapshot, version 2.
 *
 * The layout intentionally follows Univer's worksheet data model rather than
 * storing a dense 2D cell matrix: row and column metadata live in separate
 * maps, cell data is sparse, merges are inclusive ranges, and visual styles
 * are interned in a registry. All table commands live in `table.ts` and are
 * pure; Fabric only renders the snapshot and handles canvas interaction.
 *
 * Version 1 (the dense `rows` / `cells` / `merges` shape) is migrated on read
 * by `normalizeTableConfig`.
 */
/**
 * Master-detail binding for a table: the row at `row` is repeated once per
 * row of the detail collection `source` (a DataField with `rows`). Cells in
 * that row address the collection columns as `{{source.column}}`.
 */
export interface TableRepeatConfig {
  row: number
  source: string
}

export interface TableConfig {
  version: 2
  rowCount: number
  columnCount: number
  /** row heights and row default styles, keyed by row index */
  rowData: Record<number, TableRowData>
  /** column widths, keyed by column index */
  columnData: Record<number, TableColumnData>
  /** sparse cell values / style references, keyed by row then column */
  cellData: Record<number, Record<number, TableCellData>>
  /** merged ranges, inclusive on both ends */
  mergeData: TableMergeData[]
  /** shared cell style registry */
  styles: Record<string, TableCellStyle>
  /** base style id inherited by every cell */
  defaultStyle: string
  /** mm */
  fontSize: number
  fontFamily: string
  color: string
  borderColor: string
  /** mm */
  borderWidth: number
  /** inner cell padding in mm */
  padding: number
  /** table background / merge mask colour */
  background: string
  /** optional master-detail repeating row */
  repeat?: TableRepeatConfig
}

/** Tools that can be shown or hidden in the left rail. */
export type UiToolKey =
  | 'text'
  | 'table'
  | 'labels'
  | 'symbols'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'image'
  | 'qrcode'
  | 'barcode'

/**
 * User-level UI visibility preferences. Hidden items are only removed from the
 * interface; template data is untouched.
 */
export interface UiVisibilityConfig {
  tools: Record<UiToolKey, boolean>
  topbar: {
    page: boolean
    background: boolean
    globalStyle: boolean
    margins: boolean
  }
  inspectorTabs: {
    props: boolean
    layers: boolean
    data: boolean
  }
  inspectorSections: {
    page: boolean
    margins: boolean
    background: boolean
    watermark: boolean
    view: boolean
  }
  /** Main top bar actions (preview / import / export / template / history). */
  topbarMain: {
    template: boolean
    history: boolean
    autosave: boolean
    preview: boolean
    io: boolean
  }
  /** Quick groups shown in the top strip while an element is selected. */
  topbarSelection: {
    font: boolean
    textStyle: boolean
    align: boolean
    geometry: boolean
    actions: boolean
  }
  /** Property groups shown in the right panel while an element is selected. */
  inspectorSelection: {
    align: boolean
    textStyle: boolean
    position: boolean
    multiAdjust: boolean
    appearance: boolean
    code: boolean
    image: boolean
    text: boolean
    table: boolean
    arrange: boolean
  }
}

export interface DataField {
  key: string
  value: string
  /**
   * Repeating child rows for master-detail data. When present, the field is a
   * detail collection: table rows bound to it repeat once per row, and its
   * columns are addressed as `{{key.column}}`.
   */
  rows?: Record<string, string>[]
}

export interface TemplateElement {
  id: string
  kind: ElementKind
  name: string
  /** mm */
  left: number
  /** mm */
  top: number
  /** mm */
  width: number
  /** mm */
  height: number
  angle: number
  opacity: number
  visible: boolean
  /** position / size lock */
  locked?: boolean
  fill?: string
  stroke?: string
  strokeWidth?: number
  /** dash pattern in mm, e.g. [2, 2] */
  strokeDash?: number[]
  radius?: number
  text?: string
  /** mm */
  fontSize?: number
  fontFamily?: string
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  underline?: boolean
  /** letter spacing in mm */
  letterSpacing?: number
  textAlign?: string
  lineHeight?: number
  /** text highlight colour */
  textBackground?: string
  /** data url */
  src?: string
  /** QR / barcode payload; may contain {{dataField}} placeholders */
  codeText?: string
  /** table layout and cell data */
  table?: TableConfig
}

export interface PageMargins {
  /** millimetres */
  top: number
  /** millimetres */
  right: number
  /** millimetres */
  bottom: number
  /** millimetres */
  left: number
}

export type GuideOrientation = 'horizontal' | 'vertical'

/** How the imported sheet underlay is fitted to the page. */
export type PageBackgroundFit = 'cover' | 'contain' | 'stretch'

/**
 * Explicit underlay placement in millimetres, produced by aligning the
 * imported sheet image interactively. It overrides the fit-derived frame.
 */
export interface PageBackgroundTransform {
  left: number
  top: number
  width: number
  height: number
}

/** Printer registration offset in millimetres, applied to printed output. */
export interface PrintOffset {
  x: number
  y: number
}

/** A design guide dragged out from a ruler; never printed or exported. */
export interface PageGuide {
  id: string
  orientation: GuideOrientation
  /**
   * Distance from the page's top edge for horizontal guides, or from the
   * left edge for vertical guides, in millimetres.
   */
  position: number
}

export interface PageTemplate {
  version: 1
  name: string
  /** Hidden generator / copyright marker; never rendered in the UI. */
  meta?: ProjectMeta
  page: {
    width: number
    height: number
    /** margin guide, in millimetres */
    margin?: PageMargins
    /** whether the dashed margin guide is shown */
    marginVisible?: boolean
    /** ruler guides in millimetres */
    guides?: PageGuide[]
    /** whether the ruler guides are shown */
    guidesVisible?: boolean
    /** repeated copyright watermark across the page */
    watermarkVisible?: boolean
    watermarkText?: string
    /**
     * Imported template / scanned sheet image (data URL) drawn underneath all
     * elements as a design reference.
     */
    backgroundImage?: string
    /** whether the underlay is shown while designing */
    backgroundVisible?: boolean
    /** underlay opacity, 0–1 */
    backgroundOpacity?: number
    /** how the underlay is fitted to the page */
    backgroundFit?: PageBackgroundFit
    /** whether the underlay is included in SVG / PDF output */
    backgroundPrint?: boolean
    /** explicit placement after manual alignment; overrides `backgroundFit` */
    backgroundTransform?: PageBackgroundTransform | null
    /**
     * 套打 (overprint) mode: the sheet image is an alignment reference for
     * pre-printed paper and is never included in output.
     */
    overprint?: boolean
    /** registration offset for printed output, in millimetres */
    printOffset?: PrintOffset
  }
  grid: { size: number; visible: boolean; snap: boolean }
  /** sample data used for binding preview */
  data?: DataField[]
  elements: TemplateElement[]
}

export interface LayerItem {
  id: string
  name: string
  kind: ElementKind
  visible: boolean
  locked: boolean
  active: boolean
}

export interface SelectionState {
  count: number
  kind: ElementKind | null
  kindLabel: string
  isText: boolean
  isShape: boolean
  isImage: boolean
  isLine: boolean
  isTable: boolean
  isCode: boolean
  /** number of selected text elements (1 for a single text selection) */
  textCount: number
  /** number of selected tables (1 for a single table selection) */
  tableCount: number
  layout: {
    left: number
    top: number
    width: number
    height: number
    angle: number
    opacity: number
    locked: boolean
  }
  style: {
    fill: string
    stroke: string
    strokeWidth: number
    /** dash pattern in mm; empty array means a solid line */
    strokeDash: number[]
    radius: number
    name: string
    visible: boolean
  }
  code: {
    content: string
  }
  text: {
    content: string
    /** mm */
    fontSize: number
    fontFamily: string
    fontWeight: 'normal' | 'bold'
    fontStyle: 'normal' | 'italic'
    underline: boolean
    /** mm */
    letterSpacing: number
    textAlign: string
    lineHeight: number
    backgroundColor: string
  }
}

export interface UpdatePatch {
  left?: number
  top?: number
  width?: number
  height?: number
  angle?: number
  opacity?: number
  locked?: boolean
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeDash?: number[]
  radius?: number
  name?: string
  visible?: boolean
  text?: string
  /** mm */
  fontSize?: number
  fontFamily?: string
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  underline?: boolean
  /** mm */
  letterSpacing?: number
  textAlign?: string
  lineHeight?: number
  textBackground?: string
}

export function emptySelection(): SelectionState {
  return {
    count: 0,
    kind: null,
    kindLabel: '',
    isText: false,
    isShape: false,
    isImage: false,
    isLine: false,
    isTable: false,
    isCode: false,
    textCount: 0,
    tableCount: 0,
    layout: {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      angle: 0,
      opacity: 1,
      locked: false,
    },
    style: {
      fill: '',
      stroke: '',
      strokeWidth: 0,
      strokeDash: [],
      radius: 0,
      name: '',
      visible: true,
    },
    code: {
      content: '',
    },
    text: {
      content: '',
      fontSize: 0,
      fontFamily: 'SimSun',
      fontWeight: 'normal',
      fontStyle: 'normal',
      underline: false,
      letterSpacing: 0,
      textAlign: 'left',
      lineHeight: 1.3,
      backgroundColor: '',
    },
  }
}
