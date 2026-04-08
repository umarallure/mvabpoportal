<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useNotifications } from '../composables/useNotifications'
import { getNotificationMessage, getNotificationMeta, notificationCategoryOrder } from '../lib/notifications'
import type { AppNotification, NotificationCategory } from '../types'
import NotificationItem from '../components/notifications/NotificationItem.vue'

type NotificationFilter = 'all' | 'unread' | NotificationCategory

type FilterOption = {
  value: NotificationFilter
  label: string
  count: number
  accent: string
  icon: string
}

const router = useRouter()
const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()

const activeFilter = ref<NotificationFilter>('all')
const searchQuery = ref('')

const filterOptions = computed<FilterOption[]>(() => {
  const categoryOptions = notificationCategoryOrder.reduce<FilterOption[]>((items, category) => {
    const count = notifications.value.filter(notification => notification.category === category).length
    if (!count) return items

    const meta = getNotificationMeta(category)

    items.push({
      value: category,
      label: meta.label,
      count,
      accent: meta.accent,
      icon: meta.icon
    })

    return items
  }, [])

  return [
    {
      value: 'all',
      label: 'All',
      count: notifications.value.length,
      accent: 'var(--dashboard-accent-primary)',
      icon: 'i-lucide-layout-list'
    },
    {
      value: 'unread',
      label: 'Unread',
      count: unreadCount.value,
      accent: 'var(--dashboard-accent-red)',
      icon: 'i-lucide-bell-ring'
    },
    ...categoryOptions
  ]
})

const activeFilterMeta = computed(() => filterOptions.value.find(option => option.value === activeFilter.value) ?? filterOptions.value[0])

const normalizedQuery = computed(() => searchQuery.value.trim().toLowerCase())

const filteredNotifications = computed(() => {
  if (activeFilter.value === 'all') return notifications.value
  if (activeFilter.value === 'unread') return notifications.value.filter(notification => !notification.is_read)
  return notifications.value.filter(notification => notification.category === activeFilter.value)
})

const visibleNotifications = computed(() => {
  if (!normalizedQuery.value) return filteredNotifications.value

  return filteredNotifications.value.filter((notification) => {
    const meta = getNotificationMeta(notification.category)
    const message = getNotificationMessage(notification)
    const haystack = [
      notification.title,
      notification.description ?? '',
      message,
      meta.label
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalizedQuery.value)
  })
})

const resultSummary = computed(() => {
  const total = visibleNotifications.value.length
  const noun = total === 1 ? 'notification' : 'notifications'
  const inFilter = activeFilterMeta.value.label === 'All' ? '' : ` in ${activeFilterMeta.value.label}`

  if (normalizedQuery.value) {
    return `${total} ${noun}${inFilter} matching "${searchQuery.value.trim()}"`
  }

  return `${total} ${noun}${inFilter}`
})

const handleClick = async (notification: AppNotification) => {
  if (!notification.is_read) await markAsRead(notification.id)
  if (notification.redirect_url) router.push(notification.redirect_url)
}
</script>

