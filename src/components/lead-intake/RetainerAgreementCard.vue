<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

type DeliveryMethod = 'email' | 'sms_only'
type RetainerStatus = 'unknown' | 'sent' | 'viewed' | 'signed' | 'declined' | 'voided'

type TemplateOption = {
  id: string
  name: string
  type: string | null
  stateCode: string | null
  isDefault: boolean
  priority: number
}

type AttorneyOption = {
  id: string
  displayName: string
  selectable: boolean
  qualification: 'qualified' | 'missing_documents'
  reasons: string[]
  templates: TemplateOption[]
}

type AgreementRow = {
  id: string
  envelope_id: string
  status: RetainerStatus
  document_bucket: string | null
  document_storage_path: string | null
  document_file_name: string | null
}

const props = defineProps<{
  initialAgreementId?: string
  dncVerified: boolean
  submissionId: string
  customerState: string
  accidentDate: string
  dateOfBirth: string
  recipientName: string
  recipientEmail: string
  recipientPhone: string
  clientAddress: string
  accidentAddress: string
  documents: {
    policeReport: boolean
    insuranceDocuments: boolean
    medicalTreatmentProof: boolean
    driverLicense: boolean
  }
}>()

const emit = defineEmits<{ busy: [value: boolean] }>()
const toast = useToast()
const options = ref<AttorneyOption[]>([])
const loadingOptions = ref(false)
const optionsError = ref('')
const selectedAttorneyId = ref('')
const selectedTemplateId = ref('')
const deliveryMethod = ref<DeliveryMethod>('email')
const signerName = ref('')
const signerEmail = ref('')
const signerPhone = ref('')
const signerNameEdited = ref(false)
const signerEmailEdited = ref(false)
const signerPhoneEdited = ref(false)
const sending = ref(false)
const refreshing = ref(false)
const downloading = ref(false)
const agreement = ref<AgreementRow | null>(null)
const requestId = ref('')
let optionsTimer: ReturnType<typeof setTimeout> | null = null
let channel: RealtimeChannel | null = null

const qualifiedOptions = computed(() => options.value.filter(option => option.selectable))
const nearMatches = computed(() => options.value.filter(option => !option.selectable))
const selectedAttorney = computed(() => options.value.find(option => option.id === selectedAttorneyId.value) ?? null)
const templates = computed(() => selectedAttorney.value?.templates ?? [])
const selectedTemplate = computed(() => templates.value.find(template => template.id === selectedTemplateId.value) ?? null)
const templateItems = computed(() => templates.value.map(template => ({
  label: `${template.name}${template.stateCode ? ` (${template.stateCode})` : ''}`,
  value: template.id
})))
const sendLocked = computed(() => ['unknown', 'sent', 'viewed', 'signed'].includes(agreement.value?.status ?? ''))

const normalizePhone = (value: string) => value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail.value.trim()))
const phoneValid = computed(() => normalizePhone(signerPhone.value).length === 10)
const eligibilityReady = computed(() => Boolean(props.customerState && props.accidentDate && props.dateOfBirth))
const missingRequirements = computed(() => {
  const missing: string[] = []
  if (!props.dncVerified) missing.push('DNC verification')
  if (!props.submissionId) missing.push('submission ID')
  if (!props.customerState) missing.push('customer state')
  if (!props.dateOfBirth) missing.push('date of birth')
  if (!props.accidentDate) missing.push('accident date')
  if (!props.clientAddress) missing.push('client address')
  if (!props.accidentAddress) missing.push('accident location')
  if (!signerName.value.trim()) missing.push('recipient name')
  if (deliveryMethod.value === 'email' && !emailValid.value) missing.push('valid email')
  if (deliveryMethod.value === 'sms_only' && !phoneValid.value) missing.push('valid mobile number')
  if (!selectedAttorney.value?.selectable) missing.push('eligible attorney')
  if (!selectedTemplate.value) missing.push('template')
  return missing
})
const canSend = computed(() => !sending.value && !sendLocked.value && missingRequirements.value.length === 0)

