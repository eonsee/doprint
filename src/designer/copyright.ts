/**
 * Hidden project attribution.
 *
 * DoPrint Designer is distributed under the Apache License 2.0. The strings in
 * this module are intentionally not rendered anywhere in the designer UI: they
 * are written to SVG / PDF metadata, exported template JSON, the production
 * bundle banners and a non-enumerable global marker. They make copies of the
 * project traceable and expose careless rebranding.
 *
 * True tamper prevention would require code signing; this is tamper-evident
 * attribution.
 */

export const PROJECT_NAME = 'DoPrint Designer'
export const PROJECT_ID = 'doprint-designer'
export const PROJECT_AUTHOR = 'eonsee'
export const PROJECT_HOMEPAGE = 'https://doprint.top'
export const PROJECT_REPOSITORY = 'https://github.com/eonsee/doprint'
export const COPYRIGHT_NOTICE =
  'Copyright © 2025-2026 eonsee (https://github.com/eonsee/doprint). All rights reserved.'
export const LICENSE_NOTICE = 'Licensed under the Apache License 2.0.'

/**
 * FNV-1a hash of `PROJECT_ID|PROJECT_HOMEPAGE|COPYRIGHT_NOTICE`. If the three
 * identifiers are edited without updating this constant, the self-check below
 * reports the project as tampered with.
 */
const PROJECT_MARKER_HASH = 0xf9900b51

/** Stable, machine-readable marker embedded in generated artifacts. */
export const PROJECT_SIGNATURE = `${PROJECT_ID}-f9900b51`

export interface ProjectMeta {
  generator: string
  id: string
  homepage: string
  repository: string
  copyright: string
  license: string
  signature: string
}

/** Metadata stamped into template JSON and generated output files. */
export function projectMeta(): ProjectMeta {
  return {
    generator: PROJECT_NAME,
    id: PROJECT_ID,
    homepage: PROJECT_HOMEPAGE,
    repository: PROJECT_REPOSITORY,
    copyright: COPYRIGHT_NOTICE,
    license: LICENSE_NOTICE,
    signature: PROJECT_SIGNATURE,
  }
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * Quiet self-check. Nothing is shown in the UI; a deliberately edited marker
 * only leaves a warning in the developer console.
 */
export function verifyProjectIntegrity(): boolean {
  const marker = `${PROJECT_ID}|${PROJECT_HOMEPAGE}|${COPYRIGHT_NOTICE}`
  const intact = fnv1a(marker) === PROJECT_MARKER_HASH
  if (!intact && typeof console !== 'undefined') {
    console.warn(
      '[DoPrint] Project attribution integrity check failed. The project identifier may have been modified.',
    )
  }
  return intact
}

/** Hidden global marker, useful when diagnosing rebranded builds. */
export function registerHiddenProjectMarker() {
  if (typeof globalThis === 'undefined') return
  try {
    Object.defineProperty(globalThis, '__DOPRINT_PROJECT__', {
      value: Object.freeze(projectMeta()),
      configurable: false,
      enumerable: false,
      writable: false,
    })
  } catch {
    // A host may freeze globalThis; attribution is best-effort.
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Invisible `<metadata>` block for generated SVG. Browsers ignore it when
 * rendering, while the file itself keeps a machine-readable origin marker.
 */
export function svgProjectMetadata(title = ''): string {
  const payload = JSON.stringify({ ...projectMeta(), title })
  return `<metadata id="doprint-copyright">${escapeXml(payload)}</metadata>`
}

/** Insert the metadata block without disturbing the rendered SVG content. */
export function injectSvgMetadata(svg: string, title = ''): string {
  if (!svg || svg.includes('id="doprint-copyright"')) return svg
  const start = svg.indexOf('<svg')
  if (start < 0) return svg
  const close = svg.indexOf('>', start)
  if (close < 0) return svg
  return (
    svg.slice(0, close + 1) +
    svgProjectMetadata(title) +
    svg.slice(close + 1)
  )
}
