<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { supabase } from '../lib/supabase'

const auth = useAuth()
const router = useRouter()
const route = useRoute()
const toast = useToast()
const dncRawPhone = ref('')
const dncChecking = ref(false)
const dncVerified = ref(false)
const dncBlocked = ref(false)
const dncStatus = ref<'idle' | 'clean' | 'blocked' | 'error'>('idle')

const verifyDNC = async () => {
  const digits = dncRawPhone.value.replace(/\D/g, '')
  if (digits.length !== 10) {
    toast.add({
      title: 'Invalid phone number',
      description: 'Please enter a valid 10-digit US phone number.',
      icon: 'i-lucide-alert-circle',
      color: 'error'
    })
    return
  }

  dncChecking.value = true
  dncVerified.value = false
  dncBlocked.value = false
  dncStatus.value = 'idle'

  try {
    const res = await fetch(
      'https://yfivkhczzywgttbgwtgr.supabase.co/functions/v1/dnc-lookup',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string
        },
        body: JSON.stringify({ mobileNumber: digits })
      }
    )

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data?.error || `DNC check failed (${res.status})`)
    }

    const results: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.data?.results)
          ? data.data.results
          : data?.data
            ? [data.data]
            : [data]

    const entry = results[0] as Record<string, unknown> | undefined
    const isOnDnc =
      entry?.is_dnc === true ||
      entry?.dnc === true ||
      entry?.status === 'dnc' ||
      entry?.registered === true ||
      entry?.blocked === true

    if (isOnDnc) {
      dncBlocked.value = true
      dncStatus.value = 'blocked'
      form.phone_number = ''
    } else {
      dncVerified.value = true
      dncStatus.value = 'clean'
      form.phone_number = dncRawPhone.value

      // Generate submission ID now (before the form is filled) and surface it in the URL.
      // This ensures the same ID is used for tracking, saving, and the Slack notification.
      if (!submissionId.value) {
        submissionId.value = generateSubmissionId()
      }
      router.replace({ query: { ...route.query, sid: submissionId.value } })
    }
  } catch (err) {
    dncStatus.value = 'error'
    const msg = err instanceof Error ? err.message : 'DNC check failed. Please try again.'
    toast.add({ title: 'DNC Check Error', description: msg, icon: 'i-lucide-x', color: 'error' })
  } finally {
    dncChecking.value = false
  }
}

// ── Submission ID ──────────────────────────────────────────────────────────────
// Generated only after DNC verification passes, then reflected in the URL.
// Format: 19-digit numeric string (timestamp ms × 10⁶ + 6 random digits)
// matching the convention used in the existing leads table.

const submissionId = ref<string>(
  typeof route.query.sid === 'string' ? route.query.sid : ''
)

const generateSubmissionId = (): string => {
  const ts = Date.now().toString()                                          // 13 digits
  const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0') // 6 digits
  return ts + rand                                                          // 19 digits total
}

// ── Form State ─────────────────────────────────────────────────────────────────

const form = reactive({
  // Accident information
  accident_last_12_months: null as boolean | null,
  accident_date: '',
  prior_attorney_involved: null as boolean | null,
  prior_attorney_details: '',
  other_party_admit_fault: null as boolean | null,
  police_attended: null as boolean | null,
  police_report_ref: '',         
  acc_street: '',
  acc_street2: '',
  acc_city: '',
  acc_state: '',
  acc_zip: '',
  accident_scenario: '',

  // Medical information
  received_medical_treatment: null as boolean | null,
  medical_attention: '',
  injuries: '',

  // Insurance & vehicle
  insured: null as boolean | null,
  vehicle_registration: '',
  insurance_company: '',
  third_party_vehicle_registration: '',
  passengers_count: '' as number | '',

  // Customer personal info
  first_name: '',
  last_name: '',
  phone_number: '',             
  date_of_birth: '',
  email: '',
  street_address: '',
  street_address_2: '',
  city: '',
  state: '',
  zip_code: '',

  // Lead tracking
  source_url: '',
  trustedform_cert_url: '',
  ip_address: '',

  // Documents (has_* = "yes"|"no"|null, file = File object)
  has_medical_proof: null as boolean | null,
  has_insurance_docs: null as boolean | null,
  has_police_report: null as boolean | null,

  // Additional
  additional_notes: ''
})

// ── Document files — multi-file per category, staged locally, uploaded on submit ──
// Nothing hits storage until the lead is successfully saved, preventing orphaned files.

type IntakeDocCategory = 'medical_report' | 'insurance_document' | 'police_report'

