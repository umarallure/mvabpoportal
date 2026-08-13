<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'

const tiltReady = ref(false)
const isHovering = ref([false, false, false, false])
const tiltTransform = ref(['', '', '', ''])
const animDone = ref([false, false, false, false])
const prefersReducedMotion = ref(false)

const selectedCategory = ref('consumer')
const categoryOptions = [
  { value: 'consumer', label: 'Consumer' },
  { value: 'commercial', label: 'Commercial' }
]

let tiltTimer: ReturnType<typeof setTimeout>

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  tiltTimer = setTimeout(() => {
    tiltReady.value = true
  }, 900)
})

onBeforeUnmount(() => {
  clearTimeout(tiltTimer)
})

function onTiltMove(e: MouseEvent, i: number) {
  if (!tiltReady.value || prefersReducedMotion.value) return
  if (!animDone.value[i]) animDone.value[i] = true
  isHovering.value[i] = true
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const cx = rect.width / 2
  const cy = rect.height / 2
  const rx = ((y - cy) / cy) * -6
  const ry = ((x - cx) / cx) * 6
  tiltTransform.value[i] = `perspective(600px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale3d(1.02,1.02,1.02)`
}

function onTiltLeave(i: number) {
  isHovering.value[i] = false
  tiltTransform.value[i] = ''
}

const consumerTiers = [
  {
    name: 'Tier 1 - Bronze',
    tierClass: 'tier-1',
    price: '$2,000',
    rows: [
      { icon: 'i-lucide-calendar-clock', label: 'Accident Occurred', value: '6-12 Months Ago' },
      { icon: 'i-lucide-heart-pulse', label: 'Type of Injury', value: 'Moderate to Severe' },
      { icon: 'i-lucide-file-check', label: 'Documentation', value: 'Majority Documentation Covered', subtext: 'Signed Retainer, Police Report' },
      { icon: 'i-lucide-scale', label: 'Liability', value: '100% Accepted', subtext: 'Or Very Strong Proof' }
    ]
  },
  {
    name: 'Tier 2 - Silver',
    tierClass: 'tier-2',
    price: '$2,500',
    rows: [
      { icon: 'i-lucide-calendar-clock', label: 'Accident Occurred', value: '3-6 Months Ago' },
      { icon: 'i-lucide-heart-pulse', label: 'Type of Injury', value: 'Moderate to Severe' },
      { icon: 'i-lucide-file-check-2', label: 'Documentation', value: 'All Documentation Covered', subtext: 'Signed Retainer, Proof of Medical Treatment, Police Report' },
      { icon: 'i-lucide-scale', label: 'Liability', value: '100% Accepted', subtext: 'Or Very Strong Proof' }
    ]
  },
  {
    name: 'Tier 3 - Gold',
    tierClass: 'tier-4',
    price: '$3,000',
    rows: [
      { icon: 'i-lucide-calendar-clock', label: 'Accident Occurred', value: '0-3 Months Ago' },
      { icon: 'i-lucide-heart-pulse', label: 'Type of Injury', value: 'Moderate to Catastrophic' },
      { icon: 'i-lucide-file-badge', label: 'Documentation', value: 'All Documentation Covered', subtext: 'Insurance, Proof of Medical Treatment, Police Report' },
      { icon: 'i-lucide-scale', label: 'Liability', value: '100% Accepted', subtext: 'Or Very Strong Proof' }
    ]
  }
]

const commercialTiers = [
  {
    name: 'Commercial',
    tierClass: 'tier-4',
    price: '$4,000',
    rows: [
      { icon: 'i-lucide-calendar-clock', label: 'Accident Occurred', value: '0-3 Months Ago' },
      { icon: 'i-lucide-heart-pulse', label: 'Type of Injury', value: 'Moderate to Catastrophic' },
      { icon: 'i-lucide-file-badge', label: 'Documentation', value: 'All Documentation Covered', subtext: 'Insurance, Proof of Medical Treatment, Police Report' },
      { icon: 'i-lucide-scale', label: 'Liability', value: '100% Accepted', subtext: 'Or Very Strong Proof' }
    ]
  }
]

const activeTiers = computed(() =>
  selectedCategory.value === 'consumer' ? consumerTiers : commercialTiers
)

watch(selectedCategory, () => {
  animDone.value = [false, false, false, false]
  tiltTransform.value = ['', '', '', '']
  isHovering.value = [false, false, false, false]
})
</script>

