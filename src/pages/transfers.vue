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

const totalVolume = computed(() => filteredLeads.value.reduce((sum, t) => sum + t.opportunityValue, 0))

const avgVolume = computed(() => {
  return totalTransfersCount.value > 0 ? Math.round(totalVolume.value / totalTransfersCount.value) : 0
})

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

const loadTransfers = async () => {
  const stageKeys = dbStages.value.map(s => s.key)
  if (stageKeys.length === 0) return // wait for stages to load via watcher

  try {
    loading.value = true
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
  } catch {
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
})
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
      <div class="flex h-full min-h-0 flex-col">
        <div class="mb-4 grid gap-4 sm:grid-cols-3">
          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Total Transfers</p>
                <p class="text-2xl font-semibold">{{ totalTransfersCount }}</p>
              </div>
              <UIcon name="i-lucide-arrow-right-left" class="size-8 text-primary" />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Total Volume</p>
                <p class="text-2xl font-semibold">{{ formatMoney(totalVolume) }}</p>
              </div>
              <UIcon name="i-lucide-trending-up" class="size-8 text-primary" />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Avg Volume</p>
                <p class="text-2xl font-semibold">{{ formatMoney(avgVolume) }}</p>
              </div>
              <UIcon name="i-lucide-bar-chart" class="size-8 text-primary" />
            </div>
          </UCard>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <UInput
              v-model="query"
              class="max-w-md"
              icon="i-lucide-search"
              placeholder="Search by name, phone, publisher..."
            />

            <UButton
              color="neutral"
              :variant="filtersOpen || activeFilterCount > 0 ? 'solid' : 'outline'"
              icon="i-lucide-sliders-horizontal"
              @click="filtersOpen = !filtersOpen"
            >
              Filters
              <UBadge
                v-if="activeFilterCount > 0"
                variant="subtle"
                color="neutral"
                size="xs"
                class="ml-2"
                :label="String(activeFilterCount)"
              />
            </UButton>
          </div>

          <div class="flex items-center gap-3">
            <div class="inline-flex rounded-lg border border-default bg-white p-0.5 dark:bg-elevated/20">
              <button
                v-for="mode in ['kanban', 'list']"
                :key="mode"
                type="button"
                class="rounded-md px-3 py-1.5 text-sm font-medium transition"
                :class="viewMode === mode
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted hover:bg-muted/50'"
                @click="viewMode = mode as ViewMode"
              >
                {{ mode === 'kanban' ? 'Kanban View' : 'List View' }}
              </button>
            </div>

            <UBadge variant="subtle" :label="`${filteredLeads.length} transfers`" />

            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-refresh-cw"
              :loading="loading"
              @click="handleRefresh"
            >
              Refresh
            </UButton>
          </div>
        </div>

        <UCard
          v-if="filtersOpen"
          class="mt-4 border-primary/20"
          :ui="{ body: 'p-4 sm:p-5' }"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-sliders-horizontal" class="size-5 text-muted" />
              <div class="text-lg font-semibold">Filters</div>
            </div>

            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="filtersOpen = false"
            />
          </div>

          <div class="mt-4 grid gap-4 lg:grid-cols-4">
            <UFormField label="Date Range">
              <USelect
                v-model="selectedDateRange"
                :items="PIPELINE_DATE_RANGE_OPTIONS"
                value-key="value"
                label-key="label"
              />
            </UFormField>

            <UFormField label="Stage">
              <USelect
                v-model="selectedStage"
                :items="stageOptions"
                value-key="value"
                label-key="label"
              />
            </UFormField>

            <UFormField label="Source Type">
              <USelect
                v-model="selectedSourceType"
                :items="sourceTypeOptions"
                value-key="value"
                label-key="label"
              />
            </UFormField>

            <UFormField label="State">
              <USelectMenu
                v-model="selectedStates"
                :items="stateOptions"
                value-key="value"
                label-key="label"
                multiple
                placeholder="All States"
                :search-input="{ placeholder: 'Search states...' }"
              />
            </UFormField>
          </div>

          <div v-if="selectedDateRange === 'custom'" class="mt-4 grid gap-4 sm:grid-cols-2">
            <UFormField label="Start Date">
              <UInput v-model="customStartDate" type="date" />
            </UFormField>

            <UFormField label="End Date">
              <UInput v-model="customEndDate" type="date" />
            </UFormField>
          </div>
        </UCard>

        <div v-if="viewMode === 'kanban'" class="no-scrollbar mt-4 flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div
            class="flex h-full min-h-0 items-stretch gap-3 pr-2"
            :style="{ minWidth: `${STAGES.length * 18}rem` }"
          >
            <div
              v-for="stage in STAGES"
              :key="stage.key"
              class="flex h-full w-[26rem] shrink-0 flex-col rounded-lg border border-default bg-elevated/20"
            >
              <div class="flex items-center justify-between border-b border-default px-3 py-2">
                <div class="flex min-w-0 items-center gap-1.5">
                  <div class="truncate text-sm font-semibold">{{ stage.label }}</div>
                  <UPopover
                    mode="hover"
                    arrow
                    :open-delay="100"
                    :close-delay="120"
                    :content="{ side: 'top', align: 'start', sideOffset: 8 }"
                  >
                    <UButton
                      icon="i-lucide-circle-help"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      class="shrink-0"
                      :ui="{ base: 'rounded-full' }"
                    />
                    <template #content>
                      <div class="max-w-72 p-3">
                        <div class="text-sm font-semibold text-highlighted">{{ stage.label }}</div>
                        <p class="mt-1 text-xs leading-5 text-muted">{{ stage.description }}</p>
                      </div>
                    </template>
                  </UPopover>
                </div>
                <UBadge
                  variant="subtle"
                  :label="String(leadsByStage.get(stage.key)?.length ?? 0)"
                />
              </div>

              <div class="flex-1 space-y-2 overflow-y-auto p-2">
                <UCard
                  v-for="lead in (leadsByStage.get(stage.key) ?? [])"
                  :key="lead.id"
                  class="w-full"
                  :ui="{ body: '!p-2 sm:!p-2' }"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-sm font-semibold">{{ lead.clientName }}</div>
                      <div class="mt-0.5 text-xs text-muted">{{ lead.phone }}</div>
                    </div>
                    <div class="shrink-0">
                      <UButton
                        icon="i-lucide-eye"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        @click="viewLead(lead.id)"
                      />
                    </div>
                  </div>

                  <div class="mt-2 flex items-center justify-between gap-2">
                    <UBadge variant="subtle" :label="lead.publisher" size="xs" />
                    <div class="text-xs text-muted">{{ lead.date }}</div>
                  </div>
                </UCard>

                <div
                  v-if="(leadsByStage.get(stage.key)?.length ?? 0) === 0"
                  class="rounded-md border border-dashed border-default px-3 py-6 text-center text-xs text-muted"
                >
                  No leads
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="mt-4 flex-1">
          <UCard class="flex min-h-0 flex-1 flex-col" :ui="{ body: 'p-0 min-h-0 flex-1 flex flex-col' }">
            <div class="min-h-0 flex-1 overflow-auto">
              <UTable
                :loading="loading"
                :data="pagedRows"
                :columns="columns"
                :ui="{
                  base: 'w-full',
                  thead: '[&>tr]:bg-elevated/50',
                  tbody: '[&>tr]:hover:bg-muted/50',
                  th: 'px-4 py-3 text-left',
                  td: 'px-4 py-3'
                }"
              >
                <template #stage-cell="{ row }">
                  <UBadge variant="subtle" :label="getStageLabel(row.original.stage)" />
                </template>

                <template #opportunityValue-cell="{ row }">
                  <div class="font-semibold">{{ formatMoney(row.original.opportunityValue) }}</div>
                </template>
              </UTable>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default px-4 py-3">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="page <= 1"
                @click="page = Math.max(1, page - 1)"
              >
                Previous
              </UButton>

              <div class="text-sm text-muted">
                Page {{ page }} of {{ pageCount }}
              </div>

              <UButton
                color="neutral"
                variant="outline"
                :disabled="page >= pageCount"
                @click="page = Math.min(pageCount, page + 1)"
              >
                Next
              </UButton>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