const statusMeta = computed(() => ({
  unknown: { label: 'Preparing', color: 'warning', icon: 'i-lucide-loader-circle' },
  sent: { label: 'Sent', color: 'info', icon: 'i-lucide-send' },
  viewed: { label: 'Viewed', color: 'warning', icon: 'i-lucide-eye' },
  signed: { label: 'Signed', color: 'success', icon: 'i-lucide-badge-check' },
  declined: { label: 'Declined', color: 'error', icon: 'i-lucide-ban' },
  voided: { label: 'Voided', color: 'neutral', icon: 'i-lucide-circle-off' }
} as const)[agreement.value?.status ?? 'unknown'])
const progressSteps = [
  { status: 'sent', label: 'Sent', rank: 1 },
  { status: 'viewed', label: 'Viewed', rank: 2 },
  { status: 'signed', label: 'Signed', rank: 3 }
] as const
const progressRank = computed(() => ({ unknown: 0, sent: 1, viewed: 2, signed: 3, declined: 1, voided: 0 })[agreement.value?.status ?? 'unknown'])

const applyBestTemplate = () => {
  const available = templates.value
  if (!available.some(template => template.id === selectedTemplateId.value)) {
    selectedTemplateId.value = available[0]?.id ?? ''
  }
}

const resetSelection = () => {
  selectedAttorneyId.value = ''
  selectedTemplateId.value = ''
}

const loadOptions = async () => {
  resetSelection()
  options.value = []
  optionsError.value = ''
  if (!eligibilityReady.value || sendLocked.value) return

  loadingOptions.value = true
  try {
    const { data, error } = await supabase.functions.invoke('docusign-retainer-options', {
      body: {
        state: props.customerState,
        accidentDate: props.accidentDate,
        dateOfBirth: props.dateOfBirth,
        documents: props.documents
      }
    })
    if (error) throw error
    options.value = Array.isArray(data?.attorneys) ? data.attorneys : []
    selectedAttorneyId.value = qualifiedOptions.value[0]?.id ?? ''
    applyBestTemplate()
  } catch (error) {
    optionsError.value = error instanceof Error ? error.message : 'Unable to load eligible attorneys.'
  } finally {
    loadingOptions.value = false
  }
}

const stopRealtime = async () => {
  if (!channel) return
  const active = channel
  channel = null
  await supabase.removeChannel(active)
}

