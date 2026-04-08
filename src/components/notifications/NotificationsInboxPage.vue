<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNotifications } from '../../composables/useNotifications'
import { getNotificationMessage, getNotificationMeta, notificationCategoryOrder } from '../../lib/notifications'
import type { AppNotification, NotificationCategory } from '../../types'
import NotificationItem from './NotificationItem.vue'

type NotificationFilter = 'all' | 'unread' | NotificationCategory

type FilterOption = {
  value: NotificationFilter
  label: string
  count: number
  accent: string
  icon: string
}

const router = useRouter()
const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications()

const PAGE_SIZE = 10

const activeFilter = ref<NotificationFilter>('all')
const searchQuery = ref('')
const currentPage = ref(1)

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

const getFilterButtonStyle = (option: FilterOption) => {
  if (activeFilter.value !== option.value) return undefined

  return {
    borderColor: `color-mix(in srgb, ${option.accent} 42%, transparent)`,
    background: `color-mix(in srgb, ${option.accent} 14%, transparent)`,
    color: option.accent
  }
}

const getFilterCountStyle = (option: FilterOption) => {
  if (activeFilter.value !== option.value) return undefined

  return {
    background: `color-mix(in srgb, ${option.accent} 20%, transparent)`,
    color: option.accent
  }
}

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

const pageCount = computed(() => {
  return Math.max(1, Math.ceil(visibleNotifications.value.length / PAGE_SIZE))
})

const paginatedNotifications = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return visibleNotifications.value.slice(start, start + PAGE_SIZE)
})

const showingStart = computed(() => {
  if (!visibleNotifications.value.length) return 0
  return (currentPage.value - 1) * PAGE_SIZE + 1
})

const showingEnd = computed(() => {
  if (!visibleNotifications.value.length) return 0
  return Math.min(currentPage.value * PAGE_SIZE, visibleNotifications.value.length)
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

watch([activeFilter, normalizedQuery], () => {
  currentPage.value = 1
})

watch(pageCount, (nextPageCount) => {
  if (currentPage.value > nextPageCount) {
    currentPage.value = nextPageCount
  }
})

const handleClick = async (notification: AppNotification) => {
  if (!notification.is_read) await markAsRead(notification.id)
  if (notification.redirect_url) router.push(notification.redirect_url)
}

const handleDelete = async (notification: AppNotification) => {
  await deleteNotification(notification.id)
}

const handleMarkRead = async (notification: AppNotification) => {
  await markAsRead(notification.id)
}
</script>

<template>
  <UDashboardPanel id="inbox">
    <template #header>
      <UDashboardNavbar title="Inbox">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="w-full space-y-4 py-5">
        <div class="ap-fade-in ap-delay-1 space-y-3">
          <div class="notifications-searchbar flex items-center gap-2">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              placeholder="Search notifications..."
              size="sm"
              class="w-full sm:max-w-sm md:max-w-4xl"
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

          <div class="flex flex-wrap items-center gap-1.5">
            <button
              v-for="option in filterOptions"
              :key="option.value"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all"
              :style="getFilterButtonStyle(option)"
              :class="activeFilter === option.value
                ? ''
                : 'border-transparent text-muted hover:bg-white/[0.04]'"
              @click="activeFilter = option.value"
            >
              <UIcon :name="option.icon" class="size-3" />
              {{ option.label }}
              <span
                class="rounded-full px-1.5 py-px text-[10px] font-semibold"
                :style="getFilterCountStyle(option)"
                :class="activeFilter === option.value
                  ? ''
                  : 'bg-white/[0.06] text-muted'"
              >{{ option.count }}</span>
            </button>
          </div>
        </div>

        <div class="notifications-summary ap-fade-in ap-delay-2 flex items-center justify-between gap-3 px-1">
          <p class="text-[11px] text-muted">{{ resultSummary }}</p>
          <UButton
            v-if="unreadCount > 0"
            color="neutral"
            variant="outline"
            size="xs"
            class="notifications-summary__action"
            @click="markAllAsRead"
          >
            Mark all as read
          </UButton>
        </div>

        <div class="notifications-feed ap-fade-in ap-delay-2 relative overflow-hidden rounded-xl">
          <div v-if="visibleNotifications.length === 0" class="relative flex flex-col items-center gap-3 py-16 text-center">
            <div class="notifications-feed__empty-icon flex h-12 w-12 items-center justify-center rounded-xl">
              <UIcon name="i-lucide-bell-off" class="size-5" />
            </div>
            <div>
              <p class="text-sm font-medium text-highlighted">No notifications found</p>
              <p class="mt-0.5 text-xs text-muted">Try another filter or refine your search.</p>
            </div>
          </div>

          <div v-else class="relative">
            <template v-for="(notification, idx) in paginatedNotifications" :key="notification.id">
              <div
                v-if="idx > 0"
                class="notifications-feed__separator mx-auto h-px w-[85%]"
              />
              <NotificationItem
                :notification="notification"
                :index="idx"
                @select="handleClick"
                @delete="handleDelete"
                @mark-read="handleMarkRead"
              />
            </template>
          </div>

          <div v-if="visibleNotifications.length > 0" class="notifications-feed__footer">
            <span class="notifications-feed__footer-summary">
              Showing {{ showingStart }}-{{ showingEnd }} of {{ visibleNotifications.length }}
            </span>

            <div class="flex items-center gap-1.5">
              <button
                type="button"
                class="notifications-feed__page-btn"
                :disabled="currentPage <= 1"
                aria-label="Previous page"
                @click="currentPage = Math.max(1, currentPage - 1)"
              >
                <UIcon name="i-lucide-chevron-left" class="size-3.5" />
                <span>Prev</span>
              </button>

              <span class="notifications-feed__page-pill">
                {{ currentPage }} / {{ pageCount }}
              </span>

              <button
                type="button"
                class="notifications-feed__page-btn"
                :disabled="currentPage >= pageCount"
                aria-label="Next page"
                @click="currentPage = Math.min(pageCount, currentPage + 1)"
              >
                <span>Next</span>
                <UIcon name="i-lucide-chevron-right" class="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.notifications-feed {
  background: rgba(18, 14, 14, 0.82);
  box-shadow: 0 24px 56px -32px rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(18px) saturate(125%);
  -webkit-backdrop-filter: blur(18px) saturate(125%);
}

.notifications-feed::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: rgba(255, 255, 255, 0.015);
}

