<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  ALL_FILTER_VALUE,
  formatSourceTypeLabel,
  matchesPipelineDateRange,
  PIPELINE_DATE_RANGE_OPTIONS,
  resolvePipelineSourceType,
  resolvePipelineState,
  type PipelineDateRange
} from '../lib/pipeline-filters'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'
import { getSubmissionStageDescription, getSubmissionTierDetails } from '../lib/pipeline-stage-descriptions'
import {
  formatSubmissionCommission,
  formatSubmissionTierLabel,
  formatSubmissionTierShortLabel,
  getSubmissionTierBpoPrice,
  normalizeSubmissionTier,
  type SubmissionTierSnapshot
} from '../lib/submission-tier'
import { usePipelineStages } from '../composables/usePipelineStages'

const { stages: dbStages } = usePipelineStages('submission_portal', { publisherPortalView: true })

// --- Stage helpers ---
const STAGES = computed(() => dbStages.value.map((s) => ({
  key: s.key,
  label: s.label,
  description: getSubmissionStageDescription(s.key),
  tierDetails: getSubmissionTierDetails(s.key),
})))

/* UI helpers: palette for column accents (visual only) */
const STAGE_COLORS = [
  { accent: '#3b82f6', rgb: '59,130,246' },
  { accent: '#f59e0b', rgb: '245,158,11' },
  { accent: '#22c55e', rgb: '34,197,94' },
  { accent: '#ef4444', rgb: '239,68,68' },
  { accent: '#ae4010', rgb: '174,64,16' },
  { accent: '#8b5cf6', rgb: '139,92,246' },
  { accent: '#06b6d4', rgb: '6,182,212' },
  { accent: '#ec4899', rgb: '236,72,153' },
  { accent: '#14b8a6', rgb: '20,184,166' },
]

const getStageColor = (_key: string, index: number) => STAGE_COLORS[index % STAGE_COLORS.length]


const buildAllowedStatuses = () => dbStages.value.map(s => s.key)

type SubmissionPortalRow = Record<string, unknown> & {
  id: string
  submission_id: string
  date?: string | null
  // leads table uses customer_full_name; fall back to insured_name for legacy rows
  customer_full_name?: string | null
  insured_name?: string | null
  state?: string | null
  lead_vendor?: string | null
  // leads table uses phone / customer_phone; fall back to client_phone_number
  phone?: string | null
  customer_phone?: string | null
  client_phone_number?: string | null
  buffer_agent?: string | null
  agent?: string | null
  licensed_agent_account?: string | null
  assigned_attorney_id?: string | null
  status?: string | null
  notes?: string | null
  product_tier?: string | null
  product_tier_price?: string | number | null
  created_at?: string | null
  updated_at?: string | null
  has_submission_data?: boolean
  source_type?: string | null
}

type AttorneyProfile = {
  user_id: string
  full_name: string | null
  primary_email: string | null
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  return {}
}

const deriveStageKey = (row: SubmissionPortalRow): string => {
  const status = String(row.status || '').trim()
  if (!status) return STAGES.value[0]?.key ?? ''
  const matched = dbStages.value.find((s) => s.key === status)
  return matched ? matched.key : (STAGES.value[0]?.key ?? '')
}

const auth = useAuth()
const route = useRoute()
const router = useRouter()
const isBoardDragAndDropEnabled = false

const loading = ref(false)
const refreshing = ref(false)

const rows = ref<SubmissionPortalRow[]>([])
const attorneys = ref<AttorneyProfile[]>([])
const noteCounts = ref<Record<string, number>>({})
const tierSnapshots = ref<Record<string, SubmissionTierSnapshot>>({})

const fetchTierSnapshots = async (currentRows: SubmissionPortalRow[] | null | undefined) => {
  const safeRows = Array.isArray(currentRows) ? currentRows : []
  const leadIds = Array.from(new Set(safeRows.map((r) => String(r.id || '').trim()).filter(Boolean)))

  if (leadIds.length === 0) {
    tierSnapshots.value = {}
    return
  }

  const token = auth.state.value.session?.access_token
  if (!token) {
    tierSnapshots.value = {}
    return
  }

  try {
    const response = await fetch('/api/submission-tier-snapshots', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ lead_ids: leadIds })
    })

    const payload = await response.json().catch(() => ({})) as { snapshots?: SubmissionTierSnapshot[]; error?: string }
    if (!response.ok) {
      throw new Error(payload.error || `Unable to load tier snapshots (${response.status})`)
    }

    const snapshots = payload.snapshots ?? []
    tierSnapshots.value = Object.fromEntries(snapshots.map((snapshot) => [snapshot.lead_id, snapshot]))

    const unresolved = safeRows.filter((row) => {
      const storedTier = normalizeSubmissionTier(row.product_tier)
      const snapshot = tierSnapshots.value[String(row.id)]
      return !storedTier && !snapshot?.tier
    })

    if (unresolved.length > 0) {
      const signedRetainers = snapshots.filter((snapshot) => snapshot.evidenceFlags.signedRetainer).length
      console.info('[submission-portal] unresolved tier snapshots', {
        requested: leadIds.length,
        received: snapshots.length,
        unresolved: unresolved.length,
        signedRetainers
      })
    }
  } catch (error) {
    console.warn('[submission-portal] tier snapshot load failed', error)
    tierSnapshots.value = {}
  }
}

const fetchNoteCounts = async (currentRows: SubmissionPortalRow[] | null | undefined) => {
  const safeRows = Array.isArray(currentRows) ? currentRows : []
  const leadIds = safeRows.map((r) => String(r.id || '')).filter(Boolean)
  if (leadIds.length === 0) {
    noteCounts.value = {}
    return
  }

  const submissionMap = new Map<string, string>()
  safeRows.forEach((r) => {
    const submissionId = String(r.submission_id || '').trim()
    if (submissionId) submissionMap.set(submissionId, String(r.id))
  })

  const counts: Record<string, number> = {}
  leadIds.forEach((id) => {
    counts[id] = 0
  })

  const submissionIds = Array.from(submissionMap.keys())
  try {
    let query = supabase
      .from('lead_notes')
      .select('id,lead_id,submission_id')

    if (leadIds.length > 0) query = query.in('lead_id', leadIds)
    if (submissionIds.length > 0) query = query.in('submission_id', submissionIds)

    const { data: noteRows, error } = await query
    if (!error && Array.isArray(noteRows)) {
      const seen = new Set<string>()
      noteRows.forEach((row) => {
        const record = asRecord(row)
        const id = String(record.id ?? '')
        if (!id || seen.has(id)) return
        seen.add(id)

        const directLeadId = String(record.lead_id ?? '').trim()
        if (directLeadId && counts[directLeadId] !== undefined) {
          counts[directLeadId] = (counts[directLeadId] || 0) + 1
          return
        }

        const subId = String(record.submission_id ?? '').trim()
        if (subId) {
          const leadId = submissionMap.get(subId)
          if (leadId) counts[leadId] = (counts[leadId] || 0) + 1
        }
      })
    }
  } catch {
    // ignore
  }

  safeRows.forEach((r) => {
    if (String(r.notes || '').trim()) {
      const id = String(r.id || '')
      if (id) counts[id] = (counts[id] || 0) + 1
    }
  })

  noteCounts.value = counts
}

