<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { TableColumn } from '@nuxt/ui'

import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'

type DailyDealFlow = Record<string, unknown> & {
  id: string
  submission_id: string
  insured_name?: string | null
  client_phone_number?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type CallResult = {
  id: string
  submission_id: string
  application_submitted: boolean
  status: string | null
  notes: string | null
  carrier: string | null
  product_type: string | null
  draft_date: string | null
  new_draft_date: string | null
  submitting_agent: string | null
  agent_who_took_call: string | null
  call_source: string | null
  dq_reason: string | null
  monthly_premium: number | string | null
  coverage_amount: number | string | null
  face_amount: number | string | null
  submission_date: string | null
  created_at: string | null
  updated_at?: string | null
}

type CallUpdatesRow = {
  id: string
  agent: string
  created_at: string
  submission_date: string
  call_source: string
  status: string
  application_submitted: string
  carrier: string
  product_type: string
  draft_date: string
  monthly_premium: string
  notes: string
}

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const canSeeLeadVendorUi = computed(() => auth.state.value.profile?.role === 'super_admin')

const id = computed(() => route.params.id as string)

const loading = ref(false)
const error = ref<string | null>(null)
const row = ref<DailyDealFlow | null>(null)
const leadRow = ref<Record<string, unknown> | null>(null)
const assignedAttorneyName = ref<string>('—')
const callResults = ref<CallResult[]>([])
const activeTab = ref('basic')

const tabs = [
  { label: 'Basic Information', icon: 'i-lucide-user', value: 'basic' },
  { label: 'Accident Details', icon: 'i-lucide-car', value: 'accident' },
  { label: 'Insurance & Policy', icon: 'i-lucide-shield', value: 'insurance' },
  { label: 'Call Updates', icon: 'i-lucide-phone', value: 'calls' }
]

const headerTitle = computed(() => {
  if (!row.value) return 'Lead details'
  const name = row.value.insured_name || 'Unknown'
  const phone = row.value.client_phone_number || 'N/A'
  return `${name} - ${phone}`
})

const normalizePhone = (value: unknown) => {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\D/g, '')
}
// Call Updates are matched only by submission_id (no vendor/name/phone filtering).

const customerAddress = computed(() => {
  const lead = leadRow.value
  if (lead) {
    const street = (lead.street_address ?? lead.address ?? lead.customer_address ?? '') as unknown
    const city = (lead.city ?? '') as unknown
    const state = (lead.state ?? lead.province ?? '') as unknown
    const zip = (lead.zip ?? lead.zip_code ?? lead.postal_code ?? '') as unknown

    const streetStr = street ? String(street).trim() : ''
    const cityStr = city ? String(city).trim() : ''
    const stateStr = state ? String(state).trim() : ''
    const zipStr = zip ? String(zip).trim() : ''

    const line2 = [cityStr, stateStr].filter(Boolean).join(cityStr && stateStr ? ', ' : '')
    const line2WithZip = [line2, zipStr].filter(Boolean).join(line2 && zipStr ? ' ' : '')
    return [streetStr, line2WithZip].filter(Boolean).join(', ')
  }

  return ((row.value as any)?.contact_address ?? null) as unknown
})

