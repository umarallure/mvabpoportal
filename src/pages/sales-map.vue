<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import usSvgFallbackRaw from '../assets/us.svg?raw'
import { supabase } from '../lib/supabase'

const US_SVG_URL = 'https://simplemaps.com/static/demos/resources/svg-library/svgs/us.svg'
const US_SVG_CACHE_KEY = 'ap-us-map-svg-cache-v1'

type UsState = {
  code: string
  name: string
}

const US_STATES: UsState[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' }
]

type StateData = {
  code: string
  name: string
  status: 'green' | 'yellow' | 'red'
  volume: number
  criteria: string
}

type OrderRow = {
  id: string
  target_states: string[]
  status?: string
  quota_total?: number | null
  quota_filled?: number | null
  expires_at?: string | null
  created_at?: string | null
}

const loading = ref(false)

const mapRoot = ref<HTMLDivElement | null>(null)

type TooltipState = {
  open: boolean
  x: number
  y: number
  state: StateData | null
}

const tooltip = ref<TooltipState>({
  open: false,
  x: 0,
  y: 0,
  state: null
})

const toStatus = (volume: number): StateData['status'] => {
  if (volume <= 10) return 'red'
  if (volume <= 20) return 'yellow'
  return 'green'
}

const criteriaForStatus = (status: StateData['status']) => {
  if (status === 'green') return 'High selling capacity'
  if (status === 'yellow') return 'Moderate selling capacity'
  return 'Low selling capacity'
}

const statesData = ref<StateData[]>(
  US_STATES.map((s) => ({
    code: s.code,
    name: s.name,
    status: 'red',
    volume: 0,
    criteria: criteriaForStatus('red')
  }))
)

const selectedStatus = ref('all')

type OrdersFilter = 'all' | 'has_orders' | 'no_orders'
const ordersFilter = ref<OrdersFilter>('all')

const ordersFilterOptions = [
  { value: 'all', label: 'All States' },
  { value: 'has_orders', label: 'Has Selling Volume' },
  { value: 'no_orders', label: 'No Selling Volume' }
]

const statusOptions = [
  { value: 'all', label: 'All States' },
  { value: 'red', label: 'Low Selling Capacity' },
  { value: 'green', label: 'High Selling Capacity' },
  { value: 'yellow', label: 'Moderate Selling Capacity' }
]

const filteredStates = ref(statesData.value)

const openOrders = ref<OrderRow[]>([])

const selectedStateCode = ref<string | null>(null)

watch([filteredStates], () => {
  const code = selectedStateCode.value
  if (!code) return
  const stillVisible = filteredStates.value.some((s) => s.code === code)
  if (!stillVisible) selectedStateCode.value = null
})

const filterStates = () => {
  let next = statesData.value
  if (selectedStatus.value !== 'all') {
    next = next.filter(s => s.status === selectedStatus.value)
  }

  if (ordersFilter.value === 'has_orders') {
    next = next.filter(s => s.volume > 0)
  } else if (ordersFilter.value === 'no_orders') {
    next = next.filter(s => s.volume <= 0)
  }

  filteredStates.value = next
}

const refreshCounts = async () => {
  loading.value = true
  try {
    const supabaseUntyped = supabase as unknown as {
      from: (
        table: string
      ) => {
        select: (cols: string) => {
          eq: (column: string, value: unknown) => {
            order: (
              column: string,
              opts: { ascending: boolean }
            ) => Promise<{ data: OrderRow[] | null; error: unknown }>
          }
        }
      }
    }

    const { data, error } = await supabaseUntyped
      .from('orders')
      .select('id,target_states,status,quota_total,quota_filled,expires_at,created_at')
      .eq('status', 'OPEN')
      .order('created_at', { ascending: false })

    if (error) {
      throw error instanceof Error ? error : new Error(String(error))
    }

    const rows = (data ?? []) as OrderRow[]
    openOrders.value = rows
    const counts = new Map<string, number>()

    for (const row of rows) {
      const targets = Array.isArray(row.target_states) ? row.target_states : []
      for (const s of targets) {
        const code = String(s || '').trim().toUpperCase()
        if (!code) continue
        counts.set(code, (counts.get(code) ?? 0) + 1)
      }
    }

    statesData.value = US_STATES.map((s) => {
      const volume = counts.get(s.code) ?? 0
      const status = toStatus(volume)
      return {
        code: s.code,
        name: s.name,
        status,
        volume,
        criteria: criteriaForStatus(status)
      }
    })

    filterStates()
  } finally {
    loading.value = false
  }
}

