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
  status: 'unblocked' | 'temporarily_blocked' | 'permanently_blocked'
  capacity: 'low' | 'medium' | 'high' | null
  attorneyCount: number
  description: string
  notes: string | null
}

type SalesMapStateRow = {
  state_code?: string | null
  state_name?: string | null
  availability_status?: string | null
  notes?: string | null
}

type LawyerRequirementRow = {
  attorney_id?: string | null
  attorney_name?: string | null
  states?: unknown
  lawyer_type?: string | null
}

type AttorneyProfileRow = {
  user_id?: string | null
  full_name?: string | null
  firm_name?: string | null
  primary_email?: string | null
  personal_email?: string | null
  licensed_states?: string[] | null
  blocked_states?: string[] | null
  account_type?: string | null
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

const US_STATE_CODES = new Set(US_STATES.map((state) => state.code))

const GREEN_ACTIVE_STATE_CODES = new Set([
  'WY',
  'AZ',
  'TX',
  'GA',
  'FL',
  'NY'
])

const descriptionForStatus = (status: StateData['status']) => {
  if (status === 'permanently_blocked') return 'Temporarily blocked state'
  if (status === 'temporarily_blocked') return 'Blocked state'
  return 'Unblocked state'
}

const capacityLabel = (capacity: StateData['capacity']) => {
  if (capacity === 'high') return 'High selling capacity'
  if (capacity === 'medium') return 'Medium selling capacity'
  if (capacity === 'low') return 'Low selling capacity'
  return null
}

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase()

const normalizeStateCode = (value: unknown) => String(value ?? '').trim().toUpperCase()

const toAvailabilityStatus = (value: unknown): StateData['status'] | null => {
  const status = normalize(value)
  if (status === 'unblocked' || status === 'temporarily_blocked' || status === 'permanently_blocked') {
    return status
  }
  return null
}

const isTestLawyer = (...values: unknown[]) => values.some((value) => normalize(value).includes('test'))

const toStateCodes = (value: unknown): string[] => {
  const asArray = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(value)
            return Array.isArray(parsed) ? parsed : value.split(',')
          } catch {
            return value.split(',')
          }
        })()
      : []

  return [...new Set(asArray
    .map((item) => normalizeStateCode(item))
    .filter((code) => US_STATE_CODES.has(code))
  )]
}

const statesData = ref<StateData[]>(
  US_STATES.map((s) => ({
    code: s.code,
    name: s.name,
    status: 'temporarily_blocked',
    capacity: null,
    attorneyCount: 0,
    description: descriptionForStatus('temporarily_blocked'),
    notes: null
  }))
)

const selectedStatus = ref('all')

const statusOptions = [
  { value: 'all', label: 'All States' },
  { value: 'unblocked', label: 'Unblocked' },
  { value: 'temporarily_blocked', label: 'Blocked' },
  { value: 'permanently_blocked', label: 'Temporarily Blocked' }
]

const filteredStates = ref(statesData.value)

const filterStates = () => {
  let next = statesData.value
  if (selectedStatus.value !== 'all') {
    next = next.filter(s => s.status === selectedStatus.value)
  }

  filteredStates.value = next
}

