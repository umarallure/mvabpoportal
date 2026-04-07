<script setup lang="ts">
import * as z from 'zod'
import { computed, onMounted, reactive, ref } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'

import { useAuth } from '../../composables/useAuth'
import { supabase } from '../../lib/supabase'

type BpoProfileRow = Partial<{
  center_name: string | null
  location: string | null
  website_or_linkedin: string | null
  contact_email: string | null
  contact_phone: string | null
  number_of_agents: string | null
  languages: string[] | null
  operating_hours: string | null
  case_rate_per_deal: number | null
  upfront_payment_percentage: number | null
  payment_window_days: number | null
  chargeback_window_days: number | null
}>

const profileSchema = z.object({
  centerName: z.string().trim().min(2, 'BPO / Center name is required'),
  location: z.string().trim().optional(),
  websiteOrLinkedIn: z.string().trim().optional(),
  contactEmail: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  contactPhone: z.string().trim().optional(),
  numberOfAgents: z.string().trim().optional(),
  languages: z.array(z.string()).optional(),
  operatingHours: z.string().trim().optional(),
  caseRatePerDeal: z.number().min(0).optional().or(z.literal('')),
  upfrontPaymentPercentage: z.number().min(0).max(100).optional().or(z.literal('')),
  paymentWindowDays: z.number().int().min(0).optional().or(z.literal('')),
  chargebackWindowDays: z.number().int().min(0).optional().or(z.literal(''))
})

type ProfileSchema = z.output<typeof profileSchema>

const auth = useAuth()
const toast = useToast()

const saving = ref(false)
const loading = ref(false)
const isEditing = ref(false)

const disabled = computed(() => !isEditing.value)
const centerId = computed(() => auth.state.value.profile?.center_id ?? '')

const languageOptions = [
  'English',
  'Spanish',
  'French',
  'Arabic',
  'Portuguese',
  'German',
  'Tagalog',
  'Hindi',
  'Urdu'
]

const profile = reactive<Partial<ProfileSchema>>({
  centerName: '',
  location: '',
  websiteOrLinkedIn: '',
  contactEmail: '',
  contactPhone: '',
  numberOfAgents: '',
  languages: [],
  operatingHours: '',
  caseRatePerDeal: '',
  upfrontPaymentPercentage: '',
  paymentWindowDays: '',
  chargebackWindowDays: ''
})

const hydrateFromDb = (data?: BpoProfileRow | null) => {
  profile.centerName = data?.center_name ?? ''
  profile.location = data?.location ?? ''
  profile.websiteOrLinkedIn = data?.website_or_linkedin ?? ''
  profile.contactEmail = data?.contact_email ?? ''
  profile.contactPhone = data?.contact_phone ?? ''
  profile.numberOfAgents = data?.number_of_agents ?? ''
  profile.languages = data?.languages ?? []
  profile.operatingHours = data?.operating_hours ?? ''
  profile.caseRatePerDeal = data?.case_rate_per_deal ?? ''
  profile.upfrontPaymentPercentage = data?.upfront_payment_percentage ?? ''
  profile.paymentWindowDays = data?.payment_window_days ?? ''
  profile.chargebackWindowDays = data?.chargeback_window_days ?? ''
}

