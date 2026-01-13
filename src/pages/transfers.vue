<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TableColumn } from '@nuxt/ui'

type StageKey =
  | 'transfer_api'
  | 'incomplete_transfer'
  | 'returned_to_center_dq'
  | 'previously_sold_bpo'
  | 'needs_bpo_callback'
  | 'application_withdrawn'
  | 'pending_information'
  | 'pending_approval'

const STAGES: { key: StageKey, label: string }[] = [
  { key: 'transfer_api', label: 'Transfer API' },
  { key: 'incomplete_transfer', label: 'Incomplete Transfer' },
  { key: 'returned_to_center_dq', label: 'Returned To Center - DQ' },
  { key: 'previously_sold_bpo', label: 'Previously Sold BPO' },
  { key: 'needs_bpo_callback', label: 'Needs BPO Callback' },
  { key: 'application_withdrawn', label: 'Application Withdrawn' },
  { key: 'pending_information', label: 'Pending Information' },
  { key: 'pending_approval', label: 'Pending Approval' }
]

type TransferLead = {
  id: string
  date: string
  clientName: string
  phone: string
  opportunityValue: number
  stage: StageKey
  publisher: string
}

type ViewMode = 'kanban' | 'list'

const loading = ref(false)
const query = ref('')
const page = ref(1)
const PAGE_SIZE = 25
const viewMode = ref<ViewMode>('kanban')
const selectedStage = ref<'all' | StageKey>('all')

const mockTransfers = ref<TransferLead[]>([
  { id: 'T-1001', date: '2024-01-15', clientName: 'John Smith', phone: '111-111-1111', opportunityValue: 120, stage: 'transfer_api', publisher: 'Publisher A' },
  { id: 'T-1002', date: '2024-01-15', clientName: 'Jane Wilson', phone: '222-222-2222', opportunityValue: 180, stage: 'transfer_api', publisher: 'Publisher B' },
  { id: 'T-1003', date: '2024-01-14', clientName: 'Robert Johnson', phone: '333-333-3333', opportunityValue: 90, stage: 'incomplete_transfer', publisher: 'Publisher A' },
  { id: 'T-1004', date: '2024-01-14', clientName: 'Alice Williams', phone: '444-444-4444', opportunityValue: 60, stage: 'returned_to_center_dq', publisher: 'Publisher C' },
  { id: 'T-1005', date: '2024-01-13', clientName: 'Michael Brown', phone: '555-555-5555', opportunityValue: 250, stage: 'previously_sold_bpo', publisher: 'Publisher B' },
  { id: 'T-1006', date: '2024-01-13', clientName: 'Emily Davis', phone: '666-666-6666', opportunityValue: 140, stage: 'needs_bpo_callback', publisher: 'Publisher A' },
  { id: 'T-1007', date: '2024-01-12', clientName: 'Daniel Miller', phone: '777-777-7777', opportunityValue: 110, stage: 'application_withdrawn', publisher: 'Publisher C' },
  { id: 'T-1008', date: '2024-01-12', clientName: 'Sophia Garcia', phone: '888-888-8888', opportunityValue: 200, stage: 'pending_information', publisher: 'Publisher A' },
  { id: 'T-1009', date: '2024-01-11', clientName: 'William Martinez', phone: '999-999-9999', opportunityValue: 160, stage: 'pending_approval', publisher: 'Publisher B' },
  { id: 'T-1010', date: '2024-01-11', clientName: 'Olivia Anderson', phone: '101-101-1010', opportunityValue: 130, stage: 'pending_information', publisher: 'Publisher C' }
])

const filteredLeads = computed(() => {
  const q = query.value.trim().toLowerCase()
  return mockTransfers.value.filter((t) => {
    if (selectedStage.value !== 'all' && t.stage !== selectedStage.value) return false
    if (!q) return true
    const stageLabel = STAGES.find(s => s.key === t.stage)?.label ?? ''
    const haystack = [t.id, t.clientName, t.phone, stageLabel, t.publisher].join(' ').toLowerCase()
    return haystack.includes(q)
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredLeads.value.length / PAGE_SIZE)))

const pagedRows = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filteredLeads.value.slice(start, start + PAGE_SIZE)
})

const totalVolume = computed(() => mockTransfers.value.reduce((sum, t) => sum + t.opportunityValue, 0))

const leadsByStage = computed(() => {
  const grouped = new Map<StageKey, TransferLead[]>()
  STAGES.forEach((s) => grouped.set(s.key, []))
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

const getStageLabel = (stage: StageKey) => STAGES.find(s => s.key === stage)?.label ?? stage

const columns: TableColumn<TransferLead>[] = [
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'clientName', header: 'Client' },
  { accessorKey: 'phone', header: 'Phone' },
  { accessorKey: 'stage', header: 'Stage' },
  { accessorKey: 'opportunityValue', header: 'Volume' },
  { accessorKey: 'publisher', header: 'Publisher' }
]
</script>

<template>
  <UDashboardPanel id="transfers">
    <template #header>
      <UDashboardNavbar title="Transfer Portal - Volume">
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
      <div class="flex h-full min-h-0 flex-col">
        <div class="mb-4 grid gap-4 sm:grid-cols-3">
          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Total Transfers</p>
                <p class="text-2xl font-semibold">{{ mockTransfers.length }}</p>
              </div>
              <UIcon name="i-lucide-arrow-right-left" class="size-8 text-primary" />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Total Volume</p>
                <p class="text-2xl font-semibold">{{ totalVolume }}</p>
              </div>
              <UIcon name="i-lucide-trending-up" class="size-8 text-primary" />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Avg Volume</p>
                <p class="text-2xl font-semibold">{{ Math.round(totalVolume / mockTransfers.length) }}</p>
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
              placeholder="Search transfers..."
            />

            <USelect
              v-model="selectedStage"
              :items="[{ label: 'All Stages', value: 'all' }, ...STAGES.map(s => ({ label: s.label, value: s.key }))]"
              class="w-56"
              value-key="value"
              label-key="label"
            />
          </div>

          <div class="flex items-center gap-3">
            <div class="inline-flex rounded-lg border border-default bg-white p-0.5">
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
          </div>
        </div>

        <div v-if="viewMode === 'kanban'" class="mt-4 min-h-0 flex-1 overflow-auto">
          <div class="flex min-h-0 gap-3 pr-2" style="min-width: 2200px;">
            <div
              v-for="stage in STAGES"
              :key="stage.key"
              class="flex min-h-[560px] w-[26rem] flex-col rounded-lg border border-default bg-elevated/20"
            >
              <div class="flex items-center justify-between border-b border-default px-3 py-2">
                <div class="text-sm font-semibold">{{ stage.label }}</div>
                <UBadge
                  variant="subtle"
                  :label="String(leadsByStage.get(stage.key)?.length ?? 0)"
                />
              </div>

              <div class="flex-1 space-y-2 p-2">
                <UCard
                  v-for="lead in (leadsByStage.get(stage.key) ?? [])"
                  :key="lead.id"
                  class="w-full"
                  :ui="{ body: '!p-2 sm:!p-2' }"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold">{{ lead.clientName }}</div>
                      <div class="mt-0.5 text-xs text-muted">{{ lead.id }} · {{ lead.phone }}</div>
                    </div>
                    <div class="shrink-0 text-sm font-semibold">{{ formatMoney(lead.opportunityValue) }}</div>
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
