import { eachDayOfInterval, eachMonthOfInterval, eachWeekOfInterval } from 'date-fns'
import type { Period, Range, Stat } from '../types'

export type DashboardMockScenario = 'balanced' | 'surge' | 'decline' | 'empty'

type QueryValue = string | null | undefined
type QueryArrayValue = QueryValue[]
type QueryLikeValue = QueryValue | QueryArrayValue
type QueryMap = Record<string, QueryLikeValue>

type MockTrendPoint = {
  date: Date
  amount: number
}

const DEFAULT_SCENARIO: DashboardMockScenario = 'balanced'

const MOCK_STATS: Record<DashboardMockScenario, Stat[]> = {
  balanced: [
    { title: 'Total BPO Transfers', icon: 'i-lucide-arrow-right-left', value: 128, variation: 12 },
    { title: 'Qualified', icon: 'i-lucide-badge-check', value: 84, variation: 18 },
    { title: 'Not Qualified', icon: 'i-lucide-circle-x', value: 26, variation: -6 },
    { title: 'No Coverage', icon: 'i-lucide-shield-x', value: 11, variation: -3 },
    { title: 'Submitted to Attorney', icon: 'i-lucide-send', value: 49, variation: 14 },
    { title: 'Approved Attorney', icon: 'i-lucide-scale', value: 22, variation: 9 }
  ],
  surge: [
    { title: 'Total BPO Transfers', icon: 'i-lucide-arrow-right-left', value: 214, variation: 31 },
    { title: 'Qualified', icon: 'i-lucide-badge-check', value: 146, variation: 27 },
    { title: 'Not Qualified', icon: 'i-lucide-circle-x', value: 24, variation: -9 },
    { title: 'No Coverage', icon: 'i-lucide-shield-x', value: 6, variation: -18 },
    { title: 'Submitted to Attorney', icon: 'i-lucide-send', value: 98, variation: 33 },
    { title: 'Approved Attorney', icon: 'i-lucide-scale', value: 41, variation: 21 }
  ],
  decline: [
    { title: 'Total BPO Transfers', icon: 'i-lucide-arrow-right-left', value: 97, variation: -18 },
    { title: 'Qualified', icon: 'i-lucide-badge-check', value: 44, variation: -14 },
    { title: 'Not Qualified', icon: 'i-lucide-circle-x', value: 31, variation: 6 },
    { title: 'No Coverage', icon: 'i-lucide-shield-x', value: 14, variation: 9 },
    { title: 'Submitted to Attorney', icon: 'i-lucide-send', value: 24, variation: -21 },
    { title: 'Approved Attorney', icon: 'i-lucide-scale', value: 8, variation: -27 }
  ],
  empty: [
    { title: 'Total BPO Transfers', icon: 'i-lucide-arrow-right-left', value: 0, variation: 0 },
    { title: 'Qualified', icon: 'i-lucide-badge-check', value: 0, variation: 0 },
    { title: 'Not Qualified', icon: 'i-lucide-circle-x', value: 0, variation: 0 },
    { title: 'No Coverage', icon: 'i-lucide-shield-x', value: 0, variation: 0 },
    { title: 'Submitted to Attorney', icon: 'i-lucide-send', value: 0, variation: 0 },
    { title: 'Approved Attorney', icon: 'i-lucide-scale', value: 0, variation: 0 }
  ]
}

const MOCK_TREND_ANCHORS: Record<DashboardMockScenario, number[]> = {
  balanced: [4, 3, 5, 6, 7, 5],
  surge: [2, 4, 7, 9, 12, 8],
  decline: [9, 8, 7, 5, 3, 1],
  empty: [0, 0, 0, 0, 0, 0]
}

const getFirst = (value: QueryLikeValue) => {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

const isScenario = (value: string | null | undefined): value is DashboardMockScenario =>
  value === 'balanced' || value === 'surge' || value === 'decline' || value === 'empty'

const getIntervalDates = (period: Period, range: Range): Date[] => {
  if (period === 'weekly') return eachWeekOfInterval(range)
  if (period === 'monthly') return eachMonthOfInterval(range)
  return eachDayOfInterval(range)
}

const interpolateSeries = (length: number, anchors: number[]): number[] => {
  if (length <= 0) return []
  if (length === 1) return [anchors[anchors.length - 1] ?? 0]

  return Array.from({ length }, (_, index) => {
    const progress = (index / (length - 1)) * (anchors.length - 1)
    const lowerIndex = Math.floor(progress)
    const upperIndex = Math.min(anchors.length - 1, Math.ceil(progress))
    const lower = anchors[lowerIndex] ?? 0
    const upper = anchors[upperIndex] ?? lower
    const offset = progress - lowerIndex
    return Math.round(lower + (upper - lower) * offset)
  })
}

export const resolveDashboardMockSettings = (query: QueryMap = {}) => {
  const envEnabled = import.meta.env.VITE_DASHBOARD_MOCKS === 'true'
  const queryEnabled = ['1', 'true', 'yes'].includes((getFirst(query.dashboardMock) ?? '').toLowerCase())
  const rawScenario = getFirst(query.dashboardScenario) ?? import.meta.env.VITE_DASHBOARD_SCENARIO ?? DEFAULT_SCENARIO

  return {
    enabled: envEnabled || (import.meta.env.DEV && queryEnabled),
    scenario: isScenario(rawScenario) ? rawScenario : DEFAULT_SCENARIO
  }
}

export const buildDashboardMockStats = (scenario: DashboardMockScenario): Stat[] =>
  MOCK_STATS[scenario].map(stat => ({ ...stat }))

export const buildDashboardMockTrend = (
  period: Period,
  range: Range,
  scenario: DashboardMockScenario
): MockTrendPoint[] => {
  const dates = getIntervalDates(period, range)
  const values = interpolateSeries(dates.length, MOCK_TREND_ANCHORS[scenario])

  return dates.map((date, index) => ({
    date,
    amount: values[index] ?? 0
  }))
}
