<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { usePublisherIncentives } from '../composables/usePublisherIncentives'
import type { PublisherIncentive } from '../lib/incentives'
import {
  formatIncentiveCurrency,
  formatIncentiveRules,
  formatIncentiveTarget,
  getIncentiveProgressPercent
} from '../lib/incentives'

type IncentiveFilter = 'all' | 'open' | 'completed'
type RowState = 'done' | 'critical' | 'soon' | 'live'

const {
  incentives,
  loading,
  error,
  start,
  refetch
} = usePublisherIncentives()

const now = ref(Date.now())
const query = ref('')
const filter = ref<IncentiveFilter>('all')
let timer: number | null = null

const filterTabs: Array<{ label: string; value: IncentiveFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'In progress', value: 'open' },
  { label: 'Completed', value: 'completed' }
]

const isCompleted = (incentive: PublisherIncentive) => {
  return Boolean(incentive.progress?.is_completed) ||
    Number(incentive.progress?.current_count ?? 0) >= Number(incentive.target_quantity)
}

const getTimeRemainingMs = (endTime: string) => {
  return new Date(endTime).getTime() - now.value
}

const baseSortedIncentives = computed(() => {
  return [...incentives.value].sort((a, b) => {
    const aCompleted = isCompleted(a) ? 1 : 0
    const bCompleted = isCompleted(b) ? 1 : 0
    if (aCompleted !== bCompleted) return aCompleted - bCompleted

    const aEnd = new Date(a.end_time).getTime()
    const bEnd = new Date(b.end_time).getTime()
    return aEnd - bEnd
  })
})

const filteredIncentives = computed(() => {
  const q = query.value.trim().toLowerCase()

  return baseSortedIncentives.value.filter((incentive) => {
    const completed = isCompleted(incentive)
    if (filter.value === 'open' && completed) return false
    if (filter.value === 'completed' && !completed) return false

    if (!q) return true

    const criteria = formatIncentiveRules(incentive.rules).join(' ')
    const haystack = [
      incentive.title,
      incentive.description ?? '',
      formatIncentiveTarget(incentive),
      criteria
    ].join(' ').toLowerCase()

    return haystack.includes(q)
  })
})

const completedCount = computed(() => {
  return incentives.value.filter((incentive) => isCompleted(incentive)).length
})

const inProgressCount = computed(() => {
  return incentives.value.length - completedCount.value
})

const endingSoonCount = computed(() => {
  return incentives.value.filter((incentive) => {
    const remaining = getTimeRemainingMs(incentive.end_time)
    return remaining > 0 && remaining <= 86400000 && !isCompleted(incentive)
  }).length
})

const inPlayPayout = computed(() => {
  return incentives.value.reduce((sum, incentive) => {
    if (isCompleted(incentive)) return sum
    return sum + Number(incentive.payout_amount ?? 0)
  }, 0)
})

const formatDateTime = (value: string | null) => {
  if (!value) return 'Immediate'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

const formatCountdown = (endTime: string) => {
  const diff = getTimeRemainingMs(endTime)
  if (diff <= 0) return 'Ending now'

  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)

  if (days > 0) return `${days}d ${hours}h left`
  if (hours > 0) return `${hours}h ${minutes}m left`
  return `${Math.max(1, minutes)}m left`
}

const progressLabel = (incentive: PublisherIncentive) => {
  return `${incentive.progress?.current_count ?? 0} / ${incentive.target_quantity}`
}

// ── Presentational helpers (display-only; no data logic) ──
const rowState = (incentive: PublisherIncentive): RowState => {
  if (isCompleted(incentive)) return 'done'
  const remaining = getTimeRemainingMs(incentive.end_time)
  if (remaining <= 3600000) return 'critical'
  if (remaining <= 86400000) return 'soon'
  return 'live'
}

const isRace = (incentive: PublisherIncentive) => incentive.target_type === 'first_to_finish'

