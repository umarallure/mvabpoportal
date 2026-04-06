<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TableColumn } from '@nuxt/ui'
import { useAuth } from '../composables/useAuth'
import {
  ALL_FILTER_VALUE,
  formatSourceTypeLabel,
  matchesPipelineDateRange,
  PIPELINE_DATE_RANGE_OPTIONS,
  resolvePipelineSourceType,
  resolvePipelineState,
  type PipelineDateRange
} from '../lib/pipeline-filters'
import { supabase } from '../lib/supabase'
import { getTransferStageDescription } from '../lib/pipeline-stage-descriptions'
import { usePipelineStages } from '../composables/usePipelineStages'

const { stages: dbStages } = usePipelineStages('transfer_portal')

const STAGES = computed(() => dbStages.value.map((s) => ({
  key: s.key,
  label: s.label,
  description: getTransferStageDescription(s.key)
})))

type TransferLead = {
  id: string
  date: string
  clientName: string
  phone: string
  opportunityValue: number
  stage: string
  state: string
  sourceType: string
  publisher: string
}

const handleRefresh = async () => {
  if (loading.value) return
  page.value = 1
  await loadTransfers()
}

type ViewMode = 'kanban' | 'list'

const router = useRouter()
const route = useRoute()
const auth = useAuth()
const loading = ref(false)
const query = ref('')
const page = ref(1)
const PAGE_SIZE = 25
const viewMode = ref<ViewMode>('kanban')
const filtersOpen = ref(false)
const selectedStage = ref<string>(ALL_FILTER_VALUE)
const selectedSourceType = ref<string>(ALL_FILTER_VALUE)
const selectedStates = ref<string[]>([])
const selectedDateRange = ref<PipelineDateRange>('all')
const customStartDate = ref('')
const customEndDate = ref('')

const filterCaseCategory = ref<string[]>([])
const filterInjurySeverity = ref<string[]>([])
const filterInsuranceStatus = ref<string[]>([])
const filterLiabilityStatus = ref<string[]>([])
const filterMedicalTreatment = ref<string[]>([])
const filterLanguage = ref<string[]>([])
const filterExpiry = ref('all')

const transfers = ref<TransferLead[]>([])

const stageOptions = computed(() => [
  { label: 'All Stages', value: ALL_FILTER_VALUE },
  ...STAGES.value.map(stage => ({ label: stage.label, value: stage.key }))
])

const sourceTypeOptions = computed(() => {
  const values = Array.from(new Set(transfers.value.map(lead => lead.sourceType).filter(Boolean)))
  return [
    { label: 'All Sources', value: ALL_FILTER_VALUE },
    ...values
      .sort((a, b) => formatSourceTypeLabel(a).localeCompare(formatSourceTypeLabel(b)))
      .map(value => ({ label: formatSourceTypeLabel(value), value }))
  ]
})

const stateOptions = computed(() => {
  const values = Array.from(new Set(transfers.value.map(lead => lead.state).filter(Boolean)))
  return values
    .sort((a, b) => a.localeCompare(b))
    .map(value => ({ label: value, value }))
})

const activeFilterCount = computed(() => {
  let count = 0
  if (selectedDateRange.value !== 'all') count += 1
  if (selectedStage.value !== ALL_FILTER_VALUE) count += 1
  if (selectedSourceType.value !== ALL_FILTER_VALUE) count += 1
  if (selectedStates.value.length > 0) count += 1
  if (filterCaseCategory.value.length > 0) count += 1
  if (filterInjurySeverity.value.length > 0) count += 1
  if (filterInsuranceStatus.value.length > 0) count += 1
  if (filterLiabilityStatus.value.length > 0) count += 1
  if (filterMedicalTreatment.value.length > 0) count += 1
  if (filterLanguage.value.length > 0) count += 1
  if (filterExpiry.value !== 'all') count += 1
  return count
})

const filteredLeads = computed(() => {
  const q = query.value.trim().toLowerCase()
  return transfers.value.filter((t) => {
    if (!matchesPipelineDateRange(t.date, selectedDateRange.value, customStartDate.value, customEndDate.value)) return false
    if (selectedStage.value !== ALL_FILTER_VALUE && t.stage !== selectedStage.value) return false
    if (selectedSourceType.value !== ALL_FILTER_VALUE && t.sourceType !== selectedSourceType.value) return false
    if (selectedStates.value.length > 0 && !selectedStates.value.includes(t.state)) return false
    if (!q) return true
    const stageLabel = STAGES.value.find(s => s.key === t.stage)?.label ?? ''
    const haystack = [t.id, t.clientName, t.phone, stageLabel, t.publisher, t.state, formatSourceTypeLabel(t.sourceType)].join(' ').toLowerCase()
    return haystack.includes(q)
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredLeads.value.length / PAGE_SIZE)))

const pagedRows = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filteredLeads.value.slice(start, start + PAGE_SIZE)
})

const totalTransfersCount = computed(() => filteredLeads.value.length)


const leadsByStage = computed(() => {
  const grouped = new Map<string, TransferLead[]>()
  STAGES.value.forEach((s) => grouped.set(s.key, []))
  filteredLeads.value.forEach((l) => {
    const arr = grouped.get(l.stage)
    if (arr) arr.push(l)
  })
  return grouped
})

const formatMoney = (n: number) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
  } catch {
    return `$${n}`
  }
}

const getStageLabel = (stage: string) => STAGES.value.find(s => s.key === stage)?.label ?? stage

const mapStatusToStage = (status: string | null): string => {
  if (!status) return STAGES.value[0]?.key ?? 'transfer_api'
  const trimmed = status.trim()
  const byKey = STAGES.value.find((s) => s.key === trimmed)
  return byKey ? byKey.key : (STAGES.value[0]?.key ?? 'transfer_api')
}