<template>
  <UDashboardPanel id="notifications">
    <template #header>
      <UDashboardNavbar title="Notifications">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            v-if="unreadCount > 0"
            color="neutral"
            variant="outline"
            size="sm"
            @click="markAllAsRead"
          >
            Mark all as read
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-6xl py-5">
        <div class="notifications-layout">
          <aside class="notifications-sidebar">
            <section class="notifications-sidebar-card">
              <div class="notifications-sidebar-card__eyebrow">Notification Center</div>
              <h1 class="notifications-sidebar-card__title">All notifications</h1>
              <p class="notifications-sidebar-card__copy">
                Keep up with new leads, status updates, assignments, and note activity.
              </p>

              <div class="notifications-sidebar-card__stats">
                <div class="notifications-sidebar-card__stat">
                  <span class="notifications-sidebar-card__stat-label">Total</span>
                  <strong class="notifications-sidebar-card__stat-value">{{ notifications.length }}</strong>
                </div>
                <div class="notifications-sidebar-card__stat">
                  <span class="notifications-sidebar-card__stat-label">Unread</span>
                  <strong class="notifications-sidebar-card__stat-value">{{ unreadCount }}</strong>
                </div>
              </div>
            </section>

            <section class="notifications-sidebar-card">
              <div class="notifications-sidebar-card__section-title">Filters</div>

              <div class="notifications-filter-list">
                <button
                  v-for="option in filterOptions"
                  :key="option.value"
                  type="button"
                  class="notifications-filter-item"
                  :class="{ 'notifications-filter-item--active': activeFilter === option.value }"
                  :style="{ '--filter-accent': option.accent }"
                  @click="activeFilter = option.value"
                >
                  <span class="notifications-filter-item__left">
                    <span class="notifications-filter-item__icon">
                      <UIcon :name="option.icon" class="h-4 w-4" />
                    </span>
                    <span class="notifications-filter-item__label">{{ option.label }}</span>
                  </span>
                  <span class="notifications-filter-item__count">{{ option.count }}</span>
                </button>
              </div>
            </section>
          </aside>

          <section class="notifications-feed-card">
            <div class="notifications-feed-card__toolbar">
              <UInput
                v-model="searchQuery"
                icon="i-lucide-search"
                placeholder="Search notifications..."
                class="notifications-feed-card__search"
              />

              <UButton
                v-if="searchQuery"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="searchQuery = ''"
              >
                Clear
              </UButton>
            </div>

            <div class="notifications-feed-card__header">
              <div>
                <div class="notifications-feed-card__eyebrow">{{ activeFilterMeta.label }}</div>
                <p class="notifications-feed-card__summary">{{ resultSummary }}</p>
              </div>

              <span class="notifications-feed-card__chip">
                {{ activeFilterMeta.label }}
              </span>
            </div>

            <div v-if="visibleNotifications.length === 0" class="notifications-empty">
              <div class="notifications-empty__icon">
                <UIcon name="i-lucide-bell-off" class="h-4 w-4" />
              </div>
              <p class="notifications-empty__title">No notifications found</p>
              <p class="notifications-empty__copy">
                Try another filter or refine your search to find the notification you need.
              </p>
            </div>

            <div v-else class="notifications-list">
              <NotificationItem
                v-for="notification in visibleNotifications"
                :key="notification.id"
                :notification="notification"
                @select="handleClick"
              />
            </div>
          </section>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.notifications-layout {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: minmax(15rem, 18rem) minmax(0, 1fr);
}

.notifications-sidebar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.notifications-sidebar-card,
.notifications-feed-card {
  border: 1px solid var(--dashboard-surface-border);
  border-radius: 1.25rem;
  background: var(--dashboard-surface);
  box-shadow: var(--dashboard-surface-shadow);
}

.notifications-sidebar-card {
  padding: 1rem;
}

.notifications-sidebar-card:first-child {
  position: sticky;
  top: 1rem;
}

