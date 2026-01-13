<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TableColumn } from '@nuxt/ui'

type Transfer = {
  id: string
  date: string
  clientName: string
  volume: number
  status: string
  publisher: string
}

const loading = ref(false)
const query = ref('')
const page = ref(1)
const PAGE_SIZE = 25

const mockTransfers = ref<Transfer[]>([
  { id: '1', date: '2024-01-15', clientName: 'John Doe', volume: 150, status: 'Completed', publisher: 'Publisher A' },
  { id: '2', date: '2024-01-14', clientName: 'Jane Smith', volume: 200, status: 'Pending', publisher: 'Publisher B' },
  { id: '3', date: '2024-01-13', clientName: 'Bob Johnson', volume: 175, status: 'Completed', publisher: 'Publisher A' },
  { id: '4', date: '2024-01-12', clientName: 'Alice Williams', volume: 125, status: 'In Progress', publisher: 'Publisher C' },
  { id: '5', date: '2024-01-11', clientName: 'Charlie Brown', volume: 300, status: 'Completed', publisher: 'Publisher B' }
])

const filteredRows = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return mockTransfers.value
  
  return mockTransfers.value.filter((t) => {
    const haystack = [t.clientName, t.status, t.publisher].join(' ').toLowerCase()
    return haystack.includes(q)
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / PAGE_SIZE)))

const pagedRows = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filteredRows.value.slice(start, start + PAGE_SIZE)
})

const totalVolume = computed(() => mockTransfers.value.reduce((sum, t) => sum + t.volume, 0))

const columns: TableColumn<Transfer>[] = [
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'clientName', header: 'Client Name' },
  { accessorKey: 'volume', header: 'Volume' },
  { accessorKey: 'status', header: 'Status' },
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
          <UInput
            v-model="query"
            class="max-w-md"
            icon="i-lucide-search"
            placeholder="Search transfers..."
          />

          <UBadge variant="subtle" :label="`${filteredRows.length} transfers`" />
        </div>

        <UCard class="mt-4 flex min-h-0 flex-1 flex-col" :ui="{ body: 'p-0 min-h-0 flex-1 flex flex-col' }">
          <div class="min-h-0 flex-1 overflow-auto">
            <UTable
              :loading="loading"
              :data="pagedRows"
              :columns="columns"
              :ui="{
                base: 'w-full table-fixed',
                thead: '[&>tr]:bg-elevated/50',
                tbody: '[&>tr]:hover:bg-muted/50',
                th: 'px-4 py-3 text-left',
                td: 'px-4 py-3'
              }"
            >
              <template #status-cell="{ row }">
                <UBadge variant="subtle" :label="row.original.status" />
              </template>

              <template #volume-cell="{ row }">
                <span class="font-semibold">{{ row.original.volume }}</span>
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