const typeMeta = (incentive: PublisherIncentive) => {
  return isRace(incentive)
    ? { label: 'First to finish', icon: 'i-lucide-zap', cls: 'brow__type--race' }
    : { label: 'Milestone', icon: 'i-lucide-target', cls: 'brow__type--milestone' }
}

const fillColor = (incentive: PublisherIncentive) => {
  if (isCompleted(incentive)) return 'var(--dashboard-accent-green)'
  return isRace(incentive) ? 'var(--dashboard-accent-amber)' : 'var(--dashboard-accent-primary)'
}

const countdownLabel = (incentive: PublisherIncentive) => {
  return isCompleted(incentive) ? 'Completed' : formatCountdown(incentive.end_time)
}

const progressNote = (incentive: PublisherIncentive) => {
  if (isCompleted(incentive)) return 'Bonus unlocked'
  if (isRace(incentive)) return formatIncentiveTarget(incentive)

  const remaining = Number(incentive.target_quantity) - Number(incentive.progress?.current_count ?? 0)
  return remaining > 0 ? `${remaining} more to unlock` : formatIncentiveTarget(incentive)
}

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
  <UDashboardPanel id="incentives">
    <template #header>
      <UDashboardNavbar title="Incentives">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            @click="refetch"
          >
            Refresh
          </UButton>
          <NotificationBell />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          title="Couldn't load flash bonuses"
          :description="error"
        />

        <section class="board dashboard-surface-card">
          <!-- Board header — the live thesis -->
          <header class="board__head">
            <div class="board__pool">
              <p class="board__live">
                <span class="board__live-dot" />
                Live · flash bonuses
              </p>
              <p class="board__amount">
                {{ formatIncentiveCurrency(inPlayPayout) }}
                <span class="board__amount-unit">in play</span>
              </p>
              <p class="board__meta">
                <span><b>{{ inProgressCount }}</b> open</span>
                <span class="board__dot">·</span>
                <span><b>{{ completedCount }}</b> settled</span>
              </p>
            </div>

            <div
              v-if="endingSoonCount > 0"
              class="board__alert"
            >
              <UIcon name="i-lucide-alarm-clock" class="size-4" />
              <span><b>{{ endingSoonCount }}</b> ending within 24h</span>
            </div>
          </header>

          <!-- Toolbar -->
          <div class="board__toolbar">
            <UInput
              v-model="query"
              class="board__search"
              icon="i-lucide-search"
              variant="none"
              placeholder="Search bonuses, targets, criteria…"
            />

            <div class="seg" role="tablist">
              <button
                v-for="tab in filterTabs"
                :key="tab.value"
                type="button"
                role="tab"
                class="seg__btn"
                :class="{ 'seg__btn--active': filter === tab.value }"
                :aria-selected="filter === tab.value"
                @click="filter = tab.value"
              >
                {{ tab.label }}
              </button>
            </div>
          </div>

          <!-- Loading -->
          <ol
            v-if="loading && filteredIncentives.length === 0"
            class="ledger"
          >
            <li
              v-for="index in 4"
              :key="index"
              class="brow brow--skeleton"
            >
              <div class="brow__main">
                <div class="dashboard-skeleton h-3.5 w-40" />
                <div class="dashboard-skeleton h-2 w-full max-w-md" />
              </div>
              <div class="dashboard-skeleton h-6 w-16" />
            </li>
          </ol>

          <!-- Empty -->
          <div
            v-else-if="filteredIncentives.length === 0"
            class="board__empty"
          >
            <div class="board__empty-badge">
              <UIcon name="i-lucide-badge-dollar-sign" class="size-6" />
            </div>
            <h3>No flash bonuses in this view</h3>
            <p>Approved publisher bonuses land here the moment they go live. Credit a qualified case and the board starts moving.</p>
          </div>

          <!-- The board -->
          <ol
            v-else
            class="ledger"
          >
            <li
              v-for="(incentive, index) in filteredIncentives"
              :key="incentive.id"
              class="brow dashboard-fade-up"
              :data-state="rowState(incentive)"
              :style="{ '--dashboard-enter-delay': `${index * 45}ms` }"
            >
              <div class="brow__main">
                <div class="brow__head">
                  <span class="brow__type" :class="typeMeta(incentive).cls">
                    <UIcon :name="typeMeta(incentive).icon" class="size-3.5" />
                    {{ typeMeta(incentive).label }}
                  </span>
                  <h3 class="brow__title" :title="incentive.description || incentive.title">
                    {{ incentive.title }}
                  </h3>
                  <span
                    v-for="rule in formatIncentiveRules(incentive.rules)"
                    :key="rule"
                    class="brow__rule"
                  >
                    {{ rule }}
                  </span>
                </div>

                <div class="brow__progress">
                  <div class="track">
                    <div
                      class="track__fill"
                      :style="{ width: `${getIncentiveProgressPercent(incentive)}%`, background: fillColor(incentive) }"
                    />
                  </div>
                  <span class="track__count">{{ progressLabel(incentive) }}</span>
                  <span class="track__note">{{ progressNote(incentive) }}</span>
                </div>
              </div>

              <div class="brow__aside">
                <div class="payout">
                  <span class="payout__label">{{ isCompleted(incentive) ? 'Won' : 'Bonus' }}</span>
                  <span class="payout__value">{{ formatIncentiveCurrency(incentive.payout_amount) }}</span>
                </div>
                <div
                  class="timer"
                  :data-state="rowState(incentive)"
                  :title="`Ends ${formatDateTime(incentive.end_time)}`"
                >
                  <UIcon
                    :name="isCompleted(incentive) ? 'i-lucide-check' : 'i-lucide-clock-3'"
                    class="size-3.5"
                  />
                  {{ countdownLabel(incentive) }}
                </div>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.board {
  --mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  padding: 0;
}