.notifications-sidebar-card__eyebrow,
.notifications-feed-card__eyebrow {
  color: var(--dashboard-accent-primary);
  font-size: 0.73rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.notifications-sidebar-card__title {
  color: var(--dashboard-text-primary);
  font-size: 1.1rem;
  font-weight: 700;
  margin-top: 0.45rem;
}

.notifications-sidebar-card__copy,
.notifications-feed-card__summary {
  color: var(--dashboard-text-muted);
  font-size: 0.84rem;
  line-height: 1.6;
  margin-top: 0.45rem;
}

.notifications-sidebar-card__stats {
  display: grid;
  gap: 0.7rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1rem;
}

.notifications-sidebar-card__stat {
  border: 1px solid var(--dashboard-surface-border);
  border-radius: 1rem;
  padding: 0.85rem 0.9rem;
}

.notifications-sidebar-card__stat-label,
.notifications-sidebar-card__section-title {
  color: var(--dashboard-text-muted);
  font-size: 0.73rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.notifications-sidebar-card__stat-value {
  color: var(--dashboard-text-primary);
  display: block;
  font-size: 1.15rem;
  line-height: 1.1;
  margin-top: 0.45rem;
}

.notifications-sidebar-card__section-title {
  margin-bottom: 0.8rem;
}

.notifications-filter-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.notifications-filter-item {
  align-items: center;
  border: 1px solid transparent;
  border-radius: 1rem;
  background: transparent;
  color: var(--dashboard-text-secondary);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.8rem;
  text-align: left;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.notifications-filter-item:hover {
  background: color-mix(in srgb, var(--dashboard-surface) 84%, white);
  border-color: var(--dashboard-surface-border);
  transform: translateY(-1px);
}

.notifications-filter-item--active {
  border-color: color-mix(in srgb, var(--filter-accent) 28%, var(--dashboard-surface-border));
  background: color-mix(in srgb, var(--filter-accent) 10%, transparent);
  color: var(--dashboard-text-primary);
}

.notifications-filter-item__left {
  align-items: center;
  display: flex;
  gap: 0.7rem;
  min-width: 0;
}

.notifications-filter-item__icon {
  align-items: center;
  background: color-mix(in srgb, var(--filter-accent) 12%, transparent);
  border-radius: 0.8rem;
  color: var(--filter-accent);
  display: inline-flex;
  flex: none;
  height: 2rem;
  justify-content: center;
  width: 2rem;
}

.notifications-filter-item__label {
  font-size: 0.84rem;
  font-weight: 600;
}

.notifications-filter-item__count,
.notifications-feed-card__chip {
  align-items: center;
  border-radius: 999px;
  display: inline-flex;
  font-size: 0.78rem;
  font-weight: 600;
  justify-content: center;
  line-height: 1;
}

.notifications-filter-item__count {
  border: 1px solid var(--dashboard-surface-border);
  color: var(--dashboard-text-primary);
  min-width: 2rem;
  padding: 0.35rem 0.55rem;
}

.notifications-feed-card {
  min-width: 0;
  padding: 1rem;
}

.notifications-feed-card__toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.notifications-feed-card__search {
  flex: 1;
}

.notifications-feed-card__header {
  align-items: center;
  border-bottom: 1px solid var(--dashboard-divider);
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  margin-top: 1rem;
  padding-bottom: 1rem;
}

.notifications-feed-card__chip {
  border: 1px solid var(--dashboard-surface-border);
  color: var(--dashboard-text-primary);
  padding: 0.45rem 0.7rem;
}

.notifications-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-top: 1rem;
}

.notifications-empty {
  border: 1px dashed var(--dashboard-surface-border-strong);
  border-radius: 1.25rem;
  margin-top: 1rem;
  padding: 2.25rem 1rem;
  text-align: center;
}

.notifications-empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2rem;
  width: 2rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dashboard-accent-primary) 10%, transparent);
  color: var(--dashboard-accent-primary);
}

.notifications-empty__title {
  color: var(--dashboard-text-primary);
  font-size: 0.92rem;
  font-weight: 600;
  margin-top: 0.8rem;
}

.notifications-empty__copy {
  color: var(--dashboard-text-muted);
  font-size: 0.82rem;
  line-height: 1.6;
  margin-top: 0.35rem;
}

@media (max-width: 640px) {
  .notifications-feed-card__toolbar,
  .notifications-feed-card__header {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (max-width: 960px) {
  .notifications-layout {
    grid-template-columns: 1fr;
  }

  .notifications-sidebar-card:first-child {
    position: static;
  }

  .notifications-sidebar-card__stats {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 640px) {
  .notifications-sidebar-card__stats {
    grid-template-columns: 1fr;
  }

  .notifications-filter-item {
    flex-direction: column;
    align-items: stretch;
  }

  .notifications-filter-item__count {
    align-self: flex-start;
  }
}
</style>