const refreshCounts = async () => {
  loading.value = true
  try {
    const [
      { data: salesMapRows, error: salesMapError },
      { data: lawyerRequirementRows, error: lawyerRequirementError },
      { data: attorneyProfileRows, error: attorneyProfileError }
    ] = await Promise.all([
      supabase
        .from('sales_map_states')
        .select('state_code,state_name,availability_status,notes'),
      supabase
        .from('lawyer_requirements')
        .select('attorney_id,attorney_name,states,lawyer_type')
        .eq('lawyer_type', 'broker_lawyer'),
      supabase
        .from('attorney_profiles')
        .select('user_id,full_name,firm_name,primary_email,personal_email,licensed_states,blocked_states,account_type')
        .eq('account_type', 'internal_lawyer')
    ])

    if (salesMapError) {
      throw salesMapError instanceof Error ? salesMapError : new Error(String(salesMapError))
    }

    if (lawyerRequirementError) {
      throw lawyerRequirementError instanceof Error ? lawyerRequirementError : new Error(String(lawyerRequirementError))
    }

    if (attorneyProfileError) {
      throw attorneyProfileError instanceof Error ? attorneyProfileError : new Error(String(attorneyProfileError))
    }

    const rows = (salesMapRows ?? []) as SalesMapStateRow[]
    const mapByCode = new Map(
      rows.map((row) => [
        String(row.state_code || '').trim().toUpperCase(),
        row
      ] as const)
    )

    const attorneyCounts = new Map<string, Set<string>>()

    const addAttorneyStates = (lawyerKey: string, stateCodes: string[], blockedStateCodes: string[]) => {
      const blocked = new Set(blockedStateCodes)
      for (const code of stateCodes) {
        if (blocked.has(code)) continue
        const existing = attorneyCounts.get(code) ?? new Set<string>()
        existing.add(lawyerKey)
        attorneyCounts.set(code, existing)
      }
    }

    for (const row of (lawyerRequirementRows ?? []) as LawyerRequirementRow[]) {
      const stateCodes = toStateCodes(row.states)
      if (!stateCodes.length) continue
      if (isTestLawyer(row.attorney_name)) continue

      const attorneyId = String(row.attorney_id ?? '').trim()
      const attorneyName = String(row.attorney_name ?? '').trim()
      const lawyerKey = `broker:${attorneyId || attorneyName}`
      if (!attorneyId && !attorneyName) continue

      addAttorneyStates(lawyerKey, stateCodes, [])
    }

    for (const row of (attorneyProfileRows ?? []) as AttorneyProfileRow[]) {
      const stateCodes = toStateCodes(row.licensed_states)
      if (!stateCodes.length) continue
      if (isTestLawyer(row.full_name, row.firm_name, row.primary_email, row.personal_email)) continue

      const userId = String(row.user_id ?? '').trim()
      const fullName = String(row.full_name ?? '').trim()
      const lawyerKey = `internal:${userId || fullName}`
      if (!userId && !fullName) continue

      addAttorneyStates(lawyerKey, stateCodes, toStateCodes(row.blocked_states))
    }

    statesData.value = US_STATES.map((s) => {
      const row = mapByCode.get(s.code)
      const attorneyCount = attorneyCounts.get(s.code)?.size ?? 0
      const configuredStatus = toAvailabilityStatus(row?.availability_status)
      const resolvedStatus: StateData['status'] = configuredStatus === 'permanently_blocked'
        ? 'permanently_blocked'
        : attorneyCount > 0
        ? 'unblocked'
        : 'temporarily_blocked'
      const capacity = resolvedStatus === 'unblocked'
        ? GREEN_ACTIVE_STATE_CODES.has(s.code) ? 'high' : 'medium'
        : null

      return {
        code: s.code,
        name: String(row?.state_name || s.name),
        status: resolvedStatus,
        capacity,
        attorneyCount,
        description: resolvedStatus === 'unblocked'
          ? `${capacityLabel(capacity)}`
          : descriptionForStatus(resolvedStatus),
        notes: row?.notes ?? null
      }
    })

    filterStates()
  } finally {
    loading.value = false
  }
}

const getStatusLabel = (status: string) => {
  if (status === 'permanently_blocked') return 'Temporarily blocked'
  if (status === 'temporarily_blocked') return 'Blocked'
  return 'Unblocked'
}

const getStateBadgeLabel = (state: StateData) => {
  if (state.status !== 'unblocked') return getStatusLabel(state.status)
  return capacityLabel(state.capacity) ?? 'Unblocked'
}

const stateByCode = computed(() => new Map(statesData.value.map(s => [s.code, s])))

const MAP_PATH_SELECTOR = 'path[data-id], path[id]'

const BLOCKED_PATTERN_ID = 'blocked-hatch'
const PERMANENT_BLOCKED_PATTERN_ID = 'permanent-blocked-hatch'

const ensurePatterns = (svg: SVGSVGElement) => {
  let defs = svg.querySelector('defs')
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    svg.insertBefore(defs, svg.firstChild)
  }

  if (!svg.querySelector(`#${BLOCKED_PATTERN_ID}`)) {
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern')
    pattern.setAttribute('id', BLOCKED_PATTERN_ID)
    pattern.setAttribute('patternUnits', 'userSpaceOnUse')
    pattern.setAttribute('width', '10')
    pattern.setAttribute('height', '10')
    pattern.setAttribute('patternTransform', 'rotate(45)')

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('width', '10')
    bg.setAttribute('height', '10')
    bg.setAttribute('fill', '#f8fafc')

    const stripe = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    stripe.setAttribute('width', '2')
    stripe.setAttribute('height', '10')
    stripe.setAttribute('fill', '#111827')

    pattern.appendChild(bg)
    pattern.appendChild(stripe)
    defs.appendChild(pattern)
  }

  if (!svg.querySelector(`#${PERMANENT_BLOCKED_PATTERN_ID}`)) {
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern')
    pattern.setAttribute('id', PERMANENT_BLOCKED_PATTERN_ID)
    pattern.setAttribute('patternUnits', 'userSpaceOnUse')
    pattern.setAttribute('width', '12')
    pattern.setAttribute('height', '12')
    pattern.setAttribute('patternTransform', 'rotate(45)')

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('width', '12')
    bg.setAttribute('height', '12')
    bg.setAttribute('fill', '#fff7ed')

    const stripe = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    stripe.setAttribute('width', '3')
    stripe.setAttribute('height', '12')
    stripe.setAttribute('fill', '#f97316')

    pattern.appendChild(bg)
    pattern.appendChild(stripe)
    defs.appendChild(pattern)
  }
}

