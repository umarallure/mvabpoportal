<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { supabase } from '../lib/supabase'

const auth = useAuth()
const router = useRouter()

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceStatus = 'billable' | 'pending' | 'in_review' | 'signed_awaiting' | 'in_preview' | 'paid' | 'chargeback'
type BoardColumnKey = 'pending' | 'in_review' | 'paid' | 'chargeback'

type KanbanColumn = {
  key: BoardColumnKey
  label: string
  icon: string
  color: string
  rgb: string
  emptyText: string
  statuses: InvoiceStatus[]
  dropStatus: InvoiceStatus
}

type InvoiceRow = {
  id: string
  invoice_number: string | null
  lead_vendor_id: string | null
  invoice_type: string | null
  date_range_start: string | null
  date_range_end: string | null
  deal_ids: string[] | null
  items: { description: string; amount: number }[] | null
  subtotal: number | null
  tax_rate: number | null
  tax_amount: number | null
  total_amount: number | null
  status: InvoiceStatus | null
  notes: string | null
  due_date: string | null
  created_at: string
  // enriched
  lead_names: string
  center_name: string
}

// ── State ─────────────────────────────────────────────────────────────────────

const invoices = ref<InvoiceRow[]>([])
const loading = ref(false)
const searchQuery = ref('')
const centerNotFound = ref(false)
const loadError = ref('')
const statusUpdateError = ref('')
const viewMode = ref<'board' | 'list'>('board')
const draggedInvoiceId = ref<string | null>(null)
const dropTargetColumnKey = ref<BoardColumnKey | null>(null)
const updatingInvoiceIds = ref<string[]>([])
const suppressOpenUntil = ref(0)

// ── Data loading ───────────────────────────────────────────────────────────────

const loadInvoices = async () => {
  loading.value = true
  loadError.value = ''
  statusUpdateError.value = ''
  centerNotFound.value = false

  try {
    await auth.init()

    const centerId = auth.state.value.profile?.center_id
    const canSeeAll = auth.canSeeAll.value

    if (!canSeeAll && !centerId) {
      centerNotFound.value = true
      invoices.value = []
      return
    }

    let invoiceQuery = supabase
      .from('invoices')
      .select('id,invoice_number,lead_vendor_id,invoice_type,date_range_start,date_range_end,deal_ids,items,subtotal,tax_rate,tax_amount,total_amount,status,notes,due_date,created_at')
      .eq('invoice_type', 'publisher')
      .order('created_at', { ascending: false })

    if (!canSeeAll && centerId) {
      invoiceQuery = invoiceQuery.eq('lead_vendor_id', centerId)
    }

    const { data: invoiceRows, error: invoiceError } = await invoiceQuery

    if (invoiceError) {
      loadError.value = invoiceError.message
      invoices.value = []
      return
    }

    if (!invoiceRows || invoiceRows.length === 0) {
      invoices.value = []
      return
    }

    const centerNameById = new Map<string, string>()
    const centerIds = [...new Set((invoiceRows as Record<string, unknown>[])
      .map((row) => typeof row.lead_vendor_id === 'string' ? row.lead_vendor_id : null)
      .filter((id): id is string => Boolean(id))
    )]

    if (centerIds.length > 0) {
      const { data: centerRows } = await supabase
        .from('centers')
        .select('id,center_name,lead_vendor')
        .in('id', centerIds)

      ;(centerRows as Record<string, unknown>[] | null)?.forEach((centerRow) => {
        const id = String(centerRow.id ?? '').trim()
        const centerName = typeof centerRow.center_name === 'string' && centerRow.center_name.trim().length > 0
          ? centerRow.center_name.trim()
          : typeof centerRow.lead_vendor === 'string'
            ? centerRow.lead_vendor.trim()
            : ''

        if (id) {
          centerNameById.set(id, centerName)
        }
      })
    }

    const allDealIds = (invoiceRows as unknown[]).flatMap((inv) => {
      const row = inv as Record<string, unknown>
      return Array.isArray(row.deal_ids) ? (row.deal_ids as string[]) : []
    })

    const leadNameMap = new Map<string, string>()
    if (allDealIds.length > 0) {
      const { data: dealRows } = await supabase
        .from('daily_deal_flow')
        .select('id,insured_name,state')
        .in('id', allDealIds)

      if (dealRows) {
        ;(dealRows as Record<string, unknown>[]).forEach((d) => {
          const id = String(d.id ?? '')
          const name = String(d.insured_name ?? '').trim()
          if (id && name) leadNameMap.set(id, name)
        })
      }
    }

    invoices.value = (invoiceRows as Record<string, unknown>[]).map((row) => {
      const dealIds = Array.isArray(row.deal_ids) ? (row.deal_ids as string[]) : []
      const leadNames = dealIds
        .map((id) => leadNameMap.get(id))
        .filter(Boolean)
        .join(' · ')

      return {
        id: String(row.id ?? ''),
        invoice_number: row.invoice_number as string | null,
        lead_vendor_id: row.lead_vendor_id as string | null,
        invoice_type: row.invoice_type as string | null,
        date_range_start: row.date_range_start as string | null,
        date_range_end: row.date_range_end as string | null,
        deal_ids: dealIds,
        items: Array.isArray(row.items) ? row.items as { description: string; amount: number }[] : null,
        subtotal: row.subtotal as number | null,
        tax_rate: row.tax_rate as number | null,
        tax_amount: row.tax_amount as number | null,
        total_amount: row.total_amount as number | null,
        status: row.status as InvoiceStatus | null,
        notes: row.notes as string | null,
        due_date: row.due_date as string | null,
        created_at: String(row.created_at ?? ''),
        lead_names: leadNames,
        center_name: centerNameById.get(String(row.lead_vendor_id ?? '')) ?? '',
      }
    })
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Failed to load invoices.'
    invoices.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadInvoices()
})