const INTAKE_DOC_CATEGORIES = [
  {
    key:        'medical_report'     as IntakeDocCategory,
    label:      'Medical Treatment Proof',
    formKey:    'has_medical_proof'  as const,
    description: 'Medical records, hospital bills, treatment summaries'
  },
  {
    key:        'insurance_document' as IntakeDocCategory,
    label:      'Insurance Documents',
    formKey:    'has_insurance_docs' as const,
    description: 'Insurance policy, declaration page, claim forms'
  },
  {
    key:        'police_report'      as IntakeDocCategory,
    label:      'Police Report',
    formKey:    'has_police_report'  as const,
    description: 'Official accident / police report documents'
  }
]

const docFiles = ref<Record<IntakeDocCategory, File[]>>({
  medical_report:      [],
  insurance_document:  [],
  police_report:       []
})

// One input element ref per category
const docInputEl = ref<Record<IntakeDocCategory, HTMLInputElement | null>>({
  medical_report:      null,
  insurance_document:  null,
  police_report:       null
})

const ALLOWED_DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const MAX_DOC_BYTES      = 10 * 1024 * 1024   // 10 MB

const onDocFilesSelected = (e: Event, category: IntakeDocCategory) => {
  const fileList = (e.target as HTMLInputElement).files
  if (!fileList) return

  const incoming  = Array.from(fileList)
  const invalid   = incoming.filter(f => !ALLOWED_DOC_TYPES.includes(f.type))
  const oversized = incoming.filter(f => f.size > MAX_DOC_BYTES)

  if (invalid.length)   toast.add({ title: 'Invalid file type',  description: `Only PDF, PNG, JPEG allowed: ${invalid.map(f => f.name).join(', ')}`,    color: 'error',   icon: 'i-lucide-x' })
  if (oversized.length) toast.add({ title: 'File too large',     description: `Max 10 MB each: ${oversized.map(f => f.name).join(', ')}`,                color: 'error',   icon: 'i-lucide-x' })

  const valid = incoming.filter(f => ALLOWED_DOC_TYPES.includes(f.type) && f.size <= MAX_DOC_BYTES)
  docFiles.value[category] = [...docFiles.value[category], ...valid]

  // Reset so the same file can be re-selected after removal
  const el = docInputEl.value[category]
  if (el) el.value = ''
}

const removeDocFile = (category: IntakeDocCategory, index: number) => {
  docFiles.value[category].splice(index, 1)
}