const subscribeToAgreement = async () => {
  await stopRealtime()
  if (!agreement.value?.id) return
  channel = supabase
    .channel(`publisher-retainer-${agreement.value.id}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'retainer_agreements', filter: `id=eq.${agreement.value.id}`
    }, payload => {
      agreement.value = payload.new as AgreementRow
    })
    .subscribe()
}

const loadInitialAgreement = async () => {
  const id = props.initialAgreementId?.trim()
  if (!id || agreement.value?.id === id) return
  const { data, error } = await supabase.from('retainer_agreements')
    .select('id,envelope_id,status,document_bucket,document_storage_path,document_file_name')
    .eq('id', id).maybeSingle()
  if (error || !data) return
  agreement.value = data as AgreementRow
  await subscribeToAgreement()
}

const refreshStatus = async () => {
  if (!agreement.value?.id) return
  refreshing.value = true
  const { data, error } = await supabase.from('retainer_agreements')
    .select('id,envelope_id,status,document_bucket,document_storage_path,document_file_name')
    .eq('id', agreement.value.id).single()
  refreshing.value = false
  if (error) {
    toast.add({ title: 'Status refresh failed', description: error.message, color: 'error' })
    return
  }
  agreement.value = data as AgreementRow
}

const sendRetainer = async () => {
  if (!canSend.value || !selectedAttorney.value || !selectedTemplate.value) return
  if (!requestId.value || ['declined', 'voided'].includes(agreement.value?.status ?? '')) requestId.value = crypto.randomUUID()
  sending.value = true
  emit('busy', true)
  try {
    const { data, error } = await supabase.functions.invoke('docusign-send-contract', {
      body: {
        requestId: requestId.value,
        submissionId: props.submissionId,
        templateMappingId: selectedTemplate.value.id,
        attorneyOptionId: selectedAttorney.value.id,
        recipientName: signerName.value.trim(),
        recipientEmail: deliveryMethod.value === 'email' ? signerEmail.value.trim() : undefined,
        recipientPhone: deliveryMethod.value === 'sms_only' ? normalizePhone(signerPhone.value) : undefined,
        recipientPhoneCountryCode: '1',
        deliveryMethod: deliveryMethod.value,
        state: props.customerState,
        accidentDate: props.accidentDate,
        dateOfBirth: props.dateOfBirth,
        accidentAddress: props.accidentAddress,
        clientAddress: props.clientAddress,
        clientPhone: normalizePhone(props.recipientPhone),
        documents: props.documents
      }
    })
    if (error) throw error
    const agreementId = String(data?.agreementId ?? '')
    const envelopeId = String(data?.envelopeId ?? '')
    agreement.value = {
      id: agreementId,
      envelope_id: envelopeId,
      status: (data?.status ?? 'sent') as RetainerStatus,
      document_bucket: null,
      document_storage_path: null,
      document_file_name: null
    }
    if (agreementId) await refreshStatus()
    await subscribeToAgreement()
    toast.add({ title: 'Retainer sent', description: `Envelope ${envelopeId} is ready for the client.`, color: 'success', icon: 'i-lucide-send' })
  } catch (error) {
    let code = ''
    let description = error instanceof Error ? error.message : 'Please try again.'
    const response = (error as { context?: Response } | null)?.context
    if (response && typeof response.clone === 'function') {
      try {
        const detail = await response.clone().json() as { code?: string, error?: string }
        code = detail.code ?? ''
        description = detail.error ?? description
      } catch {
        // Preserve the request ID after an uncertain network outcome so retry is idempotent.
      }
    }
    if (code === 'docusign_create_failed') requestId.value = ''
    toast.add({ title: 'Retainer was not sent', description, color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    sending.value = false
    emit('busy', false)
  }
}

const downloadSignedPdf = async () => {
  if (!agreement.value?.document_bucket || !agreement.value.document_storage_path) return
  downloading.value = true
  const { data, error } = await supabase.storage.from(agreement.value.document_bucket).download(agreement.value.document_storage_path)
  downloading.value = false
  if (error) {
    toast.add({ title: 'Download failed', description: error.message, color: 'error' })
    return
  }
  const url = URL.createObjectURL(data)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = agreement.value.document_file_name || 'signed-retainer.pdf'
  anchor.click()
  URL.revokeObjectURL(url)
}

watch(() => props.recipientName, (name) => {
  if (!signerNameEdited.value) signerName.value = name
}, { immediate: true })
watch(() => props.recipientEmail, (email) => {
  if (!signerEmailEdited.value) signerEmail.value = email
}, { immediate: true })
watch(() => props.recipientPhone, (phone) => {
  if (!signerPhoneEdited.value) signerPhone.value = phone
}, { immediate: true })

watch(() => JSON.stringify([props.customerState, props.accidentDate, props.dateOfBirth, props.documents]), () => {
  if (optionsTimer) clearTimeout(optionsTimer)
  optionsTimer = setTimeout(loadOptions, 350)
}, { immediate: true })
watch(() => props.initialAgreementId, () => { void loadInitialAgreement() }, { immediate: true })
watch(selectedAttorneyId, applyBestTemplate)

onBeforeUnmount(() => {
  if (optionsTimer) clearTimeout(optionsTimer)
  void stopRealtime()
  emit('busy', false)
})
</script>

<template>
  <section class="ap-fade-in ap-delay-5 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
    <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

    <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
      <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
      <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
      <div class="relative flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div class="flex items-center gap-3">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
            <UIcon name="i-lucide-file-signature" class="text-xs text-[var(--ap-accent)]" />
          </div>
          <div>
            <h2 class="text-[13px] font-semibold text-highlighted">
              DocuSign Retainer Agreement
            </h2>
            <p class="mt-0.5 text-[11px] text-muted">
              Recommend an attorney and send the agreement for signature.
            </p>
          </div>
        </div>
        <UBadge v-if="agreement" :color="statusMeta.color" variant="subtle">
          <UIcon :name="statusMeta.icon" class="mr-1" />{{ statusMeta.label }}
        </UBadge>
      </div>
    </div>

    <div class="relative space-y-5 p-5">
      <div class="flex items-start gap-2.5 rounded-xl border border-[var(--ap-accent)]/15 bg-[var(--ap-accent)]/[0.04] px-4 py-3">
        <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0 text-[var(--ap-accent)]" />
        <p class="text-xs leading-relaxed text-muted">
          This step is optional. You can submit the lead without sending a retainer, and the selected attorney does not change lead assignment.
        </p>
      </div>

      <div v-if="agreement" class="relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/20 bg-white/65 dark:bg-white/[0.03]">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ap-accent)]/10 px-4 py-3">
          <div class="min-w-0">
            <p class="text-xs font-semibold text-highlighted">
              Envelope tracking
            </p>
            <p class="mt-1 break-all font-mono text-[10px] text-muted">
              {{ agreement.envelope_id }}
            </p>
          </div>
          <div class="flex gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-refresh-cw"
              :loading="refreshing"
              @click="refreshStatus"
            >
              Refresh
            </UButton>
            <UButton
              v-if="agreement.status === 'signed' && agreement.document_storage_path"
              size="xs"
              color="success"
              icon="i-lucide-download"
              :loading="downloading"
              @click="downloadSignedPdf"
            >
              Signed PDF
            </UButton>
          </div>
        </div>
        <div class="space-y-3 p-4">
          <p v-if="sendLocked" class="text-xs text-muted">
            A repeat send is disabled while this envelope is active. Declined or voided envelopes can be replaced.
          </p>
          <div v-if="!['declined', 'voided'].includes(agreement.status)" class="grid grid-cols-3 gap-2" aria-label="DocuSign progress">
            <div v-for="step in progressSteps" :key="step.status" class="space-y-1.5">
              <div class="h-1.5 rounded-full" :class="progressRank >= step.rank ? 'bg-success' : 'bg-[var(--ap-accent)]/10'" />
              <p class="text-[10px] font-medium" :class="progressRank >= step.rank ? 'text-success' : 'text-muted'">
                {{ step.label }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <template v-if="!sendLocked">
        <div class="space-y-3">
          <div class="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p class="text-xs font-semibold text-highlighted">
                Attorney recommendation
              </p>
              <p class="mt-0.5 text-[11px] text-muted">
                Ranked automatically for the customer’s state, accident date, documents, and compatible retainers.
              </p>
            </div>
            <span v-if="qualifiedOptions.length" class="text-[11px] tabular-nums text-muted">
              {{ qualifiedOptions.length }} available
            </span>
          </div>

          <div v-if="!eligibilityReady" class="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/5 px-4 py-3 text-xs text-warning">
            <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />
            Enter customer state, DOB, and accident date to load attorney recommendations.
          </div>
          <div v-else-if="loadingOptions" class="flex items-center gap-2 rounded-xl border border-[var(--ap-accent)]/15 px-4 py-5 text-xs text-muted">
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-[var(--ap-accent)]" />
            Checking attorney and template eligibility…
          </div>
          <div v-else-if="optionsError" class="flex items-start gap-2 rounded-xl border border-error/25 bg-error/5 px-4 py-3 text-xs text-error">
            <UIcon name="i-lucide-circle-x" class="mt-0.5 size-4 shrink-0" />
            {{ optionsError }}
          </div>
          <template v-else>
            <div v-if="qualifiedOptions.length" class="flex snap-x gap-3 overflow-x-auto pb-2" aria-label="Ranked attorney recommendations">
              <button
                v-for="(attorney, index) in qualifiedOptions"
                :key="attorney.id"
                type="button"
                data-testid="attorney-option"
                class="min-w-[15rem] snap-start rounded-xl border p-4 text-left transition-all duration-200 sm:min-w-[17rem]"
                :class="selectedAttorneyId === attorney.id
                  ? 'border-[var(--ap-accent)]/60 bg-[var(--ap-accent)]/[0.08] shadow-sm ring-1 ring-[var(--ap-accent)]/20'
                  : 'border-[var(--ap-accent)]/15 bg-white/60 hover:border-[var(--ap-accent)]/35 hover:bg-[var(--ap-accent)]/[0.03] dark:bg-white/[0.03]'"
                :aria-pressed="selectedAttorneyId === attorney.id"
                @click="selectedAttorneyId = attorney.id"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] font-bold tabular-nums text-muted">#{{ String(index + 1).padStart(2, '0') }}</span>
                    <UBadge
                      v-if="index === 0"
                      color="primary"
                      variant="subtle"
                      size="xs"
                    >
                      Recommended
                    </UBadge>
                  </div>
                  <UIcon
                    :name="selectedAttorneyId === attorney.id ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                    class="size-4"
                    :class="selectedAttorneyId === attorney.id ? 'text-[var(--ap-accent)]' : 'text-muted/40'"
                  />
                </div>
                <p class="mt-3 line-clamp-2 text-sm font-semibold leading-snug text-highlighted">
                  {{ attorney.displayName }}
                </p>
                <div class="mt-3 flex items-center gap-1.5 border-t border-[var(--ap-accent)]/10 pt-2.5 text-[11px] text-muted">
                  <UIcon name="i-lucide-file-check-2" class="size-3.5 text-success" />
                  {{ attorney.templates.length }} compatible {{ attorney.templates.length === 1 ? 'retainer' : 'retainers' }}
                </div>
              </button>
            </div>
            <div v-else class="rounded-xl border border-dashed border-[var(--ap-accent)]/25 px-4 py-5 text-center">
              <UIcon name="i-lucide-scale" class="mx-auto size-5 text-muted/60" />
              <p class="mt-2 text-xs font-medium text-highlighted">
                No eligible attorneys are available
              </p>
              <p class="mt-1 text-[11px] text-muted">
                Check the customer details and supporting-document answers, then try again.
              </p>
            </div>

            <div v-if="nearMatches.length" class="rounded-xl border border-warning/25 bg-warning/[0.04] p-4">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-files" class="size-4 text-warning" />
                <div>
                  <p class="text-xs font-semibold text-highlighted">
                    Additional attorneys need documents
                  </p>
                  <p class="mt-0.5 text-[11px] text-muted">
                    These matches cannot receive a retainer until the listed requirements are met.
                  </p>
                </div>
              </div>
              <div class="mt-3 grid gap-2 lg:grid-cols-2">
                <div v-for="attorney in nearMatches" :key="attorney.id" class="rounded-lg border border-warning/15 bg-white/55 px-3 py-2.5 dark:bg-white/[0.03]">
                  <p class="text-xs font-medium text-highlighted">
                    {{ attorney.displayName }}
                  </p>
                  <p class="mt-1 text-[11px] leading-relaxed text-warning">
                    {{ attorney.reasons.join(' · ') }}
                  </p>
                </div>
              </div>
            </div>
          </template>
        </div>

        <div class="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div class="rounded-xl border border-[var(--ap-accent)]/15 bg-white/55 p-4 dark:bg-white/[0.03]">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-files" class="size-4 text-[var(--ap-accent)]" />
              <p class="text-xs font-semibold text-highlighted">
                Retainer template
              </p>
            </div>
            <p class="mt-1 text-[11px] text-muted">
              The best compatible template is preselected. Confirm it before sending.
            </p>
            <USelect
              v-model="selectedTemplateId"
              :items="templateItems"
              value-key="value"
              placeholder="Select a retainer template"
              class="mt-3 w-full"
              :disabled="!selectedAttorney"
            />
          </div>

          <div class="rounded-xl border border-[var(--ap-accent)]/15 bg-white/55 p-4 dark:bg-white/[0.03]">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-user-round-check" class="size-4 text-[var(--ap-accent)]" />
                <p class="text-xs font-semibold text-highlighted">
                  Recipient and delivery
                </p>
              </div>
              <div class="flex w-fit overflow-hidden rounded-lg border border-[var(--ap-accent)]/20">
                <button
                  type="button"
                  class="border-r border-[var(--ap-accent)]/20 px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="deliveryMethod === 'email' ? 'bg-[var(--ap-accent)] text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'"
                  @click="deliveryMethod = 'email'"
                >
                  Email
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="deliveryMethod === 'sms_only' ? 'bg-[var(--ap-accent)] text-white' : 'text-muted hover:bg-[var(--ap-accent)]/5'"
                  @click="deliveryMethod = 'sms_only'"
                >
                  Text
                </button>
              </div>
            </div>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <label class="space-y-1.5 text-xs font-medium text-highlighted">
                Recipient name
                <UInput
                  v-model="signerName"
                  @update:model-value="signerNameEdited = true"
                />
              </label>
              <label v-if="deliveryMethod === 'email'" class="space-y-1.5 text-xs font-medium text-highlighted">
                Recipient email
                <UInput
                  v-model="signerEmail"
                  type="email"
                  @update:model-value="signerEmailEdited = true"
                />
              </label>
              <label v-else class="space-y-1.5 text-xs font-medium text-highlighted">
                Recipient mobile
                <UInput
                  v-model="signerPhone"
                  type="tel"
                  @update:model-value="signerPhoneEdited = true"
                />
              </label>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ap-accent)]/15 pt-4">
          <div class="flex min-w-0 items-start gap-2">
            <UIcon
              :name="missingRequirements.length ? 'i-lucide-circle-alert' : 'i-lucide-shield-check'"
              class="mt-0.5 size-4 shrink-0"
              :class="missingRequirements.length ? 'text-warning' : 'text-success'"
            />
            <p class="text-xs leading-relaxed text-muted">
              {{ missingRequirements.length ? `To send: ${missingRequirements.join(', ')}.` : 'Ready to send securely through DocuSign.' }}
            </p>
          </div>
          <UButton
            icon="i-lucide-send"
            :loading="sending"
            :disabled="!canSend"
            @click="sendRetainer"
          >
            Send Retainer
          </UButton>
        </div>
      </template>
    </div>
  </section>
</template>
