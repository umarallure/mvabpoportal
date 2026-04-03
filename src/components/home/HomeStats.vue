<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { format } from 'date-fns'
import { useRoute } from 'vue-router'
import type { Period, Range, Stat } from '../../types'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../composables/useAuth'
import KpiCard from '../dashboard/KpiCard.vue'
import { buildDashboardMockStats, resolveDashboardMockSettings } from '../../lib/dashboard-mocks'

const props = defineProps<{
  period: Period
  range: Range
}>()

const auth = useAuth()
const route = useRoute()

type DashboardStatRow = {
  id: string
  call_result: string | null
  status: string | null
  submitted_attorney: string | null
  submitted_attorney_status: string | null
}

const EMPTY_STATS: Stat[] = [
  { title: 'Total Inbound BPO Transfers', icon: 'i-lucide-arrow-right-left', value: 0, variation: 0 },
  { title: 'Qualified Inbound', icon: 'i-lucide-badge-check', value: 0, variation: 0 },
  { title: 'Not Qualified Inbound', icon: 'i-lucide-circle-x', value: 0, variation: 0 },
  { title: 'No Coverage (Inbound)', icon: 'i-lucide-shield-x', value: 0, variation: 0 },
  { title: 'Submitted to Attorney (Inbound)', icon: 'i-lucide-send', value: 0, variation: 0 },
  { title: 'Approved Attorney (Inbound)', icon: 'i-lucide-scale', value: 0, variation: 0 },
  { title: 'Denied Attorney (Inbound)', icon: 'i-lucide-badge-x', value: 0, variation: 0 }
]

const CARD_ACCENTS = [
  'var(--dashboard-accent-primary)',
  'var(--dashboard-accent-green)',
  'var(--dashboard-accent-orange)',
  'var(--dashboard-accent-amber)',
  'var(--dashboard-accent-blue)',
  'var(--dashboard-accent-primary)',
  'var(--dashboard-accent-red)'
]

const stats = ref<Stat[]>([...EMPTY_STATS])
const isLoading = ref(false)

const normalize = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase()

const includesNormalized = (value: string | null | undefined, needle: string) => normalize(value).includes(needle)

const buildStats = (rows: DashboardStatRow[]): Stat[] => {
  const totalInbound = rows.length

  const qualifiedInbound = rows.filter((row) => {
    const callResult = normalize(row.call_result)
    const status = normalize(row.status)
    return callResult === 'qualified' || (status.includes('qualified') && !status.includes('not_qualified'))
  }).length

  const notQualifiedInbound = rows.filter((row) => {
    const callResult = normalize(row.call_result)
    return callResult === 'not qualified' || includesNormalized(row.status, 'not_qualified')
  }).length

  const noCoverageInbound = rows.filter((row) => normalize(row.submitted_attorney_status) === 'nocoverage').length

  const submittedToAttorneyInbound = rows.filter((row) => {
    const submittedAttorney = String(row.submitted_attorney ?? '').trim()
    const attorneyStatus = normalize(row.submitted_attorney_status)
    return Boolean(submittedAttorney) && attorneyStatus !== 'nocoverage'
  }).length

  const approvedAttorneyInbound = rows.filter((row) => normalize(row.submitted_attorney_status) === 'approved').length

  const deniedAttorneyInbound = rows.filter((row) => normalize(row.submitted_attorney_status) === 'denied').length

  return [
    { title: 'Total Inbound BPO Transfers', icon: 'i-lucide-arrow-right-left', value: totalInbound, variation: 0 },
    { title: 'Qualified Inbound', icon: 'i-lucide-badge-check', value: qualifiedInbound, variation: 0 },
    { title: 'Not Qualified Inbound', icon: 'i-lucide-circle-x', value: notQualifiedInbound, variation: 0 },
    { title: 'No Coverage (Inbound)', icon: 'i-lucide-shield-x', value: noCoverageInbound, variation: 0 },
    { title: 'Submitted to Attorney (Inbound)', icon: 'i-lucide-send', value: submittedToAttorneyInbound, variation: 0 },
    { title: 'Approved Attorney (Inbound)', icon: 'i-lucide-scale', value: approvedAttorneyInbound, variation: 0 },
    { title: 'Denied Attorney (Inbound)', icon: 'i-lucide-badge-x', value: deniedAttorneyInbound, variation: 0 }
  ]
}

const cards = computed(() => stats.value.map((stat, index) => ({
  ...stat,
  accent: CARD_ACCENTS[index % CARD_ACCENTS.length]
})))

const fetchStats = async () => {
  isLoading.value = true

  try {
    const mockSettings = resolveDashboardMockSettings(route.query)
    if (mockSettings.enabled) {
      stats.value = buildDashboardMockStats(mockSettings.scenario)
      return
    }

    await auth.init()
    const leadVendor = auth.resolvedLeadVendor.value
    const hasAccess = auth.canSeeAll.value || Boolean(auth.state.value.centerContext?.id)

    const startDate = format(props.range.start, 'yyyy-MM-dd')
    const endDate = format(props.range.end, 'yyyy-MM-dd')

    let query = supabase
      .from('daily_deal_flow')
      .select('id, call_result, status, submitted_attorney, submitted_attorney_status, date')
      .gte('date', startDate)
      .lte('date', endDate)

    if (!hasAccess) {
      stats.value = [...EMPTY_STATS]
      return
    }

    if (leadVendor) {
      query = query.eq('lead_vendor', leadVendor)
    }

    const { data: rows, error } = await query

    if (error) {
      console.warn('Failed to fetch dashboard stats', error)
      stats.value = [...EMPTY_STATS]
      return
    }

    stats.value = buildStats((rows ?? []) as DashboardStatRow[])
  } catch (error) {
    console.warn('Dashboard stats error', error)
    stats.value = [...EMPTY_STATS]
  } finally {
    isLoading.value = false
  }
}

watch([() => props.period, () => props.range, () => route.fullPath], () => {
  fetchStats()
}, { immediate: true })
</script>

<template>
  <section class="dashboard-stats-grid">
    <KpiCard
      v-for="(stat, index) in cards"
      :key="stat.title"
      :title="stat.title"
      :value="stat.value"
      :icon="stat.icon"
      :accent="stat.accent"
      :loading="isLoading"
      :aria-label="stat.title"
      compact
      :stagger="index"
    >
      <template #footer>
        <div class="dashboard-stats-footer">
          <span
            class="dashboard-stats-footer__badge"
            :class="stat.variation > 0 ? 'dashboard-stats-footer__badge--positive' : 'dashboard-stats-footer__badge--negative'"
          >
            {{ stat.variation > 0 ? '+' : '' }}{{ stat.variation }}%
          </span>
        </div>
      </template>
    </KpiCard>
  </section>
</template>

<style scoped>
.dashboard-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

@media (min-width: 900px) {
  .dashboard-stats-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (min-width: 1280px) {
  .dashboard-stats-grid {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
}

.dashboard-stats-footer {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.dashboard-stats-footer__badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.dashboard-stats-footer__badge--positive {
  background: var(--dashboard-positive-bg);
  color: var(--dashboard-positive-text);
}

.dashboard-stats-footer__badge--negative {
  background: var(--dashboard-negative-bg);
  color: var(--dashboard-negative-text);
}
</style>
