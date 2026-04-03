<script setup lang="ts">
import { ref, watch } from 'vue'
import { format } from 'date-fns'
import type { Period, Range, Stat } from '../../types'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../composables/useAuth'

const props = defineProps<{
  period: Period
  range: Range
}>()

const auth = useAuth()

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

const stats = ref<Stat[]>([...EMPTY_STATS])

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

const fetchStats = async () => {
  try {
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
      return
    }

    stats.value = buildStats((rows ?? []) as DashboardStatRow[])
  } catch (e) {
    console.warn('Dashboard stats error', e)
  }
}

watch([() => props.period, () => props.range], () => {
  fetchStats()
}, { immediate: true })
</script>

<template>
  <UPageGrid class="lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-px">
    <UPageCard
      v-for="(stat, index) in stats"
      :key="index"
      :icon="stat.icon"
      :title="stat.title"
      to="/retainers"
      variant="subtle"
      :ui="{
        container: 'gap-y-1.5',
        wrapper: 'items-start',
        leading: 'p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25',
        title: 'font-normal text-muted text-xs uppercase'
      }"
      class="lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1"
    >
      <div class="flex items-center gap-2">
        <span class="text-2xl font-semibold text-highlighted">
          {{ stat.value }}
        </span>

        <UBadge
          :color="stat.variation > 0 ? 'success' : 'error'"
          variant="subtle"
          class="text-xs"
        >
          {{ stat.variation > 0 ? '+' : '' }}{{ stat.variation }}%
        </UBadge>
      </div>
    </UPageCard>
  </UPageGrid>
</template>
