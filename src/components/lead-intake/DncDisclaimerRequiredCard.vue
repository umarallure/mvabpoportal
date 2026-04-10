<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  phoneNumber?: string
}>()

const isExpanded = ref(true)

const displayPhoneNumber = computed(() => {
  const value = props.phoneNumber?.trim()
  return value ? value : ''
})
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-amber-200/60 bg-amber-50/20 shadow-sm backdrop-blur-sm dark:border-amber-500/25 dark:bg-amber-500/10">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-amber-50/40 dark:hover:bg-amber-500/10"
      :aria-expanded="isExpanded"
      @click="isExpanded = !isExpanded"
    >
      <div class="flex min-w-0 items-center gap-3">
        <UIcon name="i-lucide-alert-triangle" class="size-4 shrink-0 text-amber-500" />
        <div class="min-w-0">
          <p class="text-[13px] font-semibold text-amber-900 dark:text-amber-200">
            Disclaimer Required
          </p>
          <p class="hidden text-[11px] leading-tight text-amber-700/80 dark:text-amber-300/80 sm:block">
            Verbal consent needed
          </p>
        </div>
      </div>

      <UIcon
        name="i-lucide-chevron-down"
        class="size-4 shrink-0 text-amber-600 transition-transform duration-200 dark:text-amber-300"
        :class="isExpanded ? 'rotate-180' : ''"
      />
    </button>

    <div
      class="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
      :class="isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
    >
      <div class="overflow-hidden">
        <div class="space-y-2.5 border-t border-amber-200/70 px-5 pb-4 pt-3 dark:border-amber-500/20">
          <div class="rounded-md border border-amber-200/70 bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-700 dark:border-amber-500/25 dark:bg-[#18181b] dark:text-slate-200">
            Is your phone number
            <span class="inline-flex rounded-full bg-amber-100 px-2 py-0.5 align-baseline text-[12px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
              {{ displayPhoneNumber }}
            </span>
            on the Federal, National or State Do Not Call List?
          </div>

          <div class="flex items-start gap-2 rounded-md bg-amber-100/40 px-3.5 py-2 text-[11px] leading-tight text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
            <UIcon name="i-lucide-alert-triangle" class="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-300" />
            <p>
              If a customer says <strong class="font-semibold">no</strong> and we see it's on the DNC list, we still have to take verbal consent.
            </p>
          </div>

          <div class="rounded-md border border-amber-200/70 bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-700 dark:border-amber-500/25 dark:bg-[#18181b] dark:text-slate-200">
            Sir/Ma'am, even if your phone number is on the Federal National or State Do Not Call List, do we still have your permission to call you and submit your application to Accident Claims Helpline via your phone number
            <span class="inline-flex rounded-full bg-amber-100 px-2 py-0.5 align-baseline text-[12px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
              {{ displayPhoneNumber }}
            </span><span>? And do we have your permission to call you on the same phone number in the future if needed?</span>
          </div>

          <div class="flex items-center gap-2 rounded-md border border-amber-300/80 bg-amber-50/70 px-3.5 py-2 text-[13px] font-semibold text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100">
            <UIcon name="i-lucide-check-circle" class="size-4 shrink-0 text-amber-600 dark:text-amber-300" />
            <p>
              Make sure you get a clear YES on it.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
