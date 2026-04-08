<script setup lang="ts">
import { useRouter } from 'vue-router'
import { computed } from 'vue'
import { useDashboard } from '../composables/useDashboard'
import { useNotifications } from '../composables/useNotifications'
import type { AppNotification } from '../types'
import NotificationItem from './notifications/NotificationItem.vue'

const router = useRouter()
const { isNotificationsSlideoverOpen } = useDashboard()
const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
const recent = computed(() => notifications.value.filter(notification => !notification.is_read))

const handleClick = async (notification: AppNotification) => {
  isNotificationsSlideoverOpen.value = false

  if (!notification.is_read) await markAsRead(notification.id)
  if (notification.redirect_url) router.push(notification.redirect_url)
}

const handleShowAll = () => {
  isNotificationsSlideoverOpen.value = false
  router.push('/notifications')
}
</script>

<template>
  <USlideover
    v-model:open="isNotificationsSlideoverOpen"
    title="Notifications"
  >
    <template #body>
      <div class="notification-sheet">
        <div class="notification-sheet__header">
          <div>
            <div class="notification-sheet__title">Notifications</div>
            <p class="notification-sheet__subtitle">{{ unreadCount }} unread</p>
          </div>

          <button
            v-if="unreadCount > 0"
            type="button"
            class="notification-sheet__action"
            @click="markAllAsRead"
          >
            Mark all read
          </button>
        </div>

        <div v-if="recent.length === 0" class="notification-sheet__empty">
          <div class="notification-sheet__empty-icon">
            <UIcon name="i-lucide-bell-off" class="h-4 w-4" />
          </div>
          <p class="notification-sheet__empty-title">You're all caught up</p>
          <p class="notification-sheet__empty-copy">
            This quick view only shows unread notifications.
          </p>
        </div>

        <div v-else class="notification-sheet__list">
          <NotificationItem
            v-for="notification in recent"
            :key="notification.id"
            :notification="notification"
            compact
            @select="handleClick"
          />
        </div>

        <button
          type="button"
          class="notification-sheet__footer"
          @click="handleShowAll"
        >
          Open all notifications
        </button>
      </div>
    </template>
  </USlideover>
</template>

<style scoped>
.notification-sheet {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 100%;
}

.notification-sheet__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.notification-sheet__title {
  color: var(--dashboard-text-primary);
  font-size: 0.95rem;
  font-weight: 700;
}

.notification-sheet__subtitle {
  color: var(--dashboard-text-muted);
  font-size: 0.78rem;
  margin-top: 0.25rem;
}

.notification-sheet__action,
.notification-sheet__footer {
  border: 1px solid var(--dashboard-surface-border);
  border-radius: 999px;
  background: transparent;
  color: var(--dashboard-text-primary);
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.45rem 0.75rem;
  transition: background 0.18s ease, border-color 0.18s ease;
}

.notification-sheet__action:hover,
.notification-sheet__footer:hover {
  background: color-mix(in srgb, var(--dashboard-surface) 82%, white);
  border-color: var(--dashboard-surface-border-strong);
}

.notification-sheet__list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.75rem;
}

.notification-sheet__empty {
  padding: 1.75rem 1rem;
  text-align: center;
}

.notification-sheet__empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2rem;
  width: 2rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dashboard-accent-primary) 10%, transparent);
  color: var(--dashboard-accent-primary);
}

.notification-sheet__empty-title {
  color: var(--dashboard-text-primary);
  font-size: 0.9rem;
  font-weight: 600;
  margin-top: 0.8rem;
}

.notification-sheet__empty-copy {
  color: var(--dashboard-text-muted);
  font-size: 0.8rem;
  line-height: 1.6;
  margin-top: 0.35rem;
}

.notification-sheet__footer {
  width: 100%;
}

@media (max-width: 640px) {
  .notification-sheet__header {
    flex-direction: column;
  }
}
</style>
