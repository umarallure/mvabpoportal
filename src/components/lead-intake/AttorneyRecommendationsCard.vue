<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { supabase } from '../../lib/supabase'
import type { AttorneyOption, RetainerDocuments } from './retainer-types'

const props = defineProps<{
  modelValue: string
  customerState: string
  accidentDate: string
  dateOfBirth: string
  documents: RetainerDocuments
  locked: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:selectedAttorney': [value: AttorneyOption | null]
}>()

const options = ref<AttorneyOption[]>([])
const loadingOptions = ref(false)
const optionsError = ref('')
const collapsed = ref(false)
let optionsTimer: ReturnType<typeof setTimeout> | null = null
// Monotonic token: a response only applies if no newer request started and the
// card was not locked mid-flight, so stale fetches can never overwrite state.
let requestSeq = 0

const qualifiedOptions = computed(() => options.value.filter(option => option.selectable))
const nearMatches = computed(() => options.value.filter(option => !option.selectable))
const selectedAttorney = computed(() => options.value.find(option => option.id === props.modelValue) ?? null)
const eligibilityReady = computed(() => Boolean(props.customerState && props.accidentDate && props.dateOfBirth))

const selectAttorney = (id: string) => {
  if (props.locked) return
  emit('update:modelValue', id)
}

watch(selectedAttorney, (attorney) => {
  emit('update:selectedAttorney', attorney)
})

const loadOptions = async () => {
  if (props.locked) return
  const seq = ++requestSeq
  const previousSelection = props.modelValue
  emit('update:modelValue', '')
  options.value = []
  optionsError.value = ''
  if (!eligibilityReady.value) return

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
    if (seq !== requestSeq || props.locked) return
    if (error) throw error
    options.value = Array.isArray(data?.attorneys) ? data.attorneys : []
    const retained = qualifiedOptions.value.find(option => option.id === previousSelection)
    emit('update:modelValue', retained?.id ?? qualifiedOptions.value[0]?.id ?? '')
  } catch (error) {
    if (seq !== requestSeq) return
    optionsError.value = error instanceof Error ? error.message : 'Unable to load eligible attorneys.'
  } finally {
    if (seq === requestSeq) loadingOptions.value = false
  }
}

const scheduleLoadOptions = () => {
  if (optionsTimer) clearTimeout(optionsTimer)
  optionsTimer = setTimeout(loadOptions, 350)
}

watch(() => JSON.stringify([props.customerState, props.accidentDate, props.dateOfBirth, props.documents]), scheduleLoadOptions, { immediate: true })

watch(() => props.locked, (locked, wasLocked) => {
  if (locked) {
    if (optionsTimer) clearTimeout(optionsTimer)
    optionsTimer = null
    requestSeq += 1
    loadingOptions.value = false
  } else if (wasLocked) {
    scheduleLoadOptions()
  }
})

onBeforeUnmount(() => {
  if (optionsTimer) clearTimeout(optionsTimer)
})
</script>

<template>
  <section class="ap-fade-in ap-delay-5 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
    <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

    <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
      <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
      <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
      <button
        type="button"
        class="relative flex w-full flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-left"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        <div class="flex items-center gap-3">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
            <UIcon name="i-lucide-scale" class="text-xs text-[var(--ap-accent)]" />
          </div>
          <div>
            <h2 class="text-[13px] font-semibold text-highlighted">
              Attorney Recommendations
            </h2>
            <p class="mt-0.5 text-[11px] text-muted">
              Ranked automatically for the customer's state, accident date, documents, and compatible retainers.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2.5">
          <span v-if="qualifiedOptions.length" class="text-[11px] tabular-nums text-muted">
            {{ qualifiedOptions.length }} available
          </span>
          <UIcon
            name="i-lucide-chevron-down"
            class="size-4 text-muted transition-transform duration-300"
            :class="collapsed ? '' : 'rotate-180'"
          />
        </div>
      </button>
    </div>

    <div v-show="!collapsed" class="relative space-y-3 p-5">
      <div v-if="locked" class="flex items-start gap-2 rounded-xl border border-[var(--ap-accent)]/15 bg-[var(--ap-accent)]/[0.04] px-4 py-3 text-xs text-muted">
        <UIcon name="i-lucide-lock" class="mt-0.5 size-4 shrink-0 text-[var(--ap-accent)]" />
        The attorney selection is locked while a retainer envelope is active. Declined or voided envelopes unlock it.
      </div>

      <div v-if="!locked && !eligibilityReady" class="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/5 px-4 py-3 text-xs text-warning">
        <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />
        Enter customer state, DOB, and accident date to load attorney recommendations.
      </div>
      <div v-else-if="!locked && loadingOptions" class="flex items-center gap-2 rounded-xl border border-[var(--ap-accent)]/15 px-4 py-5 text-xs text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-[var(--ap-accent)]" />
        Checking attorney and template eligibility…
      </div>
      <div v-else-if="!locked && optionsError" class="flex items-start gap-2 rounded-xl border border-error/25 bg-error/5 px-4 py-3 text-xs text-error">
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
            :class="[
              modelValue === attorney.id
                ? 'border-[var(--ap-accent)]/60 bg-[var(--ap-accent)]/[0.08] shadow-sm ring-1 ring-[var(--ap-accent)]/20'
                : 'border-[var(--ap-accent)]/15 bg-white/60 hover:border-[var(--ap-accent)]/35 hover:bg-[var(--ap-accent)]/[0.03] dark:bg-white/[0.03]',
              locked ? 'cursor-not-allowed opacity-60' : ''
            ]"
            :aria-pressed="modelValue === attorney.id"
            :disabled="locked"
            @click="selectAttorney(attorney.id)"
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
                :name="modelValue === attorney.id ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                class="size-4"
                :class="modelValue === attorney.id ? 'text-[var(--ap-accent)]' : 'text-muted/40'"
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
        <div v-else-if="!locked" class="rounded-xl border border-dashed border-[var(--ap-accent)]/25 px-4 py-5 text-center">
          <UIcon name="i-lucide-scale" class="mx-auto size-5 text-muted/60" />
          <p class="mt-2 text-xs font-medium text-highlighted">
            No eligible attorneys are available
          </p>
          <p class="mt-1 text-[11px] text-muted">
            Check the customer details and supporting-document answers, then try again.
          </p>
        </div>

        <div v-if="nearMatches.length && !locked" class="rounded-xl border border-warning/25 bg-warning/[0.04] p-4">
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
  </section>
</template>
