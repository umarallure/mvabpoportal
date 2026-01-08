<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { TableColumn } from '@nuxt/ui'

import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'

type DailyDealFlow = {
  id: string
  submission_id: string
  insured_name: string | null
  client_phone_number: string | null
  date: string | null
  status: string | null
  assigned_attorney_id: string | null
  attorney_email?: string | null
  created_at: string | null
}

const router = useRouter()
const auth = useAuth()

const loading = ref(false)
const error = ref<string | null>(null)
const query = ref('')

const rows = ref<DailyDealFlow[]>([])

const filteredRows = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return rows.value

  return rows.value.filter((r) => {
    const haystack = [
      r.insured_name ?? '',
      r.client_phone_number ?? '',
      r.status ?? '',
      r.attorney_email ?? ''
    ].join(' ').toLowerCase()

    return haystack.includes(q)
  })
})

const columns: TableColumn<DailyDealFlow>[] = [
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
  {
    accessorKey: 'status',
    header: 'Status'
  },
  {
    accessorKey: 'assigned_attorney',
    header: 'Assigned Lawyer'
  },
  {
    id: 'actions',
    header: 'Actions',
    meta: { class: { th: 'w-[110px] text-center', td: 'w-[110px] text-center' } }
  }
]

const load = async () => {
  loading.value = true
  error.value = null

  try {
    await auth.init()

    const isSuperAdmin = Boolean(auth.state.value.profile?.is_super_admin)
    const centerId = auth.state.value.profile?.center_id ?? null
    let leadVendor = auth.state.value.profile?.lead_vendor ?? null

    if (!isSuperAdmin && !leadVendor && centerId) {
      const { data: center, error: centerError } = await supabase
        .from('centers')
        .select('lead_vendor')
        .eq('id', centerId)
        .maybeSingle()

      if (centerError) throw centerError
      leadVendor = (center?.lead_vendor as string | null) ?? null
    }

    if (!isSuperAdmin && !leadVendor) {
      rows.value = []
      return
    }

    let q = supabase
      .from('daily_deal_flow')
      .select('id,submission_id,insured_name,client_phone_number,date,status,assigned_attorney_id,created_at')
      .order('created_at', { ascending: false })
      .limit(250)

    if (!isSuperAdmin) {
      q = q.eq('lead_vendor', leadVendor)
    }

    const { data, error: supaError } = await q

    if (supaError) throw supaError

    const dealFlows = (data ?? []) as DailyDealFlow[]

    // Fetch attorney details for rows that have assigned_attorney_id
    const attorneyIds = [...new Set(dealFlows.filter(d => d.assigned_attorney_id).map(d => d.assigned_attorney_id))]
    
    if (attorneyIds.length > 0) {
      const { data: attorneys } = await supabase
        .from('profiles')
        .select('id,email')
        .in('id', attorneyIds)

      const attorneyMap = new Map((attorneys ?? []).map((a: any) => [a.id, a.email]))
      
      dealFlows.forEach(flow => {
        if (flow.assigned_attorney_id) {
          flow.attorney_email = attorneyMap.get(flow.assigned_attorney_id) ?? null
        }
      })
    }

    rows.value = dealFlows
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
      <div class="flex flex-wrap items-center justify-between gap-3">
        <UInput
          v-model="query"
          class="max-w-md"
          icon="i-lucide-search"
          placeholder="Search by name, phone, status, lawyer..."
        />

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

      <UCard class="mt-4" :ui="{ body: 'p-0' }">
        <UTable
          :loading="loading"
          :data="filteredRows"
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

          <template #status-cell="{ row }">
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
              {{ row.original.attorney_email ?? '—' }}
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
      </UCard>
    </template>
  </UDashboardPanel>
</template>