/* ── Header ── */
.board__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.5rem 1.15rem;
  border-bottom: 1px solid var(--dashboard-divider);
  background: linear-gradient(180deg, color-mix(in srgb, var(--dashboard-accent-primary) 5%, transparent), transparent 80%);
}

.board__live {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--dashboard-text-muted);
}

.board__live-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--dashboard-accent-primary);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--dashboard-accent-primary) 55%, transparent);
  animation: board-pulse 2.4s ease-out infinite;
}

.board__amount {
  margin-top: 0.4rem;
  font-size: clamp(1.9rem, 4vw, 2.5rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--dashboard-accent-primary);
  font-variant-numeric: tabular-nums;
}

.board__amount-unit {
  margin-left: 0.4rem;
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--dashboard-text-muted);
}

.board__meta {
  margin-top: 0.55rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--dashboard-text-secondary);
}

.board__meta b {
  color: var(--dashboard-text-primary);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.board__dot {
  color: var(--dashboard-text-soft);
}

.board__alert {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.7rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--dashboard-accent-amber);
  background: color-mix(in srgb, var(--dashboard-accent-amber) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--dashboard-accent-amber) 32%, transparent);
}

.board__alert b {
  font-variant-numeric: tabular-nums;
}

/* ── Toolbar ── */
.board__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.7rem 1rem 0.7rem 1.25rem;
  border-bottom: 1px solid var(--dashboard-divider);
}

.board__search {
  flex: 1 1 15rem;
  max-width: 22rem;
}

.seg {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  border-radius: 0.6rem;
  background: color-mix(in srgb, var(--dashboard-text-muted) 10%, transparent);
}

.seg__btn {
  padding: 0.3rem 0.75rem;
  border-radius: 0.45rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--dashboard-text-muted);
  transition: color 0.15s ease, background 0.15s ease;
  cursor: pointer;
}

.seg__btn:hover {
  color: var(--dashboard-text-primary);
}