// ── Kanban columns ─────────────────────────────────────────────────────────────

const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    key: 'pending',
    label: 'Billable – Awaiting to be Paid',
    icon: 'i-lucide-file-check-2',
    color: '#3b82f6',
    rgb: '59,130,246',
    emptyText: 'No invoices.',
    statuses: ['pending'],
    dropStatus: 'pending',
  },
  {
    key: 'in_review',
    label: 'In Review',
    icon: 'i-lucide-clock',
    color: '#f59e0b',
    rgb: '245,158,11',
    emptyText: 'No invoices.',
    statuses: ['in_review', 'signed_awaiting', 'in_preview'],
    dropStatus: 'in_review',
  },
  {
    key: 'paid',
    label: 'Paid',
    icon: 'i-lucide-circle-check-big',
    color: '#22c55e',
    rgb: '34,197,94',
    emptyText: 'No paid invoices.',
    statuses: ['paid'],
    dropStatus: 'paid',
  },
  {
    key: 'chargeback',
    label: 'Chargeback',
    icon: 'i-lucide-triangle-alert',
    color: '#f97316',
    rgb: '249,115,22',
    emptyText: 'No chargeback invoices.',
    statuses: ['chargeback'],
    dropStatus: 'chargeback',
  },
]

const BOARD_STATUS_BY_COLUMN: Record<BoardColumnKey, InvoiceStatus> = {
  pending: 'pending',
  in_review: 'in_review',
  paid: 'paid',
  chargeback: 'chargeback',
}

// ── Filtering ─────────────────────────────────────────────────────────────────

