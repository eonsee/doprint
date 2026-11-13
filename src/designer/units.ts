/** CSS px per millimetre at the canonical 96dpi */
export const PX_PER_MM = 96 / 25.4

/** 1pt in millimetres */
export const PT_TO_MM = 25.4 / 72

/** 1mm in points */
export const MM_TO_PT = 72 / 25.4

export const DEFAULT_PAGE = { width: 210, height: 297 }

export const PAGE_PRESETS = [
  { key: 'a4', label: 'A4 纵向 · 210 × 297', width: 210, height: 297 },
  { key: 'a4-landscape', label: 'A4 横向 · 297 × 210', width: 297, height: 210 },
  { key: 'a5', label: 'A5 纵向 · 148 × 210', width: 148, height: 210 },
  { key: 'b5', label: 'B5 纵向 · 176 × 250', width: 176, height: 250 },
  { key: 'invoice', label: '连续纸 · 241 × 140', width: 241, height: 140 },
  { key: 'label', label: '标签 · 100 × 150', width: 100, height: 150 },
  { key: 'custom', label: '自定义尺寸', width: 0, height: 0 },
] as const

export const FONT_OPTIONS = [
  { label: '宋体', value: 'SimSun' },
  { label: '黑体', value: 'SimHei' },
  { label: '微软雅黑', value: 'Microsoft YaHei' },
  { label: '楷体', value: 'KaiTi' },
  { label: '仿宋', value: 'FangSong' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Times New Roman', value: 'Times New Roman' },
]

export const GRID_SIZES = [1, 5, 10]

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
