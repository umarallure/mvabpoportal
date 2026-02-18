<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

type ActiveView = 'videos' | 'resources'

interface GuideStep {
  id: number
  title: string
  description: string
  icon: string
  vimeoId: string
  duration: string
  resourceLabel: string
  resourceUrl: string
}

const auth = useAuth()
const router = useRouter()

const activeView = ref<ActiveView>('videos')
const authReady = ref(false)

const isAllowed = computed(() => {
  const role = auth.state.value.profile?.role
  return role === 'admin' || role === 'super_admin'
})

onMounted(async () => {
  await auth.init()
  authReady.value = true
  if (!isAllowed.value) {
    await router.replace('/dashboard')
  }
})

const steps: GuideStep[] = [
  {
    id: 1,
    title: 'Dashboard Overview',
    description: 'Get familiar with your command center — stats, retainers, invoices, and quick actions.',
    icon: 'i-lucide-house',
    vimeoId: '1163430559',
    duration: '00:08',
    resourceLabel: 'Dashboard Guide',
    resourceUrl: '/resources/Unlimited-Insurance-Agent-Onboarding-and-Interview-Flow.pdf'
  },
  {
    id: 2,
    title: 'Transfers',
    description: 'Manage lead transfers across pipeline stages and track progress in real time.',
    icon: 'i-lucide-arrow-right-left',
    vimeoId: '1163430559',
    duration: '00:08',
    resourceLabel: 'Transfers User Manual',
    resourceUrl: '/resources/Unlimited-Insurance-Agent-Onboarding-and-Interview-Flow.pdf'
  },
  {
    id: 3,
    title: 'Retainers',
    description: 'Track signed retainers, view statuses, and navigate to linked case details.',
    icon: 'i-lucide-briefcase',
    vimeoId: '1163430559',
    duration: '00:08',
    resourceLabel: 'Retainers User Manual',
    resourceUrl: '/resources/Unlimited-Insurance-Agent-Onboarding-and-Interview-Flow.pdf'
  },
  {
    id: 4,
    title: 'Submission Portal',
    description: 'Monitor your submission pipeline from intake through case completion using Kanban stages.',
    icon: 'i-lucide-layout-dashboard',
    vimeoId: '1163430559',
    duration: '00:08',
    resourceLabel: 'Submission Portal Guide',
    resourceUrl: '/resources/Unlimited-Insurance-Agent-Onboarding-and-Interview-Flow.pdf'
  },
  {
    id: 5,
    title: 'Sales Map',
    description: 'Visualize your leads and coverage on the interactive US map with state-level insights.',
    icon: 'i-lucide-map',
    vimeoId: '1163430559',
    duration: '00:08',
    resourceLabel: 'Sales Map User Manual',
    resourceUrl: '/resources/Unlimited-Insurance-Agent-Onboarding-and-Interview-Flow.pdf'
  },
  {
    id: 6,
    title: 'Settings & Profile',
    description: 'Configure your BPO profile, team members, sales map admin, and export sheets.',
    icon: 'i-lucide-settings',
    vimeoId: '1163430559',
    duration: '00:08',
    resourceLabel: 'Settings & Profile Guide',
    resourceUrl: '/resources/Unlimited-Insurance-Agent-Onboarding-and-Interview-Flow.pdf'
  }
]

const videoStepId = ref(1)
const resourceStepId = ref(1)
const activeStepId = computed(() =>
  activeView.value === 'videos' ? videoStepId.value : resourceStepId.value
)
const activeStep = computed(() => steps.find(s => s.id === activeStepId.value)!)

const hasVideo = (step: GuideStep) => step.vimeoId !== ''
const hasResource = (step: GuideStep) => step.resourceUrl !== ''

const setStepId = (id: number) => {
  if (activeView.value === 'videos') videoStepId.value = id
  else resourceStepId.value = id
}

const selectStep = (id: number) => { setStepId(id) }

const goToNext = () => {
  const idx = steps.findIndex(s => s.id === activeStepId.value)
  if (idx < steps.length - 1) setStepId(steps[idx + 1].id)
}

const goToPrev = () => {
  const idx = steps.findIndex(s => s.id === activeStepId.value)
  if (idx > 0) setStepId(steps[idx - 1].id)
}

const isFirst = computed(() => activeStepId.value === steps[0].id)
const isLast = computed(() => activeStepId.value === steps[steps.length - 1].id)
</script>

