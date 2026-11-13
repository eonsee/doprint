import { inject, provide, type InjectionKey } from 'vue'
import type { Designer } from './designer'

const DESIGNER_KEY: InjectionKey<Designer> = Symbol('doprint-designer')

export function provideDesigner(designer: Designer) {
  provide(DESIGNER_KEY, designer)
}

export function useDesigner(): Designer {
  const designer = inject(DESIGNER_KEY)
  if (!designer) {
    throw new Error('Designer instance was not provided')
  }
  return designer
}
