<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { usePublisherIncentives } from '../composables/usePublisherIncentives'
import {
  formatIncentiveCurrency,
  formatIncentiveTarget,
  getIncentiveProgressPercent
} from '../lib/incentives'

const {
  latestActiveIncentive,
  start
} = usePublisherIncentives()

const now = ref(Date.now())
let timer: number | null = null

const latest = computed(() => latestActiveIncentive.value)

const isDone = computed(() => {
  if (!latest.value) return false
  return Boolean(latest.value.progress?.is_completed) ||
    Number(latest.value.progress?.current_count ?? 0) >= Number(latest.value.target_quantity)
})

const remainingMs = computed(() => {
  if (!latest.value) return 0
  return new Date(latest.value.end_time).getTime() - now.value
})

const state = computed(() => {
  if (isDone.value) return 'done'
  if (remainingMs.value <= 3600000) return 'critical'
  if (remainingMs.value <= 86400000) return 'soon'
  return 'live'
})

const isRace = computed(() => latest.value?.target_type === 'first_to_finish')

const fillColor = computed(() => {
  if (isDone.value) return 'var(--dashboard-accent-green)'
  return isRace.value ? 'var(--dashboard-accent-amber)' : 'var(--dashboard-accent-primary)'
})

const progressLabel = computed(() => {
  if (!latest.value) return '0 / 0'

  const current = latest.value.progress?.current_count ?? 0
  return `${current} / ${latest.value.target_quantity}`
})

const countdown = computed(() => {
  if (isDone.value) return 'Completed'
  if (remainingMs.value <= 0) return 'Ending now'

  const days = Math.floor(remainingMs.value / 86400000)
  const hours = Math.floor((remainingMs.value % 86400000) / 3600000)
  const minutes = Math.floor((remainingMs.value % 3600000) / 60000)

  if (days > 0) return `${days}d ${hours}h left`
  if (hours > 0) return `${hours}h ${minutes}m left`
  return `${Math.max(1, minutes)}m left`
})

const progressPercent = computed(() => {
  return latest.value ? getIncentiveProgressPercent(latest.value) : 0
})

onMounted(() => {
  void start()

  timer = window.setInterval(() => {
    now.value = Date.now()
  }, 30000)
})

onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <div
    v-if="latest"
    class="ticker"
    :data-state="state"
  >
    <span class="ticker__live" aria-hidden="true" />
    <span class="ticker__label">Live bonus</span>

    <span class="ticker__payout">{{ formatIncentiveCurrency(latest.payout_amount) }}</span>

    <p class="ticker__title">
      {{ latest.title }}
    </p>

    <span class="ticker__target">{{ formatIncentiveTarget(latest) }}</span>

    <div class="ticker__progress">
      <div class="ticker__track">
        <div
          class="ticker__fill"
          :style="{ width: `${progressPercent}%`, background: fillColor }"
        />
      </div>
      <span class="ticker__count">{{ progressLabel }}</span>
    </div>

    <span class="ticker__timer">
      <UIcon
        :name="isDone ? 'i-lucide-check' : 'i-lucide-clock-3'"
        class="size-3.5"
      />
      {{ countdown }}
    </span>

    <UButton
      to="/incentives"
      size="xs"
      color="neutral"
      variant="ghost"
      icon="i-lucide-arrow-right"
      trailing
      class="ticker__cta"
    >
      View board
    </UButton>
  </div>
</template>

<style scoped>
.ticker {
  --mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.85rem;
  padding: 0.6rem 1.5rem;
  border-bottom: 1px solid var(--dashboard-divider);
  background: color-mix(in srgb, var(--dashboard-surface-strong) 92%, transparent);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.ticker__live {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--dashboard-accent-primary);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--dashboard-accent-primary) 55%, transparent);
  animation: ticker-pulse 2.4s ease-out infinite;
}

.ticker__label {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--dashboard-text-muted);
}

.ticker__payout {
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--dashboard-accent-primary);
  font-variant-numeric: tabular-nums;
}

.ticker__title {
  min-width: 0;
  flex-shrink: 1;
  max-width: 22rem;
  overflow: hidden;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--dashboard-text-primary);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ticker__target {
  font-size: 0.75rem;
  color: var(--dashboard-text-muted);
  white-space: nowrap;
}

.ticker__progress {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 8rem;
  flex: 1 1 8rem;
  max-width: 16rem;
  margin-left: auto;
}

.ticker__track {
  flex: 1;
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--dashboard-text-muted) 16%, transparent);
}

.ticker__fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.ticker__count {
  font-family: var(--mono);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--dashboard-text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ticker__timer {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--mono);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--dashboard-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ticker[data-state='soon'] .ticker__timer { color: var(--dashboard-accent-amber); }
.ticker[data-state='critical'] .ticker__timer {
  color: var(--dashboard-negative-text);
  animation: ticker-blink 1.4s ease-in-out infinite;
}
.ticker[data-state='done'] .ticker__timer { color: var(--dashboard-positive-text); }

.ticker__cta {
  flex-shrink: 0;
}

@keyframes ticker-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dashboard-accent-primary) 55%, transparent); }
  70% { box-shadow: 0 0 0 6px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

@keyframes ticker-blink {
  50% { opacity: 0.55; }
}

@media (prefers-reduced-motion: reduce) {
  .ticker__live,
  .ticker[data-state='critical'] .ticker__timer {
    animation: none !important;
  }
}

@media (max-width: 900px) {
  .ticker__target { display: none; }
}

@media (max-width: 640px) {
  .ticker {
    padding: 0.55rem 1rem;
    gap: 0.4rem 0.6rem;
  }

  .ticker__title { max-width: 100%; flex-basis: 100%; }

  .ticker__progress {
    margin-left: 0;
    flex-basis: 100%;
    max-width: none;
  }
}
</style>
