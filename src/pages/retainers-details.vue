<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'

type LeadRow = Record<string, unknown> & {
  id: string
  submission_id: string
  customer_full_name?: string | null
  phone_number?: string | null
  street_address?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
  email?: string | null
  social_security?: string | null
  lead_vendor?: string | null
  assigned_attorney_id?: string | null
  status?: string | null
  source_url?: string | null
  trustedform_cert_url?: string | null
  ip_address?: string | null
  submission_date?: string | null
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

type NoteRow = {
  id: string
  created_at: string
  agent: string
  note: string
}

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const canSeeLeadVendorUi = computed(() => auth.state.value.profile?.role === 'super_admin')

const id = computed(() => route.params.id as string)

const backTarget = computed(() => {
  const from = route.query.from
  if (typeof from !== 'string') return '/retainers'
  const normalized = from.trim()
  if (!normalized.startsWith('/')) return '/retainers'
  if (normalized.startsWith('//')) return '/retainers'
  return normalized
})

const goBack = () => {
  router.push(backTarget.value)
}

const loading = ref(false)
const error = ref<string | null>(null)
const row = ref<LeadRow | null>(null)
const assignedAttorneyName = ref<string>('—')
const callResults = ref<CallResult[]>([])
const activeTab = ref('basic')

const tabs = [
  { label: 'Basic Information', icon: 'i-lucide-user', value: 'basic' },
  { label: 'Accident Details', icon: 'i-lucide-car', value: 'accident' },
  { label: 'Notes', icon: 'i-lucide-sticky-note', value: 'notes' }
]

const headerTitle = computed(() => {
  if (!row.value) return 'Lead details'
  const name = row.value.customer_full_name || 'Unknown'
  const phone = row.value.phone_number || 'N/A'
  return `${name} - ${phone}`
})
// Call Updates are matched only by submission_id (no vendor/name/phone filtering).

const customerAddress = computed(() => {
  if (!row.value) return null

  const street = String(row.value.street_address || '').trim()
  const city = String(row.value.city || '').trim()
  const state = String(row.value.state || '').trim()
  const zip = String(row.value.zip_code || '').trim()

  const line2 = [city, state].filter(Boolean).join(city && state ? ', ' : '')
  const line2WithZip = [line2, zip].filter(Boolean).join(line2 && zip ? ' ' : '')
  return [street, line2WithZip].filter(Boolean).join(', ')
})

const buildLeadQuery = (canSeeAll: boolean, leadVendor: string | null) => {
  let q = supabase
    .from('leads')
    .select('*')

  if (!canSeeAll && leadVendor) {
    q = q.eq('lead_vendor', leadVendor)
  }

  return q
}

const resolveLeadRecord = async (canSeeAll: boolean, leadVendor: string | null) => {
  const { data: directLead, error: directLeadError } = await buildLeadQuery(canSeeAll, leadVendor)
    .eq('id', id.value)
    .maybeSingle()

  if (directLeadError) throw directLeadError
  if (directLead) return directLead as LeadRow

  let flowQuery = supabase
    .from('daily_deal_flow')
    .select('submission_id')
    .eq('id', id.value)

  if (!canSeeAll && leadVendor) {
    flowQuery = flowQuery.eq('lead_vendor', leadVendor)
  }

  const { data: flowRecord, error: flowError } = await flowQuery.maybeSingle()

  if (flowError) throw flowError
  if (!flowRecord?.submission_id) return null

  const { data: leadBySubmission, error: leadBySubmissionError } = await buildLeadQuery(canSeeAll, leadVendor)
    .eq('submission_id', String(flowRecord.submission_id))
    .maybeSingle()

  if (leadBySubmissionError) throw leadBySubmissionError

  return (leadBySubmission as LeadRow | null) ?? null
}

const load = async () => {
  loading.value = true
  error.value = null
  assignedAttorneyName.value = '—'

  try {
    await auth.init()

    const canSeeAll = auth.canSeeAll.value
    const leadVendor = auth.resolvedLeadVendor.value

    if (!canSeeAll && !leadVendor) {
      error.value = 'Lead not found'
      row.value = null
      return
    }

    const data = await resolveLeadRecord(canSeeAll, leadVendor)

    if (!data) {
      error.value = 'Lead not found'
      row.value = null
      return
    }

    row.value = data as LeadRow

    // Resolve assigned attorney display name from the ID.
    try {
      const assignedAttorneyId = row.value?.assigned_attorney_id
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
  return [
    { key: 'customer_full_name', label: 'Customer Name', value: row.value.customer_full_name },
    { key: 'phone_number', label: 'Phone Number', value: row.value.phone_number },
    { key: 'customer_address', label: 'Customer Address', value: customerAddress.value },
    { key: 'social_security', label: 'SSN Number', value: row.value.social_security },
    { key: 'zip_code', label: 'Zip', value: row.value.zip_code },
    { key: 'email', label: 'Email', value: row.value.email },
    { key: 'status', label: 'Status', value: row.value.status },
    { key: 'ip_address', label: 'IP Address', value: row.value.ip_address },
    { key: 'source_url', label: 'Source URL', value: row.value.source_url },
    { key: 'trustedform_cert_url', label: 'TrustedForm Cert URL', value: row.value.trustedform_cert_url },
    ...(canSeeLeadVendorUi.value
      ? [{ key: 'lead_vendor', label: 'Lead Vendor', value: row.value.lead_vendor }]
      : []),
    { key: 'assigned_attorney', label: 'Assigned Attorney', value: assignedAttorneyName.value },
    { key: 'submission_date', label: 'Submission Date', value: row.value.submission_date || row.value.created_at }
  ]
})

const accidentDetailsFields = computed(() => {
  if (!row.value) return []
  return [
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
  ].map(([key, label]) => ({ key, label, value: row.value?.[key] }))
})

const noteRows = computed<NoteRow[]>(() => {
  return callResults.value
    .map((r) => {
      const note = (r.notes ?? '').trim()
      if (!note) return null
      return {
        id: r.id,
        created_at: formatDateTime(r.created_at),
        agent: r.agent_who_took_call ?? r.submitting_agent ?? '—',
        note
      }
    })
    .filter((v): v is NoteRow => Boolean(v))
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
            @click="goBack"
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
        <UTabs
          v-model="activeTab"
          :items="tabs"
          :ui="{ list: 'flex w-full', trigger: 'flex-1 justify-center' }"
        >
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

            <UCard v-else-if="item.value === 'notes'">
              <div v-if="noteRows.length === 0" class="py-8 text-center text-muted">
                No notes found
              </div>
              <div v-else class="space-y-3">
                <div
                  v-for="n in noteRows"
                  :key="n.id"
                  class="rounded-lg border border-default bg-elevated/20 p-3"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                    <div class="font-medium text-highlighted">{{ n.agent }}</div>
                    <div>{{ n.created_at }}</div>
                  </div>
                  <div class="mt-2 whitespace-pre-wrap text-sm text-highlighted">
                    {{ n.note }}
                  </div>
                </div>
              </div>
            </UCard>
          </template>
        </UTabs>
      </div>
    </template>
  </UDashboardPanel>
</template>