const filteredInvoices = computed(() => {
  let data = invoices.value.slice()
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    data = data.filter((inv) => {
      const haystack = [inv.invoice_number ?? '', inv.lead_names, inv.notes ?? ''].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }
  return data
})

const columnInvoices = (statuses: readonly InvoiceStatus[]) =>
  filteredInvoices.value.filter((inv) => Boolean(inv.status) && statuses.includes(inv.status as InvoiceStatus))

// ── Stat cards ─────────────────────────────────────────────────────────────────

const summaryCards = computed(() => {
  const all = invoices.value
  const billable = all.filter((i) => i.status === 'pending')
  const inReview = all.filter((i) => ['in_review', 'signed_awaiting', 'in_preview'].includes(i.status ?? ''))
  const paid = all.filter((i) => i.status === 'paid')
  const chargeback = all.filter((i) => i.status === 'chargeback')

  const sum = (arr: InvoiceRow[]) => arr.reduce((s, i) => s + (i.total_amount ?? 0), 0)

  return [
    { label: 'Total Invoiced', value: fmtMoney(sum(all)), icon: 'i-lucide-receipt', accent: '#ae4010', light: '#e8763c', rgb: '174,64,16' },
    { label: 'Billable – Awaiting to be Paid', value: fmtMoney(sum(billable)), icon: 'i-lucide-file-check-2', accent: '#3b82f6', light: '#60a5fa', rgb: '59,130,246' },
    { label: 'In Review', value: fmtMoney(sum(inReview)), icon: 'i-lucide-clock', accent: '#f59e0b', light: '#fcd34d', rgb: '245,158,11' },
    { label: 'Paid', value: fmtMoney(sum(paid)), icon: 'i-lucide-circle-check-big', accent: '#22c55e', light: '#4ade80', rgb: '34,197,94' },
    { label: 'Chargeback', value: fmtMoney(sum(chargeback)), icon: 'i-lucide-triangle-alert', accent: '#ef4444', light: '#f87171', rgb: '239,68,68' },
  ]
})

// ── List view ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  billable: '#3b82f6',
  pending: '#f59e0b',
  in_review: '#f59e0b',
  signed_awaiting: '#f59e0b',
  in_preview: '#f59e0b',
  paid: '#22c55e',
  chargeback: '#ef4444',
}
const STATUS_RGB: Record<string, string> = {
  billable: '59,130,246',
  pending: '245,158,11',
  in_review: '245,158,11',
  signed_awaiting: '245,158,11',
  in_preview: '245,158,11',
  paid: '34,197,94',
  chargeback: '239,68,68',
}
const STATUS_LABELS: Record<string, string> = {
  billable: 'Billable',
  pending: 'Pending',
  in_review: 'In Review',
  signed_awaiting: 'Awaiting Signature',
  in_preview: 'In Preview',
  paid: 'Paid',
  chargeback: 'Chargeback',
}

const statusColor = (s: string | null) => STATUS_COLORS[s ?? ''] ?? '#6b7280'
const statusRgb = (s: string | null) => STATUS_RGB[s ?? ''] ?? '107,114,128'
const statusLabel = (s: string | null) => STATUS_LABELS[s ?? ''] ?? (s ?? '—')

const findBoardColumnKey = (status: InvoiceStatus | null): BoardColumnKey | null => {
  if (!status) return null

  const match = KANBAN_COLUMNS.find((column) => column.statuses.includes(status))
  return match?.key ?? null
}

const isUpdatingInvoice = (invoiceId: string) => updatingInvoiceIds.value.includes(invoiceId)

const clearDragState = () => {
  draggedInvoiceId.value = null
  dropTargetColumnKey.value = null
}

const beginDrag = (event: DragEvent, invoiceId: string) => {
  if (isUpdatingInvoice(invoiceId)) return

  draggedInvoiceId.value = invoiceId
  statusUpdateError.value = ''

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', invoiceId)
  }
}

const handleDragEnd = () => {
  suppressOpenUntil.value = Date.now() + 200
  clearDragState()
}

const handleColumnDragOver = (event: DragEvent, columnKey: BoardColumnKey) => {
  if (!draggedInvoiceId.value) return

  event.preventDefault()
  dropTargetColumnKey.value = columnKey

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

const handleColumnDragEnter = (columnKey: BoardColumnKey) => {
  if (!draggedInvoiceId.value) return
  dropTargetColumnKey.value = columnKey
}

const handleColumnDragLeave = (event: DragEvent, columnKey: BoardColumnKey) => {
  const currentTarget = event.currentTarget
  const relatedTarget = event.relatedTarget

  if (!(currentTarget instanceof HTMLElement)) return
  if (relatedTarget instanceof Node && currentTarget.contains(relatedTarget)) return
  if (dropTargetColumnKey.value === columnKey) dropTargetColumnKey.value = null
}

const moveInvoiceToColumn = async (columnKey: BoardColumnKey) => {
  const invoiceId = draggedInvoiceId.value
  suppressOpenUntil.value = Date.now() + 200
  clearDragState()

  if (!invoiceId) return

  const invoice = invoices.value.find((row) => row.id === invoiceId)
  if (!invoice || isUpdatingInvoice(invoiceId)) return

  const nextStatus = BOARD_STATUS_BY_COLUMN[columnKey]
  const currentColumnKey = findBoardColumnKey(invoice.status)

  if (currentColumnKey === columnKey || invoice.status === nextStatus) return

  const previousStatus = invoice.status
  invoice.status = nextStatus
  updatingInvoiceIds.value = [...updatingInvoiceIds.value, invoiceId]
  statusUpdateError.value = ''

  try {
    const { data, error } = await supabase
      .from('invoices')
      .update({ status: nextStatus })
      .eq('id', invoiceId)
      .eq('invoice_type', 'publisher')
      .select('id,status')
      .maybeSingle()

    if (error) throw error
    if (!data) {
      throw new Error('Invoice status update was blocked. Apply the publisher update RLS policy before testing drag and drop.')
    }

    invoice.status = (data as { status?: InvoiceStatus | null }).status ?? nextStatus
  } catch (error) {
    invoice.status = previousStatus
    statusUpdateError.value = error instanceof Error ? error.message : 'Failed to update invoice status.'
  } finally {
    updatingInvoiceIds.value = updatingInvoiceIds.value.filter((id) => id !== invoiceId)
  }
}

const openInvoice = (invoiceId: string) => {
  if (!invoiceId) return
  if (isUpdatingInvoice(invoiceId)) return
  if (Date.now() < suppressOpenUntil.value) return

  const target = router.resolve({
    path: `/invoicing/${encodeURIComponent(invoiceId)}/pdf`
  })

  window.open(target.href, '_blank', 'noopener,noreferrer')
}

// ── Formatters ─────────────────────────────────────────────────────────────────

const fmtMoney = (n: number) => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) }
  catch { return `$${n}` }
}

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return d }
}

