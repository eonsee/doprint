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
}

export interface DataField {
  key: string
  value: string
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