const columns: TableColumn<TransferLead>[] = [
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'clientName', header: 'Client' },
  { accessorKey: 'phone', header: 'Phone' },
  { accessorKey: 'stage', header: 'Stage' },
  { accessorKey: 'opportunityValue', header: 'Volume' },
  { accessorKey: 'publisher', header: 'Publisher' }
]

const loadError = ref('')

const loadTransfers = async () => {
  const stageKeys = dbStages.value.map(s => s.key)
  if (stageKeys.length === 0) return

  try {
    loading.value = true
    loadError.value = ''
    await auth.init()

    const canSeeAll = auth.canSeeAll.value
    const leadVendor = auth.resolvedLeadVendor.value

    if (!canSeeAll && !leadVendor) {
      transfers.value = []
      return
    }

    let query = supabase.from('leads').select('*').in('status', stageKeys)

    if (!canSeeAll && leadVendor) {
      query = query.eq('lead_vendor', leadVendor)
    }

    const { data, error } = await query

    if (error) {
      loadError.value = error.message || 'Failed to load transfers'
      transfers.value = []
      return
    }

    const getString = (record: Record<string, unknown>, key: string) => {
      const value = record[key]
      if (typeof value === 'string') return value
      if (value == null) return ''
      return String(value)
    }

    const getNumber = (record: Record<string, unknown>, key: string) => {
      const value = record[key]
      if (typeof value === 'number') return value
      if (typeof value === 'string') {
        const cleaned = value.replace(/[^0-9.+-]/g, '')
        const parsed = Number(cleaned)
        return Number.isFinite(parsed) ? parsed : 0
      }
      return 0
    }

    transfers.value = (data ?? []).map((row) => {
      const record = (row ?? {}) as Record<string, unknown>

      const opportunityValue =
        getNumber(record, 'face_amount') ||
        getNumber(record, 'monthly_premium') ||
        getNumber(record, 'opportunity_value') ||
        getNumber(record, 'opportunityValue') ||
        getNumber(record, 'volume') ||
        getNumber(record, 'deal_value') ||
        getNumber(record, 'value') ||
        getNumber(record, 'amount')

      return {
        id: getString(record, 'id'),
        date: getString(record, 'date') || getString(record, 'created_at'),
        clientName: getString(record, 'customer_full_name') || getString(record, 'insured_name') || getString(record, 'client_name'),
        phone: getString(record, 'phone') || getString(record, 'customer_phone') || getString(record, 'client_phone_number'),
        opportunityValue,
        stage: mapStatusToStage(getString(record, 'status')),
        state: resolvePipelineState(record),
        sourceType: resolvePipelineSourceType(record),
        publisher: getString(record, 'lead_vendor') || getString(record, 'publisher')
      }
    })
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load transfers'
    transfers.value = []
  } finally {
    loading.value = false
  }
}

const viewLead = (leadId: string) => {
  router.push({
    path: `/retainers/${leadId}`,
    query: { from: route.fullPath }
  })
}

watch(dbStages, (newStages) => {
  if (newStages.length > 0) {
    void loadTransfers()
  }
})

onMounted(() => {
  loadTransfers()
  setTimeout(() => { boardReady.value = true }, 800)
})

/* ═══════════════════════════════════════════════════════════
   UI ENHANCEMENTS — stage colors, DnD, animations, helpers
   ═══════════════════════════════════════════════════════════ */

const STAGE_COLORS = [
  { accent: '#3b82f6', rgb: '59,130,246' },
  { accent: '#f59e0b', rgb: '245,158,11' },
  { accent: '#22c55e', rgb: '34,197,94' },
  { accent: '#ef4444', rgb: '239,68,68' },
  { accent: '#ae4010', rgb: '174,64,16' },
  { accent: '#8b5cf6', rgb: '139,92,246' },
  { accent: '#06b6d4', rgb: '6,182,212' },
  { accent: '#ec4899', rgb: '236,72,153' },
  { accent: '#14b8a6', rgb: '20,184,166' },
]

const STAGE_COLOR_MAP: Record<string, { accent: string, rgb: string }> = {
  returned_to_center_dq: { accent: '#ef4444', rgb: '239,68,68' },
  previously_sold_bpo: { accent: '#ef4444', rgb: '239,68,68' },
}

const STAGE_ICON_MAP: Record<string, string> = {
  transfer_api: 'i-lucide-zap',
  incomplete_transfer: 'i-lucide-alert-circle',
  returned_to_center_dq: 'i-lucide-undo-2',
  previously_sold_bpo: 'i-lucide-badge-check',
  needs_bpo_callback: 'i-lucide-phone-call',
  pending_information: 'i-lucide-info',
  pending_approval: 'i-lucide-file-check',
  document_signed_api: 'i-lucide-file-signature',
  application_withdrawn: 'i-lucide-x-circle',
}

const getStageColor = (key: string, index: number) => STAGE_COLOR_MAP[key] || STAGE_COLORS[index % STAGE_COLORS.length]
const getStageIcon = (key: string, index: number) => STAGE_ICON_MAP[key] || ['i-lucide-circle-dot', 'i-lucide-clock', 'i-lucide-check-circle', 'i-lucide-alert-triangle', 'i-lucide-flame', 'i-lucide-star', 'i-lucide-shield-check', 'i-lucide-heart', 'i-lucide-zap'][index % 9]

const newTransfersCount = computed(() =>
  filteredLeads.value.filter(t => t.stage === 'transfer_api').length
)

const needsFollowUpCount = computed(() =>
  filteredLeads.value.filter(t =>
    ['incomplete_transfer', 'needs_bpo_callback', 'pending_information'].includes(t.stage)
  ).length
)

const returnedDQCount = computed(() =>
  filteredLeads.value.filter(t => t.stage.startsWith('returned_to_center')).length
)

