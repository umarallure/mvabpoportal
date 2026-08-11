<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { AgreementRow, AttorneyOption, DeliveryMethod, RetainerDocuments, RetainerStatus } from './retainer-types'

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
  documents: RetainerDocuments
  selectedAttorney: AttorneyOption | null
}>()

const emit = defineEmits<{
  busy: [value: boolean]
  'update:locked': [value: boolean]
  'update:status': [value: RetainerStatus | null]
  restored: []
}>()
const toast = useToast()
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
let channel: RealtimeChannel | null = null

const templates = computed(() => props.selectedAttorney?.templates ?? [])
const selectedTemplate = computed(() => templates.value.find(template => template.id === selectedTemplateId.value) ?? null)
const templateItems = computed(() => templates.value.map(template => ({
  label: `${template.name}${template.stateCode ? ` (${template.stateCode})` : ''}`,
  value: template.id
})))
const sendLocked = computed(() => ['unknown', 'sent', 'viewed', 'signed'].includes(agreement.value?.status ?? ''))

const normalizePhone = (value: string) => value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail.value.trim()))
const phoneValid = computed(() => normalizePhone(signerPhone.value).length === 10)
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
  if (!props.selectedAttorney?.selectable) missing.push('eligible attorney')
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
  { label: 'Not Sent', helper: 'Waiting to send' },
  { label: 'Sent', helper: 'Envelope delivered' },
  { label: 'Viewed', helper: 'Client opened it' },
  { label: 'Signed', helper: 'Retainer complete' }
] as const
const currentStepIndex = computed(() => {
  const status = agreement.value?.status ?? null
  if (status === 'signed') return 3
  if (status === 'viewed') return 2
  if (status === 'sent' || status === 'declined') return 1
  return 0
})
const currentStepLabel = computed(() => {
  const status = agreement.value?.status ?? null
  if (!status) return progressSteps[0].label
  if (status === 'declined' || status === 'voided' || status === 'unknown') return statusMeta.value.label
  return progressSteps[currentStepIndex.value]?.label ?? progressSteps[0].label
})

