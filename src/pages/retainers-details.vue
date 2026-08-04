<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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

type RetainerAgreementRow = {
  id: string
  envelope_id: string
  status: 'unknown' | 'sent' | 'viewed' | 'signed' | 'declined' | 'voided'
  delivery_method: 'email' | 'sms_only' | null
  sent_at: string | null
  viewed_at: string | null
  signed_at: string | null
  document_bucket: string | null
  document_storage_path: string | null
  document_file_name: string | null
}

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const publisherDocusignEnabled = auth.hasPublisherFeature('docusign_retainer')

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
const retainerAgreement = ref<RetainerAgreementRow | null>(null)
const retainerDownloading = ref(false)
const activeTab = ref('basic')

const tabs = [
  { label: 'Basic Information', icon: 'i-lucide-user', value: 'basic' },
  { label: 'Accident Details', icon: 'i-lucide-car', value: 'accident' },
  { label: 'Notes', icon: 'i-lucide-sticky-note', value: 'notes' },
  { label: 'Documents', icon: 'i-lucide-folder-open', value: 'documents' }
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

    if (publisherDocusignEnabled.value && row.value.submission_id) {
      const { data: agreement, error: agreementError } = await supabase
        .from('retainer_agreements')
        .select('id,envelope_id,status,delivery_method,sent_at,viewed_at,signed_at,document_bucket,document_storage_path,document_file_name')
        .eq('submission_id', row.value.submission_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (agreementError) console.warn('[retainer_agreements] lookup failed', agreementError.message)
      retainerAgreement.value = (agreement as RetainerAgreementRow | null) ?? null
    } else {
      retainerAgreement.value = null
    }

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
    { key: 'submission_date', label: 'Submission Date', value: formatDateTime(row.value.submission_date || row.value.created_at) }
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

// ── Documents ──────────────────────────────────────────────────────────────────

const STORAGE_BUCKET = 'lead-documents'

const DOC_CATEGORIES = [
  { value: 'police_report',       label: 'Police Report',       icon: 'i-lucide-file-badge' },
  { value: 'insurance_document',  label: 'Insurance Document',  icon: 'i-lucide-shield' },
  { value: 'medical_report',      label: 'Medical Report',      icon: 'i-lucide-stethoscope' },
  { value: 'others',              label: 'Others',              icon: 'i-lucide-file' }
] as const

type DocCategory = typeof DOC_CATEGORIES[number]['value']

type StorageDoc = {
  id: string          // full storage path used as stable key
  category: DocCategory
  fileName: string    // display name — timestamp prefix stripped
  fileSize: number
  createdAt: string
  storagePath: string // submissionId/category/storedFileName
}

const activeDocCategory = ref<DocCategory>('police_report')
const docs = ref<Record<DocCategory, StorageDoc[]>>({
  police_report: [],
  insurance_document: [],
  medical_report: [],
  others: []
})
const docsLoading = ref(false)

// Upload state
const docUploadFile = ref<File | null>(null)
const docUploadName = ref('')   // required for 'others' category
const docUploading = ref(false)
const docFileInputEl = ref<HTMLInputElement | null>(null)

// Inline delete confirmation state
const deleteTarget = ref<StorageDoc | null>(null)
const deleting = ref(false)

// ── Helpers ────────────────────────────────────────────────────────────────────

const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_')
const getExt  = (name: string) => { const i = name.lastIndexOf('.'); return i >= 0 ? name.slice(i) : '' }
const stripTs = (name: string) => name.replace(/^\d+_/, '')

const buildStoredName = (file: File, category: DocCategory, docName: string): string => {
  const ts = Date.now()
  if (category === 'others' && docName.trim()) {
    const ext     = getExt(file.name)
    let   base    = docName.trim()
    const baseExt = getExt(base)
    if (baseExt) base = base.slice(0, -baseExt.length)
    const safe = sanitize(base).replace(/_+/g, '_').replace(/^_|_$/g, '')
    return `${ts}_${safe}${ext}`
  }
  return `${ts}_${sanitize(file.name)}`
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '—'
  if (bytes < 1024)             return `${bytes} B`
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// ── Load ───────────────────────────────────────────────────────────────────────

const loadCategoryDocs = async (category: DocCategory, submissionId: string): Promise<StorageDoc[]> => {
  const folder = `${submissionId}/${category}`
  const { data, error: listErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(folder, { limit: 100, offset: 0, sortBy: { column: 'created_at', order: 'desc' } })

  if (listErr) {
    console.warn(`[docs] list failed for ${folder}:`, listErr.message)
    return []
  }

  return (data ?? [])
    .filter(item => item.name !== '.emptyFolderPlaceholder')
    .map(item => ({
      id:          `${folder}/${item.name}`,
      category,
      fileName:    stripTs(item.name),
      fileSize:    (item.metadata as Record<string, unknown>)?.size as number ?? 0,
      createdAt:   item.created_at ?? new Date().toISOString(),
      storagePath: `${folder}/${item.name}`
    }))
}

const loadAllDocs = async () => {
  if (!row.value?.submission_id) return
  docsLoading.value = true
  try {
    const sid = row.value.submission_id
    const results = await Promise.all(DOC_CATEGORIES.map(c => loadCategoryDocs(c.value, sid)))
    DOC_CATEGORIES.forEach((c, i) => { docs.value[c.value] = results[i] })
  } finally {
    docsLoading.value = false
  }
}

const refreshCategory = async (category: DocCategory) => {
  if (!row.value?.submission_id) return
  docs.value[category] = await loadCategoryDocs(category, row.value.submission_id)
}

// Load docs when the tab is opened for the first time
watch(activeTab, val => { if (val === 'documents') loadAllDocs() })

// ── Upload ─────────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const MAX_BYTES     = 10 * 1024 * 1024

const toast = useToast()

const onDocFileChange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0] ?? null
  if (!file) return

  if (!ALLOWED_TYPES.includes(file.type)) {
    toast.add({ title: 'Invalid file type', description: 'Only PDF, PNG, and JPEG are allowed.', color: 'error', icon: 'i-lucide-x' })
    if (docFileInputEl.value) docFileInputEl.value.value = ''
    return
  }
  if (file.size > MAX_BYTES) {
    toast.add({ title: 'File too large', description: 'Maximum size is 10 MB.', color: 'error', icon: 'i-lucide-x' })
    if (docFileInputEl.value) docFileInputEl.value.value = ''
    return
  }
  docUploadFile.value = file
}

const uploadDocument = async () => {
  if (!docUploadFile.value || !row.value?.submission_id) return

  if (activeDocCategory.value === 'others' && !docUploadName.value.trim()) {
    toast.add({ title: 'Document name required', description: 'Please enter a name for this document.', color: 'warning', icon: 'i-lucide-alert-circle' })
    return
  }

  docUploading.value = true
  try {
    const storedName = buildStoredName(docUploadFile.value, activeDocCategory.value, docUploadName.value)
    const filePath   = `${row.value.submission_id}/${activeDocCategory.value}/${storedName}`

    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, docUploadFile.value, { cacheControl: '3600', upsert: false })

    if (uploadErr) throw uploadErr

    toast.add({ title: 'Document uploaded', description: `${stripTs(storedName)} uploaded successfully.`, color: 'success', icon: 'i-lucide-check' })
    docUploadFile.value = null
    docUploadName.value = ''
    if (docFileInputEl.value) docFileInputEl.value.value = ''
    await refreshCategory(activeDocCategory.value)
  } catch (e) {
    toast.add({ title: 'Upload failed', description: e instanceof Error ? e.message : 'Unknown error', color: 'error', icon: 'i-lucide-x' })
  } finally {
    docUploading.value = false
  }
}

// ── View (signed URL) ──────────────────────────────────────────────────────────

const viewDocument = async (doc: StorageDoc) => {
  const { data, error: signErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(doc.storagePath, 3600)

  if (signErr || !data?.signedUrl) {
    toast.add({ title: 'Cannot open document', description: signErr?.message ?? 'Signed URL failed', color: 'error', icon: 'i-lucide-x' })
    return
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

const downloadSignedRetainer = async () => {
  const agreement = retainerAgreement.value
  if (!agreement?.document_bucket || !agreement.document_storage_path) return
  retainerDownloading.value = true
  const { data, error: downloadError } = await supabase.storage
    .from(agreement.document_bucket)
    .download(agreement.document_storage_path)
  retainerDownloading.value = false
  if (downloadError) {
    toast.add({ title: 'Cannot download signed retainer', description: downloadError.message, color: 'error', icon: 'i-lucide-x' })
    return
  }
  const url = URL.createObjectURL(data)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = agreement.document_file_name || 'signed-retainer.pdf'
  anchor.click()
  URL.revokeObjectURL(url)
}

// ── Delete ─────────────────────────────────────────────────────────────────────

const requestDelete = (doc: StorageDoc) => { deleteTarget.value = doc }
const cancelDelete  = ()              => { deleteTarget.value = null  }

const confirmDelete = async () => {
  if (!deleteTarget.value || !row.value?.submission_id) return
  const doc   = deleteTarget.value
  const parts = doc.storagePath.split('/')
  const validCategories: string[] = ['police_report', 'insurance_document', 'medical_report', 'others']

  // Mirror server-side guardrails from the handoff spec
  if (
    parts.length !== 3              ||
    parts[0] !== row.value.submission_id ||
    !validCategories.includes(parts[1])  ||
    !parts[2]                            ||
    parts[2] === '.emptyFolderPlaceholder' ||
    doc.storagePath.includes('..')
  ) {
    toast.add({ title: 'Invalid path', description: 'Document path failed safety validation.', color: 'error', icon: 'i-lucide-x' })
    deleteTarget.value = null
    return
  }

  deleting.value = true
  try {
    const { error: delErr } = await supabase.storage.from(STORAGE_BUCKET).remove([doc.storagePath])
    if (delErr) throw delErr

    toast.add({ title: 'Document deleted', description: `${doc.fileName} has been removed.`, color: 'success', icon: 'i-lucide-check' })
    docs.value[doc.category] = docs.value[doc.category].filter(d => d.id !== doc.id)
  } catch (e) {
    toast.add({ title: 'Delete failed', description: e instanceof Error ? e.message : 'Unknown error', color: 'error', icon: 'i-lucide-x' })
  } finally {
    deleting.value = false
    deleteTarget.value = null
  }
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
          <NotificationBell />
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

            <!-- ═══ Basic Information ═══════════════════════════════════ -->
            <div v-if="item.value === 'basic'" class="ap-fade-in ap-delay-1 relative flex flex-col overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#111111]/90">
              <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />
              <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
                <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
                <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
                <div class="relative flex items-center gap-3 px-5 py-3.5">
                  <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
                    <UIcon name="i-lucide-user" class="text-xs text-[var(--ap-accent)]" />
                  </div>
                  <span class="text-[13px] font-semibold text-highlighted">Basic Information</span>
                </div>
              </div>
              <div class="relative flex-1 p-4 sm:p-5">
                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div
                    v-for="field in basicInfoFields"
                    :key="field.key"
                    class="rounded-lg border border-[var(--ap-accent)]/15 bg-[var(--ap-accent)]/[0.02] p-3 transition-colors hover:bg-[var(--ap-accent)]/[0.05]"
                  >
                    <p class="text-[10px] font-semibold uppercase tracking-wider text-[var(--ap-accent)]">{{ field.label }}</p>
                    <p class="mt-1.5 text-sm font-medium text-highlighted break-all">{{ formatValue(field.value) }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- ═══ Accident Details ════════════════════════════════════ -->
            <div v-else-if="item.value === 'accident'" class="ap-fade-in ap-delay-1 relative flex flex-col overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#111111]/90">
              <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />
              <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
                <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
                <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
                <div class="relative flex items-center gap-3 px-5 py-3.5">
                  <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
                    <UIcon name="i-lucide-car" class="text-xs text-[var(--ap-accent)]" />
                  </div>
                  <span class="text-[13px] font-semibold text-highlighted">Accident Details</span>
                </div>
              </div>
              <div class="relative flex-1 p-4 sm:p-5">
                <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div
                    v-for="field in accidentDetailsFields"
                    :key="field.key"
                    class="rounded-lg border border-[var(--ap-accent)]/15 bg-[var(--ap-accent)]/[0.02] p-3 transition-colors hover:bg-[var(--ap-accent)]/[0.05]"
                  >
                    <p class="text-[10px] font-semibold uppercase tracking-wider text-[var(--ap-accent)]">{{ field.label }}</p>
                    <p class="mt-1.5 text-sm font-medium text-highlighted break-all">{{ formatValue(field.value) }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- ═══ Notes ═══════════════════════════════════════════════ -->
            <div v-else-if="item.value === 'notes'" class="ap-fade-in ap-delay-1 relative flex flex-col overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#111111]/90">
              <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />
              <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
                <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
                <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
                <div class="relative flex items-center justify-between gap-3 px-5 py-3.5">
                  <div class="flex items-center gap-3">
                    <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
                      <UIcon name="i-lucide-sticky-note" class="text-xs text-[var(--ap-accent)]" />
                    </div>
                    <span class="text-[13px] font-semibold text-highlighted">Notes</span>
                  </div>
                  <span v-if="noteRows.length > 0" class="rounded-md border border-[var(--ap-accent)]/30 bg-[var(--ap-accent)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--ap-accent)]">{{ noteRows.length }} {{ noteRows.length === 1 ? 'note' : 'notes' }}</span>
                </div>
              </div>
              <div class="relative flex-1">
                <div v-if="noteRows.length === 0" class="flex flex-col items-center gap-3 py-14 text-center">
                  <div class="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/[0.06]">
                    <UIcon name="i-lucide-sticky-note" class="size-6 text-[var(--ap-accent)]/50" />
                  </div>
                  <p class="text-sm text-muted">No notes found</p>
                </div>
                <div v-else>
                  <div
                    v-for="n in noteRows"
                    :key="n.id"
                    class="border-b border-black/[0.04] px-4 py-3.5 transition-colors last:border-0 hover:bg-[var(--ap-accent)]/[0.02] dark:border-white/[0.04] sm:px-5"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex items-center gap-2">
                        <div class="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--ap-accent)]/10">
                          <UIcon name="i-lucide-user" class="text-[10px] text-[var(--ap-accent)]" />
                        </div>
                        <span class="text-xs font-semibold text-highlighted">{{ n.agent }}</span>
                      </div>
                      <span class="text-[10px] text-muted">{{ n.created_at }}</span>
                    </div>
                    <p class="mt-2 whitespace-pre-wrap pl-8 text-sm leading-relaxed text-highlighted/80">{{ n.note }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- ═══ Documents ═══════════════════════════════════════════ -->
            <div v-else-if="item.value === 'documents'" class="space-y-4">

              <div v-if="publisherDocusignEnabled && retainerAgreement" class="rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 p-4 shadow-sm dark:bg-[#111111]/90">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="flex items-center gap-3">
                    <span class="flex size-9 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10 text-[var(--ap-accent)]"><UIcon name="i-lucide-file-signature" /></span>
                    <div>
                      <p class="text-sm font-semibold text-highlighted">DocuSign Retainer Agreement</p>
                      <p class="mt-0.5 break-all font-mono text-[10px] text-muted">{{ retainerAgreement.envelope_id }}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <UBadge :color="retainerAgreement.status === 'signed' ? 'success' : retainerAgreement.status === 'declined' ? 'error' : 'info'" variant="subtle">{{ retainerAgreement.status }}</UBadge>
                    <UButton
                      v-if="retainerAgreement.status === 'signed' && retainerAgreement.document_storage_path"
                      size="xs"
                      color="success"
                      icon="i-lucide-download"
                      :loading="retainerDownloading"
                      @click="downloadSignedRetainer"
                    >Signed PDF</UButton>
                  </div>
                </div>
                <p class="mt-3 text-xs text-muted">Sent {{ formatDateTime(retainerAgreement.sent_at) }}<span v-if="retainerAgreement.signed_at"> · Signed {{ formatDateTime(retainerAgreement.signed_at) }}</span></p>
              </div>

              <!-- Category selector -->
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="cat in DOC_CATEGORIES"
                  :key="cat.value"
                  type="button"
                  class="flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-all"
                  :class="activeDocCategory === cat.value
                    ? 'border-[var(--ap-accent)]/60 bg-[var(--ap-accent)]/15 text-[var(--ap-accent)] shadow-sm'
                    : 'border-[var(--ap-accent)]/15 text-muted hover:border-[var(--ap-accent)]/30 hover:bg-[var(--ap-accent)]/[0.04]'"
                  @click="activeDocCategory = cat.value"
                >
                  <UIcon :name="cat.icon" class="size-3.5" />
                  {{ cat.label }}
                  <span class="rounded bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-semibold dark:bg-white/[0.08]">{{ docs[cat.value].length }}</span>
                </button>
              </div>

              <!-- Upload area card -->
              <div class="relative flex flex-col overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#111111]/90">
                <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />
                <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
                  <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
                  <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
                  <div class="relative flex items-center gap-3 px-5 py-3.5">
                    <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
                      <UIcon name="i-lucide-upload" class="text-xs text-[var(--ap-accent)]" />
                    </div>
                    <span class="text-[13px] font-semibold text-highlighted">Upload to {{ DOC_CATEGORIES.find(c => c.value === activeDocCategory)?.label }}</span>
                  </div>
                </div>
                <div class="relative flex-1 space-y-4 p-4 sm:p-5">
                  <div v-if="activeDocCategory === 'others'" class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">Document Name <span class="text-red-400/80">*</span></label>
                    <UInput v-model="docUploadName" size="sm" placeholder="e.g. Repair Estimate v2" autocomplete="off" class="w-full sm:max-w-sm" />
                  </div>

                  <div
                    class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--ap-accent)]/25 p-8 text-center transition-all hover:border-[var(--ap-accent)]/50 hover:bg-[var(--ap-accent)]/[0.03]"
                    @click="docFileInputEl?.click()"
                  >
                    <input
                      ref="docFileInputEl"
                      type="file"
                      class="hidden"
                      accept=".pdf,.png,.jpg,.jpeg"
                      @change="onDocFileChange"
                    >
                    <div class="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/[0.06]">
                      <UIcon name="i-lucide-file-plus" class="size-5 text-[var(--ap-accent)]/60" />
                    </div>
                    <div v-if="docUploadFile" class="text-sm font-medium text-highlighted">
                      {{ docUploadFile.name }}
                      <span class="ml-1 text-xs text-muted">({{ formatBytes(docUploadFile.size) }})</span>
                    </div>
                    <div v-else class="space-y-0.5">
                      <p class="text-xs font-medium text-muted">Click to browse or drag and drop</p>
                      <p class="text-[10px] text-muted/60">PDF, PNG, JPEG &middot; max 10 MB</p>
                    </div>
                  </div>

                  <div class="flex items-center gap-2">
                    <UButton
                      size="sm"
                      :loading="docUploading"
                      :disabled="!docUploadFile || docUploading"
                      @click="uploadDocument"
                    >
                      <template #leading>
                        <UIcon name="i-lucide-upload" class="text-xs" />
                      </template>
                      Upload Document
                    </UButton>
                    <UButton
                      v-if="docUploadFile"
                      label="Clear"
                      size="sm"
                      color="neutral"
                      variant="ghost"
                      :disabled="docUploading"
                      @click="docUploadFile = null; docUploadName = ''; if (docFileInputEl) docFileInputEl.value = ''"
                    />
                  </div>
                </div>
              </div>

              <!-- Document list card -->
              <div class="relative flex flex-col overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#111111]/90">
                <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />
                <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
                  <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
                  <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
                  <div class="relative flex items-center justify-between gap-3 px-5 py-3.5">
                    <div class="flex items-center gap-3">
                      <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
                        <UIcon name="i-lucide-folder-open" class="text-xs text-[var(--ap-accent)]" />
                      </div>
                      <span class="text-[13px] font-semibold text-highlighted">{{ DOC_CATEGORIES.find(c => c.value === activeDocCategory)?.label }}</span>
                      <span class="rounded-md border border-[var(--ap-accent)]/30 bg-[var(--ap-accent)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--ap-accent)]">{{ docs[activeDocCategory].length }} file{{ docs[activeDocCategory].length !== 1 ? 's' : '' }}</span>
                    </div>
                    <UButton
                      icon="i-lucide-refresh-cw"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :loading="docsLoading"
                      @click="refreshCategory(activeDocCategory)"
                    />
                  </div>
                </div>

                <div class="relative flex-1">
                  <!-- Loading -->
                  <div v-if="docsLoading" class="flex flex-col items-center gap-3 py-12 text-center">
                    <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-[var(--ap-accent)]" />
                    <p class="text-xs text-muted">Loading documents...</p>
                  </div>

                  <!-- Empty -->
                  <div v-else-if="docs[activeDocCategory].length === 0" class="flex flex-col items-center gap-3 py-12 text-center">
                    <div class="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/[0.06]">
                      <UIcon name="i-lucide-folder-open" class="size-6 text-[var(--ap-accent)]/50" />
                    </div>
                    <p class="text-sm text-muted">No documents uploaded yet</p>
                  </div>

                  <!-- File rows -->
                  <div v-else>
                    <div
                      v-for="doc in docs[activeDocCategory]"
                      :key="doc.id"
                      class="border-b border-black/[0.04] last:border-0 dark:border-white/[0.04]"
                    >
                      <div class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--ap-accent)]/[0.02] sm:px-5">
                        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/[0.06]">
                          <UIcon
                            :name="doc.fileName.endsWith('.pdf') ? 'i-lucide-file-text' : 'i-lucide-image'"
                            class="size-4 text-[var(--ap-accent)]"
                          />
                        </div>
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm font-medium text-highlighted">{{ doc.fileName }}</p>
                          <p class="mt-0.5 text-[10px] text-muted">{{ formatBytes(doc.fileSize) }} &middot; {{ formatDateTime(doc.createdAt) }}</p>
                        </div>
                        <div class="flex shrink-0 items-center gap-0.5">
                          <UButton icon="i-lucide-eye" size="xs" color="neutral" variant="ghost" title="View document" @click="viewDocument(doc)" />
                          <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" class="text-red-400 hover:text-red-300" title="Delete document" :disabled="deleteTarget?.id === doc.id" @click="requestDelete(doc)" />
                        </div>
                      </div>

                      <!-- Inline delete confirmation -->
                      <div
                        v-if="deleteTarget?.id === doc.id"
                        class="mx-4 mb-3 flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-4 py-2.5 sm:mx-5"
                      >
                        <UIcon name="i-lucide-triangle-alert" class="shrink-0 text-red-400 size-4" />
                        <p class="flex-1 text-xs text-muted">
                          Delete <strong class="text-highlighted">{{ doc.fileName }}</strong>? This cannot be undone.
                        </p>
                        <div class="flex gap-1.5">
                          <UButton label="Delete" color="error" size="xs" :loading="deleting" @click="confirmDelete" />
                          <UButton label="Cancel" color="neutral" variant="ghost" size="xs" :disabled="deleting" @click="cancelDelete" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </UTabs>
      </div>
    </template>
  </UDashboardPanel>
</template>