const summaryCards = computed(() => [
  {
    label: 'Total Transfers', value: totalTransfersCount.value, icon: 'i-lucide-arrow-right-left',
    accent: '#ae4010', light: '#e8763c', rgb: '174,64,16', delay: 0,
    stages: ['All active transfer stages after filters are applied']
  },
  {
    label: 'New Transfers', value: newTransfersCount.value, icon: 'i-lucide-zap',
    accent: '#3b82f6', light: '#60a5fa', rgb: '59,130,246', delay: 60,
    stages: ['Transfer API']
  },
  {
    label: 'Needs Follow-Up', value: needsFollowUpCount.value, icon: 'i-lucide-phone-call',
    accent: '#f59e0b', light: '#fcd34d', rgb: '245,158,11', delay: 120,
    stages: ['Incomplete Transfer', 'Needs BPO Callback', 'Internal Callback']
  },
  {
    label: 'Returned / DQ', value: returnedDQCount.value, icon: 'i-lucide-undo-2',
    accent: '#ef4444', light: '#fca5a5', rgb: '239,68,68', delay: 180,
    stages: ['Returned To Center - DQ']
  },
])

const hasActiveFilters = computed(() => activeFilterCount.value > 0 || query.value.trim() !== '')

const resetFilters = () => {
  query.value = ''
  selectedStage.value = ALL_FILTER_VALUE
  selectedSourceType.value = ALL_FILTER_VALUE
  selectedStates.value = []
  selectedDateRange.value = 'all'
  customStartDate.value = ''
  customEndDate.value = ''
  filterCaseCategory.value = []
  filterInjurySeverity.value = []
  filterInsuranceStatus.value = []
  filterLiabilityStatus.value = []
  filterMedicalTreatment.value = []
  filterLanguage.value = []
  filterExpiry.value = 'all'
  page.value = 1
}

const multiSelectUi = {
  value: 'truncate whitespace-nowrap overflow-hidden',
  item: 'group',
  itemTrailingIcon: 'hidden',
  content: 'w-max min-w-[var(--reka-select-trigger-width)]'
}

const singleSelectUi = {
  content: 'w-max min-w-[var(--reka-select-trigger-width)]'
}

const CASE_CATEGORY_OPTIONS = [
  { label: 'Consumer Cases', value: 'Consumer Cases' },
  { label: 'Commercial Cases', value: 'Commercial Cases' }
]

const INJURY_SEVERITY_OPTIONS = [
  { label: 'Minor', value: 'minor' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Severe', value: 'severe' }
]

const INSURANCE_STATUS_OPTIONS = [
  { label: 'Insured only', value: 'insured_only' },
  { label: 'Uninsured acceptable', value: 'uninsured_ok' }
]

const LIABILITY_STATUS_OPTIONS = [
  { label: 'Clear liability only', value: 'clear_only' },
  { label: 'Disputed acceptable', value: 'disputed_ok' }
]

const MEDICAL_TREATMENT_OPTIONS = [
  { label: 'No medical', value: 'no_medical' },
  { label: 'Ongoing', value: 'ongoing' },
  { label: 'Proof of medical treatment', value: 'proof_of_medical_treatment' }
]

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'English' },
  { label: 'Spanish', value: 'Spanish' }
]

const EXPIRY_OPTIONS = [
  { label: 'Any expiry', value: 'all' },
  { label: 'Next 30 days', value: '30' },
  { label: 'Next 60 days', value: '60' },
  { label: 'Next 90 days', value: '90' },
  { label: 'No expiry date', value: 'no_expiry' }
]

const customDateLabel = computed(() => {
  if (customStartDate.value && customEndDate.value) {
    return `${fmtShort(customStartDate.value)} – ${fmtShort(customEndDate.value)}`
  }
  if (customStartDate.value) return `From ${fmtShort(customStartDate.value)}`
  if (customEndDate.value) return `Until ${fmtShort(customEndDate.value)}`
  return 'Pick dates'
})

const fmtShort = (d: string) => {
  try { return new Date(d + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  catch { return d }
}

const fmtDate = (d: string) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return d }
}

const boardReady = ref(false)

// ── Drag & Drop ──

const draggedLead = ref<TransferLead | null>(null)
const dragOverStage = ref('')

const onDragStart = (e: DragEvent, lead: TransferLead) => {
  if (!e.dataTransfer) return
  draggedLead.value = lead
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', lead.id)

  const target = e.currentTarget as HTMLElement
  const ghost = target.cloneNode(true) as HTMLElement
  Object.assign(ghost.style, {
    position: 'absolute', top: '-9999px', left: '-9999px',
    width: target.offsetWidth + 'px',
    transform: 'rotate(2deg) scale(1.04)', opacity: '0.92',
    boxShadow: '0 12px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.12)',
    borderRadius: '10px', pointerEvents: 'none',
  })
  document.body.appendChild(ghost)
  e.dataTransfer.setDragImage(ghost, target.offsetWidth / 2, 20)
  setTimeout(() => { if (document.body.contains(ghost)) document.body.removeChild(ghost) }, 0)

  requestAnimationFrame(() => {
    target.style.opacity = '0.4'
    target.style.transform = 'scale(0.97)'
  })
}

const onDragEnd = (e: DragEvent) => {
  const target = e.currentTarget as HTMLElement
  target.style.opacity = ''
  target.style.transform = ''
  draggedLead.value = null
  dragOverStage.value = ''
}

const onColumnDragOver = (e: DragEvent, stageKey: string) => {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverStage.value = stageKey
}

const onColumnDragLeave = (e: DragEvent, stageKey: string) => {
  const related = e.relatedTarget as HTMLElement | null
  const current = e.currentTarget as HTMLElement
  if (related && current.contains(related)) return
  if (dragOverStage.value === stageKey) dragOverStage.value = ''
}

