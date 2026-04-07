<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { getAttorneyProfile, type AttorneyProfileRow } from '../lib/attorney-profile'
import { supabase } from '../lib/supabase'

type InvoiceStatus = 'billable' | 'pending' | 'in_review' | 'signed_awaiting' | 'in_preview' | 'paid' | 'chargeback'

type RawInvoiceItem = {
  description?: unknown
  quantity?: unknown
  unit_price?: unknown
  amount?: unknown
}

type InvoiceItem = {
  description: string
  quantity: number
  unit_price: number
  amount: number
}

type InvoiceRow = {
  id: string
  invoice_number: string | null
  lawyer_id: string | null
  lead_vendor_id: string | null
  invoice_type: string | null
  date_range_start: string | null
  date_range_end: string | null
  deal_ids: string[]
  items: InvoiceItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  total_amount: number
  status: InvoiceStatus
  notes: string | null
  due_date: string | null
  created_at: string | null
  updated_at: string | null
}

const route = useRoute()
const auth = useAuth()

const invoiceId = computed(() => String(route.params.id ?? '').trim() || null)

const loading = ref(true)
const error = ref<string | null>(null)
const invoice = ref<InvoiceRow | null>(null)

const lawyerInfo = ref<{
  full_name: string | null
  firm_name: string | null
  office_address: string | null
  primary_email: string | null
  direct_phone: string | null
  bar_association_number: string | null
} | null>(null)

const lawyerFallback = ref<{
  display_name: string | null
  email: string | null
} | null>(null)

const vendorInfo = ref<{
  center_name: string | null
  lead_vendor: string | null
  contact_email: string | null
} | null>(null)

const markingPaid = ref(false)
const markPaidError = ref<string | null>(null)
const requestingChargeback = ref(false)
const chargebackError = ref<string | null>(null)

const isPublisherInvoice = computed(() => invoice.value?.invoice_type === 'publisher')

const lawyerName = computed(() =>
  lawyerInfo.value?.full_name || lawyerFallback.value?.display_name || lawyerFallback.value?.email || '—'
)

const lawyerEmail = computed(() =>
  lawyerInfo.value?.primary_email || lawyerFallback.value?.email || '—'
)

const billToName = computed(() => {
  if (isPublisherInvoice.value) return vendorInfo.value?.center_name ?? vendorInfo.value?.lead_vendor ?? '—'
  return lawyerName.value
})

const billToSubName = computed(() => {
  if (isPublisherInvoice.value) return vendorInfo.value?.lead_vendor ?? null
  return lawyerInfo.value?.firm_name ?? null
})

const billToEmail = computed(() => {
  if (isPublisherInvoice.value) return vendorInfo.value?.contact_email ?? '—'
  return lawyerEmail.value
})

const invoiceAddress = computed(() => {
  if (isPublisherInvoice.value) return null
  return lawyerInfo.value?.office_address ?? null
})

const parseNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

const normalizeInvoiceItems = (value: unknown): InvoiceItem[] => {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is RawInvoiceItem => typeof item === 'object' && item !== null)
    .map((item, index) => {
      const amount = parseNumber(item.amount)
      const quantity = Math.max(1, parseNumber(item.quantity) || 1)
      const unitPrice = parseNumber(item.unit_price) || (quantity > 0 ? amount / quantity : amount)

      return {
        description: typeof item.description === 'string' && item.description.trim().length > 0
          ? item.description.trim()
          : `Line Item ${index + 1}`,
        quantity,
        unit_price: unitPrice,
        amount: amount || unitPrice * quantity,
      }
    })
}

const mapInvoiceRow = (row: Record<string, unknown>): InvoiceRow => ({
  id: String(row.id ?? ''),
  invoice_number: typeof row.invoice_number === 'string' ? row.invoice_number : null,
  lawyer_id: typeof row.lawyer_id === 'string' ? row.lawyer_id : null,
  lead_vendor_id: typeof row.lead_vendor_id === 'string' ? row.lead_vendor_id : null,
  invoice_type: typeof row.invoice_type === 'string' ? row.invoice_type : null,
  date_range_start: typeof row.date_range_start === 'string' ? row.date_range_start : null,
  date_range_end: typeof row.date_range_end === 'string' ? row.date_range_end : null,
  deal_ids: Array.isArray(row.deal_ids) ? row.deal_ids.filter((id): id is string => typeof id === 'string') : [],
  items: normalizeInvoiceItems(row.items),
  subtotal: parseNumber(row.subtotal),
  tax_rate: parseNumber(row.tax_rate),
  tax_amount: parseNumber(row.tax_amount),
  total_amount: parseNumber(row.total_amount),
  status: (typeof row.status === 'string' ? row.status : 'pending') as InvoiceStatus,
  notes: typeof row.notes === 'string' ? row.notes : null,
  due_date: typeof row.due_date === 'string' ? row.due_date : null,
  created_at: typeof row.created_at === 'string' ? row.created_at : null,
  updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
})