const formatDocBytes = (bytes: number) => {
  if (bytes < 1024)             return `${bytes} B`
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// ── US States ──────────────────────────────────────────────────────────────────

const usStates = [
  { label: 'Alabama', value: 'AL' },
  { label: 'Alaska', value: 'AK' },
  { label: 'Arizona', value: 'AZ' },
  { label: 'Arkansas', value: 'AR' },
  { label: 'California', value: 'CA' },
  { label: 'Colorado', value: 'CO' },
  { label: 'Connecticut', value: 'CT' },
  { label: 'Delaware', value: 'DE' },
  { label: 'Florida', value: 'FL' },
  { label: 'Georgia', value: 'GA' },
  { label: 'Hawaii', value: 'HI' },
  { label: 'Idaho', value: 'ID' },
  { label: 'Illinois', value: 'IL' },
  { label: 'Indiana', value: 'IN' },
  { label: 'Iowa', value: 'IA' },
  { label: 'Kansas', value: 'KS' },
  { label: 'Kentucky', value: 'KY' },
  { label: 'Louisiana', value: 'LA' },
  { label: 'Maine', value: 'ME' },
  { label: 'Maryland', value: 'MD' },
  { label: 'Massachusetts', value: 'MA' },
  { label: 'Michigan', value: 'MI' },
  { label: 'Minnesota', value: 'MN' },
  { label: 'Mississippi', value: 'MS' },
  { label: 'Missouri', value: 'MO' },
  { label: 'Montana', value: 'MT' },
  { label: 'Nebraska', value: 'NE' },
  { label: 'Nevada', value: 'NV' },
  { label: 'New Hampshire', value: 'NH' },
  { label: 'New Jersey', value: 'NJ' },
  { label: 'New Mexico', value: 'NM' },
  { label: 'New York', value: 'NY' },
  { label: 'North Carolina', value: 'NC' },
  { label: 'North Dakota', value: 'ND' },
  { label: 'Ohio', value: 'OH' },
  { label: 'Oklahoma', value: 'OK' },
  { label: 'Oregon', value: 'OR' },
  { label: 'Pennsylvania', value: 'PA' },
  { label: 'Rhode Island', value: 'RI' },
  { label: 'South Carolina', value: 'SC' },
  { label: 'South Dakota', value: 'SD' },
  { label: 'Tennessee', value: 'TN' },
  { label: 'Texas', value: 'TX' },
  { label: 'Utah', value: 'UT' },
  { label: 'Vermont', value: 'VT' },
  { label: 'Virginia', value: 'VA' },
  { label: 'Washington', value: 'WA' },
  { label: 'West Virginia', value: 'WV' },
  { label: 'Wisconsin', value: 'WI' },
  { label: 'Wyoming', value: 'WY' }
]

// ── Computed helpers ───────────────────────────────────────────────────────────

const formDisabled = computed(() => !dncVerified.value)

// ── Upload helper — uploads every staged file for one category ────────────────
// Returns the storage folder path (e.g. "{sid}/medical_report") so the
// Documents tab can list files directly from storage. Returns null if no files.

const uploadCategoryFiles = async (
  files: File[],
  category: IntakeDocCategory,
  sid: string
): Promise<string | null> => {
  if (files.length === 0) return null

  for (const file of files) {
    const ts        = Date.now()
    const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath  = `${sid}/${category}/${ts}_${sanitized}`

    const { error } = await supabase.storage
      .from('lead-documents')
      .upload(filePath, file, { cacheControl: '3600', upsert: false })

    if (error) throw new Error(`Upload failed for "${file.name}": ${error.message}`)
  }

  return `${sid}/${category}`   // folder path stored in the DB column
}

// ── Validation helpers ─────────────────────────────────────────────────────────

const validate = (): string | null => {
  if (!dncVerified.value) return 'Please verify the phone number via DNC check first.'
  if (!form.first_name.trim()) return 'Customer first name is required.'
  if (!form.last_name.trim()) return 'Customer last name is required.'
  if (form.accident_last_12_months === null) return 'Please answer: Accident within last 12 months?'
  if (!form.accident_date) return 'Date of accident is required.'
  if (form.prior_attorney_involved === null) return 'Please answer: Any prior attorney involved?'
  if (form.other_party_admit_fault === null) return 'Please answer: Did the other party admit fault?'
  if (form.received_medical_treatment === null) return 'Please answer: Medical attention within 2 weeks?'
  if (form.police_attended === null) return 'Please answer: Did police attend the accident?'
  if (form.insured === null) return 'Please answer: Is the customer insured?'
  if (!form.vehicle_registration.trim()) return 'Customer vehicle registration is required.'
  if (!form.insurance_company.trim()) return 'Customer insurance company is required.'
  if (!form.third_party_vehicle_registration.trim()) return 'Third party vehicle registration is required.'
  if (!form.injuries.trim()) return 'Customer injuries / areas affected is required.'
  if (!form.accident_scenario.trim()) return 'Accident scenario is required.'
  return null
}

// ── Submit ─────────────────────────────────────────────────────────────────────

const submitting = ref(false)

const onSubmit = async () => {
  const validationError = validate()
  if (validationError) {
    toast.add({ title: 'Validation Error', description: validationError, icon: 'i-lucide-alert-circle', color: 'error' })
    return
  }

  submitting.value = true

  try {
    const sid = submissionId.value

    // Upload all staged documents on submit — nothing hits storage before this point,
    // so no orphaned files if the form was abandoned.
    const [medicalProofUrl, insuranceDocUrl, policeReportUrl] = await Promise.all([
      uploadCategoryFiles(docFiles.value.medical_report,     'medical_report',     sid),
      uploadCategoryFiles(docFiles.value.insurance_document, 'insurance_document', sid),
      uploadCategoryFiles(docFiles.value.police_report,      'police_report',      sid)
    ])

    // Build accident location string from address parts
    const accidentLocation = [
      form.acc_street,
      form.acc_street2,
      form.acc_city,
      form.acc_state,
      form.acc_zip
    ].filter(v => v.trim()).join(', ') || null

    // Prepend police report ref to additional notes if provided
    let additionalNotes = form.additional_notes.trim() || null
    if (form.police_report_ref.trim()) {
      additionalNotes = `Police Report #: ${form.police_report_ref.trim()}${additionalNotes ? '\n\n' + additionalNotes : ''}`
    }

    const payload = {
      submission_id: sid,

      // Customer identity
      customer_full_name: `${form.first_name.trim()} ${form.last_name.trim()}`,
      phone_number: dncRawPhone.value.replace(/\D/g, ''),
      email: form.email.trim() || null,
      date_of_birth: form.date_of_birth || null,

      // Customer address
      street_address: form.street_address.trim() || null,
      city: form.city.trim() || null,
      state: form.state || null,
      zip_code: form.zip_code.trim() || null,

      // Accident
      accident_last_12_months: form.accident_last_12_months,
      accident_date: form.accident_date || null,
      prior_attorney_involved: form.prior_attorney_involved ?? false,
      prior_attorney_details: form.prior_attorney_details.trim() || null,
      other_party_admit_fault: form.other_party_admit_fault ?? false,
      police_attended: form.police_attended ?? false,
      accident_location: accidentLocation,
      accident_scenario: form.accident_scenario.trim() || null,

      // Medical
      received_medical_treatment: form.received_medical_treatment ?? false,
      medical_attention: form.medical_attention.trim() || null,
      is_injured: form.injuries.trim() ? true : false,
      injuries: form.injuries.trim() || null,

      // Insurance & vehicle
      insured: form.insured ?? false,
      vehicle_registration: form.vehicle_registration.trim() || null,
      insurance_company: form.insurance_company.trim() || null,
      third_party_vehicle_registration: form.third_party_vehicle_registration.trim() || null,
      passengers_count: form.passengers_count === '' ? null : Number(form.passengers_count),

      // Lead tracking
      source_url: form.source_url.trim() || null,
      trustedform_cert_url: form.trustedform_cert_url.trim() || null,
      ip_address: form.ip_address.trim() || null,

      // Documents
      medical_treatment_proof: medicalProofUrl,
      insurance_documents: insuranceDocUrl,
      police_report: policeReportUrl,

      // Notes
      additional_notes: additionalNotes,

      // Auto-populated
      user_id: auth.state.value.user?.id ?? null,
      lead_vendor: auth.state.value.centerContext?.lead_vendor ?? null,
      status: 'transfer_api'
    }

    const { error } = await supabase.from('leads').insert(payload)
    if (error) throw new Error(error.message)

    // ── Slack notification (fire-and-forget, does not block success flow) ────
    const edgeBase = String(import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE ?? '').replace(/\/$/, '')
    const slackUrl = `${edgeBase}/functions/v1/lead-intake-notification`

    fetch(slackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string
      },
      body: JSON.stringify({
        submissionId: sid,
        customerName: payload.customer_full_name,
        customerState: payload.state ?? 'N/A',
        leadVendor: payload.lead_vendor,
        centerName: auth.state.value.centerContext?.center_name ?? 'N/A',
        submissionDate: new Date().toISOString()
      })
    }).catch(err => console.warn('[lead-intake] Slack notification failed silently:', err))

    toast.add({
      title: 'Lead Submitted',
      description: `Lead ${sid} has been successfully saved.`,
      icon: 'i-lucide-check',
      color: 'success'
    })

    await router.push('/transfers')
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to submit lead. Please try again.'
    toast.add({ title: 'Submission Error', description: msg, icon: 'i-lucide-x', color: 'error' })
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await auth.init()
})
</script>