const searchTerm = ref('')
const filtersOpen = ref(false)
const selectedDateRange = ref<PipelineDateRange>('all')
const customStartDate = ref('')
const customEndDate = ref('')
const selectedStage = ref(ALL_FILTER_VALUE)
const selectedSourceType = ref(ALL_FILTER_VALUE)
const selectedStates = ref<string[]>([])
const filterCaseCategory = ref<string[]>([])
const filterInjurySeverity = ref<string[]>([])
const filterInsuranceStatus = ref<string[]>([])
const filterLiabilityStatus = ref<string[]>([])
const filterMedicalTreatment = ref<string[]>([])
const filterLanguage = ref<string[]>([])
const filterExpiry = ref('all')

const editOpen = ref(false)
const editSaving = ref(false)
const editRow = ref<SubmissionPortalRow | null>(null)
const editStage = ref('')
const editNotes = ref('')

const canSeeAll = auth.canSeeAll

const authorName = computed(() => {
  const profile = auth.state.value.profile
  const display = String(profile?.display_name || '').trim()
  if (display) return display
  const email = String(profile?.email || '').trim()
  if (email) return email.split('@')[0] || email
  return auth.state.value.user?.id ?? 'unknown'
})

const attorneyById = computed(() => {
  const map = new Map<string, string>()
  attorneys.value.forEach((a) => {
    const label = String(a.full_name || a.primary_email || '').trim()
    if (!a.user_id || !label) return
    map.set(a.user_id, label)
  })
  return map
})

const normalizeRowPrice = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const getStoredRowTierSnapshot = (row: SubmissionPortalRow): SubmissionTierSnapshot | null => {
  const tier = normalizeSubmissionTier(row.product_tier)
  if (!tier) return null

  return {
    lead_id: String(row.id),
    submission_id: String(row.submission_id || ''),
    tier,
    price: getSubmissionTierBpoPrice(tier) ?? normalizeRowPrice(row.product_tier_price),
    evidenceFlags: {
      signedRetainer: false,
      policeReport: false,
      medicalProof: false,
      insuranceDocument: false
    },
    source: 'stored',
    synced: true
  }
}

const getRowTierSnapshot = (row: SubmissionPortalRow) =>
  getStoredRowTierSnapshot(row) ?? tierSnapshots.value[String(row.id)] ?? null

const getRowTierLabel = (row: SubmissionPortalRow) =>
  formatSubmissionTierLabel(getRowTierSnapshot(row)?.tier)

const getRowTierShortLabel = (row: SubmissionPortalRow) =>
  formatSubmissionTierShortLabel(getRowTierSnapshot(row)?.tier)

const getRowCommissionLabel = (row: SubmissionPortalRow) =>
  formatSubmissionCommission(getRowTierSnapshot(row)?.price ?? null)

const getRowUpdatedTag = (row: SubmissionPortalRow) => {
  const raw = String(row.updated_at || row.created_at || row.date || '').trim()
  if (!raw) return 'Updated unknown'

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return 'Updated unknown'

  return `Updated ${date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })}`
}

const stageFilterOptions = computed(() => [
  { label: 'All Stages', value: ALL_FILTER_VALUE },
  ...STAGES.value.map(stage => ({ label: stage.label, value: stage.key }))
])

const sourceTypeOptions = computed(() => {
  const values = Array.from(new Set(rows.value.map(row => String(row.source_type || '').trim().toLowerCase()).filter(Boolean)))
  return [
    { label: 'All Sources', value: ALL_FILTER_VALUE },
    ...values
      .sort((a, b) => formatSourceTypeLabel(a).localeCompare(formatSourceTypeLabel(b)))
      .map(value => ({ label: formatSourceTypeLabel(value), value }))
  ]
})

const stateOptions = computed(() => {
  const values = Array.from(new Set(rows.value.map(row => String(row.state || '').trim()).filter(Boolean)))
  return values
    .sort((a, b) => a.localeCompare(b))
    .map(value => ({ label: value, value }))
})

const activeFilterCount = computed(() => {
  let count = 0
  if (selectedDateRange.value !== 'all') count += 1
  if (selectedStage.value !== ALL_FILTER_VALUE) count += 1
  if (selectedSourceType.value !== ALL_FILTER_VALUE) count += 1
  if (selectedStates.value.length > 0) count += 1
  if (filterCaseCategory.value.length > 0) count += 1
  if (filterInjurySeverity.value.length > 0) count += 1
  if (filterInsuranceStatus.value.length > 0) count += 1
  if (filterLiabilityStatus.value.length > 0) count += 1
  if (filterMedicalTreatment.value.length > 0) count += 1
  if (filterLanguage.value.length > 0) count += 1
  if (filterExpiry.value !== 'all') count += 1
  return count
})

const hasActiveFilters = computed(() => activeFilterCount.value > 0 || searchTerm.value.trim() !== '')

const resetFilters = () => {
  searchTerm.value = ''
  selectedStage.value = ALL_FILTER_VALUE
  selectedSourceType.value = ALL_FILTER_VALUE
  selectedStates.value = []
  selectedDateRange.value = 'all'
  customStartDate.value = ''
  customEndDate.value = ''
  filterCaseCategory.value = []
  filterInjurySeverity.value = []
  filterInsuranceStatus.value = []
  filterLiabilityStatus.value = []
  filterMedicalTreatment.value = []
  filterLanguage.value = []
  filterExpiry.value = 'all'
}

const multiSelectUi = {
  value: 'truncate whitespace-nowrap overflow-hidden',
  item: 'group',
  itemTrailingIcon: 'hidden',
  content: 'w-max min-w-[var(--reka-select-trigger-width)]'
}

