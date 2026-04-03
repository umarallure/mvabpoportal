<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { TableColumn } from '@nuxt/ui'

import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'

type DailyDealFlow = {
  id: string
  submission_id: string
  insured_name: string | null
  client_phone_number: string | null
  lead_vendor?: string | null
  date: string | null
  status: string | null
  assigned_attorney_id: string | null
  assigned_attorney_name?: string | null
  created_at: string | null
}

type CenterLeadVendorRow = {
  lead_vendor: string | null
}

type AttorneyNameRow = {
  user_id: string | null
  full_name: string | null
}

const router = useRouter()
const auth = useAuth()

const canSeeLeadVendorUi = computed(() => {
  const role = auth.state.value.profile?.role
  return role === 'super_admin' || role === 'admin'
})

const isAdmin = computed(() => auth.state.value.profile?.role === 'admin')
const isSuperAdmin = computed(() => auth.state.value.profile?.role === 'super_admin')
const canSeeAllStatuses = computed(() => isAdmin.value || isSuperAdmin.value)

const loading = ref(false)
const error = ref<string | null>(null)
const query = ref('')

const PAGE_SIZE = 25
const page = ref(1)

const ALL = '__all__' as const
const PENDING_APPROVAL = 'Pending Approval'

const selectedLeadVendor = ref<string>(ALL)
const selectedStatus = ref<string>(ALL)
const selectedAttorneyId = ref<string>(ALL)

const leadVendors = ref<string[]>([])

const rows = ref<DailyDealFlow[]>([])

const leadVendorOptions = computed(() => {
  const items = leadVendors.value
    .filter(Boolean)
    .map((v) => ({ value: v, label: v }))
  return [{ value: ALL, label: 'All lead vendors' }, ...items]
})

const statusOptions = computed(() => {
  if (canSeeAllStatuses.value) {
    return [
      { value: ALL, label: 'All statuses' },
      { value: PENDING_APPROVAL, label: PENDING_APPROVAL }
    ]
  }
  return [{ value: PENDING_APPROVAL, label: PENDING_APPROVAL }]
})

const attorneyOptions = computed(() => {
  const pairs = rows.value
    .map((r) => ({ id: r.assigned_attorney_id, name: r.assigned_attorney_name }))
    .filter((p): p is { id: string; name: string | null | undefined } => Boolean(p.id))

  const map = new Map<string, string>()
  for (const p of pairs) {
    const label = (p.name ?? '').trim()
    if (!map.has(p.id)) map.set(p.id, label || 'Unknown')
  }

  const items = [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label))

  return [{ value: ALL, label: 'All attorneys' }, ...items]
})

const filteredRows = computed(() => {
  const vendorFilter = selectedLeadVendor.value
  const attorneyFilter = selectedAttorneyId.value
  const statusFilter = selectedStatus.value

  const q = query.value.trim().toLowerCase()
  const base = rows.value.filter((r) => {
    if (!canSeeAllStatuses.value && (r.status ?? null) !== PENDING_APPROVAL) return false
    if (canSeeAllStatuses.value && statusFilter !== ALL && (r.status ?? null) !== statusFilter) return false
    if (canSeeLeadVendorUi.value && vendorFilter !== ALL && (r.lead_vendor ?? null) !== vendorFilter) return false
    if (attorneyFilter !== ALL && (r.assigned_attorney_id ?? null) !== attorneyFilter) return false
    return true
  })

  if (!q) return base

  return base.filter((r) => {
    const haystack = [
      r.insured_name ?? '',
      r.client_phone_number ?? '',
      r.status ?? '',
      ...(canSeeLeadVendorUi.value ? [r.lead_vendor ?? ''] : []),
      r.assigned_attorney_name ?? ''
    ].join(' ').toLowerCase()

    return haystack.includes(q)
  })
})

watch([query, selectedLeadVendor, selectedStatus, selectedAttorneyId], () => {
  page.value = 1
})

const pageCount = computed(() => {
  const total = filteredRows.value.length
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
})

watch(pageCount, (next) => {
  if (page.value > next) page.value = next
  if (page.value < 1) page.value = 1
})

