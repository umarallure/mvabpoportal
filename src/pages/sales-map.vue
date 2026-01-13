<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { TableColumn } from '@nuxt/ui'

import usSvgFallbackRaw from '../assets/us.svg?raw'

const US_SVG_URL = 'https://simplemaps.com/static/demos/resources/svg-library/svgs/us.svg'
const US_SVG_CACHE_KEY = 'ap-us-map-svg-cache-v1'

type StateData = {
  code: string
  name: string
  status: 'green' | 'yellow' | 'red'
  volume: number
  criteria: string
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

const statesData = ref<StateData[]>([
  { code: 'CA', name: 'California', status: 'green', volume: 450, criteria: 'High demand, excellent market' },
  { code: 'TX', name: 'Texas', status: 'green', volume: 380, criteria: 'Strong market, good opportunities' },
  { code: 'FL', name: 'Florida', status: 'yellow', volume: 250, criteria: 'Moderate demand, competitive' },
  { code: 'NY', name: 'New York', status: 'green', volume: 420, criteria: 'High demand, premium market' },
  { code: 'PA', name: 'Pennsylvania', status: 'yellow', volume: 180, criteria: 'Moderate demand' },
  { code: 'IL', name: 'Illinois', status: 'green', volume: 310, criteria: 'Good market conditions' },
  { code: 'OH', name: 'Ohio', status: 'yellow', volume: 200, criteria: 'Average market' },
  { code: 'GA', name: 'Georgia', status: 'green', volume: 290, criteria: 'Growing market' },
  { code: 'NC', name: 'North Carolina', status: 'yellow', volume: 160, criteria: 'Moderate opportunities' },
  { code: 'MI', name: 'Michigan', status: 'red', volume: 90, criteria: 'Low demand, saturated' },
  { code: 'NJ', name: 'New Jersey', status: 'green', volume: 270, criteria: 'Strong market' },
  { code: 'VA', name: 'Virginia', status: 'yellow', volume: 150, criteria: 'Moderate demand' },
  { code: 'WA', name: 'Washington', status: 'green', volume: 320, criteria: 'Excellent market' },
  { code: 'AZ', name: 'Arizona', status: 'yellow', volume: 190, criteria: 'Growing market' },
  { code: 'MA', name: 'Massachusetts', status: 'green', volume: 280, criteria: 'High demand' },
  { code: 'TN', name: 'Tennessee', status: 'yellow', volume: 140, criteria: 'Moderate opportunities' },
  { code: 'IN', name: 'Indiana', status: 'red', volume: 80, criteria: 'Low demand' },
  { code: 'MO', name: 'Missouri', status: 'yellow', volume: 130, criteria: 'Average market' },
  { code: 'MD', name: 'Maryland', status: 'green', volume: 240, criteria: 'Good opportunities' },
  { code: 'WI', name: 'Wisconsin', status: 'red', volume: 70, criteria: 'Low demand, challenging' }
])

const selectedStatus = ref('all')

const statusOptions = [
  { value: 'all', label: 'All States' },
  { value: 'green', label: 'Green - Can Sell' },
  { value: 'yellow', label: 'Yellow - Moderate' },
  { value: 'red', label: 'Red - Restricted' }
]

const filteredStates = ref(statesData.value)

const filterStates = () => {
  if (selectedStatus.value === 'all') {
    filteredStates.value = statesData.value
  } else {
    filteredStates.value = statesData.value.filter(s => s.status === selectedStatus.value)
  }
}

const getStatusColor = (status: string) => {
  if (status === 'green') return 'bg-green-500'
  if (status === 'yellow') return 'bg-yellow-500'
  return 'bg-red-500'
}

const getStatusLabel = (status: string) => {
  if (status === 'green') return 'Can Sell'
  if (status === 'yellow') return 'Moderate'
  return 'Restricted'
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
    const code = p.getAttribute('data-id') || p.getAttribute('id')
    if (!code) return
    const state = stateByCode.value.get(code)
    const isVisible = selectedStatus.value === 'all' ? true : visibleSet.has(code)

    const fill = mapFill(isVisible ? state?.status : undefined)
    const stroke = mapStroke()

    // Some SVGs include inline `style="fill:..."` which overrides `fill="..."`.
    // Force our color to win.
    p.style.setProperty('fill', fill, 'important')
    p.style.setProperty('stroke', stroke, 'important')
    p.style.setProperty('stroke-width', '0.8', 'important')
    p.style.cursor = state ? 'pointer' : 'default'
    p.style.opacity = isVisible ? '1' : '0.15'
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

const columns = computed<TableColumn<StateData>[]>(() => [
  { accessorKey: 'code', header: 'Code' },
  { accessorKey: 'name', header: 'State' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'volume', header: 'Volume' },
  { accessorKey: 'criteria', header: 'Criteria' }
])
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
              <h3 class="font-semibold">Sales Criteria Legend</h3>
              <div class="grid gap-3 sm:grid-cols-3">
                <div class="flex items-center gap-2">
                  <div class="size-4 rounded-full bg-green-500" />
                  <span class="text-sm">Green - Can Sell (High Demand)</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="size-4 rounded-full bg-yellow-500" />
                  <span class="text-sm">Yellow - Moderate (Average Market)</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="size-4 rounded-full bg-red-500" />
                  <span class="text-sm">Red - Restricted (Low Demand)</span>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <div class="flex items-center justify-between">
          <USelect
            v-model="selectedStatus"
            class="w-64"
            :items="statusOptions"
            value-key="value"
            label-key="label"
            @change="filterStates"
          />

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
                  :color="tooltip.state.status === 'green' ? 'success' : tooltip.state.status === 'yellow' ? 'warning' : 'error'"
                  variant="subtle"
                  :label="getStatusLabel(tooltip.state.status)"
                  size="xs"
                />
                <span class="text-xs text-muted">Volume: {{ tooltip.state.volume }}</span>
              </div>
              <div class="mt-1 text-xs text-muted">{{ tooltip.state.criteria }}</div>
            </div>
          </div>
        </UCard>

        <UCard :ui="{ body: 'p-0' }">
          <UTable
            :data="filteredStates"
            :columns="columns"
            :ui="{
              base: 'w-full',
              thead: '[&>tr]:bg-elevated/50',
              tbody: '[&>tr]:hover:bg-muted/50',
              th: 'px-4 py-3 text-left',
              td: 'px-4 py-3 align-top'
            }"
          >
            <template #status-cell="{ row }">
              <UBadge
                :color="row.original.status === 'green' ? 'success' : row.original.status === 'yellow' ? 'warning' : 'error'"
                variant="subtle"
                :label="getStatusLabel(row.original.status)"
                size="xs"
              />
            </template>
          </UTable>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
