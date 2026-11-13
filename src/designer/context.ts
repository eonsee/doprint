import { inject, provide } from 'vue'
import type { Designer } from './designer'

// A string key keeps provide / inject working on both Vue 2.7 and Vue 3.
const DESIGNER_KEY = 'doprint-designer'

export function provideDesigner(designer: Designer) {
  provide(DESIGNER_KEY, designer)
}

export function useDesigner(): Designer {
  const designer = inject<Designer>(DESIGNER_KEY)
  if (!designer) {
    throw new Error('Designer instance was not provided')
  }
  return designer
}