<template>
  <UDashboardPanel v-if="authReady && isAllowed" id="product-guide" class="!overflow-hidden">
    <template #header>
      <UDashboardNavbar title="Product Guide">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted">Step {{ activeStepId }} of {{ steps.length }}</span>
            <div v-if="activeView === 'videos'" class="flex items-center gap-1">
              <button
                :disabled="isFirst"
                class="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-default bg-elevated text-muted transition-all hover:border-[var(--ap-accent)]/30 hover:text-[var(--ap-accent)] disabled:opacity-30 disabled:pointer-events-none"
                @click="goToPrev"
              >
                <UIcon name="i-lucide-chevron-left" class="text-sm" />
              </button>
              <button
                :disabled="isLast"
                class="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-default bg-elevated text-muted transition-all hover:border-[var(--ap-accent)]/30 hover:text-[var(--ap-accent)] disabled:opacity-30 disabled:pointer-events-none"
                @click="goToNext"
              >
                <UIcon name="i-lucide-chevron-right" class="text-sm" />
              </button>
            </div>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full gap-5">
        <!-- Left: Step List -->
        <div class="w-80 shrink-0 flex flex-col gap-4">
          <!-- Header Card -->
          <div class="rounded-2xl border border-default bg-elevated p-4">
            <!-- Row 1: Icon + Title -->
            <div class="flex items-center gap-3 mb-3">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
                <UIcon
                  :name="activeView === 'videos' ? 'i-lucide-play-circle' : 'i-lucide-library'"
                  class="text-base text-[var(--ap-accent)]"
                />
              </div>
              <div class="min-w-0">
                <h2 class="text-sm font-semibold text-highlighted truncate">
                  Portal Walkthrough
                </h2>
                <p class="text-[11px] text-muted">
                  {{ steps.length }} {{ activeView === 'videos' ? 'video guides' : 'documents' }}
                </p>
              </div>
            </div>

            <!-- Row 2: View Toggle (full-width pill) -->
            <div class="flex items-center rounded-lg border border-default overflow-hidden mb-3">
              <button
                class="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-all"
                :class="activeView === 'videos' ? 'bg-[var(--ap-accent)] text-white' : 'text-muted hover:bg-[var(--ap-panel-light)]'"
                @click="activeView = 'videos'"
              >
                <UIcon name="i-lucide-play" class="text-xs" />
                Videos
              </button>
              <button
                class="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-all"
                :class="activeView === 'resources' ? 'bg-[var(--ap-accent)] text-white' : 'text-muted hover:bg-[var(--ap-panel-light)]'"
                @click="activeView = 'resources'"
              >
                <UIcon name="i-lucide-file-text" class="text-xs" />
                Resources
              </button>
            </div>

            <!-- Row 3: Progress bar -->
            <div class="flex items-center gap-2">
              <div class="flex-1 h-1.5 rounded-full bg-[var(--ap-border)] overflow-hidden">
                <div
                  class="h-full rounded-full bg-[var(--ap-accent)] transition-all duration-300"
                  :style="{ width: `${(activeStepId / steps.length) * 100}%` }"
                />
              </div>
              <span class="text-[10px] font-medium text-muted tabular-nums">{{ activeStepId }}/{{ steps.length }}</span>
            </div>
          </div>

          <!-- Steps List -->
          <div class="flex-1 overflow-y-auto rounded-2xl border border-default bg-elevated">
            <div class="p-2 space-y-1">
              <button
                v-for="step in steps"
                :key="step.id"
                class="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-all duration-200"
                :class="[
                  activeStepId === step.id
                    ? 'bg-[var(--ap-accent)]/10 border border-[var(--ap-accent)]/20'
                    : 'border border-transparent hover:bg-[var(--ap-panel-light)]'
                ]"
                @click="selectStep(step.id)"
              >
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors"
                  :class="[
                    activeStepId === step.id
                      ? 'bg-[var(--ap-accent)] text-white'
                      : 'bg-[var(--ap-border)] text-muted'
                  ]"
                >
                  {{ step.id }}
                </div>
                <div class="min-w-0 flex-1">
                  <p
                    class="text-sm font-medium truncate"
                    :class="activeStepId === step.id ? 'text-highlighted' : 'text-muted'"
                  >
                    {{ step.title }}
                  </p>
                  <p class="text-[11px] text-muted/60 truncate mt-0.5">
                    {{ step.description }}
                  </p>
                </div>
                <div class="shrink-0 flex items-center gap-1.5">
                  <template v-if="activeView === 'videos'">
                    <UIcon
                      v-if="hasVideo(step)"
                      name="i-lucide-circle-check"
                      class="text-sm text-emerald-400"
                    />
                    <UIcon v-else name="i-lucide-clock" class="text-xs text-muted/40" />
                    <span class="text-[10px] text-muted tabular-nums">{{ step.duration }}</span>
                  </template>
                  <template v-else>
                    <UIcon
                      v-if="hasResource(step)"
                      name="i-lucide-circle-check"
                      class="text-sm text-emerald-400"
                    />
                    <UIcon v-else name="i-lucide-clock" class="text-xs text-muted/40" />
                    <UIcon name="i-lucide-file-text" class="text-xs text-muted/50" />
                  </template>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- Right: Videos View -->
        <div v-if="activeView === 'videos'" class="flex-1 flex flex-col gap-4 min-w-0 overflow-y-auto">
          <!-- Video Card -->
          <div class="rounded-2xl border border-default bg-elevated overflow-hidden">
            <div class="flex items-center justify-between border-b border-default px-5 py-3">
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ap-accent)] text-white text-xs font-bold">
                  {{ activeStep.id }}
                </div>
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">
                    {{ activeStep.title }}
                  </h3>
                  <p class="text-[11px] text-muted">
                    {{ activeStep.description }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UIcon :name="activeStep.icon" class="text-base text-[var(--ap-accent)]" />
              </div>
            </div>

            <div class="relative aspect-video bg-black/20">
              <iframe
                v-if="hasVideo(activeStep)"
                :src="`https://player.vimeo.com/video/${activeStep.vimeoId}?badge=0&autopause=0&player_id=0&app_id=58479&byline=0&title=0&portrait=0`"
                class="absolute inset-0 h-full w-full"
                frameborder="0"
                allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
                allowfullscreen
              />
              <div v-else class="absolute inset-0 flex flex-col items-center justify-center">
                <div class="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--ap-accent)]/10 mb-5">
                  <UIcon name="i-lucide-video" class="text-4xl text-[var(--ap-accent)]/40" />
                </div>
                <h4 class="text-base font-semibold text-highlighted mb-1">
                  Video Coming Soon
                </h4>
                <p class="text-sm text-muted max-w-sm text-center">
                  The walkthrough video for <span class="text-[var(--ap-accent)]">{{ activeStep.title }}</span> is being produced and will be available here shortly.
                </p>
                <div class="mt-4 flex items-center gap-2 rounded-lg border border-default bg-elevated px-3 py-2">
                  <UIcon name="i-lucide-info" class="text-xs text-muted" />
                  <span class="text-[11px] text-muted">Vimeo video ID will be configured by admin</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Navigation Footer -->
          <div class="rounded-2xl border border-default bg-elevated px-5 py-3">
            <div class="flex items-center justify-between">
              <button
                :disabled="isFirst"
                class="inline-flex items-center gap-2 rounded-lg border border-default bg-elevated px-4 py-2 text-xs font-medium text-muted transition-all hover:border-[var(--ap-accent)]/30 hover:text-[var(--ap-accent)] disabled:opacity-30 disabled:pointer-events-none"
                @click="goToPrev"
              >
                <UIcon name="i-lucide-arrow-left" class="text-sm" />
                Previous
              </button>

              <div class="flex items-center gap-1.5">
                <button
                  v-for="step in steps"
                  :key="step.id"
                  class="h-2 rounded-full transition-all duration-300"
                  :class="[
                    activeStepId === step.id
                      ? 'w-6 bg-[var(--ap-accent)]'
                      : 'w-2 bg-[var(--ap-border)] hover:bg-[var(--ap-border-strong)]'
                  ]"
                  @click="selectStep(step.id)"
                />
              </div>

              <button
                :disabled="isLast"
                class="inline-flex items-center gap-2 rounded-lg bg-[var(--ap-accent)] px-4 py-2 text-xs font-medium text-white transition-all hover:bg-[var(--ap-accent)]/90 disabled:opacity-30 disabled:pointer-events-none"
                @click="goToNext"
              >
                Next Step
                <UIcon name="i-lucide-arrow-right" class="text-sm" />
              </button>
            </div>
          </div>
        </div>

        <!-- Right: Resources View -->
        <div v-else class="flex-1 flex flex-col gap-4 min-w-0 overflow-y-auto">
          <!-- Resource Card -->
          <div class="rounded-2xl border border-default bg-elevated overflow-hidden">
            <!-- Card Header -->
            <div class="flex items-center justify-between border-b border-default px-5 py-3">
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ap-accent)] text-white text-xs font-bold">
                  {{ activeStep.id }}
                </div>
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">
                    {{ activeStep.title }}
                  </h3>
                  <p class="text-[11px] text-muted">
                    {{ activeStep.description }}
                  </p>
                </div>
              </div>
              <UIcon :name="activeStep.icon" class="text-base text-[var(--ap-accent)]" />
            </div>

            <!-- Document Body: inline PDF viewer -->
            <template v-if="hasResource(activeStep)">
              <!-- PDF toolbar -->
              <div class="flex items-center justify-between border-b border-default px-5 py-2.5">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-file-text" class="text-xs text-[var(--ap-accent)]" />
                  <span class="text-xs font-medium text-muted">{{ activeStep.resourceLabel }}</span>
                </div>
                <a
                  :href="activeStep.resourceUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 rounded-md border border-default px-3 py-1.5 text-[11px] font-medium text-muted transition-all hover:border-[var(--ap-accent)]/30 hover:text-[var(--ap-accent)]"
                >
                  <UIcon name="i-lucide-external-link" class="text-xs" />
                  Open in new tab
                </a>
              </div>
              <!-- PDF iframe -->
              <iframe
                :src="activeStep.resourceUrl"
                class="w-full border-0"
                style="height: 620px;"
                title="PDF Document Preview"
              />
            </template>

            <!-- Document Body: coming soon placeholder -->
            <template v-else>
              <div class="flex flex-col items-center justify-center gap-5 px-8 py-14">
                <div class="flex h-24 w-24 items-center justify-center rounded-3xl bg-[var(--ap-accent)]/10">
                  <UIcon name="i-lucide-file-question" class="text-5xl text-[var(--ap-accent)]/40" />
                </div>
                <div class="text-center">
                  <h4 class="text-base font-semibold text-highlighted mb-1">
                    {{ activeStep.resourceLabel }}
                  </h4>
                  <p class="text-sm text-muted">
                    PDF Document · {{ activeStep.title }}
                  </p>
                </div>
                <div class="flex flex-col items-center gap-3">
                  <div class="flex items-center gap-2 rounded-lg border border-default bg-elevated px-4 py-2.5">
                    <UIcon name="i-lucide-clock" class="text-xs text-muted" />
                    <span class="text-[11px] text-muted">Document coming soon</span>
                  </div>
                  <p class="text-xs text-muted/60 max-w-xs text-center">
                    The reference document for <span class="text-[var(--ap-accent)]">{{ activeStep.title }}</span> will be uploaded here shortly.
                  </p>
                </div>
              </div>
            </template>
          </div>

          <!-- Navigation Footer -->
          <div class="rounded-2xl border border-default bg-elevated px-5 py-3">
            <div class="flex items-center justify-between">
              <button
                :disabled="isFirst"
                class="inline-flex items-center gap-2 rounded-lg border border-default bg-elevated px-4 py-2 text-xs font-medium text-muted transition-all hover:border-[var(--ap-accent)]/30 hover:text-[var(--ap-accent)] disabled:opacity-30 disabled:pointer-events-none"
                @click="goToPrev"
              >
                <UIcon name="i-lucide-arrow-left" class="text-sm" />
                Previous
              </button>

              <div class="flex items-center gap-1.5">
                <button
                  v-for="step in steps"
                  :key="step.id"
                  class="h-2 rounded-full transition-all duration-300"
                  :class="[
                    activeStepId === step.id
                      ? 'w-6 bg-[var(--ap-accent)]'
                      : 'w-2 bg-[var(--ap-border)] hover:bg-[var(--ap-border-strong)]'
                  ]"
                  @click="selectStep(step.id)"
                />
              </div>

              <button
                :disabled="isLast"
                class="inline-flex items-center gap-2 rounded-lg bg-[var(--ap-accent)] px-4 py-2 text-xs font-medium text-white transition-all hover:bg-[var(--ap-accent)]/90 disabled:opacity-30 disabled:pointer-events-none"
                @click="goToNext"
              >
                Next
                <UIcon name="i-lucide-arrow-right" class="text-sm" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
