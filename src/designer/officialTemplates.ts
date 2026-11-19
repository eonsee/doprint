import type { PageTemplate } from './types'
import billingForm from '../../templates/note_temp.json'
import productLabel from '../../templates/official-product-label.json'
import deliveryNote from '../../templates/official-delivery-note.json'
import outboundNote from '../../templates/official-outbound-note.json'
import waybill from '../../templates/official-waybill.json'

/** A built-in sample template offered by the template center. */
export interface OfficialTemplate {
  id: string
  name: string
  /** One or two sentences shown on the template card. */
  description: string
  tags: string[]
  /** millimetres, mirrored from the template for card layout. */
  width: number
  height: number
  template: PageTemplate
}

/**
 * Official sample templates bundled with the designer. They are read-only:
 * "使用此模板" clones one into the local template library.
 */
export const OFFICIAL_TEMPLATES: OfficialTemplate[] = [
  {
    id: 'official-billing-form',
    name: '开票联络单',
    description:
      '连续纸 240 × 94 mm，含客户信息、开票明细表格、合计与收款栏，适合票据打印。',
    tags: ['票据', '连续纸', '表格'],
    width: 240,
    height: 94,
    template: billingForm as unknown as PageTemplate,
  },
  {
    id: 'official-product-label',
    name: '商品价签',
    description:
      '80 × 50 mm 零售价签，商品名、规格、醒目的价格、条码与产地日期一应俱全。',
    tags: ['标签', '零售', '条码'],
    width: 80,
    height: 50,
    template: productLabel as unknown as PageTemplate,
  },
  {
    id: 'official-delivery-note',
    name: 'A5 送货单',
    description:
      'A5 送货单，包含客户信息、货品明细表格、金额合计与三方签字栏。',
    tags: ['A5', '送货单', '表格'],
    width: 148,
    height: 210,
    template: deliveryNote as unknown as PageTemplate,
  },
  {
    id: 'official-outbound-note',
    name: '出库单 · 明细重复',
    description:
      'A5 出库单，明细行按 items 明细集合自动重复：一条主表数据可打印多条货品明细。',
    tags: ['A5', '主从明细', '表格'],
    width: 148,
    height: 210,
    template: outboundNote as unknown as PageTemplate,
  },
  {
    id: 'official-waybill',
    name: '物流面单',
    description:
      '100 × 150 mm 快递面单，收寄件信息、运单条码、二维码与签收栏。',
    tags: ['面单', '物流', '条码'],
    width: 100,
    height: 150,
    template: waybill as unknown as PageTemplate,
  },
]

export function findOfficialTemplate(id: string): OfficialTemplate | undefined {
  return OFFICIAL_TEMPLATES.find((item) => item.id === id)
}

/**
 * Rendered thumbnails are kept for the lifetime of the page so reopening the
 * template center does not rebuild every preview canvas.
 */
const thumbnailCache = new Map<string, string>()

export function cachedOfficialThumbnail(id: string): string | undefined {
  return thumbnailCache.get(id)
}

export function rememberOfficialThumbnail(id: string, dataUrl: string) {
  thumbnailCache.set(id, dataUrl)
}