const onColumnDrop = async (e: DragEvent, stageKey: string) => {
  e.preventDefault()
  dragOverStage.value = ''
  if (!draggedLead.value) return

  const lead = draggedLead.value
  if (lead.stage === stageKey) return

  const oldStage = lead.stage
  const idx = transfers.value.findIndex(t => t.id === lead.id)
  if (idx !== -1) transfers.value[idx] = { ...transfers.value[idx], stage: stageKey }

  try {
    const { error } = await supabase.from('leads').update({ status: stageKey }).eq('id', lead.id)
    if (error) throw error
    try { const toast = useToast(); toast.add({ title: 'Moved', description: `Moved to ${getStageLabel(stageKey)}` }) } catch { /* */ }
  } catch {
    if (idx !== -1) transfers.value[idx] = { ...transfers.value[idx], stage: oldStage }
    try { const toast = useToast(); toast.add({ title: 'Error', description: 'Failed to move transfer', color: 'error' }) } catch { /* */ }
  }
}

const showingStart = computed(() => Math.min((page.value - 1) * PAGE_SIZE + 1, filteredLeads.value.length))
const showingEnd = computed(() => Math.min(page.value * PAGE_SIZE, filteredLeads.value.length))

// Keep columns reference to avoid unused-import lint warnings
void columns
void stageOptions.value
void sourceTypeOptions.value
</script>