const fmtDateRange = (start: string | null, end: string | null) => {
  if (!start && !end) return '—'
  const s = start ? new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  const e = end ? new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  if (s && e) return `${s} – ${e}`
  return s || e
}

const itemCount = (inv: InvoiceRow) => {
  const n = inv.deal_ids?.length ?? inv.items?.length ?? 0
  return `${n} item${n === 1 ? '' : 's'}`
}

const invoiceLabel = (inv: InvoiceRow) =>
  inv.invoice_number ?? `INV-${inv.id.slice(0, 8).toUpperCase()}`
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
            label="Refresh"
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            size="sm"
            :loading="loading"
            @click="loadInvoices"
          />
          <NotificationBell />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="inv-page flex h-full min-h-0 flex-col gap-5 p-5">

        <!-- ═══ No center ════════════════════════════════════════════════════ -->
        <div v-if="centerNotFound" class="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <UIcon name="i-lucide-building-2" class="size-10 opacity-30" />
          <p class="text-sm font-medium" style="color: var(--dashboard-text-primary);">No center assigned to your account.</p>
        </div>

        <!-- ═══ Load error ════════════════════════════════════════════════════ -->
        <div v-else-if="loadError" class="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <UIcon name="i-lucide-alert-triangle" class="size-10 text-red-400" />
          <p class="text-sm font-medium text-red-500">{{ loadError }}</p>
          <UButton size="sm" variant="outline" color="neutral" @click="loadInvoices">Retry</UButton>
        </div>

        <template v-else>

          <!-- ═══ STAT CARDS ═════════════════════════════════════════════════ -->
          <div class="grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
            <div
              v-for="card in summaryCards"
              :key="card.label"
              class="inv-stat-card group"
              :style="{
                '--card-accent': card.accent,
                '--card-light': card.light,
                '--card-rgb': card.rgb,
                borderTopColor: card.accent,
              }"
            >
              <div class="flex items-start justify-between px-5 py-4">
                <div>
                  <div class="inv-card-label">{{ card.label }}</div>
                  <div class="inv-card-value">{{ card.value }}</div>
                </div>
                <div
                  class="flex size-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105"
                  :style="{ background: `rgba(${card.rgb}, 0.12)` }"
                >
                  <UIcon :name="card.icon" class="size-4" :style="{ color: card.light }" />
                </div>
              </div>
            </div>
          </div>

          <!-- ═══ TOOLBAR ════════════════════════════════════════════════════ -->
          <div class="inv-toolbar flex flex-wrap items-center justify-between gap-3 px-1">
            <div class="flex flex-wrap items-center gap-3">
              <UInput
                v-model="searchQuery"
                icon="i-lucide-search"
                size="sm"
                placeholder="Search invoices..."
                class="w-60"
              />
              <span class="text-xs" style="color: var(--dashboard-text-muted);">
                Drag cards between columns to update invoice status.
              </span>
            </div>

            <div class="flex items-center gap-3">
              <span class="text-xs tabular-nums" style="color: var(--dashboard-text-muted);">
                {{ filteredInvoices.length }} total
              </span>

              <!-- Board / List toggle -->
              <div class="inv-view-toggle flex items-center rounded-lg p-0.5">
                <button
                  class="inv-toggle-btn"
                  :class="{ 'inv-toggle-active': viewMode === 'board' }"
                  @click="viewMode = 'board'"
                >
                  <UIcon name="i-lucide-layout-dashboard" class="size-3.5" />
                  Board
                </button>
                <button
                  class="inv-toggle-btn"
                  :class="{ 'inv-toggle-active': viewMode === 'list' }"
                  @click="viewMode = 'list'"
                >
                  <UIcon name="i-lucide-list" class="size-3.5" />
                  List
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="statusUpdateError"
            class="flex items-start gap-2 rounded-xl border px-4 py-3 text-sm"
            style="border-color: rgba(239, 68, 68, 0.28); background: rgba(239, 68, 68, 0.08); color: rgb(248, 113, 113);"
          >
            <UIcon name="i-lucide-alert-circle" class="mt-0.5 size-4 shrink-0" />
            <span>{{ statusUpdateError }}</span>
          </div>

          <!-- ═══ BOARD VIEW ═════════════════════════════════════════════════ -->
          <div v-if="viewMode === 'board'" class="inv-board flex min-h-0 flex-1 gap-4 overflow-x-auto pb-2">

            <div
              v-for="col in KANBAN_COLUMNS"
              :key="col.key"
              class="inv-col flex min-w-70 flex-1 flex-col"
              :class="{ 'inv-col-drop-active': dropTargetColumnKey === col.key }"
              :style="{ '--col-color': col.color, '--col-rgb': col.rgb }"
            >
              <!-- Column header -->
              <div
                class="inv-col-header flex items-center gap-2 rounded-t-xl px-4 py-3"
                :style="{ borderBottom: `2px solid rgba(${col.rgb}, 0.25)` }"
              >
                <div
                  class="flex size-7 shrink-0 items-center justify-center rounded-lg"
                  :style="{ background: `rgba(${col.rgb}, 0.15)` }"
                >
                  <UIcon :name="col.icon" class="size-3.5" :style="{ color: col.color }" />
                </div>
                <span class="truncate text-sm font-semibold" style="color: var(--dashboard-text-primary);">{{ col.label }}</span>
                <span
                  class="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
                  :style="{ background: `rgba(${col.rgb}, 0.15)`, color: col.color }"
                >
                  {{ columnInvoices(col.statuses).length }}
                </span>
              </div>

              <!-- Column body -->
              <div
                class="inv-col-body flex flex-1 flex-col gap-3 rounded-b-xl p-3"
                @dragover="handleColumnDragOver($event, col.key)"
                @dragenter="handleColumnDragEnter(col.key)"
                @dragleave="handleColumnDragLeave($event, col.key)"
                @drop.prevent="moveInvoiceToColumn(col.key)"
              >

                <!-- Loading skeletons -->
                <template v-if="loading">
                  <div v-for="n in 2" :key="n" class="inv-skeleton-card animate-pulse rounded-xl" />
                </template>

                <!-- Empty state -->
                <div
                  v-else-if="columnInvoices(col.statuses).length === 0"
                  class="flex flex-1 items-center justify-center rounded-xl border border-dashed py-10"
                  style="border-color: var(--dashboard-surface-border);"
                >
                  <p class="text-xs" style="color: var(--dashboard-text-muted);">{{ col.emptyText }}</p>
                </div>

                <!-- Invoice cards -->
                <template v-else>
                  <div
                    v-for="inv in columnInvoices(col.statuses)"
                    :key="inv.id"
                    class="inv-card"
                    :class="{
                      'inv-card-dragging': draggedInvoiceId === inv.id,
                      'inv-card-updating': isUpdatingInvoice(inv.id),
                    }"
                    :draggable="!isUpdatingInvoice(inv.id)"
                    tabindex="0"
                    role="button"
                    @dragstart="beginDrag($event, inv.id)"
                    @dragend="handleDragEnd"
                    @click="openInvoice(inv.id)"
                    @keydown.enter.prevent="openInvoice(inv.id)"
                    @keydown.space.prevent="openInvoice(inv.id)"
                  >
                    <!-- Card header: number + amount -->
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-2 min-w-0">
                        <div
                          class="flex size-6 shrink-0 items-center justify-center rounded-md"
                          :style="{ background: `rgba(${col.rgb}, 0.15)` }"
                        >
                          <UIcon :name="col.icon" class="size-3" :style="{ color: col.color }" />
                        </div>
                        <span class="truncate text-sm font-semibold" style="color: var(--dashboard-text-primary);">
                          {{ invoiceLabel(inv) }}
                        </span>
                      </div>
                      <span class="shrink-0 text-sm font-bold tabular-nums" style="color: var(--dashboard-text-primary);">
                        {{ inv.total_amount != null ? fmtMoney(inv.total_amount) : '—' }}
                      </span>
                    </div>

                    <!-- Center name -->
                    <div v-if="inv.center_name" class="mt-1 truncate text-xs font-medium" :style="{ color: col.color }">
                      {{ inv.center_name }}
                    </div>

                    <!-- Meta rows -->
                    <div class="mt-3 space-y-1.5">
                      <div class="inv-meta-row">
                        <UIcon name="i-lucide-clock" class="inv-meta-icon" />
                        <span>Due {{ fmtDate(inv.due_date) }}</span>
                      </div>
                      <div class="inv-meta-row">
                        <UIcon name="i-lucide-calendar" class="inv-meta-icon" />
                        <span>{{ fmtDateRange(inv.date_range_start, inv.date_range_end) }}</span>
                      </div>
                      <div class="inv-meta-row">
                        <UIcon name="i-lucide-file-text" class="inv-meta-icon" />
                        <span>{{ itemCount(inv) }} · Created {{ fmtDate(inv.created_at) }}</span>
                      </div>
                    </div>

                    <div
                      v-if="isUpdatingInvoice(inv.id)"
                      class="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium"
                      style="color: var(--dashboard-text-muted);"
                    >
                      <UIcon name="i-lucide-loader-circle" class="size-3 animate-spin" />
                      Saving status...
                    </div>
                  </div>
                </template>

              </div>
            </div>

          </div>

          <!-- ═══ LIST VIEW ══════════════════════════════════════════════════ -->
          <div v-else class="inv-list-card overflow-hidden">
            <div class="divide-y" style="border-color: var(--dashboard-divider);">
              <!-- Header -->
              <div class="inv-list-header grid grid-cols-[1fr_150px_140px_110px_110px] items-center gap-4 px-5 py-2.5">
                <span>Invoice</span>
                <span>Date Range</span>
                <span>Leads</span>
                <span>Amount</span>
                <span>Status</span>
              </div>

              <!-- Loading -->
              <template v-if="loading">
                <div v-for="n in 5" :key="n" class="grid grid-cols-[1fr_150px_140px_110px_110px] items-center gap-4 px-5 py-4">
                  <div class="h-3 w-32 animate-pulse rounded" style="background: var(--dashboard-surface-border);" />
                  <div class="h-2.5 w-24 animate-pulse rounded" style="background: var(--dashboard-surface-border);" />
                  <div class="h-2.5 w-28 animate-pulse rounded" style="background: var(--dashboard-surface-border);" />
                  <div class="h-3 w-16 animate-pulse rounded" style="background: var(--dashboard-surface-border);" />
                  <div class="h-5 w-16 animate-pulse rounded-md" style="background: var(--dashboard-surface-border);" />
                </div>
              </template>

              <!-- Empty -->
              <template v-else-if="filteredInvoices.length === 0">
                <div class="flex flex-col items-center justify-center gap-3 py-14 text-center">
                  <UIcon name="i-lucide-receipt" class="size-9 opacity-20" />
                  <p class="text-sm font-medium" style="color: var(--dashboard-text-primary);">No invoices found</p>
                  <p class="text-xs" style="color: var(--dashboard-text-muted);">
                    {{ searchQuery ? 'Try adjusting your search.' : 'Your invoices will appear here once created.' }}
                  </p>
                </div>
              </template>

              <!-- Rows -->
              <template v-else>
                <div
                  v-for="inv in filteredInvoices"
                  :key="inv.id"
                  class="inv-list-row grid grid-cols-[1fr_150px_140px_110px_110px] items-center gap-4 px-5 py-3.5"
                  tabindex="0"
                  role="button"
                  @click="openInvoice(inv.id)"
                  @keydown.enter.prevent="openInvoice(inv.id)"
                  @keydown.space.prevent="openInvoice(inv.id)"
                >
                  <div class="min-w-0">
                    <div class="text-sm font-semibold" style="color: var(--dashboard-text-primary);">{{ invoiceLabel(inv) }}</div>
                    <div class="text-[11px]" style="color: var(--dashboard-text-muted);">Created {{ fmtDate(inv.created_at) }}</div>
                  </div>
                  <div class="truncate text-xs" style="color: var(--dashboard-text-secondary);">
                    {{ fmtDateRange(inv.date_range_start, inv.date_range_end) }}
                  </div>
                  <div class="truncate text-xs" style="color: var(--dashboard-text-muted);" :title="inv.lead_names || undefined">
                    {{ inv.lead_names || '—' }}
                  </div>
                  <div class="text-sm font-semibold tabular-nums" style="color: var(--dashboard-text-primary);">
                    {{ inv.total_amount != null ? fmtMoney(inv.total_amount) : '—' }}
                  </div>
                  <div>
                    <span
                      class="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold"
                      :style="{
                        background: `rgba(${statusRgb(inv.status)}, 0.12)`,
                        color: statusColor(inv.status),
                      }"
                    >
                      {{ statusLabel(inv.status) }}
                    </span>
                  </div>
                </div>
              </template>
            </div>
          </div>

        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* ── Stat cards ──────────────────────────────────────────────────────────── */