const mapFill = (status: StateData['status'] | undefined) => {
  if (status === 'unblocked') return '#e5e7eb'
  if (status === 'permanently_blocked') return `url(#${PERMANENT_BLOCKED_PATTERN_ID})`
  if (status === 'temporarily_blocked') return `url(#${BLOCKED_PATTERN_ID})`
  return '#e5e7eb'
}

const unblockedCapacityFill = (capacity: StateData['capacity']) => {
  if (capacity === 'high') return '#22c55e'
  if (capacity === 'medium') return '#eab308'
  return '#ef4444'
}

const mapStroke = () => '#0b0b0b'

const textColorForStatus = (status: StateData['status'] | undefined) => {
  if (status === 'unblocked') return '#111827'
  if (status === 'permanently_blocked') return '#111827'
  if (status === 'temporarily_blocked') return '#111827'
  return '#111827'
}

const badgeColorForState = (state: StateData) => {
  if (state.status === 'permanently_blocked') return 'warning'
  if (state.status === 'temporarily_blocked') return 'neutral'
  if (state.capacity === 'high') return 'success'
  if (state.capacity === 'medium') return 'warning'
  return 'error'
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

  const paths = svg.querySelectorAll(MAP_PATH_SELECTOR)
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

    const outlineStroke = state?.status === 'temporarily_blocked' || state?.status === 'permanently_blocked'
      ? '#f9fafb'
      : 'rgba(0,0,0,0.2)'
    const outlineWidth = state?.status === 'temporarily_blocked' || state?.status === 'permanently_blocked'
      ? '3'
      : '1'

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
    text.style.setProperty('stroke', outlineStroke, 'important')
    text.style.setProperty('stroke-width', outlineWidth, 'important')

    g.appendChild(text)
  })

  svg.appendChild(g)
}