const getStatusLabel = (status: string) => {
  if (status === 'green') return 'High selling capacity'
  if (status === 'yellow') return 'Moderate selling capacity'
  return 'Low selling capacity'
}

const stateByCode = computed(() => new Map(statesData.value.map(s => [s.code, s])))

const mapFill = (status: StateData['status'] | undefined) => {
  if (status === 'green') return '#22c55e'
  if (status === 'yellow') return '#eab308'
  if (status === 'red') return '#ef4444'
  return '#e5e7eb'
}

const mapStroke = () => '#0b0b0b'

const textColorForStatus = (status: StateData['status'] | undefined) => {
  if (status === 'green') return '#ffffff'
  if (status === 'red') return '#ffffff'
  if (status === 'yellow') return '#111827'
  return '#111827'
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

const applyStateLabels = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg') as SVGSVGElement | null
  if (!svg) return

  // Remove old layer (avoid duplicates)
  const old = svg.querySelector('#state-labels')
  if (old) old.remove()

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  g.setAttribute('id', 'state-labels')
  g.setAttribute('pointer-events', 'none')

  const paths = svg.querySelectorAll('path[data-id]')
  paths.forEach((p) => {
    const code = p.getAttribute('data-id') || p.getAttribute('id')
    if (!code) return

    // Center label based on bounding box. Works well for most states; very small states may overlap (acceptable for prototype).
    let bbox: DOMRect
    try {
      bbox = (p as unknown as SVGGraphicsElement).getBBox()
    } catch {
      return
    }

    const cx = bbox.x + bbox.width / 2
    const cy = bbox.y + bbox.height / 2

    const state = stateByCode.value.get(code)
    const isVisible = selectedStatus.value === 'all' ? true : filteredStates.value.some(s => s.code === code)
    if (!isVisible) return

    const fontSize = clamp(Math.min(bbox.width, bbox.height) / 3, 6, 14)
    const fill = textColorForStatus(state?.status)

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.textContent = code
    text.setAttribute('x', String(cx))
    text.setAttribute('y', String(cy))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dominant-baseline', 'middle')
    text.style.setProperty('font-size', `${fontSize}px`, 'important')
    text.style.setProperty('font-weight', '700', 'important')
    text.style.setProperty('fill', fill, 'important')
    text.style.setProperty('paint-order', 'stroke', 'important')
    text.style.setProperty('stroke', 'rgba(0,0,0,0.35)', 'important')
    text.style.setProperty('stroke-width', '1', 'important')

    g.appendChild(text)
  })

  svg.appendChild(g)
}

const applyMapColors = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg')
  if (!svg) return

  const visibleSet = new Set(filteredStates.value.map(s => s.code))
  const paths = svg.querySelectorAll('path[data-id]')
  paths.forEach((p) => {
    const path = p as SVGPathElement
    const code = p.getAttribute('data-id') || p.getAttribute('id')
    if (!code) return
    const state = stateByCode.value.get(code)
    const isVisible = selectedStatus.value === 'all' ? true : visibleSet.has(code)

    const fill = mapFill(isVisible ? state?.status : undefined)
    const stroke = mapStroke()

    // Some SVGs include inline `style="fill:..."` which overrides `fill="..."`.
    // Force our color to win.
    path.style.setProperty('fill', fill, 'important')
    path.style.setProperty('stroke', stroke, 'important')
    path.style.setProperty('stroke-width', '0.8', 'important')
    path.style.cursor = state ? 'pointer' : 'default'
    path.style.opacity = isVisible ? '1' : '0.15'
  })

  applyStateLabels()
}

const handleStateEnter = (evt: Event) => {
  const target = evt.target as HTMLElement | null
  if (!target) return
  const code = target.getAttribute('data-id') || target.getAttribute('id')
  if (!code) return
  const state = stateByCode.value.get(code) ?? null
  if (!state) return

  tooltip.value.open = true
  tooltip.value.state = state
}

const handleStateLeave = () => {
  tooltip.value.open = false
  tooltip.value.state = null
}