<template>
  <UDashboardPanel id="transfers">
    <template #header>
      <UDashboardNavbar title="Transfer Pipeline">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="ap-page flex h-full min-h-0 flex-col" style="gap: 20px;">
        <!-- ═══ SUMMARY CARDS ═══ -->
        <div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="card in summaryCards"
            :key="card.label"
            class="ap-summary-card dashboard-fade-up group"
            :style="{
              '--dashboard-enter-delay': card.delay + 'ms',
              '--card-accent': card.accent,
              '--card-light': card.light,
              '--card-rgb': card.rgb,
              borderLeftColor: card.accent,
            }"
          >
            <div class="flex items-center justify-between px-5 py-4">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <div class="ap-card-label">{{ card.label }}</div>
                  <UPopover mode="hover" :open-delay="100" :close-delay="120" :content="{ side: 'top', align: 'start', sideOffset: 8 }">
                    <button type="button" class="shrink-0 opacity-35 transition-opacity hover:opacity-70" tabindex="-1">
                      <UIcon name="i-lucide-circle-help" class="size-3" />
                    </button>
                    <template #content>
                      <div class="w-56 p-3">
                        <div class="mb-2 text-[10px] font-semibold uppercase tracking-widest" style="color: var(--dashboard-text-muted);">Connected Stages</div>
                        <ul class="space-y-1">
                          <li v-for="stage in card.stages" :key="stage" class="flex items-center gap-1.5">
                            <span class="size-1.5 shrink-0 rounded-full" :style="{ background: card.accent }" />
                            <span class="text-xs" style="color: var(--dashboard-text-primary);">{{ stage }}</span>
                          </li>
                        </ul>
                      </div>
                    </template>
                  </UPopover>
                </div>
                <div class="ap-card-value">{{ card.value }}</div>
              </div>
              <div
                class="flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105"
                :style="{ background: `rgba(${card.rgb}, 0.12)` }"
              >
                <UIcon :name="card.icon" class="size-5" :style="{ color: card.light }" />
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ TOOLBAR CARD ═══ -->
        <div
          class="dashboard-surface-card dashboard-fade-up"
          :style="{ '--dashboard-enter-delay': '180ms', '--dashboard-surface-glow': 'transparent' }"
        >
          <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <!-- Left side -->
            <div class="flex flex-wrap items-center gap-3">
              <UInput
                v-model="query"
                class="ap-search-input"
                icon="i-lucide-search"
                size="sm"
                placeholder="Search by name, phone, publisher..."
              />

              <USelect
                v-if="selectedDateRange !== 'custom'"
                v-model="selectedDateRange"
                :items="PIPELINE_DATE_RANGE_OPTIONS"
                value-key="value"
                label-key="label"
                size="sm"
                class="w-36"
              />

              <UPopover v-else :ui="{ content: 'rounded-xl border border-[var(--dashboard-surface-border)] shadow-2xl backdrop-blur-xl bg-[var(--dashboard-surface)]' }">
                <UButton variant="outline" color="neutral" size="sm">
                  <UIcon name="i-lucide-calendar-range" class="size-4" />
                  <span class="text-xs">{{ customDateLabel }}</span>
                </UButton>
                <template #content>
                  <div class="flex min-w-[380px]">
                    <div class="space-y-1 border-r border-[var(--dashboard-divider)] p-3">
                      <div class="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dashboard-text-soft)]">
                        Quick ranges
                      </div>
                      <button
                        v-for="preset in [
                          { label: 'Today', value: 'today' as PipelineDateRange },
                          { label: 'This Week', value: 'this_week' as PipelineDateRange },
                          { label: 'Last Week', value: 'last_week' as PipelineDateRange },
                          { label: 'This Month', value: 'this_month' as PipelineDateRange },
                          { label: 'All Time', value: 'all' as PipelineDateRange },
                        ]"
                        :key="preset.value"
                        class="block w-full rounded-lg px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--ap-accent-soft)]"
                        :style="{ color: 'var(--dashboard-text-secondary)' }"
                        @click="selectedDateRange = preset.value; customStartDate = ''; customEndDate = ''"
                      >
                        {{ preset.label }}
                      </button>
                    </div>
                    <div class="space-y-3 p-4">
                      <div>
                        <div class="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dashboard-text-soft)]">
                          Start
                        </div>
                        <UInput v-model="customStartDate" type="date" size="sm" />
                      </div>
                      <div>
                        <div class="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--dashboard-text-soft)]">
                          End
                        </div>
                        <UInput v-model="customEndDate" type="date" size="sm" />
                      </div>
                    </div>
                  </div>
                </template>
              </UPopover>
            </div>

            <!-- Right side -->
            <div class="flex items-center gap-3">
              <span class="text-xs tabular-nums text-[var(--dashboard-text-muted)]">
                {{ filteredLeads.length }} total
              </span>

              <UButton
                color="neutral"
                :variant="filtersOpen ? 'soft' : 'outline'"
                size="sm"
                :icon="filtersOpen ? 'i-lucide-panel-top-close' : 'i-lucide-sliders-horizontal'"
                @click="filtersOpen = !filtersOpen"
              >
                {{ filtersOpen ? 'Hide Filters' : 'Filters' }}
                <span
                  v-if="activeFilterCount > 0"
                  class="ml-1.5 flex size-4.5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  :style="{ background: 'var(--ap-accent)' }"
                >
                  {{ activeFilterCount }}
                </span>
              </UButton>

              <UButton
                v-if="hasActiveFilters"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-rotate-ccw"
                @click="resetFilters"
              >
                Reset all
              </UButton>

              <!-- View Toggle -->
              <div class="ap-segment-control">
                <button
                  v-for="mode in (['kanban', 'list'] as const)"
                  :key="mode"
                  type="button"
                  class="ap-segment-btn"
                  :class="{ 'is-active': viewMode === mode }"
                  @click="viewMode = mode"
                >
                  <UIcon
                    :name="mode === 'kanban' ? 'i-lucide-columns-3' : 'i-lucide-list'"
                    class="size-3.5"
                  />
                  {{ mode === 'kanban' ? 'Board' : 'List' }}
                </button>
              </div>

              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-lucide-refresh-cw"
                :loading="loading"
                @click="handleRefresh"
              />
            </div>
          </div>

          <!-- ═══ EXPANDABLE FILTER AREA ═══ -->
          <div class="ap-filter-collapse" :class="{ 'is-open': filtersOpen }">
            <div class="ap-filter-inner">
              <div class="border-t border-[var(--dashboard-divider)] px-5 py-4">
                <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                  <!-- State -->
                  <div>
                    <div class="ap-filter-label">
                      State
                    </div>
                    <USelectMenu
                      v-model="selectedStates"
                      :items="stateOptions"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="All States"
                      size="sm"
                      class="w-full"
                      :search-input="{ placeholder: 'Search states...' }"
                      :ui="multiSelectUi"
                    />
                  </div>

                  <!-- Case Category -->
                  <div>
                    <div class="ap-filter-label">
                      Case Category
                    </div>
                    <USelectMenu
                      v-model="filterCaseCategory"
                      :items="CASE_CATEGORY_OPTIONS"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="All categories"
                      size="sm"
                      class="w-full"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                          <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                        </span>
                      </template>
                    </USelectMenu>
                  </div>

                  <!-- Injury Severity -->
                  <div>
                    <div class="ap-filter-label">
                      Injury Severity
                    </div>
                    <USelectMenu
                      v-model="filterInjurySeverity"
                      :items="INJURY_SEVERITY_OPTIONS"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="All severities"
                      size="sm"
                      class="w-full"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                          <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                        </span>
                      </template>
                    </USelectMenu>
                  </div>

                  <!-- Insurance Status -->
                  <div>
                    <div class="ap-filter-label">
                      Insurance Status
                    </div>
                    <USelectMenu
                      v-model="filterInsuranceStatus"
                      :items="INSURANCE_STATUS_OPTIONS"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="Any"
                      size="sm"
                      class="w-full"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                          <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                        </span>
                      </template>
                    </USelectMenu>
                  </div>

                  <!-- Liability Status -->
                  <div>
                    <div class="ap-filter-label">
                      Liability Status
                    </div>
                    <USelectMenu
                      v-model="filterLiabilityStatus"
                      :items="LIABILITY_STATUS_OPTIONS"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="Any"
                      size="sm"
                      class="w-full"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                          <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                        </span>
                      </template>
                    </USelectMenu>
                  </div>

                  <!-- Medical Treatment -->
                  <div>
                    <div class="ap-filter-label">
                      Medical Treatment
                    </div>
                    <USelectMenu
                      v-model="filterMedicalTreatment"
                      :items="MEDICAL_TREATMENT_OPTIONS"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="Any"
                      size="sm"
                      class="w-full"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                          <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                        </span>
                      </template>
                    </USelectMenu>
                  </div>

                  <!-- Language -->
                  <div>
                    <div class="ap-filter-label">
                      Language
                    </div>
                    <USelectMenu
                      v-model="filterLanguage"
                      :items="LANGUAGE_OPTIONS"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="Any language"
                      size="sm"
                      class="w-full"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                          <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                        </span>
                      </template>
                    </USelectMenu>
                  </div>

                  <!-- Expiration -->
                  <div>
                    <div class="ap-filter-label">
                      Expiration
                    </div>
                    <USelect
                      v-model="filterExpiry"
                      :items="EXPIRY_OPTIONS"
                      value-key="value"
                      label-key="label"
                      size="sm"
                      class="w-full"
                      :ui="singleSelectUi"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ ERROR STATE ═══ -->
        <div
          v-if="loadError && !loading"
          class="dashboard-surface-card dashboard-fade-up flex items-center gap-3 border-l-4 px-5 py-4"
          :style="{ borderLeftColor: '#ef4444', '--dashboard-enter-delay': '240ms' }"
        >
          <div class="flex size-9 items-center justify-center rounded-lg" style="background: rgba(239,68,68,0.1);">
            <UIcon name="i-lucide-triangle-alert" class="size-4.5" style="color: #ef4444;" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold" style="color: var(--dashboard-text-primary);">
              Unable to load transfers
            </div>
            <div class="mt-0.5 truncate text-xs" style="color: var(--dashboard-text-muted);">
              {{ loadError }}
            </div>
          </div>
          <UButton
            color="neutral"
            variant="outline"
            size="xs"
            @click="handleRefresh"
          >
            Retry
          </UButton>
        </div>

        <!-- ═══ LOADING STATE ═══ -->
        <div
          v-if="loading"
          class="flex flex-1 items-center justify-center"
        >
          <div class="flex flex-col items-center gap-3">
            <UIcon
              name="i-lucide-loader-2"
              class="size-8 animate-spin"
              style="color: var(--ap-accent);"
            />
            <span class="text-sm" style="color: var(--dashboard-text-muted);">Loading transfers...</span>
          </div>
        </div>

        <!-- ═══ EMPTY STATE ═══ -->
        <div
          v-else-if="!loading && filteredLeads.length === 0 && !loadError"
          class="flex flex-1 items-center justify-center"
        >
          <div class="flex flex-col items-center gap-3 text-center">
            <div
              class="flex size-14 items-center justify-center rounded-2xl"
              style="background: var(--ap-accent-soft);"
            >
              <UIcon name="i-lucide-arrow-right-left" class="size-7" style="color: var(--ap-accent);" />
            </div>
            <div class="text-sm font-semibold" style="color: var(--dashboard-text-primary);">
              No transfers yet
            </div>
            <div class="max-w-xs text-xs" style="color: var(--dashboard-text-muted);">
              Transfers will appear here once leads enter the transfer pipeline.
            </div>
          </div>
        </div>

        <!-- ═══ KANBAN BOARD ═══ -->
        <div
          v-else-if="viewMode === 'kanban' && !loading"
          class="dashboard-fade-up min-h-0 flex-1"
          :class="boardReady ? 'overflow-hidden' : 'overflow-hidden'"
          :style="{ '--dashboard-enter-delay': '280ms' }"
        >
          <div class="ap-board-scroll flex h-full min-h-0 items-stretch gap-4 pb-2 pr-2">
            <!-- Column per stage -->
            <div
              v-for="(stage, stageIdx) in STAGES"
              :key="stage.key"
              class="ap-column flex h-full shrink-0 flex-col"
              :class="{ 'ap-column-dragover': dragOverStage === stage.key && draggedLead?.stage !== stage.key }"
              :style="{
                '--ap-col-accent': getStageColor(stage.key, stageIdx).accent,
                '--ap-col-accent-rgb': getStageColor(stage.key, stageIdx).rgb,
                minWidth: '280px',
                width: STAGES.length <= 4 ? `${100 / STAGES.length}%` : '320px',
              }"
              @dragover="onColumnDragOver($event, stage.key)"
              @dragleave="onColumnDragLeave($event, stage.key)"
              @drop="onColumnDrop($event, stage.key)"
            >
              <!-- Column Header -->
              <div
                class="ap-column-header flex items-center gap-2.5 rounded-t-xl border-b border-[var(--dashboard-divider)] px-3.5 py-2.5"
                :style="{
                  background: `rgba(${getStageColor(stage.key, stageIdx).rgb}, 0.06)`,
                }"
              >
                <div
                  class="flex size-7 items-center justify-center rounded-lg"
                  :style="{ background: `rgba(${getStageColor(stage.key, stageIdx).rgb}, 0.15)` }"
                >
                  <UIcon
                    :name="getStageIcon(stage.key, stageIdx)"
                    class="size-3.5"
                    :style="{ color: getStageColor(stage.key, stageIdx).accent }"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span class="truncate text-[13px] font-semibold" style="color: var(--dashboard-text-primary);">
                      {{ stage.label }}
                    </span>
                    <UPopover
                      mode="hover"
                      arrow
                      :open-delay="100"
                      :close-delay="120"
                      :content="{ side: 'top', align: 'start', sideOffset: 8 }"
                    >
                      <button type="button" class="shrink-0 rounded-full p-0.5 opacity-40 transition-opacity hover:opacity-80" tabindex="-1">
                        <UIcon name="i-lucide-circle-help" class="size-3.5" />
                      </button>
                      <template #content>
                        <div class="max-w-72 p-3">
                          <div class="text-sm font-semibold" style="color: var(--dashboard-text-primary);">
                            {{ stage.label }}
                          </div>
                          <p class="mt-1 text-xs leading-5" style="color: var(--dashboard-text-muted);">
                            {{ stage.description }}
                          </p>
                        </div>
                      </template>
                    </UPopover>
                  </div>
                </div>
                <span
                  class="flex size-5.5 items-center justify-center rounded-md text-[11px] font-bold tabular-nums"
                  :style="{
                    background: `rgba(${getStageColor(stage.key, stageIdx).rgb}, 0.12)`,
                    color: getStageColor(stage.key, stageIdx).accent,
                  }"
                >
                  {{ leadsByStage.get(stage.key)?.length ?? 0 }}
                </span>
              </div>

              <!-- Cards Area -->
              <div class="ap-scroll flex-1 space-y-2 overflow-y-auto p-2">
                <div
                  v-for="lead in (leadsByStage.get(stage.key) ?? [])"
                  :key="lead.id"
                  class="ap-kanban-card"
                  draggable="true"
                  tabindex="0"
                  @dragstart="onDragStart($event, lead)"
                  @dragend="onDragEnd"
                  @keydown.enter="viewLead(lead.id)"
                >
                  <!-- Top row: name + CTA -->
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <div class="ap-card-title truncate text-[13px] font-semibold" style="color: var(--dashboard-text-primary);">
                        {{ lead.clientName || '—' }}
                      </div>
                      <div class="mt-0.5 text-[11px]" style="color: var(--dashboard-text-muted);">
                        {{ lead.phone || '—' }}
                      </div>
                    </div>
                    <button
                      class="ap-card-cta flex size-6 shrink-0 items-center justify-center rounded-md transition-all duration-200"
                      :style="{ background: `rgba(${getStageColor(stage.key, stageIdx).rgb}, 0.1)` }"
                      tabindex="-1"
                      @click.stop="viewLead(lead.id)"
                    >
                      <UIcon name="i-lucide-eye" class="size-3" :style="{ color: getStageColor(stage.key, stageIdx).accent }" />
                    </button>
                  </div>

                  <!-- Middle row: publisher + date -->
                  <div class="mt-2.5 flex items-center justify-between gap-2">
                    <span
                      class="max-w-[60%] truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                      :style="{
                        background: `rgba(${getStageColor(stage.key, stageIdx).rgb}, 0.08)`,
                        color: getStageColor(stage.key, stageIdx).accent,
                      }"
                    >
                      {{ lead.publisher || '—' }}
                    </span>
                    <span class="text-[10px] tabular-nums" style="color: var(--dashboard-text-soft);">
                      {{ fmtDate(lead.date) }}
                    </span>
                  </div>

                  <!-- Bottom row: volume + state -->
                  <div class="mt-2 flex items-center justify-between gap-2">
                    <span
                      v-if="lead.opportunityValue"
                      class="text-xs font-semibold tabular-nums"
                      style="color: var(--dashboard-text-primary);"
                    >
                      {{ formatMoney(lead.opportunityValue) }}
                    </span>
                    <span v-else />
                    <span
                      v-if="lead.state"
                      class="text-[10px]"
                      style="color: var(--dashboard-text-soft);"
                    >
                      {{ lead.state }}
                    </span>
                  </div>
                </div>

                <!-- Empty column -->
                <div
                  v-if="(leadsByStage.get(stage.key)?.length ?? 0) === 0"
                  class="ap-empty-column"
                >
                  <UIcon name="i-lucide-inbox" class="mx-auto mb-1.5 size-5 opacity-40" />
                  <div>No transfers in this stage</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ LIST VIEW ═══ -->
        <div
          v-else-if="viewMode === 'list' && !loading"
          class="dashboard-fade-up min-h-0 flex-1 flex flex-col"
          :style="{ '--dashboard-enter-delay': '280ms' }"
        >
          <div class="dashboard-surface-card flex min-h-0 flex-1 flex-col overflow-hidden">
            <div class="ap-scroll min-h-0 flex-1 overflow-auto">
              <table class="ap-table w-full">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Phone</th>
                    <th>Stage</th>
                    <th class="text-right">
                      Volume
                    </th>
                    <th>Publisher</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="lead in pagedRows"
                    :key="lead.id"
                    class="ap-table-row"
                    tabindex="0"
                    @click="viewLead(lead.id)"
                    @keydown.enter="viewLead(lead.id)"
                  >
                    <td class="tabular-nums">
                      {{ fmtDate(lead.date) }}
                    </td>
                    <td class="font-medium" style="color: var(--dashboard-text-primary);">
                      {{ lead.clientName || '—' }}
                    </td>
                    <td>{{ lead.phone || '—' }}</td>
                    <td>
                      <span
                        class="ap-status-pill"
                        :style="{
                          '--pill-accent': getStageColor(lead.stage, STAGES.findIndex(s => s.key === lead.stage)).accent,
                          '--pill-rgb': getStageColor(lead.stage, STAGES.findIndex(s => s.key === lead.stage)).rgb,
                        }"
                      >
                        {{ getStageLabel(lead.stage) }}
                      </span>
                    </td>
                    <td class="text-right font-semibold tabular-nums" style="color: var(--dashboard-text-primary);">
                      {{ formatMoney(lead.opportunityValue) }}
                    </td>
                    <td>{{ lead.publisher || '—' }}</td>
                  </tr>
                  <tr v-if="pagedRows.length === 0">
                    <td colspan="6" class="py-12 text-center text-sm" style="color: var(--dashboard-text-muted);">
                      No transfers match your filters
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Pagination Footer -->
            <div class="ap-pagination-footer">
              <span class="text-xs tabular-nums" style="color: var(--dashboard-text-muted);">
                Showing {{ showingStart }}–{{ showingEnd }} of {{ filteredLeads.length }}
              </span>
              <div class="flex items-center gap-1.5">
                <button
                  class="ap-page-btn"
                  :disabled="page <= 1"
                  @click="page = Math.max(1, page - 1)"
                >
                  <UIcon name="i-lucide-chevron-left" class="size-3.5" />
                  <span>Prev</span>
                </button>
                <span class="ap-page-pill">{{ page }}</span>
                <button
                  class="ap-page-btn"
                  :disabled="page >= pageCount"
                  @click="page = Math.min(pageCount, page + 1)"
                >
                  <span>Next</span>
                  <UIcon name="i-lucide-chevron-right" class="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* ═══════════════════════════════════════════════
   SUMMARY CARDS
   ═══════════════════════════════════════════════ */