const applyMapColors = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg')
  if (!svg) return

  ensurePatterns(svg as SVGSVGElement)

  const visibleSet = new Set(filteredStates.value.map(s => s.code))
  const paths = svg.querySelectorAll(MAP_PATH_SELECTOR)
  paths.forEach((p) => {
    const path = p as SVGPathElement
    const code = p.getAttribute('data-id') || p.getAttribute('id')
    if (!code) return
    const state = stateByCode.value.get(code)
    const isVisible = selectedStatus.value === 'all' ? true : visibleSet.has(code)

    const fill = isVisible && state?.status === 'unblocked'
      ? unblockedCapacityFill(state.capacity)
      : mapFill(isVisible ? state?.status : undefined)
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

/* ── New UI helpers ── */

const statsCards = computed(() => {
  const all = statesData.value
  return [
    { label: 'Total', value: all.length, accent: '#ae4010', delay: 400 },
    { label: 'Active', value: all.filter(s => s.status === 'unblocked').length, accent: '#3f6eb3', delay: 500 },
    { label: 'Blocked', value: all.filter(s => s.status === 'temporarily_blocked').length, accent: '#9ca3af', delay: 600 }
  ]
})

const activeCount = computed(() => filteredStates.value.length)
const maxStates = US_STATES.length
const isAtMax = computed(() => activeCount.value >= maxStates)

const revealMap = () => {
  if (!mapRoot.value) return
  mapRoot.value.classList.remove('opacity-0')
  mapRoot.value.classList.add('ap-blur-in')
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
      revealMap()
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
      revealMap()
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
</script>

<template>
  <UDashboardPanel id="sales-map">
    <template #header>
      <UDashboardNavbar title="Sales Map">
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
          <NotificationBell />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Card shell -->
      <div class="ap-fade-in ap-delay-2 rounded-2xl border border-black/[0.08] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] p-4 overflow-hidden">
        <!-- Relative container for map + overlays -->
        <div class="relative">
          <!-- SVG Map -->
          <div
            ref="mapRoot"
            class="ap-map-root w-full rounded-xl overflow-hidden opacity-0"
            style="height: 520px"
          />

          <!-- Stats overlay — desktop only -->
          <div class="absolute left-3 top-3 z-10 hidden md:block">
            <div class="w-32 overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm">
              <div
                v-for="(stat, i) in statsCards"
                :key="stat.label"
                class="ap-fade-in-left px-4 py-3"
                :class="{ 'border-t border-black/[0.04] dark:border-white/[0.06]': i > 0 }"
                :style="{ animationDelay: `${stat.delay}ms` }"
              >
                <div class="relative pl-3">
                  <div
                    class="absolute bottom-0.5 left-0 top-0.5 w-[3px] rounded-full"
                    :style="{ backgroundColor: stat.accent }"
                  />
                  <div class="text-xs leading-tight text-gray-500 dark:text-gray-400">{{ stat.label }}</div>
                  <div class="text-lg font-bold" :style="{ color: stat.accent }">{{ stat.value }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Legend + Filter bar — floating bottom-center -->
          <div class="absolute bottom-0 left-1/2 z-10 -translate-x-1/2 ap-fade-in ap-delay-4">
            <div class="flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-black/[0.06] px-2.5 py-2 shadow-lg backdrop-blur-sm dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 md:max-w-none md:flex-nowrap md:gap-x-4 md:whitespace-nowrap md:px-4 md:py-2.5">
              <!-- Legend items -->
              <div class="flex flex-wrap items-center gap-2 md:flex-nowrap md:gap-3">
                <div class="flex items-center gap-1.5">
                  <div class="size-2.5 rounded-full bg-red-500" />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">Low Capacity</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="size-2.5 rounded-full bg-yellow-500" />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">Medium Capacity</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class="size-2.5 rounded-full bg-green-500" />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">High Capacity</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div
                    class="size-2.5 rounded-full"
                    style="background: repeating-linear-gradient(45deg, #9ca3af 0 2px, #f3f4f6 2px 6px)"
                  />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">Blocked</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <div
                    class="size-2.5 rounded-full"
                    style="background: repeating-linear-gradient(45deg, #f97316 0 3px, #fff7ed 3px 7px)"
                  />
                  <span class="text-[10px] text-gray-500 dark:text-gray-400">Temporarily unavailable</span>
                </div>
              </div>

              <!-- Divider -->
              <div class="hidden h-5 w-px bg-black/[0.08] dark:bg-white/[0.08] md:block" />

              <!-- Controls -->
              <div class="flex items-center gap-2">
                <!-- State count badge -->
                <div
                  class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold"
                  :class="isAtMax
                    ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                    : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.06] text-gray-500 dark:text-gray-400'"
                >
                  <UIcon :name="isAtMax ? 'i-lucide-alert-triangle' : 'i-lucide-map-pin'" class="size-[9px]" />
                  {{ activeCount }}/{{ maxStates }}
                </div>

                <!-- Filter -->
                <USelect
                  v-model="selectedStatus"
                  size="xs"
                  class="min-w-28 md:min-w-36"
                  :items="statusOptions"
                  value-key="value"
                  label-key="label"
                  @change="filterStates"
                />
              </div>
            </div>
          </div>

          <!-- Tooltip -->
          <div
            v-if="tooltip.open && tooltip.state"
            class="pointer-events-none absolute z-20 rounded-xl border border-black/[0.08] dark:border-white/[0.06] bg-white dark:bg-[#1a1a1a] px-4 py-3 shadow-xl"
            :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
          >
            <div class="text-sm font-semibold">{{ tooltip.state.name }} ({{ tooltip.state.code }})</div>
            <div class="mt-1.5 flex items-center gap-2">
              <UBadge
                :color="badgeColorForState(tooltip.state)"
                variant="subtle"
                :label="getStateBadgeLabel(tooltip.state)"
                size="xs"
              />
            </div>
            <div class="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {{ tooltip.state.notes || tooltip.state.description }}
            </div>
          </div>
        </div>

        <!-- Mobile stats row -->
        <div class="mt-3 flex gap-2 md:hidden">
          <div
            v-for="stat in statsCards"
            :key="stat.label"
            class="ap-fade-in-left relative flex-1 overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 px-3 py-2.5 pl-5 shadow-sm backdrop-blur-sm"
            :style="{ animationDelay: `${stat.delay}ms` }"
          >
            <div
              class="absolute bottom-0 left-0 top-0 w-1 rounded-r-full"
              :style="{ backgroundColor: stat.accent }"
            />
            <div class="text-[10px] leading-tight text-gray-500 dark:text-gray-400">{{ stat.label }}</div>
            <div class="text-base font-bold" :style="{ color: stat.accent }">{{ stat.value }}</div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* SVG responsive sizing */
.ap-map-root :deep(svg) {
  width: 100%;
  height: 100%;
}

/* State path hover effect */
.ap-map-root :deep(svg path[data-id]) {
  transition: transform 0.2s ease, opacity 0.3s ease;
  transform-origin: center;
  transform-box: fill-box;
}

.ap-map-root :deep(svg path[data-id]:hover) {
  transform: scale(1.08);
}
</style>