const applyBestTemplate = () => {
  const available = templates.value
  if (!available.some(template => template.id === selectedTemplateId.value)) {
    selectedTemplateId.value = available[0]?.id ?? ''
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
  emit('restored')
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
  if (!canSend.value || !props.selectedAttorney || !selectedTemplate.value) return
  if (!requestId.value || ['declined', 'voided'].includes(agreement.value?.status ?? '')) requestId.value = crypto.randomUUID()
  sending.value = true
  emit('busy', true)
  try {
    const { data, error } = await supabase.functions.invoke('docusign-send-contract', {
      body: {
        requestId: requestId.value,
        submissionId: props.submissionId,
        templateMappingId: selectedTemplate.value.id,
        attorneyOptionId: props.selectedAttorney.id,
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

watch(() => props.selectedAttorney, applyBestTemplate, { immediate: true })
watch(() => props.initialAgreementId, () => { void loadInitialAgreement() }, { immediate: true })
watch(sendLocked, (locked) => { emit('update:locked', locked) }, { immediate: true })
watch(() => agreement.value?.status ?? null, (status) => { emit('update:status', status) }, { immediate: true })
// A changed attorney or template is a new logical request: never reuse the
// idempotency key, or a retry could replay the previous selection's envelope.
watch([() => props.selectedAttorney?.id, selectedTemplateId], () => {
  requestId.value = ''
})

onBeforeUnmount(() => {
  void stopRealtime()
  emit('busy', false)
})
</script>

<template>
  <section class="ap-fade-in relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
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
              Send the retainer agreement for the selected attorney to the client for signature.
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
          A signed retainer agreement is required before this lead can be submitted. The selected attorney does not change lead assignment.
        </p>
      </div>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
        <!-- Left column: send configuration -->
        <div class="space-y-4">
          <div v-if="sendLocked" class="rounded-xl border border-[var(--ap-accent)]/15 bg-[var(--ap-accent)]/[0.04] px-4 py-3 text-xs text-muted">
            A repeat send is disabled while this envelope is active. Declined or voided envelopes can be replaced.
          </div>
          <template v-else>
            <div
              v-if="selectedAttorney"
              class="flex items-center gap-2.5 rounded-xl border border-success/25 bg-success/[0.06] px-4 py-3"
            >
              <UIcon name="i-lucide-circle-check" class="size-4 shrink-0 text-success" />
              <div class="min-w-0">
                <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Selected attorney
                </p>
                <p class="truncate text-sm font-semibold text-highlighted">
                  {{ selectedAttorney.displayName }}
                </p>
              </div>
            </div>
            <div v-else class="flex items-center gap-2.5 rounded-xl border border-dashed border-[var(--ap-accent)]/25 px-4 py-3 text-xs text-muted">
              <UIcon name="i-lucide-scale" class="size-4 shrink-0 text-muted/60" />
              Select an attorney in the recommendations above to enable sending.
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-xl border border-[var(--ap-accent)]/15 bg-white/55 p-4 dark:bg-white/[0.03]">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-map-pin" class="size-4 text-[var(--ap-accent)]" />
                  <p class="text-xs font-semibold text-highlighted">
                    State
                  </p>
                </div>
                <p class="mt-1 text-[11px] text-muted">
                  Synced from the customer's state in the intake form.
                </p>
                <p class="mt-3 text-sm font-semibold text-highlighted">
                  {{ customerState || '—' }}
                </p>
              </div>
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
                {{ deliveryMethod === 'sms_only' ? 'Send Retainer by Text' : 'Send Retainer Agreement' }}
              </UButton>
            </div>
          </template>
        </div>

        <!-- Right column: Agreement Status -->
        <div class="rounded-xl border border-[var(--ap-accent)]/20 bg-white/65 dark:bg-white/[0.03]">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ap-accent)]/10 px-4 py-3">
            <div class="min-w-0">
              <p class="text-xs font-semibold text-highlighted">
                Agreement Status
              </p>
              <p v-if="agreement" class="mt-1 break-all font-mono text-[10px] text-muted">
                {{ agreement.envelope_id }}
              </p>
              <p v-else class="mt-1 text-[10px] text-muted">
                No envelope has been sent yet.
              </p>
            </div>
            <div class="flex gap-2">
              <UButton
                v-if="agreement"
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-refresh-cw"
                :loading="refreshing"
                @click="refreshStatus"
              >
                Refresh
              </UButton>
            </div>
          </div>
          <div class="space-y-3 p-4">
            <div class="flex items-center justify-between gap-2">
              <p class="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                Current stage
              </p>
              <span class="text-xs font-semibold text-[var(--ap-accent)]" data-testid="retainer-current-step">{{ currentStepLabel }}</span>
            </div>
            <ol class="space-y-2.5" data-testid="retainer-progress">
              <li
                v-for="(step, index) in progressSteps"
                :key="step.label"
                class="flex items-start gap-2.5"
              >
                <span
                  class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold"
                  :class="index < currentStepIndex
                    ? 'border-success bg-success text-white'
                    : index === currentStepIndex
                      ? 'border-[var(--ap-accent)] bg-[var(--ap-accent)]/10 text-[var(--ap-accent)]'
                      : 'border-black/10 text-muted/60 dark:border-white/15'"
                >
                  <UIcon v-if="index < currentStepIndex" name="i-lucide-check" class="size-2.5" />
                  <template v-else>{{ index + 1 }}</template>
                </span>
                <div class="min-w-0">
                  <p
                    class="text-xs font-semibold"
                    :class="index <= currentStepIndex ? 'text-highlighted' : 'text-muted/70'"
                  >
                    {{ step.label }}
                  </p>
                  <p class="text-[10px] text-muted">
                    {{ step.helper }}
                  </p>
                </div>
              </li>
            </ol>
            <UButton
              v-if="agreement?.status === 'signed' && agreement.document_storage_path"
              size="xs"
              color="success"
              icon="i-lucide-download"
              class="w-full justify-center"
              :loading="downloading"
              @click="downloadSignedPdf"
            >
              Download Signed Retainer
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
