<script setup lang="ts">
import { computed, useTemplateRef, ref, watch } from 'vue'
import { eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, format, startOfWeek, startOfMonth } from 'date-fns'
import { VisXYContainer, VisLine, VisAxis, VisArea, VisCrosshair, VisTooltip } from '@unovis/vue'
import { useElementSize } from '@vueuse/core'
import type { Period, Range } from '../../types'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../composables/useAuth'

const cardRef = useTemplateRef<HTMLElement | null>('cardRef')

const props = defineProps<{
  period: Period
  range: Range
}>()

const auth = useAuth()

type DataRecord = {
  date: Date
  amount: number
}

const { width } = useElementSize(cardRef)

const data = ref<DataRecord[]>([])

const RETAINER_STATUSES = [
  'Pending Approval',
  'Retainer Signed',
  'Retainer Signed Pending',
  'Retainer Signed – Payable',
  'Retainer Paid'
]

const resolveLeadVendor = async (): Promise<string | null> => {
  await auth.init()
  const profile = auth.state.value.profile
  if (!profile) return null

  const role = profile.role
  const isAdmin = role === 'admin' || role === 'super_admin'
  if (isAdmin) return null

  if (profile.lead_vendor) return profile.lead_vendor

  if (profile.center_id) {
    const { data: center } = await supabase
      .from('centers')
      .select('lead_vendor')
      .eq('id', profile.center_id)
      .maybeSingle()
    return (center?.lead_vendor as string | null) ?? null
  }

  return '__none__'
}

const fetchChartData = async () => {
  const intervalFn = ({
    daily: eachDayOfInterval,
    weekly: eachWeekOfInterval,
    monthly: eachMonthOfInterval
  } as Record<Period, typeof eachDayOfInterval>)[props.period]

  const dates = intervalFn(props.range)
  const buckets = dates.map(date => ({ date, amount: 0 }))

  try {
    const leadVendor = await resolveLeadVendor()

    if (leadVendor === '__none__') {
      data.value = buckets
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
      data.value = buckets
      return
    }

    const bucketKey = (d: Date): string => {
      if (props.period === 'monthly') return format(startOfMonth(d), 'yyyy-MM-dd')
      if (props.period === 'weekly') return format(startOfWeek(d), 'yyyy-MM-dd')
      return format(d, 'yyyy-MM-dd')
    }

    const countMap = new Map<string, number>()
    buckets.forEach(b => countMap.set(bucketKey(b.date), 0))

    ;(rows ?? []).forEach(r => {
      if (!r.date) return
      const rowDate = new Date(r.date + 'T00:00:00')
      const key = bucketKey(rowDate)
      if (countMap.has(key)) {
        countMap.set(key, (countMap.get(key) ?? 0) + 1)
      }
    })

    data.value = buckets.map(b => ({
      date: b.date,
      amount: countMap.get(bucketKey(b.date)) ?? 0
    }))
  } catch (e) {
    console.warn('Chart data error', e)
    data.value = buckets
  }
}

watch([() => props.period, () => props.range], () => {
  fetchChartData()
}, { immediate: true })

const x = (_: DataRecord, i: number) => i
const y = (d: DataRecord) => d.amount

const total = computed(() => data.value.reduce((acc: number, { amount }) => acc + amount, 0))

const formatDate = (date: Date): string => {
  return ({
    daily: format(date, 'd MMM'),
    weekly: format(date, 'd MMM'),
    monthly: format(date, 'MMM yyy')
  })[props.period]
}

const xTicks = (i: number) => {
  if (i === 0 || i === data.value.length - 1 || !data.value[i]) {
    return ''
  }

  return formatDate(data.value[i].date)
}

const template = (d: DataRecord) => `${formatDate(d.date)}: ${d.amount} retainer${d.amount !== 1 ? 's' : ''}`
</script>

<template>
  <UCard ref="cardRef" :ui="{ root: 'overflow-visible', body: '!px-0 !pt-0 !pb-3' }">
    <template #header>
      <div>
        <p class="text-xs text-muted uppercase mb-1.5">
          Retainers
        </p>
        <p class="text-3xl text-highlighted font-semibold">
          {{ total }}
        </p>
      </div>
    </template>

    <VisXYContainer
      :data="data"
      :padding="{ top: 40 }"
      class="h-96"
      :width="width"
    >
      <VisLine
        :x="x"
        :y="y"
        color="var(--ui-primary)"
      />
      <VisArea
        :x="x"
        :y="y"
        color="var(--ui-primary)"
        :opacity="0.1"
      />

      <VisAxis
        type="x"
        :x="x"
        :tick-format="xTicks"
      />

      <VisCrosshair
        color="var(--ui-primary)"
        :template="template"
      />

      <VisTooltip />
    </VisXYContainer>
  </UCard>
</template>

<style scoped>
.unovis-xy-container {
  --vis-crosshair-line-stroke-color: var(--ui-primary);
  --vis-crosshair-circle-stroke-color: var(--ui-bg);

  --vis-axis-grid-color: var(--ui-border);
  --vis-axis-tick-color: var(--ui-border);
  --vis-axis-tick-label-color: var(--ui-text-dimmed);

  --vis-tooltip-background-color: var(--ui-bg);
  --vis-tooltip-border-color: var(--ui-border);
  --vis-tooltip-text-color: var(--ui-text-highlighted);
}
</style>
