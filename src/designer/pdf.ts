import {
  COPYRIGHT_NOTICE,
  PROJECT_AUTHOR,
  PROJECT_HOMEPAGE,
  PROJECT_ID,
  PROJECT_SIGNATURE,
} from './copyright'

/** PostScript points per millimetre (1 pt = 1/72 inch). */
const PT_PER_MM = 72 / 25.4

/**
 * Highest pixel dimension of the rasterised page. 300dpi is used when the page
 * fits; larger pages are downscaled to keep the canvas within a safe size.
 */
const MAX_PIXELS = 4096
const TARGET_DPI = 300

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** Pixels per scene unit (millimetre) for the preview raster. */
export function previewPixelRatio(widthMm: number, heightMm: number): number {
  const longest = Math.max(widthMm, heightMm, 1)
  return Math.min(TARGET_DPI / 25.4, MAX_PIXELS / longest)
}

/**
 * Wrap a rendered page image into a single-page PDF. The image is drawn over
 * the full page, so the PDF matches the template's millimetre dimensions.
 */
export async function createPdfFromImage(
  pngDataUrl: string,
  widthMm: number,
  heightMm: number,
  title: string,
  offsetMm: { x: number; y: number } = { x: 0, y: 0 },
): Promise<Uint8Array> {
  // pdf-lib is only needed for previews: load it on first use so the designer
  // itself stays lean.
  const { PDFDocument } = await import('pdf-lib')
  // Skip pdf-lib's own info-dict stamping so the attribution fields below
  // remain the ones stored in the document.
  const pdf = await PDFDocument.create({ updateMetadata: false })
  pdf.setTitle(title || 'DoPrint template')
  pdf.setCreator('DoPrint 设计器')
  pdf.setProducer('DoPrint Designer')
  // Hidden origin metadata: invisible on the printed page.
  pdf.setAuthor(PROJECT_AUTHOR)
  pdf.setSubject(COPYRIGHT_NOTICE)
  pdf.setKeywords([PROJECT_ID, PROJECT_HOMEPAGE, PROJECT_SIGNATURE])

  const page = pdf.addPage([widthMm * PT_PER_MM, heightMm * PT_PER_MM])
  const image = await pdf.embedPng(dataUrlToBytes(pngDataUrl))
  page.drawImage(image, {
    // PDF coordinates start at the bottom-left, so a positive Y offset moves
    // the content down. Anything outside the page box is clipped by viewers
    // and printers, matching the SVG export.
    x: offsetMm.x * PT_PER_MM,
    y: -offsetMm.y * PT_PER_MM,
    width: widthMm * PT_PER_MM,
    height: heightMm * PT_PER_MM,
  })

  return pdf.save()
}
