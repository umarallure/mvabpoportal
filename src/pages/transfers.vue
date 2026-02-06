<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { TableColumn } from '@nuxt/ui'
import { useAuth } from '../composables/useAuth'
import { supabase } from '../lib/supabase'

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

const router = useRouter()
const auth = useAuth()
const loading = ref(false)
const query = ref('')
const page = ref(1)
const PAGE_SIZE = 25
const viewMode = ref<ViewMode>('kanban')
const selectedStage = ref<'all' | StageKey>('all')

const transfers = ref<TransferLead[]>([])

const filteredLeads = computed(() => {
  const q = query.value.trim().toLowerCase()
  return transfers.value.filter((t) => {
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

const totalVolume = computed(() => transfers.value.reduce((sum, t) => sum + t.opportunityValue, 0))

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

const mapStatusToStage = (status: string | null): StageKey => {
  if (!status) return 'transfer_api'
  
  const normalized = status.toLowerCase().trim()
  
  // Map database status values to our stage keys
  if (normalized === 'transfer api') return 'transfer_api'
  if (normalized === 'incomplete transfer') return 'incomplete_transfer'
  if (normalized === 'returned to center - dq') return 'returned_to_center_dq'
  if (normalized === 'previously sold bpo') return 'previously_sold_bpo'
  if (normalized === 'needs bpo callback') return 'needs_bpo_callback'
  if (normalized === 'application withdrawn') return 'application_withdrawn'
  if (normalized === 'pending information' || normalized === 'information verification') return 'pending_information'
  if (normalized === 'pending approval') return 'pending_approval'
  
  return 'transfer_api'
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
  try {
    loading.value = true
    
    // Initialize auth first
    await auth.init()
    
    const profile = auth.state.value.profile
    const isAdmin = profile?.role === 'admin'
    const isSuperAdmin = profile?.role === 'super_admin'
    const canSeeAll = isSuperAdmin || isAdmin || profile?.is_super_admin
    const centerId = profile?.center_id ?? null
    let leadVendor = profile?.lead_vendor ?? null

    console.log('🔍 Transfer page - User profile:', {
      role: profile?.role,
      is_super_admin: profile?.is_super_admin,
      center_id: centerId,
      lead_vendor: leadVendor,
      canSeeAll
    })

    // If not admin/super_admin, get lead vendor from centers table if needed
    if (!canSeeAll && !leadVendor && centerId) {
      console.log('📞 Fetching lead vendor from centers table for center_id:', centerId)
      const { data: center, error: centerError } = await supabase
        .from('centers')
        .select('lead_vendor')
        .eq('id', centerId)
        .maybeSingle()

      if (centerError) {
        console.error('❌ Error fetching center:', centerError)
      } else {
        leadVendor = (center?.lead_vendor as string | null) ?? null
        console.log('✅ Lead vendor from center:', leadVendor)
      }
    }

    // If not admin and no lead vendor found, show no records
    if (!canSeeAll && !leadVendor) {
      console.log('⚠️ No lead vendor found and user is not admin')
      transfers.value = []
      return
    }

    let query = supabase.from('daily_deal_flow').select('*')

    // Filter by lead vendor if user is not admin or super_admin
    if (!canSeeAll && leadVendor) {
      console.log('🔐 Filtering by lead vendor:', leadVendor)
      query = query.eq('lead_vendor', leadVendor)
    } else {
      console.log('👑 Admin/Super Admin - showing all records')
    }

    console.log('📡 Making Supabase query to daily_deal_flow...')
    const { data, error } = await query

    if (error) {
      console.error('❌ Error loading transfers:', error)
      transfers.value = []
      return
    }

    console.log('✅ Loaded transfers:', data?.length ?? 0, 'records')
    
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
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : 0
      }
      return 0
    }

    transfers.value = (data ?? []).map((row) => {
      const record = (row ?? {}) as Record<string, unknown>
      return {
        id: getString(record, 'id'),
        date: getString(record, 'date'),
        clientName: getString(record, 'client_name') || getString(record, 'insured_name'),
        phone: getString(record, 'client_phone_number') || getString(record, 'phone'),
        opportunityValue: getNumber(record, 'opportunity_value'),
        stage: mapStatusToStage(getString(record, 'status')),
        publisher: getString(record, 'publisher') || getString(record, 'lead_vendor')
      }
    })

    console.log('✅ Processed transfers:', transfers.value.length)
  } catch (error) {
    console.error('❌ Error in loadTransfers:', error)
    transfers.value = []
  } finally {
    loading.value = false
  }
}

const viewLead = (leadId: string) => {
  router.push(`/retainers/${leadId}`)
}

onMounted(() => {
  loadTransfers()
})
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
                <p class="text-2xl font-semibold">{{ transfers.length }}</p>
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
                <p class="text-2xl font-semibold">{{ transfers.length > 0 ? Math.round(totalVolume / transfers.length) : 0 }}</p>
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