.inv-stat-card {
  position: relative;
  border: 1px solid var(--dashboard-surface-border);
  border-top: 3px solid var(--card-accent, var(--ap-accent));
  border-radius: 1rem;
  background: var(--dashboard-surface);
  box-shadow: var(--dashboard-surface-shadow);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: box-shadow 300ms ease, transform 300ms ease;
}

.inv-stat-card:hover {
  box-shadow: var(--dashboard-surface-shadow-hover);
}

.inv-card-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--card-light, var(--ap-accent));
  margin-bottom: 4px;
}

.inv-card-value {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--dashboard-text-primary);
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
.inv-view-toggle {
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-surface-border);
}

.inv-toggle-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  color: var(--dashboard-text-muted);
  transition: all 150ms ease;
  cursor: pointer;
}

.inv-toggle-btn:hover {
  color: var(--dashboard-text-primary);
}

.inv-toggle-active {
  background: var(--ap-accent, #ae4010);
  color: #fff !important;
}

/* ── Board ───────────────────────────────────────────────────────────────── */
.inv-board {
  align-items: stretch;
}

.inv-col {
  min-height: 420px;
}

.inv-col-header {
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-surface-border);
  border-bottom: none;
}

.inv-col-body {
  background: rgba(0, 0, 0, 0.015);
  border: 1px solid var(--dashboard-surface-border);
  border-top: none;
  transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}