const singleSelectUi = {
  content: 'w-max min-w-[var(--reka-select-trigger-width)]'
}

const CASE_CATEGORY_OPTIONS = [
  { label: 'Consumer Cases', value: 'Consumer Cases' },
  { label: 'Commercial Cases', value: 'Commercial Cases' }
]

const INJURY_SEVERITY_OPTIONS = [
  { label: 'Minor', value: 'minor' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Severe', value: 'severe' }
]

const INSURANCE_STATUS_OPTIONS = [
  { label: 'Insured only', value: 'insured_only' },
  { label: 'Uninsured acceptable', value: 'uninsured_ok' }
]

const LIABILITY_STATUS_OPTIONS = [
  { label: 'Clear liability only', value: 'clear_only' },
  { label: 'Disputed acceptable', value: 'disputed_ok' }
]

const MEDICAL_TREATMENT_OPTIONS = [
  { label: 'No medical', value: 'no_medical' },
  { label: 'Ongoing', value: 'ongoing' },
  { label: 'Proof of medical treatment', value: 'proof_of_medical_treatment' }
]

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'English' },
  { label: 'Spanish', value: 'Spanish' }
]

const EXPIRY_OPTIONS = [
  { label: 'Any expiry', value: 'all' },
  { label: 'Next 30 days', value: '30' },
  { label: 'Next 60 days', value: '60' },
  { label: 'Next 90 days', value: '90' },
  { label: 'No expiry date', value: 'no_expiry' }
]

