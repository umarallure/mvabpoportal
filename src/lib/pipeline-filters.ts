import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  isAfter,
  isBefore,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subWeeks
} from 'date-fns'

export type PipelineDateRange = 'all' | 'today' | 'this_week' | 'last_week' | 'this_month' | 'custom'

export const ALL_FILTER_VALUE = '__ALL__'

export const PIPELINE_DATE_RANGE_OPTIONS: { label: string; value: PipelineDateRange }[] = [
  { label: 'All Time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'this_week' },
  { label: 'Last Week', value: 'last_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Custom', value: 'custom' }
]

const STATE_FIELDS = ['state', 'client_state', 'insured_state', 'state_code', 'accident_state', 'residence_state', 'province']

const titleCase = (value: string) => {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export const normalizeStateValue = (value: string | null | undefined) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toUpperCase()
  return titleCase(trimmed)
}

export const resolvePipelineState = (record: Record<string, unknown>) => {
  for (const field of STATE_FIELDS) {
    const value = record[field]
    if (typeof value === 'string' && value.trim()) {
      return normalizeStateValue(value)
    }
  }

  return ''
}

export const resolvePipelineSourceType = (record: Record<string, unknown>) => {
  const raw = String(record.source_type || '').trim().toLowerCase()
  if (raw) return raw

  if (Boolean(record.from_callback) || Boolean(record.is_callback)) {
    return 'callback'
  }

  return 'zapier'
}

export const formatSourceTypeLabel = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase()

  if (!normalized) return 'Unknown'
  if (normalized === 'zapier' || normalized === 'api') return 'API / Zapier'
  if (normalized === 'callback') return 'Callback'

  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const parseDateInput = (value: string | null | undefined) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return null

  const parsed = parseISO(trimmed)
  if (isValid(parsed)) return parsed

  const fallback = new Date(trimmed)
  return isValid(fallback) ? fallback : null
}

export const matchesPipelineDateRange = (
  value: string | null | undefined,
  range: PipelineDateRange,
  customStartDate = '',
  customEndDate = ''
) => {
  if (range === 'all') return true

  const date = parseDateInput(value)
  if (!date) return false

  const now = new Date()

  if (range === 'today') {
    return !isBefore(date, startOfDay(now)) && !isAfter(date, endOfDay(now))
  }

  if (range === 'this_week') {
    const start = startOfWeek(now, { weekStartsOn: 1 })
    const end = endOfWeek(now, { weekStartsOn: 1 })
    return !isBefore(date, start) && !isAfter(date, end)
  }

  if (range === 'last_week') {
    const lastWeek = subWeeks(now, 1)
    const start = startOfWeek(lastWeek, { weekStartsOn: 1 })
    const end = endOfWeek(lastWeek, { weekStartsOn: 1 })
    return !isBefore(date, start) && !isAfter(date, end)
  }

  if (range === 'this_month') {
    const start = startOfMonth(now)
    const end = endOfMonth(now)
    return !isBefore(date, start) && !isAfter(date, end)
  }

  if (range === 'custom') {
    const start = parseDateInput(customStartDate)
    const end = parseDateInput(customEndDate)

    if (!start && !end) return true

    if (start && isBefore(date, startOfDay(start))) return false
    if (end && isAfter(date, endOfDay(end))) return false

    return true
  }

  return true
}