.notifications-feed > * {
  position: relative;
  z-index: 1;
}

.notifications-feed__separator {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 244, 236, 0.08) 18%,
    rgba(255, 244, 236, 0.26) 50%,
    rgba(255, 244, 236, 0.08) 82%,
    transparent 100%
  );
}

.notifications-feed__empty-icon {
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 245, 238, 0.82);
}

.notifications-feed__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1.1rem 1rem;
}

.notifications-feed__footer-summary {
  color: rgba(255, 233, 221, 0.68);
  font-size: 0.72rem;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.notifications-feed__page-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.75rem;
  border-radius: 0.7rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 241, 232, 0.8);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease, opacity 160ms ease;
}

.notifications-feed__page-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.14);
  color: rgba(255, 248, 243, 0.96);
}

.notifications-feed__page-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.notifications-feed__page-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 3.5rem;
  padding: 0.45rem 0.7rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 248, 243, 0.88);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.notifications-summary__action {
  transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
}

.notifications-summary__action:hover,
.notifications-summary :deep(.notifications-summary__action:hover) {
  background: var(--dashboard-accent-primary) !important;
  border-color: var(--dashboard-accent-primary) !important;
  color: #fff7ef !important;
}

.notifications-summary__action:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dashboard-accent-primary) 24%, transparent);
}

.notifications-feed :deep(.text-highlighted) {
  color: rgba(255, 248, 243, 0.96);
}

.notifications-feed :deep(.text-muted) {
  color: rgba(255, 233, 221, 0.7);
}

.notifications-feed :deep(time) {
  color: rgba(255, 233, 221, 0.58);
}

@media (max-width: 640px) {
  .notifications-searchbar {
    align-items: stretch;
  }

  .notifications-summary {
    flex-direction: column;
    align-items: stretch;
  }

  .notifications-summary__action {
    width: 100%;
  }

  .notifications-feed__footer {
    flex-direction: column;
    align-items: stretch;
  }

  .notifications-feed__footer-summary {
    text-align: center;
  }

  .notifications-feed__footer > div {
    justify-content: center;
  }
}
</style>
