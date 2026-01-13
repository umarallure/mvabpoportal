<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TableColumn } from '@nuxt/ui'

type Invoice = {
  id: string
  invoiceNumber: string
  clientName: string
  amount: number
  dueDate: string
  status: 'Pending' | 'Paid' | 'Chargeback'
  paidDate?: string
}

const activeTab = ref('pending')
const loading = ref(false)
const query = ref('')
const page = ref(1)
const PAGE_SIZE = 25

const mockInvoices = ref<Invoice[]>([
  { id: '1', invoiceNumber: 'INV-001', clientName: 'John Doe', amount: 5000, dueDate: '2024-02-01', status: 'Pending' },
  { id: '2', invoiceNumber: 'INV-002', clientName: 'Jane Smith', amount: 7500, dueDate: '2024-01-25', status: 'Paid', paidDate: '2024-01-20' },
  { id: '3', invoiceNumber: 'INV-003', clientName: 'Bob Johnson', amount: 6000, dueDate: '2024-02-05', status: 'Pending' },
  { id: '4', invoiceNumber: 'INV-004', clientName: 'Alice Williams', amount: 8000, dueDate: '2024-01-15', status: 'Chargeback' },
  { id: '5', invoiceNumber: 'INV-005', clientName: 'Charlie Brown', amount: 5500, dueDate: '2024-01-30', status: 'Paid', paidDate: '2024-01-28' },
  { id: '6', invoiceNumber: 'INV-006', clientName: 'David Lee', amount: 4500, dueDate: '2024-02-10', status: 'Pending' },
  { id: '7', invoiceNumber: 'INV-007', clientName: 'Emma Wilson', amount: 9000, dueDate: '2024-01-20', status: 'Chargeback' },
  { id: '8', invoiceNumber: 'INV-008', clientName: 'Frank Miller', amount: 6500, dueDate: '2024-01-22', status: 'Paid', paidDate: '2024-01-21' }
])

const tabs = [
  { key: 'pending', label: 'Pending', icon: 'i-lucide-clock' },
  { key: 'paid', label: 'Paid', icon: 'i-lucide-check-circle' },
  { key: 'chargeback', label: 'Chargeback', icon: 'i-lucide-alert-circle' }
]

const filteredInvoices = computed(() => {
  let filtered = mockInvoices.value.filter(inv => {
    if (activeTab.value === 'pending') return inv.status === 'Pending'
    if (activeTab.value === 'paid') return inv.status === 'Paid'
    if (activeTab.value === 'chargeback') return inv.status === 'Chargeback'
    return true
  })
  
  const q = query.value.trim().toLowerCase()
  if (q) {
    filtered = filtered.filter(inv => {
      const haystack = [inv.invoiceNumber, inv.clientName].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }
  
  return filtered
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredInvoices.value.length / PAGE_SIZE)))

const pagedInvoices = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filteredInvoices.value.slice(start, start + PAGE_SIZE)
})

const totalAmount = computed(() => filteredInvoices.value.reduce((sum, inv) => sum + inv.amount, 0))

const columns = computed<TableColumn<Invoice>[]>(() => {
  const base: TableColumn<Invoice>[] = [
    { accessorKey: 'invoiceNumber', header: 'Invoice #' },
    { accessorKey: 'clientName', header: 'Client Name' },
    { accessorKey: 'amount', header: 'Amount' },
    { accessorKey: 'dueDate', header: 'Due Date' }
  ]
  
  if (activeTab.value === 'paid') {
    base.push({ accessorKey: 'paidDate', header: 'Paid Date' })
  }
  
  base.push({ accessorKey: 'status', header: 'Status' })
  
  return base
})

const stats = computed(() => {
  const pending = mockInvoices.value.filter(i => i.status === 'Pending')
  const paid = mockInvoices.value.filter(i => i.status === 'Paid')
  const chargeback = mockInvoices.value.filter(i => i.status === 'Chargeback')
  
  return {
    pending: { count: pending.length, amount: pending.reduce((s, i) => s + i.amount, 0) },
    paid: { count: paid.length, amount: paid.reduce((s, i) => s + i.amount, 0) },
    chargeback: { count: chargeback.length, amount: chargeback.reduce((s, i) => s + i.amount, 0) }
  }
})
</script>

<template>
  <UDashboardPanel id="invoicing">
    <template #header>
      <UDashboardNavbar title="Invoicing">
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
                <p class="text-sm text-muted">Pending</p>
                <p class="text-2xl font-semibold">{{ stats.pending.count }}</p>
                <p class="text-xs text-muted">${{ stats.pending.amount.toLocaleString() }}</p>
              </div>
              <UIcon name="i-lucide-clock" class="size-8 text-amber-500" />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Paid</p>
                <p class="text-2xl font-semibold">{{ stats.paid.count }}</p>
                <p class="text-xs text-muted">${{ stats.paid.amount.toLocaleString() }}</p>
              </div>
              <UIcon name="i-lucide-check-circle" class="size-8 text-green-500" />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Chargeback</p>
                <p class="text-2xl font-semibold">{{ stats.chargeback.count }}</p>
                <p class="text-xs text-muted">${{ stats.chargeback.amount.toLocaleString() }}</p>
              </div>
              <UIcon name="i-lucide-alert-circle" class="size-8 text-red-500" />
            </div>
          </UCard>
        </div>

        <UTabs v-model="activeTab" :items="tabs" class="mb-4" />

        <div class="flex flex-wrap items-center justify-between gap-3">
          <UInput
            v-model="query"
            class="max-w-md"
            icon="i-lucide-search"
            placeholder="Search invoices..."
          />

          <div class="flex items-center gap-3">
            <UBadge variant="subtle" :label="`${filteredInvoices.length} invoices`" />
            <UBadge variant="subtle" :label="`Total: $${totalAmount.toLocaleString()}`" />
          </div>
        </div>

        <UCard class="mt-4 flex min-h-0 flex-1 flex-col" :ui="{ body: 'p-0 min-h-0 flex-1 flex flex-col' }">
          <div class="min-h-0 flex-1 overflow-auto">
            <UTable
              :loading="loading"
              :data="pagedInvoices"
              :columns="columns"
              :ui="{
                base: 'w-full table-fixed',
                thead: '[&>tr]:bg-elevated/50',
                tbody: '[&>tr]:hover:bg-muted/50',
                th: 'px-4 py-3 text-left',
                td: 'px-4 py-3'
              }"
            >
              <template #invoiceNumber-cell="{ row }">
                <span class="font-medium text-highlighted">{{ row.original.invoiceNumber }}</span>
              </template>

              <template #amount-cell="{ row }">
                <span class="font-semibold">${{ row.original.amount.toLocaleString() }}</span>
              </template>

              <template #status-cell="{ row }">
                <UBadge
                  :color="row.original.status === 'Paid' ? 'success' : row.original.status === 'Chargeback' ? 'error' : 'warning'"
                  variant="subtle"
                  :label="row.original.status"
                />
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
