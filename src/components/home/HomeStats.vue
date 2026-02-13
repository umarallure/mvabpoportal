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

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  })
}

const RETAINER_SIGNED_STATUSES = [
  'Retainer Signed',
  'Retainer Signed Pending',
  'Retainer Signed – Payable'
]

const stats = ref<Stat[]>([
  { title: 'Total Transfers', icon: 'i-lucide-arrow-right-left', value: 0, variation: 0 },
  { title: 'Total Retainers', icon: 'i-lucide-briefcase', value: 0, variation: 0 },
  { title: 'Conversions', icon: 'i-lucide-chart-pie', value: 0, variation: 0 },
  { title: 'Total Paid', icon: 'i-lucide-circle-dollar-sign', value: formatCurrency(0), variation: 0 }
])

const resolveLeadVendor = async (): Promise<string | null> => {
  await auth.init()
  const profile = auth.state.value.profile
  if (!profile) return null

  const role = profile.role
  const isAdmin = role === 'admin' || role === 'super_admin'
  if (isAdmin) return null // null means "see all"

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

const fetchStats = async () => {
  try {
    const leadVendor = await resolveLeadVendor()

    const startDate = format(props.range.start, 'yyyy-MM-dd')
    const endDate = format(props.range.end, 'yyyy-MM-dd')

    let query = supabase
      .from('daily_deal_flow')
      .select('id, status, date')
      .gte('date', startDate)
      .lte('date', endDate)

    if (leadVendor === '__none__') {
      stats.value = [
        { title: 'Total Transfers', icon: 'i-lucide-arrow-right-left', value: 0, variation: 0 },
        { title: 'Total Retainers', icon: 'i-lucide-briefcase', value: 0, variation: 0 },
        { title: 'Conversions', icon: 'i-lucide-chart-pie', value: 0, variation: 0 },
        { title: 'Total Paid', icon: 'i-lucide-circle-dollar-sign', value: formatCurrency(0), variation: 0 }
      ]
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

    const allRows = rows ?? []
    const totalTransfers = allRows.length
    const totalRetainers = allRows.filter(r => r.status === 'Pending Approval').length
    const conversions = allRows.filter(r => RETAINER_SIGNED_STATUSES.includes(r.status ?? '')).length
    const totalPaid = conversions * 1500

    stats.value = [
      { title: 'Total Transfers', icon: 'i-lucide-arrow-right-left', value: totalTransfers, variation: 0 },
      { title: 'Total Retainers', icon: 'i-lucide-briefcase', value: totalRetainers, variation: 0 },
      { title: 'Conversions', icon: 'i-lucide-chart-pie', value: conversions, variation: 0 },
      { title: 'Total Paid', icon: 'i-lucide-circle-dollar-sign', value: formatCurrency(totalPaid), variation: 0 }
    ]
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
