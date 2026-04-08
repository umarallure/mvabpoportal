<script setup lang="ts">
import { computed } from 'vue'
import { formatUsPhone } from '../../lib/dnc-lookup'

const props = defineProps<{
  open: boolean
  phoneNumber?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'acknowledge'): void
}>()

const displayPhoneNumber = computed(() => {
  const formatted = formatUsPhone(props.phoneNumber)
  const fallback = props.phoneNumber?.trim()

  return formatted || fallback || 'on file'
})

const handleUpdateOpen = (value: boolean) => {
  emit('update:open', value)
}
</script>

<template>
  <UModal
    :open="props.open"
    title="TCPA Litigator Detected"
    description="Continuing this call is not permitted."
    :dismissible="false"
    @update:open="handleUpdateOpen"
  >
    <template #body>
      <div class="space-y-4">
        <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-4 dark:border-red-800 dark:bg-red-950/60">
          <div class="flex items-start gap-3">
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/60 dark:text-red-300">
              <UIcon name="i-lucide-alert-triangle" class="size-5" />
            </div>

            <div class="space-y-3">
              <p class="text-sm font-medium leading-6 text-red-950 dark:text-red-100">
                The phone number {{ displayPhoneNumber }} has been identified as a TCPA litigator.
              </p>

              <p class="text-sm leading-6 text-red-900/90 dark:text-red-100/90">
                Any further contact with this number could expose the company to significant legal liability. Please end the call immediately if still connected.
              </p>
            </div>
          </div>
        </div>

        <div class="flex justify-end">
          <UButton
            color="error"
            @click="emit('acknowledge')"
          >
            Acknowledged - Refresh
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