.seg__btn--active {
  color: var(--dashboard-text-primary);
  background: var(--dashboard-surface-strong);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

/* ── Ledger rows ── */
.ledger {
  list-style: none;
  margin: 0;
  padding: 0;
}

.brow {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 1rem 1.5rem 1rem 1.65rem;
  border-top: 1px solid var(--dashboard-divider);
  transition: background 0.15s ease;
}

.ledger .brow:first-child {
  border-top: 0;
}

/* Left heat rail — encodes time pressure / settled state */
.brow::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.75rem;
  bottom: 0.75rem;
  width: 3px;
  border-radius: 999px;
  background: var(--brow-accent, var(--dashboard-accent-primary));
  transition: top 0.15s ease, bottom 0.15s ease;
}

.brow:hover {
  background: color-mix(in srgb, var(--dashboard-accent-primary) 4%, transparent);
}

.brow:hover::before {
  top: 0;
  bottom: 0;
}

.brow[data-state='live'] { --brow-accent: var(--dashboard-accent-primary); }
.brow[data-state='soon'] { --brow-accent: var(--dashboard-accent-amber); }
.brow[data-state='critical'] { --brow-accent: var(--dashboard-negative-text); }
.brow[data-state='done'] {
  --brow-accent: var(--dashboard-accent-green);
  opacity: 0.72;
}

.brow__main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.65rem;
}

.brow__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.brow__type {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.5rem;
  border-radius: 0.4rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.brow__type--race {
  color: var(--dashboard-accent-amber);
  background: color-mix(in srgb, var(--dashboard-accent-amber) 13%, transparent);
}

.brow__type--milestone {
  color: var(--dashboard-text-secondary);
  background: color-mix(in srgb, var(--dashboard-text-muted) 12%, transparent);
}

.brow__title {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--dashboard-text-primary);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.brow__rule {
  padding: 0.15rem 0.45rem;
  border-radius: 0.35rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--dashboard-text-muted);
  border: 1px solid var(--dashboard-divider);
  white-space: nowrap;
}

.brow__progress {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.track {
  position: relative;
  flex: 1;
  max-width: 20rem;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--dashboard-text-muted) 16%, transparent);
}

.track__fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.track__count {
  font-family: var(--mono);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--dashboard-text-primary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.track__note {
  min-width: 0;
  font-size: 0.75rem;
  color: var(--dashboard-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Aside: payout + timer ── */
.brow__aside {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.4rem;
  flex-shrink: 0;
  text-align: right;
}

.payout {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1;
}

.payout__label {
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--dashboard-text-soft);
}

.payout__value {
  margin-top: 0.2rem;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--dashboard-accent-primary);
  font-variant-numeric: tabular-nums;
}

.timer {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--mono);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--dashboard-text-muted);
  font-variant-numeric: tabular-nums;
}

.timer[data-state='soon'] { color: var(--dashboard-accent-amber); }
.timer[data-state='critical'] {
  color: var(--dashboard-negative-text);
  animation: board-blink 1.4s ease-in-out infinite;
}
.timer[data-state='done'] { color: var(--dashboard-positive-text); }

/* ── Skeleton / empty ── */
.brow--skeleton {
  justify-content: space-between;
}

.brow--skeleton::before {
  background: var(--dashboard-divider);
}

.board__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 3.5rem 1.5rem;
}

.board__empty-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 0.75rem;
  color: var(--dashboard-accent-primary);
  background: color-mix(in srgb, var(--dashboard-accent-primary) 12%, transparent);
}

.board__empty h3 {
  margin-top: 1rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--dashboard-text-primary);
}

.board__empty p {
  margin-top: 0.4rem;
  max-width: 26rem;
  font-size: 0.85rem;
  line-height: 1.55;
  color: var(--dashboard-text-muted);
}

/* ── Motion ── */
@keyframes board-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dashboard-accent-primary) 55%, transparent); }
  70% { box-shadow: 0 0 0 6px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

@keyframes board-blink {
  50% { opacity: 0.55; }
}

@media (prefers-reduced-motion: reduce) {
  .board__live-dot,
  .timer[data-state='critical'] {
    animation: none !important;
  }
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .brow {
    flex-direction: column;
    align-items: stretch;
    gap: 0.85rem;
  }

  .brow__aside {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .payout {
    align-items: flex-start;
  }

  .track {
    max-width: none;
  }
}
</style>
