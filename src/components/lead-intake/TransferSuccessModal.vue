<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { formatUsPhone } from '../../lib/dnc-lookup'

const props = defineProps<{
  open: boolean
  leadPhoneNumber: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'refresh'): void
}>()

const toast = useToast()
const copied = ref(false)
const copying = ref(false)
const refreshDelaySeconds = 5
const refreshCountdown = ref(refreshDelaySeconds)
const autoRefreshStarted = ref(false)
let refreshTimer: number | null = null

const displayPhoneNumber = computed(() => {
  const formatted = formatUsPhone(props.leadPhoneNumber)
  return formatted || props.leadPhoneNumber
})

const clearRefreshTimer = () => {
  if (!refreshTimer) return

  window.clearInterval(refreshTimer)
  refreshTimer = null
}

const refreshLeadIntake = () => {
  clearRefreshTimer()
  emit('refresh')
}

const startRefreshCountdown = () => {
  clearRefreshTimer()
  refreshCountdown.value = refreshDelaySeconds
  autoRefreshStarted.value = false

  refreshTimer = window.setInterval(() => {
    refreshCountdown.value -= 1

    if (refreshCountdown.value > 0 || autoRefreshStarted.value) return

    autoRefreshStarted.value = true
    refreshLeadIntake()
  }, 1000)
}

watch(() => props.open, (isOpen) => {
  if (!isOpen) return

  copied.value = false
  startRefreshCountdown()
})

onBeforeUnmount(() => {
  clearRefreshTimer()
})

const handleUpdateOpen = (value: boolean) => {
  emit('update:open', value)
}

const copyLeadPhoneNumber = async () => {
  if (!displayPhoneNumber.value || copying.value) return

  copying.value = true

  try {
    await navigator.clipboard.writeText(displayPhoneNumber.value)
    copied.value = true

    toast.add({
      title: 'Copied',
      description: `Lead number ${displayPhoneNumber.value} copied to clipboard.`,
      icon: 'i-lucide-copy-check',
      color: 'success'
    })
  } catch {
    toast.add({
      title: 'Copy failed',
      description: 'Unable to copy the lead number. Please copy it manually.',
      icon: 'i-lucide-alert-circle',
      color: 'error'
    })
  } finally {
    copying.value = false
  }
}
</script>

<template>
  <UModal
    :open="props.open"
    title="Transfer Successful"
    description="The lead was submitted successfully."
    :dismissible="false"
    @update:open="handleUpdateOpen"
  >
    <template #body>
      <div class="space-y-4">
        <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-800 dark:bg-emerald-950/50">
          <div class="flex items-start gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200">
              <UIcon name="i-lucide-badge-check" class="size-5" />
            </div>

            <div class="space-y-1">
              <p class="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                The transfer has been saved.
              </p>
              <p class="text-sm leading-6 text-emerald-900/85 dark:text-emerald-100/85">
                Copy the lead number below. Reloading in {{ refreshCountdown }} seconds.
              </p>
            </div>
          </div>
        </div>

        <div class="flex justify-center">
          <button
            type="button"
            :disabled="!displayPhoneNumber || copying"
            class="flex items-center justify-center gap-2 rounded-xl px-4 py-4 text-center transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-70"
            @click="copyLeadPhoneNumber"
          >
            <span class="text-sm font-semibold text-muted">
              Lead Number:
            </span>
            <span class="font-mono text-lg font-semibold tracking-[0.08em] text-highlighted">
              {{ displayPhoneNumber }}
            </span>
            <span
              v-if="copied"
              class="text-xs font-medium uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-300"
            >
              Copied
            </span>
            <UIcon
              name="i-lucide-copy"
              class="size-4 text-muted"
            />
          </button>
        </div>

        <div class="flex justify-center">
          <UButton
            color="primary"
            icon="i-lucide-refresh-cw"
            class="justify-center"
            @click="refreshLeadIntake"
          >
            Refresh now
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