const getStatusLabel = (status: string) => {
  if (status === 'billable') return 'BILLABLE'
  if (status === 'pending') return 'BILLABLE'
  if (status === 'in_review') return 'IN REVIEW'
  if (status === 'signed_awaiting') return 'SIGNED - AWAITING PAYMENT'
  if (status === 'in_preview') return 'IN PREVIEW'
  if (status === 'paid') return 'PAID'
  return 'CHARGEBACK'
}

const getStatusClass = (status: string) => {
  if (status === 'billable') return 'status-billable'
  if (status === 'paid') return 'status-paid'
  if (status === 'pending') return 'status-pending'
  if (status === 'in_review') return 'status-in-review'
  if (status === 'signed_awaiting') return 'status-signed-awaiting'
  if (status === 'in_preview') return 'status-in-preview'
  return 'status-chargeback'
}

const formatMoney = (n: number) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
  } catch {
    return `$${n.toFixed(2)}`
  }
}

const formatDate = (value: string | null) => {
  if (!value) return '—'
  try {
    const d = new Date(value)
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch {
    return value
  }
}

const formatDateShort = (value: string | null) => {
  if (!value) return '—'
  try {
    const d = new Date(value)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return value
  }
}

const handlePrint = () => {
  window.print()
}

const updateInvoiceStatus = async (nextStatus: InvoiceStatus) => {
  if (!invoice.value) return

  const { data, error: updateError } = await supabase
    .from('invoices')
    .update({ status: nextStatus })
    .eq('id', invoice.value.id)
    .select('id,invoice_number,lawyer_id,lead_vendor_id,invoice_type,date_range_start,date_range_end,deal_ids,items,subtotal,tax_rate,tax_amount,total_amount,status,notes,due_date,created_at,updated_at')
    .maybeSingle()

  if (updateError) throw new Error(updateError.message || 'Failed to update invoice')
  if (!data) throw new Error('Invoice update was blocked by permissions.')

  invoice.value = mapInvoiceRow(data as Record<string, unknown>)
}

const handleMarkAsPaid = async () => {
  if (!invoice.value || !['in_review', 'signed_awaiting', 'in_preview'].includes(invoice.value.status)) return
  markingPaid.value = true
  markPaidError.value = null
  try {
    await updateInvoiceStatus('paid')
  } catch (e) {
    markPaidError.value = e instanceof Error ? e.message : 'Failed to mark as paid'
  } finally {
    markingPaid.value = false
  }
}

const handleRequestChargeback = async () => {
  if (!invoice.value || invoice.value.status !== 'paid') return
  requestingChargeback.value = true
  chargebackError.value = null
  try {
    await updateInvoiceStatus('chargeback')
  } catch (e) {
    chargebackError.value = e instanceof Error ? e.message : 'Failed to request chargeback'
  } finally {
    requestingChargeback.value = false
  }
}

const loadInvoice = async () => {
  loading.value = true
  error.value = null
  invoice.value = null
  lawyerInfo.value = null
  lawyerFallback.value = null
  vendorInfo.value = null
  markPaidError.value = null
  chargebackError.value = null

  try {
    await auth.init()

    if (!invoiceId.value) {
      error.value = 'No invoice ID provided'
      return
    }

    const centerId = auth.state.value.profile?.center_id
    const canSeeAll = auth.canSeeAll.value

    let query = supabase
      .from('invoices')
      .select('id,invoice_number,lawyer_id,lead_vendor_id,invoice_type,date_range_start,date_range_end,deal_ids,items,subtotal,tax_rate,tax_amount,total_amount,status,notes,due_date,created_at,updated_at')
      .eq('id', invoiceId.value)

    if (!canSeeAll) {
      if (!centerId) {
        error.value = 'Invoice not found'
        return
      }

      query = query
        .eq('invoice_type', 'publisher')
        .eq('lead_vendor_id', centerId)
    }

    const { data, error: invoiceError } = await query.maybeSingle()

    if (invoiceError) {
      throw new Error(invoiceError.message || 'Failed to load invoice')
    }

    if (!data) {
      error.value = 'Invoice not found'
      return
    }

    const inv = mapInvoiceRow(data as Record<string, unknown>)
    invoice.value = inv

    if (inv.invoice_type === 'publisher' && inv.lead_vendor_id) {
      const { data: center } = await supabase
        .from('centers')
        .select('center_name,lead_vendor,contact_email')
        .eq('id', inv.lead_vendor_id)
        .maybeSingle()

      vendorInfo.value = center
        ? {
            center_name: (center as Record<string, unknown>).center_name as string | null,
            lead_vendor: (center as Record<string, unknown>).lead_vendor as string | null,
            contact_email: (center as Record<string, unknown>).contact_email as string | null,
          }
        : null
    } else if (inv.lawyer_id) {
      try {
        const profile = await getAttorneyProfile(inv.lawyer_id)
        if (profile) {
          const row = profile as AttorneyProfileRow
          lawyerInfo.value = {
            full_name: row.full_name ?? null,
            firm_name: row.firm_name ?? null,
            office_address: row.office_address ?? null,
            primary_email: row.primary_email ?? null,
            direct_phone: row.direct_phone ?? null,
            bar_association_number: row.bar_association_number ?? null,
          }
        }
      } catch {
        lawyerInfo.value = null
      }

      const { data: appUser } = await supabase
        .from('app_users')
        .select('display_name,email')
        .eq('user_id', inv.lawyer_id)
        .maybeSingle()

      lawyerFallback.value = appUser
        ? {
            display_name: (appUser as Record<string, unknown>).display_name as string | null,
            email: (appUser as Record<string, unknown>).email as string | null,
          }
        : null
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load invoice'
  } finally {
    loading.value = false
  }
}

watch(invoiceId, () => {
  loadInvoice()
}, { immediate: true })
</script>

<template>
  <div class="invoice-pdf-page">
    <div v-if="loading" class="loading-state">
      <div class="spinner" />
      <p>Loading invoice...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
    </div>

    <div v-else-if="invoice" class="invoice-container">
      <div class="print-actions no-print">
        <button
          v-if="['in_review', 'signed_awaiting', 'in_preview'].includes(invoice.status)"
          class="mark-paid-btn"
          :disabled="markingPaid"
          @click="handleMarkAsPaid"
        >
          {{ markingPaid ? 'Marking...' : 'Mark as Paid' }}
        </button>
        <button
          v-if="invoice.status === 'paid'"
          class="chargeback-btn"
          :disabled="requestingChargeback"
          @click="handleRequestChargeback"
        >
          {{ requestingChargeback ? 'Requesting...' : 'Request Chargeback' }}
        </button>
        <button class="print-btn" @click="handlePrint">
          Print / Save as PDF
        </button>
      </div>

      <div v-if="markPaidError" class="mark-paid-error no-print">
        {{ markPaidError }}
      </div>
      <div v-if="chargebackError" class="mark-paid-error no-print">
        {{ chargebackError }}
      </div>

      <div class="invoice-paper">
        <div class="accent-bar" />

        <div class="invoice-header">
          <div class="header-left">
            <img src="/assets/logo-black.png" alt="Accident Payments" class="company-logo">
          </div>
          <div class="header-right">
            <div class="invoice-title">INVOICE</div>
            <div class="invoice-number">{{ invoice.invoice_number ?? `INV-${invoice.id.slice(0, 8).toUpperCase()}` }}</div>
            <div :class="['status-badge', getStatusClass(invoice.status)]">
              {{ getStatusLabel(invoice.status) }}
            </div>
          </div>
        </div>

        <div class="divider" />

        <div class="billing-section">
          <div class="billing-from">
            <div class="billing-label">FROM</div>
            <div class="billing-name">Accident Payments</div>
            <div class="billing-detail">Motor Vehicle Accident Division</div>
            <div class="billing-detail">admin@accidentpayments.com</div>
          </div>

          <div class="billing-to">
            <div class="billing-label">BILL TO</div>
            <div class="billing-name">{{ billToName }}</div>
            <div v-if="billToSubName" class="billing-detail">{{ billToSubName }}</div>
            <div v-if="invoiceAddress" class="billing-detail">{{ invoiceAddress }}</div>
            <div class="billing-detail">{{ billToEmail }}</div>
          </div>

          <div class="billing-dates">
            <div class="date-row">
              <span class="date-label">Invoice Date</span>
              <span class="date-value">{{ formatDate(invoice.created_at) }}</span>
            </div>
            <div class="date-row">
              <span class="date-label">Due Date</span>
              <span class="date-value">{{ formatDate(invoice.due_date) }}</span>
            </div>
            <div class="date-row">
              <span class="date-label">Period</span>
              <span class="date-value">{{ formatDateShort(invoice.date_range_start) }} — {{ formatDateShort(invoice.date_range_end) }}</span>
            </div>
          </div>
        </div>

        <div class="items-section">
          <table class="items-table">
            <thead>
              <tr>
                <th class="th-num">#</th>
                <th class="th-desc">Description</th>
                <th class="th-qty">Qty</th>
                <th class="th-price">Unit Price</th>
                <th class="th-amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="invoice.items.length === 0">
                <td class="td-empty" colspan="5">No line items found.</td>
              </tr>
              <tr v-for="(item, idx) in invoice.items" :key="`${invoice.id}-${idx}`">
                <td class="td-num">{{ idx + 1 }}</td>
                <td class="td-desc">{{ item.description }}</td>
                <td class="td-qty">{{ item.quantity }}</td>
                <td class="td-price">{{ formatMoney(item.unit_price) }}</td>
                <td class="td-amount">{{ formatMoney(item.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="totals-section">
          <div class="totals-box">
            <div class="total-row">
              <span class="total-label">Subtotal</span>
              <span class="total-value">{{ formatMoney(invoice.subtotal) }}</span>
            </div>
            <div v-if="invoice.tax_rate > 0" class="total-row">
              <span class="total-label">Tax ({{ (invoice.tax_rate * 100).toFixed(1) }}%)</span>
              <span class="total-value">{{ formatMoney(invoice.tax_amount) }}</span>
            </div>
            <div class="total-row total-grand">
              <span class="total-label">Total Due</span>
              <span class="total-value">{{ formatMoney(invoice.total_amount) }}</span>
            </div>
          </div>
        </div>

        <div v-if="invoice.notes" class="notes-section">
          <div class="notes-label">Notes</div>
          <div class="notes-text">{{ invoice.notes }}</div>
        </div>

        <div class="invoice-footer">
          <div class="footer-left">
            <div class="footer-text">Thank you for your business.</div>
            <div class="footer-sub">Payment is due by {{ formatDate(invoice.due_date) }}.</div>
          </div>
          <div class="footer-right">
            <div class="footer-id">Invoice ID: {{ invoice.id }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.invoice-pdf-page {
  min-height: 100vh;
  background: #f5f0ec;
  font-family: 'Montserrat', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #141010;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 16px;
  color: #7c6a5a;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e8ddd3;
  border-top-color: #ae4010;
  border-radius: 50%;
  animation: invoice-spin 0.8s linear infinite;
}

@keyframes invoice-spin {
  to { transform: rotate(360deg); }
}

.error-state p {
  color: #ae4010;
  font-size: 14px;
}

.invoice-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 20px;
}

.print-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.back-btn,
.mark-paid-btn,
.chargeback-btn,
.print-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  font-family: inherit;
}

.back-btn {
  background: #7c6a5a;
}

.back-btn:hover {
  background: #655547;
}

.mark-paid-btn {
  background: #16a34a;
}

.mark-paid-btn:hover {
  background: #15803d;
}

.chargeback-btn {
  background: #b91c1c;
}

.chargeback-btn:hover {
  background: #991b1b;
}

.print-btn {
  background: #ae4010;
}

.print-btn:hover {
  background: #7c2c0a;
}

.mark-paid-btn:disabled,
.chargeback-btn:disabled,
.print-btn:disabled,
.back-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mark-paid-error {
  text-align: right;
  color: #b91c1c;
  font-size: 13px;
  margin-bottom: 12px;
}

.invoice-paper {
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 32px rgba(174, 64, 16, 0.06), 0 1px 4px rgba(0, 0, 0, 0.04);
  padding: 48px;
  position: relative;
  overflow: hidden;
}

.accent-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 5px;
  background: linear-gradient(90deg, #7c2c0a, #ae4010, #f7c480);
}

.invoice-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
  padding-top: 8px;
  gap: 20px;
}

.company-logo {
  height: 44px;
  width: auto;
  object-fit: contain;
}

.header-right {
  text-align: right;
}

.invoice-title {
  font-size: 30px;
  font-weight: 800;
  color: #ae4010;
  letter-spacing: 5px;
}

.invoice-number {
  font-size: 14px;
  font-weight: 600;
  color: #7c6a5a;
  margin-top: 4px;
}

.status-badge {
  display: inline-block;
  margin-top: 8px;
  padding: 4px 14px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
}

.status-billable {
  background: #eff6ff;
  color: #1d4ed8;
}

.status-paid {
  background: #e6f4ea;
  color: #1a7a3a;
}

.status-pending {
  background: #fef3e2;
  color: #ae4010;
}

.status-in-review {
  background: #f5f3ff;
  color: #6d28d9;
}

.status-signed-awaiting {
  background: #ecfdf5;
  color: #065f46;
}

.status-in-preview {
  background: #e0f2fe;
  color: #0369a1;
}

.status-chargeback {
  background: #fde8e8;
  color: #b91c1c;
}

.divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, #e8ddd3, transparent);
  margin: 24px 0;
}

.billing-section {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 32px;
  margin-bottom: 40px;
}

.billing-label {
  font-size: 10px;
  font-weight: 700;
  color: #ae4010;
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.billing-name {
  font-size: 15px;
  font-weight: 700;
  color: #141010;
  margin-bottom: 4px;
}

.billing-detail {
  font-size: 13px;
  color: #7c6a5a;
  line-height: 1.6;
  white-space: pre-wrap;
}

.billing-dates {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.date-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  background: #faf7f4;
  border-radius: 8px;
  border: 1px solid #f0e8e0;
}

.date-label {
  font-size: 12px;
  font-weight: 600;
  color: #9a8a7c;
}

.date-value {
  font-size: 13px;
  font-weight: 600;
  color: #141010;
  text-align: right;
}

.items-section {
  margin-bottom: 32px;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
}

.items-table thead tr {
  background: #faf7f4;
}

.items-table th {
  padding: 12px 16px;
  font-size: 10px;
  font-weight: 700;
  color: #ae4010;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  text-align: left;
  border-bottom: 2px solid #e8ddd3;
}

.th-num { width: 50px; }
.th-desc { width: auto; }
.th-qty { width: 80px; text-align: center; }
.th-price { width: 120px; text-align: right; }
.th-amount { width: 120px; text-align: right; }

.items-table td {
  padding: 14px 16px;
  font-size: 14px;
  color: #3d3530;
  border-bottom: 1px solid #f0e8e0;
}

.td-num {
  color: #9a8a7c;
  font-weight: 600;
  font-size: 13px;
}

.td-desc {
  font-weight: 500;
}

.td-qty {
  text-align: center;
  color: #7c6a5a;
}

.td-price {
  text-align: right;
  color: #7c6a5a;
  font-variant-numeric: tabular-nums;
}

.td-amount {
  text-align: right;
  font-weight: 600;
  color: #141010;
  font-variant-numeric: tabular-nums;
}

.td-empty {
  text-align: center;
  color: #9a8a7c;
}

.items-table tbody tr:last-child td {
  border-bottom: 2px solid #e8ddd3;
}

.totals-section {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 40px;
}

.totals-box {
  width: 300px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.total-label {
  font-size: 14px;
  color: #7c6a5a;
}

.total-value {
  font-size: 14px;
  font-weight: 600;
  color: #3d3530;
  font-variant-numeric: tabular-nums;
}

.total-grand {
  border-top: 2px solid #e8ddd3;
  margin-top: 8px;
  padding-top: 12px;
}

.total-grand .total-label {
  font-size: 16px;
  font-weight: 800;
  color: #141010;
}

.total-grand .total-value {
  font-size: 22px;
  font-weight: 800;
  color: #ae4010;
}

.notes-section {
  background: #faf7f4;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 40px;
  border: 1px solid #f0e8e0;
}

.notes-label {
  font-size: 10px;
  font-weight: 700;
  color: #ae4010;
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.notes-text {
  font-size: 13px;
  color: #7c6a5a;
  line-height: 1.6;
  white-space: pre-wrap;
}

.invoice-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  padding-top: 24px;
  border-top: 1px solid #e8ddd3;
}

.footer-text {
  font-size: 14px;
  font-weight: 600;
  color: #141010;
}

.footer-sub {
  font-size: 12px;
  color: #9a8a7c;
  margin-top: 4px;
}

.footer-id {
  font-size: 11px;
  color: #c4b8ac;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
}

@media print {
  .no-print,
  #dashboard-sidebar-default,
  [data-slot='resize-handle'],
  [data-slot='footer'] {
    display: none !important;
  }

  .invoice-pdf-page {
    background: white;
    padding: 0;
    min-height: auto;
  }

  .invoice-container {
    padding: 0;
    max-width: none;
  }

  .invoice-paper {
    box-shadow: none;
    border-radius: 0;
    padding: 24px;
  }

  body {
    margin: 0;
    padding: 0;
    background: white !important;
  }

  @page {
    margin: 0.5in;
    size: letter;
  }
}

@media (max-width: 768px) {
  .invoice-paper {
    padding: 24px;
  }

  .invoice-header {
    flex-direction: column;
  }

  .header-right {
    text-align: left;
  }

  .billing-section {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .items-table {
    font-size: 12px;
  }

  .items-table th,
  .items-table td {
    padding: 8px;
  }

  .invoice-footer {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
