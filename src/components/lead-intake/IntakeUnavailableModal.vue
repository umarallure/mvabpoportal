<script setup lang="ts">
const props = defineProps<{
  open: boolean
}>()
</script>

<template>
  <!--
    Scoped to the intake section rather than a UModal: the rest of the portal
    (sidebar, other sections) must stay browsable while intake is paused.
    Requires a `relative` positioned parent wrapping the blurred content.
  -->
  <div
    v-if="props.open"
    role="status"
    class="absolute inset-0 z-20 flex items-center justify-center px-4 py-8"
  >
    <div class="w-full max-w-lg overflow-hidden rounded-xl border border-amber-500/25 bg-white shadow-2xl dark:bg-[#1a1a1a]">
      <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
        <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-amber-500/[0.08] to-transparent" />
        <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-amber-500 via-amber-500/60 to-transparent" />
        <div class="relative flex items-center gap-3 px-5 py-3.5">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-amber-500/45 bg-amber-500/10">
            <UIcon name="i-lucide-pause" class="text-xs text-amber-500" />
          </div>
          <span class="text-[13px] font-semibold text-highlighted">Lead Intake Temporarily Unavailable</span>
        </div>
      </div>

      <div class="space-y-4 p-5">
        <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-700/60 dark:bg-amber-950/40">
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-alert-triangle" class="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-300" />
            <div class="space-y-1">
              <p class="text-sm font-semibold text-amber-950 dark:text-amber-100">
                Lead intake is paused for all publishers.
              </p>
              <p class="text-sm leading-6 text-amber-900/85 dark:text-amber-100/85">
                We are not taking cases right now, so transfers cannot be screened or submitted through this form.
              </p>
            </div>
          </div>
        </div>

        <p class="text-sm leading-6 text-muted">
          No action is needed from your team. Your account and existing transfers are unaffected — we will let you know as soon as intake reopens.
        </p>
      </div>
    </div>
  </div>
</template>
