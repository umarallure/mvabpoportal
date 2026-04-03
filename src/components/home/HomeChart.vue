<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { eachDayOfInterval, eachMonthOfInterval, eachWeekOfInterval, format, startOfMonth, startOfWeek } from 'date-fns'
import { useRoute } from 'vue-router'
import type { Period, Range } from '../../types'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../composables/useAuth'
import AnalyticsTrendCard from '../dashboard/AnalyticsTrendCard.vue'
import type { AnalyticsTrendPoint } from '../dashboard/AnalyticsTrendCard.vue'
import { buildDashboardMockTrend, resolveDashboardMockSettings } from '../../lib/dashboard-mocks'

const props = defineProps<{
  period: Period
  range: Range
}>()

const auth = useAuth()
const route = useRoute()

type DataRecord = {
  date: Date
  amount: number
}

const data = ref<DataRecord[]>([])
const isLoading = ref(false)

const RETAINER_STATUSES = [
  'Pending Approval',
  'Retainer Signed',
  'Retainer Signed Pending',
  'Retainer Signed - Payable',
  'Retainer Paid'
]

const fetchChartData = async () => {
  const intervalFn = ({
    daily: eachDayOfInterval,
    weekly: eachWeekOfInterval,
    monthly: eachMonthOfInterval
  } as Record<Period, typeof eachDayOfInterval>)[props.period]

  const dates = intervalFn(props.range)
  const buckets = dates.map(date => ({ date, amount: 0 }))

  isLoading.value = true
  data.value = buckets

  try {
    const mockSettings = resolveDashboardMockSettings(route.query)
    if (mockSettings.enabled) {
      data.value = buildDashboardMockTrend(props.period, props.range, mockSettings.scenario)
      return
    }

    await auth.init()
    const leadVendor = auth.resolvedLeadVendor.value
    const hasAccess = auth.canSeeAll.value || Boolean(auth.state.value.centerContext?.id)

    if (!hasAccess) {
      return
    }

    const startDate = format(props.range.start, 'yyyy-MM-dd')
    const endDate = format(props.range.end, 'yyyy-MM-dd')

    let query = supabase
      .from('daily_deal_flow')
      .select('date, status')
      .in('status', RETAINER_STATUSES)
      .gte('date', startDate)
      .lte('date', endDate)

    if (leadVendor) {
      query = query.eq('lead_vendor', leadVendor)
    }

    const { data: rows, error } = await query

    if (error) {
      console.warn('Failed to fetch chart data', error)
      return
    }

    const bucketKey = (date: Date): string => {
      if (props.period === 'monthly') return format(startOfMonth(date), 'yyyy-MM-dd')
      if (props.period === 'weekly') return format(startOfWeek(date), 'yyyy-MM-dd')
      return format(date, 'yyyy-MM-dd')
    }

    const countMap = new Map<string, number>()
    buckets.forEach(bucket => countMap.set(bucketKey(bucket.date), 0))

    ;(rows ?? []).forEach((row) => {
      if (!row.date) return
      const rowDate = new Date(`${row.date}T00:00:00`)
      const key = bucketKey(rowDate)
      if (!countMap.has(key)) return
      countMap.set(key, (countMap.get(key) ?? 0) + 1)
    })

    data.value = buckets.map(bucket => ({
      date: bucket.date,
      amount: countMap.get(bucketKey(bucket.date)) ?? 0
    }))
  } catch (error) {
    console.warn('Chart data error', error)
    data.value = buckets
  } finally {
    isLoading.value = false
  }
}

watch([() => props.period, () => props.range, () => route.fullPath], () => {
  fetchChartData()
}, { immediate: true })

const growth = computed(() => {
  const latestIndex = data.value.length - 1
  const previousIndex = data.value.length - 2
  const current = latestIndex >= 0 ? data.value[latestIndex]?.amount ?? 0 : 0
  const previous = previousIndex >= 0 ? data.value[previousIndex]?.amount ?? 0 : 0

  if (previous === 0 && current > 0) return 100
  if (previous === 0 && current === 0) return 0
  return Math.round(((current - previous) / previous) * 100)
})

const formatDate = (date: Date): string => ({
  daily: format(date, 'd MMM'),
  weekly: format(date, 'd MMM'),
  monthly: format(date, 'MMM yyyy')
}[props.period])

const subtitle = computed(() =>
  `${props.period.charAt(0).toUpperCase()}${props.period.slice(1)} range: ${format(props.range.start, 'd MMM')} to ${format(props.range.end, 'd MMM')}`
)

const growthLabel = computed(() => ({
  daily: 'vs previous day',
  weekly: 'vs previous week',
  monthly: 'vs last month'
}[props.period]))

const chartPoints = computed<AnalyticsTrendPoint[]>(() => data.value.map((record) => ({
  key: record.date.toISOString(),
  label: formatDate(record.date),
  shortLabel: formatDate(record.date),
  value: record.amount,
  count: record.amount,
  summary: `${record.amount} ${record.amount === 1 ? 'retainer' : 'retainers'}`,
  emptyLabel: 'No data yet'
})))

const summaryPoints = computed(() => chartPoints.value.slice(-6))

const tooltipFormatter = (point: AnalyticsTrendPoint) => {
  if (point.value === 0) return `${point.label}: No data yet`
  return `${point.label}: ${point.value} retainer${point.value === 1 ? '' : 's'}`
}

const countFormatter = (count: number) => `${count} ${count === 1 ? 'retainer' : 'retainers'}`
</script>

<template>
  <AnalyticsTrendCard
    title="Retainers Trend"
    :subtitle="subtitle"
    icon="i-lucide-bar-chart"
    accent="var(--dashboard-accent-primary)"
    compact
    :chart-min-height="420"
    :loading="isLoading"
    :points="chartPoints"
    :summary-points="summaryPoints"
    :growth="growth"
    :growth-label="growthLabel"
    :count-formatter="countFormatter"
    :tooltip-formatter="tooltipFormatter"
  />
</template>