const loadProfile = async () => {
  if (!centerId.value) return

  loading.value = true
  try {
    const { data, error } = await supabase
      .from('bpo_profiles')
      .select('*')
      .eq('center_id', centerId.value)
      .maybeSingle()

    if (error) throw error

    hydrateFromDb(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to load BPO profile'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await auth.init()
  await loadProfile()
})

async function onSubmit(event: FormSubmitEvent<ProfileSchema>) {
  if (!centerId.value) return

  saving.value = true
  try {
    const payload = {
      center_id: centerId.value,
      center_name: event.data.centerName.trim(),
      location: event.data.location?.trim() || null,
      website_or_linkedin: event.data.websiteOrLinkedIn?.trim() || null,
      contact_email: event.data.contactEmail?.trim() || null,
      contact_phone: event.data.contactPhone?.trim() || null,
      number_of_agents: event.data.numberOfAgents?.trim() || null,
      languages: event.data.languages ?? [],
      operating_hours: event.data.operatingHours?.trim() || null,
      case_rate_per_deal: event.data.caseRatePerDeal === '' ? null : (event.data.caseRatePerDeal ?? null),
      upfront_payment_percentage: event.data.upfrontPaymentPercentage === '' ? null : (event.data.upfrontPaymentPercentage ?? null),
      payment_window_days: event.data.paymentWindowDays === '' ? null : (event.data.paymentWindowDays ?? null),
      chargeback_window_days: event.data.chargebackWindowDays === '' ? null : (event.data.chargebackWindowDays ?? null)
    }

    const { error, data } = await supabase
      .from('bpo_profiles')
      .upsert(payload, { onConflict: 'center_id' })
      .select('*')
      .single()

    if (error) throw error

    hydrateFromDb(data)

    toast.add({
      title: 'Success',
      description: 'Your BPO profile has been updated.',
      icon: 'i-lucide-check',
      color: 'success'
    })

    isEditing.value = false
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to update BPO profile'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

const startEditing = () => {
  isEditing.value = true
}

const cancelEditing = async () => {
  isEditing.value = false
  await loadProfile()
}
</script>

<template>
  <UForm
    id="bpo-profile"
    :schema="profileSchema"
    :state="profile"
    @submit="onSubmit"
  >
    <div class="mx-auto w-full max-w-5xl space-y-5 pb-8">

      <!-- ═══ Page Header ════════════════════════════════════════════════ -->
      <div class="ap-fade-in ap-delay-1 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10 ring-1 ring-[var(--ap-accent)]/25">
            <UIcon name="i-lucide-building-2" class="text-lg text-[var(--ap-accent)]" />
            <span class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#1a1a1a] bg-emerald-400" />
          </div>
          <div>
            <h1 class="text-xl font-bold text-highlighted">BPO Profile</h1>
            <p class="text-[11px] text-muted">Tell us about your center so we can tailor workflows and reporting</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <UButton
            v-if="!isEditing"
            label="Edit"
            size="sm"
            color="neutral"
            variant="outline"
            :loading="loading"
            @click="startEditing"
          />
          <template v-else>
            <UButton
              label="Cancel"
              size="sm"
              color="neutral"
              variant="ghost"
              :disabled="saving"
              @click="cancelEditing"
            />
            <UButton
              form="bpo-profile"
              label="Save changes"
              size="sm"
              type="submit"
              :loading="saving"
            >
              <template #leading>
                <UIcon name="i-lucide-check" class="text-xs" />
              </template>
            </UButton>
          </template>
        </div>
      </div>

      <!-- ═══ 3-Column Card Grid ════════════════════════════════════════ -->
      <div class="ap-fade-in ap-delay-2 grid grid-cols-1 items-stretch gap-5">

        <!-- ── Card 1: Basic Identity ── -->
        <div class="relative flex flex-col overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

          <!-- Header -->
          <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
            <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
            <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
            <div class="relative flex items-center justify-between gap-3 px-5 py-3.5">
              <div class="flex items-center gap-3">
                <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
                  <UIcon name="i-lucide-building" class="text-xs text-[var(--ap-accent)]" />
                </div>
                <span class="text-[13px] font-semibold text-highlighted">Basic Identity</span>
              </div>
            </div>
          </div>

          <!-- Body -->
          <div class="relative flex-1 space-y-4 p-4 sm:p-5">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">BPO / Center Name <span class="text-red-400/80">*</span></label>
              <UInput v-model="profile.centerName" size="sm" placeholder="Acme BPO" autocomplete="organization" disabled class="w-full" />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">Location</label>
              <UInput v-model="profile.location" size="sm" placeholder="Manila, Philippines" autocomplete="off" :disabled="disabled" class="w-full" />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">Website / LinkedIn</label>
              <UInput v-model="profile.websiteOrLinkedIn" size="sm" placeholder="https://www.example.com" autocomplete="off" :disabled="disabled" class="w-full" />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">Contact Email</label>
              <UInput v-model="profile.contactEmail" size="sm" type="email" placeholder="ops@acmebpo.com" autocomplete="email" :disabled="disabled" class="w-full" />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">Contact Phone</label>
              <UInput v-model="profile.contactPhone" size="sm" placeholder="+1 (555) 123-4567" autocomplete="tel" :disabled="disabled" class="w-full" />
            </div>
          </div>
        </div>

        <!-- ── Card 2: Stats & Capacity ── -->
        <div class="relative flex flex-col overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

          <!-- Header -->
          <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
            <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
            <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
            <div class="relative flex items-center justify-between gap-3 px-5 py-3.5">
              <div class="flex items-center gap-3">
                <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
                  <UIcon name="i-lucide-bar-chart-3" class="text-xs text-[var(--ap-accent)]" />
                </div>
                <span class="text-[13px] font-semibold text-highlighted">Stats & Capacity</span>
              </div>
            </div>
          </div>

          <!-- Body -->
          <div class="relative flex-1 space-y-4 p-4 sm:p-5">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">Number of Agents</label>
              <UInput v-model="profile.numberOfAgents" size="sm" placeholder="e.g., 10, 50, 200+" autocomplete="off" :disabled="disabled" class="w-full" />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">Languages</label>
              <UInputMenu
                v-model="profile.languages"
                :items="languageOptions"
                multiple
                searchable
                creatable
                placeholder="Select or type languages"
                :disabled="disabled"
                class="w-full"
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">Operating Hours</label>
              <UInput v-model="profile.operatingHours" size="sm" placeholder="e.g., 24/7 or 9-5 EST" autocomplete="off" :disabled="disabled" class="w-full" />
            </div>
          </div>
        </div>

        <!-- ── Card 3: Pricing ── -->
        <div v-if="false" class="relative flex flex-col overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

          <!-- Header -->
          <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
            <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
            <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
            <div class="relative flex items-center justify-between gap-3 px-5 py-3.5">
              <div class="flex items-center gap-3">
                <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
                  <UIcon name="i-lucide-dollar-sign" class="text-xs text-[var(--ap-accent)]" />
                </div>
                <span class="text-[13px] font-semibold text-highlighted">Pricing</span>
              </div>
            </div>
          </div>

          <!-- Body -->
          <div class="relative flex-1 space-y-4 p-4 sm:p-5">
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">Rate Per Case</label>
              <UInput v-model.number="profile.caseRatePerDeal" size="sm" type="number" placeholder="0" autocomplete="off" :disabled="disabled" class="w-full" />
              <p class="text-[10px] text-muted">Fixed amount charged per deal</p>
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">Upfront Settlement %</label>
              <UInput v-model.number="profile.upfrontPaymentPercentage" size="sm" type="number" placeholder="0" autocomplete="off" :disabled="disabled" class="w-full" />
              <p class="text-[10px] text-muted">Percent of settlement to invoice upfront</p>
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">Payment Window (days)</label>
              <UInput v-model.number="profile.paymentWindowDays" size="sm" type="number" placeholder="0" autocomplete="off" :disabled="disabled" class="w-full" />
              <p class="text-[10px] text-muted">Days allowed to receive payment</p>
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-medium text-highlighted">Chargeback Window (days)</label>
              <UInput v-model.number="profile.chargebackWindowDays" size="sm" type="number" placeholder="0" autocomplete="off" :disabled="disabled" class="w-full" />
              <p class="text-[10px] text-muted">Days allowed to request a chargeback</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  </UForm>
</template>
