<script setup lang="ts">
import { ref } from 'vue'

type ExportType = {
  id: string
  name: string
  description: string
  icon: string
  format: string
}

const loading = ref(false)
const exporting = ref<string | null>(null)

const exportTypes = ref<ExportType[]>([
  { id: 'transfers', name: 'Transfers Export', description: 'Export all transfer data with volume metrics', icon: 'i-lucide-arrow-right-left', format: 'CSV/Excel' },
  { id: 'retainers', name: 'Retainers Export', description: 'Export retainer records with status and attorney assignments', icon: 'i-lucide-briefcase', format: 'CSV/Excel' },
  { id: 'approved-retainers', name: 'Approved Retainers Export', description: 'Export only approved retainer records', icon: 'i-lucide-check-circle', format: 'CSV/Excel' },
  { id: 'invoices', name: 'Invoices Export', description: 'Export all invoicing data including pending, paid, and chargebacks', icon: 'i-lucide-receipt', format: 'CSV/Excel' },
  { id: 'notes', name: 'Retainer Notes Export', description: 'Export all retainer notes and communications', icon: 'i-lucide-file-text', format: 'CSV/Excel' },
  { id: 'sales-map', name: 'Sales Map Export', description: 'Export state-level sales criteria and volume data', icon: 'i-lucide-map', format: 'CSV/Excel' },
  { id: 'users', name: 'Users Export', description: 'Export user accounts and role assignments', icon: 'i-lucide-users', format: 'CSV/Excel' },
  { id: 'analytics', name: 'Analytics Report', description: 'Comprehensive analytics report with all metrics', icon: 'i-lucide-bar-chart', format: 'PDF/Excel' }
])

const exportHistory = ref([
  { id: '1', type: 'Transfers Export', date: '2024-01-15 10:30 AM', user: 'Admin User', status: 'Completed' },
  { id: '2', type: 'Invoices Export', date: '2024-01-14 02:15 PM', user: 'Admin User', status: 'Completed' },
  { id: '3', type: 'Analytics Report', date: '2024-01-13 09:45 AM', user: 'Super Admin', status: 'Completed' }
])

const handleExport = (exportType: ExportType) => {
  exporting.value = exportType.id
  
  setTimeout(() => {
    exportHistory.value.unshift({
      id: String(exportHistory.value.length + 1),
      type: exportType.name,
      date: new Date().toLocaleString(),
      user: 'Current User',
      status: 'Completed'
    })
    
    exporting.value = null
  }, 1500)
}

const dateRange = ref({
  start: '',
  end: ''
})

const selectedFormat = ref('csv')

const formatOptions = [
  { value: 'csv', label: 'CSV' },
  { value: 'excel', label: 'Excel (XLSX)' },
  { value: 'pdf', label: 'PDF' }
]
</script>

<template>
  <div class="space-y-6 p-6">
    <div>
      <h2 class="text-2xl font-semibold">Export Sheets</h2>
      <p class="mt-1 text-sm text-muted">Export data from various modules for reporting and analysis</p>
    </div>

    <UCard>
      <div class="space-y-4">
        <h3 class="font-semibold">Export Options</h3>

        <div class="grid gap-3 sm:grid-cols-2">
          <UInput
            v-model="dateRange.start"
            type="date"
            label="Start Date"
          />
          <UInput
            v-model="dateRange.end"
            type="date"
            label="End Date"
          />
        </div>

        <USelect
          v-model="selectedFormat"
          label="Export Format"
          :items="formatOptions"
          value-key="value"
          label-key="label"
        />
      </div>
    </UCard>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <UCard v-for="exportType in exportTypes" :key="exportType.id">
        <div class="space-y-3">
          <div class="flex items-start justify-between">
            <UIcon :name="exportType.icon" class="size-8 text-primary" />
            <UBadge variant="subtle" :label="exportType.format" size="xs" />
          </div>

          <div>
            <h4 class="font-semibold">{{ exportType.name }}</h4>
            <p class="mt-1 text-xs text-muted">{{ exportType.description }}</p>
          </div>

          <UButton
            block
            :loading="exporting === exportType.id"
            :disabled="exporting !== null && exporting !== exportType.id"
            icon="i-lucide-download"
            @click="handleExport(exportType)"
          >
            {{ exporting === exportType.id ? 'Exporting...' : 'Export' }}
          </UButton>
        </div>
      </UCard>
    </div>

    <UCard>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">Export History</h3>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            size="sm"
            :loading="loading"
          >
            Refresh
          </UButton>
        </div>

        <div class="space-y-2">
          <UCard v-for="record in exportHistory" :key="record.id">
            <div class="flex items-center justify-between">
              <div>
                <h4 class="text-sm font-semibold">{{ record.type }}</h4>
                <p class="text-xs text-muted">{{ record.date }} by {{ record.user }}</p>
              </div>
              <div class="flex items-center gap-2">
                <UBadge color="success" variant="subtle" :label="record.status" />
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-download"
                  size="sm"
                >
                  Download
                </UButton>
              </div>
            </div>
          </UCard>

          <div v-if="exportHistory.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
            <UIcon name="i-lucide-file-down" class="size-16 text-dimmed" />
            <p class="mt-3 text-sm text-dimmed">No export history available.</p>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
