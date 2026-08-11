<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  attorneyName: string | null
}>()

const collapsed = ref(false)

const disclosureBullets = computed(() => {
  const firm = props.attorneyName?.trim() || ''
  const lawFirmReference = firm || 'the selected law firm'

  return [
    firm
      ? `Before we move forward, I want to confirm that the law firm we are partnering you with is ${firm}.`
      : 'Before we move forward, I want to confirm the law firm we are partnering you with for this matter.',
    'Accident Claims Helpline is not the law firm, does not own or control the law firm, and is acting only as an independent intake and referral partner.',
    `With your permission, we will share the information you provided with ${lawFirmReference} so they can review your matter, contact you directly, and discuss representation and next steps with you.`,
    `Do you agree to be connected with ${lawFirmReference}, and do you authorize Accident Claims Helpline and ${lawFirmReference} to communicate with each other as needed about your case, including follow-up and case-related correspondence?`
  ]
})
</script>

<template>
  <section class="ap-fade-in relative overflow-hidden rounded-xl border border-warning/30 bg-warning/[0.04] shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-warning/[0.06]">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-warning/[0.06]"
      :aria-expanded="!collapsed"
      @click="collapsed = !collapsed"
    >
      <div class="flex items-center gap-2.5">
        <UIcon name="i-lucide-triangle-alert" class="size-4 text-warning" />
        <span class="text-[13px] font-semibold text-highlighted">Partner Law Firm Disclosure</span>
        <span class="hidden text-[11px] text-warning sm:inline">Verbal agreement required</span>
      </div>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-4 shrink-0 text-warning transition-transform duration-300"
        :class="collapsed ? '' : 'rotate-180'"
      />
    </button>

    <div v-show="!collapsed" class="space-y-2.5 border-t border-warning/20 px-5 pb-4 pt-3">
      <div class="flex items-start gap-2 rounded-lg bg-warning/10 px-3.5 py-2">
        <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-3 shrink-0 text-warning" />
        <p class="text-[11px] leading-4 text-highlighted">
          Use this after a law firm has been selected above and before sending the retainer agreement.
        </p>
      </div>

      <div class="rounded-lg border border-warning/25 bg-white px-3.5 py-2.5 text-[13px] leading-6 text-highlighted dark:bg-[#1a1a1a]/80">
        <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warning">
          Read to Caller
        </div>
        <ul class="space-y-2">
          <li v-for="line in disclosureBullets" :key="line" class="flex gap-2">
            <span class="mt-[0.7rem] h-1 w-1 shrink-0 rounded-full bg-warning" />
            <span>{{ line }}</span>
          </li>
        </ul>
      </div>

      <div class="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-2">
        <UIcon name="i-lucide-circle-check" class="size-3.5 shrink-0 text-warning" />
        <p class="text-[13px] font-semibold text-highlighted">
          Get a clear verbal YES to the selected law firm and to case-related communication between our team and that firm.
        </p>
      </div>
    </div>
  </section>
</template>
