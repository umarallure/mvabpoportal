import type { AppNotification, NotificationCategory } from '../types'

export type NotificationMeta = {
  label: string
  icon: string
  accent: string
  iconBg: string
}

const LEAD_NAME_REGEX = /"([^"]+)"/
const STAGE_CHANGE_REGEX = /moved from "([^"]*)" to "([^"]*)"/i

const FALLBACK_PREVIEW: Record<NotificationCategory, string> = {
  new_lead: 'A new lead is ready for review.',
  lead_assigned: 'This lead has been assigned to a teammate.',
  stage_updated: 'This lead moved to a new status.',
  pipeline_changed: 'This lead moved to a different pipeline.',
  note_added: 'A new note was added to this lead.'
}

const META: Record<NotificationCategory, NotificationMeta> = {
  new_lead: {
    label: 'New Lead',
    icon: 'i-lucide-sparkles',
    accent: 'var(--dashboard-accent-orange)',
    iconBg: 'color-mix(in srgb, var(--dashboard-accent-orange) 12%, transparent)'
  },
  lead_assigned: {
    label: 'Lead Assigned',
    icon: 'i-lucide-user-plus',
    accent: 'var(--dashboard-accent-green)',
    iconBg: 'color-mix(in srgb, var(--dashboard-accent-green) 12%, transparent)'
  },
  stage_updated: {
    label: 'Status Updated',
    icon: 'i-lucide-trending-up',
    accent: 'var(--dashboard-accent-blue)',
    iconBg: 'color-mix(in srgb, var(--dashboard-accent-blue) 12%, transparent)'
  },
  pipeline_changed: {
    label: 'Pipeline Changed',
    icon: 'i-lucide-arrow-left-right',
    accent: 'var(--dashboard-accent-amber)',
    iconBg: 'color-mix(in srgb, var(--dashboard-accent-amber) 12%, transparent)'
  },
  note_added: {
    label: 'Note Added',
    icon: 'i-lucide-message-square',
    accent: 'var(--dashboard-text-secondary)',
    iconBg: 'color-mix(in srgb, var(--dashboard-text-secondary) 10%, transparent)'
  }
}

const normalize = (value: string | null | undefined) => {
  const text = value?.trim() ?? ''
  return text.length ? text : null
}

const toLabel = (value: string | null | undefined) => {
  const text = normalize(value)
  if (!text) return null

  return text
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export const notificationCategoryOrder: NotificationCategory[] = [
  'new_lead',
  'lead_assigned',
  'stage_updated',
  'note_added',
  'pipeline_changed'
]

export const getNotificationMeta = (category: NotificationCategory) => META[category] ?? META.note_added

export const getNotificationPreview = (notification: Pick<AppNotification, 'category' | 'description'>) => {
  return normalize(notification.description) ?? FALLBACK_PREVIEW[notification.category]
}

export const getNotificationLeadName = (notification: Pick<AppNotification, 'title' | 'description'>) => {
  const source = normalize(notification.description) ?? normalize(notification.title)
  const match = source?.match(LEAD_NAME_REGEX)
  return normalize(match?.[1])
}

export const getNotificationStageChange = (
  notification: Pick<AppNotification, 'category' | 'description'>
) => {
  if (notification.category !== 'stage_updated') return null

  const preview = getNotificationPreview(notification)
  const match = preview.match(STAGE_CHANGE_REGEX)

  if (!match) return null

  return {
    from: toLabel(match[1]),
    to: toLabel(match[2])
  }
}

export const getNotificationMessage = (
  notification: Pick<AppNotification, 'category' | 'title' | 'description'>
) => {
  const leadName = getNotificationLeadName(notification)
  const stageChange = getNotificationStageChange(notification)

  if (notification.category === 'stage_updated' && stageChange) {
    const subject = leadName ? `${leadName} moved` : 'This lead moved'
    return `${subject} from ${stageChange.from ?? 'None'} to ${stageChange.to ?? 'None'}.`
  }

  if (notification.category === 'new_lead' && leadName) {
    return `${leadName} was submitted and is ready for review.`
  }

  if (notification.category === 'lead_assigned' && leadName) {
    return `${leadName} was assigned to an attorney.`
  }

  if (notification.category === 'note_added' && leadName) {
    return `A new note was added to ${leadName}.`
  }

  if (notification.category === 'pipeline_changed' && leadName) {
    return `${leadName} moved to a different pipeline.`
  }

  return getNotificationPreview(notification)
}