.ap-summary-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--dashboard-surface-border);
  border-left: 3px solid var(--card-accent, var(--ap-accent));
  border-radius: 1rem;
  background: var(--dashboard-surface);
  box-shadow: var(--dashboard-surface-shadow);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: box-shadow 300ms ease, transform 300ms ease;
}

.ap-summary-card:hover {
  box-shadow: var(--dashboard-surface-shadow-hover);
}

.ap-card-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--card-light, var(--ap-accent));
}

.ap-card-value {
  margin-top: 6px;
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--dashboard-text-primary);
}

/* ═══════════════════════════════════════════════
   SEARCH INPUT
   ═══════════════════════════════════════════════ */
.ap-search-input {
  max-width: 20rem;
}

/* ═══════════════════════════════════════════════
   SEGMENT CONTROL (Board / List toggle)
   ═══════════════════════════════════════════════ */
.ap-segment-control {
  display: inline-flex;
  border-radius: 0.625rem;
  border: 1px solid var(--dashboard-surface-border);
  background: var(--dashboard-surface);
  padding: 2px;
  gap: 2px;
}

.ap-segment-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 0.5rem;
  font-size: 12px;
  font-weight: 500;
  color: var(--dashboard-text-muted);
  transition: all 180ms ease;
  cursor: pointer;
  border: none;
  background: transparent;
}