<template>
  <UDashboardPanel id="product-offering">
    <template #header>
      <UDashboardNavbar title="Product Offering">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <NotificationBell />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="po-page p-6 space-y-6">
        <!-- Intro -->
        <div :class="['po-intro', { 'po-fade-up': !prefersReducedMotion }]">
          <div class="flex items-center justify-between gap-4">
            <h1 class="text-xl font-bold text-default">
              {{ selectedCategory === 'consumer' ? 'Consumer Cases' : 'Commercial Cases' }} &mdash; Commissions Per Case
            </h1>
            <USelect
              v-model="selectedCategory"
              :items="categoryOptions"
              value-key="value"
              label-key="label"
              class="w-40"
            />
          </div>
          <p class="mt-1.5 text-sm text-muted max-w-2xl">
            Each tier reflects the commission value based on recency, liability strength,
            injury severity, and documentation quality.
          </p>
        </div>

        <!-- Tier card grid -->
        <div :class="activeTiers.length > 1 ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4' : 'flex'">
          <div
            v-for="(tier, i) in activeTiers"
            :key="tier.name"
            :class="[
              'po-tilt',
              tier.tierClass,
              { 'po-fade-up': !prefersReducedMotion && !animDone[i] },
              activeTiers.length === 1 ? 'w-full max-w-sm' : ''
            ]"
            :style="{
              animationDelay: !prefersReducedMotion && !animDone[i] ? `${200 + i * 100}ms` : undefined,
              transform: tiltTransform[i] || undefined,
              transition: isHovering[i]
                ? 'transform 0.15s ease-out'
                : 'transform 0.5s cubic-bezier(0.03, 0.98, 0.52, 0.99)'
            }"
            @mousemove="onTiltMove($event, i)"
            @mouseleave="onTiltLeave(i)"
          >
            <div class="po-card flex flex-col h-full">
              <!-- Header -->
              <div class="po-header flex items-center justify-center px-4 py-3">
                <span class="text-xs font-semibold uppercase tracking-wider po-tier-label">
                  {{ tier.name }}
                </span>
              </div>

              <!-- Accent strip -->
              <div class="po-strip h-0.5 w-full" />

              <!-- Price -->
              <div class="py-5 text-center">
                <span class="text-3xl font-bold po-price">{{ tier.price }}</span>
                <span class="ml-1 text-sm font-normal text-muted">/ case</span>
              </div>

              <!-- Detail rows -->
              <div class="px-4 space-y-1">
                <div
                  v-for="row in tier.rows"
                  :key="row.label"
                  class="po-row flex items-start gap-2.5 rounded-lg px-3 py-2.5"
                >
                  <UIcon :name="row.icon" class="mt-0.5 size-4 shrink-0 po-row-icon" />
                  <div class="min-w-0">
                    <div class="text-[10px] uppercase tracking-widest text-muted leading-tight">
                      {{ row.label }}
                    </div>
                    <div class="mt-0.5 text-[13px] font-semibold text-default leading-snug">
                      {{ row.value }}
                    </div>
                    <div v-if="row.subtext" class="mt-0.5 text-xs text-muted leading-snug">
                      {{ row.subtext }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Bottom spacer for equal-height alignment -->
              <div class="mt-auto pb-4" />
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* ── Entrance animation ──────────────────────────────────────────── */
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.po-fade-up {
  animation: fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.po-intro.po-fade-up {
  animation-delay: 100ms;
}

/* ── Tilt wrapper ────────────────────────────────────────────────── */
.po-tilt {
  will-change: transform;
  transform-style: preserve-3d;
}

/* ── Reduced motion ──────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .po-fade-up {
    animation: none;
    opacity: 1;
    transform: none;
  }

  .po-tilt {
    will-change: auto;
    transform-style: flat;
  }
}
</style>

<style>
/* ═══════════════════════════════════════════════════════════════════
   Product Offering – theme styles (unscoped, namespaced under .po-page)
   ═══════════════════════════════════════════════════════════════════ */

/* ── Card base ───────────────────────────────────────────────────── */
.po-page .po-card {
  background: rgba(255, 255, 255, 0.90);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(4px);
  transition: box-shadow 300ms, background 300ms, border-color 300ms;
}

.po-page .po-card:hover {
  background: #ffffff;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
}

.dark .po-page .po-card {
  background: rgba(26, 26, 26, 0.60);
  border-color: rgba(255, 255, 255, 0.08);
}

.dark .po-page .po-card:hover {
  background: #1F1F1F;
}

/* ── Hover border per tier ───────────────────────────────────────── */
.po-page .tier-1:hover .po-card { border-color: rgba(255, 255, 255, 0.20); }
.po-page .tier-2:hover .po-card { border-color: rgba(205, 127, 50, 0.40); }
.po-page .tier-3:hover .po-card { border-color: rgba(148, 163, 184, 0.40); }
.po-page .tier-4:hover .po-card { border-color: rgba(212, 175, 55, 0.40); }

.dark .po-page .tier-1:hover .po-card { border-color: rgba(255, 255, 255, 0.25); }
.dark .po-page .tier-2:hover .po-card { border-color: rgba(205, 127, 50, 0.40); }
.dark .po-page .tier-3:hover .po-card { border-color: rgba(168, 184, 204, 0.40); }
.dark .po-page .tier-4:hover .po-card { border-color: rgba(212, 175, 55, 0.40); }

/* ── Header ──────────────────────────────────────────────────────── */
.po-page .po-header {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.dark .po-page .po-header {
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.po-page .tier-1 .po-header { background: linear-gradient(to right, rgba(255,255,255,0.45), rgba(255,255,255,0.12), transparent); }
.po-page .tier-2 .po-header { background: linear-gradient(to right, rgba(205,127,50,0.12), rgba(205,127,50,0.04), transparent); }
.po-page .tier-3 .po-header { background: linear-gradient(to right, rgba(148,163,184,0.14), rgba(148,163,184,0.05), transparent); }
.po-page .tier-4 .po-header { background: linear-gradient(to right, rgba(212,175,55,0.12), rgba(212,175,55,0.04), transparent); }

.dark .po-page .tier-1 .po-header { background: linear-gradient(to right, rgba(255,255,255,0.08), rgba(255,255,255,0.03), transparent); }
.dark .po-page .tier-2 .po-header { background: linear-gradient(to right, rgba(205,127,50,0.18), rgba(205,127,50,0.07), transparent); }
.dark .po-page .tier-3 .po-header { background: linear-gradient(to right, rgba(168,184,204,0.18), rgba(168,184,204,0.07), transparent); }
.dark .po-page .tier-4 .po-header { background: linear-gradient(to right, rgba(212,175,55,0.18), rgba(212,175,55,0.07), transparent); }

/* ── Accent strip ────────────────────────────────────────────────── */
.po-page .tier-1 .po-strip { background: #D1D5DB; }
.po-page .tier-2 .po-strip { background: #CD7F32; }
.po-page .tier-3 .po-strip { background: #94A3B8; }
.po-page .tier-4 .po-strip { background: #D4AF37; }

.dark .po-page .tier-1 .po-strip { background: rgba(255,255,255,0.25); }
.dark .po-page .tier-2 .po-strip { background: #B56E2A; }
.dark .po-page .tier-3 .po-strip { background: #8899AA; }
.dark .po-page .tier-4 .po-strip { background: #B8960C; }

/* ── Price color ─────────────────────────────────────────────────── */
.po-page .tier-1 .po-price { color: #6B7280; }
.po-page .tier-2 .po-price { color: #CD7F32; }
.po-page .tier-3 .po-price { color: #7A8A9E; }
.po-page .tier-4 .po-price { color: #B8960C; }

.dark .po-page .tier-1 .po-price { color: #E5E7EB; }
.dark .po-page .tier-2 .po-price { color: #D99A5B; }
.dark .po-page .tier-3 .po-price { color: #A8B8CC; }
.dark .po-page .tier-4 .po-price { color: #D4AF37; }

/* ── Tier label & row icon color ─────────────────────────────────── */
.po-page .tier-1 .po-tier-label,
.po-page .tier-1 .po-row-icon { color: #6B7280; }
.po-page .tier-2 .po-tier-label,
.po-page .tier-2 .po-row-icon { color: #CD7F32; }
.po-page .tier-3 .po-tier-label,
.po-page .tier-3 .po-row-icon { color: #7A8A9E; }
.po-page .tier-4 .po-tier-label,
.po-page .tier-4 .po-row-icon { color: #B8960C; }

.dark .po-page .tier-1 .po-tier-label,
.dark .po-page .tier-1 .po-row-icon { color: #E5E7EB; }
.dark .po-page .tier-2 .po-tier-label,
.dark .po-page .tier-2 .po-row-icon { color: #D99A5B; }
.dark .po-page .tier-3 .po-tier-label,
.dark .po-page .tier-3 .po-row-icon { color: #A8B8CC; }
.dark .po-page .tier-4 .po-tier-label,
.dark .po-page .tier-4 .po-row-icon { color: #D4AF37; }

/* ── Detail row hover ────────────────────────────────────────────── */
.po-page .po-row {
  transition: background 200ms;
}

.po-page .po-row:hover {
  background: rgba(0, 0, 0, 0.02);
}

.dark .po-page .po-row:hover {
  background: rgba(255, 255, 255, 0.02);
}

/* ── Commercial tier (primary orange #ae4010) ──────────────────────── */
.po-page .tier-commercial:hover .po-card { border-color: rgba(174, 64, 16, 0.40); }
.dark .po-page .tier-commercial:hover .po-card { border-color: rgba(174, 64, 16, 0.50); }

.po-page .tier-commercial .po-header { background: linear-gradient(to right, rgba(174,64,16,0.12), rgba(174,64,16,0.04), transparent); }
.dark .po-page .tier-commercial .po-header { background: linear-gradient(to right, rgba(174,64,16,0.18), rgba(174,64,16,0.07), transparent); }

.po-page .tier-commercial .po-strip { background: #ae4010; }
.dark .po-page .tier-commercial .po-strip { background: #c4521a; }

.po-page .tier-commercial .po-price { color: #ae4010; }
.dark .po-page .tier-commercial .po-price { color: #e07040; }

.po-page .tier-commercial .po-tier-label,
.po-page .tier-commercial .po-row-icon { color: #ae4010; }
.dark .po-page .tier-commercial .po-tier-label,
.dark .po-page .tier-commercial .po-row-icon { color: #e07040; }

</style>
