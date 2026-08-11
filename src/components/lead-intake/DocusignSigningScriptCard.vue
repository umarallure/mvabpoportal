<script setup lang="ts">
import { ref } from 'vue'

type GuideImage = { src: string, alt: string }
type GuideStep = { step: string, title: string, body: string, images: GuideImage[] }

const collapsed = ref(false)
const lightboxImage = ref<GuideImage | null>(null)

const guideSteps: GuideStep[] = [
  {
    step: 'Step 1',
    title: 'Open the DocuSign email',
    body: 'Ask the lead to check their email. They should have received a DocuSign email from us. If it is not there, have them check their spam folder.',
    images: [
      { src: '/assets/docusign-guide/step2.webp', alt: 'DocuSign email with Review Document button highlighted' }
    ]
  },
  {
    step: 'Step 2',
    title: 'Review and continue',
    body: 'Have them check the electronic records consent box, then click Continue to enter the agreement.',
    images: [
      { src: '/assets/docusign-guide/step3.webp', alt: 'DocuSign review and continue screen with checkbox and Continue button highlighted' }
    ]
  },
  {
    step: 'Step 3',
    title: 'Start the signing flow',
    body: 'Tell them to click Start at the top so DocuSign jumps directly to each required field.',
    images: [
      { src: '/assets/docusign-guide/step4.webp', alt: 'DocuSign page with Start button highlighted' }
    ]
  },
  {
    step: 'Step 4',
    title: 'Complete the initials',
    body: 'When the Initial tag appears, have them click it. If DocuSign opens a confirmation box, review the initials preview and choose Adopt and Initial.',
    images: [
      { src: '/assets/docusign-guide/step6.webp', alt: 'DocuSign Initial tag highlighted' },
      { src: '/assets/docusign-guide/step7.webp', alt: 'DocuSign adopt your initials screen with Adopt and Initial button highlighted' }
    ]
  },
  {
    step: 'Step 5',
    title: 'Sign and move to the next field',
    body: 'When the Sign tag appears, have them click it to place the signature. If another required field remains, use Next to move forward.',
    images: [
      { src: '/assets/docusign-guide/step5.webp', alt: 'DocuSign Sign tag highlighted' },
      { src: '/assets/docusign-guide/step8.webp', alt: 'DocuSign Next button highlighted' }
    ]
  },
  {
    step: 'Step 6',
    title: 'Finish the agreement',
    body: 'Once every required field is complete, have them click Finish. If Finish does not work yet, there is still a required field left. On some screens Finish appears at the top right.',
    images: [
      { src: '/assets/docusign-guide/step9.webp', alt: 'DocuSign Finish button at the bottom of the page highlighted' },
      { src: '/assets/docusign-guide/step10.webp', alt: 'DocuSign Finish button in the top bar highlighted' }
    ]
  },
  {
    step: 'Step 7',
    title: 'Confirm completion and save a copy',
    body: 'Once the Completed screen appears, let them know the agreement has been submitted successfully and they can save a copy for their records.',
    images: [
      { src: '/assets/docusign-guide/step11.webp', alt: 'DocuSign completed screen with Save a Copy option highlighted' }
    ]
  }
]
</script>

<template>
  <section class="ap-fade-in relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
    <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

    <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
      <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
      <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
      <button
        type="button"
        class="relative w-full px-5 py-3.5 text-left"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
              <UIcon name="i-lucide-file-text" class="text-xs text-[var(--ap-accent)]" />
            </div>
            <div>
              <h2 class="text-[13px] font-semibold text-highlighted">
                DocuSign Signing Script
              </h2>
              <p class="mt-0.5 text-[11px] text-muted">
                Match what the signer sees to the screenshots below and guide them one step at a time. Click any image to enlarge it.
              </p>
            </div>
          </div>
          <UIcon
            name="i-lucide-chevron-down"
            class="size-4 shrink-0 text-muted transition-transform duration-300"
            :class="collapsed ? '' : 'rotate-180'"
          />
        </div>
      </button>
    </div>

    <div v-show="!collapsed" class="relative space-y-3 p-5">
      <div
        v-for="step in guideSteps"
        :key="step.step"
        class="group/step space-y-3 rounded-xl border border-[var(--ap-accent)]/15 bg-white/60 px-4 py-3 shadow-sm transition-all duration-200 hover:border-[var(--ap-accent)]/35 dark:bg-white/[0.03]"
      >
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <span
              data-testid="signing-script-step"
              class="rounded-full border border-[var(--ap-accent)]/40 bg-[var(--ap-accent)]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ap-accent)]"
            >
              {{ step.step }}
            </span>
            <div class="text-sm font-semibold text-highlighted">
              {{ step.title }}
            </div>
          </div>
          <p class="text-sm leading-6 text-muted">
            {{ step.body }}
          </p>
        </div>

        <div class="flex flex-wrap items-start gap-2.5">
          <button
            v-for="image in step.images"
            :key="image.src"
            type="button"
            class="w-[15rem] max-w-full min-w-0 overflow-hidden rounded-lg border border-[var(--ap-accent)]/20 bg-white shadow-sm transition-all duration-200 hover:scale-[1.01] hover:border-[var(--ap-accent)]/40"
            :aria-label="`Preview ${step.title} screenshot`"
            @click="lightboxImage = image"
          >
            <img
              :src="image.src"
              :alt="image.alt"
              loading="lazy"
              class="h-36 w-full bg-white object-contain"
            >
          </button>
        </div>
      </div>
    </div>

    <UModal
      :open="Boolean(lightboxImage)"
      @update:open="(value: boolean) => { if (!value) lightboxImage = null }"
    >
      <template #content>
        <div v-if="lightboxImage" class="space-y-2 p-3">
          <img
            :src="lightboxImage.src"
            :alt="lightboxImage.alt"
            class="max-h-[28rem] w-full rounded-md border border-[var(--ap-accent)]/20 bg-white object-contain"
          >
          <p class="text-xs leading-5 text-muted">
            {{ lightboxImage.alt }}
          </p>
        </div>
      </template>
    </UModal>
  </section>
</template>