<template>
  <UDashboardPanel id="lead-intake">
    <template #header>
      <UDashboardNavbar title="Lead Intake">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UBadge
            :label="submissionId ? `ID: ${submissionId}` : 'Verify number to generate ID'"
            :color="submissionId ? 'neutral' : 'warning'"
            variant="soft"
            class="font-mono text-xs hidden sm:flex"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-12">

        <!-- ── DNC Check ─────────────────────────────────────────────────── -->
        <UPageCard variant="subtle">
          <div class="space-y-4">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-shield-check" class="text-primary-500 size-5" />
              <h3 class="text-base font-semibold">
                DNC Verification
              </h3>
              <UBadge label="Required first" color="error" variant="soft" size="sm" />
            </div>
            <p class="text-sm text-muted">
              Enter the customer's phone number and verify it against the Do Not Call registry before proceeding with the intake form.
            </p>

            <div class="flex gap-3 items-start flex-wrap">
              <UFormField name="dncPhone" label="Customer Phone Number" class="flex-1 min-w-60">
                <UInput
                  v-model="dncRawPhone"
                  placeholder="(000) 000-0000"
                  :disabled="dncVerified"
                  class="w-full"
                  @keyup.enter="verifyDNC"
                />
              </UFormField>
              <div class="pt-6">
                <UButton
                  :label="dncVerified ? 'Verified' : 'Verify Number'"
                  :icon="dncVerified ? 'i-lucide-check' : 'i-lucide-shield'"
                  :color="dncVerified ? 'success' : 'primary'"
                  :loading="dncChecking"
                  :disabled="dncVerified || dncChecking || !dncRawPhone"
                  @click="verifyDNC"
                />
              </div>
            </div>

            <!-- DNC Status Messages -->
            <div
              v-if="dncStatus === 'clean'"
              class="flex items-center gap-2 rounded-lg bg-success-50 dark:bg-success-950 border border-success-200 dark:border-success-800 px-4 py-3"
            >
              <UIcon name="i-lucide-check-circle" class="text-success-600 dark:text-success-400 size-5 shrink-0" />
              <p class="text-sm text-success-700 dark:text-success-300 font-medium">
                Phone number verified — not on the DNC registry. You may now complete the intake form.
              </p>
            </div>

            <div
              v-if="dncStatus === 'blocked'"
              class="flex items-center gap-2 rounded-lg bg-error-50 dark:bg-error-950 border border-error-200 dark:border-error-800 px-4 py-3"
            >
              <UIcon name="i-lucide-ban" class="text-error-600 dark:text-error-400 size-5 shrink-0" />
              <p class="text-sm text-error-700 dark:text-error-300 font-medium">
                This number is on the Do Not Call registry. This lead cannot be submitted.
              </p>
            </div>
          </div>
        </UPageCard>

        <!-- ── Rest of form (locked until DNC passes) ────────────────────── -->
        <div
          :class="formDisabled ? 'pointer-events-none select-none opacity-40' : ''"
          class="space-y-6 transition-opacity duration-300"
        >

          <!-- ── Section 1: Customer Personal Information ────────────── -->
          <UPageCard variant="subtle">
            <div class="space-y-6">
              <h3 class="text-base font-semibold border-b border-default pb-3">
                Customer Personal Information
              </h3>

              <!-- Name -->
              <UFormField name="customer_name" label="Customer Name" required>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                  <UInput
                    v-model="form.first_name"
                    placeholder="First Name"
                  />
                  <UInput
                    v-model="form.last_name"
                    placeholder="Last Name"
                  />
                </div>
              </UFormField>

              <USeparator />

              <!-- Date of birth -->
              <UFormField name="date_of_birth" label="Date of Birth" required>
                <UInput
                  v-model="form.date_of_birth"
                  type="date"
                  class="w-full sm:max-w-xs"
                />
              </UFormField>

              <USeparator />

              <!-- Email -->
              <UFormField name="email" label="Email" required>
                <UInput
                  v-model="form.email"
                  type="email"
                  placeholder="ex: myname@example.com"
                  class="w-full sm:max-w-sm"
                />
                <template #description>
                  Email is required. If there is no email, create one for the customer.
                </template>
              </UFormField>

              <USeparator />

              <!-- Customer address -->
              <UFormField name="customer_address" label="Customer Address" required>
                <div class="space-y-3 w-full">
                  <UInput
                    v-model="form.street_address"
                    placeholder="Street Address"
                    class="w-full"
                  />
                  <UInput
                    v-model="form.street_address_2"
                    placeholder="Street Address Line 2"
                    class="w-full"
                  />
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <UInput
                      v-model="form.city"
                      placeholder="City"
                    />
                    <USelect
                      v-model="form.state"
                      :items="usStates"
                      placeholder="State"
                      value-key="value"
                    />
                    <UInput
                      v-model="form.zip_code"
                      placeholder="Postal / Zip Code"
                    />
                  </div>
                </div>
              </UFormField>
            </div>
          </UPageCard>

          <!-- ── Section 2: Accident Information ──────────────────────── -->
          <UPageCard variant="subtle">
            <div class="space-y-6">
              <h3 class="text-base font-semibold border-b border-default pb-3">
                Accident Information
              </h3>

              <!-- Accident within 12 months -->
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">
                    Accident within last 12 months? <span class="text-error-500">*</span>
                  </p>
                </div>
                <div class="flex rounded-lg border border-default overflow-hidden w-fit shrink-0">
                  <button
                    type="button"
                    class="px-5 py-2 text-sm font-medium transition-colors border-r border-default"
                    :class="form.accident_last_12_months === true ? 'bg-primary-600 text-white' : 'hover:bg-muted text-muted'"
                    @click="form.accident_last_12_months = true"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    class="px-5 py-2 text-sm font-medium transition-colors"
                    :class="form.accident_last_12_months === false ? 'bg-error-600 text-white' : 'hover:bg-muted text-muted'"
                    @click="form.accident_last_12_months = false"
                  >
                    No
                  </button>
                </div>
              </div>

              <USeparator />

              <!-- Date of accident -->
              <UFormField name="accident_date" label="Date of Accident" required>
                <UInput
                  v-model="form.accident_date"
                  type="date"
                  class="w-full sm:max-w-xs"
                />
                <template #description>
                  Select the exact date when the accident occurred (MM-DD-YYYY)
                </template>
              </UFormField>

              <USeparator />

              <!-- Prior attorney -->
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">
                    Any Prior Attorney Involved? <span class="text-error-500">*</span>
                  </p>
                </div>
                <div class="flex rounded-lg border border-default overflow-hidden w-fit shrink-0">
                  <button
                    type="button"
                    class="px-5 py-2 text-sm font-medium transition-colors border-r border-default"
                    :class="form.prior_attorney_involved === true ? 'bg-primary-600 text-white' : 'hover:bg-muted text-muted'"
                    @click="form.prior_attorney_involved = true"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    class="px-5 py-2 text-sm font-medium transition-colors"
                    :class="form.prior_attorney_involved === false ? 'bg-error-600 text-white' : 'hover:bg-muted text-muted'"
                    @click="form.prior_attorney_involved = false"
                  >
                    No
                  </button>
                </div>
              </div>

              <!-- Prior attorney details (conditional) -->
              <UFormField
                v-if="form.prior_attorney_involved === true"
                name="prior_attorney_details"
                label="Prior Attorney Involved — Details"
                required
              >
                <UInput
                  v-model="form.prior_attorney_details"
                  placeholder="Provide the name of any attorney you previously worked with regarding this accident."
                  class="w-full"
                />
              </UFormField>

              <USeparator />

              <!-- Other party admit fault -->
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">
                    Did the Other Party Admit Fault at the Scene? <span class="text-error-500">*</span>
                  </p>
                </div>
                <div class="flex rounded-lg border border-default overflow-hidden w-fit shrink-0">
                  <button
                    type="button"
                    class="px-5 py-2 text-sm font-medium transition-colors border-r border-default"
                    :class="form.other_party_admit_fault === true ? 'bg-primary-600 text-white' : 'hover:bg-muted text-muted'"
                    @click="form.other_party_admit_fault = true"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    class="px-5 py-2 text-sm font-medium transition-colors"
                    :class="form.other_party_admit_fault === false ? 'bg-error-600 text-white' : 'hover:bg-muted text-muted'"
                    @click="form.other_party_admit_fault = false"
                  >
                    No
                  </button>
                </div>
              </div>

              <USeparator />

              <!-- Police attended -->
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">
                    Did Police Attend the Accident? <span class="text-error-500">*</span>
                  </p>
                </div>
                <div class="flex rounded-lg border border-default overflow-hidden w-fit shrink-0">
                  <button
                    type="button"
                    class="px-5 py-2 text-sm font-medium transition-colors border-r border-default"
                    :class="form.police_attended === true ? 'bg-primary-600 text-white' : 'hover:bg-muted text-muted'"
                    @click="form.police_attended = true"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    class="px-5 py-2 text-sm font-medium transition-colors"
                    :class="form.police_attended === false ? 'bg-error-600 text-white' : 'hover:bg-muted text-muted'"
                    @click="form.police_attended = false"
                  >
                    No
                  </button>
                </div>
              </div>

              <!-- Police report reference (conditional) -->
              <UFormField
                v-if="form.police_attended === true"
                name="police_report_ref"
                label="Police Report Reference Number"
              >
                <UInput
                  v-model="form.police_report_ref"
                  placeholder="e.g. RPT-2024-001234"
                  class="w-full sm:max-w-sm"
                />
              </UFormField>

              <USeparator />

              <!-- Accident location -->
              <UFormField name="accident_location" label="Exact Location of the Accident">
                <div class="space-y-3 w-full">
                  <UInput
                    v-model="form.acc_street"
                    placeholder="Street Address"
                    class="w-full"
                  />
                  <UInput
                    v-model="form.acc_street2"
                    placeholder="Street Address Line 2"
                    class="w-full"
                  />
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <UInput
                      v-model="form.acc_city"
                      placeholder="City"
                    />
                    <USelect
                      v-model="form.acc_state"
                      :items="usStates"
                      placeholder="State"
                      value-key="value"
                    />
                    <UInput
                      v-model="form.acc_zip"
                      placeholder="Zip Code"
                    />
                  </div>
                </div>
              </UFormField>

              <USeparator />

              <!-- Accident scenario -->
              <UFormField name="accident_scenario" label="Accident Scenario / How the Incident Happened" required>
                <UTextarea
                  v-model="form.accident_scenario"
                  placeholder="Briefly describe how the accident occurred..."
                  :rows="4"
                  class="w-full"
                />
              </UFormField>
            </div>
          </UPageCard>

          <!-- ── Section 3: Medical Information ───────────────────────── -->
          <UPageCard variant="subtle">
            <div class="space-y-6">
              <h3 class="text-base font-semibold border-b border-default pb-3">
                Medical Information
              </h3>

              <!-- Medical attention within 2 weeks -->
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">
                    Medical Attention Within 2 Weeks? <span class="text-error-500">*</span>
                  </p>
                </div>
                <div class="flex rounded-lg border border-default overflow-hidden w-fit shrink-0">
                  <button
                    type="button"
                    class="px-5 py-2 text-sm font-medium transition-colors border-r border-default"
                    :class="form.received_medical_treatment === true ? 'bg-primary-600 text-white' : 'hover:bg-muted text-muted'"
                    @click="form.received_medical_treatment = true"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    class="px-5 py-2 text-sm font-medium transition-colors"
                    :class="form.received_medical_treatment === false ? 'bg-error-600 text-white' : 'hover:bg-muted text-muted'"
                    @click="form.received_medical_treatment = false"
                  >
                    No
                  </button>
                </div>
              </div>

              <!-- Medical attention details (conditional) -->
              <UFormField
                v-if="form.received_medical_treatment === true"
                name="medical_attention"
                label="Medical Attention Received / Hospitals Attended"
                required
              >
                <UTextarea
                  v-model="form.medical_attention"
                  placeholder="List any medical care you received and the hospitals or clinics you visited after the accident."
                  :rows="3"
                  class="w-full"
                />
              </UFormField>

              <USeparator />

              <!-- Customer injuries -->
              <UFormField name="injuries" label="Customer Injuries / Areas Affected" required>
                <UTextarea
                  v-model="form.injuries"
                  placeholder="Describe any injuries you suffered and which parts of the body were affected."
                  :rows="3"
                  class="w-full"
                />
              </UFormField>
            </div>
          </UPageCard>

          <!-- ── Section 4: Insurance & Vehicle ───────────────────────── -->
          <UPageCard variant="subtle">
            <div class="space-y-6">
              <h3 class="text-base font-semibold border-b border-default pb-3">
                Insurance & Vehicle Information
              </h3>

              <!-- Is customer insured -->
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">
                    Is Customer Insured? <span class="text-error-500">*</span>
                  </p>
                </div>
                <div class="flex rounded-lg border border-default overflow-hidden w-fit shrink-0">
                  <button
                    type="button"
                    class="px-5 py-2 text-sm font-medium transition-colors border-r border-default"
                    :class="form.insured === true ? 'bg-primary-600 text-white' : 'hover:bg-muted text-muted'"
                    @click="form.insured = true"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    class="px-5 py-2 text-sm font-medium transition-colors"
                    :class="form.insured === false ? 'bg-error-600 text-white' : 'hover:bg-muted text-muted'"
                    @click="form.insured = false"
                  >
                    No
                  </button>
                </div>
              </div>

              <USeparator />

              <!-- Vehicle registration -->
              <UFormField name="vehicle_registration" label="Customer Vehicle Registration Number" required>
                <UInput
                  v-model="form.vehicle_registration"
                  placeholder="Enter the registration or license plate number of your vehicle."
                  class="w-full sm:max-w-sm"
                />
              </UFormField>

              <USeparator />

              <!-- Insurance company -->
              <UFormField name="insurance_company" label="Customer Insurance Company Name" required>
                <UInput
                  v-model="form.insurance_company"
                  placeholder="Provide the name of your auto insurance company."
                  class="w-full sm:max-w-sm"
                />
              </UFormField>

              <USeparator />

              <!-- Third party vehicle -->
              <UFormField name="third_party_vehicle_registration" label="Third Party Vehicle Registration Number" required>
                <UInput
                  v-model="form.third_party_vehicle_registration"
                  placeholder="Enter the registration or license plate number of the other party's vehicle."
                  class="w-full sm:max-w-sm"
                />
              </UFormField>

              <USeparator />

              <!-- Passengers count -->
              <UFormField name="passengers_count" label="Number of Passengers in Your Vehicle">
                <UInput
                  v-model.number="form.passengers_count"
                  type="number"
                  placeholder="e.g. 2"
                  min="0"
                  class="w-32"
                />
                <template #description>
                  Specify how many passengers were riding with you at the time of the accident.
                </template>
              </UFormField>
            </div>
          </UPageCard>

          <!-- ── Section 5: Lead Tracking ──────────────────────────────── -->
          <UPageCard variant="subtle">
            <div class="space-y-6">
              <h3 class="text-base font-semibold border-b border-default pb-3">
                Lead Tracking
              </h3>

              <UFormField name="source_url" label="Source URL" required>
                <UInput
                  v-model="form.source_url"
                  placeholder="Landing page URL where the lead was generated"
                  class="w-full"
                />
              </UFormField>

              <USeparator />

              <UFormField name="trustedform_cert_url" label="TrustedForm Cert URL" required>
                <UInput
                  v-model="form.trustedform_cert_url"
                  placeholder="TrustedForm certificate URL"
                  class="w-full"
                />
              </UFormField>

              <USeparator />

              <UFormField name="ip_address" label="IP Address" required>
                <UInput
                  v-model="form.ip_address"
                  placeholder="IP address of the user"
                  class="w-full sm:max-w-sm"
                />
              </UFormField>
            </div>
          </UPageCard>

          <!-- ── Section 6: Documents ──────────────────────────────────── -->
          <!-- Files are staged in memory here; all uploads happen on submit  -->
          <!-- so no orphaned files are left if the form is abandoned.        -->
          <UPageCard variant="subtle">
            <div class="space-y-6">
              <h3 class="text-base font-semibold border-b border-default pb-3">
                Supporting Documents
              </h3>

              <div
                v-for="(cat, ci) in INTAKE_DOC_CATEGORIES"
                :key="cat.key"
              >
                <USeparator v-if="ci > 0" class="mb-6" />

                <div class="space-y-3">
                  <!-- Yes / No toggle -->
                  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p class="text-sm font-medium">
                        Does Customer have {{ cat.label }}?
                        <span class="text-error-500">*</span>
                      </p>
                      <p class="text-xs text-muted mt-0.5">
                        {{ cat.description }}
                      </p>
                    </div>
                    <div class="flex rounded-lg border border-default overflow-hidden w-fit shrink-0">
                      <button
                        type="button"
                        class="px-5 py-2 text-sm font-medium transition-colors border-r border-default"
                        :class="form[cat.formKey] === true ? 'bg-primary-600 text-white' : 'hover:bg-muted text-muted'"
                        @click="form[cat.formKey] = true"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        class="px-5 py-2 text-sm font-medium transition-colors"
                        :class="form[cat.formKey] === false ? 'bg-error-600 text-white' : 'hover:bg-muted text-muted'"
                        @click="form[cat.formKey] = false; docFiles[cat.key] = []"
                      >
                        No
                      </button>
                    </div>
                  </div>

                  <!-- Upload area — visible when Yes is selected -->
                  <div v-if="form[cat.formKey] === true" class="space-y-3">

                    <!-- Drop zone -->
                    <div
                      class="border-2 border-dashed border-default rounded-lg p-5 text-center cursor-pointer hover:border-primary-400 transition-colors"
                      @click="docInputEl[cat.key]?.click()"
                    >
                      <input
                        :ref="el => { docInputEl[cat.key] = el as HTMLInputElement | null }"
                        type="file"
                        multiple
                        class="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        @change="onDocFilesSelected($event, cat.key)"
                      >
                      <UIcon name="i-lucide-upload" class="mx-auto mb-2 text-muted size-6" />
                      <p class="text-sm text-muted">
                        Browse Files · Drag and drop files here
                      </p>
                      <p class="text-xs text-dimmed mt-1">
                        PDF, JPG, PNG · max 10 MB each · multiple files allowed
                      </p>
                    </div>

                    <!-- Staged file list -->
                    <div v-if="docFiles[cat.key].length > 0" class="space-y-2">
                      <p class="text-xs font-medium text-muted uppercase tracking-wide">
                        {{ docFiles[cat.key].length }} file(s) staged — will upload on submit
                      </p>
                      <div
                        v-for="(file, idx) in docFiles[cat.key]"
                        :key="`${cat.key}-${idx}-${file.name}`"
                        class="flex items-center gap-3 rounded-lg border border-default bg-elevated/20 px-3 py-2"
                      >
                        <UIcon
                          :name="file.type === 'application/pdf' ? 'i-lucide-file-text' : 'i-lucide-image'"
                          class="shrink-0 text-muted size-4"
                        />
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm font-medium text-highlighted">
                            {{ file.name }}
                          </p>
                          <p class="text-xs text-muted">
                            {{ formatDocBytes(file.size) }}
                          </p>
                        </div>
                        <button
                          type="button"
                          class="shrink-0 text-muted hover:text-error-500 transition-colors"
                          title="Remove"
                          @click="removeDocFile(cat.key, idx)"
                        >
                          <UIcon name="i-lucide-x" class="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </UPageCard>

          <!-- ── Section 7: Additional Comments ───────────────────────── -->
          <UPageCard variant="subtle">
            <div class="space-y-4">
              <h3 class="text-base font-semibold border-b border-default pb-3">
                Additional Comments
              </h3>

              <UFormField name="additional_notes" label="Additional Notes">
                <UTextarea
                  v-model="form.additional_notes"
                  placeholder="Any additional information relevant to this lead..."
                  :rows="4"
                  class="w-full"
                />
              </UFormField>
            </div>
          </UPageCard>

          <!-- ── Submit ─────────────────────────────────────────────────── -->
          <div class="flex justify-end gap-3 pt-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              :disabled="submitting"
              @click="router.push('/transfers')"
            />
            <UButton
              label="Submit Lead"
              icon="i-lucide-send"
              color="primary"
              :loading="submitting"
              :disabled="formDisabled || submitting"
              @click="onSubmit"
            />
          </div>

        </div>
        <!-- end locked form -->

      </div>
    </template>
  </UDashboardPanel>
</template>