const load = async () => {
  loading.value = true
  error.value = null
  leadRow.value = null
  assignedAttorneyName.value = '—'

  try {
    await auth.init()

    const isAdmin = auth.state.value.profile?.role === 'admin'
    const isSuperAdmin = auth.state.value.profile?.role === 'super_admin'
    const canSeeAll = isSuperAdmin || isAdmin
    const centerId = auth.state.value.profile?.center_id ?? null
    let leadVendor = auth.state.value.profile?.lead_vendor ?? null

    if (!canSeeAll && !leadVendor && centerId) {
      const { data: center, error: centerError } = await supabase
        .from('centers')
        .select('lead_vendor')
        .eq('id', centerId)
        .maybeSingle()

      if (centerError) throw centerError
      leadVendor = (center?.lead_vendor as string | null) ?? null
    }

    if (!canSeeAll && !leadVendor) {
      error.value = 'Lead not found'
      row.value = null
      return
    }

    let q = supabase
      .from('daily_deal_flow')
      .select('*')
      .eq('id', id.value)

    if (!canSeeAll) {
      q = q.eq('lead_vendor', leadVendor)
    }

    const { data, error: supaError } = await q.maybeSingle()

    if (supaError) throw supaError
    if (!data) {
      error.value = 'Lead not found'
      row.value = null
      return
    }

    row.value = data as DailyDealFlow
    console.log('✅ Lead data loaded:', row.value)
    console.log('📋 All fields:', Object.keys(row.value))

    // Resolve assigned attorney display name from the ID.
    try {
      const assignedAttorneyId = (row.value as any)?.assigned_attorney_id as string | null | undefined
      if (assignedAttorneyId) {
        const { data: attorney, error: attorneyError } = await supabase
          .from('attorney_profiles')
          .select('full_name')
          .eq('user_id', assignedAttorneyId)
          .maybeSingle()

        if (attorneyError) {
          console.warn('[attorney_profiles] lookup failed', attorneyError.message)
        } else {
          assignedAttorneyName.value = (attorney?.full_name as string | null) ?? '—'
        }
      }
    } catch (attorneyLookupError) {
      console.warn('[attorney_profiles] lookup failed', attorneyLookupError)
    }

    // Load matching lead record (used for address fields)
    try {
      const submissionId = row.value.submission_id
      if (submissionId) {
        const { data: leadBySubmission, error: leadBySubmissionError } = await supabase
          .from('leads')
          .select('*')
          .eq('submission_id', submissionId)
          .maybeSingle()

        if (!leadBySubmissionError && leadBySubmission) {
          leadRow.value = leadBySubmission as Record<string, unknown>
        } else if (leadBySubmissionError) {
          console.warn('[leads] lookup by submission_id failed', leadBySubmissionError.message)
        }
      }

      if (!leadRow.value) {
        const fullName = (row.value.insured_name ?? '').trim()
        const phoneRaw = row.value.client_phone_number ?? ''
        if (fullName) {
          const { data: candidates, error: leadByNameError } = await supabase
            .from('leads')
            .select('*')
            .ilike('customer_full_name', fullName)
            .limit(25)

          if (leadByNameError) {
            console.warn('[leads] lookup by customer_full_name failed', leadByNameError.message)
          } else if (candidates?.length) {
            const targetPhone = normalizePhone(phoneRaw)
            const phoneKeys = ['phone', 'phone_number', 'customer_phone', 'customer_phone_number', 'client_phone_number', 'contact_number']

            let matched: Record<string, unknown> | null = null
            if (targetPhone) {
              for (const candidate of candidates as any[]) {
                for (const key of phoneKeys) {
                  const candPhone = normalizePhone(candidate?.[key])
                  if (candPhone && candPhone === targetPhone) {
                    matched = candidate as Record<string, unknown>
                    break
                  }
                }
                if (matched) break
              }
            }

            leadRow.value = matched ?? (candidates[0] as Record<string, unknown>)
          }
        }
      }
    } catch (leadLookupError) {
      console.warn('[leads] lookup failed', leadLookupError)
    }

    // Load call results by submission_id only.
    const submissionId = row.value.submission_id
    const baseSelect =
      'id,submission_id,application_submitted,status,notes,carrier,product_type,draft_date,new_draft_date,submitting_agent,agent_who_took_call,call_source,dq_reason,monthly_premium,coverage_amount,face_amount,submission_date,created_at,updated_at'

    if (!submissionId) {
      callResults.value = []
    } else {
      const { data: bySubmission, error: bySubmissionError } = await supabase
        .from('call_results')
        .select(baseSelect)
        .eq('submission_id', submissionId)
        .order('created_at', { ascending: false })

      if (bySubmissionError) throw bySubmissionError
      callResults.value = (bySubmission ?? []) as CallResult[]
    }

    console.log('📞 Call results loaded:', callResults.value.length, 'records', { submissionId })
    if (callResults.value[0]) {
      console.log('📞 Call result fields:', Object.keys(callResults.value[0] as Record<string, unknown>))
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load lead'
    error.value = msg
  } finally {
    loading.value = false
  }
}

onMounted(load)

const basicInfoFields = computed(() => {
  if (!row.value) return []
  const lead = leadRow.value as any
  const fields = [
    { key: 'insured_name', label: 'Customer Name', value: (row.value as any).insured_name },
    { key: 'client_phone_number', label: 'Phone Number', value: (row.value as any).client_phone_number },
    { key: 'customer_address', label: 'Customer Address', value: customerAddress.value },
    { key: 'social_security', label: 'SSN Number', value: lead?.social_security },
    { key: 'zip_code', label: 'Zip', value: lead?.zip_code },
    { key: 'email', label: 'Email', value: lead?.email },
    { key: 'status', label: 'Status', value: (row.value as any).status },
    { key: 'ip_address', label: 'IP Address', value: (row.value as any).ip_address },
    { key: 'source_url', label: 'Source URL', value: (row.value as any).source_url },
    { key: 'trustedform_cert_url', label: 'TrustedForm Cert URL', value: (row.value as any).trustedform_cert_url },
    ...(canSeeLeadVendorUi.value
      ? [{ key: 'lead_vendor', label: 'Lead Vendor', value: (row.value as any).lead_vendor }]
      : []),
    { key: 'assigned_attorney', label: 'Assigned Attorney', value: assignedAttorneyName.value },
    { key: 'date', label: 'Submission Date', value: (row.value as any).date }
  ]
  console.log('👤 Basic Info Fields:', fields)
  return fields
})

const accidentDetailsFields = computed(() => {
  if (!row.value) return []
  const fields = [
    ['accident_date', 'Accident Date'],
    ['accident_location', 'Accident Location'],
    ['accident_scenario', 'Accident Scenario'],
    ['accident_last_12_months', 'Accident (Last 12 Months)'],
    ['is_lead_at_fault', 'Lead At Fault'],
    ['currently_represented', 'Currently Represented'],
    ['is_injured', 'Injured'],
    ['received_medical_treatment', 'Received Medical Treatment'],
    ['prior_attorney_involved', 'Prior Attorney Involved'],
    ['prior_attorney_details', 'Prior Attorney Details'],
    ['medical_attention', 'Medical Attention'],
    ['police_attended', 'Police Attended'],
    ['injuries', 'Injuries'],
    ['other_party_admit_fault', 'Other Party Admit Fault'],
    ['passengers_count', 'Passengers Count']
  ].map(([key, label]) => ({ key, label, value: (row.value as any)[key] }))
  console.log('🚗 Accident Details Fields:', fields)
  return fields
})

const insurancePolicyFields = computed(() => {
  if (!row.value) return []
  const fields = [
    ['insured', 'Insured'],
    ['insurance_company', 'Insurance Company'],
    ['vehicle_registration', 'Vehicle Registration'],
    ['third_party_vehicle_registration', 'Third Party Vehicle Registration']
  ].map(([key, label]) => ({ key, label, value: (row.value as any)[key] }))
  console.log('🛡️ Insurance Policy Fields:', fields)
  return fields
})

const callUpdatesColumns: TableColumn<CallUpdatesRow>[] = [
  { accessorKey: 'agent', header: 'Agent' },
  { accessorKey: 'created_at', header: 'Created' },
  { accessorKey: 'submission_date', header: 'Submission Date' },
  { accessorKey: 'call_source', header: 'Call Source' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'application_submitted', header: 'Application' },
  { accessorKey: 'carrier', header: 'Carrier' },
  { accessorKey: 'product_type', header: 'Product Type' },
  { accessorKey: 'draft_date', header: 'Draft Date' },
  { accessorKey: 'monthly_premium', header: 'Monthly Premium' },
  { accessorKey: 'notes', header: 'Notes', meta: { class: { th: 'w-96 max-w-96', td: 'w-96 max-w-96' } } }
]

const callUpdatesRows = computed<CallUpdatesRow[]>(() => {
  return callResults.value.map((r) => ({
    id: r.id,
    agent: r.agent_who_took_call ?? r.submitting_agent ?? '—',
    created_at: formatDateTime(r.created_at),
    submission_date: formatDateOnly(r.submission_date),
    call_source: formatValue(r.call_source),
    status: formatValue(r.status),
    application_submitted: r.application_submitted ? 'Submitted' : 'Not submitted',
    carrier: formatValue(r.carrier),
    product_type: formatValue(r.product_type),
    draft_date: formatDateOnly(r.new_draft_date || r.draft_date),
    monthly_premium: formatValue(r.monthly_premium),
    notes: formatValue(r.notes)
  }))
})

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  })
}
</script>

