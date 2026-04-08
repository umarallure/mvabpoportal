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
const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications()

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

const handleDelete = async (notification: AppNotification) => {
  await deleteNotification(notification.id)
}

const handleMarkRead = async (notification: AppNotification) => {
  await markAsRead(notification.id)
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
      <div class="mx-auto w-full max-w-3xl space-y-4 py-5">

        <!-- ═══ Search + Filters ═══════════════════════════════════════ -->
        <div class="ap-fade-in ap-delay-1 space-y-3">
          <!-- Search bar -->
          <div class="flex items-center gap-2">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              placeholder="Search notifications..."
              size="sm"
              class="flex-1"
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

          <!-- Inline filter pills -->
          <div class="flex flex-wrap items-center gap-1.5">
            <button
              v-for="option in filterOptions"
              :key="option.value"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all"
              :class="activeFilter === option.value
                ? 'border-[var(--ap-accent)]/50 bg-[var(--ap-accent)]/10 text-[var(--ap-accent)]'
                : 'border-transparent text-muted hover:bg-white/[0.04]'"
              @click="activeFilter = option.value"
            >
              <UIcon :name="option.icon" class="size-3" />
              {{ option.label }}
              <span
                class="rounded-full px-1.5 py-px text-[10px] font-semibold"
                :class="activeFilter === option.value
                  ? 'bg-[var(--ap-accent)]/20 text-[var(--ap-accent)]'
                  : 'bg-white/[0.06] text-muted'"
              >{{ option.count }}</span>
            </button>
          </div>
        </div>

        <!-- ═══ Result summary ═════════════════════════════════════════ -->
        <div class="ap-fade-in ap-delay-2 flex items-center justify-between px-1">
          <p class="text-[11px] text-muted">{{ resultSummary }}</p>
        </div>

        <!-- ═══ Notifications List ═════════════════════════════════════ -->
        <div class="ap-fade-in ap-delay-2 relative overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm dark:bg-[#111111]/90">
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

          <!-- Empty state -->
          <div v-if="visibleNotifications.length === 0" class="relative flex flex-col items-center gap-3 py-16 text-center">
            <div class="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/[0.06]">
              <UIcon name="i-lucide-bell-off" class="size-5 text-[var(--ap-accent)]/50" />
            </div>
            <div>
              <p class="text-sm font-medium text-highlighted">No notifications found</p>
              <p class="mt-0.5 text-xs text-muted">Try another filter or refine your search.</p>
            </div>
          </div>

          <!-- Notification rows -->
          <div v-else class="relative">
            <template v-for="(notification, idx) in visibleNotifications" :key="notification.id">
              <!-- Fading separator -->
              <div
                v-if="idx > 0"
                class="mx-auto h-px w-[85%]"
                style="background: linear-gradient(90deg, transparent 0%, var(--ap-accent) 30%, var(--ap-accent) 70%, transparent 100%); opacity: 0.1;"
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
        </div>

      </div>
    </template>
  </UDashboardPanel>
</template>
