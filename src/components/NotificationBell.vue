<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useNotifications } from '../composables/useNotifications'
import type { AppNotification } from '../types'
import NotificationItem from './notifications/NotificationItem.vue'

const router = useRouter()
const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()

const isOpen = ref(false)
const recent = computed(() => notifications.value.filter(notification => !notification.is_read).slice(0, 8))

const handleClick = async (notification: AppNotification) => {
  isOpen.value = false

  if (!notification.is_read) await markAsRead(notification.id)
  if (notification.redirect_url) router.push(notification.redirect_url)
}

const handleShowAll = () => {
  isOpen.value = false
  router.push('/notifications')
}
</script>

<template>
  <UPopover v-model:open="isOpen" :content="{ side: 'bottom', align: 'end' }">
    <UButton
      variant="ghost"
      color="neutral"
      :icon="unreadCount > 0 ? 'i-lucide-bell-ring' : 'i-lucide-bell'"
      aria-label="Notifications"
      class="relative"
    >
      <span
        v-if="unreadCount > 0"
        class="absolute -top-1 -right-1 flex items-center justify-center min-w-4.5 h-4.5 rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none pointer-events-none"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </UButton>

    <template #content>
      <div class="notification-popover">
        <div class="notification-popover__header">
          <div>
            <div class="notification-popover__title">Notifications</div>
            <p class="notification-popover__subtitle">{{ unreadCount }} unread</p>
          </div>

          <button
            v-if="unreadCount > 0"
            type="button"
            class="notification-popover__action"
            @click="markAllAsRead"
          >
            Mark all read
          </button>
        </div>

        <div v-if="recent.length === 0" class="notification-popover__empty">
          <div class="notification-popover__empty-icon">
            <UIcon name="i-lucide-bell-off" class="h-4 w-4" />
          </div>
          <p class="notification-popover__empty-title">You're all caught up</p>
          <p class="notification-popover__empty-copy">
            Only unread notifications show in this menu. Open all notifications to review your full history.
          </p>
        </div>

        <div v-else class="notification-popover__list">
          <NotificationItem
            v-for="notification in recent"
            :key="notification.id"
            :notification="notification"
            compact
            @select="handleClick"
          />
        </div>

        <div class="notification-popover__footer">
          <button
            type="button"
            class="notification-popover__footer-button"
            @click="handleShowAll"
          >
            All notifications
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
.notification-popover {
  width: min(26rem, calc(100vw - 2rem));
  overflow: hidden;
  border: 1px solid var(--dashboard-surface-border);
  border-radius: 1rem;
  background: var(--dashboard-surface-strong);
  box-shadow: var(--dashboard-surface-shadow);
}

.notification-popover__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--dashboard-divider);
  padding: 1rem;
}

.notification-popover__title {
  color: var(--dashboard-text-primary);
  font-size: 0.95rem;
  font-weight: 700;
}

.notification-popover__subtitle {
  color: var(--dashboard-text-muted);
  font-size: 0.78rem;
  margin-top: 0.25rem;
}

.notification-popover__action,
.notification-popover__footer-button {
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

.notification-popover__action:hover,
.notification-popover__footer-button:hover {
  background: color-mix(in srgb, var(--dashboard-surface) 82%, white);
  border-color: var(--dashboard-surface-border-strong);
}

.notification-popover__list {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  max-height: 28rem;
  overflow-y: auto;
  padding: 0.9rem;
}

.notification-popover__empty {
  padding: 2rem 1.25rem;
  text-align: center;
}

.notification-popover__empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2rem;
  width: 2rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dashboard-accent-primary) 10%, transparent);
  color: var(--dashboard-accent-primary);
}

.notification-popover__empty-title {
  color: var(--dashboard-text-primary);
  font-size: 0.9rem;
  font-weight: 600;
  margin-top: 0.8rem;
}

.notification-popover__empty-copy {
  color: var(--dashboard-text-muted);
  font-size: 0.8rem;
  line-height: 1.6;
  margin-top: 0.35rem;
}

.notification-popover__footer {
  border-top: 1px solid var(--dashboard-divider);
  padding: 0.9rem 1rem;
}

.notification-popover__footer-button {
  width: 100%;
}
</style>