.ap-segment-btn:hover:not(.is-active) {
  background: rgba(var(--ap-col-accent-rgb, 174, 64, 16), 0.06);
  color: var(--dashboard-text-secondary);
}

.ap-segment-btn.is-active {
  background: var(--ap-accent);
  color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

/* ═══════════════════════════════════════════════
   FILTER COLLAPSE ANIMATION
   ═══════════════════════════════════════════════ */
.ap-filter-collapse {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 350ms cubic-bezier(0.16, 1, 0.3, 1);
}

.ap-filter-collapse.is-open {
  grid-template-rows: 1fr;
}

.ap-filter-inner {
  overflow: hidden;
}

.ap-filter-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--dashboard-text-soft);
  margin-bottom: 6px;
}

/* ═══════════════════════════════════════════════
   KANBAN BOARD
   ═══════════════════════════════════════════════ */
.ap-board-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--ap-col-accent-rgb, 128, 128, 128), 0.25) transparent;
}

.ap-board-scroll::-webkit-scrollbar {
  height: 4px;
}

.ap-board-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.ap-board-scroll::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.25);
  border-radius: 4px;
}

/* ═══════════════════════════════════════════════
   KANBAN COLUMN
   ═══════════════════════════════════════════════ */
.ap-column {
  border-radius: 0.75rem;
  border: 1px solid var(--dashboard-surface-border);
  background: var(--dashboard-surface);
  box-shadow: var(--dashboard-surface-shadow);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: border-color 200ms ease, box-shadow 200ms ease;
}

