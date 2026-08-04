import { vi } from 'vitest'

Object.assign(globalThis, {
  useToast: vi.fn(() => ({ add: vi.fn() }))
})

if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:test')
if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn()