.dark .inv-col-body {
  background: rgba(255, 255, 255, 0.015);
}

.inv-col-drop-active .inv-col-body {
  border-color: rgba(var(--col-rgb, 174, 64, 16), 0.45);
  background: rgba(var(--col-rgb, 174, 64, 16), 0.08);
  box-shadow: inset 0 0 0 1px rgba(var(--col-rgb, 174, 64, 16), 0.12);
}

.inv-skeleton-card {
  height: 112px;
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-surface-border);
}

/* ── Invoice card ────────────────────────────────────────────────────────── */
.inv-card {
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-surface-border);
  box-shadow: var(--dashboard-surface-shadow);
  transition: box-shadow 200ms ease, transform 200ms ease, border-color 200ms ease;
  cursor: grab;
}

.inv-card:hover {
  box-shadow: 0 6px 20px rgba(var(--col-rgb, 0,0,0), 0.10);
  border-color: rgba(var(--col-rgb, 0,0,0), 0.25);
  transform: translateY(-1px);
}

.inv-card:active {
  cursor: grabbing;
}

.inv-card-dragging {
  opacity: 0.45;
  transform: scale(0.98);
}

.inv-card-updating {
  opacity: 0.72;
  cursor: progress;
}

.inv-meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--dashboard-text-muted);
}

.inv-meta-icon {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  color: var(--dashboard-text-muted);
}

/* ── List view ───────────────────────────────────────────────────────────── */
.inv-list-card {
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-surface-border);
  border-radius: 1rem;
  box-shadow: var(--dashboard-surface-shadow);
}

.inv-list-header {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--dashboard-text-muted);
  background: rgba(0, 0, 0, 0.015);
}

.dark .inv-list-header {
  background: rgba(255, 255, 255, 0.015);
}

.inv-list-row {
  cursor: pointer;
  transition: background 150ms;
}

.inv-list-row:hover {
  background: rgba(0, 0, 0, 0.02);
}

.dark .inv-list-row:hover {
  background: rgba(255, 255, 255, 0.02);
}
</style>