.ap-column-dragover {
  border-color: rgba(var(--ap-col-accent-rgb), 0.45) !important;
  border-style: dashed !important;
  box-shadow: 0 0 0 2px rgba(var(--ap-col-accent-rgb), 0.10), var(--dashboard-surface-shadow);
}

/* ═══════════════════════════════════════════════
   KANBAN CARDS
   ═══════════════════════════════════════════════ */
.ap-kanban-card {
  min-height: 108px;
  padding: 12px 14px;
  border-radius: 0.5rem;
  border: 1px solid var(--dashboard-surface-border);
  background: var(--dashboard-surface);
  cursor: grab;
  transition: all 200ms ease;
  position: relative;
}

.ap-kanban-card:hover {
  border-color: rgba(var(--ap-col-accent-rgb), 0.24);
  background: rgba(var(--ap-col-accent-rgb), 0.04);
  box-shadow: 0 2px 8px rgba(var(--ap-col-accent-rgb), 0.08);
}

.ap-kanban-card:hover .ap-card-title {
  color: var(--ap-col-accent) !important;
}

.ap-kanban-card:hover .ap-card-cta {
  opacity: 1 !important;
}

.ap-kanban-card:focus-visible {
  outline: 2px solid var(--ap-col-accent);
  outline-offset: 1px;
}

.ap-card-cta {
  opacity: 0;
}

.ap-kanban-card:active {
  cursor: grabbing;
}

/* Dragging state applied via JS */
.ap-kanban-card[style*="opacity: 0.4"] {
  filter: grayscale(0.3);
}

/* ═══════════════════════════════════════════════
   EMPTY COLUMN
   ═══════════════════════════════════════════════ */
.ap-empty-column {
  border: 1px dashed var(--dashboard-surface-border-strong);
  border-radius: 0.5rem;
  padding: 24px 12px;
  text-align: center;
  font-size: 11px;
  color: var(--dashboard-text-soft);
}

/* ═══════════════════════════════════════════════
   SLIM SCROLLBARS (card areas)
   ═══════════════════════════════════════════════ */
.ap-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(128, 128, 128, 0.2) transparent;
}

.ap-scroll::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.ap-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.ap-scroll::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.2);
  border-radius: 4px;
}

.ap-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(128, 128, 128, 0.35);
}

/* ═══════════════════════════════════════════════
   LIST TABLE
   ═══════════════════════════════════════════════ */
.ap-table {
  border-collapse: collapse;
}

.ap-table thead {
  position: sticky;
  top: 0;
  z-index: 2;
}

.ap-table th {
  padding: 10px 16px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--dashboard-text-soft);
  background: var(--dashboard-surface-strong);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--dashboard-divider);
  white-space: nowrap;
  text-align: left;
}

.ap-table td {
  padding: 10px 16px;
  font-size: 13px;
  color: var(--dashboard-text-secondary);
  border-bottom: 1px solid var(--dashboard-divider);
  white-space: nowrap;
}

.ap-table-row {
  cursor: pointer;
  transition: background 150ms ease;
}

.ap-table-row:hover {
  background: rgba(var(--ap-col-accent-rgb, 174, 64, 16), 0.04);
}

.ap-table-row:focus-visible {
  outline: 2px solid var(--ap-accent);
  outline-offset: -2px;
}

/* ═══════════════════════════════════════════════
   STATUS PILL
   ═══════════════════════════════════════════════ */
.ap-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(var(--pill-rgb, 128, 128, 128), 0.12);
  color: var(--pill-accent, var(--dashboard-text-secondary));
  white-space: nowrap;
}

/* ═══════════════════════════════════════════════
   PAGINATION FOOTER
   ═══════════════════════════════════════════════ */
.ap-pagination-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid var(--dashboard-divider);
  background: var(--dashboard-surface-strong);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.ap-page-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 0.5rem;
  border: 1px solid var(--dashboard-surface-border);
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--dashboard-text-secondary);
  cursor: pointer;
  transition: all 150ms ease;
}

.ap-page-btn:hover:not(:disabled) {
  background: rgba(var(--ap-col-accent-rgb, 174, 64, 16), 0.06);
  border-color: var(--dashboard-surface-border-strong);
}

.ap-page-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.ap-page-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border-radius: 0.5rem;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  background: var(--ap-accent-soft);
  color: var(--ap-accent);
}

/* ═══════════════════════════════════════════════
   REDUCED MOTION
   ═══════════════════════════════════════════════ */
@media (prefers-reduced-motion: reduce) {
  .ap-filter-collapse {
    transition: none;
  }

  .ap-kanban-card,
  .ap-segment-btn,
  .ap-table-row,
  .ap-page-btn,
  .ap-column {
    transition: none !important;
  }
}
</style>