const pagedRows = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filteredRows.value.slice(start, start + PAGE_SIZE)
})

const columns = computed<TableColumn<DailyDealFlow>[]>(() => {
  const base: TableColumn<DailyDealFlow>[] = [
    {
      accessorKey: 'date',
      header: 'Date'
    },
    {
      accessorKey: 'insured_name',
      header: 'Customer Name'
    },
    {
      accessorKey: 'client_phone_number',
      header: 'Phone Number'
    },
    ...(canSeeAllStatuses.value
      ? [
          {
            accessorKey: 'status',
            header: 'Status'
          }
        ]
      : []),
    {
      accessorKey: 'assigned_attorney',
      header: 'Assigned Attorney'
    },
    {
      id: 'actions',
      header: 'Actions',
      meta: { class: { th: 'w-[110px] text-center', td: 'w-[110px] text-center' } }
    }
  ]

  if (isSuperAdmin.value) {
    base.splice(3, 0, {
      accessorKey: 'lead_vendor',
      header: 'Lead Vendor'
    })
  }

  return base
})

const load = async () => {
  loading.value = true
  error.value = null

  try {
    await auth.init()

    // Lead vendor filter options come from centers table
    try {
      const { data: centers, error: centersError } = await supabase
        .from('centers')
        .select('lead_vendor')

      if (centersError) throw centersError

      const centerRows = (centers ?? []) as CenterLeadVendorRow[]
      const vendors = [...new Set(centerRows
        .map((center) => center.lead_vendor)
        .filter((vendor): vendor is string => typeof vendor === 'string' && vendor.trim().length > 0)
        .map((vendor) => vendor.trim())
      )].sort((a, b) => a.localeCompare(b))

      leadVendors.value = vendors
    } catch {
      // ignore; fall back to vendors present in loaded rows
      leadVendors.value = []
    }

    const isAdmin = auth.state.value.profile?.role === 'admin'
    const isSuperAdmin = auth.state.value.profile?.role === 'super_admin'
    const canSeeAll = auth.canSeeAll.value
    const leadVendor = auth.resolvedLeadVendor.value

    if (!canSeeAll && !leadVendor) {
      rows.value = []
      return
    }

    let q = supabase
      .from('daily_deal_flow')
      .select('id,submission_id,insured_name,client_phone_number,lead_vendor,date,status,assigned_attorney_id,created_at')
      .order('created_at', { ascending: false })
      .limit(250)

    if (!canSeeAll) {
      q = q.eq('lead_vendor', leadVendor)
    }

    if (!isAdmin && !isSuperAdmin) {
      q = q.eq('status', PENDING_APPROVAL)
    }

    const { data, error: supaError } = await q

    if (supaError) throw supaError

    const dealFlows = (data ?? []) as DailyDealFlow[]

    // Fetch attorney details for rows that have assigned_attorney_id
    const attorneyIds = [...new Set(dealFlows
      .map(d => d.assigned_attorney_id)
      .filter((id): id is string => Boolean(id))
    )]

    if (attorneyIds.length > 0) {
      // `assigned_attorney_id` matches `attorney_profiles.user_id`
      const { data: attorneys, error: attorneysError } = await supabase
        .from('attorney_profiles')
        .select('user_id,full_name')
        .in('user_id', attorneyIds)

      if (attorneysError) throw attorneysError

      const attorneyRows = (attorneys ?? []) as AttorneyNameRow[]
      const attorneyNameByUserId = new Map(
        attorneyRows
          .filter((attorney): attorney is { user_id: string; full_name: string | null } => Boolean(attorney.user_id))
          .map((attorney) => [attorney.user_id, String(attorney.full_name ?? '').trim()] as const)
      )

      dealFlows.forEach((flow) => {
        if (!flow.assigned_attorney_id) return
        const name = attorneyNameByUserId.get(flow.assigned_attorney_id) ?? ''
        flow.assigned_attorney_name = name.length ? name : null
      })
    }

    rows.value = dealFlows

    // If centers fetch is blocked by RLS, derive lead vendors from loaded rows
    if (!leadVendors.value.length) {
      leadVendors.value = [...new Set((dealFlows ?? [])
        .map((r) => r.lead_vendor)
        .filter((v): v is string => Boolean(v && v.trim().length))
        .map((v) => v.trim())
      )].sort((a, b) => a.localeCompare(b))
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load retainers'
    error.value = msg
  } finally {
    loading.value = false
  }
}

onMounted(load)

const openRow = (row: DailyDealFlow) => {
  router.push(`/retainers/${row.id}`)
}
</script>

<template>
  <UDashboardPanel id="retainers">
    <template #header>
      <UDashboardNavbar title="Retainers">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            @click="load"
          >
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-1 flex-wrap items-center gap-3">
            <UInput
              v-model="query"
              class="max-w-md"
              icon="i-lucide-search"
              placeholder="Search by name, phone, status, attorney..."
            />

            <USelect
              v-if="canSeeLeadVendorUi"
              v-model="selectedLeadVendor"
              class="w-56"
              :items="leadVendorOptions"
              value-key="value"
              label-key="label"
            />

            <USelect
              v-if="canSeeAllStatuses"
              v-model="selectedStatus"
              class="w-48"
              :items="statusOptions"
              value-key="value"
              label-key="label"
            />

            <USelect
              v-model="selectedAttorneyId"
              class="w-56"
              :items="attorneyOptions"
              value-key="value"
              label-key="label"
            />
          </div>

          <UBadge
            variant="subtle"
            :label="`${filteredRows.length} leads`"
          />
        </div>

        <UAlert
          v-if="error"
          class="mt-4"
          color="error"
          variant="subtle"
          title="Unable to load retainers"
          :description="error"
        />

        <UCard
          class="mt-4 flex min-h-0 flex-1 flex-col"
          :ui="{ body: 'p-0 min-h-0 flex-1 flex flex-col' }"
        >
          <div class="min-h-0 flex-1 overflow-auto">
            <UTable
              :loading="loading"
              :data="pagedRows"
              :columns="columns"
              :ui="{
                base: 'w-full table-fixed',
                thead: '[&>tr]:bg-elevated/50',
                tbody: '[&>tr]:hover:bg-muted/50 [&>tr]:cursor-pointer',
                th: 'px-4 py-3 text-left',
                td: 'px-4 py-3'
              }"
            >
          <template #date-cell="{ row }">
            <button type="button" class="block w-full text-left" @click="openRow(row.original)">
              {{ row.original.date ?? '—' }}
            </button>
          </template>

          <template #insured_name-cell="{ row }">
            <button type="button" class="block w-full text-left font-medium text-highlighted" @click="openRow(row.original)">
              {{ row.original.insured_name ?? '—' }}
            </button>
          </template>

          <template #client_phone_number-cell="{ row }">
            <button type="button" class="block w-full text-left" @click="openRow(row.original)">
              {{ row.original.client_phone_number ?? '—' }}
            </button>
          </template>

          <template #lead_vendor-cell="{ row }">
            <button type="button" class="block w-full text-left" @click="openRow(row.original)">
              {{ row.original.lead_vendor ?? '—' }}
            </button>
          </template>

          <template v-if="canSeeAllStatuses" #status-cell="{ row }">
            <button type="button" class="block w-full text-left" @click="openRow(row.original)">
              <UBadge
                v-if="row.original.status"
                variant="subtle"
                :label="row.original.status"
              />
              <span v-else>—</span>
            </button>
          </template>

          <template #assigned_attorney-cell="{ row }">
            <button type="button" class="block w-full text-left" @click="openRow(row.original)">
              {{ row.original.assigned_attorney_name ?? '—' }}
            </button>
          </template>

          <template #actions-cell="{ row }">
            <div class="flex justify-center">
              <UButton
                icon="i-lucide-eye"
                color="neutral"
                variant="outline"
                label="View"
                @click="openRow(row.original)"
              />
            </div>
          </template>
            </UTable>
          </div>

          <div class="flex items-center justify-between border-t border-default px-4 py-3">
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
    </template>
  </UDashboardPanel>
</template>
