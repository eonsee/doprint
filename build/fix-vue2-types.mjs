// vue-tsc emits Vue 3 style declarations (two-generic `Ref`, and
// `DefineComponent` with more generics than Vue 2.7 accepts). Derive a Vue 2
// copy so consumers of `doprint-designer/vue2` type-check without skipLibCheck.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const from = path.join(root, 'dist-lib/types')
const to = path.join(root, 'dist-lib/types-vue2')

fs.rmSync(to, { recursive: true, force: true })
fs.cpSync(from, to, { recursive: true })

function* declarations(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* declarations(full)
    else if (entry.name.endsWith('.d.ts')) yield full
  }
}

/** Drop the second type argument of every `Ref<A, B>` (Vue 3.5 only). */
function stripRefSetterType(source) {
  const ranges = []
  const pattern = /(^|[^A-Za-z0-9_])Ref</g
  let match
  while ((match = pattern.exec(source))) {
    const open = match.index + match[0].length - 1
    let angles = 0
    let groups = 0
    let comma = -1
    let close = -1
    for (let i = open; i < source.length; i += 1) {
      const ch = source[i]
      if (ch === '<') angles += 1
      else if (ch === '>') {
        angles -= 1
        if (angles === 0) {
          close = i
          break
        }
      } else if (ch === '(' || ch === '{' || ch === '[') groups += 1
      else if (ch === ')' || ch === '}' || ch === ']') groups -= 1
      else if (ch === ',' && angles === 1 && groups === 0 && comma < 0) {
        comma = i
      }
    }
    if (close > 0 && comma > 0) ranges.push([comma, close])
  }
  let output = source
  for (const [comma, close] of ranges.reverse()) {
    output = output.slice(0, comma) + output.slice(close)
  }
  return output
}

for (const file of declarations(to)) {
  const source = fs.readFileSync(file, 'utf8')
  const fixed = stripRefSetterType(source)
  if (fixed !== source) fs.writeFileSync(file, fixed)
}

fs.writeFileSync(
  path.join(to, 'components/DoPrintDesigner.vue.d.ts'),
  `import type { DefineComponent } from 'vue'
import type { Designer } from '../designer/designer'

declare const _default: DefineComponent<{}, {}, any> & {
  new (): { $emit(event: 'ready', designer: Designer): void }
}

export default _default
`,
)
