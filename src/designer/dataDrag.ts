/**
 * Dragging sample-data fields from the data panel onto the page. The feature
 * is optional and persisted per browser, so embedded designers can turn it
 * off without touching template data.
 */

/** Custom drop MIME type; also used to detect a field drag in the stage. */
export const FIELD_DRAG_MIME = 'application/x-doprint-field'

const DATA_DRAG_STORAGE_KEY = 'doprint.data-drag.v1'

export function readDataDragEnabled(): boolean {
  try {
    const saved = localStorage.getItem(DATA_DRAG_STORAGE_KEY)
    return saved === null ? true : saved === '1'
  } catch {
    return true
  }
}

export function writeDataDragEnabled(enabled: boolean) {
  try {
    localStorage.setItem(DATA_DRAG_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // Preference persistence is best-effort.
  }
}