const handleMouseMove = (evt: MouseEvent) => {
  const root = mapRoot.value
  if (!root) return
  const rect = root.getBoundingClientRect()
  tooltip.value.x = evt.clientX - rect.left + 12
  tooltip.value.y = evt.clientY - rect.top + 12
}

const bindSvgEvents = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg')
  if (!svg) return

  const paths = svg.querySelectorAll('path[data-id]')
  paths.forEach((p) => {
    p.addEventListener('mouseenter', handleStateEnter)
    p.addEventListener('mouseleave', handleStateLeave)
  })

  svg.addEventListener('mousemove', handleMouseMove)
}

const unbindSvgEvents = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg')
  if (!svg) return

  const paths = svg.querySelectorAll('path[data-id]')
  paths.forEach((p) => {
    p.removeEventListener('mouseenter', handleStateEnter)
    p.removeEventListener('mouseleave', handleStateLeave)
  })

  svg.removeEventListener('mousemove', handleMouseMove)
}

onMounted(() => {
  const run = async () => {
    if (!mapRoot.value) return

    try {
      const res = await fetch(US_SVG_URL)
      if (!res.ok) throw new Error('Failed to load map')
      const svgText = await res.text()

      try {
        localStorage.setItem(US_SVG_CACHE_KEY, svgText)
      } catch {
        // ignore storage errors
      }

      mapRoot.value.innerHTML = svgText
      bindSvgEvents()
      await refreshCounts()
      applyMapColors()
    } catch {
      const cached = (() => {
        try {
          return localStorage.getItem(US_SVG_CACHE_KEY)
        } catch {
          return null
        }
      })()

      mapRoot.value.innerHTML = cached || usSvgFallbackRaw
      bindSvgEvents()
      await refreshCounts()
      applyMapColors()
    }
  }

  void run()
})

onUnmounted(() => {
  unbindSvgEvents()
})

watch([selectedStatus, filteredStates], () => {
  applyMapColors()
})

watch([ordersFilter], () => {
  filterStates()
  applyMapColors()
})
</script>

<template>
  <UDashboardPanel id="sales-map">
    <template #header>
      <UDashboardNavbar title="USA States Sales Map">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            @click="refreshCounts().then(() => applyMapColors())"
          >
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <div>
          <UCard>
            <div class="space-y-3">
              <h3 class="font-semibold">Sales Capacity Legend</h3>
              <div class="text-sm text-muted">
                Colors represent selling capacity based on selling volume in each state.
              </div>
              <div class="grid gap-3 sm:grid-cols-3">
                <div class="flex items-center gap-2">
                  <div class="size-4 rounded-full bg-green-500" />
                  <span class="text-sm">Green - High selling capacity</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="size-4 rounded-full bg-yellow-500" />
                  <span class="text-sm">Yellow - Moderate selling capacity</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="size-4 rounded-full bg-red-500" />
                  <span class="text-sm">Red - Low selling capacity</span>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <USelect
              v-model="selectedStatus"
              class="w-64"
              :items="statusOptions"
              value-key="value"
              label-key="label"
              @change="filterStates"
            />

            <USelect
              v-model="ordersFilter"
              class="w-56"
              :items="ordersFilterOptions"
              value-key="value"
              label-key="label"
              @change="filterStates"
            />
          </div>

          <UBadge variant="subtle" :label="`${filteredStates.length} states`" />
        </div>

        <UCard :ui="{ body: 'p-4' }">
          <div class="relative">
            <div
              ref="mapRoot"
              class="w-full overflow-auto rounded-lg bg-white"
              style="max-height: 520px;"
            />

            <div
              v-if="tooltip.open && tooltip.state"
              class="pointer-events-none absolute z-10 rounded-lg border border-default bg-elevated px-3 py-2 shadow-lg"
              :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
            >
              <div class="text-sm font-semibold">{{ tooltip.state.name }} ({{ tooltip.state.code }})</div>
              <div class="mt-1 flex items-center gap-2">
                <UBadge
                  :color="tooltip.state.status === 'green' ? 'success' : tooltip.state.status === 'yellow' ? 'warning' : tooltip.state.status === 'red' ? 'error' : 'neutral'"
                  variant="subtle"
                  :label="getStatusLabel(tooltip.state.status)"
                  size="xs"
                />
              </div>
              <div class="mt-1 text-xs text-muted">{{ tooltip.state.criteria }}</div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