<template>
  <UDashboardPanel id="retainer-details">
    <template #header>
      <UDashboardNavbar :title="headerTitle">
        <template #leading>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            @click="router.push('/retainers')"
          >
            Back
          </UButton>
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
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        title="Unable to load lead"
        :description="error"
      />

      <div v-else-if="loading" class="flex h-full min-h-64 items-center justify-center">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-dimmed" />
      </div>

      <div v-else-if="row" class="space-y-4">
        <UTabs v-model="activeTab" :items="tabs">
          <template #content="{ item }">
            <UCard v-if="item.value === 'basic'">
              <div class="grid gap-4 md:grid-cols-2">
                <div
                  v-for="field in basicInfoFields"
                  :key="field.key"
                  class="rounded-lg border border-default bg-elevated/20 p-3"
                >
                  <div class="text-xs uppercase tracking-wide text-muted">
                    {{ field.label }}
                  </div>
                  <div class="mt-1 text-sm text-highlighted wrap-break-word">
                    {{ formatValue(field.value) }}
                  </div>
                </div>
              </div>
            </UCard>

            <UCard v-else-if="item.value === 'accident'">
              <div class="grid gap-4 md:grid-cols-2">
                <div
                  v-for="field in accidentDetailsFields"
                  :key="field.key"
                  class="rounded-lg border border-default bg-elevated/20 p-3"
                >
                  <div class="text-xs uppercase tracking-wide text-muted">
                    {{ field.label }}
                  </div>
                  <div class="mt-1 text-sm text-highlighted wrap-break-word">
                    {{ formatValue(field.value) }}
                  </div>
                </div>
              </div>
            </UCard>

            <UCard v-else-if="item.value === 'insurance'">
              <div class="grid gap-4 md:grid-cols-2">
                <div
                  v-for="field in insurancePolicyFields"
                  :key="field.key"
                  class="rounded-lg border border-default bg-elevated/20 p-3"
                >
                  <div class="text-xs uppercase tracking-wide text-muted">
                    {{ field.label }}
                  </div>
                  <div class="mt-1 text-sm text-highlighted wrap-break-word">
                    {{ formatValue(field.value) }}
                  </div>
                </div>
              </div>
            </UCard>

            <UCard v-else-if="item.value === 'calls'">
              <div v-if="callResults.length === 0" class="py-8 text-center text-muted">
                No call results found
              </div>
              <div v-else class="-mx-4 overflow-x-auto px-4">
                <UTable
                  :columns="callUpdatesColumns"
                  :data="callUpdatesRows"
                  class="min-w-275"
                >
                  <template #notes-cell="{ row }">
                    <div class="max-w-96 truncate">
                      {{ row.original.notes }}
                    </div>
                  </template>
                </UTable>
              </div>
            </UCard>
          </template>
        </UTabs>
      </div>
    </template>
  </UDashboardPanel>
</template>