const filteredRows = computed(() => {
  let data = rows.value.slice()

  if (!canSeeAll.value) {
    const vendor = String(auth.resolvedLeadVendor.value ?? '').trim()
    if (vendor) {
      data = data.filter((r) => String(r.lead_vendor || '').trim() === vendor)
    } else {
      data = []
    }
  }

  data = data.filter((r) => matchesPipelineDateRange(String(r.date || ''), selectedDateRange.value, customStartDate.value, customEndDate.value))

  if (selectedStage.value !== ALL_FILTER_VALUE) {
    data = data.filter((r) => deriveStageKey(r) === selectedStage.value)
  }

  if (selectedSourceType.value !== ALL_FILTER_VALUE) {
    data = data.filter((r) => String(r.source_type || '').trim().toLowerCase() === selectedSourceType.value)
  }

  if (selectedStates.value.length > 0) {
    data = data.filter((r) => selectedStates.value.includes(String(r.state || '').trim()))
  }

  const q = searchTerm.value.trim().toLowerCase()
  if (q) {
    data = data.filter((r) => {
      const attorneyName = r.assigned_attorney_id ? (attorneyById.value.get(String(r.assigned_attorney_id)) ?? '') : ''
      const haystack = [
        r.id,
        r.submission_id,
        r.insured_name ?? '',
        r.client_phone_number ?? '',
        r.lead_vendor ?? '',
        r.agent ?? '',
        r.buffer_agent ?? '',
        r.licensed_agent_account ?? '',
        r.status ?? '',
        r.state ?? '',
        getRowTierLabel(r),
        getRowCommissionLabel(r),
        formatSourceTypeLabel(String(r.source_type || '')),
        attorneyName
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }

  return data
})

const leadsByStage = computed(() => {
  const grouped = new Map<string, SubmissionPortalRow[]>()
  STAGES.value.forEach((s) => grouped.set(s.key, []))

  filteredRows.value.forEach((row) => {
    const stageKey = deriveStageKey(row)
    grouped.get(stageKey)?.push(row)
  })

  return grouped
})

// Rows that resolve to a valid active submission stage key (strict — no blank/unmapped fallback)
const boardVisibleRows = computed(() =>
  filteredRows.value.filter((row) => {
    const status = String(row.status || '').trim()
    return status !== '' && dbStages.value.some((s) => s.key === status)
  })
)

const intakeQueueCount = computed(() =>
  boardVisibleRows.value.filter((r) => {
    const key = deriveStageKey(r)
    return key === 'retainer_signed' || key === 'qualified_missing_info'
  }).length
)

const QUALIFIED_REVIEW_STAGE_KEYS = [
  'qualified_tier_1',
  'qualified_tier_2',
  'qualified_tier_3',
  'qualified_tier_4',
  'attorney_review',
  'attorney_approved'
]

const QUALIFIED_REVIEW_PENDING_STAGE_KEYS = [
  'qualified_tier_1',
  'qualified_tier_2',
  'qualified_tier_3',
  'qualified_tier_4',
  'attorney_review',
  'attorney_approved'
]

const qualifiedReviewRows = computed(() =>
  boardVisibleRows.value.filter((r) => {
    const key = deriveStageKey(r)
    return QUALIFIED_REVIEW_STAGE_KEYS.includes(key)
  })
)

const qualifiedReviewPendingRows = computed(() =>
  boardVisibleRows.value.filter((r) => {
    const key = deriveStageKey(r)
    return QUALIFIED_REVIEW_PENDING_STAGE_KEYS.includes(key)
  })
)

const qualifiedReviewCount = computed(() => qualifiedReviewRows.value.length)

const qualifiedReviewPendingTotal = computed(() =>
  qualifiedReviewPendingRows.value.reduce((total, row) => total + (getRowTierSnapshot(row)?.price ?? 0), 0)
)

const paymentQueueRows = computed(() =>
  boardVisibleRows.value.filter((r) => {
    const key = deriveStageKey(r)
    return key === 'qualified_payable'
  })
)

const paymentQueueCount = computed(() => paymentQueueRows.value.length)

const paymentQueueTotal = computed(() =>
  paymentQueueRows.value.reduce((total, row) => total + (getRowTierSnapshot(row)?.price ?? 0), 0)
)

const submissionStatCards = computed(() => [
  {
    label: 'Total Cases', value: boardVisibleRows.value.length, icon: 'i-lucide-layout-dashboard',
    accent: '#ae4010', light: '#e8763c', rgb: '174,64,16', delay: 0,
    secondaryValue: null,
    secondaryLabel: null,
    stages: ['All valid submission stages after filters are applied']
  },
  {
    label: 'Intake Queue', value: intakeQueueCount.value, icon: 'i-lucide-inbox',
    accent: '#3b82f6', light: '#60a5fa', rgb: '59,130,246', delay: 60,
    secondaryValue: null,
    secondaryLabel: null,
    stages: ['Retainer Signed', 'Signed: Missing Information']
  },
  {
    label: 'Qualified & Review', value: qualifiedReviewCount.value, icon: 'i-lucide-scale',
    accent: '#22c55e', light: '#4ade80', rgb: '34,197,94', delay: 120,
    secondaryValue: formatSubmissionCommission(qualifiedReviewPendingTotal.value),
    secondaryLabel: 'pending',
    stages: ['Qualified: Tier 1', 'Qualified: Tier 2', 'Qualified: Tier 3', 'Qualified: Tier 4', 'Attorney Review', 'Attorney Approved']
  },
  {
    label: 'Payment Queue', value: paymentQueueCount.value, icon: 'i-lucide-banknote',
    accent: '#8b5cf6', light: '#c4b5fd', rgb: '139,92,246', delay: 180,
    secondaryValue: formatSubmissionCommission(paymentQueueTotal.value),
    secondaryLabel: 'payable',
    stages: ['Qualified / Payable']
  },
])

const stageOptions = computed(() => {
  return dbStages.value.map((s) => ({ label: s.label, value: s.key }))
})



const fetchAttorneys = async () => {
  try {
    const { data, error } = await supabase
      .from('attorney_profiles')
      .select('user_id,full_name,primary_email')
      .order('full_name', { ascending: true, nullsFirst: false })

    if (error) {
      attorneys.value = []
      return
    }

    attorneys.value = (data ?? []) as AttorneyProfile[]
  } catch {
    attorneys.value = []
  }
}

const fetchData = async (showRefreshToast = false) => {
  const allowedKeys = buildAllowedStatuses()
  if (allowedKeys.length === 0) return // wait for stages to load via watcher

  loading.value = rows.value.length === 0
  refreshing.value = true

  try {
    await auth.init()

    let leadsQuery = supabase
      .from('leads')
      .select('*')
      .in('status', allowedKeys)
      .order('created_at', { ascending: false })

    if (!canSeeAll.value) {
      const vendor = String(auth.resolvedLeadVendor.value ?? '').trim()
      if (vendor) {
        leadsQuery = leadsQuery.eq('lead_vendor', vendor)
      }
    }

    const { data: leadsData, error: leadsError } = await leadsQuery

    if (leadsError) {
      rows.value = []
      return
    }

    const normalized = ((leadsData ?? []) as unknown as SubmissionPortalRow[]).map((lead) => {
      const record = asRecord(lead)
      const sourceType = resolvePipelineSourceType(record)
      const state = resolvePipelineState(record)
      const submissionId = String(lead.submission_id || '').trim()
      return {
        ...lead,
        insured_name: String(lead.customer_full_name || lead.insured_name || ''),
        client_phone_number: String(lead.phone || lead.customer_phone || lead.client_phone_number || ''),
        date: String(lead.date || (record.created_at as string) || ''),
        has_submission_data: Boolean(submissionId),
        source_type: sourceType,
        state
      }
    })

    rows.value = normalized
    await Promise.all([
      fetchNoteCounts(normalized),
      fetchTierSnapshots(normalized)
    ])

    if (showRefreshToast) {
      try {
        const toast = useToast()
        toast.add({ title: 'Success', description: 'Data refreshed successfully' })
      } catch {
        // ignore
      }
    }
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const handleView = (row: SubmissionPortalRow) => {
  if (!row?.id) return
  router.push({
    path: `/retainers/${encodeURIComponent(String(row.id))}`,
    query: { from: route.fullPath }
  })
}

const openEdit = (row: SubmissionPortalRow) => {
  editRow.value = row
  editStage.value = String(row.status || '').trim()
  editNotes.value = ''
  editOpen.value = true
}

const saveEdit = async () => {
  if (!editRow.value) return

  const nextStage = String(editStage.value || '').trim()
  if (!nextStage) return

  const rowId = editRow.value.id

  editSaving.value = true
  try {
    const { error: leadsError } = await supabase
      .from('leads')
      .update({ status: nextStage, notes: editNotes.value })
      .eq('id', rowId)

    if (leadsError) throw leadsError

    const trimmedNote = String(editNotes.value || '').trim()
    if (trimmedNote) {
      try {
        await supabase.from('lead_notes').insert({
          lead_id: rowId,
          submission_id: editRow.value.submission_id ?? null,
          note: trimmedNote,
          source: 'Submission Portal',
          created_by: auth.state.value.user?.id ?? null,
          author_name: authorName.value
        })
      } catch {
        console.log('Failed to insert lead note')
      }
    }

    rows.value = rows.value.map((r) => (
      r.id === rowId
        ? { ...r, status: nextStage, notes: editNotes.value, updated_at: new Date().toISOString() }
        : r
    ))
    await fetchNoteCounts(rows.value)

    try {
      const toast = useToast()
      toast.add({ title: 'Updated', description: 'Stage and notes updated successfully.' })
    } catch {
      console.log('Failed to add toast')
    }

    editOpen.value = false
  } catch {
    try {
      const toast = useToast()
      toast.add({ title: 'Error', description: 'Failed to update stage/notes', color: 'error' })
    } catch {
      console.log('Failed to add toast')
    }
  } finally {
    editSaving.value = false
  }
}

watch(dbStages, (newStages) => {
  if (newStages.length > 0) {
    void fetchData()
  }
})

onMounted(async () => {
  await fetchAttorneys()
  await fetchData()
})

void stageFilterOptions.value
void sourceTypeOptions.value
</script>

<template>
  <UDashboardPanel id="submission-portal" :ui="{ body: 'overflow-x-hidden' }">
    <template #header>
      <UDashboardNavbar title="Submission Pipeline">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <NotificationBell />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="ap-page flex h-full min-h-0 flex-col gap-4">
        <!-- ═══ SUBMISSION STAT CARDS ═══ -->
        <div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="card in submissionStatCards"
            :key="card.label"
            class="ap-summary-card dashboard-fade-up group"
            :style="{
              '--dashboard-enter-delay': card.delay + 'ms',
              '--card-accent': card.accent,
              '--card-light': card.light,
              '--card-rgb': card.rgb,
              borderLeftColor: card.accent,
            }"
          >
            <div class="flex items-center justify-between px-5 py-4">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <div class="ap-card-label">{{ card.label }}</div>
                  <UPopover
                    mode="hover"
                    :open-delay="100"
                    :close-delay="120"
                    :content="{ side: 'top', align: 'start', sideOffset: 8 }"
                  >
                    <button type="button" class="shrink-0 opacity-35 transition-opacity hover:opacity-70" tabindex="-1">
                      <UIcon name="i-lucide-circle-help" class="size-3" />
                    </button>
                    <template #content>
                      <div class="w-56 p-3">
                        <div class="mb-2 text-[10px] font-semibold uppercase tracking-widest" style="color: var(--dashboard-text-muted);">Connected Stages</div>
                        <ul class="space-y-1">
                          <li v-for="stage in card.stages" :key="stage" class="flex items-center gap-1.5">
                            <span class="size-1.5 shrink-0 rounded-full" :style="{ background: card.accent }" />
                            <span class="text-xs" style="color: var(--dashboard-text-primary);">{{ stage }}</span>
                          </li>
                        </ul>
                      </div>
                    </template>
                  </UPopover>
                </div>
                <div class="ap-card-value-row">
                  <div class="ap-card-value">{{ card.value }}</div>
                  <div v-if="card.secondaryValue" class="ap-card-secondary">
                    <span>{{ card.secondaryValue }}</span>
                    <span>{{ card.secondaryLabel }}</span>
                  </div>
                </div>
              </div>
              <div
                class="flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105"
                :style="{ background: `rgba(${card.rgb}, 0.12)` }"
              >
                <UIcon :name="card.icon" class="size-5" :style="{ color: card.light }" />
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ TOOLBAR CARD ═══ -->
        <div
          class="dashboard-surface-card dashboard-fade-up"
          :style="{ '--dashboard-enter-delay': '180ms', '--dashboard-surface-glow': 'transparent' }"
        >
          <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div class="flex flex-wrap items-center gap-3">
              <UInput
                v-model="searchTerm"
                class="ap-search-input"
                icon="i-lucide-search"
                size="sm"
                placeholder="Search by name, phone, vendor..."
              />

              <USelect
                v-model="selectedDateRange"
                :items="PIPELINE_DATE_RANGE_OPTIONS"
                value-key="value"
                label-key="label"
                size="sm"
                class="w-36"
              />
            </div>

            <div class="flex items-center gap-3">
              <span class="text-xs tabular-nums text-[var(--dashboard-text-muted)]">
                {{ filteredRows.length }} total
              </span>

              <UButton
                color="neutral"
                :variant="filtersOpen ? 'soft' : 'outline'"
                size="sm"
                :icon="filtersOpen ? 'i-lucide-panel-top-close' : 'i-lucide-sliders-horizontal'"
                @click="filtersOpen = !filtersOpen"
              >
                {{ filtersOpen ? 'Hide Filters' : 'Filters' }}
                <span
                  v-if="activeFilterCount > 0"
                  class="ml-1.5 flex size-4.5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  :style="{ background: 'var(--ap-accent)' }"
                >
                  {{ activeFilterCount }}
                </span>
              </UButton>

              <UButton
                v-if="hasActiveFilters"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-rotate-ccw"
                @click="resetFilters"
              >
                Reset all
              </UButton>

              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-lucide-refresh-cw"
                :loading="refreshing"
                @click="fetchData(true)"
              />
            </div>
          </div>

          <div class="ap-filter-collapse" :class="{ 'is-open': filtersOpen }">
            <div class="ap-filter-inner">
              <div class="border-t border-[var(--dashboard-divider)] px-5 py-4">
                <div class="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">

                  <!-- State -->
                  <div>
                    <div class="ap-filter-label">
                      State
                    </div>
                    <USelectMenu
                      v-model="selectedStates"
                      :items="stateOptions"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="All States"
                      size="sm"
                      class="w-full"
                      :search-input="{ placeholder: 'Search states...' }"
                      :ui="multiSelectUi"
                    />
                  </div>

                  <!-- Case Category -->
                  <div>
                    <div class="ap-filter-label">
                      Case Category
                    </div>
                    <USelectMenu
                      v-model="filterCaseCategory"
                      :items="CASE_CATEGORY_OPTIONS"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="All categories"
                      size="sm"
                      class="w-full"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                          <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                        </span>
                      </template>
                    </USelectMenu>
                  </div>

                  <!-- Injury Severity -->
                  <div>
                    <div class="ap-filter-label">
                      Injury Severity
                    </div>
                    <USelectMenu
                      v-model="filterInjurySeverity"
                      :items="INJURY_SEVERITY_OPTIONS"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="All severities"
                      size="sm"
                      class="w-full"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                          <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                        </span>
                      </template>
                    </USelectMenu>
                  </div>

                  <!-- Insurance Status -->
                  <div>
                    <div class="ap-filter-label">
                      Insurance Status
                    </div>
                    <USelectMenu
                      v-model="filterInsuranceStatus"
                      :items="INSURANCE_STATUS_OPTIONS"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="Any"
                      size="sm"
                      class="w-full"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                          <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                        </span>
                      </template>
                    </USelectMenu>
                  </div>

                  <!-- Liability Status -->
                  <div>
                    <div class="ap-filter-label">
                      Liability Status
                    </div>
                    <USelectMenu
                      v-model="filterLiabilityStatus"
                      :items="LIABILITY_STATUS_OPTIONS"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="Any"
                      size="sm"
                      class="w-full"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                          <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                        </span>
                      </template>
                    </USelectMenu>
                  </div>

                  <!-- Medical Treatment -->
                  <div>
                    <div class="ap-filter-label">
                      Medical Treatment
                    </div>
                    <USelectMenu
                      v-model="filterMedicalTreatment"
                      :items="MEDICAL_TREATMENT_OPTIONS"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="Any"
                      size="sm"
                      class="w-full"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                          <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                        </span>
                      </template>
                    </USelectMenu>
                  </div>

                  <!-- Language -->
                  <div>
                    <div class="ap-filter-label">
                      Language
                    </div>
                    <USelectMenu
                      v-model="filterLanguage"
                      :items="LANGUAGE_OPTIONS"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="Any language"
                      size="sm"
                      class="w-full"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                          <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                        </span>
                      </template>
                    </USelectMenu>
                  </div>

                  <!-- Expiration -->
                  <div>
                    <div class="ap-filter-label">
                      Expiration
                    </div>
                    <USelect
                      v-model="filterExpiry"
                      :items="EXPIRY_OPTIONS"
                      value-key="value"
                      label-key="label"
                      size="sm"
                      class="w-full"
                      :ui="singleSelectUi"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="loading" class="flex flex-1 items-center justify-center text-sm text-muted">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" />
            <span>Loading submission pipeline data</span>
          </div>
        </div>

        <div v-else class="dashboard-fade-up min-h-0 min-w-0 flex-1 overflow-hidden" :style="{ '--dashboard-enter-delay': '280ms' }">
          <div class="ap-board-scroll flex h-full min-h-0 items-stretch gap-4 pb-2 pr-2">
            <div
              v-for="(stage, stageIdx) in STAGES"
              :key="stage.key"
              class="ap-column flex h-full shrink-0 flex-col"
              :style="{
                '--ap-col-accent': getStageColor(stage.key, stageIdx).accent,
                '--ap-col-accent-rgb': getStageColor(stage.key, stageIdx).rgb,
                minWidth: '280px',
                width: STAGES.length <= 4 ? `${100 / STAGES.length}%` : '320px',
              }"
            >
              <div
                class="ap-column-header flex items-center gap-2.5 rounded-t-xl border-b border-[var(--dashboard-divider)] px-3.5 py-2.5"
                :style="{ background: `rgba(${getStageColor(stage.key, stageIdx).rgb}, 0.06)` }"
              >
                <div class="flex size-7 items-center justify-center rounded-lg" :style="{ background: `rgba(${getStageColor(stage.key, stageIdx).rgb}, 0.15)` }">
                  <UIcon name="i-lucide-folder" class="size-3.5" :style="{ color: getStageColor(stage.key, stageIdx).accent }" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span class="truncate text-[13px] font-semibold" style="color: var(--dashboard-text-primary);">{{ stage.label }}</span>
                    <UPopover
                      mode="hover"
                      arrow
                      :open-delay="100"
                      :close-delay="120"
                      :content="{ side: 'top', align: 'start', sideOffset: 8 }"
                    >
                      <button type="button" class="shrink-0 rounded-full p-0.5 opacity-40 transition-opacity hover:opacity-80" tabindex="-1">
                        <UIcon name="i-lucide-circle-help" class="size-3.5" />
                      </button>
                      <template #content>
                        <!-- Tier structured card -->
                        <div v-if="stage.tierDetails" class="w-72 p-3.5">
                          <div class="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b" style="border-color: var(--dashboard-divider);">
                            <div>
                              <div class="text-[11px] uppercase tracking-widest font-semibold" style="color: var(--dashboard-text-muted);">{{ stage.tierDetails.subtitle }}</div>
                              <div class="text-sm font-bold leading-tight" style="color: var(--dashboard-text-primary);">{{ stage.label }}</div>
                            </div>
                            <div class="shrink-0 rounded-md px-2.5 py-1 text-xs font-bold" style="background: rgba(var(--dashboard-accent-rgb, 59,130,246), 0.1); color: var(--ap-col-accent, #3b82f6);">
                              {{ stage.tierDetails.price }}<span class="font-normal text-[10px] opacity-70"> /case</span>
                            </div>
                          </div>
                          <div class="space-y-2">
                            <div
                              v-for="row in stage.tierDetails.rows"
                              :key="row.label"
                              class="flex items-start gap-2.5"
                            >
                              <UIcon :name="row.icon" class="mt-0.5 size-3.5 shrink-0" style="color: var(--ap-col-accent, #3b82f6); opacity: 0.8;" />
                              <div class="min-w-0">
                                <div class="text-[9px] uppercase tracking-widest leading-tight" style="color: var(--dashboard-text-muted);">{{ row.label }}</div>
                                <div class="text-xs font-semibold leading-snug" style="color: var(--dashboard-text-primary);">{{ row.value }}</div>
                                <div v-if="row.subtext" class="text-[10px] leading-snug" style="color: var(--dashboard-text-muted);">{{ row.subtext }}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <!-- Default plain description -->
                        <div v-else class="max-w-72 p-3">
                          <div class="text-sm font-semibold" style="color: var(--dashboard-text-primary);">
                            {{ stage.label }}
                          </div>
                          <p class="mt-1 text-xs leading-5" style="color: var(--dashboard-text-muted);">
                            {{ stage.description }}
                          </p>
                        </div>
                      </template>
                    </UPopover>
                  </div>
                </div>
                <span
                  class="flex size-5.5 items-center justify-center rounded-md text-[11px] font-bold tabular-nums"
                  :style="{
                    background: `rgba(${getStageColor(stage.key, stageIdx).rgb}, 0.12)`,
                    color: getStageColor(stage.key, stageIdx).accent,
                  }"
                >
                  {{ leadsByStage.get(stage.key)?.length ?? 0 }}
                </span>
              </div>

              <div class="ap-scroll flex-1 space-y-2 overflow-y-auto p-2">
                <div
                  v-for="row in (leadsByStage.get(stage.key) ?? [])"
                  :key="row.id"
                  class="ap-kanban-card"
                  :draggable="isBoardDragAndDropEnabled"
                  tabindex="0"
                  @click="handleView(row)"
                  @keydown.enter="handleView(row)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <div class="ap-card-title truncate text-[13px] font-semibold" style="color: var(--dashboard-text-primary);">
                        {{ row.insured_name || 'Unknown lead' }}
                      </div>
                      <div class="mt-2 flex flex-wrap items-center gap-1.5">
                        <span class="ap-card-chip">
                          <UIcon name="i-lucide-map-pin" class="size-3" />
                          {{ String(row.state || 'No state') }}
                        </span>
                        <span class="ap-card-chip ap-card-tier-chip">
                          <span class="ap-card-tier-code">{{ getRowTierShortLabel(row) }}</span>
                          {{ getRowTierLabel(row) }}
                        </span>
                      </div>
                    </div>

                    <div class="ap-card-cta flex size-6 shrink-0 items-center justify-center rounded-md transition-all duration-200" :style="{ background: `rgba(${getStageColor(stage.key, stageIdx).rgb}, 0.1)` }" tabindex="-1">
                      <UButton
                        icon="i-lucide-pencil"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        @click.stop="openEdit(row)"
                      />
                    </div>
                  </div>

                  <div class="mt-3 flex flex-wrap items-end justify-between gap-2">
                    <div class="min-w-0">
                      <div class="ap-card-meta-label">Commission</div>
                      <div class="ap-card-commission">{{ getRowCommissionLabel(row) }}</div>
                    </div>
                    <div class="ap-card-updated">
                      <UIcon name="i-lucide-clock-3" class="size-3" />
                      <span>{{ getRowUpdatedTag(row) }}</span>
                    </div>
                  </div>

                  <div class="mt-3 flex items-center justify-between gap-2 border-t border-[var(--dashboard-divider)] pt-2">
                    <div class="truncate text-[11px]" style="color: var(--dashboard-text-muted);">
                      {{ String(row.lead_vendor || 'Unknown vendor') }}
                    </div>
                    <div class="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px]" style="color: var(--dashboard-text-muted);">
                      <UIcon name="i-lucide-sticky-note" class="h-3.5 w-3.5" />
                      <span>{{ noteCounts[String(row.id)] ?? 0 }}</span>
                    </div>
                  </div>
                </div>

                <div
                  v-if="(leadsByStage.get(stage.key)?.length ?? 0) === 0"
                  class="ap-empty-column"
                >
                  <UIcon name="i-lucide-inbox" class="mx-auto mb-1.5 size-5 opacity-40" />
                  <div>No leads</div>
                </div>
              </div>

              <div class="flex items-center justify-between border-t border-default px-2 py-2">
                <UButton
                  color="neutral"
                  variant="outline"
                  size="xs"
                  :disabled="true"
                >
                  Previous
                </UButton>
                <div class="text-xs text-muted">
                  Page 1 of 1
                </div>
                <UButton
                  color="neutral"
                  variant="outline"
                  size="xs"
                  :disabled="true"
                >
                  Next
                </UButton>
              </div>
            </div>
          </div>
        </div>

        <UModal v-model:open="editOpen" title="Edit Transfer">
          <template #body>
            <div class="space-y-4">
              <UFormField label="Stage">
                <USelect
                  v-model="editStage"
                  :items="stageOptions"
                  value-key="value"
                  label-key="label"
                />
              </UFormField>

              <UFormField label="Notes">
                <UTextarea v-model="editNotes" :rows="5" />
              </UFormField>

              <div class="flex justify-end gap-2">
                <UButton
                  color="neutral"
                  variant="outline"
                  :disabled="editSaving"
                  @click="editOpen = false"
                >
                  Cancel
                </UButton>
                <UButton
                  color="primary"
                  variant="solid"
                  :loading="editSaving"
                  :disabled="!String(editStage || '').trim()"
                  @click="saveEdit"
                >
                  Save
                </UButton>
              </div>
            </div>
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>

    <style scoped>
    /* ═══════════════════════════════════════════════
       SUMMARY CARDS
       ═══════════════════════════════════════════════ */
    .ap-summary-card {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--dashboard-surface-border);
      border-left: 3px solid var(--card-accent, var(--ap-accent));
      border-radius: 1rem;
      background: var(--dashboard-surface);
      box-shadow: var(--dashboard-surface-shadow);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      transition: box-shadow 300ms ease, transform 300ms ease;
    }

    .ap-summary-card:hover {
      box-shadow: var(--dashboard-surface-shadow-hover);
    }

    .ap-card-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--card-light, var(--ap-accent));
    }

    .ap-card-value-row {
      margin-top: 6px;
      display: flex;
      align-items: baseline;
      gap: 10px;
    }

    .ap-card-value {
      font-size: 24px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: var(--dashboard-text-primary);
    }

    .ap-card-secondary {
      display: inline-flex;
      align-items: baseline;
      gap: 4px;
      min-width: 0;
      font-size: 12px;
      font-weight: 700;
      color: var(--card-light, var(--ap-accent));
      white-space: nowrap;
    }

    .ap-card-secondary span:last-child {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--dashboard-text-soft);
    }

    /* ═══════════════════════════════════════════════
       SEARCH INPUT
       ═══════════════════════════════════════════════ */
    .ap-search-input {
      max-width: 20rem;
    }

    /* ═══════════════════════════════════════════════
       SEGMENT CONTROL (Board / List toggle)
       ═══════════════════════════════════════════════ */
    .ap-segment-control {
      display: inline-flex;
      border-radius: 0.625rem;
      border: 1px solid var(--dashboard-surface-border);
      background: var(--dashboard-surface);
      padding: 2px;
      gap: 2px;
    }

    .ap-segment-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 12px;
      border-radius: 0.5rem;
      font-size: 12px;
      font-weight: 500;
      color: var(--dashboard-text-muted);
      transition: all 180ms ease;
      cursor: pointer;
      border: none;
      background: transparent;
    }

    .ap-segment-btn:hover:not(.is-active) {
      background: rgba(var(--ap-col-accent-rgb, 174, 64, 16), 0.06);
      color: var(--dashboard-text-secondary);
    }

    .ap-segment-btn.is-active {
      background: var(--ap-accent);
      color: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    }

    /* ═══════════════════════════════════════════════
       FILTER COLLAPSE ANIMATION
       ═══════════════════════════════════════════════ */
    .ap-filter-collapse {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows 350ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .ap-filter-collapse.is-open {
      grid-template-rows: 1fr;
    }

    .ap-filter-inner {
      overflow: hidden;
    }

    .ap-filter-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--dashboard-text-soft);
      margin-bottom: 6px;
    }

    /* ═══════════════════════════════════════════════
       KANBAN BOARD
       ═══════════════════════════════════════════════ */
    .ap-board-scroll {
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: thin;
      scrollbar-color: rgba(var(--ap-col-accent-rgb, 128, 128, 128), 0.25) transparent;
    }

    .ap-board-scroll::-webkit-scrollbar {
      height: 4px;
    }

    .ap-board-scroll::-webkit-scrollbar-track {
      background: transparent;
    }

    .ap-board-scroll::-webkit-scrollbar-thumb {
      background: rgba(128, 128, 128, 0.25);
      border-radius: 4px;
    }

    /* ═══════════════════════════════════════════════
       KANBAN COLUMN
       ═══════════════════════════════════════════════ */
    .ap-column {
      border-radius: 0.75rem;
      border: 1px solid var(--dashboard-surface-border);
      background: var(--dashboard-surface);
      box-shadow: var(--dashboard-surface-shadow);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      transition: border-color 200ms ease, box-shadow 200ms ease;
    }

    .ap-column-dragover {
      border-color: rgba(var(--ap-col-accent-rgb), 0.45) !important;
      border-style: dashed !important;
      box-shadow: 0 0 0 2px rgba(var(--ap-col-accent-rgb), 0.10), var(--dashboard-surface-shadow);
    }

    /* ═══════════════════════════════════════════════
       KANBAN CARDS
       ═══════════════════════════════════════════════ */
    .ap-kanban-card {
      min-height: 132px;
      padding: 12px 14px;
      border-radius: 0.5rem;
      border: 1px solid var(--dashboard-surface-border);
      background: var(--dashboard-surface);
      cursor: pointer;
      transition: all 200ms ease;
      position: relative;
    }

    .ap-kanban-card:hover {
      border-color: rgba(var(--ap-col-accent-rgb), 0.24);
      background: rgba(var(--ap-col-accent-rgb), 0.04);
      box-shadow: 0 2px 8px rgba(var(--ap-col-accent-rgb), 0.08);
    }

    .ap-kanban-card:hover .ap-card-title {
      color: var(--ap-col-accent) !important;
    }

    .ap-kanban-card:hover .ap-card-cta {
      opacity: 1 !important;
    }

    .ap-kanban-card:focus-visible {
      outline: 2px solid var(--ap-col-accent);
      outline-offset: 1px;
    }

    .ap-card-cta {
      opacity: 0;
    }

    .ap-kanban-card:active {
      cursor: pointer;
    }

    .ap-card-chip {
      display: inline-flex;
      min-width: 0;
      align-items: center;
      gap: 4px;
      border-radius: 6px;
      border: 1px solid var(--dashboard-surface-border);
      background: rgba(var(--ap-col-accent-rgb), 0.06);
      padding: 3px 7px;
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
      color: var(--dashboard-text-secondary);
      white-space: nowrap;
    }

    .ap-card-tier-chip {
      color: var(--ap-col-accent);
    }

    .ap-card-tier-code {
      border-radius: 4px;
      background: rgba(var(--ap-col-accent-rgb), 0.14);
      padding: 2px 4px;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }

    .ap-card-meta-label {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--dashboard-text-soft);
    }

    .ap-card-commission {
      margin-top: 2px;
      font-size: 18px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: var(--dashboard-text-primary);
    }

    .ap-card-updated {
      display: inline-flex;
      max-width: 100%;
      flex-shrink: 0;
      align-items: center;
      gap: 4px;
      border-radius: 6px;
      background: rgba(var(--ap-col-accent-rgb), 0.06);
      padding: 4px 7px;
      font-size: 10px;
      font-weight: 600;
      color: var(--dashboard-text-muted);
      white-space: nowrap;
    }

    .ap-card-updated span {
      overflow: visible;
      text-overflow: clip;
    }

    /* Dragging state applied via JS */
    .ap-kanban-card[style*="opacity: 0.4"] {
      filter: grayscale(0.3);
    }

    /* ═══════════════════════════════════════════════
       EMPTY COLUMN
       ═══════════════════════════════════════════════ */
    .ap-empty-column {
      border: 1px dashed var(--dashboard-surface-border-strong);
      border-radius: 0.5rem;
      padding: 24px 12px;
      text-align: center;
      font-size: 11px;
      color: var(--dashboard-text-soft);
    }

    /* ═══════════════════════════════════════════════
       SLIM SCROLLBARS (card areas)
       ═══════════════════════════════════════════════ */
    .ap-scroll {
      scrollbar-width: thin;
      scrollbar-color: rgba(128, 128, 128, 0.2) transparent;
    }

    .ap-scroll::-webkit-scrollbar {
      width: 4px;
      height: 4px;
    }

    .ap-scroll::-webkit-scrollbar-track {
      background: transparent;
    }

    .ap-scroll::-webkit-scrollbar-thumb {
      background: rgba(128, 128, 128, 0.2);
      border-radius: 4px;
    }

    .ap-scroll::-webkit-scrollbar-thumb:hover {
      background: rgba(128, 128, 128, 0.35);
    }

    /* ═══════════════════════════════════════════════
       LIST TABLE
       ═══════════════════════════════════════════════ */
    .ap-table {
      border-collapse: collapse;
    }

    .ap-table thead {
      position: sticky;
      top: 0;
      z-index: 2;
    }

    .ap-table th {
      padding: 10px 16px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--dashboard-text-soft);
      background: var(--dashboard-surface-strong);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--dashboard-divider);
      white-space: nowrap;
      text-align: left;
    }

    .ap-table td {
      padding: 10px 16px;
      font-size: 13px;
      color: var(--dashboard-text-secondary);
      border-bottom: 1px solid var(--dashboard-divider);
      white-space: nowrap;
    }

    .ap-table-row {
      cursor: pointer;
      transition: background 150ms ease;
    }

    .ap-table-row:hover {
      background: rgba(var(--ap-col-accent-rgb, 174, 64, 16), 0.04);
    }

    .ap-table-row:focus-visible {
      outline: 2px solid var(--ap-accent);
      outline-offset: -2px;
    }

    /* ═══════════════════════════════════════════════
       STATUS PILL
       ═══════════════════════════════════════════════ */
    .ap-status-pill {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(var(--pill-rgb, 128, 128, 128), 0.12);
      color: var(--pill-accent, var(--dashboard-text-secondary));
      white-space: nowrap;
    }

    /* ═══════════════════════════════════════════════
       PAGINATION FOOTER
       ═══════════════════════════════════════════════ */
    .ap-pagination-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      border-top: 1px solid var(--dashboard-divider);
      background: var(--dashboard-surface-strong);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .ap-page-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 0.5rem;
      border: 1px solid var(--dashboard-surface-border);
      background: transparent;
      font-size: 12px;
      font-weight: 500;
      color: var(--dashboard-text-secondary);
      cursor: pointer;
      transition: all 150ms ease;
    }

    .ap-page-btn:hover:not(:disabled) {
      background: rgba(var(--ap-col-accent-rgb, 174, 64, 16), 0.06);
      border-color: var(--dashboard-surface-border-strong);
    }

    .ap-page-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .ap-page-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 28px;
      height: 28px;
      padding: 0 8px;
      border-radius: 0.5rem;
      font-size: 12px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      background: var(--ap-accent-soft);
      color: var(--ap-accent);
    }

    /* ═══════════════════════════════════════════════
       REDUCED MOTION
       ═══════════════════════════════════════════════ */
    @media (prefers-reduced-motion: reduce) {
      .ap-filter-collapse {
        transition: none;
      }

      .ap-kanban-card,
      .ap-segment-btn,
      .ap-table-row,
      .ap-page-btn,
      .ap-column {
        transition: none !important;
      }
    }
    </style>
