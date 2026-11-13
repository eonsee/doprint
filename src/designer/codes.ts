import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'

export type CodeKind = 'qrcode' | 'barcode'

export const DEFAULT_QR_TEXT = 'https://doprint.local'
export const DEFAULT_BARCODE_TEXT = 'DOPRINT-0001'

export function defaultCodeText(kind: CodeKind): string {
  return kind === 'qrcode' ? DEFAULT_QR_TEXT : DEFAULT_BARCODE_TEXT
}

/** Render a QR / barcode payload to a high-resolution PNG data URL. */
export async function renderCodeDataUrl(
  kind: CodeKind,
  text: string,
): Promise<string> {
  const payload = text.trim() || defaultCodeText(kind)
  if (kind === 'qrcode') {
    return QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 512,
      color: { dark: '#000000', light: '#ffffff' },
    })
  }

  // CODE128 keeps the generated bars crisp; the PNG is rendered at a higher
  // resolution than the default 60 × 20 mm frame on the page.
  const canvas = document.createElement('canvas')
  JsBarcode(canvas, payload, {
    format: 'CODE128',
    lineColor: '#000000',
    background: '#ffffff',
    width: 3,
    height: 110,
    margin: 12,
    displayValue: true,
    font: 'Arial',
    fontSize: 20,
    textMargin: 4,
  })
  return canvas.toDataURL('image/png')
}
