export type ElementKind =
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'image'
  | 'table'

export type TableAlign = 'left' | 'center' | 'right'
export type TableVAlign = 'top' | 'middle' | 'bottom'

export interface TableCell {
  /** may contain {{dataField}} placeholders */
  text?: string
  align?: TableAlign
  valign?: TableVAlign
  bold?: boolean
  /** cell background colour */
  fill?: string
  /** cell text colour */
  color?: string
  /** per-side border visibility; `false` hides that side (default visible) */
  borderTop?: boolean
  borderRight?: boolean
  borderBottom?: boolean
  borderLeft?: boolean
}

export interface TableMerge {
  /** zero-based anchor row */
  row: number
  /** zero-based anchor column */
  col: number
  rowSpan: number
  colSpan: number
}

export interface TableConfig {
  rows: number
  cols: number
  /** row heights in mm */
  rowHeights: number[]
  /** column widths in mm */
  colWidths: number[]
  cells: TableCell[][]
  merges: TableMerge[]
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
  /** table layout and cell data */
  table?: TableConfig
}

export interface PageTemplate {
  version: 1
  name: string
  page: { width: number; height: number }
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
